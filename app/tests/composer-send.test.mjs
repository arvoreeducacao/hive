import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();

const { getStructured } = await app("chat-stretches");
const { IS_MAC } = await app("core");
const { composerMode, paintComposer, requestStop, requiresModifier, sendIntent, setSendShortcut } = await app("composer-modes");
const { svEvent } = await app("chat-and-panes");
const { svConvFlushAll } = await app("conversation-model");
const { refreshDriverState } = await app("structured-seats");
const { stopClock } = await app("composer-force-stop");
const { compactTokens } = await app("composer-compact");
const { dictationMoved, voiceClock, waveLook } = await app("composer-dictation");
const { chooseSendShortcut, followUpSaid } = await app("composer-prefs");

const MOD = IS_MAC ? { metaKey: true } : { ctrlKey: true };
const settle = () => new Promise((go) => setTimeout(go, 10));
const enter = (mods = {}) => ({ key: "Enter", ...mods });

let born = 0;

function seat(answer = () => ({ ok: true })) {
  const name = `send-${++born}`;
  st.data = { sessions: [{ name, where: "local", state: "idle" }], spawning: [] };
  const e = getStructured({ name, where: "local" });
  document.body.appendChild(e.host);
  const sent = [];
  e.ws = {
    readyState: 1,
    send(line) {
      const cmd = JSON.parse(line);
      sent.push(cmd);
      queueMicrotask(() => e.pending.get(cmd.cid)?.(answer(cmd)));
    }
  };
  return { e, sent, types: () => sent.map((cmd) => cmd.op ? `${cmd.type}:${cmd.op}` : cmd.type) };
}

const box = (e) => (svConvFlushAll(), e.host).querySelector(".sv-composer textarea");
const press = (e, mods = {}) => box(e).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...mods }));
const drawer = (e) => e.host.querySelector(".sv-drawer");
const send = (e) => e.host.querySelector(".sv-send");

test("enter sends, shift+enter and alt+enter make a new line, and mod+enter does the opposite while a turn runs", () => {
  assert.equal(sendIntent(enter(), { running: false }), "foreground");
  assert.equal(sendIntent(enter({ shiftKey: true }), { running: true }), null);
  assert.equal(sendIntent(enter({ altKey: true }), { running: true }), null);
  assert.equal(sendIntent(enter(MOD), { running: true }), "alternate");
  assert.equal(sendIntent(enter(MOD), { running: false }), "foreground");
  assert.equal(sendIntent(enter({ isComposing: true }), { running: false }), null);
  assert.equal(sendIntent({ key: "a" }, { running: false }), null);
});

test("with mod+enter always, enter is a new line, mod+enter sends and mod+shift+enter does the opposite", () => {
  const always = { shortcut: "mod-enter", running: true };
  assert.equal(sendIntent(enter(), always), null);
  assert.equal(sendIntent(enter(MOD), always), "foreground");
  assert.equal(sendIntent(enter({ ...MOD, shiftKey: true }), always), "alternate");
  assert.equal(sendIntent(enter({ ...MOD, shiftKey: true }), { ...always, running: false }), null);
});

test("mod+enter for multiline only asks for the modifier once the prompt has more than one line", () => {
  assert.equal(requiresModifier("one line", "mod-enter-multiline"), false);
  assert.equal(requiresModifier("two\nlines", "mod-enter-multiline"), true);
  assert.equal(sendIntent(enter(), { shortcut: "mod-enter-multiline", text: "one line" }), "foreground");
  assert.equal(sendIntent(enter(), { shortcut: "mod-enter-multiline", text: "two\nlines" }), null);
});

test("the composer obeys the send shortcut: enter alone does not send when the setting asks for the modifier", async () => {
  setSendShortcut("mod-enter");
  try {
    const { e, types } = seat();
    box(e).value = "still writing";
    press(e);
    await settle();
    assert.deepEqual(types(), []);
    press(e, MOD);
    await settle();
    assert.deepEqual(types(), ["say"]);
  } finally { setSendShortcut("enter"); }
});

test("the settings say what the opposite key is for the shortcut chosen", () => {
  chooseSendShortcut("mod-enter", true);
  try {
    assert.match(followUpSaid(), /Shift \+ Enter to do the opposite/);
    assert.equal(document.getElementById("f-send-shortcut").value, "mod-enter");
    assert.equal(document.getElementById("f-follow-up-say").textContent, followUpSaid());
  } finally { chooseSendShortcut("enter", true); }
  assert.match(followUpSaid(), /\+ Enter to do the opposite/);
});

test("a held queue turns the send button into resume, and enter in the empty box resumes", async () => {
  const { e, types } = seat();
  e.box.enqueue("then review it", [], [], "c1-held", "");
  svEvent(e, { type: "driver", subtype: "queue_held", count: 1 });
  assert.equal(composerMode(e), "resume");
  assert.equal(send(e).getAttribute("aria-label"), "Resume chat");
  assert.equal(send(e).disabled, false);
  press(e);
  await settle();
  assert.deepEqual(types(), ["resume"]);
  assert.equal(e.queueHeld, false);
});

test("typing turns resume back into send, and that message goes out normally", async () => {
  const { e, types } = seat((cmd) => (cmd.type === "say" ? { ok: true, queued: true, cid: cmd.cid } : { ok: true }));
  e.box.enqueue("in line", [], [], "c2-held", "");
  svEvent(e, { type: "driver", subtype: "queue_held", count: 1 });
  box(e).value = "something else";
  box(e).dispatchEvent(new Event("input"));
  assert.equal(composerMode(e), "idle");
  press(e);
  await settle();
  assert.deepEqual(types(), ["say"]);
});

test("a queue the driver kept across a restart comes back as rows, held", async () => {
  const { e } = seat((cmd) => (cmd.type === "state" ? { ok: true, working: false, held: true, queued: 1, queue: [{ text: "left over from last time", images: [], cid: "c9-kept" }], seq: 0 } : { ok: true }));
  await refreshDriverState(e);
  const rows = e.host.querySelectorAll(".sv-queue .sv-qitem");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.cid, "c9-kept");
  assert.equal(composerMode(e), "resume");
});

test("a stop that is not confirmed in time offers force stop, and force stop goes to the driver", async () => {
  const { e, types } = seat((cmd) => (cmd.type === "state" ? { ok: true, working: false, seq: 0 } : { ok: true }));
  e.turnOpen = true;
  e.stopPhase = "timedOut";
  e.stopAskedAt = Date.now() - 12_000;
  paintComposer(e);
  const banner = drawer(e).querySelector(".cp-stop-stuck");
  assert.ok(banner !== null);
  assert.match(banner.textContent, /Agent not responding to Stop/);
  assert.equal(drawer(e).querySelector(".cp-stop-clock").textContent, "12s");
  drawer(e).querySelector('[data-act="force-stop"]').click();
  await settle();
  assert.ok(types().includes("forceStop"));
});

test("while the stop is pending the drawer says stopping, with no force stop yet", () => {
  const { e } = seat();
  e.turnOpen = true;
  requestStop(e, () => {});
  assert.ok(drawer(e).querySelector(".cp-stop") !== null);
  assert.equal(drawer(e).querySelector('[data-act="force-stop"]'), null);
  clearTimeout(e.stopTimer);
});

test("the stop clock reads like the one people already know", () => {
  assert.equal(stopClock(300), "1s");
  assert.equal(stopClock(3400), "3.4s");
  assert.equal(stopClock(42_000), "42s");
  assert.equal(stopClock(65_000), "1m 5s");
  assert.equal(stopClock(3_723_000), "1h 2m 3s");
});

function staleClaude(answer) {
  const made = seat(answer);
  made.e.agent = "claude";
  made.e.context = { t: 212_000, m: 400_000, p: 53 };
  made.e.lastTurnAt = Date.now() - 2 * 60 * 60_000;
  made.e.cacheTtlMs = 60 * 60_000;
  return made;
}

test("a big claude chat idle past its cache offers compact and send", () => {
  const { e } = staleClaude();
  box(e).value = "back again";
  box(e).dispatchEvent(new Event("input"));
  const chip = e.host.querySelector(".cp-compact");
  assert.ok(chip !== null);
  assert.equal(chip.hidden, false);
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  assert.equal(chip.querySelector(".cp-compact-n").textContent, "212k");
  assert.equal(send(e).getAttribute("aria-label"), "Compact and send");
  chip.click();
  assert.equal(chip.getAttribute("aria-pressed"), "false");
  assert.equal(chip.querySelector(".cp-compact-word").textContent, "Keep");
});

test("compact and send compacts first, then sends the message", async () => {
  const { e, types } = staleClaude((cmd) => (cmd.type === "say" ? { ok: true, queued: true, cid: cmd.cid } : { ok: true, data: { queued: false } }));
  box(e).value = "back again";
  box(e).dispatchEvent(new Event("input"));
  press(e);
  await settle();
  await settle();
  assert.deepEqual(types(), ["control:compact", "say"]);
});

test("keep sends without compacting, once", async () => {
  const { e, types } = staleClaude((cmd) => (cmd.type === "say" ? { ok: true, cid: cmd.cid } : { ok: true }));
  e.keepFullHistory = true;
  box(e).value = "without compacting";
  box(e).dispatchEvent(new Event("input"));
  press(e);
  await settle();
  assert.deepEqual(types(), ["say"]);
  assert.equal(e.keepFullHistory, false);
});

test("a fresh cache, a small chat or another provider gets no offer", () => {
  const fresh = staleClaude().e;
  fresh.lastTurnAt = Date.now();
  paintComposer(fresh);
  assert.ok(fresh.host.querySelector(".cp-compact:not([hidden])") === null);
  const codex = staleClaude().e;
  codex.agent = "codex";
  paintComposer(codex);
  assert.ok(codex.host.querySelector(".cp-compact:not([hidden])") === null);
});

test("token counts read the short way", () => {
  assert.equal(compactTokens(950), "950");
  assert.equal(compactTokens(4200), "4.2k");
  assert.equal(compactTokens(5000), "5k");
  assert.equal(compactTokens(212_400), "212k");
  assert.equal(compactTokens(1_200_000), "1.2m");
});

test("/clear alone arms a fresh session without sending anything, and the x keeps the current one", async () => {
  const { e, types } = seat();
  box(e).value = "/clear";
  box(e).dispatchEvent(new Event("input"));
  press(e);
  await settle();
  assert.deepEqual(types(), []);
  assert.equal(box(e).value, "");
  const banner = drawer(e).querySelector(".cp-fresh");
  assert.ok(banner !== null);
  assert.match(banner.textContent, /Your next message starts a fresh session/);
  drawer(e).querySelector('[data-act="fresh-keep"]').click();
  assert.equal(e.freshArmed, 0);
  assert.equal(drawer(e).querySelector(".cp-fresh"), null);
});

test("the next message after /clear starts a clean session first, then goes out", async () => {
  const { e, types, sent } = seat((cmd) => {
    if (cmd.op === "startFresh") return { ok: true, data: { phase: "preparing", fresh: true } };
    if (cmd.op === "transferStatus") return { ok: true, data: { phase: "done", fresh: true } };
    if (cmd.type === "say") return { ok: true, cid: cmd.cid };
    return { ok: true };
  });
  e.freshArmed = Date.now();
  box(e).value = "start from scratch";
  box(e).dispatchEvent(new Event("input"));
  press(e);
  for (let at = 0; at < 10 && !types().includes("say"); at++) await settle();
  assert.deepEqual(types().filter((one) => one === "control:startFresh" || one === "say"), ["control:startFresh", "say"]);
  assert.equal(sent.find((cmd) => cmd.op === "startFresh").clean, true);
  assert.equal(e.freshArmed, 0);
});

test("a clean fresh session marks the chat with a new session divider", () => {
  const { e } = seat();
  svEvent(e, { type: "driver", subtype: "started_fresh", history: "", clean: true });
  const lines = [...(svConvFlushAll(), e.scroll).querySelectorAll(".sv-meta")].map((el) => el.textContent);
  assert.ok(lines.includes("New session"));
});

test("a signed out provider puts a banner over the composer that leads to its setup", () => {
  const was = st.providers;
  st.providers = [{ id: "claude", name: "Claude", installed: true, enabled: true, ready: false, accounts: [{ name: "default", loggedIn: false }] }];
  try {
    const { e } = seat();
    e.agent = "claude";
    paintComposer(e);
    const banner = drawer(e).querySelector(".cp-provider");
    assert.ok(banner !== null);
    assert.match(banner.textContent, /Claude is unauthenticated/);
    assert.ok(banner.querySelector('[data-act="provider-setup"]') !== null);
    banner.querySelector('[data-act="provider-dismiss"]').click();
    assert.equal(drawer(e).querySelector(".cp-provider"), null);
  } finally { st.providers = was; }
});

test("a provider with no models says so", () => {
  const was = st.providers;
  st.providers = [{ id: "codex", name: "Codex", installed: true, enabled: true, ready: true, accounts: [{ name: "default", loggedIn: true }] }];
  try {
    const { e } = seat();
    e.agent = "codex";
    e.catalog = [];
    paintComposer(e);
    assert.match(drawer(e).querySelector(".cp-provider").textContent, /No models are available for this provider\./);
  } finally { st.providers = was; }
});

test("sending while dictating waits for the words, then sends them", async () => {
  const { e, types } = seat((cmd) => (cmd.type === "say" ? { ok: true, cid: cmd.cid } : { ok: true }));
  const talk = e.host.querySelector(".sv-talk");
  st.stt = { ...st.stt, enabled: true, ready: true, state: "writing", owner: talk, since: Date.now() };
  dictationMoved(st.stt);
  assert.ok(e.host.querySelector(".cp-voice:not([hidden])") !== null);
  press(e);
  await settle();
  assert.deepEqual(types(), []);
  assert.deepEqual(e.sendAfterDictation, { alternate: false });
  box(e).value = "what I said";
  st.stt = { ...st.stt, state: "idle", said: "", owner: null };
  dictationMoved(st.stt);
  await settle();
  assert.deepEqual(types(), ["say"]);
});

test("a dictation that heard nothing sends nothing", async () => {
  const { e, types } = seat();
  const talk = e.host.querySelector(".sv-talk");
  st.stt = { ...st.stt, enabled: true, ready: true, state: "writing", owner: talk, since: Date.now() };
  dictationMoved(st.stt);
  box(e).value = "old draft";
  e.box.say();
  st.stt = { ...st.stt, state: "idle", said: "I heard nothing", owner: null };
  dictationMoved(st.stt);
  await settle();
  assert.deepEqual(types(), []);
  assert.equal(e.sendAfterDictation, null);
});

test("the dictation pill counts minutes and draws its bars from the mic level", () => {
  assert.equal(voiceClock(0), "0:00");
  assert.equal(voiceClock(65_000), "1:05");
  assert.deepEqual(waveLook(0), { opacity: 0.3, scale: 0.2 });
  assert.equal(waveLook(1).scale, 1);
  assert.ok(Math.abs(waveLook(1).opacity - 0.85) < 1e-9);
});

test("a submit event still reaches the send hooks", async () => {
  const { e, types } = seat();
  box(e).value = "/clear";
  e.host.querySelector(".sv-composer").dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  assert.deepEqual(types(), []);
  assert.ok(e.freshArmed > 0);
});

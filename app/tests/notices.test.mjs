import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const config = readFileSync(join(HERE, "lib", "config.mjs"), "utf8");
const teamRoutes = readFileSync(join(HERE, "routes", "team.mjs"), "utf8");
const SRC = join(HERE, "src", "app");
const source = (module) => readFileSync(join(SRC, `${module}.js`), "utf8");
const everySource = readdirSync(SRC).map((one) => readFileSync(join(SRC, one), "utf8")).join("\n");

const st = await state();
const it = await app("chimes-and-notices");
const { knockId, knocksViewModel } = await app("team");
const { palActions } = await app("palette");
const { run } = await app("themes");

const seen = (pairs) => new Map(Object.entries(pairs));

const knob = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });

window.AudioContext = class {
  constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
  resume() {}
  createGain() { return { gain: knob(), connect() {} }; }
  createOscillator() { return { type: "", frequency: knob(), connect() {}, start() {}, stop() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  decodeAudioData() { return Promise.resolve({}); }
};

const quietly = (fn) => {
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try { return fn(); } finally { globalThis.fetch = was; }
};

const hiveOf = (sessions, extra = {}) => {
  st.data = { pod: { up: true, name: "pod-1" }, sessions, archived: [], spawning: [], marks: {}, ...extra };
  st.blocks = [{ id: "b1", ws: st.space, keys: sessions.map((s) => s.name) }];
  st.block = 0;
  st.focus = 0;
  st.open = "";
  st.typing = "";
};

const chat = (over = {}) => ({ name: "bruno", title: "School avatar in header", where: "local", agent: "claude", raw: "idle", state: "idle", ...over });
const busy = (over = {}) => chat({ raw: "working", state: "working", ...over });
const finished = (over = {}) => chat({ raw: "idle", state: "answered", finish: { at: "2026-10-29T12:00:00Z", error: false }, ...over });
const asking = (over = {}) => chat({ raw: "needs", state: "needs", asks: [{ id: "q1", questions: [{ question: "OC ou SKU?" }] }], ...over });

function systemNotices() {
  const shown = [];
  const was = globalThis.Notification;
  globalThis.Notification = class {
    static permission = "granted";
    constructor(title, options) { this.title = title; this.options = options; this.closed = false; shown.push(this); }
    close() { this.closed = true; }
  };
  return { shown, restore: () => { globalThis.Notification = was; } };
}

function awayFromTheApp() {
  const was = document.hasFocus;
  document.hasFocus = () => false;
  return () => { document.hasFocus = was; };
}

const runOf = (steps) => {
  const { previousState } = leader;
  previousState.clear();
  let at = Date.now();
  for (const sessions of steps) {
    st.data = { ...st.data, sessions };
    it.announceChange(at);
    at += 2500;
  }
};

const leader = await app("leader-key");

test("away from the app, a finished chat becomes a system notice with the finished title and the chat's name", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  try {
    hiveOf([busy()]);
    st.answeredAlert = true;
    quietly(() => runOf([[busy()], [finished()], [finished()]]));
    assert.deepEqual(shown.map((one) => [one.title, one.options.body]), [["Thread completed", "School avatar in header"]]);
    assert.equal(shown[0].options.silent, true, "the hive plays its own sound");
    window.dispatchEvent(new window.Event("focus"));
    assert.equal(shown[0].closed, true, "coming back to the app clears what it left in the notification center");
  } finally { st.answeredAlert = false; back(); restore(); }
});

test("a finished chat that picks up again inside the grace says nothing", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  try {
    hiveOf([busy()]);
    st.answeredAlert = true;
    quietly(() => runOf([[busy()], [finished()], [busy()], [busy()]]));
    assert.deepEqual(shown, []);
  } finally { st.answeredAlert = false; back(); restore(); }
});

test("a question is said at once, even with the answered switch off", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  try {
    hiveOf([busy()]);
    st.answeredAlert = false;
    quietly(() => runOf([[busy()], [asking()]]));
    assert.deepEqual(shown.map((one) => one.title), ["Input needed"]);
  } finally { back(); restore(); }
});

test("clicking the notice brings the window back and opens that chat", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  const revealed = [];
  window.hiveDock = { badge() {}, reveal: () => revealed.push(true) };
  try {
    hiveOf([chat({ name: "other", title: "other" }), busy()]);
    st.focus = 0;
    quietly(() => runOf([[chat({ name: "other", title: "other" }), busy()], [chat({ name: "other", title: "other" }), asking()]]));
    assert.equal(shown.length, 1);
    quietly(() => shown[0].onclick());
    assert.equal(revealed.length, 1);
    assert.equal(shown[0].closed, true);
    assert.equal(st.blocks[st.block].keys[st.focus], "bruno", "the chat of the notice is the one in front");
  } finally { delete window.hiveDock; back(); restore(); }
});

test("a snoozed, settled or archived chat stays quiet", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  try {
    for (const extra of [{ marks: { bruno: { snoozeUntil: Date.now() + 3600000 } } }, { marks: { bruno: { settledAt: 1 } } }, { archived: [{ name: "bruno" }] }]) {
      hiveOf([busy()], extra);
      quietly(() => runOf([[busy()], [asking()]]));
    }
    assert.deepEqual(shown, []);
  } finally { back(); restore(); }
});

test("an app from before the dock bridge still notifies needs from main, so the page does not say it twice", () => {
  const { shown, restore } = systemNotices();
  const back = awayFromTheApp();
  window.hiveWindow = { act() {} };
  try {
    hiveOf([busy()]);
    quietly(() => runOf([[busy()], [asking()]]));
    assert.deepEqual(shown, []);
    hiveOf([busy()]);
    quietly(() => runOf([[busy()], [finished({ finish: { at: "2026-10-29T12:30:00Z", error: true } })]]));
    assert.deepEqual(shown.map((one) => one.title), ["Thread failed"], "main never said failures, so the page still does");
  } finally { delete window.hiveWindow; back(); restore(); }
});

test("the dock counts the chats that wait for you, leaves out muted ones and the one you read, and clears as they are read", () => {
  const counts = [];
  window.hiveDock = { badge: (n) => counts.push(n), reveal() {} };
  try {
    const ask = asking({ name: "a", title: "a" });
    const done = finished({ name: "b", title: "b" });
    const snoozed = asking({ name: "c", title: "c", asks: [{ id: "q9", questions: [{ question: "?" }] }] });
    hiveOf([ask, done, snoozed], { marks: { c: { snoozeUntil: Date.now() + 3600000 } } });
    st.focus = 2;
    assert.equal(it.waitingCount(), 2);
    it.paintBadge();
    assert.deepEqual(counts, [2]);
    it.paintBadge();
    assert.deepEqual(counts, [2], "the same count is not sent again");
    st.typing = "a";
    assert.equal(it.waitingCount(), 1, "the chat you are typing in is being read");
    st.typing = "";
    st.data = { ...st.data, sessions: [ask, { ...done, state: "idle" }, snoozed] };
    it.paintBadge();
    assert.deepEqual(counts, [2, 1]);
  } finally { delete window.hiveDock; }
});

test("a chat that finishes on screen while you read it is read, so it never waits in the dock", async () => {
  const { readMark, seatMark } = leader;
  const { structPool } = await app("structured-seats");
  const done = finished();
  hiveOf([done]);
  const host = document.createElement("div");
  document.body.append(host);
  host.getBoundingClientRect = () => ({ width: 400, height: 300, top: 10, left: 10, bottom: 310, right: 410 });
  structPool.set("bruno", { name: "bruno", host });
  readMark.set("bruno", "an older turn");
  try {
    quietly(() => it.announceChange());
    assert.equal(readMark.get("bruno"), seatMark(done));
  } finally {
    structPool.delete("bruno");
    host.remove();
  }
  readMark.set("bruno", "an older turn");
  quietly(() => it.announceChange());
  assert.equal(readMark.get("bruno"), "an older turn", "a chat that is not on screen stays where you put it");
});

test("a window holding one seat alone neither counts nor notifies — the main window does", () => {
  assert.match(source("chimes-and-notices"), /function announceChange\(now = Date\.now\(\)\) \{\n  if \(soloSeat\) return;/);
  assert.match(source("chimes-and-notices"), /function paintBadge\(now = Date\.now\(\)\) \{\n  if \(soloSeat \|\| !window\.hiveDock\?\.badge\) return;/);
});

test("there are eleven sounds to pick from, each with its own name", () => {
  assert.equal(it.SOUNDS.length, 11);
  assert.equal(new Set(it.SOUND_IDS).size, 11);
  for (const voice of it.SOUNDS) assert.ok(voice.say.startsWith(voice.id), `${voice.id} should say its own name first`);
});

test("a sound is either a line the browser plays or a file it fetches, never both and never neither", () => {
  for (const voice of it.SOUNDS) assert.ok(!voice.steps !== !voice.src, voice.id);
  const files = it.SOUNDS.filter((voice) => voice.src);
  assert.deepEqual(files.map((voice) => voice.id), ["nudge"]);
  for (const voice of files) assert.match(voice.src, /^\/assets\//, `${voice.id} comes from the hive, not from outside`);
});

test("the file it plays is one the hive serves", () => {
  for (const voice of it.SOUNDS.filter((v) => v.src)) assert.ok(server.includes(`"${voice.src}"`), `${voice.src} is not in STATIC`);
});

test("every synthesised sound is a playable line — waves, pitches and steps that move forward", () => {
  for (const voice of it.SOUNDS.filter((v) => v.steps)) {
    assert.ok(voice.steps.length >= 1 && voice.steps.length <= 4, `${voice.id} is a chime, not a song`);
    let at = -1;
    for (const step of voice.steps) {
      assert.ok(["sine", "square", "triangle", "sawtooth"].includes(step.wave), `${voice.id}: ${step.wave}`);
      assert.ok(step.from >= 100 && step.from <= 4000 && step.to >= 100 && step.to <= 4000, `${voice.id} stays audible`);
      assert.ok(step.dur > 0 && step.dur <= 0.6, `${voice.id} is short`);
      assert.ok(step.peak >= 0.4 && step.peak <= 1, `${voice.id} is in the same loudness band as the others`);
      assert.ok(step.at > at || step.at === 0, `${voice.id} plays its steps in order`);
      at = step.at;
    }
    assert.ok(voice.steps[voice.steps.length - 1].at + voice.steps[voice.steps.length - 1].dur <= 1, `${voice.id} is over inside a second`);
  }
});

test("the default of each notice is one of the ten, and no two notices share one", () => {
  for (const kind of it.NOTICE_KINDS) assert.ok(it.SOUND_IDS.includes(it.DEFAULT_SOUNDS[kind]), kind);
  assert.deepEqual(it.NOTICE_KINDS, ["needs", "answered", "asked"]);
  assert.equal(new Set(it.NOTICE_KINDS.map((k) => it.DEFAULT_SOUNDS[k])).size, it.NOTICE_KINDS.length);
});

test("the two defaults are the chimes that were already there — one rising, one falling", () => {
  const needs = it.soundOf(it.DEFAULT_SOUNDS.needs).steps[0];
  const answered = it.soundOf(it.DEFAULT_SOUNDS.answered).steps[0];
  assert.equal(needs.from, 660);
  assert.equal(needs.to, 988);
  assert.equal(answered.from, 988);
  assert.equal(answered.to, 587);
});

test("a name nobody knows falls back to the default and is named out loud", () => {
  const { picked, bad } = it.pickedSounds({ needs: "trombone" });
  assert.equal(picked.needs, it.DEFAULT_SOUNDS.needs);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /sounds\.needs/);
});

test("a name it knows is taken, and the other notice keeps its own", () => {
  const { picked, bad } = it.pickedSounds({ answered: "coin" });
  assert.deepEqual(bad, []);
  assert.equal(picked.answered, "coin");
  assert.equal(picked.needs, it.DEFAULT_SOUNDS.needs);
});

test("an empty config leaves both notices on their defaults", () => {
  assert.deepEqual(it.pickedSounds(undefined).picked, it.DEFAULT_SOUNDS);
});

test("the volume scales the sound and never leaves the safe end of the scale", () => {
  const step = { peak: 1 };
  assert.ok(it.levelOf(100, step) <= 0.5, "full blast still does not clip");
  assert.ok(it.levelOf(100, step) > it.levelOf(it.VOLUME_DEFAULT, step), "louder is louder");
  assert.ok(it.levelOf(it.VOLUME_DEFAULT, step) > 0.07, "and the default is above the old, too shy one");
  assert.ok(it.levelOf(0, step) > 0, "mute is handled before this, never by a gain of zero");
});

test("a burst of answers collapses instead of stacking notices", () => {
  assert.ok(it.NOTICES_AT_ONCE >= 1 && it.NOTICES_AT_ONCE <= 5);
});

test("the two toggles are separate lines in the config file, both off until asked", () => {
  assert.match(server, /answered: cleanFlag\(raw\.answered, "answered", tilde\(CONFIG_FILE\), problems, false\)/);
  assert.match(config, /if \(patch\.answered !== undefined\)/);
  assert.match(server, /answered: raw\.answered !== undefined/);
});

test("the sound of each notice and the volume are lines of the same file", () => {
  assert.match(server, /sounds: cleanSounds\(raw\.sounds/);
  assert.match(server, /volume: cleanVolume\(raw\.volume/);
  assert.match(config, /if \(patch\.sounds !== undefined\)/);
  assert.match(config, /if \(patch\.volume !== undefined\)/);
});

test("the two notices you choose carry a picker, a preview and a switch", () => {
  for (const kind of ["needs", "answered"]) {
    assert.match(page, new RegExp(`<select id="s-${kind}">`));
    assert.match(page, new RegExp(`id="p-${kind}"`));
    assert.match(page, new RegExp(`id="t-${kind}"`));
  }
  assert.match(page, /<input id="s-volume" type="range" min="0" max="100"/);
  quietly(() => it.setSounds(it.DEFAULT_SOUNDS, true));
  for (const kind of ["needs", "answered"]) {
    const pick = document.getElementById(`s-${kind}`);
    assert.equal(pick.options.length, it.SOUNDS.length, "every sound is on offer");
    assert.equal(pick.value, it.DEFAULT_SOUNDS[kind]);
  }
});

test("the knock has no switch and no picker — the row says the sound and lets you hear it", () => {
  assert.ok(!page.includes('id="t-asked"'), "there is no switch to turn it off");
  assert.ok(!page.includes('<select id="s-asked">'), "and no other sound to give it");
  assert.match(page, /id="p-asked"/);
  assert.match(page, /id="s-asked-say"/);
  quietly(() => it.paintNotices());
  assert.equal(document.getElementById("s-asked-say").textContent, it.soundOf(it.DEFAULT_SOUNDS.asked).say);
  assert.equal(it.DEFAULT_SOUNDS.asked, "nudge");
});

test("the notices are switched where they are explained — the settings panel, not the ⋯ menu", () => {
  const menu = page.slice(page.indexOf('<div class="menu" id="more">'), page.indexOf('<div class="relpop"'));
  for (const gone of ["btn-sound", "btn-answered", "btn-asked"]) assert.ok(!menu.includes(gone), `${gone} is still in the ⋯ menu`);
  assert.ok(!page.includes("btn-sound"), "and nothing else paints a switch that is not there");
  quietly(() => {
    st.sound = false;
    run("sound");
    assert.equal(st.sound, true, "the shortcut flips the chime");
    run("sound");
    assert.equal(st.sound, false);
    st.answeredAlert = false;
    run("answered");
    assert.equal(st.answeredAlert, true);
    run("answered");
    assert.equal(st.answeredAlert, false);
  });
});

test("the two that switch still answer their shortcut and their line in the palette", () => {
  quietly(() => {
    st.sound = false;
    st.answeredAlert = false;
    const rows = palActions();
    const chime = rows.find((one) => one.name === "chime when it needs you");
    const answered = rows.find((one) => one.name === "notify when it answers");
    chime.go();
    assert.equal(st.sound, true);
    answered.go();
    assert.equal(st.answeredAlert, true);
    st.sound = false;
    st.answeredAlert = false;
    assert.ok(!palActions().some((one) => /knock|asked/i.test(one.name)), "and nothing in the palette turns the knock off");
  });
});

test("a knock is the same knock while it waits, so it is only announced once", () => {
  const knock = { from: "juno", seat: "hive-3", at: 1787253264687 };
  assert.equal(knockId(knock), knockId({ ...knock }));
  assert.notEqual(knockId(knock), knockId({ ...knock, at: knock.at + 1 }));
  assert.notEqual(knockId(knock), knockId({ ...knock, from: "rafa" }));
});

test("the rail has a foot of its own, so the list can scroll and the knocks cannot scroll away", () => {
  assert.match(page, /<div id="rail-list" data-no-t>(?:<button[^>]*><\/button>)?<div id="rail-next"><\/div><div id="rail-sessions"><\/div><div id="rail-team"><\/div><div id="rail-next-foot"><\/div><\/div><div id="knock-dock" hidden/);
  assert.match(page, /#rail \{[^}]*grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(page, /#rail-list \{[^}]*overflow-y: auto/);
});

test("every knock in the dock offers both answers", () => {
  st.data = { sessions: [{ name: "hive-3", title: "the seat" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.knocksOpen = [{ from: "juno", seat: "hive-3", at: Date.now() - 60000 }];
  const model = knocksViewModel();
  assert.equal(model.knocks.length, 1);
  assert.equal(model.knocks[0].yes, "lend it");
  assert.equal(model.knocks[0].no, "not now");
  assert.match(model.knocks[0].line, /^the seat · /);
  assert.match(source("team"), /actions: \{ answer: \(from, seat, ok\) => answerKnock\(\{ from, seat \}, ok\) \}/);
});

test("a knock nobody answered goes stale instead of sitting there for a day", () => {
  assert.match(server, /const KNOCK_LIFE = \d+/);
  assert.match(server, /knocksWaiting = \(now = Date\.now\(\)\) => knocking\.filter/);
  assert.match(teamRoutes, /state\.knocking = knocksWaiting\(\);/);
  const life = Number(server.match(/const KNOCK_LIFE = (\d+)/)[1]);
  assert.ok(life >= 600000 && life <= 3600000, "long enough to walk away from the screen, short enough to mean something");
});

test("the third notice is not a line of the config at all — there is nothing to write", () => {
  assert.ok(!server.includes('cleanFlag(raw.asked'), "no flag is read from the file");
  assert.ok(!server.includes("patch.asked"), "and none is written back");
  assert.ok(!everySource.includes("askedAlert"), "nothing in the app asks whether it is on");
  assert.ok(!everySource.includes("setAsked"), "and nothing turns it off");
});

test("a sound named for the ask in an old config file is ignored, not adopted", () => {
  const { picked, bad } = it.pickedSounds({ asked: "blip", needs: "coin" });
  assert.equal(picked.asked, "nudge");
  assert.equal(picked.needs, "coin");
  assert.deepEqual(bad, []);
});

test("a sampled sound goes out the same pipe as the chimes, so a knock with nobody touching the app is still heard", () => {
  const chimes = source("chimes-and-notices");
  const pipe = chimes.slice(chimes.indexOf("const samples = new Map();"), chimes.indexOf("function playSound(id)"));
  assert.match(pipe, /ensureAudio\(\)\.decodeAudioData/);
  assert.match(pipe, /createBufferSource\(\)/);
  assert.ok(!pipe.includes("new Audio("), "an <audio> tag would need a click of its own");
  assert.match(chimes, /function playSound\(id\) \{\n  if \(!st\.volume\) return;\n  const voice = soundOf\(id\);\n  if \(voice\.src\) return playSample\(voice\);/);
});

test("the door to the team is a switch of its own in the settings, on by default, written to the config file", () => {
  assert.match(page, /<button class="ghost flip" id="t-knocks" type="button">/);
  assert.match(page, /id="s-knocks-say"/);
  assert.ok(!page.includes('id="t-asked"'), "the knock's sound still has no switch — the door is what closes");
  assert.match(server, /knocks: cleanFlag\(raw\.knocks, "knocks", tilde\(CONFIG_FILE\), problems\)/);
  assert.match(server, /knocks: raw\.knocks !== undefined/);
  assert.match(config, /if \(patch\.knocks !== undefined\)/);
  assert.match(source("brand-face"), /if \(r\.config\.knocks !== st\.teamKnocks\) setKnocks\(r\.config\.knocks, true\)/);
  assert.match(source("boot"), /\$\("t-knocks"\)\.addEventListener\("click", \(\) => setKnocks\(!st\.teamKnocks\)\)/);
  const saved = [];
  const was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { saved.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
  try {
    it.setKnocks(true, true);
    assert.equal(st.teamKnocks, true);
    assert.equal(document.getElementById("t-knocks").textContent, "on");
    it.setKnocks(false);
    assert.equal(st.teamKnocks, false);
    assert.equal(document.getElementById("t-knocks").textContent, "off");
    assert.equal(document.getElementById("s-knocks-say").textContent, "nothing from the team reaches you");
    assert.deepEqual(saved, [{ url: "/api/config", body: { config: { knocks: false } } }]);
    it.setKnocks(true, true);
    assert.equal(document.getElementById("s-knocks-say").textContent, "keyboard asks, pokes and questions reach you");
  } finally { globalThis.fetch = was; }
});

test("the door is closed on the server, whatever the asker's hive believed", () => {
  const took = server.slice(server.indexOf("async function takeNote("), server.indexOf("const NOTE_KINDS ="));
  assert.match(took, /if \(kind === "poke"\) \{\n\s+if \(!config\.knocks\) return;/, "a poke on a closed door is not felt");
  assert.match(took, /if \(asked && !config\.knocks\) return sendAskBack\(asked\);/, "a question on a closed door goes back with an answer");
  assert.match(took, /if \(knock\.kind === "yes"\) \{ teamMoved = true; return; \}\n\s+if \(!config\.knocks\) return;/, "a knock on a closed door is dropped, but a keyboard coming back is still taken");
  assert.match(server, /row\.knocks === false\) return refuse\(/, "the asking chat is told before its question leaves");
  assert.match(teamRoutes, /peerTakesKnocks = \(\) => true/);
});

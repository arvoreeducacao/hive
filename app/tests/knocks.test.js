import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const teamSource = readFileSync(join(HERE, "src", "app", "team.js"), "utf8");

const st = await state();
await views();
const { beatOn } = await app("core");
const { earcon } = await app("chimes-and-notices");
const { KNOCK_HOLD, NUDGE_AGAIN, knockHolds, knocked, knockedAt, nudge, nudgeAhead, paintNudge, pokesSeen, pullKnocks, pulseNudge, sameKnock, shakeWindow, takePokes } = await app("team");
await app("new-chat");
await app("hold-numbers");

document.getElementById("rail-team").remove();

const heard = [];
st.audio = {
  state: "running", currentTime: 0, destination: {},
  createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  createOscillator: () => ({
    connect() {}, start() {}, stop() {},
    frequency: { setValueAtTime: (hz) => heard.push(hz), exponentialRampToValueAtTime: (hz) => heard.push(hz) }
  }),
  createBufferSource: () => ({ connect() {}, start() {} })
};

const sound = (run) => { heard.length = 0; run(); return heard.join(","); };
const ASKED = sound(() => { st.volume = 60; earcon("asked"); });

const noticed = [];
globalThis.Notification = class {
  static permission = "granted";
  constructor(title, how) { noticed.push([title, how?.body]); }
};

const away = (on) => Object.defineProperty(document, "hidden", { value: on, configurable: true });

const quiet = () => {
  st.calmOn = false;
  st.volume = 60;
  st.nudgeQueue = [];
  st.nudgeNow = null;
  st.nudgeHeld = false;
  st.knocksOpen = [];
  st.lentHere = [];
  st.team = { me: "me", devs: [], sharing: false, players: [], version: 0 };
  st.data = { sessions: [{ name: "hive-3", title: "the seat" }], spawning: [], archived: [], pod: {} };
  st.typing = null;
  away(false);
  document.body.classList.remove("nudged");
  noticed.length = 0;
  paintNudge();
};

const KNOCK = { from: "jott4", seat: "hive-3", at: Date.now() };

test("a seat nobody knocked on offers the knock", () => {
  knocked.clear();
  assert.equal(knockedAt("rafa", "seat"), 0);
  assert.equal(knockHolds("rafa", "seat"), false);
});

test("a fresh knock holds the button still", () => {
  knocked.clear();
  knocked.set("rafa/seat", Date.now());
  assert.equal(knockHolds("rafa", "seat"), true);
});

test("a knock nobody answered lets you ask again", () => {
  knocked.clear();
  knocked.set("rafa/seat", Date.now() - KNOCK_HOLD - 1);
  assert.equal(knockHolds("rafa", "seat"), false);
  assert.ok(knockedAt("rafa", "seat") > 0, "and it still remembers you asked once");
});

test("the wait is short enough to ask again in the same minute", () => {
  assert.ok(KNOCK_HOLD <= 60000);
});

test("the nudge only ever shows what is still waiting", () => {
  const mine = { from: "jott4", seat: "hive-3", at: 1 };
  const gone = { from: "rafa", seat: "hive-7", at: 2 };
  assert.deepEqual(nudgeAhead([gone, mine], [mine]), [mine]);
});

test("a knock answered anywhere else leaves the nudge with nothing to ask", () => {
  assert.deepEqual(nudgeAhead([{ from: "jott4", seat: "hive-3" }], []), []);
});

test("the same person asking for the same seat is the same ask, whenever it arrived", () => {
  assert.equal(sameKnock({ from: "jott4", seat: "hive-3", at: 1 }, { from: "jott4", seat: "hive-3", at: 9 }), true);
  assert.equal(sameKnock({ from: "jott4", seat: "hive-3" }, { from: "jott4", seat: "hive-9" }), false);
  assert.equal(sameKnock(null, { from: "jott4", seat: "hive-3" }), false);
});

test("a knock arriving shakes the window, plays the sound and puts the ask on the screen", () => {
  quiet();
  st.typing = "hive-3";
  st.knocksOpen = [KNOCK];
  const said = sound(() => nudge([KNOCK]));
  assert.equal(document.body.classList.contains("nudged"), true);
  assert.equal(said, ASKED, "and the sound is the one an ask makes");
  assert.equal(document.getElementById("nudge").hidden, false);
  assert.equal(document.getElementById("nudge-scrim").hidden, false);
  assert.equal(st.typing, null, "the keyboard is let go so the answer can be typed");
});

test("a knock read off the server is the one that lands on the screen", async () => {
  quiet();
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ lent: [], knocks: [{ from: "rafa", seat: "hive-3", at: Date.now() }], pokes: [] }) });
  await pullKnocks();
  assert.equal(document.getElementById("nudge").hidden, false);
  assert.equal(st.nudgeNow.from, "rafa");
  globalThis.fetch = saved;
});

test("it asks again every few seconds until it is answered, and never faster than five", () => {
  quiet();
  st.knocksOpen = [KNOCK];
  nudge([KNOCK]);
  assert.equal(beatOn("nudge"), true, "it keeps asking on its own");
  assert.ok(NUDGE_AGAIN >= 5000 && NUDGE_AGAIN <= 15000, "insistent, not a jackhammer");
});

test("answering stops it — nothing shakes for an ask that is no longer on the screen", () => {
  quiet();
  st.knocksOpen = [KNOCK];
  nudge([KNOCK]);
  assert.equal(beatOn("nudge"), true);
  st.knocksOpen = [];
  paintNudge();
  assert.equal(document.getElementById("nudge").hidden, true);
  assert.equal(beatOn("nudge"), false);
  document.body.classList.remove("nudged");
  pulseNudge();
  assert.equal(document.body.classList.contains("nudged"), false);
});

test("nothing stands between the ask and the shake — there is no switch left to turn it off", () => {
  const ask = teamSource.slice(teamSource.indexOf("async function pullKnocks()"), teamSource.indexOf("let knocksKey"));
  assert.match(ask, /if \(fresh\.length\) \{/);
  assert.ok(!ask.includes("askedAlert"), "no flag is consulted");
  assert.ok(!ask.includes("toast("), "the toast it used to be is gone");
});

test("a nudge that arrives with the window away holds until it is looked at", () => {
  quiet();
  st.knocksOpen = [KNOCK];
  away(true);
  nudge([KNOCK]);
  assert.equal(st.nudgeHeld, true, "nothing shakes at a window nobody is looking at");
  assert.equal(document.body.classList.contains("nudged"), false);

  away(false);
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(st.nudgeHeld, false);
  assert.equal(document.body.classList.contains("nudged"), true, "and it shakes the moment the window comes back");
});

test("a knock that lands with the window away leaves a notice with the seat in it", async () => {
  quiet();
  away(true);
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ lent: [], knocks: [{ from: "rafa", seat: "hive-3", at: Date.now() }], pokes: [] }) });
  await pullKnocks();
  assert.equal(noticed.length, 1);
  assert.match(noticed[0][0], /rafa wants the keyboard/);
  assert.match(noticed[0][1], /the seat/);
  globalThis.fetch = saved;
  away(false);
});

test("the two answers are the only way out — the card cannot be dismissed into silence", async () => {
  quiet();
  st.knocksOpen = [KNOCK];
  nudge([KNOCK]);
  const asked = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, how) => { asked.push(JSON.parse(how.body)); return { ok: true, json: async () => ({}) }; };

  document.getElementById("nudge-scrim").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("nudge").hidden, false, "a click on the scrim must not answer for you");

  document.getElementById("nudge-no").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(asked[0].ok, false);
  assert.equal(document.getElementById("nudge").hidden, true);

  quiet();
  st.knocksOpen = [KNOCK];
  nudge([KNOCK]);
  document.getElementById("nudge-yes").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(asked[1].ok, true);
  assert.equal(asked[1].seat, "hive-3");
  globalThis.fetch = saved;
});

test("esc is the refusal, not a way to put it off", () => {
  quiet();
  st.knocksOpen = [KNOCK];
  nudge([KNOCK]);
  const asked = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, how) => { asked.push(JSON.parse(how.body)); return { ok: true, json: async () => ({}) }; };
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(asked[0]?.ok, false);
  assert.equal(document.getElementById("nudge").hidden, true);
  globalThis.fetch = saved;
  const card = page.slice(page.indexOf('<div id="nudge"'), page.indexOf('<div class="menu" id="seatmenu"'));
  assert.match(card, /id="nudge-no">not now <kbd>esc<\/kbd>/, "and the card says so");
});

test("the shake is skipped for whoever asked for less motion", () => {
  quiet();
  st.calmOn = true;
  document.body.classList.remove("nudged");
  shakeWindow();
  assert.equal(document.body.classList.contains("nudged"), false);
  st.calmOn = false;
  shakeWindow();
  assert.equal(document.body.classList.contains("nudged"), true);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{ body\.nudged, #nudge, #nudge-scrim \{ animation: none; \} \}/);
});

test("a poke shakes the window once, with the sound of the ask and not a word", () => {
  quiet();
  pokesSeen.clear();
  const said = sound(() => takePokes([{ id: "art:1", from: "art", at: 1 }]));
  assert.equal(document.body.classList.contains("nudged"), true);
  assert.equal(said, ASKED);
  assert.deepEqual(noticed, [], "the shake and the sound are the whole message");
  assert.equal(document.getElementById("nudge").hidden, true, "and there is nothing to answer");
});

test("the same poke never shakes twice", () => {
  quiet();
  pokesSeen.clear();
  const poke = [{ id: "art:1", from: "art", at: 1 }];
  takePokes(poke);
  document.body.classList.remove("nudged");
  const said = sound(() => takePokes(poke));
  assert.equal(document.body.classList.contains("nudged"), false);
  assert.equal(said, "");
});

test("two pokes landing together are one shake, not two", () => {
  quiet();
  pokesSeen.clear();
  const said = sound(() => takePokes([{ id: "art:1", from: "art", at: 1 }, { id: "joao:2", from: "joao", at: 2 }]));
  assert.equal(said, ASKED, "one sound, not two on top of each other");
  assert.equal(document.body.classList.contains("nudged"), true);
});

test("a poke reaches whoever silenced the keyboard request — it has nowhere else to wait", () => {
  quiet();
  pokesSeen.clear();
  st.answeredAlert = false;
  const said = sound(() => takePokes([{ id: "art:9", from: "art", at: 1 }]));
  assert.equal(document.body.classList.contains("nudged"), true);
  assert.equal(said, ASKED);
});

test("a poke that lands on another desktop leaves a notice", () => {
  quiet();
  pokesSeen.clear();
  away(true);
  takePokes([{ id: "art:1", from: "art", at: 1 }]);
  assert.deepEqual(noticed.map((one) => one[0]), ["art poked you"]);
  away(false);
});

test("a closed door leaves no button to press: the card says so and offers nothing", async () => {
  const { mirrorKbModel } = await app("team");
  st.team.me = "rick";
  const seat = { name: "hive-1", title: "Hive 1", state: "working" };
  const open = mirrorKbModel(seat, { dev: "joao", knocks: true });
  assert.equal(open.act.kind, "knock");
  assert.equal(open.act.label, "ask for the keyboard");
  const closed = mirrorKbModel(seat, { dev: "joao", knocks: false });
  assert.equal(closed.act, null);
  assert.equal(closed.say, "is not taking keyboard asks right now");
  const lent = mirrorKbModel({ ...seat, keyboard: { with: "rick", until: 9e12, turns: [] } }, { dev: "joao", knocks: false });
  assert.equal(lent.act.kind, "give", "a keyboard already in hand is still handed back");
});

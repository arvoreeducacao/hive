import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { avatarKey } = await app("core");
const { adoptAvatar } = await app("shared");
const { faceIsSettled, gateViewModel, offerFace, onGateClick, pickFace } = await app("brand-face");
const { wAvatar } = await app("welcome");

const box = document.getElementById("face-gate");

function fresh() {
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [] };
  st.blocks = [];
  st.block = 0;
  st.team = { me: "coutinhomm", devs: [] };
  st.configPath = "~/.hive/config.jsonc";
  st.configRead = false;
  st.configHas = {};
  st.faceAsked = false;
  st.gateSaid = "";
  st.myFace = null;
  box.hidden = true;
  box.innerHTML = "";
}

function gate() {
  fresh();
  return {
    up: () => !box.hidden,
    said: () => gateViewModel(),
    feed: (config, has) => adoptAvatar({ config, has })
  };
}

function wrote(run, landing = true) {
  const was = globalThis.fetch;
  const log = [];
  globalThis.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url) === "/api/config" && body?.config?.avatar) log.push(body.config.avatar);
    return Promise.resolve({ ok: true, json: async () => (landing ? { config: body?.config || {} } : { config: {} }) });
  };
  return Promise.resolve(run()).then(() => log).finally(() => { globalThis.fetch = was; });
}

function wroteAll(run, landing = true) {
  const was = globalThis.fetch;
  const log = [];
  globalThis.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url) === "/api/config" && body?.config) log.push(body.config);
    return Promise.resolve({ ok: true, json: async () => (landing ? { config: body?.config || {} } : { config: {} }) });
  };
  return Promise.resolve(run()).then(() => log).finally(() => { globalThis.fetch = was; });
}

const keep = () => ({ target: { closest: () => ({ dataset: { fg: "keep" } }) } });

test("a face already written down is never asked about again", () => {
  const g = gate();
  g.feed({ avatar: "cloud/suspicious/purple" }, { avatar: true });
  offerFace();
  assert.equal(g.up(), false, "somebody who chose months ago was asked again");
  assert.equal(faceIsSettled(), true);
});

test("somebody who never chose is asked", () => {
  const g = gate();
  g.feed({ avatar: "squircle/curious/blue" }, { avatar: false });
  assert.equal(g.up(), true);
  assert.match(g.said().head, /Pick the face/);
  assert.ok(g.said().rows.length, "the gate asked without offering anything to pick");
});

test("the ask waits for the config instead of guessing while it is in flight", () => {
  const g = gate();
  offerFace();
  assert.equal(g.up(), false, "the gate opened on a config it had not read yet");
  g.feed({ avatar: "cloud/suspicious/purple" }, { avatar: true });
  offerFace();
  assert.equal(g.up(), false, "and once the config was in, it still asked");
});

test("a config the app could not read is a config it does not ask against", () => {
  const g = gate();
  offerFace();
  offerFace();
  offerFace();
  assert.equal(g.up(), false, "the app asked on every pass while the config stayed unread");
});

test("the answer counts once it is in the file", async () => {
  const g = gate();
  g.feed({}, { avatar: false });
  assert.equal(g.up(), true);
  const showing = avatarKey(wAvatar());
  const log = await wrote(() => onGateClick(keep()));
  assert.deepEqual(log, [showing], "the face written down is not the face the gate was showing");
  assert.equal(g.up(), false, "the gate stayed up after the face was written down");
  assert.equal(faceIsSettled(), true, "the next launch will ask again");
});

test("a write that never landed keeps the gate and says so", async () => {
  const g = gate();
  g.feed({}, { avatar: false });
  await wrote(() => onGateClick(keep()), false);
  assert.equal(g.up(), true, "the gate closed on a write that never landed");
  assert.equal(faceIsSettled(), false);
  assert.match(g.said().bad, /could not be written down/);
  assert.match(g.said().bad, /~\/\.hive\/config\.jsonc/, "it does not say which file refused it");
});

test("a write that lands after one that did not clears what the gate said", async () => {
  const g = gate();
  g.feed({}, { avatar: false });
  await wrote(() => onGateClick(keep()), false);
  assert.match(g.said().bad, /could not be written down/);
  await wrote(() => onGateClick(keep()));
  assert.equal(st.gateSaid, "", "the gate closed still carrying the complaint of the last try");
  assert.equal(g.up(), false);
});

test("asking again is refused once the face is settled, even by hand", () => {
  const g = gate();
  g.feed({}, { avatar: false });
  assert.equal(g.up(), true);
  box.hidden = true;
  offerFace();
  assert.equal(g.up(), false, "one launch asked twice");
});

test("picking a part keeps the rest of the face — the gate asks once, not three times", () => {
  const g = gate();
  g.feed({}, { avatar: false });
  const before = wAvatar();
  pickFace("face", "wink");
  const after = wAvatar();
  assert.equal(after.face, "wink");
  assert.equal(after.shape, before.shape, "picking an expression moved the shape too");
  assert.equal(after.colour, before.colour, "picking an expression moved the colour too");
  assert.equal(g.up(), true, "the gate went away before anybody said This one is me");
});

test("dressing up in the gate keeps the face — the gate asks once, and writes once", async () => {
  const g = gate();
  g.feed({}, { avatar: false });
  const before = avatarKey(wAvatar());
  const early = await wrote(() => pickFace("hat", "cap"));
  assert.deepEqual(st.myWear, { hat: "cap" });
  assert.equal(avatarKey(wAvatar()), before, "a hat moved the face");
  assert.equal(g.up(), true, "the gate went away before anybody said This one is me");
  assert.deepEqual(early, [], "nothing is written while the gate is still asking");
  const log = await wroteAll(() => onGateClick(keep()));
  assert.deepEqual(log, [{ avatar: before, wear: "hat:cap" }], "the one write carries the face and the hat");
  st.myWear = {};
});

/* the settings used to change the face on screen and write nothing, which is how a person who
   chose in the settings got the old face back on every launch. */
test("a piece picked once the face is settled is written down at once, and that is what stays", async () => {
  const g = gate();
  g.feed({ avatar: "cloud/suspicious/purple", wear: "glasses:round" }, { avatar: true, wear: true });
  assert.deepEqual(st.myWear, { glasses: "round" }, "the clothes come back with the face");
  const log = await wroteAll(() => pickFace("hat", "wizard"));
  assert.deepEqual(log, [{ avatar: "tall/dark/purple", wear: "glasses:round hat:wizard" }], "and an old face is written back in the robot's words");
  const off = await wroteAll(() => pickFace("glasses", "none"));
  assert.deepEqual(off, [{ avatar: "tall/dark/purple", wear: "hat:wizard" }], "none takes the piece off and writes that too");
  st.myWear = {};
});

test("a part nobody named leaves the face alone", () => {
  const g = gate();
  g.feed({}, { avatar: false });
  const before = avatarKey(wAvatar());
  pickFace("", "wink");
  pickFace("face", "");
  assert.equal(avatarKey(wAvatar()), before);
});

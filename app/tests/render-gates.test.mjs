import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const st = await state();
const { $, perf, unfolded } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const nav = await app("focus-navigation");
const { POLL_STILL, pollKey, pull } = nav;
const { layoutKey } = await app("arrange");
const { saveBlocks } = await app("blocks");
const { paintName } = await app("chat-name");
const { paintAim } = await app("seat-layout");
const { prsOfChat, tileThreadsModel } = await app("seat-menu");
const { planeWireEls, wireOn } = await app("plane");
const { pullKnocks } = await app("team");
const { tiles } = await app("leader-key");

const SRC = join(fileURLToPath(new URL("../src/app", import.meta.url)));
const read = (file) => readFileSync(join(SRC, file), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const served = { hive: null, knocks: null, team: null };
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  if (path.startsWith("/api/hive")) return Promise.resolve(answered(structuredClone(served.hive || { sessions: [] })));
  if (path.startsWith("/api/knocks")) return Promise.resolve(answered(served.knocks || {}));
  if (path.startsWith("/api/team")) return Promise.resolve(answered(structuredClone(served.team || {})));
  return Promise.resolve(answered({}));
};

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const realNow = Date.now;
let wall = 1000;
Date.now = () => wall;
after(() => { globalThis.fetch = realFetch; Date.now = realNow; });

bootSolid();

const skipped = () => Object.values(perf.stats()).reduce((sum, one) => sum + (one.skipped.poll || 0), 0);

const seat = (name, over = {}) => ({ name, title: name, where: "local", state: "idle", kind: "chat", ...over });

function hive({ seats = ["a"], keys = null } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: seats.map((name) => seat(name)), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: keys || [...seats] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.renaming = "";
  st.composing = false;
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  render();
}

/* ── the poll only paints what changed ── */

test("the same answer at the same moment is the same key", () => {
  const raw = { sessions: [{ name: "a", state: "idle" }], pod: { up: true } };
  assert.equal(pollKey(raw, 1000), pollKey({ ...raw }, 1000));
});

test("the server's own clock on the answer does not count as a change", () => {
  const raw = { sessions: [{ name: "a", state: "idle" }], at: "2026-09-01T18:57:29.028Z" };
  assert.equal(pollKey(raw, 1000), pollKey({ ...raw, at: "2026-09-01T18:57:32.054Z" }, 1000));
});

test("a changed answer changes the key", () => {
  const raw = { sessions: [{ name: "a", state: "idle" }] };
  assert.notEqual(pollKey(raw, 1000), pollKey({ sessions: [{ name: "a", state: "needs" }] }, 1000));
});

test("an idle hive still gets a beat every thirty seconds, for the labels that tick", () => {
  const raw = { sessions: [] };
  assert.equal(pollKey(raw, 0), pollKey(raw, POLL_STILL - 1));
  assert.notEqual(pollKey(raw, 0), pollKey(raw, POLL_STILL));
});

test("while a seat is being born every poll paints, so the spawn timer keeps ticking", () => {
  const raw = { sessions: [], spawning: [{ id: "j1" }] };
  assert.notEqual(pollKey(raw, 2500), pollKey(raw, 5000));
});

const answer = (over = {}) => ({ sessions: [{ name: "a", title: "a", where: "local", state: "idle", kind: "chat" }], pod: { up: true, name: "" }, spawning: [], archived: [], ...over });

const withLimits = (percent) => ({ accounts: [{ account: "default", limits: [{ kind: "session", percent }] }], tightest: "default" });

test("the same payload twice paints once, and the chip still refreshes", async () => {
  hive();
  served.hive = answer();
  st.limits = withLimits(10);
  await pull();
  await pull();
  const seen = nav.pollSeen;
  const missed = skipped();
  const chip = $("btn-lim").innerHTML;
  st.limits = withLimits(90);
  await pull();
  st.limits = withLimits(95);
  await pull();
  assert.equal(nav.pollSeen, seen, "the same answer is the same key, so the canvas is left alone");
  assert.equal(skipped() - missed, 2, "and the poll says so, twice");
  assert.notEqual($("btn-lim").innerHTML, chip, "the chip is repainted even when the hive did not move");
  assert.match($("btn-lim").innerHTML, /95%/);
});

test("a payload that changed paints again", async () => {
  hive();
  served.hive = answer();
  await pull();
  const seen = nav.pollSeen;
  const missed = skipped();
  served.hive = answer({ sessions: [{ name: "a", title: "a", where: "local", state: "needs", kind: "chat" }] });
  await pull();
  assert.notEqual(nav.pollSeen, seen);
  assert.equal(skipped() - missed, 0, "nothing was skipped — the canvas was painted");
});

test("thirty seconds later the same payload paints again", async () => {
  hive();
  served.hive = answer();
  await pull();
  const seen = nav.pollSeen;
  const missed = skipped();
  wall += POLL_STILL;
  await pull();
  assert.notEqual(nav.pollSeen, seen);
  assert.equal(skipped() - missed, 0);
});

test("a hidden window paints nothing and skips nothing", async () => {
  hive();
  served.hive = answer();
  await pull();
  const seen = nav.pollSeen;
  const missed = skipped();
  const clock = $("clock").textContent;
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  try {
    served.hive = answer({ sessions: [{ name: "a", title: "a", where: "local", state: "needs", kind: "chat" }] });
    await pull();
    assert.equal(nav.pollSeen, seen, "the key is not even taken while nobody is looking");
    assert.equal(skipped() - missed, 0);
    assert.equal($("clock").textContent, clock, "and the clock is not rewritten either");
  } finally {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  }
});

/* ── the inbox paints only when a knock or a loan moved ── */

const knockKey = () => JSON.stringify([st.lentHere, st.knocksOpen]);

test("the same knocks and loans twice paint once", async () => {
  hive();
  served.knocks = { lent: [], knocks: [{ id: "k1", seat: "a", from: "bia" }] };
  await pullKnocks();
  const held = knockKey();
  await pullKnocks();
  assert.equal(knockKey(), held, "nothing moved, so the dock keeps what it had");
  assert.equal($("knock-dock").hidden, false);
  assert.match($("knock-dock").textContent, /bia/);
});

test("a knock answered, or a keyboard lent, paints again", async () => {
  hive();
  served.knocks = { lent: [], knocks: [{ id: "k1", seat: "a", from: "bia" }] };
  await pullKnocks();
  served.knocks = { lent: [], knocks: [] };
  await pullKnocks();
  assert.equal(st.knocksOpen.length, 0, "the answered knock is gone from the dock");
  served.knocks = { lent: [{ seat: "a", with: "bia", until: 9 }], knocks: [] };
  await pullKnocks();
  assert.deepEqual(st.lentHere.map((one) => one.with), ["bia"], "and the lent keyboard is on the card");
});

/* ── the name on the card is written only when it changed ── */

const nameSlot = (name) => tiles.get(name).querySelector(".t-name");

test("the same name twice is written once", () => {
  hive();
  const slot = nameSlot("a");
  paintName(tiles.get("a"), { name: "a", title: "Ana" });
  slot.dataset.mine = "1";
  paintName(tiles.get("a"), { name: "a", title: "Ana" });
  assert.equal(slot.textContent, "Ana");
  assert.equal(slot.dataset.mine, "1", "nothing was rewritten, so what the card carried is still there");
});

test("a rename box left in the slot is replaced by the name, even when the name did not change", () => {
  hive();
  const slot = nameSlot("a");
  paintName(tiles.get("a"), { name: "a", title: "Ana" });
  const box = document.createElement("input");
  box.className = "t-rename";
  slot.textContent = "";
  slot.appendChild(box);
  paintName(tiles.get("a"), { name: "a", title: "Ana" });
  assert.equal(slot.textContent, "Ana");
  assert.equal(slot.firstElementChild, null);
});

/* ── the blocks are written only when they changed ── */

test("saving the same blocks twice writes localStorage once", () => {
  hive();
  saveBlocks();
  localStorage.setItem("hive.blocks", "untouched");
  saveBlocks();
  assert.equal(localStorage.getItem("hive.blocks"), "untouched", "the second save never reached the store");
});

test("a block that changed is written again", () => {
  hive();
  saveBlocks();
  localStorage.setItem("hive.blocks", "untouched");
  st.blocks[0].keys.push("b");
  saveBlocks();
  assert.match(localStorage.getItem("hive.blocks"), /"b"/);
});

test("a solo seat never writes the blocks", () => {
  const body = slice(read("blocks.js"), "const saveBlocks = () => {", "};", "blocks.js");
  assert.match(body, /if \(soloSeat\) return;/, "a hive opened on one seat has no blocks of its own to keep");
});

/* ── the flip only measures when the layout could have moved ── */

test("nothing changed, same key", () => {
  hive({ seats: ["a", "b"] });
  assert.equal(layoutKey(false), layoutKey(false));
});

test("opening a seat, folding one, reordering, another block, the plane and the row all change the key", () => {
  hive({ seats: ["a", "b"] });
  st.blocks.push({ id: "b1", ws: "w0", label: "", manual: true, keys: [] });
  const still = layoutKey(false);

  st.open = "a";
  assert.notEqual(layoutKey(false), still);
  st.open = null;

  unfolded.add("b");
  assert.notEqual(layoutKey(false), still);
  unfolded.delete("b");

  st.blocks[0].keys = ["b", "a"];
  assert.notEqual(layoutKey(false), still);
  st.blocks[0].keys = ["a", "b"];

  st.block = 1;
  assert.notEqual(layoutKey(false), still);
  st.block = 0;

  assert.notEqual(layoutKey(true), still);

  st.seatLayout = "row";
  assert.notEqual(layoutKey(false), still);
  st.seatLayout = "grid";

  assert.equal(layoutKey(false), still);
});

test("the render asks the flip only when the layout key moved", () => {
  const body = slice(read("arrange.js"), "function paintEverything(", "const blankSides", "arrange.js");
  assert.match(body, /const layout = layoutKey\(onPlane\);\s*if \(layout === layoutSeen\) animate = false;\s*layoutSeen = layout;\s*const moved = onPlane \|\| !animate \? null : flipStart\(\);/);
});

test("the browser is measured again once the tiles land, not only on the flip's first frame", () => {
  const body = slice(read("arrange.js"), "function paintEverything(", "const blankSides", "arrange.js");
  assert.match(body, /const flights = flipEnd\(moved\);/);
  assert.match(body, /paintYards\(\);\s*if \(flights\.length\) Promise\.allSettled\(flights\.map\(\(flight\) => flight\.finished\)\)\.then\(paintYards\);/);
});

test("the browser follows its stage when the pane or the window changes size without a render", () => {
  const panes = read("chat-and-panes.js");
  const pane = slice(panes, "function webPaneOf(", "function paintYards(", "chat-and-panes.js");
  assert.match(pane, /followStageSize\(pane\.querySelector\("\.art-stage"\)\);/);
  assert.match(panes, /new ResizeObserver\(paintYardsSoon\)\.observe\(stage\);/);
  assert.match(panes, /addEventListener\("resize", paintYardsSoon\);/);
});

/* ── the aim is written only when it moved ── */

test("the same aim twice touches the tiles once", () => {
  hive({ seats: ["a", "b"] });
  st.composing = true;
  st.open = "a";
  let touched = 0;
  tiles.set("probe", { classList: { toggle: () => { touched++; }, contains: () => false } });
  try {
    paintAim();
    assert.ok(tiles.get("a").classList.contains("aiming"));
    assert.equal(touched, 1, "every tile was told once");
    paintAim();
    assert.equal(touched, 1, "the aim did not move, so nothing was written again");
  } finally {
    tiles.delete("probe");
  }
});

test("a moved aim, and a dropped one, touch the tiles again", () => {
  hive({ seats: ["a", "b"] });
  st.composing = true;
  st.open = "a";
  paintAim();
  st.open = "b";
  paintAim();
  assert.ok(tiles.get("b").classList.contains("aiming"));
  assert.ok(!tiles.get("a").classList.contains("aiming"));
  st.composing = false;
  paintAim();
  assert.ok(!tiles.get("b").classList.contains("aiming"));
});

test("a tile born after the aim was set still gets the mark", () => {
  hive({ seats: ["a", "b"] });
  st.composing = true;
  st.open = "c";
  paintAim();
  st.data.sessions.push(seat("c"));
  st.blocks[0].keys.push("c");
  render();
  paintAim();
  assert.ok(tiles.get("c").classList.contains("aiming"));
});

/* ── the slack cards of a seat are only what its threads say ── */

const thread = (key, said) => ({ key, session: "a", channel: "eng", link: "", last: { who: "bia", text: said }, names: {} });

test("the same threads twice give the card the same words", () => {
  hive();
  st.threads = [thread("t1", "hi"), thread("t2", "yo")];
  const shut = tileThreadsModel({ name: "a" });
  assert.deepEqual(shut.cards.map((one) => one.key), ["t1"]);
  assert.match(shut.more, /1 more thread/);
  assert.deepEqual(tileThreadsModel({ name: "a" }).cards[0], shut.cards[0]);
});

test("a new message, or opening the seat, writes them again", () => {
  hive();
  st.threads = [thread("t1", "hi"), thread("t2", "yo")];
  const first = tileThreadsModel({ name: "a" }).cards[0].last.said;
  st.threads = [thread("t1", "hi again"), thread("t2", "yo")];
  assert.notEqual(tileThreadsModel({ name: "a" }).cards[0].last.said, first);

  st.open = "a";
  const wide = tileThreadsModel({ name: "a" });
  assert.deepEqual(wide.cards.map((one) => one.key), ["t1", "t2"]);
  assert.equal(wide.more, "");
});

/* ── the wires of the plane are elements that move, not markup rewritten per pointer move ── */

const skinOf = () => {
  planeWireEls.clear();
  const skin = document.createElementNS("http://www.w3.org/2000/svg", "g");
  document.body.appendChild(skin);
  return skin;
};

test("the same wire drawn twice is one path and one dot, written once", () => {
  const skin = skinOf();
  wireOn(skin, "a>b", 0, 0, 10, 10, "#000", "1");
  assert.equal(skin.children.length, 2);
  const [path, dot] = skin.children;
  const drawn = path.getAttribute("d");
  path.setAttribute("d", "untouched");
  dot.setAttribute("cx", "untouched");
  wireOn(skin, "a>b", 0, 0, 10, 10, "#000", "1");
  assert.equal(skin.children.length, 2, "nothing new was made");
  assert.equal(path.getAttribute("d"), "untouched", "and nothing was written again");
  assert.equal(dot.getAttribute("cx"), "untouched");
  assert.ok(drawn.length > 2);
});

test("a wire that moved rewrites only the geometry, not the element", () => {
  const skin = skinOf();
  wireOn(skin, "a>b", 0, 0, 10, 10, "#000", "1");
  const [path, dot] = skin.children;
  wireOn(skin, "a>b", 0, 0, 20, 10, "#000", "1");
  assert.equal(skin.children.length, 2);
  assert.equal(skin.children[0], path, "the same path moved");
  assert.match(path.getAttribute("d"), /20/);
  assert.equal(dot.getAttribute("cx"), "20");
  assert.equal(dot.getAttribute("cy"), "10");
});

/* ── the pull requests of a seat are sorted once per answer ── */

test("the same answer asked twice hands back the same list", () => {
  hive();
  st.prs = [{ key: "1", session: "a", state: "merged" }, { key: "2", session: "a", state: "open" }];
  const first = prsOfChat("a");
  assert.equal(prsOfChat("a"), first);
  assert.deepEqual(first.map((p) => p.key), ["2", "1"]);
});

test("a fresh answer from the server sorts again", () => {
  hive();
  st.prs = [{ key: "1", session: "a", state: "open" }];
  const first = prsOfChat("a");
  st.prs = [{ key: "1", session: "a", state: "merged" }, { key: "3", session: "a", state: "open" }];
  const second = prsOfChat("a");
  assert.notEqual(second, first);
  assert.deepEqual(second.map((p) => p.key), ["3", "1"]);
});

test("the server's own clock never reaches the state, so the reactive render key cannot tick on it", async () => {
  hive();
  served.hive = { sessions: [seat("a")], spawning: [], at: "2026-10-01T11:00:00.000Z" };
  await pull();
  assert.equal("at" in st.data, false, "the clock stays out of the state");
  const before = JSON.stringify(st.data);
  const held = st.data;
  served.hive = { ...served.hive, at: "2026-10-01T11:00:02.500Z" };
  await pull();
  assert.equal(JSON.stringify(st.data), before, "a new clock on the same answer leaves the state identical");
  assert.equal(st.data, held, "and the state is not even written, so no effect wakes up on it");
  served.hive = { ...served.hive, sessions: [seat("a", { state: "needs" })] };
  await pull();
  assert.notEqual(st.data, held, "an answer that changed is written");
});

test("the poll stores the answer without the clock and marks performance only behind the flag", () => {
  assert.match(read("focus-navigation.js"), /if \(shape !== hiveShape\) st\.data = hive;/);
  assert.match(read("core.js"), /makePerf\(\{ mark: perfWanted\(\) \? \(name\) => performance\.mark\(name\) : undefined \}\)/);
});

test("the same threads and the same team twice are written once and painted once", async () => {
  hive();
  const { pullThreads } = await app("prs");
  const { pullTeam } = await app("team");
  const painted = () => Object.values(perf.stats()).reduce((sum, one) => sum + one.count, 0);
  await pullThreads(false);
  const threads = st.threads;
  const after = painted();
  await pullThreads(false);
  assert.equal(st.threads, threads, "the same threads are not written again");
  assert.equal(painted(), after, "and nothing is painted for them");
  served.team = { me: "art", devs: [{ dev: "art", seats: [{ name: "a" }] }] };
  await pullTeam(false);
  const team = st.team;
  const then = painted();
  await pullTeam(false);
  assert.equal(st.team, team, "the same team is not written again");
  assert.equal(painted(), then, "and nothing is painted for it");
  served.team = { me: "art", devs: [{ dev: "art", seats: [{ name: "a" }, { name: "b" }] }] };
  await pullTeam(false);
  assert.notEqual(st.team, team, "a team that changed is written");
  assert.equal(painted(), then + 1, "and painted once");
});

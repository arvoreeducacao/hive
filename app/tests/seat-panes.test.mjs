import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });

const st = await state();
const { paneOfSeat, stopBeat } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { closeTile, openTile } = await app("focus-navigation");
const { openBrowser, openCockpit, openDevice } = await app("chat-and-panes");
const { openThreadOf, reviewInChat } = await app("thread");

const HERE = fileURLToPath(new URL("../src/app", import.meta.url));
const read = (file) => readFileSync(join(HERE, file), "utf8");
const panes = read("chat-and-panes.js");
const threads = read("thread.js");
const focus = read("focus-navigation.js");
const arrange = read("arrange.js");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
after(() => {
  for (const beat of ["threads", "prs"]) stopBeat(beat);
  globalThis.fetch = realFetch;
});

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });
const THREAD = { key: "C1:1.2", session: "ana", channel: "eng", title: "a thread" };
const PR = { key: "acme/hive#9", session: "ana", repo: "acme/hive", number: 9, title: "a pr", state: "open" };

function hive({ said = [], known = [] } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: ["ana", "bia"].map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["ana", "bia"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.threads = said;
  st.prs = known;
  st.cockChat = null;
  st.webChat = null;
  st.deviceChat = null;
  st.threadChat = null;
  st.openThread = "";
  st.reviewChat = null;
  st.openPr = "";
  paneOfSeat.clear();
  render();
}

const settle = () => new Promise((then) => setImmediate(then));

test("a seat showing a published page comes back as the browser it lives in", async () => {
  hive();
  openTile("ana");
  openBrowser("ana");
  closeTile();
  assert.equal(st.open, null);
  assert.equal(st.webChat, null);
  openTile("ana");
  await settle();
  assert.equal(st.webChat, "ana", "the note says browser, and the tabs come back with it");
});

test("the pane note has no kind of its own for a published page any more", () => {
  const keep = slice(focus, "function keepPane() {", "\nconst paneHere", "focus-navigation.js");
  assert.ok(!keep.includes('kind: "artifact"'), "an artifact is a tab of the browser, not a pane");
  assert.match(keep, /webChat === name\) paneOfSeat\.set\(name, \{ kind: "browser" \}\)/);
  const back = slice(focus, "function restorePane(name) {", "\nasync function pull()", "focus-navigation.js");
  assert.ok(!back.includes('pane.kind === "artifact"'), "and nothing restores one");
});

test("the cockpit, the thread and the review each come back the same way", () => {
  hive();
  openTile("ana");
  openCockpit("ana");
  closeTile();
  openTile("ana");
  assert.equal(st.cockChat, "ana");

  hive({ said: [THREAD] });
  openTile("ana");
  openThreadOf("ana", THREAD.key);
  closeTile();
  openTile("ana");
  assert.equal(st.threadChat, "ana");
  assert.equal(st.openThread, THREAD.key);

  hive({ known: [PR] });
  openTile("ana");
  reviewInChat("ana", PR.key);
  closeTile();
  assert.equal(st.open, null);
  openTile("ana");
  assert.equal(st.reviewChat, "ana");
  assert.equal(st.openPr, PR.key);
});

test("the device pane comes back the same way, and leaves with the tile", () => {
  hive();
  openTile("ana");
  openDevice("ana");
  closeTile();
  assert.equal(st.deviceChat, null);
  openTile("ana");
  assert.equal(st.deviceChat, "ana");
  openTile("bia");
  assert.equal(st.deviceChat, null, "the neighbour's tile never shows ana's device");
});

test("shutting the panel yourself is how you are given an empty seat next time", () => {
  hive({ said: [THREAD] });
  openTile("ana");
  openThreadOf("ana", THREAD.key);
  closeTile();
  openTile("ana");
  assert.equal(st.threadChat, "ana");

  st.threadChat = null;
  st.openThread = "";
  closeTile();
  openTile("ana");
  assert.equal(st.threadChat, null, "a seat closed with nothing open comes back with nothing open");
});

test("each seat is opened with its own panel, never with the neighbour's", () => {
  hive({ said: [{ ...THREAD, session: "bia" }] });
  openTile("ana");
  openBrowser("ana");
  openTile("bia");
  st.webChat = null;
  openThreadOf("bia", THREAD.key);
  closeTile();
  openTile("bia");
  assert.equal(st.threadChat, "bia");
  assert.equal(st.webChat, null, "ana's browser does not follow bia into her seat");
});

test("a thread or a pull request the hive no longer holds is not asked for again", () => {
  hive({ said: [THREAD] });
  openTile("ana");
  openThreadOf("ana", THREAD.key);
  closeTile();
  st.threads = [];
  openTile("ana");
  assert.equal(st.threadChat, null);

  hive({ known: [PR] });
  openTile("ana");
  reviewInChat("ana", PR.key);
  closeTile();
  st.prs = [];
  openTile("ana");
  assert.equal(st.reviewChat, null);
});

test("a panel that opens the seat for itself does not ask for the note back", () => {
  for (const [where, source, file] of [[panes, "openBrowser", "chat-and-panes.js"], [panes, "openCockpit", "chat-and-panes.js"], [threads, "openThreadOf", "thread.js"], [threads, "reviewInChat", "thread.js"]]) {
    const at = where.indexOf(`function ${source}(`);
    assert.ok(at > 0, `no ${source} in ${file}`);
    const body = where.slice(at, where.indexOf("\n}", at));
    assert.match(body, /openTile\(name, false\)/, `${source} would reopen its own panel`);
  }
});

test("a seat the hive lost takes its note with it", () => {
  hive();
  openTile("ana");
  openBrowser("ana");
  closeTile();
  assert.equal(paneOfSeat.get("ana").kind, "browser");
  st.data = { ...st.data, sessions: [seat("bia")] };
  render();
  assert.equal(paneOfSeat.has("ana"), false);
  assert.match(slice(arrange, "for (const [key, el] of tiles) {", "\n  if (!shown.length)", "arrange.js"), /paneOfSeat\.delete\(key\)/);
});

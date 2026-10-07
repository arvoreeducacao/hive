import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const tileView = readFileSync(join(HERE, "src", "tile.jsx"), "utf8");

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Hive/1.0 Electron/38.0.0", configurable: true });

const st = await state();
await views();
const { paintFold, sideShut, sidesShut, statusFolded, unfolded } = await app("core");
const { toggleFold } = await app("shared");
const { openBrowser } = await app("chat-and-panes");
const { openThreadOf, reviewInChat } = await app("thread");

function tileOf() {
  const el = document.createElement("div");
  el.className = "tile";
  el.innerHTML = '<button class="t-fold"></button>';
  return { el, button: el.querySelector(".t-fold"), folded: () => el.classList.contains("folded") };
}

const alone = (name) => { st.open = name; };

test("a seat alone on the screen keeps its side open, whatever the mosaic fold says", () => {
  const tile = tileOf();
  unfolded.clear();
  sidesShut.clear();
  alone("worker");
  paintFold("worker", tile.el);
  assert.equal(tile.folded(), false);
});

test("the fold button is there while the seat is alone — the cards are what eats the chat's room", () => {
  const tile = tileOf();
  sidesShut.clear();
  alone("worker");
  paintFold("worker", tile.el);
  assert.equal(tile.button.hidden, false);
  assert.equal(tile.button.querySelector("use").getAttribute("href"), "#i-minus");
});

test("the side a person shuts while the seat is alone comes back shut", () => {
  const tile = tileOf();
  sidesShut.clear();
  localStorage.removeItem("hive.sideshut");
  alone("worker");
  toggleFold("worker");
  assert.equal(sideShut("worker"), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.sideshut")), ["worker"]);
  paintFold("worker", tile.el);
  assert.equal(tile.folded(), true);
  assert.equal(tile.button.querySelector("use").getAttribute("href"), "#i-plus");
  assert.equal(tile.button.getAttribute("aria-pressed"), "true");
  toggleFold("worker");
  assert.equal(sideShut("worker"), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.sideshut")), []);
});

test("the two folds are two memories: shutting the side alone leaves the mosaic fold alone", () => {
  sidesShut.clear();
  unfolded.clear();
  unfolded.add("worker");
  alone("worker");
  toggleFold("worker");
  assert.equal(sideShut("worker"), true);
  assert.equal(statusFolded("worker"), false);
  alone(null);
  const tile = tileOf();
  paintFold("worker", tile.el);
  assert.equal(tile.folded(), false);
  sidesShut.clear();
  unfolded.clear();
});

test("the side shut while the seat is alone gives its width back to the chat, but never in the artifact layout", () => {
  assert.match(page, /\.tile\.open\.folded:not\(\.arting\) \{ --open-side: \d+px; \}/);
});

test("back in the mosaic the stored fold rules again", () => {
  const tile = tileOf();
  unfolded.clear();
  alone(null);
  paintFold("worker", tile.el);
  assert.equal(tile.folded(), true);
  assert.equal(tile.button.hidden, false);
  assert.equal(tile.button.querySelector("use").getAttribute("href"), "#i-plus");
  assert.equal(tile.button.getAttribute("aria-pressed"), "true");
});

test("a seat unfolded by hand stays unfolded in the mosaic", () => {
  const tile = tileOf();
  alone(null);
  unfolded.add("reader");
  paintFold("reader", tile.el);
  assert.equal(tile.folded(), false);
  assert.equal(tile.button.querySelector("use").getAttribute("href"), "#i-minus");
});

test("the fold a person flips is the fold they find again after a reload", () => {
  unfolded.clear();
  localStorage.removeItem("hive.unfolded");
  toggleFold("reader");
  assert.equal(statusFolded("reader"), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.unfolded")), ["reader"]);
  toggleFold("reader");
  assert.equal(statusFolded("reader"), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.unfolded")), []);
});

test("the side stops carrying the status log — the chat already tells what the session does", () => {
  assert.equal(page.includes("steps-wrap"), false);
  assert.equal(page.includes("What it logged"), false);
});

test("the Slack thread sits above the pull requests — where the work came from, then what came out of it", () => {
  assert.ok(tileView.indexOf('class="t-slack-wrap"') < tileView.indexOf('class="t-pr-wrap"'), "the markup puts the pull requests first");
  const orderOf = (name) => Number(page.match(new RegExp(`\\.${name} \\{ order: (\\d+)`))?.[1]);
  assert.ok(orderOf("t-slack-wrap") < orderOf("t-pr-wrap"), "the card order puts the pull requests first");
});

const roomFor = (name) => {
  st.open = "";
  st.data = { sessions: [{ name }], spawning: [], archived: [], pod: {} };
  st.blocks = [{ id: "b0", ws: st.space, label: "", manual: false, keys: [name] }];
  st.block = 0;
  st.prs = [{ key: "pr-1", session: name, repo: "o/r", number: 1, url: "https://github.com/o/r/pull/1", title: "a change", state: "open", checks: [] }];
  st.threads = [{ key: "th-1", session: name, channel: "C1", ts: "1", title: "a thread", messages: [] }];
  st.openPr = null;
  st.openThread = null;
  st.reviewChat = null;
  st.threadChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
};

test("opening the review shuts the Slack thread and the browser", () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ threads: [], prs: [] }) });
  roomFor("seat");
  st.threadChat = "seat";
  st.webChat = "seat";
  reviewInChat("seat", "pr-1");
  assert.equal(st.reviewChat, "seat");
  assert.equal(st.threadChat, null);
  assert.equal(st.webChat, null);
  globalThis.fetch = saved;
});

test("opening the Slack thread shuts the review and the browser", () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ threads: [], prs: [] }) });
  roomFor("seat");
  st.reviewChat = "seat";
  st.webChat = "seat";
  openThreadOf("seat", "th-1");
  assert.equal(st.threadChat, "seat");
  assert.equal(st.reviewChat, null);
  assert.equal(st.webChat, null);
  globalThis.fetch = saved;
});

test("opening the browser — which is where a published page lives now — shuts the review and the thread", () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ threads: [], prs: [] }) });
  roomFor("seat");
  st.reviewChat = "seat";
  st.threadChat = "seat";
  openBrowser("seat");
  assert.equal(st.webChat, "seat");
  assert.equal(st.reviewChat, null);
  assert.equal(st.threadChat, null);
  globalThis.fetch = saved;
});

test("in a narrow window the thread takes the chat's room instead of vanishing", () => {
  const narrow = page.slice(page.indexOf("@media (max-width: 860px)"));
  assert.match(narrow, /\.tile\.open\.threading \.well \{ display: none; \}/);
  assert.equal(/\.tile\.threading \.thread \{ display: none; \}/.test(narrow), false);
});

test("in the new Hive a seat in the mosaic starts with its side open, and folding it is remembered", () => {
  const tile = tileOf();
  unfolded.clear();
  sidesShut.clear();
  st.open = null;
  document.body.classList.add("experience-next");
  try {
    paintFold("mosaic-seat", tile.el);
    assert.equal(tile.folded(), false);
    toggleFold("mosaic-seat");
    assert.equal(sideShut("mosaic-seat"), true);
    assert.equal(statusFolded("mosaic-seat"), true);
  } finally {
    document.body.classList.remove("experience-next");
    sidesShut.clear();
  }
});

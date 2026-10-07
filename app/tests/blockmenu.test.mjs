import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { blockMenuRows, closeBlock, openBlockMenu } = await app("seat-menu");

const seat = (name, where = "local") => ({ name, where, state: "idle" });

const posts = [];

function hive(blocks, { current = 0, open = "", jobs = [], sessions = [] } = {}) {
  st.data = { sessions, spawning: jobs, archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
  st.blocks = blocks.map((b, i) => ({ id: `b${i}`, ws: st.space, label: b.label, manual: true, keys: b.keys }));
  st.block = current;
  st.open = open;
  st.focus = 0;
  posts.length = 0;
  document.getElementById("seatmenu").classList.remove("on");
}

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const settle = () => new Promise((done) => setImmediate(done));

const was = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("/api/tasks")) posts.push({ url, body: init?.body ? JSON.parse(init.body) : null });
  if (String(url).startsWith("/api/hive")) return { ok: true, json: async () => JSON.parse(JSON.stringify(st.data)) };
  return { ok: true, json: async () => ({}) };
};
test.after(() => { globalThis.fetch = was; });

const dialog = () => ({
  on: document.getElementById("confirm").classList.contains("on"),
  title: document.getElementById("c-title").textContent,
  yes: document.getElementById("c-yes"),
  no: document.getElementById("c-no")
});

const kills = () => posts.filter((p) => p.url === "/api/kill").map((p) => p.body);

test("the close row counts the live seats of the block", () => {
  hive([{ label: "paraná", keys: ["a", "b"] }], { sessions: [seat("a"), seat("b")] });
  const close = blockMenuRows(0).find((r) => r.danger);
  assert.equal(close.label, "close all 2 seats");
  assert.equal(close.off, false);
});

test("a block with a single seat does not say \"all\"", () => {
  hive([{ label: "só uma", keys: ["a"] }], { sessions: [seat("a")] });
  assert.equal(blockMenuRows(0).find((r) => r.danger).label, "close its seat");
});

test("a block that only holds spawning jobs has nothing to close", () => {
  hive([{ label: "nascendo", keys: ["job:1"] }], { jobs: [{ id: "1", name: "" }] });
  const close = blockMenuRows(0).find((r) => r.danger);
  assert.equal(close.off, true);
  assert.equal(close.note, "nothing to close");
});

test("the current block does not offer to go to itself", () => {
  hive([{ label: "aqui", keys: ["a"] }, { label: "lá", keys: ["b"] }], { sessions: [seat("a"), seat("b")] });
  assert.equal(blockMenuRows(0).some((r) => r.label === "go to this block"), false);
  assert.equal(blockMenuRows(1).some((r) => r.label === "go to this block"), true);
});

test("the menu of a block that does not exist opens nothing", () => {
  hive([], {});
  openBlockMenu(3, 0, 0);
  assert.equal(document.getElementById("seatmenu").classList.contains("on"), false);
});

test("the menu of a block that exists is titled by the block", () => {
  hive([{ label: "paraná", keys: ["a"] }], { sessions: [seat("a")] });
  openBlockMenu(0, 10, 10);
  const menu = document.getElementById("seatmenu");
  assert.equal(menu.classList.contains("on"), true);
  assert.equal(menu.querySelector(".cap").textContent, "paraná");
  menu.classList.remove("on");
});

test("closing a block asks once and kills every seat", async () => {
  hive([{ label: "paraná", keys: ["a", "b"] }], { sessions: [seat("a"), seat("b", "cloud")] });
  const done = closeBlock(0);
  const box = dialog();
  assert.equal(box.on, true);
  assert.match(box.title, /Close all 2 seats\?/);
  box.yes.dispatchEvent(new window.Event("click", { bubbles: true }));
  await done;
  await settle();
  assert.deepEqual(kills(), [{ name: "a", where: "local" }, { name: "b", where: "cloud" }]);
  assert.ok(posts.some((p) => String(p.url).startsWith("/api/hive")), "the fleet is asked again after the kill");
  assert.equal(document.getElementById("confirm").classList.contains("on"), false);
});

test("saying no to the question kills nothing", async () => {
  hive([{ label: "paraná", keys: ["a"] }], { sessions: [seat("a")] });
  const done = closeBlock(0);
  assert.equal(dialog().on, true);
  dialog().no.dispatchEvent(new window.Event("click", { bubbles: true }));
  await done;
  await settle();
  assert.deepEqual(kills(), []);
  assert.deepEqual(posts.filter((p) => p.url !== "/api/seat/leftovers"), [], "only the look at what the seats left behind, never a kill");
});

test("the open tile closes only when it was one of the seats", async () => {
  hive([{ label: "paraná", keys: ["a", "b"] }], { sessions: [seat("a"), seat("b")], open: "b" });
  const done = closeBlock(0);
  dialog().yes.dispatchEvent(new window.Event("click", { bubbles: true }));
  await done;
  await settle();
  assert.equal(st.open, null);

  hive([{ label: "paraná", keys: ["a"] }], { sessions: [seat("a"), seat("elsewhere")], open: "elsewhere" });
  const other = closeBlock(0);
  dialog().yes.dispatchEvent(new window.Event("click", { bubbles: true }));
  await other;
  await settle();
  assert.equal(st.open, "elsewhere");
});

test("a block with no live seat is never killed", async () => {
  hive([{ label: "nascendo", keys: ["job:1"] }], { jobs: [{ id: "1", name: "" }] });
  await closeBlock(0);
  await settle();
  assert.equal(dialog().on, false);
  assert.deepEqual(posts, []);
});

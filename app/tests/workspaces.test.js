import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const grid = await app("blocks");

const { SPACE_TINTS, blockNumber, moveSeatToBlock, moveToNewBlock, nameSpace, openSpace, seatsOf, shutSpace, spaceName, tidy } = grid;

const STORED = ["hive.blocks", "hive.block", "hive.detached", "hive.spaces", "hive.space"];

const fresh = () => {
  for (const key of STORED) localStorage.removeItem(key);
  grid.detached.clear();
  st.LIMIT = 4;
  st.open = null;
  st.focus = 0;
  st.block = 0;
  st.blocks = [];
  st.spaces = [{ id: "w0", name: "", tint: SPACE_TINTS[0] }];
  st.space = "w0";
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
};

const laySpaces = (names) => {
  st.spaces = names.map((name, i) => ({ id: `w${i}`, name, tint: SPACE_TINTS[i % SPACE_TINTS.length] }));
  st.space = st.spaces[0].id;
};

const lay = (shape) => {
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: b.ws || "", label: "", manual: !!b.manual, keys: [...b.keys] }));
  st.block = 0;
};

const live = (names) => {
  st.data = { sessions: names.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
};

const plan = () => st.blocks.map((b) => [b.ws, [...b.keys]]);

const spaces = () => st.spaces.map((w) => ({ id: w.id, name: w.name, tint: w.tint }));

test("a hive that never heard of workspaces finds every block in the first one", () => {
  fresh();
  lay([{ keys: ["a", "b"], manual: true }, { keys: ["c"], manual: true }]);
  live(["a", "b", "c"]);
  tidy();
  assert.equal(spaces().length, 1);
  assert.deepEqual(plan(), [["w0", ["a", "b"]], ["w0", ["c"]]]);
});

test("a chat nobody placed lands in the workspace you are on, not in the first one", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"], manual: true }]);
  st.space = "w1";
  live(["a", "b"]);
  tidy();
  assert.deepEqual(plan(), [["w0", ["a"]], ["w1", ["b"]]]);
});

test("two blocks of different workspaces never join, however much room they have", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"] }, { ws: "w1", keys: ["b"] }]);
  live(["a", "b"]);
  tidy();
  assert.deepEqual(plan(), [["w0", ["a"]], ["w1", ["b"]]]);
});

test("two blocks of the same workspace still join, which is the rule workspaces did not change", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w1", keys: ["a", "b"] }, { ws: "w1", keys: ["c"] }]);
  st.space = "w1";
  live(["a", "b", "c"]);
  tidy();
  assert.deepEqual(plan(), [["w1", ["a", "b", "c"]]]);
});

test("closing a workspace hands its blocks to the one before it and closes no chat", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"], manual: true }, { ws: "w1", keys: ["b"], manual: true }]);
  st.space = "w1";
  assert.equal(shutSpace("w1"), true);
  assert.deepEqual(spaces().map((w) => w.id), ["w0"]);
  assert.deepEqual(plan(), [["w0", ["a"]], ["w0", ["b"]]]);
  assert.equal(st.space, "w0");
});

test("the first workspace hands its blocks forward, since there is nothing before it", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"], manual: true }]);
  assert.equal(shutSpace("w0"), true);
  assert.deepEqual(plan(), [["w1", ["a"]]]);
});

test("the last workspace does not close — there would be nowhere for the blocks to go", () => {
  fresh();
  laySpaces(["crm"]);
  lay([{ ws: "w0", keys: ["a"], manual: true }]);
  assert.equal(shutSpace("w0"), false);
  assert.deepEqual(spaces().map((w) => w.id), ["w0"]);
});

test("a workspace opened now takes the next colour, so two of them never look alike", () => {
  fresh();
  const first = spaces()[0];
  const second = openSpace("crm");
  assert.notEqual(second.tint, first.tint);
  assert.equal(spaces().length, 2);
});

test("a workspace with no name of its own is still called something", () => {
  fresh();
  laySpaces(["", "hive"]);
  assert.equal(spaceName(spaces()[0]), "workspace 1");
  nameSpace("w0", "  crm  ");
  assert.equal(spaces()[0].name, "crm");
});

test("the new-block card of a floor opens the block on that floor, not on the one you are on", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a", "b"], manual: true }]);
  live(["a", "b"]);
  st.space = "w0";
  moveToNewBlock("b", "w1");
  assert.deepEqual(plan(), [["w0", ["a"]], ["w1", ["b"]]]);
});

test("a seat dragged to a block of another floor changes workspace with it", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a", "b"], manual: true }, { ws: "w1", keys: ["c"], manual: true }]);
  live(["a", "b", "c"]);
  moveSeatToBlock("b", 1);
  assert.deepEqual(plan(), [["w0", ["a"]], ["w1", ["c", "b"]]]);
});

test("the workspace you are on survives a reload, and so does the list", () => {
  fresh();
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w1", keys: ["a"], manual: true }]);
  st.space = "w1";
  live(["a"]);
  tidy();
  assert.equal(JSON.parse(localStorage.getItem("hive.spaces")).length, 2);
  assert.equal(JSON.parse(localStorage.getItem("hive.blocks"))[0].ws, "w1");
  assert.deepEqual(grid.readSpaces().map((w) => w.id), ["w0", "w1"]);
  assert.deepEqual(grid.readBlocks().map((b) => b.ws), ["w1"]);
});

test("a block pointing at a workspace that is gone is adopted instead of disappearing", () => {
  fresh();
  laySpaces(["crm"]);
  lay([{ ws: "gone", keys: ["a"], manual: true }]);
  live(["a"]);
  tidy();
  assert.deepEqual(plan(), [["w0", ["a"]]]);
});

test("the number a tab wears counts inside its own workspace, not across the whole pile", () => {
  fresh();
  laySpaces(["leitura", "escrita"]);
  lay([
    { ws: "w0", keys: ["a"], manual: true },
    { ws: "w0", keys: ["b"], manual: true },
    { ws: "w1", keys: ["c"], manual: true },
    { ws: "w1", keys: ["d"], manual: true }
  ]);
  assert.deepEqual([0, 1, 2, 3].map((i) => blockNumber(i)), [1, 2, 1, 2]);
  assert.equal(seatsOf("w0"), 2);
  assert.equal(seatsOf("w1"), 2);
});

test("a block whose workspace vanished still answers with a number instead of nothing", () => {
  fresh();
  laySpaces(["leitura"]);
  lay([{ ws: "gone", keys: ["a"], manual: true }]);
  assert.equal(blockNumber(0), 1);
  assert.equal(blockNumber(9), 10);
});

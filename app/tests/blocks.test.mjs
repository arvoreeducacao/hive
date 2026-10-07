import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { moveSeatToBlock, moveToNewBlock, tidy } = await app("blocks");

st.LIMIT = 4;

const lay = (shape) => {
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: st.space, label: "", manual: !!b.manual, keys: [...b.keys] }));
  st.block = 0;
  st.focus = 0;
};

const live = (names) => {
  st.data = { sessions: names.map((n) => ({ name: n, where: "local", state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
};

const beforeTheFleetLands = () => {
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = false;
};

const goTo = (i) => { st.block = i; };

const keysOf = () => st.blocks.map((b) => [...b.keys]);

test("the blocks are left alone until the fleet has answered, so a boot keeps them", () => {
  lay([{ keys: ["a", "b", "c"] }, { keys: ["d", "e"] }]);
  beforeTheFleetLands();
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c"], ["d", "e"]]);
  live(["a", "b", "c", "d", "e"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c"], ["d", "e"]]);
});

test("a block that fits whole into the one before it joins it, and the emptied one goes", () => {
  lay([{ keys: ["a", "b", "c"] }, { keys: ["d"] }]);
  live(["a", "b", "c", "d"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"]]);
});

test("a block that does not fit whole gives up nobody — a slice is never taken", () => {
  lay([{ keys: ["a", "b", "c", "d"] }, { keys: ["e", "f"] }]);
  live(["a", "b", "d", "e", "f"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "d"], ["e", "f"]]);
});

test("two blocks left half empty join, in the order they were in", () => {
  lay([{ keys: ["a", "b", "c", "d"] }, { keys: ["e", "f"] }]);
  live(["a", "b", "e", "f"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "e", "f"]]);
});

test("a block arranged by hand neither joins the one before it nor swallows the next", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d"], manual: true }, { keys: ["e"] }]);
  live(["a", "b", "c", "d", "e"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b"], ["c", "d"], ["e"]]);
});

test("what is left over joins forward one block at a time, never leapfrogging", () => {
  lay([{ keys: ["a"] }, { keys: ["b", "c", "d"] }, { keys: ["e"] }]);
  live(["a", "b", "c", "d", "e"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"], ["e"]]);
});

test("a full block is left alone", () => {
  lay([{ keys: ["a", "b", "c", "d"] }, { keys: ["e", "f"] }]);
  live(["a", "b", "c", "d", "e", "f"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"], ["e", "f"]]);
});

test("a block named by hand neither gives up its chats nor takes others in", () => {
  lay([{ keys: ["a"], manual: true }, { keys: ["b", "c"] }, { keys: ["d"] }]);
  live(["a", "b", "c", "d"]);
  tidy();
  assert.deepEqual(keysOf(), [["a"], ["b", "c", "d"]]);
});

test("a chat nobody placed lands in the block you are looking at, not in the first with room", () => {
  lay([{ keys: ["a", "b", "c"] }, { keys: ["d"] }]);
  live(["a", "b", "c", "d", "e"]);
  goTo(1);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c"], ["d", "e"]]);
});

test("two chats at once fill the block you are on before opening the next", () => {
  lay([{ keys: ["a", "b", "c"] }]);
  live(["a", "b", "c", "d", "e"]);
  goTo(0);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"], ["e"]]);
});

test("a new chat with every block full opens the next one", () => {
  lay([{ keys: ["a", "b", "c", "d"] }]);
  live(["a", "b", "c", "d", "e"]);
  tidy();
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"], ["e"]]);
});

test("the block you are looking at stays the one you are looking at", () => {
  lay([{ keys: ["a", "b", "c", "d"] }, { keys: ["e", "f", "g", "h"] }, { keys: ["i"] }]);
  live(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  goTo(1);
  tidy();
  assert.equal(st.block, 1);
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i"]]);
});

test("a chat dropped on another tab leaves its block and lands in that one", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c"] }]);
  live(["a", "b", "c"]);
  moveSeatToBlock("b", 1);
  assert.deepEqual(keysOf(), [["a"], ["c", "b"]]);
});

test("both blocks turn manual, so tidy does not pull the chat straight back", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c"] }]);
  live(["a", "b", "c"]);
  moveSeatToBlock("b", 1);
  tidy();
  assert.deepEqual(keysOf(), [["a"], ["c", "b"]]);
});

test("a full block refuses the chat instead of dropping it, and leaves it where it was", () => {
  lay([{ keys: ["a"] }, { keys: ["b", "c", "d", "e"] }]);
  live(["a", "b", "c", "d", "e"]);
  moveSeatToBlock("a", 1);
  assert.deepEqual(keysOf(), [["a"], ["b", "c", "d", "e"]]);
});

test("dropping a chat on the tab it already sits in changes nothing", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c"] }]);
  live(["a", "b", "c"]);
  moveSeatToBlock("a", 0);
  assert.deepEqual(keysOf(), [["a", "b"], ["c"]]);
});

test("a chat sent to a block of its own leaves the one it shared", () => {
  lay([{ keys: ["a", "b", "c"] }]);
  live(["a", "b", "c"]);
  moveToNewBlock("b");
  assert.deepEqual(keysOf(), [["a", "c"], ["b"]]);
});

test("the only chat of a block is already alone, so nothing is opened for it", () => {
  lay([{ keys: ["a"] }, { keys: ["b"] }]);
  live(["a", "b"]);
  moveToNewBlock("a");
  assert.deepEqual(keysOf(), [["a"], ["b"]]);
});

test("a job whose seat is already alive shows the seat, even while the server still lists the job, and the open chat follows", () => {
  lay([{ keys: ["a", "job:n2"] }]);
  live(["a", "kimi-tile-probe"]);
  st.data.spawning = [{ id: "n2", name: "kimi-tile-probe", where: "local", step: "opening", mission: "pong", landed: 1, settled: true }];
  st.open = "job:n2";
  tidy();
  assert.deepEqual(keysOf(), [["a", "kimi-tile-probe"]]);
  assert.equal(st.open, "kimi-tile-probe");
  st.open = null;
});

test("a chat being born under a name a live seat still answers to keeps its own card", () => {
  lay([{ keys: ["amigao-me-ajuda-a", "job:n4"] }]);
  live(["amigao-me-ajuda-a"]);
  st.data.spawning = [{ id: "n4", name: "amigao-me-ajuda-a", where: "cloud", step: "starting", mission: "outro pedido", settled: false }];
  st.open = "job:n4";
  tidy();
  assert.deepEqual(keysOf(), [["amigao-me-ajuda-a", "job:n4"]], "the new chat was folded into the seat that already had the name");
  assert.equal(st.open, "job:n4");
  st.open = null;
});

test("a job still in flight, with no seat yet, keeps its card", () => {
  lay([{ keys: ["a", "job:n3"] }]);
  live(["a"]);
  st.data.spawning = [{ id: "n3", name: "", where: "local", step: "naming", mission: "x" }];
  tidy();
  assert.deepEqual(keysOf(), [["a", "job:n3"]]);
});

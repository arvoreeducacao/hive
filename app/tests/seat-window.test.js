import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const grid = await app("blocks");
const { tileViewModel } = await app("seat-menu");
const { mountTileSide } = await import(new URL("../src/views.js", import.meta.url).href);

const asSeatWindow = async (seat, tag) => {
  const real = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { search: `?seat=${seat}` }, configurable: true });
  try { return await import(new URL(`../src/app/blocks.js?${tag}`, import.meta.url).href); }
  finally { Object.defineProperty(globalThis, "location", real); }
};

const solo = await asSeatWindow("c", "solo");
const named = await asSeatWindow("biblion-problemas", "named");

const STORED = ["hive.blocks", "hive.block", "hive.detached", "hive.spaces", "hive.space"];

const lay = (shape) => {
  st.LIMIT = 4;
  st.space = "w0";
  st.spaces = [{ id: "w0", name: "", tint: "#CD694A" }];
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: !!b.manual, keys: [...b.keys] }));
  st.block = 0;
};

const live = (names) => {
  st.data = { sessions: names.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
};

const keysOf = () => st.blocks.map((b) => [...b.keys]);

const fresh = (hive) => {
  for (const key of STORED) localStorage.removeItem(key);
  hive.detached.clear();
  st.open = null;
  st.focus = 0;
};

test("a detached seat leaves the grid, and tidy does not drag it back", () => {
  fresh(grid);
  lay([{ keys: ["a", "b", "c", "d"] }]);
  live(["a", "b", "c", "d"]);
  assert.equal(grid.detachSeat("c"), true);
  assert.deepEqual(keysOf(), [["a", "b", "d"]]);
  grid.tidy();
  assert.deepEqual(keysOf(), [["a", "b", "d"]]);
});

test("closing the window gives the seat back, in the block you are looking at", () => {
  fresh(grid);
  lay([{ keys: ["a", "b", "c"] }, { keys: ["d"], manual: true }]);
  live(["a", "b", "c", "d"]);
  grid.detachSeat("c");
  st.block = 1;
  grid.attachSeat("c");
  grid.tidy();
  assert.deepEqual(keysOf(), [["a", "b"], ["d", "c"]]);
});

test("a seat that died while detached stops being detached, and never comes back", () => {
  fresh(grid);
  lay([{ keys: ["a", "b"] }]);
  live(["a", "b"]);
  grid.detachSeat("b");
  live(["a"]);
  grid.tidy();
  assert.equal(grid.detached.has("b"), false);
  assert.deepEqual(keysOf(), [["a"]]);
});

test("a death while detached reaches the disk, so a namesake seat is not born hidden", () => {
  fresh(grid);
  lay([{ keys: ["a", "b"] }]);
  live(["a", "b"]);
  grid.detachSeat("b");
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.detached")), ["b"]);
  live(["a"]);
  grid.tidy();
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.detached")), []);
});

test("detaching a seat that sits in no block changes nothing", () => {
  fresh(grid);
  lay([{ keys: ["a"] }]);
  assert.equal(grid.detachSeat("zzz"), false);
  assert.equal(grid.detached.has("zzz"), false);
});

test("a window of one seat reads its name from the address", () => {
  assert.equal(named.soloSeat, "biblion-problemas");
  assert.equal(grid.soloSeat, "");
});

test("a window of one seat shows that seat and nothing else, whatever was stored", () => {
  fresh(solo);
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d"] }]);
  live(["a", "b", "c", "d"]);
  solo.tidy();
  assert.deepEqual(keysOf(), [["c"]]);
  assert.equal(st.block, 0);
});

test("a window of one seat shows nothing once its seat is gone", () => {
  fresh(solo);
  live(["a", "b"]);
  solo.tidy();
  assert.deepEqual(keysOf(), [[]]);
});

test("a window of one seat never writes the arrangement the main window owns", () => {
  fresh(solo);
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d"] }]);
  live(["a", "b", "c", "d"]);
  solo.tidy();
  assert.equal(solo.detachSeat("c"), false);
  assert.deepEqual(STORED.filter((key) => localStorage.getItem(key) !== null), []);
});

const withBridge = (bridge, run) => {
  const had = Object.getOwnPropertyDescriptor(globalThis.window, "hiveSeatWindow");
  Object.defineProperty(globalThis.window, "hiveSeatWindow", { value: bridge, configurable: true });
  try { return run(); }
  finally {
    if (had) Object.defineProperty(globalThis.window, "hiveSeatWindow", had);
    else delete globalThis.window.hiveSeatWindow;
  }
};

test("a seat let go outside its own window asks to go back to the grid", () => {
  const asked = [];
  withBridge({ giveBack: (name) => asked.push(name) }, () => {
    assert.equal(solo.canGiveBack(), true);
    assert.equal(solo.giveSeatBack("c"), true);
  });
  assert.deepEqual(asked, ["c"]);
});

test("the window of one seat only ever gives back the seat it holds", () => {
  const asked = [];
  withBridge({ giveBack: (name) => asked.push(name) }, () => {
    assert.equal(solo.giveSeatBack("d"), false);
  });
  assert.deepEqual(asked, []);
});

test("in the main window nothing is given back, because nothing is away in a window", () => {
  const asked = [];
  withBridge({ giveBack: (name) => asked.push(name) }, () => {
    assert.equal(grid.canGiveBack(), false);
    assert.equal(grid.giveSeatBack("c"), false);
  });
  assert.deepEqual(asked, []);
});

test("a hive running in the browser, with no window bridge, gives nothing back", () => {
  withBridge(undefined, () => {
    assert.equal(solo.canGiveBack(), false);
    assert.equal(solo.giveSeatBack("c"), false);
  });
});

const seatInTheHead = () => {
  fresh(grid);
  lay([{ keys: ["c"] }]);
  const one = { name: "c", title: "c", where: "local", state: "idle", when: "2m", trees: [] };
  st.data = { sessions: [one], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
  st.prs = [];
  st.threads = [];
  st.folded = [];
  st.typing = "";
  st.keys = { reconnect: { code: "KeyR" } };
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { one, host };
};

test("the head of a seat in a window of its own carries the button that puts it back", () => {
  const { one, host } = seatInTheHead();
  const model = tileViewModel(one);
  let asked = 0;
  const side = mountTileSide(host, { ...model, tags: { ...model.tags, home: "put this seat back in the grid" } }, { giveBack: () => { asked += 1; } });
  const button = host.querySelector(".t-home");
  assert.ok(button, "no button in the head");
  assert.equal(button.hidden, false);
  assert.equal(button.title, "put this seat back in the grid");
  button.click();
  assert.equal(asked, 1);
  side.dispose();
  host.remove();
});

test("in the main window the head has no button to put the seat back", () => {
  const { one, host } = seatInTheHead();
  const side = mountTileSide(host, tileViewModel(one), {});
  assert.equal(host.querySelector(".t-home").hidden, true);
  side.dispose();
  host.remove();
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const tileView = readFileSync(join(HERE, "src/tile.jsx"), "utf8");

const st = await state();
const { phrase, solidMounts } = await app("core");
const { ask, closeConfirm, placeConfirm } = await app("pod");
const { blockMenuRows, closeSeatMenu, seatMenuRows, tileActions } = await app("seat-menu");

const modal = document.getElementById("confirm");
const card = modal.querySelector(".box");

function fits(width, height) {
  card.getBoundingClientRect = () => ({ width, height, left: 0, top: 0, right: width, bottom: height });
}

function screen(width, height) {
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
}

function place(at, size = [360, 200], viewport = [1440, 900]) {
  fits(...size);
  screen(...viewport);
  placeConfirm(at);
  return { left: card.style.left, top: card.style.top, anchored: modal.classList.contains("at") };
}

const rectAt = (right, bottom) => ({ right, bottom, left: right - 40, top: bottom - 24, width: 40, height: 24 });

function answering(open, say = false) {
  fits(360, 200);
  screen(1440, 900);
  const done = open();
  const seen = {
    who: document.getElementById("c-who").textContent,
    whoShown: !document.getElementById("c-who").hidden,
    text: document.getElementById("c-text").innerHTML,
    anchored: modal.classList.contains("at"),
    left: card.style.left,
    top: card.style.top
  };
  closeConfirm(say);
  return Promise.resolve(done).then(() => seen);
}

const seat = { name: "s1", title: "the reader seat", where: "local", kind: "session", state: "idle" };

test("the confirm hangs under the button that opened it, right edges lined up", () => {
  const at = place(rectAt(816, 126));
  assert.equal(at.left, `${816 - 360}px`);
  assert.equal(at.top, "134px");
  assert.ok(at.anchored);
});

test("a button at the right edge does not push the confirm off screen", () => {
  assert.equal(place(rectAt(1438, 40)).left, `${1440 - 360 - 6}px`);
});

test("a button at the left edge does not push the confirm off screen", () => {
  assert.equal(place(rectAt(40, 40)).left, "6px");
});

test("a button near the floor lifts the confirm instead of cutting it", () => {
  assert.equal(place(rectAt(700, 880)).top, `${900 - 200 - 6}px`);
});

test("no anchor gives the modal back to the middle of the screen", () => {
  place(rectAt(816, 126));
  const loose = place(null);
  assert.equal(loose.left, "");
  assert.equal(loose.top, "");
  assert.ok(!loose.anchored);
});

test("closing the confirm drops the anchor, so the next one is not left hanging", async () => {
  const seen = await answering(() => ask("Close this seat?", "gone for good", "close the seat", { at: rectAt(816, 126) }));
  assert.ok(seen.anchored, "the confirm never hung from the button that opened it");
  assert.ok(!modal.classList.contains("at"), "the anchor outlived the confirm it belonged to");
  assert.equal(card.style.left, "");
  assert.equal(card.style.top, "");
  assert.ok(!modal.classList.contains("on"));
});

test("the answer the person gave is the answer the caller waits for", async () => {
  fits(360, 200);
  const yes = ask("Close this seat?", "gone for good", "close the seat", {});
  closeConfirm(true);
  assert.equal(await yes, true);
  const no = ask("Close this seat?", "gone for good", "close the seat", {});
  closeConfirm(false);
  assert.equal(await no, false);
});

test("every seat that can be closed hands the confirm something to hang from", async () => {
  const fromTheTile = await answering(() => tileActions(seat).close(rectAt(816, 126)));
  assert.ok(fromTheTile.anchored, "the tile's close button dropped the rect on the way");
  assert.equal(fromTheTile.left, `${816 - 360}px`);

  const row = seatMenuRows(seat).find((r) => r.label === phrase("close the seat"));
  assert.ok(row, "the seat menu no longer offers to close the seat");
  const fromTheMenu = await answering(() => row.go(rectAt(700, 300)));
  assert.ok(fromTheMenu.anchored, "the seat menu row dropped the rect on the way");
  assert.equal(fromTheMenu.left, `${700 - 360}px`);

  st.data = { pod: { up: false, name: "" }, sessions: [seat], archived: [], spawning: [] };
  st.blocks = [{ id: "b1", ws: "w1", keys: [seat.name] }];
  st.block = 0;
  const kill = blockMenuRows(0).find((r) => r.danger);
  assert.ok(kill, "the block menu no longer offers to close its seats");
  const fromTheBlock = await answering(() => kill.go(rectAt(500, 200)));
  assert.ok(fromTheBlock.anchored, "the block menu row dropped the rect on the way");
  assert.equal(fromTheBlock.left, `${500 - 360}px`);
});

test("the two close buttons on a tile measure themselves before they ask", () => {
  for (const cls of ["t-close", "b-kill"]) {
    const line = tileView.split("\n").find((l) => l.includes(`class="${cls}"`) || l.includes(`"btn ${cls}"`));
    assert.ok(line, `the tile no longer draws .${cls}`);
  }
  const closers = tileView.match(/props\.actions\.close\(ev\.currentTarget\.getBoundingClientRect\(\)\)/g) || [];
  assert.equal(closers.length, 2, "a close button on the tile asks without saying where it stands");
});

test("the name of what is being closed stands on its own, not inside the sentence", async () => {
  assert.match(page, /<p class="who" id="c-who" hidden><\/p>/);
  const seen = await answering(() => tileActions(seat).close(rectAt(816, 126)));
  assert.equal(seen.who, seat.title);
  assert.ok(seen.whoShown, "the name of the seat had nowhere of its own to stand");
  assert.ok(!seen.text.includes(seat.title), "the name was buried inside the sentence again");
});

test("the menu measures the row before it hides itself — a hidden row has no place", () => {
  const [, options] = mountArgs("mountMenu")[0] || [];
  assert.ok(options && typeof options.pick === "function", "the menu view has nobody to tell when a row is picked");
  const rect = rectAt(816, 126);
  let told = null;
  let onScreenWhenTold = null;
  document.getElementById("seatmenu").classList.add("on");
  st.menuShown = [{ label: "close the seat", go: (at) => { told = at; onScreenWhenTold = document.getElementById("seatmenu").classList.contains("on"); } }];
  options.pick(0, rect);
  assert.equal(told, rect, "the row was never told where it stood");
  assert.equal(onScreenWhenTold, false, "the menu was still on screen when the row ran");
  closeSeatMenu();
});

function mountArgs(which) {
  const grabbed = [];
  const handle = { show() {}, stop() {}, clear() {}, destroy() {} };
  const hive = new Proxy({}, { get: (_, key) => (...args) => { if (key === which) grabbed.push(args); return handle; } });
  for (const mount of solidMounts) { try { mount(hive); } catch {} }
  return grabbed;
}

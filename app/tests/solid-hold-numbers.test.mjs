import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { HOLD_WAIT, KEY_CAPS_WAIT, TUI_TRAY_MAX, dropHold, paintHold, trackHold, tuiAttachImage } = await app("hold-numbers");

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive(seats) {
  const names = Array.from({ length: seats }, (_, i) => `s${i}`);
  st.LIMIT = 12;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: names }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.pending = false;
  st.capturing = null;
  st.typing = null;
  st.tourAt = -1;
  st.leader = null;
  st.chords = {};
  st.keys = { seat: { meta: true, code: "Digit" }, block: { alt: true, code: "Digit" }, space: { meta: true, alt: true, code: "Digit" } };
  dropHold();
  render();
  return names;
}

const wellOf = (name) => tiles.get(name)?.querySelector(".well");

const pause = (ms) => new Promise((again) => setTimeout(again, ms));

test("holding the chat level numbers every tile inside its own well, and the tenth on goes unnumbered", () => {
  const names = hive(10);
  st.holding = "seat";
  paintHold();
  assert.equal(document.body.classList.contains("hold-seat"), true);
  names.forEach((name, i) => {
    const marks = wellOf(name).querySelectorAll(":scope > .t-num");
    assert.equal(marks.length, 1, `${name} has one number, a direct child of the well, so the dimming rule spares it`);
    assert.equal(marks[0].textContent, String(i + 1));
    assert.equal(marks[0].getAttribute("aria-hidden"), "true");
    assert.equal(marks[0].hidden, i >= 9, "only nine digits reach a chat");
  });
  paintHold();
  assert.equal(wellOf("s0").querySelectorAll(".t-num").length, 1, "painting twice keeps one number per well");
  st.holding = null;
  paintHold();
  assert.equal(document.body.classList.contains("hold-seat"), false);
  for (const name of names) assert.equal(wellOf(name).querySelector(".t-num"), null, "letting go takes every number away");
});

test("the block level paints no number over the tiles", () => {
  hive(3);
  st.holding = "block";
  paintHold();
  assert.equal(document.querySelector(".tile .t-num"), null);
  assert.equal(document.body.classList.contains("hold-seat"), false);
  st.holding = null;
  paintHold();
});

test("the long hold puts the numbers up by itself and the release takes them down", async () => {
  hive(3);
  trackHold({ key: "Meta", metaKey: true, altKey: false, ctrlKey: false, shiftKey: false });
  await pause(HOLD_WAIT + 120);
  assert.equal(wellOf("s2").querySelector(":scope > .t-num")?.textContent, "3");
  dropHold();
  assert.equal(document.querySelector(".tile .t-num"), null);
});

test("the key caps come up on the body after the short wait and leave with the modifier", async () => {
  hive(2);
  trackHold({ key: "Alt", altKey: true, metaKey: false, ctrlKey: false, shiftKey: false });
  assert.equal(document.body.classList.contains("key-caps"), false);
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(document.body.classList.contains("key-caps"), true);
  dropHold();
  assert.equal(document.body.classList.contains("key-caps"), false);
});

function terminal() {
  const host = document.createElement("div");
  host.className = "host";
  document.body.append(host);
  return { host, where: "local", name: "a seat", term: { cols: 80, rows: 24 } };
}

test("a pasted picture lands as a chip in the terminal's strip, which lifts the terminal to make room", () => {
  const e = terminal();
  tuiAttachImage(e, "/tmp/shots/one.png");
  const tray = e.host.querySelector(":scope > .tui-attach");
  assert.ok(tray, "the strip is a child of the terminal host");
  assert.equal(tray.classList.contains("on"), true);
  assert.equal(e.host.style.bottom, "60px");
  const img = tray.querySelector(".att img");
  assert.equal(img.getAttribute("src"), "/api/image?path=%2Ftmp%2Fshots%2Fone.png&where=local&name=a%20seat");
  assert.equal(img.alt, "one.png");
  assert.equal(img.title, "one.png — click to see it big");
  const drop = tray.querySelector(".att .ax");
  assert.equal(drop.type, "button");
  assert.equal(drop.title, "put the strip away — the image stays in the chat");
  assert.equal(drop.textContent, "×");
  e.host.remove();
});

test("the strip keeps the last eight pictures, and putting the last one away lowers it again", () => {
  const e = terminal();
  for (let i = 0; i < TUI_TRAY_MAX + 2; i += 1) tuiAttachImage(e, `/tmp/shots/${i}.png`);
  const tray = e.host.querySelector(".tui-attach");
  const alts = [...tray.querySelectorAll(".att img")].map((img) => img.alt);
  assert.deepEqual(alts, Array.from({ length: TUI_TRAY_MAX }, (_, i) => `${i + 2}.png`), "the oldest leave first");
  tray.querySelector(".att .ax").click();
  assert.equal(tray.querySelectorAll(".att").length, TUI_TRAY_MAX - 1);
  assert.equal(tray.querySelector(".att img").alt, "3.png");
  while (tray.querySelector(".att .ax")) tray.querySelector(".att .ax").click();
  assert.equal(e.host.querySelectorAll(".tui-attach").length, 1, "the strip stays, empty");
  assert.equal(tray.classList.contains("on"), false);
  assert.equal(e.host.style.bottom, "");
  e.host.remove();
});

test("clicking a chip opens the picture big", () => {
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  const e = terminal();
  tuiAttachImage(e, "/tmp/shots/big.png");
  e.host.querySelector(".tui-attach .att img").click();
  assert.equal($("shot-name").textContent, "/tmp/shots/big.png");
  e.host.remove();
  globalThis.fetch = was;
});

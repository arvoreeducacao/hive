import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app } from "./dom.mjs";

const { openSeatPicker, pickerFit } = await app("chat-and-panes");
const markup = readFileSync(new URL("../app.html", import.meta.url), "utf8");

const box = (top, height) => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top });

function seat({ top, height, barTop, barHeight }) {
  const host = document.createElement("div");
  host.className = "sv";
  host.dataset.fitTest = "1";
  host.innerHTML = `<div class="sv-composer"><span class="sv-pill sv-pill-model"></span><textarea></textarea></div>`;
  const composer = host.querySelector(".sv-composer");
  host.getBoundingClientRect = () => box(top, height);
  composer.getBoundingClientRect = () => box(barTop, barHeight);
  document.body.appendChild(host);
  return { name: `fit-${barTop}`, host, catalog: [{ value: "opus", label: "Opus", group: "" }] };
}

function clear() {
  for (const stray of document.querySelectorAll("[data-fit-test], .sv-menu")) stray.remove();
}

test("the menu is never taller than the room the seat has above the composer", () => {
  const { tall, over } = pickerFit(box(293, 497), box(545, 230));
  assert.equal(tall, 238, "a ceiling read off the window puts the first rows above the tile, where nothing can scroll them back");
  assert.equal(over, 0);
});

test("a roomy seat still stops at the look's own ceiling", () => {
  assert.deepEqual(pickerFit(box(0, 1200), box(900, 200)), { tall: 384, over: 0 });
});

test("a short seat hangs the menu over the composer instead of off the top", () => {
  const { tall, over } = pickerFit(box(0, 200), box(120, 70));
  assert.equal(tall, 132);
  assert.equal(over, 26, "what does not fit above the composer has to come down over it — above the seat it is simply gone");
});

test("a seat too short even for the floor gives the menu everything it has", () => {
  const { tall, over } = pickerFit(box(0, 100), box(60, 36));
  assert.equal(tall, 86);
  assert.ok(tall <= 100, "the menu cannot be taller than the seat that clips it");
  assert.equal(over, 40);
});

test("opening the picker in a small seat caps the menu on the spot", () => {
  clear();
  const e = seat({ top: 293, height: 497, barTop: 545, barHeight: 230 });
  openSeatPicker(e, "model");
  assert.equal(e.menu.el.style.maxHeight, "238px");
  assert.equal(e.menu.el.style.bottom, "");
  clear();
});

test("a seat the app cannot measure keeps the height the look gives it", () => {
  clear();
  const e = seat({ top: 0, height: 0, barTop: 0, barHeight: 0 });
  openSeatPicker(e, "model");
  assert.equal(e.menu.el.style.maxHeight, "", "a zero rect is a seat that is not on screen, not a seat with no room");
  clear();
});

test("the look no longer measures the menu against the window", () => {
  const rule = markup.split("\n").find((line) => line.includes(".sv-menu { position: absolute;"));
  assert.ok(rule, "the .sv-menu rule moved — the ceiling below has to move with it");
  assert.doesNotMatch(rule, /vh/, "the window is not the seat: on a small pane a vh ceiling is taller than the tile that clips it");
});

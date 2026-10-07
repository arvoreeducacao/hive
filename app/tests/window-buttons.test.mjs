import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const text = readFileSync(join(HERE, "src/app/preferences.js"), "utf8");
const a = text.indexOf("const WINDOW_BUTTON_SIZE");
const b = text.indexOf("function placeWindowButtons", a);
assert.ok(a >= 0 && b > a, "could not cut windowButtonsSpot out of preferences.js");
const windowButtonsSpot = new Function(`${text.slice(a, b)}\nreturn windowButtonsSpot;`)();

const pill = { left: 16, top: 12, height: 40 };

test("in the dimension look the buttons sit inside the floating bar, centred on its height", () => {
  assert.deepEqual(windowButtonsSpot("dimension", pill), { x: 28, y: 26 });
});

test("the classic look hands the buttons back to the window default", () => {
  assert.equal(windowButtonsSpot("classic", pill), null);
});

test("a bar that has not been laid out yet is not a place to put the buttons", () => {
  assert.equal(windowButtonsSpot("dimension", undefined), null);
  assert.equal(windowButtonsSpot("dimension", { left: 16, top: 12, height: 0 }), null);
});

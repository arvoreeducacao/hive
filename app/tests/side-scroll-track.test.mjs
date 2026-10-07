import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(HERE, "assets", "experience.css"), "utf8");
const seatMenu = readFileSync(join(HERE, "src", "app", "seat-menu.js"), "utf8");

test("in full screen the scroll bar of the side starts below the header that stays put", () => {
  assert.match(css, /body\.experience-next \.tile\.open \.side::-webkit-scrollbar-track \{ margin-top: calc\(var\(--t-head-h, 49px\) \+ var\(--t-state-h, 22px\) \+ var\(--t-chips-h, 0px\)\); \}/);
});

test("the side measures every piece of the header that stays put, the chips included", () => {
  assert.match(seatMenu, /const HEADER_HEIGHTS = \{ "t-head": "--t-head-h", "t-state": "--t-state-h", "t-chips": "--t-chips-h" \};/);
  assert.match(seatMenu, /side\.querySelectorAll\(":scope > :is\(\.t-head, \.t-state, \.t-chips\)"\)/);
});

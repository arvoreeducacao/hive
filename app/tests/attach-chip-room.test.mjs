import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = a < 0 ? -1 : text.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const rule = (selector) => cut(page, `  ${selector} {`, "}\n", "app.html");

test("the image chip of a sent message gives up room instead of spilling out of the bubble", () => {
  const chip = rule(".sv-user .uatt");
  assert.match(chip, /max-width: 100%/, "a chip wider than the bubble is what pushed the thumbnail out of it");
  assert.match(chip, /min-width: 0/, "without this the chip refuses to shrink below its contents");
  assert.match(chip, /overflow: hidden/);
  assert.match(rule(".sv-user .uatts"), /max-width: 100%/);
  const shot = rule(".sv-user .uatt img");
  assert.match(shot, /max-width: \d+px/);
  assert.match(shot, /flex: 0 1 auto/);
  assert.match(rule(".sv-user .uatt .an"), /min-width: 0/, "the file name yields its room before the thumbnail does");
});

test("a panoramic screenshot on the tray is cropped to a chip, not stretched across the seat", () => {
  const shot = rule(".sv-attach .att img");
  assert.match(shot, /max-width: \d+px/, "height alone lets a wide image draw a chip as long as the picture");
  assert.match(shot, /object-fit: cover/, "a clamp without this squashes the picture");
  const chip = rule(".sv-attach .att");
  assert.match(chip, /max-width: 100%/);
  assert.match(chip, /min-width: 0/);
  const tui = rule(".tui-attach .att img");
  assert.match(tui, /max-width: \d+px/);
  assert.match(tui, /object-fit: cover/);
});

test("in the new hive the close icon of a chip sits in the middle of its hover square", () => {
  const next = readFileSync(join(HERE, "assets", "experience.css"), "utf8");
  const line = (selector) => next.split("\n").find((one) => one.startsWith(`${selector} {`)) || "";
  assert.match(line("body.experience-next .sv-attach .att button.ax"), /position: relative/);
  const icon = line("body.experience-next .sv-attach .att button.ax::before");
  assert.match(icon, /position: absolute; inset: 0; margin: auto;/, "the hidden × still takes a grid row and pushed the icon 2px above the hover square's middle");
});

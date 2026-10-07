import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(APP, "app.html"), "utf8");

const ruleOf = (selector) => {
  const found = new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} \\{([^}]*)\\}`, "m").exec(page);
  assert.ok(found, `app.html no longer has a rule for ${selector}`);
  return found[1];
};

const radiusOf = (selector) => {
  const found = /border-radius:\s*([^;]+);/.exec(ruleOf(selector));
  return found ? found[1].trim() : "";
};

const BOXES = [".t-art", ".t-pr, .t-slack", ".t-chips .c, .t-where .c", ".t-shot", ".btn"];

test("every box stacked inside a seat tile rounds on the same token", () => {
  for (const selector of BOXES) {
    assert.equal(radiusOf(selector), "var(--r1)", `${selector} rounds off the scale`);
  }
});

test("the tile itself rounds one step wider than the boxes it holds", () => {
  assert.equal(radiusOf(".tile"), "var(--r2)");
});

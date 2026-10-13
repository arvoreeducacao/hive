import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "experience.css"), "utf8");

test("in the new hive the memory chip wears the memory glyph instead of a plain dot", () => {
  const rule = css.split("\n").find((line) => line.startsWith("body.experience-next :is(.t-chips, .t-hchips) .c.memory .mdot {")) || "";
  assert.match(rule, /mask: var\(--px-memory\) center \/ 12px 12px no-repeat;/, "the same glyph as the memory rows in the chat");
  assert.match(rule, /border-radius: 0;/, "the glyph is not clipped round");
  assert.doesNotMatch(rule, /background/, "the state keeps painting it: grey, green when on, orange to sign in, yellow when limited");
});

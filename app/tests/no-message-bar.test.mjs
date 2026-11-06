import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(app, path), "utf8");

test("no look has a message bar under the canvas", () => {
  const page = read("app.html");
  for (const id of ["composer", "cmp-in", "cmp-controls", "btn-bar", "mission-scrim"]) {
    assert.doesNotMatch(page, new RegExp(`id="${id}"`), `#${id} is gone from the page`);
  }
  assert.match(page, /#stage \{ display: grid; grid-template-rows: auto minmax\(0, 1fr\);/, "the canvas takes the row the bar used");
});

test("a new chat starts only from the draft", () => {
  const keys = read("src/app/themes.js");
  assert.match(keys, /case "new": return openDraft\(\);/, "the new chat key opens a draft");
  assert.doesNotMatch(keys, /case "(compose|bar)":/, "the bar's keys are gone");
  assert.match(read("src/app/palette.js"), /go: \(\) => openDraft\(`\$\{i\.identifier\} `\)/, "a Linear issue opens a draft with its id");
  assert.match(read("src/app/core.js"), /const RETIRED_ACTIONS = \[[^\]]*"compose", "bar"\]/, "a saved key for the bar is skipped, not reported");
});

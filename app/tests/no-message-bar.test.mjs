import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(app, path), "utf8");

test("the new hive has no message bar under the canvas", () => {
  const css = read("assets/experience.css");
  assert.match(css, /body\.experience-next :is\(#composer, #btn-bar\) \{ display: none !important; \}/, "the bar and its toggle are gone");
  assert.match(css, /body\.experience-next #stage \{ grid-template-rows: minmax\(0, 1fr\); \}/, "the canvas takes the row the bar used");
});

test("in the new hive a new chat starts only from the draft", () => {
  assert.match(read("src/app/seat-layout.js"), /if \(st\.barOn && !experienceNext\(\) && !t && !booting && !st\.missionMode && empty\) setMission\(true\);/, "an empty canvas does not open the bar's mission");
  const keys = read("src/app/themes.js");
  assert.match(keys, /case "new": return openDraft\(\);/, "the new chat key opens a draft");
  assert.match(keys, /case "compose": return experienceNext\(\) \? undefined : openComposer\(\);/, "the compose key does nothing");
  assert.match(keys, /case "bar": return experienceNext\(\) \? undefined : setPref\("bar", !st\.barOn\);/, "the bar key does nothing");
  const palette = read("src/app/palette.js");
  assert.match(palette, /experienceNext\(\) \? openDraft\(`\$\{i\.identifier\} `\) : openMission\(`\$\{i\.identifier\} `\)/, "a Linear issue opens a draft with its id");
  assert.match(read("src/app/leader-key.js"), /const BAR_ACTIONS = new Set\(\["compose", "bar"\]\);/, "the shortcut list hides the bar's keys");
});

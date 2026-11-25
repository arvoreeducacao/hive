import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../assets/side-panel.css", import.meta.url), "utf8");

test("every side panel rule that dresses the Raycast look also dresses the Novo Hive", () => {
  const raycastOnly = css.split("\n").filter(line => /body\.experience-raycast\b/.test(line));
  assert.deepEqual(raycastOnly, []);
  assert.match(css, /body:is\(\.experience-raycast, \.experience-next\) \.tx-cf-btn \.tx-i \{ width: 12px; height: 12px; \}/);
  assert.match(css, /body:is\(\.experience-raycast, \.experience-next\) \.tx-cf-row \.tx-i \{[^}]*width: 14px; height: 14px;/);
});

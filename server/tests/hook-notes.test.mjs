import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookFate } from "../engine/protocol.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const driver = readFileSync(join(HERE, "../engine/driver.mjs"), "utf8");

const hook = (hook_event, subtype = "hook_response") => ({ type: "system", subtype, hook_id: "h1", hook_name: `${hook_event}:x`, hook_event, stdout: "{}", stderr: "", output: "", outcome: "success" });

test("the driver asks the sdk for every hook event and drops the ones nobody reads", () => {
  assert.match(driver, /includeHookEvents: true/);
  assert.match(driver, /if \(!hookFate\(message\)\.shown\) continue;/);
});

test("hooks other than SessionStart and Setup stay out of the chat", () => {
  for (const subtype of ["hook_started", "hook_progress", "hook_response"]) {
    assert.equal(hookFate(hook("PostToolUse", subtype)).shown, false, subtype);
    assert.equal(hookFate(hook("UserPromptSubmit", subtype)).shown, false, subtype);
  }
  assert.equal(hookFate(hook("SessionStart")).shown, true);
  assert.equal(hookFate(hook("Setup", "hook_started")).shown, true);
  assert.deepEqual(hookFate({ type: "assistant", message: { content: [] } }), { shown: true });
  assert.deepEqual(hookFate({ type: "system", subtype: "init" }), { shown: true });
});

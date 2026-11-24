import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TOOL_OUTPUT_CAP, createSessions, toolOutputIn, toolOutputOf } from "../sessions.mjs";

test("the whole output of a call is what the sdk kept beside the preview, or its stdout and stderr", () => {
  assert.deepEqual(toolOutputOf({ stdout: "ok", stderr: "aviso" }), { ok: true, output: "ok\naviso", cut: false, whole: true });
  const kept = toolOutputOf({ stdout: "prévia", persistedOutputPath: "/h/.claude/projects/p/s/tool-results/x.txt" }, () => "tudo");
  assert.deepEqual(kept, { ok: true, output: "tudo", cut: false, whole: true });
  const gone = toolOutputOf({ stdout: "prévia", persistedOutputPath: "/h/.claude/projects/p/s/tool-results/x.txt" }, () => { throw new Error("no file"); });
  assert.deepEqual(gone, { ok: true, output: "prévia", cut: false, whole: false }, "a file gone falls back to what the event held, and says so");
  let asked = "";
  toolOutputOf({ stdout: "x", persistedOutputPath: "/etc/passwd" }, (path) => { asked = path; return "segredo"; });
  assert.equal(asked, "", "only the sdk's own tool-results files are read");
  const long = toolOutputOf({ stdout: `${"a".repeat(TOOL_OUTPUT_CAP)}fim` });
  assert.equal(long.cut, true);
  assert.ok(long.output.endsWith("fim"), "the end of a long output is what stays");
});

test("a seat answers the output of one call by its id, from the latest event that carried it", () => {
  const base = mkdtempSync(join(tmpdir(), "hive-tool-output-"));
  try {
    mkdirSync(join(base, "events"), { recursive: true });
    const lines = [
      { seq: 1, type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_a", content: "<persisted-output>…" }] }, tool_use_result: { stdout: "saída inteira de a" } },
      { seq: 2, type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_b", content: "b" }] }, tool_use_result: { stdout: "b", stderr: "erro de b" } }
    ];
    writeFileSync(join(base, "events", "um.ndjson"), lines.map((one) => JSON.stringify(one)).join("\n") + "\n");
    assert.equal(toolOutputIn(join(base, "events", "um.ndjson"), "toolu_a").output, "saída inteira de a");
    const sessions = createSessions({ base, driver: "/nowhere", windows: false });
    assert.equal(sessions.toolOutput("um", "toolu_b").output, "b\nerro de b");
    assert.match(sessions.toolOutput("um", "toolu_z").error, /no output/);
    assert.match(sessions.toolOutput("um", "../x").error, /tool call id/);
    assert.match(sessions.toolOutput("outro", "toolu_a").error, /no history/);
    sessions.stop();
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

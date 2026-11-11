import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, createScopeJudge, judgeArgs, readVerdicts } from "../lib/memory-judge.mjs";

test("the judge runs claude headless, with no tools, no MCP, no settings and a schema", () => {
  const args = judgeArgs();
  for (const flag of ["-p", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.equal(args[args.indexOf("--output-format") + 1], "json");
  assert.deepEqual(JSON.parse(args[args.indexOf("--json-schema") + 1]).properties.verdicts.items.properties.scope.enum, ["team", "personal"]);
});

test("the verdicts come from structured_output, only for the ids asked and only with a known scope", () => {
  const out = JSON.stringify({ structured_output: { verdicts: [
    { id: "p/a.md", scope: "team", reason: "sistema" },
    { id: "p/a.md", scope: "personal", reason: "repetida" },
    { id: "p/b.md", scope: "everyone", reason: "?" },
    { id: "p/z.md", scope: "team", reason: "não foi pedida" }
  ] } });
  assert.deepEqual(readVerdicts(out, ["p/a.md", "p/b.md"]), { verdicts: [{ id: "p/a.md", scope: "team", reason: "sistema" }] });
  assert.match(readVerdicts(JSON.stringify({ is_error: true, result: "limite" }), []).error, /limite/);
  assert.ok(readVerdicts("not json", []).error);
});

test("a big folder is judged in batches, and one failed batch does not lose the others", async () => {
  const memories = Array.from({ length: 85 }, (_, at) => ({ id: `p/${at}.md`, name: `m${at}`, description: "", body: "" }));
  assert.deepEqual(batches(memories).map((one) => one.length), [40, 40, 5]);
  let running = 0;
  let most = 0;
  const judge = createScopeJudge({ lanes: 2, run: async (args, prompt) => {
    running++;
    most = Math.max(most, running);
    await new Promise((done) => setTimeout(done, 5));
    running--;
    if (prompt.includes("## id: p/40.md")) return { ok: false, out: "", error: "timeout" };
    const ids = [...prompt.matchAll(/^## id: (.+)$/gm)].map((one) => one[1]);
    return { ok: true, out: JSON.stringify({ structured_output: { verdicts: ids.map((id) => ({ id, scope: "personal", reason: "" })) } }) };
  } });
  const said = await judge(memories);
  assert.equal(said.verdicts.length, 45);
  assert.deepEqual(said.failures, ["timeout"]);
  assert.equal(most, 2, "two batches run at once, never more");
});

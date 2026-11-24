import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hiveDoor, prTool } from "../peer/peer.mjs";
import { PEER_TOOLS, TOOL_ACCESS, peerCalls, toolsFor } from "../peer/peer-tools.mjs";
import { writeCeiling } from "../peer/ceilings.mjs";

const PR_TOOLS = ["pull_request_read", "pull_request_list", "pull_request_create", "pull_request_update", "pull_request_respond", "pull_request_merge", "ci_logs", "ci_rerun"];

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-pr-tools-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "seat.json"), JSON.stringify({ session_id: "s1", cwd: "/w/repo" }));
  return base;
}

async function fakeApp(base, answer) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      const asked = body ? JSON.parse(body) : null;
      seen.push({ path: req.url, body: asked });
      const said = answer(asked);
      res.statusCode = said.error ? 400 : 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(said));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "seat", HIVE_STATE_DIR: base });
const said = (reply) => reply.content.map((one) => one.text).join("\n");

test("the eight PR and CI tools are the hive's own, with the reference names and their guarantees in the schema", () => {
  const names = PEER_TOOLS.map((tool) => tool.name).filter((name) => PR_TOOLS.includes(name));
  assert.deepEqual(names, PR_TOOLS);
  const schema = (name) => PEER_TOOLS.find((tool) => tool.name === name).inputSchema;
  assert.deepEqual(schema("pull_request_merge").required, ["expectedHeadSha"]);
  assert.match(PEER_TOOLS.find((tool) => tool.name === "pull_request_merge").description, /Refuses if the head moved from expectedHeadSha/);
  assert.equal("admin" in schema("pull_request_merge").properties, false, "nothing in the tool can ask for an admin merge");
  assert.deepEqual(schema("pull_request_read").properties.include.items.enum, ["body", "checks", "threads", "comments", "diff"]);
  assert.deepEqual([schema("ci_logs").properties.tailLines.minimum, schema("ci_logs").properties.tailLines.maximum], [1, 2000]);
  assert.match(schema("ci_logs").properties.tailLines.description, /Default: 200/);
  assert.deepEqual(schema("pull_request_create").required, ["title", "body"]);
  assert.deepEqual(schema("pull_request_list").properties.state.enum, ["all", "open", "closed", "merged"]);
  for (const name of PR_TOOLS) assert.equal(schema(name).additionalProperties, false, `${name} takes only what it declares`);
});

test("reading is open at the read ceiling, acting needs operate, and merging needs full", async () => {
  assert.deepEqual(PR_TOOLS.map((name) => TOOL_ACCESS[name]), ["read", "read", "operate", "operate", "operate", "full", "read", "operate"]);
  const read = toolsFor("read").map((tool) => tool.name);
  assert.ok(read.includes("pull_request_read") && read.includes("pull_request_list") && read.includes("ci_logs"));
  assert.ok(!read.includes("ci_rerun") && !read.includes("pull_request_create"));
  const operate = toolsFor("operate").map((tool) => tool.name);
  assert.ok(operate.includes("ci_rerun") && operate.includes("pull_request_respond"));
  assert.ok(!operate.includes("pull_request_merge"));
  const base = await hive();
  try {
    writeCeiling(base, "seat", "operate");
    const refused = await peerCalls(envOf(base)).pull_request_merge({ expectedHeadSha: "abc1234" });
    assert.equal(refused.isError, true);
    assert.match(said(refused), /"operate" ceiling, and pull_request_merge needs "full"/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a PR tool asks the hive on this machine, naming the chat, and hands the agent the answer as JSON", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, (asked) => ({ ok: true, result: { host: "github.com", repository: "o/r", number: 12, url: "https://github.com/o/r/pull/12", state: "merged", tool: asked.tool } }));
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  const reply = await peerCalls(envOf(base)).pull_request_merge({ expectedHeadSha: "abc1234", method: "squash" });
  assert.equal(reply.isError, undefined);
  assert.deepEqual(JSON.parse(said(reply)), { host: "github.com", repository: "o/r", number: 12, url: "https://github.com/o/r/pull/12", state: "merged", tool: "pull_request_merge" });
  assert.deepEqual(app.seen, [{ path: "/api/prs/tool", body: { name: "seat", where: "local", tool: "pull_request_merge", args: { expectedHeadSha: "abc1234", method: "squash" } } }]);
});

test("the hive's refusal reaches the agent in its own words, and a chat with no seat or no app is told why", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, () => ({ error: "The head moved: it is def5678 now, not abc1234." }));
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  const reply = await peerCalls(envOf(base)).ci_rerun({});
  assert.equal(reply.isError, true);
  assert.equal(said(reply), "The head moved: it is def5678 now, not abc1234.");
  assert.match((await prTool({ tool: "ci_logs", env: { HIVE_STATE_DIR: base } })).error, /no seat/);
  const empty = await hive();
  try {
    assert.match((await prTool({ tool: "ci_logs", env: envOf(empty) })).error, /no hive answering on this machine/);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("the app's PR tool route asks for the same access as the MCP tool list", async () => {
  const { TOOL_ACCESS } = await import("../peer/peer-tools.mjs");
  const { PR_TOOL_NEEDS } = await import("../../app/lib/pr-tools.mjs");
  for (const [tool, need] of Object.entries(PR_TOOL_NEEDS)) assert.equal(TOOL_ACCESS[tool], need, tool);
  const mcpPrTools = Object.keys(TOOL_ACCESS).filter((tool) => tool.startsWith("pull_request_") || tool.startsWith("ci_"));
  assert.deepEqual(mcpPrTools.sort(), Object.keys(PR_TOOL_NEEDS).sort());
});

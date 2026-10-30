import { test } from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BINARY, STOP_SIGNAL, LOGIN_HINT, OWN_MCP, turnArgs, translate, finishTurn, toolCard, mcpConfig, writeSeatHome, seatHome,
  parseAgyModels, parseAgyMcpList, antigravityIdentity, needsLogin, loginTrouble,
} from "../engine/antigravity-stream.mjs";
import { agents, newTurnContext } from "../engine/agents.mjs";
import { agentOf, driverFileFor } from "../sessions.mjs";
import { oneLoginOnly, providerRanDry } from "../engine/providers.mjs";
import { seatArgv } from "../engine/seat-command.mjs";

const C = "685bad9f-1bd2-4ffd-949d-f16dd48d7703";
const step = (s) => ({ event: "step_update", step_update: { conversation_id: C, ...s } });
const feed = (ctx, events) => events.flatMap((ev) => translate(ev, ctx));
const cards = (out) => out.filter((e) => e.type !== "stream_event");

const A_TURN = [
  { event: "init", conversation_id: C, init: { cwd: "/w", tools: ["run_command", "read_file", "call_mcp_tool"], permission_mode: "always-proceed" } },
  step({ step_index: 0, state: "DONE", step_type: "user_input" }),
  step({ step_index: 1, state: "DONE", step_type: "agent_response", usage: { input_tokens: 6873, output_tokens: 104, total_tokens: 6977 } }),
  step({ step_index: 2, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "ls -la" } } }),
  step({ step_index: 2, state: "DONE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "ls -la" }, output: "Command exited with code 0.\n\nnote.txt\r\n" } }),
  step({ step_index: 3, state: "ACTIVE", step_type: "tool", tool_name: "read_file", tool_info: { name: "read_file", parameters: { Path: "/w/note.txt" } } }),
  step({ step_index: 3, state: "DONE", step_type: "tool", tool_name: "read_file", tool_info: { name: "read_file", parameters: { Path: "/w/note.txt" }, output: "1 lines, 21 bytes" } }),
  step({ step_index: 4, state: "ACTIVE", step_type: "agent_response", text_delta: "The note says" }),
  step({ step_index: 4, state: "DONE", step_type: "agent_response", text_delta: " hello.\n" }),
  { event: "result", result: { conversation_id: C, status: "SUCCESS", response: "The note says hello.\n", num_turns: 1, usage: { input_tokens: 21478, output_tokens: 495, thinking_tokens: 280, cache_read_tokens: 12, total_tokens: 21973 } } },
];

test("antigravity: a turn is one headless agy run that never stops for a tool and resumes by conversation", () => {
  assert.equal(BINARY, "agy");
  assert.deepEqual(turnArgs({ text: "hi" }), ["-p", "hi", "--output-format", "stream-json", "--dangerously-skip-permissions", "--print-timeout", "0s"]);
  assert.deepEqual(turnArgs({ text: "hi", model: "gemini-3.8-flash-high", effort: "low", sessionId: C }).slice(7), ["--model", "gemini-3.8-flash-high", "--conversation", C], "agy refuses --effort on these models: the level is part of the model id");
});

test("antigravity: text streams as it comes and lands once per step, and each tool opens as a card and closes with its output", () => {
  const ctx = newTurnContext();
  const out = feed(ctx, A_TURN);
  assert.equal(ctx.sessionId, C);
  assert.equal(out.filter((e) => e.type === "stream_event").length, 2);
  const shown = cards(out);
  assert.deepEqual(shown.map((e) => e.type === "assistant" ? e.message.content[0].type : e.message.content[0].type), ["tool_use", "tool_result", "tool_use", "tool_result", "text"]);
  assert.deepEqual(shown[0].message.content[0], { type: "tool_use", id: `${C}:2`, name: "shell", input: { command: "ls -la" } });
  assert.match(shown[1].message.content[0].content, /note\.txt/);
  assert.deepEqual(shown[2].message.content[0].input, { file_path: "/w/note.txt" });
  assert.equal(shown[4].message.content[0].text, "The note says hello.\n");
  assert.deepEqual(ctx.usage, { input_tokens: 21478, output_tokens: 495, cache_read_input_tokens: 12 });
  assert.deepEqual(finishTurn(ctx, false), [], "nothing is left to flush once the result came");
});

test("antigravity: an mcp call reads as the server's own tool, and a tool seen only when it finished still gets its card", () => {
  assert.deepEqual(toolCard("call_mcp_tool", { ServerName: "hive", ToolName: "peers", Arguments: { scope: "all" } }), { name: "mcp__hive__peers", input: { scope: "all" } });
  assert.deepEqual(toolCard("grep_search", { Query: "TODO", SearchPath: "/w" }), { name: "search", input: { description: "TODO" } });
  assert.deepEqual(toolCard("browser_get_dom", {}), { name: "browser_get_dom", input: { description: "browser_get_dom" } });
  const ctx = newTurnContext();
  const out = cards(feed(ctx, [step({ step_index: 7, state: "DONE", step_type: "tool", tool_name: "write_to_file", tool_info: { name: "write_to_file", parameters: { TargetFile: "/w/a.md" }, output: "ok" } })]));
  assert.deepEqual(out.map((e) => e.message.content[0].type), ["tool_use", "tool_result"]);
  assert.deepEqual(out[0].message.content[0], { type: "tool_use", id: `${C}:7`, name: "write", input: { file_path: "/w/a.md" } });
});

test("antigravity: a stopped turn closes its open card without a warning, and a refused one says to sign in", () => {
  const stopped = newTurnContext();
  feed(stopped, [step({ step_index: 2, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "sleep 30" } } })]);
  const end = feed(stopped, [{ event: "result", result: { conversation_id: C, status: "ERROR", response: "", error: "interrupted", num_turns: 1 } }]);
  assert.deepEqual(end.map((e) => e.type), ["user"]);
  assert.equal(end[0].message.content[0].is_error, true);
  const killed = newTurnContext();
  feed(killed, [step({ step_index: 1, state: "ACTIVE", step_type: "agent_response", text_delta: "half" })]);
  assert.equal(finishTurn(killed, true)[0].message.content[0].text, "half", "text already streamed is kept when the process dies");
  const refused = feed(newTurnContext(), [{ event: "result", result: { conversation_id: C, status: "ERROR", error: "error getting token source: You are not logged into Antigravity." } }]);
  assert.equal(refused.at(-1).subtype, "warning");
  assert.match(refused.at(-1).message, /^nobody is signed in to Antigravity/);
  assert.ok(needsLogin("Error: Please sign in to view available models. Launch the CLI without arguments to sign in."));
  assert.equal(loginTrouble("the model api answered 503"), "the model api answered 503");
  assert.match(LOGIN_HINT, /run `agy` in a terminal/);
});

test("antigravity: the seat's mcp servers go in a home of its own, mirrored from the person's, so commands still run in the chat's folder", () => {
  const config = mcpConfig({ seat: "one", base: "/s", peerMcp: "/hive/peer.mjs", gateway: { port: 4671, hub: true }, remote: [{ name: "figma", url: "https://f/mcp", headers: { Authorization: "Bearer ${FIGMA}" } }], env: { HIVE_MCP_GATEWAY_TOKEN: "t", FIGMA: "k" } });
  assert.deepEqual(config.mcpServers.hive, { command: process.execPath, args: ["/hive/peer.mjs"], env: { HIVE_SEAT: "one", HIVE_STATE_DIR: "/s" } });
  const gateway = Object.entries(config.mcpServers).find(([name]) => name !== "hive" && name !== "figma")[1];
  assert.match(gateway.serverUrl, /^http:\/\/127\.0\.0\.1:4671\//);
  assert.deepEqual(gateway.headers, { Authorization: "Bearer t" });
  assert.deepEqual(config.mcpServers.figma, { serverUrl: "https://f/mcp", headers: { Authorization: "Bearer k" } });
  const root = mkdtempSync(join(tmpdir(), "agy-seat-"));
  try {
    const home = join(root, "person");
    mkdirSync(join(home, ".gemini", "config"), { recursive: true });
    writeFileSync(join(home, ".gitconfig"), "[user]\n");
    const theirs = JSON.stringify({ mcpServers: { mine: { command: "mine" } } });
    writeFileSync(join(home, OWN_MCP), theirs);
    const base = join(root, "state");
    const dir = writeSeatHome({ seat: "one", base, home, peerMcp: "/hive/peer.mjs" });
    assert.equal(dir, seatHome(base, "one"));
    assert.equal(readlinkSync(join(dir, ".gitconfig")), join(home, ".gitconfig"), "git, ssh and the rest of the home stay the person's own files");
    assert.ok(!lstatSync(join(dir, OWN_MCP)).isSymbolicLink());
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, OWN_MCP), "utf8")).mcpServers), ["mine", "hive"], "the person's own servers ride along");
    assert.equal(statSync(join(dir, OWN_MCP)).mode & 0o777, 0o600, "the gateway token stays the person's");
    assert.equal(readFileSync(join(home, OWN_MCP), "utf8"), theirs, "the person's global config is left as it was");
    const bare = writeSeatHome({ seat: "two", base, home: join(root, "nobody"), peerMcp: "/hive/peer.mjs" });
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(bare, OWN_MCP), "utf8")).mcpServers), ["hive"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("antigravity: models, mcp servers and the login are read off agy's own answers", () => {
  const listed = "Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n";
  assert.deepEqual(parseAgyModels(listed).map((m) => [m.value, m.label, m.group]), [
    ["gemini-3.8-flash-high", "Gemini 3.8 Flash (High)", "antigravity"],
    ["claude-sonnet-4-6", "Claude Sonnet 4.6 (Thinking)", "antigravity"],
    ["gpt-oss-120b-medium", "GPT-OSS 120B (Medium)", "antigravity"],
  ]);
  assert.deepEqual(antigravityIdentity(listed), { loggedIn: true, email: "", tier: "google" });
  assert.deepEqual(antigravityIdentity("Fetching available models...\nError: Please sign in to view available models. Launch the CLI without arguments to sign in."), { loggedIn: false, email: "", tier: "" });
  assert.deepEqual(antigravityIdentity(""), { loggedIn: false, email: "", tier: "" });
  assert.deepEqual(parseAgyMcpList("NAME  TYPE   STATUS    COMMAND/URL\ngw    http   enabled   http://127.0.0.1:4671/mcp/slack\nfs    stdio  disabled  node /fs.mjs\n"), [
    { name: "gw", status: "pending", error: "" },
    { name: "fs", status: "disabled", error: "" },
  ]);
});

test("antigravity: the hive seats it through the turn driver, stops it with SIGINT and keeps one login per machine", async () => {
  assert.equal(agentOf("antigravity"), "antigravity");
  assert.equal(driverFileFor("antigravity"), "turn-driver.mjs");
  const agent = agents.antigravity;
  assert.equal(agent.binary, "agy");
  assert.equal(agent.stopSignal, STOP_SIGNAL);
  assert.equal(STOP_SIGNAL, "SIGINT");
  assert.equal(agent.turnHome, writeSeatHome);
  assert.deepEqual(agent.effortLevels, []);
  const rows = await agent.listCatalog({ run: async (bin, args) => { assert.deepEqual([bin, ...args], ["agy", "models"]); return "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)\n"; } });
  assert.deepEqual(rows.map((r) => r.value), ["gemini-3.8-flash-low"]);
  await assert.rejects(agent.listCatalog({ run: async () => "Error: Please sign in to view available models." }), /nobody is signed in to Antigravity/);
  for (const platform of ["linux", "darwin", "win32"]) assert.match(oneLoginOnly("antigravity", platform), /keyring/);
  assert.equal(providerRanDry("antigravity", "error getting token source: You are not logged into Antigravity.").why, "login");
  assert.equal(providerRanDry("antigravity", "RESOURCE_EXHAUSTED: quota exceeded").why, "spent");
  assert.equal(providerRanDry("antigravity", "authentication failed or timed out"), null, "agy's ten-second sign-in timeout is not a lost login");
  const tui = seatArgv({ agent: "antigravity", name: "one", hub: "/w", model: "claude-sonnet-4-6", resumeId: C, stateDir: "/s" });
  assert.deepEqual([tui.program, ...tui.args], ["agy", "--dangerously-skip-permissions", "--model", "claude-sonnet-4-6", "--conversation", C]);
  assert.deepEqual(seatArgv({ agent: "antigravity", name: "one", hub: "/w", continueLast: true, stateDir: "/s" }).args, ["--dangerously-skip-permissions", "--continue"]);
});

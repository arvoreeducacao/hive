import { test } from "node:test";
import assert from "node:assert/strict";
import { agents, newTurnContext, parseKiroModels, KIRO_EFFORT_LEVELS, autocompactTokens, parseOpencodeMcpList, parseCodexMcpList, parseOpencodeCatalog, parseCodexCatalog, effortFromSettings, pickModelRow, withoutVariant, normalizeClaudeModels, withAppliedDefault } from "../engine/agents.mjs";
import { peerEntry } from "../engine/peer-module.mjs";

const feed = (agent, lines) => {
  const ctx = newTurnContext();
  const out = [];
  for (const line of lines) out.push(...agent.translate(JSON.parse(line), ctx));
  return { ctx, out };
};

const CODEX_TURN = [
  '{"type":"thread.started","thread_id":"01a01a0b-9378-75a1-b6e4-9cde4c527760"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"I will create the file."}}',
  '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"pwd","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
  '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"pwd","aggregated_output":"/tmp\\n","exit_code":1,"status":"failed"}}',
  '{"type":"item.started","item":{"id":"item_2","type":"file_change","changes":[{"path":"/tmp/probe.txt","kind":"add"}],"status":"in_progress"}}',
  '{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"/tmp/probe.txt","kind":"add"}],"status":"completed"}}',
  '{"type":"turn.completed","usage":{"input_tokens":43602,"cached_input_tokens":39168,"output_tokens":197}}',
];

test("codex: thread.started captures the session id", () => {
  const { ctx } = feed(agents.codex, CODEX_TURN);
  assert.equal(ctx.sessionId, "01a01a0b-9378-75a1-b6e4-9cde4c527760");
});

test("codex: agent_message becomes an assistant text block", () => {
  const { out } = feed(agents.codex, CODEX_TURN);
  const texts = out.filter((e) => e.type === "assistant" && e.message.content[0].type === "text");
  assert.equal(texts.length, 1);
  assert.equal(texts[0].message.content[0].text, "I will create the file.");
});

test("codex: command_execution pairs a shell tool_use with its result", () => {
  const { out } = feed(agents.codex, CODEX_TURN);
  const uses = out.filter((e) => e.type === "assistant" && e.message.content[0].type === "tool_use");
  const results = out.filter((e) => e.type === "user");
  const shell = uses.find((e) => e.message.content[0].name === "shell");
  assert.equal(shell.message.content[0].input.command, "pwd");
  const r = results.find((e) => e.message.content[0].tool_use_id === "item_1");
  assert.equal(r.message.content[0].content, "/tmp\n");
  assert.equal(r.message.content[0].is_error, true);
});

test("codex: file_change becomes an edit card that closes clean", () => {
  const { out } = feed(agents.codex, CODEX_TURN);
  const edit = out.find((e) => e.type === "assistant" && e.message.content[0].name === "edit");
  assert.match(edit.message.content[0].input.file_path, /add \/tmp\/probe\.txt/);
  const r = out.find((e) => e.type === "user" && e.message.content[0].tool_use_id === "item_2");
  assert.equal(r.message.content[0].is_error, false);
});

test("codex: usage accumulates from turn.completed", () => {
  const { ctx } = feed(agents.codex, CODEX_TURN);
  assert.equal(ctx.usage.input_tokens, 43602);
  assert.equal(ctx.usage.output_tokens, 197);
  assert.equal(ctx.usage.cache_read_input_tokens, 39168);
});

test("codex: a completed item never seen as started still makes both events", () => {
  const { out } = feed(agents.codex, [
    '{"type":"item.completed","item":{"id":"item_9","type":"command_execution","command":"ls","aggregated_output":"a\\n","exit_code":0,"status":"completed"}}',
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].message.content[0].type, "tool_use");
  assert.equal(out[1].message.content[0].type, "tool_result");
});

test("codex: resume args carry the session and first turn does not", () => {
  const fresh = agents.codex.turnArgs({ text: "hi" });
  assert.equal(fresh[0], "exec");
  assert.notEqual(fresh[1], "resume");
  const back = agents.codex.turnArgs({ text: "hi", sessionId: "abc" });
  assert.deepEqual(back.slice(0, 3), ["exec", "resume", "abc"]);
  assert.ok(back.includes("--json"));
  assert.equal(back.at(-1), "hi");
});

test("codex: the seat name reaches the hive mcp, which codex never inherits from the environment", () => {
  const args = agents.codex.turnArgs({ text: "hi", seat: "orca", base: "/Users/dev/.hive" });
  const at = args.indexOf("-c");
  assert.ok(at > 0);
  const peer = peerEntry();
  assert.equal(
    args[at + 1],
    `mcp_servers.hive={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(peer)}],env={HIVE_SEAT="orca",HIVE_STATE_DIR="/Users/dev/.hive"}}`,
  );
  assert.doesNotMatch(args[at + 1], /command="hive"/, "a seat must not need the command line installed to see the others");
  assert.equal(args.at(-1), "hi");
  assert.ok(!agents.codex.turnArgs({ text: "hi" }).includes("-c"));
});

const OPENCODE_TURN = [
  '{"type":"step_start","sessionID":"ses_fe5f46304ffeNlt43N2PBQvykt","part":{"type":"step-start"}}',
  '{"type":"tool_use","sessionID":"ses_fe5f46304ffeNlt43N2PBQvykt","part":{"type":"tool","tool":"write","callID":"tool_79EY","state":{"status":"completed","input":{"content":"ping","filePath":"/tmp/probe.txt"},"output":"Wrote file successfully.","title":"probe.txt"}}}',
  '{"type":"step_finish","sessionID":"ses_fe5f46304ffeNlt43N2PBQvykt","part":{"type":"step-finish","reason":"tool-calls","tokens":{"total":7266,"input":529,"output":81,"cache":{"write":0,"read":6656}},"cost":0.002}}',
  '{"type":"text","sessionID":"ses_fe5f46304ffeNlt43N2PBQvykt","part":{"type":"text","text":"Created the file. Done."}}',
  '{"type":"step_finish","sessionID":"ses_fe5f46304ffeNlt43N2PBQvykt","part":{"type":"step-finish","reason":"stop","tokens":{"total":7329,"input":129,"output":32,"cache":{"write":0,"read":7168}},"cost":0.001}}',
];

test("opencode: the first event captures the session id", () => {
  const { ctx } = feed(agents.opencode, OPENCODE_TURN);
  assert.equal(ctx.sessionId, "ses_fe5f46304ffeNlt43N2PBQvykt");
});

test("opencode: a tool part becomes tool_use plus tool_result", () => {
  const { out } = feed(agents.opencode, OPENCODE_TURN);
  const use = out.find((e) => e.type === "assistant" && e.message.content[0].type === "tool_use");
  assert.equal(use.message.content[0].name, "write");
  assert.equal(use.message.content[0].input.filePath, "/tmp/probe.txt");
  const r = out.find((e) => e.type === "user");
  assert.equal(r.message.content[0].tool_use_id, "tool_79EY");
  assert.equal(r.message.content[0].content, "Wrote file successfully.");
  assert.equal(r.message.content[0].is_error, false);
});

test("opencode: text becomes an assistant message and tokens accumulate", () => {
  const { ctx, out } = feed(agents.opencode, OPENCODE_TURN);
  const text = out.find((e) => e.type === "assistant" && e.message.content[0].type === "text");
  assert.equal(text.message.content[0].text, "Created the file. Done.");
  assert.equal(ctx.usage.input_tokens, 658);
  assert.equal(ctx.usage.output_tokens, 113);
  assert.equal(ctx.usage.cache_read_input_tokens, 13824);
  assert.ok(Math.abs(ctx.cost - 0.003) < 1e-9);
});

test("opencode: turn args resume the session and attach files", () => {
  const args = agents.opencode.turnArgs({ text: "go", sessionId: "ses_1", images: ["/tmp/a.png"] });
  assert.deepEqual(args.slice(0, 6), ["run", "--format", "json", "--auto", "--agent", "build"]);
  assert.ok(args.includes("--session") && args.includes("ses_1"));
  assert.ok(args.includes("--file") && args.includes("/tmp/a.png"));
  assert.equal(args.at(-1), "go");
});

test("opencode: mcp list parses names, statuses and the auth hint through the ANSI noise", () => {
  const out = [
    "┌  MCP Servers",
    "│",
    "●  ⚠ figma \x1b[90mneeds authentication\x1b[0m",
    "│      \x1b[90mhttps://mcp.figma.com/mcp\x1b[0m",
    "●  ✓ playwright \x1b[90mconnected\x1b[0m",
    "●  ✗ broken \x1b[90mfailed: spawn ENOENT\x1b[0m",
    "└  3 server(s)",
  ].join("\n");
  const rows = parseOpencodeMcpList(out);
  assert.deepEqual(rows.map((r) => [r.name, r.status]), [
    ["figma", "needs-auth"],
    ["playwright", "connected"],
    ["broken", "failed"],
  ]);
  assert.equal(rows[0].error, "");
  assert.equal(rows[1].error, "");
  assert.match(rows[2].error, /spawn ENOENT/);
});

test("codex: mcp list --json maps entries and survives garbage", () => {
  assert.deepEqual(parseCodexMcpList("[]"), []);
  assert.deepEqual(parseCodexMcpList("not json"), []);
  const rows = parseCodexMcpList(JSON.stringify([{ name: "signoz" }, { name: "off", enabled: false }]));
  assert.deepEqual(rows.map((r) => [r.name, r.status]), [["signoz", "pending"], ["off", "disabled"]]);
});

test("codex: the catalog carries the efforts of each model, not one list for the agent", () => {
  const rows = parseCodexCatalog([
    { model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", description: "frontier", isDefault: true,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "fast" },
        { reasoningEffort: "ultra", description: "delegates" },
      ] },
    { model: "gpt-5.6-luna", displayName: "GPT-5.6-Luna",
      supportedReasoningEfforts: [{ reasoningEffort: "low" }] },
    { model: "secret", hidden: true },
  ]);
  assert.deepEqual(rows.map((r) => r.value), ["gpt-5.6-sol", "gpt-5.6-luna"]);
  assert.deepEqual(rows[0].efforts.map((e) => e.value), ["low", "ultra"]);
  assert.deepEqual(rows[1].efforts.map((e) => e.value), ["low"]);
  assert.equal(rows[0].defaultEffort, "medium");
  assert.equal(rows[0].isDefault, true);
  assert.equal(rows[0].efforts[1].description, "delegates");
});

test("codex: ultra is a real level the old fixed list refused", () => {
  const rows = parseCodexCatalog([{ model: "m", supportedReasoningEfforts: [{ reasoningEffort: "ultra" }] }]);
  assert.ok(rows[0].efforts.some((e) => e.value === "ultra"));
  assert.ok(!agents.codex.effortLevels.includes("ultra"));
});

test("opencode: the verbose listing becomes rows, and a model with no variants has no efforts", () => {
  const out = [
    "github-copilot/claude-fable-5",
    "{",
    '  "id": "claude-fable-5",',
    '  "providerID": "github-copilot",',
    '  "name": "Claude Fable 5",',
    '  "limit": { "context": 1000000 },',
    '  "variants": { "low": {}, "high": {}, "max": {} }',
    "}",
    "opencode/big-pickle",
    "{",
    '  "id": "big-pickle",',
    '  "providerID": "opencode",',
    '  "name": "Big Pickle",',
    '  "limit": { "context": 200000 }',
    "}",
  ].join("\n");
  const rows = parseOpencodeCatalog(out);
  assert.deepEqual(rows.map((r) => r.value), ["github-copilot/claude-fable-5", "opencode/big-pickle"]);
  assert.deepEqual(rows[0].efforts.map((e) => e.value), ["low", "high", "max"]);
  assert.deepEqual(rows[1].efforts, []);
  assert.equal(rows[0].description, "1M context");
  assert.equal(rows[1].description, "200k context");
  assert.equal(rows[0].group, "github-copilot");
});

test("opencode: variants the fixed list never had still come through", () => {
  const out = ["x/y", "{", '"id":"y","providerID":"x","variants":{"minimal":{},"none":{}}', "}"].join("\n");
  const rows = parseOpencodeCatalog(out);
  assert.deepEqual(rows[0].efforts.map((e) => e.value), ["minimal", "none"]);
  assert.ok(!agents.opencode.effortLevels.includes("minimal"));
});

test("opencode: a half-written block is dropped instead of poisoning the list", () => {
  const out = ["a/b", "{", '"id":"b","providerID":"a"', "}", "c/d", "{", "not json", "}"].join("\n");
  const rows = parseOpencodeCatalog(out);
  assert.deepEqual(rows.map((r) => r.value), ["a/b"]);
  assert.deepEqual(parseOpencodeCatalog(""), []);
  assert.deepEqual(parseOpencodeCatalog(null), []);
});

test("claude: the settings files decide the level, later file winning", () => {
  assert.equal(effortFromSettings([JSON.stringify({ effortLevel: "high" })]), "high");
  assert.equal(effortFromSettings([
    JSON.stringify({ effortLevel: "high" }),
    JSON.stringify({ permissions: {} }),
    JSON.stringify({ effortLevel: "max" }),
  ]), "max");
});

test("claude: a missing, empty or broken settings file is skipped, never guessed at", () => {
  assert.equal(effortFromSettings([]), "");
  assert.equal(effortFromSettings(["", "not json", "{"]), "");
  assert.equal(effortFromSettings([JSON.stringify({ effortLevel: "high" }), "not json"]), "high");
  assert.equal(effortFromSettings([JSON.stringify({ effortLevel: "" })]), "");
  assert.equal(effortFromSettings([JSON.stringify({ effortLevel: 3 })]), "");
  assert.equal(effortFromSettings(null), "");
});

/* the shape supportedModels() really answers with, on a machine with a 1M Opus */
const CLAUDE_ROWS = [
  { value: "default", resolved: "claude-opus-5[1m]", label: "Default (recommended)", isDefault: true },
  { value: "opus[1m]", resolved: "claude-opus-5[1m]", label: "Opus (1M context)", isDefault: false },
  { value: "claude-fable-5-1[1m]", resolved: "claude-fable-5-1", label: "Fable", isDefault: false },
  { value: "sonnet", resolved: "claude-sonnet-5", label: "Sonnet", isDefault: false },
  { value: "haiku", resolved: "claude-haiku-4-5-20251001", label: "Haiku", isDefault: false },
];

test("claude: the picker keeps only the newest generation of each family", () => {
  const rows = [
    { value: "default", displayName: "Default (recommended)", resolvedModel: "claude-opus-5-5" },
    { value: "opus", displayName: "Opus 5.5", resolvedModel: "claude-opus-5-5" },
    { value: "claude-fable-5-1", displayName: "Fable 5.1", resolvedModel: "claude-fable-5-1" },
    { value: "sonnet", displayName: "Sonnet 5.5", resolvedModel: "claude-sonnet-5-5" },
    { value: "haiku", displayName: "Haiku 4.5", resolvedModel: "claude-haiku-4-5-20251001" },
    { value: "claude-sonnet-5", displayName: "Sonnet 5", resolvedModel: "claude-sonnet-5" },
    { value: "claude-opus-5", displayName: "Opus 5", resolvedModel: "claude-opus-5" },
    { value: "claude-fable-5", displayName: "Fable 5", resolvedModel: "claude-fable-5" },
    { value: "claude-opus-4-8", displayName: "Opus 4.8", resolvedModel: "claude-opus-4-8" },
    { value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", resolvedModel: "claude-sonnet-4-6" },
    { value: "custom-model", displayName: "Custom" },
  ];
  assert.deepEqual(normalizeClaudeModels(rows).map((m) => m.label), ["Default (recommended)", "Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 4.5", "Custom"]);
});

test("claude: the id the session reports still finds its row when the variant differs", () => {
  // the live bug: init says claude-opus-5, the catalogue says claude-opus-5[1m]
  assert.equal(pickModelRow(CLAUDE_ROWS, "claude-opus-5")?.label, "Opus (1M context)");
  assert.equal(pickModelRow(CLAUDE_ROWS, "claude-opus-5[1m]")?.label, "Opus (1M context)");
});

test("claude: an explicit pick wins over any variant guessing", () => {
  assert.equal(pickModelRow(CLAUDE_ROWS, "default")?.label, "Default (recommended)");
  assert.equal(pickModelRow(CLAUDE_ROWS, "sonnet")?.label, "Sonnet");
  assert.equal(pickModelRow(CLAUDE_ROWS, "claude-sonnet-5")?.label, "Sonnet");
  assert.equal(pickModelRow(CLAUDE_ROWS, "claude-fable-5-1")?.label, "Fable");
});

test("claude: no id at all means the account default, and an unknown id means nothing", () => {
  assert.equal(pickModelRow(CLAUDE_ROWS, "")?.label, "Default (recommended)");
  assert.equal(pickModelRow(CLAUDE_ROWS, "gpt-5.6-sol"), null);
  assert.equal(pickModelRow([], "claude-opus-5"), null);
  assert.equal(pickModelRow(null, "x"), null);
});

test("opencode: a provider-scoped id is matched whole, never by its tail", () => {
  const rows = [
    { value: "github-copilot/claude-fable-5", resolved: "", label: "Claude Fable 5", isDefault: false },
    { value: "amazon-bedrock/anthropic.claude-fable-5", resolved: "", label: "Fable on Bedrock", isDefault: false },
  ];
  assert.equal(pickModelRow(rows, "github-copilot/claude-fable-5")?.label, "Claude Fable 5");
  assert.equal(pickModelRow(rows, "claude-fable-5"), null);
});

test("the variant is stripped, and an id without one is left alone", () => {
  assert.equal(withoutVariant("claude-opus-5[1m]"), "claude-opus-5");
  assert.equal(withoutVariant("claude-opus-5"), "claude-opus-5");
  assert.equal(withoutVariant(""), "");
  assert.equal(withoutVariant(null), "");
});

test("kiro: the catalog is the models block of session/new, each row with kiro's effort levels", () => {
  const rows = parseKiroModels({ sessionId: "s", models: { currentModelId: "claude-opus-4.8", availableModels: [
    { modelId: "claude-opus-5", name: "claude-opus-5", description: "Claude Opus 5 model with 1M context window" },
    { modelId: "claude-opus-4.8", name: "claude-opus-4.8" },
    { name: "no id" },
  ] } });
  assert.deepEqual(rows.map((r) => [r.value, r.label, r.isDefault, r.group]), [["claude-opus-5", "claude-opus-5", false, "kiro"], ["claude-opus-4.8", "claude-opus-4.8", true, "kiro"]]);
  assert.deepEqual(rows[0].efforts.map((e) => e.value), KIRO_EFFORT_LEVELS);
  assert.deepEqual(parseKiroModels({}), []);
  assert.equal(agents.kiro.binary, "kiro-cli");
  assert.deepEqual(agents.kiro.effortLevels, KIRO_EFFORT_LEVELS);
  assert.deepEqual(agents.kiro.turnArgs({ text: "hi", model: "m" }), ["chat", "--no-interactive", "--trust-all-tools", "--output-format", "stream-json", "--model", "m", "hi"]);
});

test("the autocompact ceiling in tokens: the config's 150k is 150000, auto and nonsense are 0", () => {
  assert.equal(autocompactTokens("150k"), 150000);
  assert.equal(autocompactTokens("100K"), 100000);
  assert.equal(autocompactTokens("auto"), 0);
  assert.equal(autocompactTokens("50k"), 0);
  assert.equal(autocompactTokens(""), 0);
  assert.equal(autocompactTokens(undefined), 0);
});

test("the effort a session runs at with nothing chosen becomes the default of its model", () => {
  const [row] = normalizeClaudeModels([{ value: "claude-opus-5-5", displayName: "Opus 5.5", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] }]);
  assert.equal(withAppliedDefault(row, "medium").defaultEffort, "medium");
});

test("an applied effort the model does not list, or none at all, leaves the default empty", () => {
  const rowOf = () => normalizeClaudeModels([{ value: "claude-opus-5-5", supportedEffortLevels: ["low", "medium", "high"] }])[0];
  assert.equal(withAppliedDefault(rowOf(), "max").defaultEffort, "");
  assert.equal(withAppliedDefault(rowOf(), null).defaultEffort, "");
  const haiku = normalizeClaudeModels([{ value: "claude-haiku-4-5", supportedEffortLevels: [] }])[0];
  assert.equal(withAppliedDefault(haiku, "medium").defaultEffort, "");
});

test("a default the catalogue already knows is not replaced, and a missing row is no error", () => {
  const row = { value: "gpt", efforts: [{ value: "low" }, { value: "high" }], defaultEffort: "high" };
  assert.equal(withAppliedDefault(row, "low").defaultEffort, "high");
  assert.equal(withAppliedDefault(null, "low"), null);
});

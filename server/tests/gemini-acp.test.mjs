import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BINARY, SLASH_COMMANDS, YOLO_MODE, LOGIN_HINT, acpArgs, needsLogin, loginTrouble, initializeParams, setModelParams, setModeParams,
  modelsFromSession, currentModel, currentMode, canCompact, newSessionContext, translate, finishTurn, contextUsage, resumeFellThrough, toolInputOf, stderrTrouble,
} from "../engine/gemini-acp.mjs";
import { parseGeminiModels, agents } from "../engine/agents.mjs";
import { driverFileFor, agentOf } from "../sessions.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const S = "5b7d2f0e-8c41-4a3b-9e6d-1f2a3b4c5d6e";
const update = (u) => ({ method: "session/update", params: { sessionId: S, update: u } });
const feed = (ctx, updates) => updates.flatMap((u) => translate(update(u), ctx));

const OPENED = {
  sessionId: S,
  modes: { availableModes: [{ id: "default", name: "Default" }, { id: "autoEdit", name: "Auto Edit" }, { id: "yolo", name: "YOLO" }], currentModeId: "yolo" },
  models: {
    availableModels: [
      { modelId: "auto", name: "Auto", description: "picks per turn" },
      { modelId: "gemini-2.5-pro", name: "gemini-2.5-pro" },
      { modelId: "gemini-2.5-flash", name: "gemini-2.5-flash" },
      { modelId: "" },
    ],
    currentModelId: "auto",
  },
};

test("gemini acp: the server is gemini --acp, never stops for a tool and trusts the folder it was opened in", () => {
  assert.equal(BINARY, "gemini");
  assert.deepEqual(acpArgs(), ["--acp", "--yolo", "--skip-trust"]);
  assert.deepEqual(initializeParams().clientCapabilities, {}, "no fs and no terminal, so the agent runs its own tools");
  assert.deepEqual(SLASH_COMMANDS, ["model", "mcp", "context"]);
  assert.equal(YOLO_MODE, "yolo");
  assert.deepEqual(setModeParams(S), { sessionId: S, modeId: "yolo" });
});

test("gemini acp: a session/new refused for want of a login reads as nobody signed in, and nothing else does", () => {
  assert.ok(needsLogin("Gemini API key is missing or not configured."));
  assert.ok(needsLogin("Authentication required."));
  assert.ok(needsLogin("invalid_grant"));
  assert.ok(!needsLogin("session not found"));
  assert.match(LOGIN_HINT, /run `gemini` in a terminal/);
  assert.match(loginTrouble("Gemini API key is missing or not configured."), /^nobody is signed in to Gemini/);
  assert.equal(loginTrouble("the pipe broke"), "the pipe broke");
  assert.ok(resumeFellThrough("session not found"));
  assert.equal(stderrTrouble("Error handling request {"), null, "the refusal already came back on the request; its echo on stderr is noise");
  assert.equal(stderrTrouble("error: spawn ENOENT"), "error: spawn ENOENT");
});

test("gemini acp: models come off the session's models block, grouped as gemini, and the model is set by id", () => {
  const rows = modelsFromSession(OPENED);
  assert.deepEqual(rows.map((r) => [r.value, r.label, r.group, r.isDefault]), [
    ["auto", "Auto", "gemini", true],
    ["gemini-2.5-pro", "gemini-2.5-pro", "gemini", false],
    ["gemini-2.5-flash", "gemini-2.5-flash", "gemini", false],
  ]);
  assert.deepEqual(parseGeminiModels(OPENED), rows);
  assert.equal(currentModel(OPENED), "auto");
  assert.equal(currentMode(OPENED), "yolo");
  assert.equal(currentMode({}), "");
  assert.deepEqual(setModelParams(S, "gemini-2.5-pro"), { sessionId: S, modelId: "gemini-2.5-pro" });
  assert.deepEqual(modelsFromSession({}), []);
});

test("gemini acp: usage_update feeds /context, and there is no compact to offer whatever the command list says", () => {
  const ctx = newSessionContext();
  feed(ctx, [
    { sessionUpdate: "available_commands_update", availableCommands: [{ name: "memory" }, { name: "init" }, { name: "help" }] },
    { sessionUpdate: "usage_update", used: 52000, size: 1048576 },
  ]);
  assert.equal(canCompact(ctx), false);
  const u = contextUsage(ctx, "gemini-2.5-pro");
  assert.equal(u.totalTokens, 52000);
  assert.equal(u.maxTokens, 1048576);
});

test("gemini acp: a tool card opens as the tool starts, though gemini sends no rawInput, and carries the file it touches", () => {
  assert.deepEqual(toolInputOf({ title: "ls -la" }), { description: "ls -la" });
  assert.deepEqual(toolInputOf({ title: "README.md", locations: [{ path: "/w/README.md" }] }), { file_path: "/w/README.md", description: "README.md" });
  const ctx = newSessionContext();
  const started = feed(ctx, [
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "listing" } },
    { sessionUpdate: "tool_call", toolCallId: "run_shell_command-1", status: "in_progress", title: "ls -la", content: [], locations: [], kind: "execute" },
  ]);
  const card = started.find((e) => e.type === "assistant" && e.message.content.some((b) => b.type === "tool_use"));
  assert.deepEqual(card.message.content.find((b) => b.type === "tool_use"), { type: "tool_use", id: "run_shell_command-1", name: "shell", input: { description: "ls -la" } });
  const read = feed(ctx, [
    { sessionUpdate: "tool_call_update", toolCallId: "run_shell_command-1", status: "completed", title: "ls -la", content: [{ type: "content", content: { type: "text", text: "a\nb\n" } }], kind: "execute" },
    { sessionUpdate: "tool_call", toolCallId: "read_file-2", status: "in_progress", title: "README.md", content: [], locations: [{ path: "/w/README.md" }], kind: "read" },
  ]);
  assert.equal(read.find((e) => e.type === "user").message.content[0].content, "a\nb\n");
  assert.deepEqual(read.find((e) => e.type === "assistant").message.content[0].input, { file_path: "/w/README.md" });
  const end = finishTurn(ctx, "end_turn", S);
  assert.equal(end.at(-1).subtype, "success");
  assert.equal(end.filter((e) => e.type === "user").length, 1, "a card still open when the turn ends closes with it");
});

test("gemini acp: the driver opens without authenticate, turns yolo on when gemini started elsewhere, and refuses /compact plainly", () => {
  const driver = readFileSync(join(HERE, "engine/gemini-driver.mjs"), "utf8");
  assert.doesNotMatch(driver, /"authenticate"/, "gemini signs in from the auth type its settings hold");
  assert.match(driver, /throw new Error\(loginTrouble\(e\?\.message \|\| e\)\)/);
  assert.match(driver, /if \(currentMode\(opened\) !== YOLO_MODE\)/);
  assert.match(driver, /"session\/set_model", setModelParams\(sessionId, wanted\)/);
  assert.match(driver, /spawn\(BINARY, acpArgs\(\)/);
  assert.match(driver, /if \(!canCompact\(\)\) throw new Error\(`\$\{LABEL\} seats do not support \/compact/);
  assert.match(driver, /const sockFile = seatSockPath\(base, name\);/);
  assert.match(driver, /effort: "", session_id: sessionId/);
});

test("gemini acp: the hive knows gemini as an agent with its own driver", () => {
  assert.equal(agentOf("gemini"), "gemini");
  assert.equal(driverFileFor("gemini"), "gemini-driver.mjs");
});

test("gemini acp: the catalogue opens a session without signing in, and the turn shape is headless stream-json", () => {
  const calls = [];
  const rpc = async (bin, args, body) => {
    assert.equal(bin, "gemini");
    assert.deepEqual(args, ["--acp"]);
    return body(async (method) => {
      calls.push(method);
      return method === "session/new" ? OPENED : {};
    });
  };
  return agents.gemini.listCatalog({ rpc }).then((rows) => {
    assert.deepEqual(calls, ["initialize", "session/new"]);
    assert.deepEqual(rows.map((r) => r.value), ["auto", "gemini-2.5-pro", "gemini-2.5-flash"]);
    assert.deepEqual(agents.gemini.turnArgs({ text: "hi", model: "flash", sessionId: S }), ["-p", "hi", "--output-format", "stream-json", "--yolo", "--skip-trust", "--model", "flash", "--resume", S]);
    const ctx = {};
    assert.deepEqual(agents.gemini.translate({ type: "init", session_id: S }, ctx), []);
    assert.equal(ctx.sessionId, S);
    assert.equal(agents.gemini.translate({ type: "message", role: "assistant", content: "oi", delta: true }, ctx)[0].message.content[0].text, "oi");
  });
});

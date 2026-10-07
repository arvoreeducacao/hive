import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  kimiHome, subagentToolName, subagentToolInput, launchedSubagent, sessionDirOf,
  promptOfWire, promptOfFile, wireMatchesPrompt, subagentEvents, wireIsOver, subagentWatcher,
} from "../engine/kimi-subagents.mjs";
import { toolName, toolInput } from "../engine/kimi-acp.mjs";

const loopEvent = (agentId, event) => JSON.stringify({ type: "context.append_loop_event", agentId, event, time: 1 });

test("the kimi home follows the account env", () => {
  assert.equal(kimiHome({ KIMI_CODE_HOME: "/tmp/second/.kimi-code" }), "/tmp/second/.kimi-code");
  assert.match(kimiHome({}), /\.kimi-code$/);
});

test("a subagent tool wears the name the pane already draws", () => {
  assert.equal(subagentToolName("Bash"), "shell");
  assert.equal(subagentToolName("Read"), "read");
  assert.equal(subagentToolName("Write"), "edit");
  assert.equal(subagentToolName("Grep"), "search");
  assert.equal(subagentToolName("mcp__hive__publish"), "mcp__hive__publish");
  assert.equal(subagentToolName("SomethingNew"), "somethingnew");
  assert.deepEqual(subagentToolInput("shell", { command: "ls -la", cwd: "/tmp" }), { command: "ls -la" });
  assert.deepEqual(subagentToolInput("read", { path: "alpha.js" }), { file_path: "alpha.js" });
  assert.deepEqual(subagentToolInput("search", { pattern: "X" }), { pattern: "X" });
});

test("only a launch of a subagent is picked up", () => {
  const launch = { id: "0:tool_A", input: { subagent_type: "explore", description: "achar X", prompt: "varra o diretorio" } };
  assert.deepEqual(launchedSubagent(launch), { parentId: "0:tool_A", prompt: "varra o diretorio", resume: "" });
  assert.deepEqual(launchedSubagent({ id: "0:tool_B", input: { resume: "agent-2", prompt: "continue" } }), { parentId: "0:tool_B", prompt: "continue", resume: "agent-2" });
  assert.equal(launchedSubagent({ id: "0:tool_C", input: { command: "ls" } }), null);
  assert.equal(launchedSubagent({ id: "0:tool_D" }), null);
});

test("the session index points at the folder kimi writes to", () => {
  const index = [
    JSON.stringify({ sessionId: "session_a", sessionDir: "/home/x/.kimi-code/sessions/wd_one/session_a" }),
    "",
    "nao e json",
    JSON.stringify({ sessionId: "session_b", sessionDir: "/home/x/.kimi-code/sessions/wd_two/session_b" }),
  ].join("\n");
  assert.equal(sessionDirOf(index, "session_b"), "/home/x/.kimi-code/sessions/wd_two/session_b");
  assert.equal(sessionDirOf(index, "session_gone"), "");
  assert.equal(sessionDirOf(index, ""), "");
});

test("a subagent folder is claimed by the prompt it was born with", () => {
  const prompt = "Varra o diretorio e descubra onde esta a constante CHAVE_SECRETA, depois responda em uma linha com o arquivo e o valor encontrado";
  const wire = [
    JSON.stringify({ type: "metadata", protocol_version: "1.5" }),
    JSON.stringify({ type: "turn.prompt", agentId: "agent-0", input: [{ type: "text", text: `<git-context status="unavailable"/>\n\n${prompt}` }] }),
  ].join("\n");
  assert.equal(promptOfWire(wire).includes(prompt), true);
  assert.equal(wireMatchesPrompt(wire, prompt), true);
  assert.equal(wireMatchesPrompt(wire, "um pedido totalmente diferente que ninguem fez neste teste aqui agora"), false);
  assert.equal(wireMatchesPrompt(wire, ""), false);
});

test("the wire turns into the events the pane nests under the card", () => {
  const call = JSON.parse(loopEvent("agent-0", { type: "tool.call", toolCallId: "tool_X", name: "Grep", args: { pattern: "CHAVE" } }));
  const [opened] = subagentEvents("0:tool_A", "agent-0", call);
  assert.equal(opened.parent_tool_use_id, "0:tool_A");
  assert.deepEqual(opened.message.content[0], { type: "tool_use", id: "agent-0:tool_X", name: "search", input: { pattern: "CHAVE" } });

  const landed = JSON.parse(loopEvent("agent-0", { type: "tool.result", toolCallId: "tool_X", result: { output: "alpha.js:1" } }));
  const [back] = subagentEvents("0:tool_A", "agent-0", landed);
  assert.equal(back.type, "user");
  assert.deepEqual(back.message.content[0], { type: "tool_result", tool_use_id: "agent-0:tool_X", content: "alpha.js:1", is_error: false });

  const said = JSON.parse(loopEvent("agent-0", { type: "content.part", part: { type: "text", text: "  achei  " } }));
  assert.deepEqual(subagentEvents("0:tool_A", "agent-0", said)[0].message.content, [{ type: "text", text: "achei" }]);

  const quiet = JSON.parse(loopEvent("agent-0", { type: "content.part", part: { type: "think", think: "hm" } }));
  assert.deepEqual(subagentEvents("0:tool_A", "agent-0", quiet), []);
  assert.deepEqual(subagentEvents("0:tool_A", "agent-0", { type: "usage.record" }), []);

  assert.equal(wireIsOver({ type: "turn.ended" }), true);
  assert.equal(wireIsOver({ type: "prompt.completed" }), true);
  assert.equal(wireIsOver({ type: "usage.record" }), false);
});

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function bench() {
  const home = mkdtempSync(join(tmpdir(), "kimi-sub-"));
  const dir = join(home, "sessions", "wd_one", "session_a");
  mkdirSync(join(dir, "agents", "main"), { recursive: true });
  writeFileSync(join(home, "session_index.jsonl"), `${JSON.stringify({ sessionId: "session_a", sessionDir: dir })}\n`);
  return { home, dir, env: { KIMI_CODE_HOME: home } };
}

test("the watcher follows a subagent from birth to end, live", async () => {
  const { home, dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });

  const prompt = "Leia cada arquivo deste diretorio e escreva um relatorio detalhado sobre o que voce encontrou em cada um deles";
  watcher.launched({ id: "0:tool_A", input: { subagent_type: "explore", description: "auditar", prompt } });

  const wire = join(dir, "agents", "agent-0", "wire.jsonl");
  mkdirSync(join(dir, "agents", "agent-0"), { recursive: true });
  writeFileSync(wire, `${JSON.stringify({ type: "turn.prompt", agentId: "agent-0", input: [{ type: "text", text: `<git-context/>\n\n${prompt}` }] })}\n`);
  await settle();

  appendFileSync(wire, `${loopEvent("agent-0", { type: "tool.call", toolCallId: "t1", name: "Read", args: { path: "alpha.js" } })}\n`);
  await settle();
  appendFileSync(wire, `${loopEvent("agent-0", { type: "tool.result", toolCallId: "t1", result: { output: "conteudo" } })}\n`);
  await settle();

  assert.deepEqual(seen.map((e) => e.parent_tool_use_id), ["0:tool_A", "0:tool_A"]);
  assert.equal(seen[0].message.content[0].name, "read");
  assert.deepEqual(seen[0].message.content[0].input, { file_path: "alpha.js" });
  assert.equal(seen[1].message.content[0].type, "tool_result");
  assert.equal(watcher.watching, 1);

  appendFileSync(wire, `${JSON.stringify({ type: "turn.ended", agentId: "agent-0", reason: "completed" })}\n`);
  await settle();
  assert.equal(watcher.watching, 0);

  appendFileSync(wire, `${loopEvent("agent-0", { type: "tool.call", toolCallId: "t2", name: "Bash", args: { command: "ls" } })}\n`);
  await settle();
  assert.equal(seen.length, 2, "nothing is read after the subagent ended");
  watcher.stop();
  assert.ok(home);
});

test("half a line written is not half an event", async () => {
  const { dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });
  const prompt = "Uma tarefa longa o suficiente para servir de assinatura desta pasta de subagente neste teste aqui";
  watcher.launched({ id: "0:tool_A", input: { subagent_type: "coder", description: "x", prompt } });

  const wire = join(dir, "agents", "agent-0", "wire.jsonl");
  mkdirSync(join(dir, "agents", "agent-0"), { recursive: true });
  writeFileSync(wire, `${JSON.stringify({ type: "turn.prompt", agentId: "agent-0", input: [{ type: "text", text: prompt }] })}\n`);
  await settle();

  const line = loopEvent("agent-0", { type: "tool.call", toolCallId: "t1", name: "Bash", args: { command: "ls -la" } });
  appendFileSync(wire, line.slice(0, 30));
  await settle();
  assert.equal(seen.length, 0);
  appendFileSync(wire, `${line.slice(30)}\n`);
  await settle();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].message.content[0].input, { command: "ls -la" });
  watcher.stop();
});

test("a resumed subagent is picked up where its file already stands", async () => {
  const { dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });

  const wire = join(dir, "agents", "agent-2", "wire.jsonl");
  mkdirSync(join(dir, "agents", "agent-2"), { recursive: true });
  writeFileSync(wire, `${loopEvent("agent-2", { type: "tool.call", toolCallId: "old", name: "Read", args: { path: "velho.js" } })}\n`);

  watcher.launched({ id: "0:tool_B", input: { resume: "agent-2", prompt: "continue de onde parou" } });
  await settle();
  assert.equal(seen.length, 0, "what the subagent did before this turn is not replayed");

  appendFileSync(wire, `${loopEvent("agent-2", { type: "tool.call", toolCallId: "novo", name: "Write", args: { path: "novo.js" } })}\n`);
  await settle();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].parent_tool_use_id, "0:tool_B");
  assert.deepEqual(seen[0].message.content[0].input, { file_path: "novo.js" });
  watcher.stop();
});

test("two subagents at once land on their own cards", async () => {
  const { dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });
  const first = "A primeira tarefa, que fala de relatorios e de leitura de arquivos, com texto suficiente para assinar";
  const second = "A segunda tarefa, que fala de testes e de execucao de comandos, com texto suficiente para assinar";
  watcher.launched({ id: "0:tool_A", input: { subagent_type: "explore", description: "um", prompt: first } });
  watcher.launched({ id: "0:tool_B", input: { subagent_type: "coder", description: "dois", prompt: second } });

  for (const [agentId, prompt] of [["agent-0", second], ["agent-1", first]]) {
    mkdirSync(join(dir, "agents", agentId), { recursive: true });
    writeFileSync(join(dir, "agents", agentId, "wire.jsonl"), `${JSON.stringify({ type: "turn.prompt", agentId, input: [{ type: "text", text: prompt }] })}\n`);
  }
  await settle();

  appendFileSync(join(dir, "agents", "agent-0", "wire.jsonl"), `${loopEvent("agent-0", { type: "tool.call", toolCallId: "t1", name: "Bash", args: { command: "npm test" } })}\n`);
  appendFileSync(join(dir, "agents", "agent-1", "wire.jsonl"), `${loopEvent("agent-1", { type: "tool.call", toolCallId: "t2", name: "Read", args: { path: "a.js" } })}\n`);
  await settle();

  const byParent = Object.fromEntries(seen.map((e) => [e.parent_tool_use_id, e.message.content[0].id]));
  assert.deepEqual(byParent, { "0:tool_B": "agent-0:t1", "0:tool_A": "agent-1:t2" });
  watcher.stop();
});

test("a system prompt of a third of a megabyte does not hide the line that names the subagent", async () => {
  const { dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });

  const prompt = "Você vai concluir um trabalho de frontend que outro agente começou e foi interrompido no meio, com todo o contexto abaixo";
  watcher.launched({ id: "12:tool_REAL", input: { description: "concluir frontend", prompt } });

  mkdirSync(join(dir, "agents", "agent-6"), { recursive: true });
  const wire = join(dir, "agents", "agent-6", "wire.jsonl");
  writeFileSync(wire, [
    JSON.stringify({ type: "metadata", protocol_version: "1.5" }),
    JSON.stringify({ type: "runtime.set_binding", agentId: "agent-6" }),
    JSON.stringify({ type: "profile.bind", agentId: "agent-6", profileName: "coder", systemPrompt: "x".repeat(390 * 1024) }),
    JSON.stringify({ type: "permission.set_mode", agentId: "agent-6", mode: "yolo" }),
    JSON.stringify({ type: "turn.prompt", agentId: "agent-6", input: [{ type: "text", text: `<git-context/>\n\n${prompt}` }] }),
    "",
  ].join("\n"));

  assert.equal(await promptOfFile(wire), `<git-context/>\n\n${prompt}`);
  await settle(80);

  appendFileSync(wire, `${loopEvent("agent-6", { type: "tool.call", toolCallId: "t1", name: "Write", args: { path: "tela.tsx" } })}\n`);
  await settle();

  assert.equal(seen.length, 1, "the folder is claimed even with a huge header");
  assert.equal(seen[0].parent_tool_use_id, "12:tool_REAL");
  assert.deepEqual(seen[0].message.content[0].input, { file_path: "tela.tsx" });
  watcher.stop();
});

test("a wire whose header never names a prompt is given up on, not scanned forever", async () => {
  const { dir } = bench();
  mkdirSync(join(dir, "agents", "agent-9"), { recursive: true });
  const wire = join(dir, "agents", "agent-9", "wire.jsonl");
  const noise = Array.from({ length: 400 }, (_, i) => JSON.stringify({ type: "usage.record", n: i, pad: "y".repeat(500) }));
  writeFileSync(wire, `${noise.join("\n")}\n${JSON.stringify({ type: "turn.prompt", agentId: "agent-9", input: [{ type: "text", text: "tarde demais" }] })}\n`);
  assert.equal(await promptOfFile(wire), "", "it stops after the header lines instead of reading the whole file");
});

test("the subagents of earlier turns are read once and then left alone", async () => {
  const { dir, env } = bench();
  const seen = [];
  const watcher = subagentWatcher({ sessionId: "session_a", env, emit: (e) => seen.push(e), pollMs: 10 });

  const old = "Uma tarefa de um turno que ja acabou, com texto longo o bastante para servir de assinatura desta pasta";
  mkdirSync(join(dir, "agents", "agent-0"), { recursive: true });
  const stale = join(dir, "agents", "agent-0", "wire.jsonl");
  writeFileSync(stale, `${JSON.stringify({ type: "turn.prompt", agentId: "agent-0", input: [{ type: "text", text: old }] })}\n`);
  appendFileSync(stale, `${loopEvent("agent-0", { type: "tool.call", toolCallId: "velho", name: "Read", args: { path: "velho.js" } })}\n`);

  const fresh = "Uma tarefa nova, deste turno, que fala de outra coisa completamente diferente da anterior aqui";
  watcher.launched({ id: "0:tool_NEW", input: { subagent_type: "coder", description: "novo", prompt: fresh } });
  await settle(80);
  assert.equal(seen.length, 0, "the old folder is never adopted by a new launch");

  mkdirSync(join(dir, "agents", "agent-1"), { recursive: true });
  const wire = join(dir, "agents", "agent-1", "wire.jsonl");
  writeFileSync(wire, `${JSON.stringify({ type: "turn.prompt", agentId: "agent-1", input: [{ type: "text", text: fresh }] })}\n`);
  await settle();
  appendFileSync(wire, `${loopEvent("agent-1", { type: "tool.call", toolCallId: "t1", name: "Bash", args: { command: "ls" } })}\n`);
  await settle();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].parent_tool_use_id, "0:tool_NEW");
  assert.equal(seen[0].message.content[0].id, "agent-1:t1");
  watcher.stop();
});

test("a kimi that stops writing this file never breaks the turn", async () => {
  const troubles = [];
  const watcher = subagentWatcher({
    sessionId: "session_gone",
    env: { KIMI_CODE_HOME: join(tmpdir(), "kimi-home-that-is-not-there") },
    emit: () => assert.fail("nothing should be emitted"),
    onTrouble: (m) => troubles.push(m),
    pollMs: 10,
  });
  watcher.launched({ id: "0:tool_A", input: { subagent_type: "explore", description: "x", prompt: "um pedido qualquer que nao vai achar pasta nenhuma neste teste" } });
  await settle(80);
  assert.equal(troubles.length, 1, "it complains once and stays quiet after that");
  assert.match(troubles[0], /subagent progress/);
  watcher.stop();
});

test("a subagent launch wears the name the dock opens for", () => {
  assert.equal(toolName("Launching coder agent: Concluir frontend consulta de aluno"), "agent");
  assert.equal(toolName("Launching explore agent: achar tela de gestão da liga"), "agent");
  assert.equal(toolName("Agent"), "agent");
  assert.equal(toolName("launching agents"), "agent");
  assert.equal(toolName("Reading media: /tmp/shot.png"), "reading_media:_/tmp/shot.png");
  assert.equal(toolName("Launching the rocket"), "launching_the_rocket");
  assert.equal(toolName("mcp__hive__publish"), "mcp__hive__publish");
  assert.equal(toolName("Anything", "execute"), "shell");
});

test("the launch card says what the subagent was sent to do", () => {
  const input = toolInput("agent", { description: "Concluir frontend consulta de aluno", prompt: "Você vai concluir..." }, "Launching coder agent: Concluir frontend");
  assert.equal(input.description, "Concluir frontend consulta de aluno");
});

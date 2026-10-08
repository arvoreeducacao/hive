import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_CHROME, deriveState, modelOnScreen, readScreen } from "../lib/screen.mjs";

const noStatus = { last: null, summary: "" };
const state = (screen, agent) => {
  const seen = readScreen(screen, agent);
  return deriveState(seen.lines, noStatus, null, seen.running, agent);
};

/* every screen below was captured off the real terminal in tmux on 2026-09-03 */
const CODEX_WORKING = `› Rode o comando shell sleep 30 e depois conte de 1 ate 20
• Vou aguardar os 30 segundos no shell e, quando terminar, imprimir de 1 a 20, um número por linha.
• Working (7s • esc to interrupt) · 1 background terminal running · /ps to view · /stop to close
› Ask Codex to do anything
  gpt-5.6-sol default fast · ~/Projects/Work/acme-hub`;
const CODEX_IDLE = `  Foi pedido aguardar 30 segundos e contar de 1 a 20.
  O comando terminou normalmente.
────────────────────────────────────────────────
› Ask Codex to do anything
  gpt-5.6-sol default fast · ~/Projects/Work/acme-hub`;
const CODEX_DIALOG = `  ✨ Update available! 0.145.0 -> 0.151.0
› 1. Update now (runs \`sh -c 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'\`)
  2. Skip
  3. Skip until next version
  Press enter to continue`;
const KIMI_WORKING = ` ● Run sleep 30, then count 1-20.
 ● Running a command
   $ sleep 30
  🌕 · Tip: Try /dance for a hidden Easter egg
 ╭──────────────────────────────╮
 │ >                            │
 ╰──────────────────────────────╯
 Ask When Needed  K2.7 Coding thinking  …/Projects/Work/acme-hub  main`;
const KIMI_IDLE = `   Resumo:
   • Pedido: rodar sleep 30 e depois contar de 1 a 20, um número por linha.
 ╭──────────────────────────────╮
 │ >                            │
 ╰──────────────────────────────╯
 Ask When Needed  K2.7 Coding thinking  …/Projects/Work/acme-hub  main`;
const KIMI_DIALOG = `    slack-advanced (http): url=http://127.0.0.1:4671/mcp/slack-advanced
   ❯ Trust this folder
     Enable project MCP servers. Remembered for this folder.
     Don't trust
     Exit Kimi Code. Asked again next launch.
 ────────────────────────────────`;
const KIRO_WORKING = `● Thought for 1s...
    ╰ I need to pause for 30 seconds and then count from 1 to 20.
◔ Shell sleep 30
  esc to cancel
────────────────────────────────
 Trust All Tools active, confirmations are off · /quit to exit
────────────────────────────────
kiro_default · claude-opus-4.8 · ◔ 3%
›  Kiro is working · Type to steer · Ctrl+S to queue`;
const KIRO_IDLE = `  20
  Rodei sleep 30 (terminou sem erro, exit 0) e depois contei de 1 a 20, um número por linha. Nada mais pendente.
▸ Credits: 0.38 • Time: 36s
────────────────────────────────
 Trust All Tools active, confirmations are off · /quit to exit
────────────────────────────────
kiro_default · claude-opus-4.8 · ◔ 3%
›  ask a question or describe a task ↵`;
const KIRO_DIALOG = ` By proceeding, you confirm that you understand the risks and accept responsibility for all actions taken during this session.
 ❯ No, exit
   Yes, I accept
   Yes, and don't ask again
 ────────────────────────────────
  esc to cancel · ↑↓ to navigate · ↵ to select`;
const OPENCODE_WORKING = `     ⠋ Thinking
     ▣  Build · Kimi K3
  ┃  Build · Kimi K3 Kimi For Coding · max
  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   ⬝⬝⬝■■■■■  esc interrupt                       tab agents  ctrl+p commands`;

test("a codex terminal reads working, idle and asking off its own footer", () => {
  assert.equal(state(CODEX_WORKING, "codex"), "working");
  assert.equal(state(CODEX_IDLE, "codex"), "idle");
  assert.equal(state(CODEX_DIALOG, "codex"), "needs");
});

test("a kimi terminal reads working, idle and asking off its own footer", () => {
  assert.equal(state(KIMI_WORKING, "kimi"), "working");
  assert.equal(state(KIMI_IDLE, "kimi"), "idle");
  assert.equal(state(KIMI_DIALOG, "kimi"), "needs");
});

test("a kiro terminal reads working, idle and asking off its own footer", () => {
  assert.equal(state(KIRO_WORKING, "kiro"), "working");
  assert.equal(state(KIRO_IDLE, "kiro"), "idle", "kiro's idle footer still carries the word cancel somewhere in its history");
  assert.equal(state(KIRO_DIALOG, "kiro"), "needs");
});

test("an opencode terminal reads working off its spinner", () => {
  assert.equal(state(OPENCODE_WORKING, "opencode"), "working");
  assert.equal(state("  ┃  Build · Kimi K3\n   tab agents  ctrl+p commands", "opencode"), "idle");
});

test("claude's chrome is untouched, and an agent nobody knows reads as claude", () => {
  const claude = "· Thinking… (3s · esc to interrupt)";
  assert.equal(readScreen(claude).running, true);
  assert.equal(readScreen(claude, "pi").running, true);
  assert.equal(readScreen(CODEX_WORKING).running, true, "codex's footer happens to carry claude's words too");
  assert.equal(readScreen(KIRO_WORKING).running, false, "claude's pattern does not read kiro — that was the whole bug");
  assert.deepEqual(Object.keys(AGENT_CHROME), ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
});

test("codex and kiro say their model on the footer; kimi keeps the model the seat opened with", () => {
  assert.equal(modelOnScreen(readScreen(CODEX_IDLE, "codex").lines, "codex"), "gpt-5.6-sol");
  assert.equal(modelOnScreen(readScreen(KIRO_IDLE, "kiro").lines, "kiro"), "claude-opus-4.8");
  assert.equal(modelOnScreen(readScreen(KIMI_IDLE, "kimi").lines, "kimi"), "");
  assert.equal(modelOnScreen(readScreen(CODEX_IDLE, "codex").lines, "claude"), "");
});

test("the server reads every terminal through the chrome of the agent that runs it", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /readScreen\(screen, seatRecord\("local", name\)\?\.agent \|\| "claude"\)/);
  assert.match(server, /readScreen\(d\.screen, seatRecord\("cloud", name\)\?\.agent \|\| "claude"\)/);
  assert.match(server, /deriveState\(lines, status, thinking, running, agent\)/);
  assert.match(server, /findModel\(name, lines, agent\)/);
  assert.match(server, /const thinking = agent === "claude" \? findThinking\(lines\) : null;/);
});

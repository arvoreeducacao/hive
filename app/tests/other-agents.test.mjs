import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/app/chat-and-panes.js", import.meta.url), "utf8");
const hubPath = readFileSync(new URL("../lib/hub-path.mjs", import.meta.url), "utf8");
const cut = (text, from, to) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${from} is not in the source`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${to} does not follow ${from}`);
  return text.slice(a, b);
};

test("the doctor calls a machine ready with any agent signed in, codex, kimi, kiro, cursor or opencode as much as claude", () => {
  const look = cut(server, "async function machineLook()", "function serverAddressOf");
  assert.match(look, /const \[agents, providers\] = await Promise\.all\(\[otherAgentsOnThisMachine\(\), readProviders\(true\)/);
  assert.match(look, /needed: d\.posixOnly && process\.platform === "win32" \? false : d\.forCluster \? wantsCluster : d\.forSeats \? !anotherAgentHere : true/, "the claude binary is still demanded of a machine that only runs other agents");
  assert.match(look, /machine\.providers\.some\(\(one\) => one\.ready\)/, "a machine with an agent installed but nobody signed in is called ready");
  const deps = cut(server, "const DEPS = [", "];");
  assert.match(deps, /name: "claude".*forSeats: true/);
  const binaries = cut(server, "const SEAT_AGENT_BINARIES = ", ";");
  for (const agent of ["codex", "kimi", "kiro", "cursor", "opencode"]) assert.ok(binaries.includes(agent), `${agent} is not looked for`);
  assert.match(binaries, /kiro: "kiro-cli"/);
  assert.match(binaries, /cursor: "cursor-agent"/);
});

test("a hub is recognised by its AGENTS.md as much as by its CLAUDE.md, and a plain folder of repositories is accepted too", () => {
  assert.match(hubPath, /export const HUB_MARKERS = \["hub\.yaml", "CLAUDE\.md", "AGENTS\.md"\];/);
  const looks = cut(hubPath, "export function hubLookOf(", "export function makeHub(");
  assert.match(looks, /instructions: HUB_MARKERS\.some/);
  assert.equal((looks.match(/ok: false/g) || []).length, 3, "only an empty field, a bad path or a missing folder may refuse the workspace");
  assert.match(server, /function hubLooks\(path\) \{\n  return hubLookOf\(path, homedir\(\)\);/);
  const guess = cut(server, "function guessHub()", "function hubLooks(path)");
  assert.match(guess, /HUB_MARKERS\.some/);
});

test("/config, /agents and /plane-mode on a seat of another agent answer with a line, instead of sending the text as a message", () => {
  assert.match(panes, /const CLAUDE_ONLY_COMMANDS = new Set\(\["config", "agents", "plane-mode"\]\);/);
  const run = cut(panes, "async function runNativeCommand(e, cmd, arg) {", 'if (cmd === "model" && arg) {');
  assert.match(run, /CLAUDE_ONLY_COMMANDS\.has\(cmd\) && seatAgent\(e\) !== "claude"/);
  assert.match(run, /is Claude Code's own/);
});

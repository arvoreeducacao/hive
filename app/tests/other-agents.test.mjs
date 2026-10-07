import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/app/chat-and-panes.js", import.meta.url), "utf8");
const cut = (text, from, to) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${from} is not in the source`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${to} does not follow ${from}`);
  return text.slice(a, b);
};

test("the doctor calls a machine ready with codex, kimi, kiro, cursor or opencode on it, even with no Claude login", () => {
  const look = cut(server, "async function machineLook()", "function serverAddressOf");
  assert.match(look, /const agents = await otherAgentsOnThisMachine\(\);/);
  assert.match(look, /needed: d\.posixOnly && process\.platform === "win32" \? false : d\.forCluster \? wantsCluster : d\.forSeats \? !anotherAgentHere : true/, "the claude binary is still demanded of a machine that only runs other agents");
  assert.match(look, /\(machine\.claude\.loggedIn \|\| anotherAgentHere\)/);
  const deps = cut(server, "const DEPS = [", "];");
  assert.match(deps, /name: "claude".*forSeats: true/);
  const binaries = cut(server, "const SEAT_AGENT_BINARIES = ", ";");
  for (const agent of ["codex", "kimi", "kiro", "cursor", "opencode"]) assert.ok(binaries.includes(agent), `${agent} is not looked for`);
  assert.match(binaries, /kiro: "kiro-cli"/);
  assert.match(binaries, /cursor: "cursor-agent"/);
});

test("a hub is recognised by its AGENTS.md as much as by its CLAUDE.md", () => {
  assert.match(server, /const HUB_MARKERS = \["hub\.yaml", "CLAUDE\.md", "AGENTS\.md"\];/);
  const looks = cut(server, "function hubLooks(path)", "async function localClaude");
  assert.match(looks, /HUB_MARKERS\.some/);
  assert.match(looks, /no hub\.yaml, CLAUDE\.md or AGENTS\.md there/);
  const guess = cut(server, "function guessHub()", "const HUB_MARKERS");
  assert.match(guess, /HUB_MARKERS\.some/);
});

test("/config, /agents and /plane-mode on a seat of another agent answer with a line, instead of sending the text as a message", () => {
  assert.match(panes, /const CLAUDE_ONLY_COMMANDS = new Set\(\["config", "agents", "plane-mode"\]\);/);
  const run = cut(panes, "async function runNativeCommand(e, cmd, arg) {", 'if (cmd === "model" && arg) {');
  assert.match(run, /CLAUDE_ONLY_COMMANDS\.has\(cmd\) && seatAgent\(e\) !== "claude"/);
  assert.match(run, /is Claude Code's own/);
});

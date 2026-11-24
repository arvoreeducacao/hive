import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seatArgv, seatCommand } from "../../server/engine/seat-command.mjs";

const driver = readFileSync(new URL("../../server/engine/driver.mjs", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const sessions = readFileSync(new URL("../../server/sessions.mjs", import.meta.url), "utf8");

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to}`);
  return src.slice(a, b);
}

const seat = { hub: "/hub", name: "orca", stateDir: "/home/.hive", structured: true, driver: "/x/driver.mjs", agent: "claude" };

test("a new Claude chat born in fast mode carries --fast to its driver, in both ways a seat is opened", () => {
  assert.match(seatCommand({ ...seat, fast: true }), / --fast/);
  assert.ok(seatArgv({ ...seat, fast: true }).args.includes("--fast"));
  assert.doesNotMatch(seatCommand(seat), /--fast/);
  assert.doesNotMatch(seatCommand({ ...seat, agent: "codex", fast: true }), /--fast/, "a provider without fast mode was told to go fast");
  assert.ok(!seatArgv({ ...seat, structured: false, fast: true }).args.includes("--fast"), "the terminal chat was told to go fast");
});

test("the spawn passes fast mode from the draft to the local seat", () => {
  const birth = slice(server, "async function newChat({", "  rememberSeat({");
  assert.match(birth, /fast = false/);
  assert.match(birth, /seatInATmuxWindow\(\{ name, model, effort, fast: fast === true,/);
});

test("the Claude driver turns fast mode on and off through the session's flag settings and keeps it across naps", () => {
  assert.match(driver, /let fastMode = typeof storedSession\.fast === "boolean" \? storedSession\.fast : bornFast;/);
  assert.match(driver, /if \(fastMode\) options\.settings = \{ \.\.\.\(options\.settings \|\| \{\}\), fastMode: true \};/);
  const wear = slice(driver, "async function wearFastMode(on) {", "let effortRestored");
  assert.match(wear, /session\.applyFlagSettings\(\{ fastMode: on \}\)/);
  assert.match(wear, /persistSession\(\{ fast: on \}\)/);
  assert.match(wear, /options\.settings = \{ \.\.\.\(options\.settings \|\| \{\}\), fastMode: on \}/, "a session reopened after a nap forgets fast mode");
  const op = slice(driver, "setFast: async () => {", "setMode: async () => {");
  assert.match(op, /supportsFastMode/, "fast mode is asked of a model that has none");
  assert.match(driver, /current: \{ model: currentModel, effort, from: [^}]*fast: fastMode \}/);
  assert.match(slice(driver, "setModel: async () => {", "mcpReconnect:"), /if \(fastMode && chosen && !chosen\.supportsFastMode\) await wearFastMode\(false\)/);
});

test("a custom model the person added is let through the driver's catalogue check", () => {
  assert.match(slice(driver, "setModel: async () => {", "mcpReconnect:"), /if \(cmd\.model && !chosen && models\.length && cmd\.custom !== true\)/);
});

test("the Claude driver predicts the next prompt only when the person turned it on", () => {
  assert.match(driver, /if \(promptSuggestionsWanted\(\{ env: process\.env, anonymous \}\)\) options\.promptSuggestions = true;/);
});

test("a fast-mode change and a predicted prompt do not count as the chat working", () => {
  assert.match(sessions, /"prompt_suggestion"\]\);/);
  assert.match(sessions, /"fast_changed"/);
});

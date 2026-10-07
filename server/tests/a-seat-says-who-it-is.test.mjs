import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL("..", import.meta.url).pathname;
const read = (file) => readFileSync(join(HERE, file), "utf8");

const DRIVERS = [
  ["driver.mjs", 'agent: "claude"', "currentModel || chosenModel"],
  ["codex-driver.mjs", "agent: AGENT", "model, effort"],
  ["kimi-driver.mjs", "agent: AGENT", "model, effort"],
  ["kiro-driver.mjs", "agent: AGENT", "model, effort"],
  ["cursor-driver.mjs", "agent: AGENT", "model, effort"],
  ["opencode-driver.mjs", "agent: AGENT", "model, effort"],
  ["turn-driver.mjs", "agent: agentName", "model, effort"],
];

function stateReply(source) {
  const at = source.indexOf('cmd.type === "state"');
  assert.notEqual(at, -1, "every driver answers state");
  return source.slice(at, source.indexOf("\n  }", at));
}

test("every driver says who it is and what it runs when asked for its state", () => {
  for (const [file, agent, model] of DRIVERS) {
    const said = stateReply(read(join("engine", file)));
    assert.ok(said.includes(agent), `${file} names its provider in state`);
    assert.ok(said.includes(model), `${file} names its model in state`);
    assert.ok(said.includes("effort"), `${file} names its thinking level in state`);
  }
});

test("the pane fills in what it does not know from the driver's answer", () => {
  const pane = read("../app/src/app/structured-seats.js");
  const at = pane.indexOf("async function refreshDriverState");
  assert.notEqual(at, -1);
  const body = pane.slice(at, pane.indexOf("\n}", at));
  assert.match(body, /state\.agent && !e\.agent/, "the driver's answer fills an agent the pane never learned");
  assert.match(body, /state\.model && !e\.model/, "and the model");
  assert.match(body, /paintPills\(e\)/, "and the footer is repainted once it knows");
  assert.doesNotMatch(body, /^\s*e\.(agent|model|effort) = state\./m, "what the pane already knows is never overwritten: every fill sits behind a guard");
});

test("the pane still reads a seat it knows nothing about as claude, so nothing breaks while it asks", () => {
  const pane = read("../app/src/app/chat-and-panes.js");
  assert.match(pane, /AGENT_NAMES\[e\.agent\] \|\| "claude"/, "the fallback stays: the answer arrives a moment after the socket opens");
});

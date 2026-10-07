import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seatCommand, seatArgv } from "../engine/seat-command.mjs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

const claudeSeat = {
  name: "claude-test", hub: "/hub", stateDir: "/state", agent: "claude",
  model: "opus", effort: "high", structured: true, driver: "/engine/driver.mjs",
};

test("a claude seat born on a thinking level carries it into the driver, and its TUI does not", () => {
  assert.match(seatCommand(claudeSeat), /--effort high/);
  const args = seatArgv(claudeSeat).args;
  assert.equal(args[args.indexOf("--effort") + 1], "high");
  assert.doesNotMatch(seatCommand({ ...claudeSeat, structured: false }), /--effort/);
  assert.ok(!seatArgv({ ...claudeSeat, structured: false }).args.includes("--effort"));
});

test("the claude driver takes the level from its own command line", () => {
  const driver = read("../engine/driver.mjs");
  assert.match(driver, /let effortLevel = arg\("--effort", ""\)/, "the flag seeds the level the seat runs at");
  assert.match(driver, /if \(storedSession\.effort\) effortLevel = storedSession\.effort/, "a seat that already has a history keeps its own level");
});

test("the level is there before the first turn, and max still arrives the late way", () => {
  const driver = read("../engine/driver.mjs");
  const born = /const EFFORTS_A_SESSION_CAN_BE_BORN_ON = (\[[^\]]*\])/.exec(driver);
  assert.ok(born, "the levels a session can open on are named");
  assert.deepEqual(JSON.parse(born[1].replace(/'/g, '"')), ["low", "medium", "high", "xhigh"], "max is session-scoped and has no settings key of its own");
  assert.match(driver, /if \(EFFORTS_A_SESSION_CAN_BE_BORN_ON\.includes\(effortLevel\)\) options\.settings = \{ effortLevel \}/);
  const at = driver.indexOf("function restoreEffort() {");
  const body = driver.slice(at, driver.indexOf("\n}", at));
  assert.match(body, /persistSession\(\{ effort: effortLevel \}\)/, "so reviving the seat finds the level it was born on");
  assert.match(body, /applyFlagSettings\(\{ effortLevel \}\)/, "max, and every revived seat, still goes through the control request");
});

function draftRule() {
  const pane = read("../../app/src/app/chat-and-panes.js");
  const names = /const AGENT_NAMES = \{[^}]*\};/.exec(pane);
  const table = /const DRAFT_EFFORT_KINDS = \{[^}]*\};/.exec(pane);
  const at = pane.indexOf("function draftCarriesEffort(");
  assert.ok(names && table && at >= 0);
  return new Function(`${names[0]}\n${table[0]}\n${pane.slice(at, pane.indexOf("\n}", at))}\n}\nreturn draftCarriesEffort;`)();
}

test("a new chat offers the thinking pill exactly where the level survives the spawn", () => {
  const carries = draftRule();
  assert.ok(carries("claude", "structured"), "the claude driver now takes --effort");
  assert.ok(!carries("claude", "terminal"), "the claude CLI has no flag for it");
  assert.ok(carries("codex", "structured"));
  assert.ok(carries("codex", "terminal"), "codex passes it as a config override");
  assert.ok(carries("kimi", "structured"));
  assert.ok(!carries("kimi", "terminal"), "the kimi TUI has no flag for it");
  assert.ok(!carries("kiro", "structured"));
  assert.ok(!carries("cursor", "structured"));
  assert.ok(!carries("opencode", "structured"));
});

test("the draft and the pill read the same rule, so the pick is never taken and then dropped", () => {
  const pane = read("../../app/src/app/chat-and-panes.js");
  const draft = read("../../app/src/app/draft-seat.js");
  assert.match(pane, /if \(e\.draft && !draftCarriesEffort\(e\.agent, e\.draftKind\)\)/);
  assert.match(draft, /draftCarriesEffort\(d\.e\.agent, d\.kind\) && d\.e\.effort \? \{ effort: d\.e\.effort \} : \{\}/);
});

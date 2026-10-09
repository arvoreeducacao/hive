import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_HUB_YET, NOT_THERE, hubLookOf, makeHub } from "../lib/hub-path.mjs";
import { firstFlightAgentOf, firstFlightMission } from "../lib/first-flight.mjs";

const scratch = () => mkdtempSync(join(tmpdir(), "hub-"));

test("an empty hub field says what to type instead of leaving the continue button dead", () => {
  assert.deepEqual(hubLookOf("   ", "/home/ada"), { ok: false, why: NO_HUB_YET });
});

test("a folder that is not there yet is offered to be made", () => {
  const home = scratch();
  try {
    assert.deepEqual(hubLookOf("~/work", home), { ok: false, why: NOT_THERE, missing: true });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("making a hub writes the starter files the agents read, and the hub then looks ready", () => {
  const home = scratch();
  try {
    const made = makeHub("~/work", home);
    assert.deepEqual(made, { ok: true, path: join(home, "work"), wrote: true });
    assert.match(readFileSync(join(home, "work", "AGENTS.md"), "utf8"), /hive hub/);
    assert.equal(readFileSync(join(home, "work", "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
    assert.match(readFileSync(join(home, "work", ".gitignore"), "utf8"), /^\.hive\/$/m);
    assert.deepEqual(hubLookOf("~/work", home), { ok: true, instructions: true, env: false });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("making a hub over a folder that already has instructions leaves them alone", () => {
  const home = scratch();
  try {
    mkdirSync(join(home, "work"));
    writeFileSync(join(home, "work", "CLAUDE.md"), "ours\n");
    assert.equal(makeHub("~/work", home).wrote, false);
    assert.equal(readFileSync(join(home, "work", "CLAUDE.md"), "utf8"), "ours\n");
    assert.equal(existsSync(join(home, "work", "AGENTS.md")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("making a hub refuses a relative path", () => {
  assert.ok(makeHub("work", "/home/ada").error);
});

test("the first chat runs on claude when it is signed in, and on whatever else is when it is not", () => {
  assert.equal(firstFlightAgentOf([{ id: "codex", name: "Codex" }, { id: "claude", name: "Claude" }]).id, "claude");
  assert.deepEqual(firstFlightAgentOf([{ id: "codex", name: "Codex" }]), { id: "codex", name: "Codex", harness: "Codex" });
  assert.equal(firstFlightAgentOf([]).id, "claude");
});

test("the first chat's mission names the agent it runs on and does not assume Claude's question tool", () => {
  const mission = firstFlightMission("ada", { agent: "Codex" });
  assert.match(mission, /runs as a Codex process/);
  assert.match(mission, /request_user_input in Codex/);
});

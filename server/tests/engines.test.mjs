import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, agentOf, driverArgs, driverFor } from "../sessions.mjs";

const DRIVER = "/app/server/engine/driver.mjs";

test("the engine a caller names is only taken when the server knows it", () => {
  for (const one of AGENTS) assert.equal(agentOf(one), one);
  assert.equal(agentOf(""), "claude");
  assert.equal(agentOf(undefined), "claude");
  assert.equal(agentOf("CLAUDE"), "claude");
  assert.equal(agentOf(" opencode "), "opencode");
  for (const bad of ["bash", "../../etc/passwd", "claude; rm -rf /", "turn-driver"]) {
    assert.equal(agentOf(bad), "", `${bad} should not be an engine`);
  }
});

test("the box opens every agent the drivers know, kimi and kiro included", () => {
  for (const one of ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]) assert.equal(agentOf(one), one, `${one} cannot open on the box`);
});

test("claude runs the driver, codex its app-server driver and opencode its server driver", () => {
  assert.equal(driverFor(DRIVER, "claude"), DRIVER);
  assert.equal(driverFor(DRIVER, "opencode"), "/app/server/engine/opencode-driver.mjs");
  assert.equal(driverFor(DRIVER, "codex"), "/app/server/engine/codex-driver.mjs");
  assert.equal(driverFor(DRIVER, "kimi"), "/app/server/engine/kimi-driver.mjs");
  assert.deepEqual(driverArgs({ name: "revisao", agent: "kimi" }), ["--agent", "kimi", "--name", "revisao"]);
  assert.equal(driverFor(DRIVER, "kiro"), "/app/server/engine/kiro-driver.mjs");
  assert.deepEqual(driverArgs({ name: "revisao", agent: "kiro" }), ["--agent", "kiro", "--name", "revisao"]);
  assert.equal(driverFor(DRIVER, "cursor"), "/app/server/engine/cursor-driver.mjs");
  assert.deepEqual(driverArgs({ name: "revisao", agent: "cursor" }), ["--agent", "cursor", "--name", "revisao"]);
});

test("the engine goes on the command line only when it is not claude", () => {
  assert.deepEqual(driverArgs({ name: "revisao", agent: "claude" }), ["--name", "revisao"]);
  assert.deepEqual(driverArgs({ name: "revisao", agent: "codex" }), ["--agent", "codex", "--name", "revisao"]);
  assert.deepEqual(
    driverArgs({ name: "revisao", cwd: "/repo", model: "opus", promptFile: "/p.md", resumeId: "s1" }),
    ["--name", "revisao", "--cwd", "/repo", "--model", "opus", "--prompt-file", "/p.md", "--resume-id", "s1"]
  );
});

test("what the launcher reads back off the arguments is the engine that was asked for", () => {
  for (const one of ["claude", "opencode", "codex"]) {
    const args = driverArgs({ name: "revisao", agent: one });
    const read = args[0] === "--agent" ? args[1] : "claude";
    assert.equal(read, one);
    assert.equal(driverFor(DRIVER, read), one === "claude" ? DRIVER : one === "codex" ? "/app/server/engine/codex-driver.mjs" : "/app/server/engine/opencode-driver.mjs");
  }
});

import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBroker } from "../server.mjs";

test("the server opens a seat for each engine it knows, and refuses the ones it does not", async () => {
  const home = mkdtempSync(join(tmpdir(), "engines-"));
  const asked = [];
  const broker = createBroker({
    home, stateDir: home, name: "prova",
    driverPath: "/fake/server/engine/driver.mjs",
    launch: (args) => { asked.push(args); return { pid: 1, on() {}, kill() {}, stdout: { on() {} }, stderr: { on() {} } }; }
  });
  try {
    assert.equal((await broker.sessions.open({ name: "com-claude", cwd: home, agent: "claude" })).error, undefined);
    assert.deepEqual(asked[0].slice(0, 2), ["--name", "com-claude"]);

    assert.equal((await broker.sessions.open({ name: "com-codex", cwd: home, agent: "codex" })).error, undefined);
    assert.deepEqual(asked[1].slice(0, 4), ["--agent", "codex", "--name", "com-codex"]);

    const bad = await broker.sessions.open({ name: "com-bash", cwd: home, agent: "bash" });
    assert.match(bad.error, /not an engine/);
    assert.equal(asked.length, 2, "it started something for an engine it does not know");

    assert.ok(existsSync(join(home, "events")), "the events folder the app reads was not made");
  } finally {
    broker.sessions.stop();
    broker.http.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("a seat born on the server writes where the app already looks", async () => {
  const home = mkdtempSync(join(tmpdir(), "engines-"));
  const broker = createBroker({ home, stateDir: home, name: "prova", driverPath: "/fake/driver.mjs", launch: () => ({ pid: 1, on() {}, kill() {}, stdout: { on() {} }, stderr: { on() {} } }) });
  try {
    assert.equal(broker.stateDir, home, "the seats live somewhere other than the state dir the app passes");
  } finally {
    broker.sessions.stop();
    broker.http.close();
    rmSync(home, { recursive: true, force: true });
  }
});

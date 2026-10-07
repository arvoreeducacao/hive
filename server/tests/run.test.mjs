import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ARG_CEILING, DEFAULT_TIMEOUT, SCRIPT_CEILING, TIMEOUT_CEILING, createRun, refuse, timeoutAsked } from "../run.mjs";

const outOf = (said) => Buffer.from(said.out, "base64").toString("utf8");

test("a run without a script, or with arguments that are not a list, never reaches a shell", () => {
  assert.match(refuse({ script: "" }), /needs a script/);
  assert.match(refuse({ script: "   " }), /needs a script/);
  assert.match(refuse({ script: "echo", args: "não é lista" }), /have to be a list/);
  assert.match(refuse({ script: "echo", args: Array(ARG_CEILING + 1).fill("a") }), /at most/);
  assert.match(refuse({ script: "echo", args: [1, 2] }), /has to be a string/);
  assert.match(refuse({ script: "a".repeat(SCRIPT_CEILING + 1) }), /past the/);
  assert.equal(refuse({ script: "echo oi", args: ["um"] }), "");
});

test("a run is given a deadline whether it asked for one or not", () => {
  assert.equal(timeoutAsked(undefined), DEFAULT_TIMEOUT);
  assert.equal(timeoutAsked(0), DEFAULT_TIMEOUT);
  assert.equal(timeoutAsked("nonsense"), DEFAULT_TIMEOUT);
  assert.equal(timeoutAsked(5000), 5000);
  assert.equal(timeoutAsked(TIMEOUT_CEILING * 10), TIMEOUT_CEILING, "a run could be asked to hold a slot forever");
});

test("the script runs in the workspace, is handed its arguments, and answers with what it printed", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "hive-run-")));
  mkdirSync(join(workspace, "repos"), { recursive: true });
  writeFileSync(join(workspace, "repos", "a.txt"), "conteudo\n");
  const runner = createRun({ workspace, hub: join(workspace, "repos"), env: { PATH: process.env.PATH } });

  const said = await runner.run({ script: 'printf "%s|%s|%s" "$(pwd)" "$1" "$2"', args: ["um", "dois"] });
  assert.ok(said.ok, said.err || said.error);
  assert.equal(outOf(said), `${workspace}|um|dois`);

  const walked = await runner.run({ script: "ls repos" });
  assert.equal(outOf(walked).trim(), "a.txt", "the run did not start in the workspace it was given");

  const named = await runner.run({ script: 'printf %s "$HIVE_WORKSPACE"' });
  assert.equal(outOf(named), workspace, "a script cannot find the workspace it is standing in");
});

test("what a run writes on stdin reaches the script, and bytes come back whole", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "hive-run-")));
  const runner = createRun({ workspace, hub: workspace, env: { PATH: process.env.PATH } });
  const said = await runner.run({ script: "cat", stdin: Buffer.from("acentuação e 🐝").toString("base64") });
  assert.ok(said.ok, said.err);
  assert.equal(outOf(said), "acentuação e 🐝", "a run mangles anything that is not plain ascii");
});

test("a script that fails says so, with what it put on the error stream and the code it gave", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "hive-run-")));
  const runner = createRun({ workspace, hub: workspace, env: { PATH: process.env.PATH } });
  const said = await runner.run({ script: 'echo "deu ruim" >&2; exit 3' });
  assert.equal(said.ok, false);
  assert.equal(said.code, 3);
  assert.match(said.err, /deu ruim/);
});

test("a run that never ends is cut off instead of holding the server", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "hive-run-")));
  const runner = createRun({ workspace, hub: workspace, env: { PATH: process.env.PATH } });
  const said = await runner.run({ script: "sleep 30", timeoutMs: 700 });
  assert.equal(said.ok, false, "a script that runs forever was reported as having finished");
});

test("a run reads a file the workspace holds, which is what the desktop used to shell in for", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "hive-run-")));
  mkdirSync(join(workspace, "repos", "hub"), { recursive: true });
  writeFileSync(join(workspace, "repos", "hub", "CLAUDE.md"), "o contrato\n");
  const runner = createRun({ workspace, hub: join(workspace, "repos"), env: { PATH: process.env.PATH } });
  const said = await runner.run({ script: 'cat "$1"', args: [join(workspace, "repos", "hub", "CLAUDE.md")] });
  assert.ok(said.ok, said.err);
  assert.equal(outOf(said), "o contrato\n");
  assert.equal(readFileSync(join(workspace, "repos", "hub", "CLAUDE.md"), "utf8"), "o contrato\n");
});

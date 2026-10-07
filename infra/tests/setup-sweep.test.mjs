import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SETUP = join(REPO, "infra", "scripts", "setup.sh");

function firstPath(result, tool) {
  assert.equal(result.status, 0, `${tool} could not be resolved: ${result.error?.message || result.stderr}`);
  const path = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  assert.ok(path, `${tool} resolved to an empty path`);
  return path;
}

const BASH = process.platform === "win32"
  ? firstPath(spawnSync("where.exe", ["bash"], { encoding: "utf8" }), "bash")
  : firstPath(spawnSync("bash", ["--noprofile", "--norc", "-c", "type -P bash"], { encoding: "utf8" }), "bash");

function bashTool(tool) {
  return firstPath(spawnSync(BASH, ["--noprofile", "--norc", "-c", `type -P ${tool}`], { encoding: "utf8" }), tool);
}

function machineWithTheTools(home) {
  const bin = join(home, "fakebin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["tmux", "gh"]) {
    writeFileSync(join(bin, tool), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, tool), 0o755);
  }
  return { ...process.env, HOME: home, HIVE_HOME: join(home, ".hive"), PATH: `${bin}:${process.env.PATH}` };
}

function machineOnWindows(home) {
  const bin = join(home, "winbin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["tmux", "gh"]) {
    writeFileSync(join(bin, tool), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, tool), 0o755);
  }
  writeFileSync(join(bin, "uname"), "#!/bin/sh\necho 'MINGW64_NT-10.0-22631'\n");
  chmodSync(join(bin, "uname"), 0o755);
  writeFileSync(join(bin, "cygpath"), "#!/bin/sh\nshift\necho \"WINPATH:$1\"\n");
  chmodSync(join(bin, "cygpath"), 0o755);
  return { ...process.env, HOME: home, HIVE_HOME: join(home, ".hive"), PATH: `${bin}:${process.env.PATH}` };
}

function machineWithoutTmux(home) {
  const bin = join(home, "barebin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["dirname", "uname", "rm", "rmdir"]) {
    const path = bashTool(tool).replace(/'/g, `'\\''`);
    writeFileSync(join(bin, tool), `#!/bin/sh\nexec '${path}' "$@"\n`);
    chmodSync(join(bin, tool), 0o755);
  }
  for (const tool of ["git", "gh"]) {
    writeFileSync(join(bin, tool), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, tool), 0o755);
  }
  return { HOME: home, HIVE_HOME: join(home, ".hive"), PATH: bin };
}

function machineThatRanTheOldSetup() {
  const home = mkdtempSync(join(tmpdir(), "hive-sweep-"));
  const bin = join(home, ".local", "bin");
  const hub = join(home, "workspace");
  mkdirSync(join(bin, "lib"), { recursive: true });
  mkdirSync(join(bin, "peer"), { recursive: true });
  mkdirSync(hub, { recursive: true });
  for (const left of ["hive", "hive-top.py", "door.mjs", "lib/pair.mjs", "peer/peer-mcp.mjs"]) {
    writeFileSync(join(bin, left), "from an older setup\n");
  }
  writeFileSync(join(bin, "my-own-script"), "not ours\n");
  const r = spawnSync("bash", [SETUP, "tester", hub], { env: machineWithTheTools(home), encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  return { bin, home, said: r.stdout };
}

test("setup really removes the command older runs left on the PATH, and only that", () => {
  const { bin, said } = machineThatRanTheOldSetup();
  for (const left of ["hive", "hive-top.py", "door.mjs", "lib/pair.mjs", "peer/peer-mcp.mjs"]) {
    assert.equal(existsSync(join(bin, left)), false, `${left} is still on the PATH after setup ran`);
  }
  assert.equal(existsSync(join(bin, "my-own-script")), true, "setup threw away a file that was never ours");
  assert.equal(existsSync(join(bin, "lib")), false, "the folder we emptied was left behind");
  assert.match(said, /removed the old hive command/);
});

test("setup installs nothing of its own, and says nothing about sweeping when there is nothing to sweep", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-sweep-"));
  const hub = join(home, "workspace");
  mkdirSync(hub, { recursive: true });
  const r = spawnSync("bash", [SETUP, "tester", hub], { env: machineWithTheTools(home), encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(existsSync(join(home, ".local", "bin", "hive")), false, "setup put a command back on the PATH");
  assert.doesNotMatch(r.stdout, /removed the old hive command/);
  assert.ok(existsSync(join(home, ".hive", "config")), "setup stopped writing the config, which is what it is for now");
});

test("on windows, HIVE_REPO is converted the same way HIVE_HUB already is", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-winrepo-"));
  const hub = join(home, "workspace");
  mkdirSync(hub, { recursive: true });
  const r = spawnSync("bash", [SETUP, "tester", hub], { env: machineOnWindows(home), encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const config = readFileSync(join(home, ".hive", "config"), "utf8");
  const repo = config.match(/^HIVE_REPO=(.*)$/m)?.[1] || "";
  const configuredHub = config.match(/^HIVE_HUB=(.*)$/m)?.[1] || "";
  assert.match(configuredHub, /^WINPATH:/, "HIVE_HUB lost its own windows conversion, so this test proves nothing");
  assert.match(repo, /^WINPATH:/, "HIVE_REPO was written straight from bash's own path, the one HIVE_HUB is converted away from");
});

test("a machine missing the tools it needs is still swept before it is told what is missing", { skip: process.platform === "win32" }, () => {
  const home = mkdtempSync(join(tmpdir(), "hive-sweep-"));
  const bin = join(home, ".local", "bin");
  const hub = join(home, "workspace");
  mkdirSync(bin, { recursive: true });
  mkdirSync(hub, { recursive: true });
  writeFileSync(join(bin, "hive"), "from an older setup\n");
  writeFileSync(join(bin, "door.mjs"), "from an older setup\n");
  const r = spawnSync(BASH, [SETUP, "tester", hub], {
    env: machineWithoutTmux(home),
    encoding: "utf8"
  });
  assert.notEqual(r.status, 0, "a machine without tmux was told everything is fine");
  assert.match(r.stderr, /missing dependencies/);
  assert.equal(existsSync(join(bin, "hive")), false, "the leftover survived because the script gave up before sweeping it");
  assert.equal(existsSync(join(bin, "door.mjs")), false, "the leftover survived because the script gave up before sweeping it");
});

test("a command of the person's own that happens to be called hive survives setup", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-sweep-"));
  const bin = join(home, ".local", "bin");
  const hub = join(home, "workspace");
  mkdirSync(join(bin, "lib"), { recursive: true });
  mkdirSync(hub, { recursive: true });
  writeFileSync(join(bin, "hive"), "#!/bin/sh\necho my own launcher\n");
  writeFileSync(join(bin, "lib", "keep.mjs"), "not ours\n");
  const r = spawnSync("bash", [SETUP, "tester", hub], { env: machineWithTheTools(home), encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(readFileSync(join(bin, "hive"), "utf8"), "#!/bin/sh\necho my own launcher\n", "setup deleted a hive that no older setup ever wrote");
  assert.equal(existsSync(join(bin, "lib", "keep.mjs")), true);
  assert.doesNotMatch(r.stdout, /removed the old hive command/);
});

test("the address and the pod name come from the deployment's own hook, never from setup", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-address-"));
  const repo = join(home, "repo");
  mkdirSync(join(repo, "infra", "scripts"), { recursive: true });
  mkdirSync(join(repo, "acme"), { recursive: true });
  const setup = join(repo, "infra", "scripts", "setup.sh");
  writeFileSync(setup, readFileSync(SETUP, "utf8"));
  writeFileSync(join(repo, "acme", "hive.defaults"), "HIVE_REPOS_OWNER=acme\n");
  const hook = join(repo, "acme", "hive-setup.sh");
  writeFileSync(hook, "#!/usr/bin/env bash\necho \"HIVE_SERVER_URL=https://box-$1.acme.example\"\necho \"HIVE_POD=box-$1\"\n");
  chmodSync(hook, 0o755);
  const hub = join(home, "workspace");
  mkdirSync(hub, { recursive: true });
  const r = spawnSync("bash", [setup, "ada", hub], { env: machineWithTheTools(home), encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const config = readFileSync(join(home, ".hive", "config"), "utf8").split("\n");
  for (const line of ["HIVE_SERVER_URL=https://box-ada.acme.example", "HIVE_POD=box-ada", "HIVE_REPOS_OWNER=acme", "HIVE_DEPLOYMENT_DIR=acme"]) {
    assert.ok(config.includes(line), `setup dropped what the deployment asked for: ${line}`);
  }
});

test("setup knows no address shape, no pod shape and no template of its own", () => {
  const script = readFileSync(SETUP, "utf8");
  assert.doesNotMatch(script, /ws-\$?\{?NAME/, "the pod naming habit of one deployment is back inside the script");
  assert.doesNotMatch(script, /https:\/\/hive-/, "the address shape of one deployment is back inside the script");
  assert.doesNotMatch(script, /TEMPLATE|\{name\}/, "setup is filling shapes in again instead of letting the deployment print its own");
  assert.match(script, /hive-setup\.sh/, "setup stopped asking the deployment for what only it knows");
});

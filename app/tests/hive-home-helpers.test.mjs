import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function twoHomes() {
  const root = mkdtempSync(join(tmpdir(), "hive-home-"));
  const home = join(root, "home");
  const hive = join(root, "second-hive");
  mkdirSync(home, { recursive: true });
  mkdirSync(hive, { recursive: true });
  return { root, home, hive };
}

function cleanEnv(extra) {
  const env = { ...process.env };
  for (const key of ["HIVE_SERVER_URL", "HIVE_STATE_DIR", "HIVE_HUB", "HIVE_SERVER_DIR"]) delete env[key];
  return { ...env, ...extra };
}

function checkoutOnABranch(hub) {
  const remote = join(hub, "repo.git");
  const dir = join(hub, "repo");
  execFileSync("git", ["init", "--bare", "-q", remote], { stdio: "ignore" });
  execFileSync("git", ["init", "-q", "-b", "main", dir], { stdio: "ignore" });
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("config", "user.email", "seat@hive");
  git("config", "user.name", "seat");
  git("remote", "add", "origin", remote);
  writeFileSync(join(dir, "a.txt"), "one");
  git("add", "-A");
  git("commit", "-qm", "one");
  git("checkout", "-qb", "ada/-/work");
}

test("autopush keeps its state under HIVE_HOME, so a second hive does not share the first one's memory of what it pushed", () => {
  const { root, home, hive } = twoHomes();
  const hub = join(root, "hub");
  mkdirSync(hub, { recursive: true });
  checkoutOnABranch(hub);
  const r = spawnSync(process.execPath, [join(APP, "autopush.mjs"), "--hub", hub], {
    env: cleanEnv({ HOME: home, HIVE_HOME: hive }),
    encoding: "utf8"
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(existsSync(join(hive, "autopush-state")), "autopush wrote no state where HIVE_HOME points");
  assert.equal(existsSync(join(home, ".hive", "autopush-state")), false, "autopush wrote into the default hive while HIVE_HOME named another");
});

test("pair reads the server address from the config under HIVE_HOME, not from the default hive", () => {
  const { home, hive } = twoHomes();
  writeFileSync(join(hive, "config"), "HIVE_SERVER_URL=http://127.0.0.1:9\n");
  mkdirSync(join(home, ".hive"), { recursive: true });
  const r = spawnSync(process.execPath, [join(APP, "lib", "pair.mjs"), "list"], {
    env: cleanEnv({ HOME: home, HIVE_HOME: hive, HIVE_STATE_DIR: hive }),
    encoding: "utf8"
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /no address written down/, "pair ignored the config of the hive HIVE_HOME names");
  assert.match(r.stderr, /no hive key yet/, "pair stopped before it reached the key, so this test proves nothing");
});

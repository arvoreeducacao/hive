import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(HERE, "engine", file), "utf8");

const DRIVERS = {
  "codex-driver.mjs": { env: "childEnv", busy: /busy: \(\) => gate\.busy \|\| gate\.queued \|\| pendingQuestions\.size > 0/ },
  "kimi-driver.mjs": { env: "childEnv", busy: /busy: \(\) => gate\.busy \|\| gate\.queued \|\| !!turning/ },
  "kiro-driver.mjs": { env: "childEnv", busy: /busy: \(\) => gate\.busy \|\| gate\.queued \|\| !!turning/ },
  "cursor-driver.mjs": { env: "childEnv", busy: /busy: \(\) => gate\.busy \|\| gate\.queued \|\| !!turning/ },
  "opencode-driver.mjs": { env: "childEnv", busy: /busy: \(\) => gate\.busy \|\| gate\.queued \|\| pendingQuestions\.size > 0/ },
  "turn-driver.mjs": { env: "turnEnv", busy: /busy: \(\) => !!current \|\| queue\.length > 0/ },
};

for (const [file, shape] of Object.entries(DRIVERS)) {
  const driver = read(file);

  test(`${file}: the seat is born on the login its environment names, and walks with the shared failover`, () => {
    assert.match(driver, /import \{ accountFailover \} from "\.\/failover\.mjs";/);
    assert.match(driver, /bornIn: accountDirFromEnv\((?:AGENT|agentName), process\.env\)/);
    assert.match(driver, shape.busy);
    assert.match(driver, /persistSession\(\{ home: logins\.home \}\)/);
    assert.match(driver, /setInterval\(\(\) => \{ logins\.goHome\(\)\.catch\(\(\) => \{\}\); \}, 60000\)/);
  });

  test(`${file}: every child the seat spawns runs inside the login's folder`, () => {
    assert.doesNotMatch(driver, /env: process\.env/, "a child still runs on the process env, so a moved login would not reach it");
    assert.match(driver, new RegExp(`env: ${shape.env}`));
  });

  test(`${file}: a refusal is read per agent and the turn goes on elsewhere before the gate lets go`, () => {
    assert.match(driver, /providerRanDry\((?:AGENT|agentName), /);
    assert.match(driver, /logins\.turnEnded\(spent\)\.then\(\(moved\) => \{/);
  });

  test(`${file}: the app can ask which login the seat is on and move it between turns`, () => {
    assert.match(driver, /subtype: "started"[^}]*account: logins\.name/);
    assert.match(driver, /account: logins\.name \}/);
    assert.match(driver, /setAccount: async \(\) => \{\s*if \((?:gate\.busy|current \|\| queue\.length)\) throw new Error\("this chat is mid-turn/);
  });
}

test("the long-lived drivers close their child on a move, so the next message reopens it on the new login", () => {
  for (const file of ["codex-driver.mjs", "kimi-driver.mjs", "kiro-driver.mjs", "cursor-driver.mjs", "opencode-driver.mjs"]) {
    assert.match(read(file), /function childTakesLogin\(dir\) \{[\s\S]*?childEnv = \{ \.\.\.inherited, \.\.\.providerEnv\(AGENT, dir\) \};\s*client\?\.close\(\);\s*client = null;/, file);
  }
});

test("the turn driver only swaps the env — every turn is a fresh process — and replays the turn that died", () => {
  const driver = read("turn-driver.mjs");
  assert.match(driver, /apply: \(\{ dir \}\) => \{ turnEnv = envForTurns\(dir\); \}/);
  assert.match(driver, /redo: \(\) => \{ if \(!lastTurn\) return false; queue\.unshift\(lastTurn\); pump\(\); return true; \}/);
});

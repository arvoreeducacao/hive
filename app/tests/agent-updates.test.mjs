import test from "node:test";
import assert from "node:assert/strict";
import { behindOf, bundledWithHive, createLatestVersions, homebrewLatestOf, homebrewOf, npmPrefixOf, tailOfUpdate, updatePlanOf } from "../lib/agent-updates.mjs";

test("an agent the native installer put on the machine updates through its own command", () => {
  const codex = updatePlanOf({ id: "codex", path: "/home/a/.local/bin/codex", real: "/home/a/.codex/packages/standalone/releases/0.153.1-x86_64-unknown-linux-musl/bin/codex", binary: "codex" });
  assert.deepEqual(codex.action, { bin: "/home/a/.local/bin/codex", args: ["update"] });
  const opencode = updatePlanOf({ id: "opencode", path: "/home/a/.opencode/bin/opencode", real: "/home/a/.opencode/bin/opencode", binary: "opencode" });
  assert.deepEqual(opencode.action.args, ["upgrade"]);
  const claude = updatePlanOf({ id: "claude", path: "/home/a/.local/bin/claude", real: "/home/a/.local/share/claude/versions/2.1.282", binary: "claude" });
  assert.deepEqual(claude.action.args, ["update"]);
});

test("an npm global install updates with npm, against the prefix that holds it", () => {
  const plan = updatePlanOf({ id: "codex", path: "/usr/local/bin/codex", real: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js", binary: "codex" });
  assert.equal(plan.action.bin, "npm");
  assert.deepEqual(plan.action.args, ["install", "-g", "--prefix", "/usr/local", "--allow-scripts=@openai/codex", "@openai/codex@latest"]);
  assert.equal(npmPrefixOf("/repo/node_modules/x/lib/node_modules/@openai/codex/bin", "@openai/codex"), "");
});

test("an agent whose updater finds its own install gets the click even where the hive cannot tell", () => {
  const codex = updatePlanOf({ id: "codex", path: "/Users/art/.bun/bin/codex", real: "/Users/art/.bun/install/global/node_modules/@openai/codex/bin/codex.js", binary: "codex" });
  assert.deepEqual(codex.action, { bin: "/Users/art/.bun/bin/codex", args: ["update"] });
  const opencode = updatePlanOf({ id: "opencode", path: "/opt/weird/opencode", real: "/opt/weird/opencode", binary: "opencode" });
  assert.deepEqual(opencode.action.args, ["upgrade"]);
});

test("an install the hive cannot prove, of an agent that cannot find its own, stays a command to copy", () => {
  const plan = updatePlanOf({ id: "kiro", path: "/opt/weird/kiro-cli", real: "/opt/weird/kiro-cli", binary: "kiro-cli" });
  assert.equal(plan.action, null);
  assert.equal(plan.command, "kiro-cli update --non-interactive");
});

test("the claude that came inside the hive does not offer an update of its own", () => {
  const real = "/opt/Hive/resources/server/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude";
  assert.equal(bundledWithHive(real), true);
  const plan = updatePlanOf({ id: "claude", path: real, real, binary: "claude" });
  assert.equal(plan.action, null);
  assert.equal(plan.bundled, true);
  assert.equal(bundledWithHive("/home/a/.cache/hive/claude/claude-agent-sdk-linux-x64-0.3.280-1/claude"), true);
});

test("behind means the newest version is higher, not just different", () => {
  assert.equal(behindOf("0.153.1", "0.157.0"), true);
  assert.equal(behindOf("1.18.32", "1.18.32"), false);
  assert.equal(behindOf("2.1.283", "2.1.282"), false);
  assert.equal(behindOf("", "1.0.0"), false);
  assert.equal(behindOf("1.0.0", ""), false);
});

test("the newest version is asked once an hour, and an agent with no package is never asked", async () => {
  let asked = 0;
  let clock = 0;
  const latestOf = createLatestVersions({
    now: () => clock,
    fetchImpl: async (url) => { asked += 1; assert.match(url, /registry\.npmjs\.org\/@openai%2Fcodex\/latest$/); return { ok: true, json: async () => ({ version: "0.157.0" }) }; },
  });
  assert.equal(await latestOf("codex"), "0.157.0");
  assert.equal(await latestOf("codex"), "0.157.0");
  assert.equal(asked, 1);
  clock = 3600001;
  await latestOf("codex");
  assert.equal(asked, 2);
  assert.equal(await latestOf("kiro"), "");
  assert.equal(asked, 2);
});

test("a registry that does not answer leaves the version unknown instead of failing", async () => {
  const latestOf = createLatestVersions({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(await latestOf("opencode"), "");
});

test("what an updater printed reaches the screen without its spinner", () => {
  const raw = "│\n●  From 1.18.30 → 1.18.32\n\u001b[?25l│\n◒  Upgrading\u001b[999D\u001b[J◐  Upgrading.\u001b[999D\u001b[J◇  Upgrade complete\n\u001b[?25h│\n└  Done";
  assert.equal(tailOfUpdate(raw), "●  From 1.18.30 → 1.18.32\n◇  Upgrade complete\n└  Done");
});

test("an updater that asks before installing is told the answer up front", () => {
  const kiro = updatePlanOf({ id: "kiro", path: "/home/a/.local/bin/kiro-cli", real: "/home/a/.local/bin/kiro-cli", binary: "kiro-cli" });
  assert.deepEqual(kiro.action.args, ["update", "--non-interactive"]);
  const kimi = updatePlanOf({ id: "kimi", path: "/home/a/.kimi-code/bin/kimi", real: "/home/a/.kimi-code/bin/kimi", binary: "kimi" });
  assert.deepEqual(kimi.action.args, ["upgrade", "--yes"]);
});

test("an agent Homebrew installed updates with brew, cask or formula", () => {
  const codex = updatePlanOf({ id: "codex", path: "/opt/homebrew/bin/codex", real: "/opt/homebrew/Caskroom/codex/0.153.4/codex-aarch64-apple-darwin", binary: "codex" });
  assert.deepEqual(codex.action, { bin: "brew", args: ["upgrade", "--cask", "codex"] });
  assert.equal(codex.command, "brew upgrade --cask codex");
  const claude = updatePlanOf({ id: "claude", path: "/opt/homebrew/bin/claude", real: "/opt/homebrew/Caskroom/claude-code/2.1.270/claude", binary: "claude" });
  assert.deepEqual(claude.action.args, ["upgrade", "--cask", "claude-code"]);
  const opencode = updatePlanOf({ id: "opencode", path: "/usr/local/bin/opencode", real: "/usr/local/Cellar/opencode/1.18.30/bin/opencode", binary: "opencode" });
  assert.deepEqual(opencode.action.args, ["upgrade", "opencode"]);
});

test("npm globals under a Homebrew node stay npm's, not brew's", () => {
  const plan = updatePlanOf({ id: "codex", path: "/opt/homebrew/bin/codex", real: "/opt/homebrew/Cellar/node/22.1.0/lib/node_modules/@openai/codex/bin/codex.js", binary: "codex" });
  assert.equal(plan.action.bin, "npm");
  assert.equal(homebrewOf("/opt/homebrew/Cellar/node/22.1.0/bin/node"), null);
});

test("an agent from Homebrew is compared with what brew can deliver, not with npm", async () => {
  const asked = [];
  const latestOf = createLatestVersions({
    fetchImpl: async () => { throw new Error("npm must not be asked"); },
    runBrew: async (args) => { asked.push(args.join(" ")); return JSON.stringify({ casks: [{ version: "0.156.0,build7" }] }); },
  });
  const plan = { brew: { kind: "cask", name: "codex" } };
  assert.equal(await latestOf("codex", plan), "0.156.0");
  assert.equal(await latestOf("codex", plan), "0.156.0");
  assert.deepEqual(asked, ["info --json=v2 --cask codex"]);
  assert.equal(homebrewLatestOf(JSON.stringify({ formulae: [{ versions: { stable: "1.18.32" } }] }), { kind: "formula" }), "1.18.32");
  assert.equal(homebrewLatestOf("not json", { kind: "cask" }), "");
});

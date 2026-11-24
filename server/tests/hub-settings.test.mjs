import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hubClaudeArgs, hubSettingsFile, hubSettingsOf, insideTheHub, withHubSettings } from "../engine/hub-settings.mjs";

const HUB = realpathSync(mkdtempSync(join(tmpdir(), "hub-settings-")));
const STATE = join(HUB, ".state");
const TREE = join(HUB, ".worktrees", "api-acme", "conserta-login");
after(() => rmSync(HUB, { recursive: true, force: true }));

mkdirSync(join(HUB, ".claude"), { recursive: true });
mkdirSync(join(HUB, "scripts"), { recursive: true });
mkdirSync(TREE, { recursive: true });
writeFileSync(join(HUB, "scripts", "where.mjs"), "process.stdout.write(process.env.CLAUDE_PROJECT_DIR || '')");
const HUB_SETTINGS = {
  permissions: { deny: ["Read(**/.env)"] },
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/scripts/where.mjs"' }] }],
    Stop: [{ hooks: [{ type: "prompt", prompt: "keep me" }] }]
  }
};
writeFileSync(join(HUB, ".claude", "settings.json"), JSON.stringify(HUB_SETTINGS));

test("only a folder below the hub is a project chat; the hub itself and anything outside are not", () => {
  assert.equal(insideTheHub(TREE, HUB), true);
  assert.equal(insideTheHub(join(HUB, "api-acme"), HUB), true);
  assert.equal(insideTheHub(HUB, HUB), false);
  assert.equal(insideTheHub(tmpdir(), HUB), false);
  assert.equal(insideTheHub(`${HUB}-sibling`, HUB), false);
  assert.equal(insideTheHub("", HUB), false);
});

test("the hub's hooks run with the hub as their project folder, whatever folder the chat is in", () => {
  const settings = hubSettingsOf(HUB_SETTINGS, HUB);
  assert.deepEqual(settings.permissions, HUB_SETTINGS.permissions);
  assert.deepEqual(settings.hooks.Stop, HUB_SETTINGS.hooks.Stop);
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  const said = execFileSync("sh", ["-c", command], { cwd: TREE, env: { ...process.env, CLAUDE_PROJECT_DIR: TREE } }).toString();
  assert.equal(said, HUB);
  assert.equal(HUB_SETTINGS.hooks.PreToolUse[0].hooks[0].command, 'node "$CLAUDE_PROJECT_DIR/scripts/where.mjs"', "the hub's own settings are not touched");
});

test("a project chat's options carry the hub settings and the hub folder, and keep their own settings on top", () => {
  const options = withHubSettings({ cwd: TREE, settings: { effortLevel: "high" } }, HUB);
  assert.equal(options.settings.effortLevel, "high");
  assert.deepEqual(options.settings.permissions, HUB_SETTINGS.permissions);
  assert.match(options.settings.hooks.PreToolUse[0].hooks[0].command, /^CLAUDE_PROJECT_DIR=/);
  assert.deepEqual(options.additionalDirectories, [HUB]);
  const inTheHub = { cwd: HUB, settings: { effortLevel: "high" } };
  assert.equal(withHubSettings(inTheHub, HUB), inTheHub, "a chat in the hub already reads the hub's settings");
});

test("a terminal chat in a project gets the hub settings by file and the hub as an added folder", () => {
  assert.deepEqual(hubClaudeArgs(TREE, HUB, STATE), ["--settings", join(STATE, "hub-settings.json"), "--add-dir", HUB]);
  assert.deepEqual(JSON.parse(readFileSync(join(STATE, "hub-settings.json"), "utf8")), hubSettingsOf(HUB_SETTINGS, HUB));
  assert.deepEqual(hubClaudeArgs(HUB, HUB, STATE), []);
  assert.equal(hubSettingsFile(TREE, join(HUB, "no-hub-here"), STATE), "");
});

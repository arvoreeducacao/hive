import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CODE_MODE_ENV, SEAT_TUNING_ENVS, cleanPatch, seatTuningEnv } from "../lib/config.mjs";
import { CLAUDE_CODE_MODE_ENV, codeModeRefusal, codeModeWanted, withCodeMode } from "../../server/engine/agents.mjs";
import { PT_BR } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const driver = readFileSync(join(HERE, "..", "server", "engine", "driver.mjs"), "utf8");
const html = readFileSync(join(HERE, "app.html"), "utf8");

test("the Code Mode setting reaches the chats on this machine as the hive's own variable, and leaves when it is off", () => {
  assert.equal(CODE_MODE_ENV, "HIVE_CODE_MODE");
  assert.ok(SEAT_TUNING_ENVS.includes(CODE_MODE_ENV), "turning it off must unset the variable in tmux");
  assert.deepEqual(seatTuningEnv({ codeMode: true }), { [CODE_MODE_ENV]: "1" });
  assert.deepEqual(seatTuningEnv({ codeMode: false }), {});
  assert.deepEqual(seatTuningEnv({}), {});
});

test("the config file and a patch from the settings take codeMode as a flag that is off by default", () => {
  assert.match(server, /codeMode: cleanFlag\(raw\.codeMode, "codeMode", tilde\(CONFIG_FILE\), problems, false\)/);
  assert.match(server, /codeMode: raw\.codeMode !== undefined/);
  assert.equal(cleanPatch({ codeMode: true }).clean.codeMode, true);
  const wrong = cleanPatch({ codeMode: "yes" });
  assert.equal(wrong.clean.codeMode, false);
  assert.ok(wrong.problems.some((one) => /codeMode should be true or false/.test(one)));
});

test("a new chat follows the setting, a resumed chat keeps the mode it was born with, an anonymous chat never takes it", () => {
  const on = { [CODE_MODE_ENV]: "1" };
  assert.equal(codeModeWanted({ env: on }), true);
  assert.equal(codeModeWanted({ env: {} }), false);
  assert.equal(codeModeWanted({ env: {}, bornWith: true }), true, "Claude Code refuses to resume a Code Mode session with the mode off");
  assert.equal(codeModeWanted({ env: on, bornWith: false }), false);
  assert.equal(codeModeWanted({ env: on, anonymous: true }), false);
  assert.equal(codeModeWanted({ env: on, anonymous: true, bornWith: true }), false);
});

test("Code Mode goes in the env of the SDK settings, next to what the hub and the chat already set", () => {
  assert.equal(CLAUDE_CODE_MODE_ENV, "CLAUDE_CODE_EXPERIMENTAL_CODE_MODE");
  assert.deepEqual(withCodeMode(undefined), { env: { [CLAUDE_CODE_MODE_ENV]: "1" } });
  assert.deepEqual(
    withCodeMode({ effortLevel: "high", env: { FROM_HUB: "x" } }),
    { effortLevel: "high", env: { FROM_HUB: "x", [CLAUDE_CODE_MODE_ENV]: "1" } }
  );
});

test("the driver remembers the mode a session is born with and reads it back only on a resume", () => {
  assert.match(driver, /const codeMode = codeModeWanted\(\{ env: process\.env, anonymous, bornWith: resumeId \? storedSession\.codeMode : undefined \}\);/);
  assert.match(driver, /if \(!resumeId && !anonymous\) persistSession\(\{ codeMode \}\);/);
  assert.match(driver, /if \(codeMode\) \{\n  options\.settings = withCodeMode\(options\.settings\);/);
  const mode = driver.indexOf("options.settings = withCodeMode(options.settings)");
  assert.ok(mode > driver.indexOf("Object.assign(options, withHubSettings("), "the hub settings would overwrite the env");
});

test("a Code Mode chat opens without remote control, which turns the mode off with no warning", () => {
  assert.match(driver, /if \(process\.env\.HIVE_REMOTE_CONTROL !== "0" && !anonymous && !codeMode\) extraArgs\["remote-control"\] = name;/);
});

test("the chat says why when Claude Code refuses the mode", () => {
  const said = "Warning: Code Mode (experimental) isn't available: the model claude-x can't run it. Starting with the ordinary tools.\n";
  assert.equal(codeModeRefusal(said), "Code Mode (experimental) isn't available: the model claude-x can't run it. Starting with the ordinary tools.");
  assert.equal(codeModeRefusal("Warning: this sign-in ends soon\n"), "");
  assert.equal(codeModeRefusal(""), "");
  assert.match(driver, /options\.stderr = \(text\) => \{/);
});

test("the settings row has a switch, a state line and every phrase in portuguese", () => {
  assert.match(html, /data-control="t-code-mode"/);
  assert.match(html, /id="s-code-mode-say"/);
  assert.match(html, /<button class="ghost flip" id="t-code-mode" type="button"><\/button>/);
  for (const phrase of [
    "start Claude chats in Code Mode",
    "A new Claude chat on this machine writes JavaScript that makes several tool calls at once. Experimental.",
    "On, a new Claude chat on this machine starts with",
    "new Claude chats start in Code Mode",
    "new Claude chats start with the ordinary tools"
  ]) assert.ok(PT_BR[phrase], `no portuguese for: ${phrase}`);
  const after = html.slice(html.indexOf("CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1</code>") + "CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1</code>".length, html.indexOf("</p>", html.indexOf("CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1</code>"))).trim();
  assert.ok(PT_BR[after], "the hint after the variable has no portuguese");
});

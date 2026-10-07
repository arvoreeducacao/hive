import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, PROVIDER_IDS, ACCOUNT_IN_COMMAND, accountDirFromEnv, accountNameInCommand, oneLoginOnly, providerEnv, providerEnvDir, providerHome, providerOwn, providerRanDry } from "../engine/providers.mjs";

test("every agent the hive seats is a provider, and each says how a login is kept apart", () => {
  assert.deepEqual(PROVIDER_IDS, ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
  for (const spec of Object.values(PROVIDERS)) {
    assert.ok(spec.binary && spec.homeEnv && spec.home && spec.label && /^#[0-9A-Fa-f]{6}$/.test(spec.color), `${spec.id} is missing a field`);
    assert.ok(Array.isArray(spec.own) && Array.isArray(spec.login), `${spec.id} says nothing about its login`);
  }
});

test("the home an agent keeps itself in follows the platform when the CLI does", () => {
  assert.equal(providerHome("kiro", "linux"), ".local/share");
  assert.equal(providerHome("kiro", "darwin"), "Library/Application Support");
  assert.equal(providerHome("cursor", "linux"), ".config");
  assert.equal(providerHome("cursor", "darwin"), ".cursor");
  assert.equal(providerHome("opencode", "darwin"), ".local/share", "only the agents that move name a platform");
  assert.equal(providerHome("claude", "darwin"), ".claude");
  assert.equal(providerHome("nobody", "darwin"), "");
});

test("what a login keeps to itself moves with the home", () => {
  assert.deepEqual(providerOwn("cursor", "linux"), ["cursor/auth.json"]);
  assert.deepEqual(providerOwn("cursor", "darwin"), ["auth.json"], "on a mac the home already is ~/.cursor");
  assert.deepEqual(providerOwn("kiro", "darwin"), ["kiro-cli/data.sqlite3"], "the file keeps its name inside either home");
  assert.deepEqual(providerOwn("codex", "darwin"), ["auth.json"]);
  assert.deepEqual(providerOwn("nobody", "darwin"), []);
});

test("a second login is refused where the CLI would answer as the first", () => {
  assert.match(oneLoginOnly("kiro", "darwin"), /one login per mac/);
  assert.match(oneLoginOnly("cursor", "darwin"), /one login per mac/);
  assert.equal(oneLoginOnly("kiro", "linux"), "");
  assert.equal(oneLoginOnly("cursor", "linux"), "");
  assert.equal(oneLoginOnly("codex", "darwin"), "");
});

test("a login folder becomes the variable its CLI reads, share/ inside it for the xdg ones", () => {
  assert.deepEqual(providerEnv("claude", "/h/.hive/accounts/work"), { CLAUDE_CONFIG_DIR: "/h/.hive/accounts/work" });
  assert.deepEqual(providerEnv("codex", "/h/.hive/providers/codex/accounts/work"), { CODEX_HOME: "/h/.hive/providers/codex/accounts/work" });
  assert.deepEqual(providerEnv("kimi", "/h/x"), { KIMI_CODE_HOME: "/h/x" });
  assert.deepEqual(providerEnv("kiro", "/h/x"), { XDG_DATA_HOME: "/h/x/share" });
  assert.deepEqual(providerEnv("opencode", "/h/x"), { XDG_DATA_HOME: "/h/x/share" });
  assert.deepEqual(providerEnv("cursor", "/h/x"), { XDG_CONFIG_HOME: "/h/x/config" });
  assert.deepEqual(providerEnv("codex", ""), {}, "the login everybody starts with sets nothing");
  assert.deepEqual(providerEnv("gemini", "/h/x"), {});
  assert.equal(providerEnvDir("kiro", "/h/x"), "/h/x/share");
});

test("the environment a seat runs in reads back as the login folder, or nothing", () => {
  assert.equal(accountDirFromEnv("codex", { CODEX_HOME: "/h/p/codex/accounts/work/" }), "/h/p/codex/accounts/work");
  assert.equal(accountDirFromEnv("codex", {}), "");
  assert.equal(accountDirFromEnv("kiro", { XDG_DATA_HOME: "/h/p/kiro/accounts/work/share" }), "/h/p/kiro/accounts/work");
  assert.equal(accountDirFromEnv("kiro", { XDG_DATA_HOME: "/home/someone/.local/share" }), "", "a machine-wide xdg folder is not a login");
  assert.equal(accountDirFromEnv("cursor", { XDG_CONFIG_HOME: "/h/p/cursor/accounts/work/config" }), "/h/p/cursor/accounts/work");
  assert.equal(accountDirFromEnv("cursor", { XDG_CONFIG_HOME: "/home/someone/.config" }), "");
  assert.equal(accountDirFromEnv("claude", { CLAUDE_CONFIG_DIR: "/h/.hive/accounts/work" }), "/h/.hive/accounts/work");
});

test("the name of the login is read out of the command tmux started, whichever variable carried it", () => {
  assert.equal(accountNameInCommand("cd /repo; CLAUDE_CONFIG_DIR=/h/.hive/accounts/work HIVE_SEAT=a claude"), "work");
  assert.equal(accountNameInCommand("CODEX_HOME='/h/.hive/providers/codex/accounts/spare' HIVE_SEAT=a codex"), "spare");
  assert.equal(accountNameInCommand("XDG_DATA_HOME=/h/.hive/providers/kiro/accounts/team/share kiro-cli chat"), "team");
  assert.equal(accountNameInCommand("XDG_CONFIG_HOME=/h/.hive/providers/cursor/accounts/pro/config cursor-agent --force"), "pro");
  assert.equal(accountNameInCommand("HIVE_SEAT=a kimi --yolo"), "");
  assert.ok(ACCOUNT_IN_COMMAND.test("KIMI_CODE_HOME=/x kimi"));
});

test("a refusal is read as a spent login, a lost login, or neither — per agent", () => {
  assert.equal(providerRanDry("codex", "usage_limit_reached: You have hit your usage limit").why, "spent");
  assert.equal(providerRanDry("codex", "rate limit exceeded: try again later").why, "spent");
  assert.equal(providerRanDry("codex", "Not logged in. Run codex login").why, "login");
  assert.equal(providerRanDry("kimi", "exceeded your current quota, please check your account balance").why, "spent");
  assert.equal(providerRanDry("kimi", "No token for \"kimi-code\". Run /login to authenticate.").why, "login");
  assert.equal(providerRanDry("kiro", "ThrottlingException: Too many requests").why, "spent");
  assert.equal(providerRanDry("kiro", "Not logged in").why, "login");
  assert.equal(providerRanDry("opencode", "ProviderAuthError: openai").why, "login");
  assert.equal(providerRanDry("opencode", "429 rate limit").why, "spent");
  assert.equal(providerRanDry("cursor", "Authentication required. Please run 'agent login' first").why, "login");
  assert.equal(providerRanDry("cursor", "You have hit your usage limit for this billing cycle").why, "spent");
  assert.equal(providerRanDry("codex", "the app-server stopped answering"), null);
  assert.equal(providerRanDry("kimi", ""), null);
  assert.equal(providerRanDry("gemini", "rate limit"), null);
});

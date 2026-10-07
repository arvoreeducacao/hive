import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROVIDER_IDS, codexIdentity, cursorIdentity, kimiIdentity, kiroIdentity, mirrorHome, opencodeIdentity, parseVersion, providerIdentity,
  providerReadiness, providerSettings, readProviderAccounts, shapeProviderAccount,
} from "../lib/providers.mjs";

function machine() {
  const home = mkdtempSync(join(tmpdir(), "hive-providers-"));
  mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
  writeFileSync(join(home, ".codex", "config.toml"), "model = \"gpt\"");
  writeFileSync(join(home, ".codex", "auth.json"), JSON.stringify({ tokens: { id_token: "x" } }));
  mkdirSync(join(home, ".local", "share", "kiro-cli"), { recursive: true });
  mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true });
  mkdirSync(join(home, ".local", "share", "pnpm"), { recursive: true });
  writeFileSync(join(home, ".local", "share", "kiro-cli", "data.sqlite3"), "sqlite");
  mkdirSync(join(home, "Library", "Application Support", "kiro-cli"), { recursive: true });
  writeFileSync(join(home, "Library", "Application Support", "kiro-cli", "data.sqlite3"), "sqlite");
  writeFileSync(join(home, ".local", "share", "kiro-cli", "feed.json"), "{}");
  writeFileSync(join(home, ".local", "share", "opencode", "auth.json"), JSON.stringify({ openai: { type: "oauth" } }));
  writeFileSync(join(home, ".local", "share", "opencode", "opencode.db"), "db");
  mkdirSync(join(home, ".kimi-code", "credentials"), { recursive: true });
  writeFileSync(join(home, ".kimi-code", "credentials", "kimi-code.json"), JSON.stringify({ access_token: "t" }));
  writeFileSync(join(home, ".kimi-code", "config.toml"), "");
  writeFileSync(join(home, ".kimi-code", "region"), "global");
  mkdirSync(join(home, ".cursor", "projects"), { recursive: true });
  writeFileSync(join(home, ".cursor", "cli-config.json"), "{}");
  writeFileSync(join(home, ".cursor", "hooks.json"), "{}");
  writeFileSync(join(home, ".cursor", "auth.json"), JSON.stringify({ accessToken: "t", membershipType: "pro" }));
  mkdirSync(join(home, ".config", "cursor"), { recursive: true });
  mkdirSync(join(home, ".config", "gh"), { recursive: true });
  writeFileSync(join(home, ".config", "cursor", "auth.json"), JSON.stringify({ accessToken: "t" }));
  writeFileSync(join(home, ".config", "gh", "hosts.yml"), "");
  return home;
}

test("a cursor login mirrors ~/.config into config/ (so gh and git keep their files), adds ~/.cursor under config/cursor and keeps auth.json to itself", () => {
  const home = machine();
  const dir = join(home, ".hive", "providers", "cursor", "accounts", "work");
  assert.equal(shapeProviderAccount(home, "cursor", dir, "linux"), dir);
  assert.ok(isLink(join(dir, "config", "gh")), "what other tools keep in ~/.config is shared");
  assert.equal(isLink(join(dir, "config", "cursor")), false, "the CLI's own folder is real, so one file inside can differ");
  assert.ok(isLink(join(dir, "config", "cursor", "cli-config.json")), "the settings under ~/.cursor are shared");
  assert.ok(isLink(join(dir, "config", "cursor", "hooks.json")));
  assert.ok(isLink(join(dir, "config", "cursor", "projects")));
  assert.equal(existsSync(join(dir, "config", "cursor", "auth.json")), false, "the login starts signed out");
});

const isLink = (path) => lstatSync(path).isSymbolicLink();

test("a codex login mirrors the whole home with links and keeps only auth.json to itself", () => {
  const home = machine();
  const dir = join(home, ".hive", "providers", "codex", "accounts", "work");
  assert.equal(shapeProviderAccount(home, "codex", dir), dir);
  assert.ok(isLink(join(dir, "config.toml")), "the settings are shared");
  assert.ok(isLink(join(dir, "sessions")), "the sessions are shared, so a resume works on any login");
  assert.equal(existsSync(join(dir, "auth.json")), false, "the login starts signed out");
});

test("a kiro or opencode login mirrors ~/.local/share into share/ and keeps the one file that holds the login", () => {
  const home = machine();
  const kiro = join(home, ".hive", "providers", "kiro", "accounts", "team");
  shapeProviderAccount(home, "kiro", kiro, "linux");
  assert.ok(isLink(join(kiro, "share", "pnpm")), "what other tools keep there is shared");
  assert.equal(isLink(join(kiro, "share", "kiro-cli")), false, "the CLI's own folder is real, so one file inside can differ");
  assert.ok(isLink(join(kiro, "share", "kiro-cli", "feed.json")));
  assert.equal(existsSync(join(kiro, "share", "kiro-cli", "data.sqlite3")), false);
  const oc = join(home, ".hive", "providers", "opencode", "accounts", "spare");
  shapeProviderAccount(home, "opencode", oc);
  assert.ok(isLink(join(oc, "share", "opencode", "opencode.db")));
  assert.equal(existsSync(join(oc, "share", "opencode", "auth.json")), false);
});

test("shaping a login again only adds what is new and touches nothing the login wrote", () => {
  const home = machine();
  const dir = join(home, ".hive", "providers", "codex", "accounts", "work");
  shapeProviderAccount(home, "codex", dir);
  writeFileSync(join(dir, "auth.json"), "mine");
  writeFileSync(join(home, ".codex", "hooks.json"), "{}");
  shapeProviderAccount(home, "codex", dir);
  assert.equal(readFileSync(join(dir, "auth.json"), "utf8"), "mine");
  assert.ok(isLink(join(dir, "hooks.json")), "a file that appeared later is linked on the next shape");
});

test("mirroring a home that does not exist yet makes the login folder and stops", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-providers-"));
  const to = join(home, "x");
  assert.equal(mirrorHome(join(home, "missing"), to, []), to);
  assert.ok(existsSync(to));
});

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

test("each CLI's login file says who is signed in, without a network", () => {
  assert.deepEqual(codexIdentity({ tokens: { id_token: jwt({ email: "me@x", "https://api.openai.com/auth": { chatgpt_plan_type: "team" } }) } }), { loggedIn: true, email: "me@x", tier: "team" });
  assert.deepEqual(codexIdentity({ OPENAI_API_KEY: "sk" }), { loggedIn: true, email: "", tier: "api key" });
  assert.deepEqual(codexIdentity(null), { loggedIn: false, email: "", tier: "" });
  assert.deepEqual(kimiIdentity({ access_token: "t", scope: "kimi-code" }, "global"), { loggedIn: true, email: "", tier: "global · kimi-code" });
  assert.deepEqual(cursorIdentity({ accessToken: "x.eyJlbWFpbCI6ImFAYi5jIn0.y", refreshToken: "r" }), { loggedIn: true, email: "a@b.c", tier: "" });
  assert.deepEqual(cursorIdentity({ apiKey: "k" }), { loggedIn: true, email: "", tier: "api key" });
  assert.equal(cursorIdentity({}).loggedIn, false);
  assert.equal(cursorIdentity(null).loggedIn, false);
  assert.equal(kimiIdentity({ access_token: "t", expires_at: 1 }).loggedIn, false, "an expired token with nothing to refresh it is signed out");
  assert.equal(kimiIdentity({ access_token: "t", expires_at: 1, refresh_token: "r" }).loggedIn, true);
  assert.deepEqual(opencodeIdentity({ openai: { type: "oauth" }, "kimi-for-coding": { type: "api" } }), { loggedIn: true, email: "", tier: "openai · oauth, kimi-for-coding · api" });
  assert.equal(opencodeIdentity({}).loggedIn, false);
  assert.deepEqual(kiroIdentity("Logged in with IAM Identity Center (https://x.awsapps.com/start/)\nEmail: me@x\n"), { loggedIn: true, email: "me@x", tier: "IAM Identity Center" });
  assert.equal(kiroIdentity("Not logged in").loggedIn, false);
});

test("the login everybody starts with is read off the CLI's own home, another off its folder", async () => {
  const home = machine();
  const own = await providerIdentity({ home, provider: "opencode", dir: "" });
  assert.equal(own.loggedIn, true);
  const dir = join(home, ".hive", "providers", "opencode", "accounts", "spare");
  shapeProviderAccount(home, "opencode", dir);
  const spare = await providerIdentity({ home, provider: "opencode", dir });
  assert.equal(spare.loggedIn, false);
  const asked = [];
  const kiro = await providerIdentity({ home, provider: "kiro", dir: "", platform: "linux", run: async (bin, args, env) => { asked.push([bin, args, env]); return "Email: me@x\nLogged in with Builder ID"; } });
  assert.equal(kiro.email, "me@x");
  assert.deepEqual(asked, [["kiro-cli", ["whoami"], {}]]);
});

test("on a mac the kiro login is read where that platform keeps it, not in the xdg folder linux uses", async () => {
  const home = machine();
  const ask = async () => "Email: me@x\nLogged in with IAM Identity Center";
  const mac = await providerIdentity({ home, provider: "kiro", dir: "", platform: "darwin", run: ask });
  assert.equal(mac.loggedIn, true, "Library/Application Support holds the login there");
  rmSync(join(home, "Library", "Application Support", "kiro-cli"), { recursive: true });
  const gone = await providerIdentity({ home, provider: "kiro", dir: "", platform: "darwin", run: ask });
  assert.deepEqual(gone, { loggedIn: false, email: "", tier: "", blind: false }, "with nothing there it is signed out, not unasked");
});

test("on a mac the cursor login is read from ~/.cursor, where that CLI puts its token", async () => {
  const home = machine();
  const mac = await providerIdentity({ home, provider: "cursor", dir: "", platform: "darwin" });
  assert.deepEqual(mac, { loggedIn: true, email: "", tier: "pro", blind: false });
  const linux = await providerIdentity({ home, provider: "cursor", dir: "", platform: "linux" });
  assert.equal(linux.loggedIn, true, "on linux the same login is read under ~/.config");
  rmSync(join(home, ".cursor", "auth.json"));
  const gone = await providerIdentity({ home, provider: "cursor", dir: "", platform: "darwin" });
  assert.equal(gone.loggedIn, false, "the file under ~/.config is not the mac's login");
});

test("a mac holds one cursor login too, for the same reason", () => {
  const home = machine();
  const dir = join(home, ".hive", "providers", "cursor", "accounts", "work");
  assert.throws(() => shapeProviderAccount(home, "cursor", dir, "darwin"), /one login per mac/);
  assert.equal(existsSync(dir), false);
});

test("a mac holds one kiro login, and asking for a second says why instead of shaping a folder that would answer as the first", () => {
  const home = machine();
  const dir = join(home, ".hive", "providers", "kiro", "accounts", "work");
  assert.throws(() => shapeProviderAccount(home, "kiro", dir, "darwin"), /one login per mac/);
  assert.equal(existsSync(dir), false, "nothing is written for a login that cannot be kept apart");
  assert.equal(shapeProviderAccount(home, "kiro", dir, "linux"), dir, "linux still holds as many as you like");
});

test("the logins a provider holds are the default plus every folder, each with its mark from the ledger", async () => {
  const home = machine();
  const hiveHome = join(home, ".hive");
  shapeProviderAccount(home, "codex", join(hiveHome, "providers", "codex", "accounts", "work"));
  const rows = await readProviderAccounts({ home, hiveHome, provider: "codex", ledger: { work: { until: 5, why: "spent" } } });
  assert.deepEqual(rows.map((r) => [r.name, r.loggedIn, r.spent?.why || null]), [["default", true, null], ["work", false, "spent"]]);
});

test("a version is the first number in whatever the CLI prints", () => {
  assert.equal(parseVersion("codex-cli 0.153.1"), "0.153.1");
  assert.equal(parseVersion("kiro-cli 2.21.0\n"), "2.21.0");
  assert.equal(parseVersion("1.18.27"), "1.18.27");
  assert.equal(parseVersion("2026.09.08-6caf4ff"), "2026.09.08", "cursor-agent is versioned by date");
  assert.equal(parseVersion(""), "");
});

test("the settings of a provider fall back to the registry, and the readiness says why not", () => {
  assert.deepEqual(providerSettings({}, "codex"), { enabled: true, name: "Codex", color: "#10A37F", binary: "", args: [], env: {} });
  assert.equal(providerSettings({ providers: { codex: { enabled: false, name: "Work" } } }, "codex").name, "Work");
  assert.deepEqual(providerReadiness({ enabled: false, installed: true, accounts: [{ loggedIn: true }], label: "Codex" }), { ready: false, why: "Codex is turned off in providers" });
  assert.deepEqual(providerReadiness({ enabled: true, installed: false, accounts: [], label: "Kimi" }), { ready: false, why: "Kimi is not installed on this machine" });
  assert.match(providerReadiness({ enabled: true, installed: true, accounts: [{ loggedIn: false }], label: "Kiro" }).why, /nobody is signed in to Kiro/);
  assert.deepEqual(providerReadiness({ enabled: true, installed: true, accounts: [{ loggedIn: true }], label: "Kiro" }), { ready: true, why: "" });
  assert.deepEqual(PROVIDER_IDS, ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
});

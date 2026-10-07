import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { codexLimitsFromRateLimits, codexLimitsPerAccount, dryAccounts } from "../lib/limits.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const SAID = { rateLimits: { primary: { usedPercent: 89, windowDurationMins: 10080, resetsAt: 1788804170 }, secondary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1788704170 }, planType: "team" } };

test("codex's windows read as the same rows claude's do", () => {
  const iso = (seconds) => new Date(seconds * 1000).toISOString();
  assert.deepEqual(codexLimitsFromRateLimits(SAID), [
    { kind: "weekly_all", model: "", percent: 89, severity: "warning", resets_at: iso(1788804170), window: "primary" },
    { kind: "session", model: "", percent: 12, severity: "normal", resets_at: iso(1788704170), window: "secondary" },
  ]);
  assert.deepEqual(codexLimitsFromRateLimits({ rateLimits: { primary: null, secondary: null } }), []);
  assert.deepEqual(codexLimitsFromRateLimits(null), []);
});

test("a codex login at the wall is dry until its reset, like a claude one", () => {
  const rows = [{ account: "work", provider: "codex", limits: codexLimitsFromRateLimits({ rateLimits: { primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } }) }];
  const dry = dryAccounts(rows);
  assert.equal(dry.length, 1);
  assert.equal(dry[0].account, "work");
  assert.ok(dry[0].until > Date.now());
});

test("each codex login is asked through its own app-server, inside its own folder", async () => {
  const asked = [];
  const rpc = async (bin, args, use, env) => {
    asked.push([bin, args, env]);
    if (env?.CODEX_HOME?.includes("broken")) throw new Error("Not logged in");
    return use(async (method) => (method === "initialize" ? {} : SAID));
  };
  const rows = await codexLimitsPerAccount({ accounts: [{ name: "default", env: {} }, { name: "spare", env: { CODEX_HOME: "/h/broken" } }], rpc });
  assert.deepEqual(asked.map((a) => [a[0], a[1], a[2]]), [["codex", ["app-server"], {}], ["codex", ["app-server"], { CODEX_HOME: "/h/broken" }]]);
  assert.equal(rows[0].limits.length, 2);
  assert.deepEqual(rows[1], { account: "spare", provider: "codex", signedIn: true, limits: [], error: "Not logged in" });
});

test("the limits the app serves carry claude and codex side by side, each marked in its own ledger", () => {
  assert.match(server, /const rows = plans\.remember\(\[\.\.\.claude, \.\.\.codex, \.\.\.kimi, \.\.\.kiro\]\.map\(namedProvider\)\);/);
  assert.match(server, /await markSpentAccounts\(rows, "codex"\)/);
  assert.match(server, /const catalogRpc = \(bin, args, use, env\) => rpcProviderCatalog\(bin, args, use, env, HUB\);/);
});

test("the claude logins are asked with the wait the refusals left behind", () => {
  assert.match(server, /waiting: \(account\) => plans\.waiting\("claude", account\)/);
  assert.match(server, /const plans = createPlanMemory\(\);/);
});

test("every row says which agent it came from, and carries that agent's name and colour", () => {
  assert.match(server, /function namedProvider\(row\) \{/);
  assert.match(server, /const spec = PROVIDERS\[row\.provider \|\| "claude"\];/);
  assert.match(server, /provider: "claude", \.\.\.row, label: spec\?\.label[^\n]*color: spec\?\.color/);
});

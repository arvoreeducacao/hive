import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { KIRO_USAGE_ARGS, dryAccounts, kiroLimitsFromUsageText, kiroLimitsPerAccount } from "../lib/limits.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const PANEL = [
  "",
  "\x1b[1mEstimated Usage\x1b[0m | resets on 2026-10-01 | \x1b[38;5;141mKIRO PRO\x1b[0m",
  "\x1b[1mCredits\x1b[0m (186.63 of 1000 covered in plan)",
  "\x1b[38;5;141m████████\x1b[38;5;244m████████████\x1b[0m 18.7%",
  "\x1b[1mBonus credits\x1b[0m (50 of 100 covered in plan)",
  "\x1b[1mOverages\x1b[0m (3.20 used)",
  "",
  "Since your account is through your organization, for account management please contact your account administrator.",
  "",
  "Tip: to see context window usage, run \x1b[38;5;141m/context\x1b[0m",
  "",
].join("\n");

/* what kiro-cli 2.21.4 prints: no colours when it is not a terminal, the
   percentage on the bucket's own line, and no bar underneath. */
const V2_PANEL = [
  "Estimated Usage | resets on 2026-10-01 | KIRO PRO",
  "Credits (197.23 of 1000 covered in plan), 19.7%",
  "Your plan is managed by your organization's administrator.",
  "",
].join("\n");

test("the panel of the v2 engine, with the percentage beside the bucket, reads the same way", () => {
  const { plan, limits } = kiroLimitsFromUsageText(V2_PANEL);
  assert.equal(plan, "KIRO PRO");
  assert.deepEqual(limits, [
    { kind: "monthly", model: "", percent: 20, severity: "normal", resets_at: "2026-10-01T00:00:00.000Z", used: 197.23, limit: 1000 },
  ]);
});

test("kiro's /usage panel reads as one monthly row per bucket, the plan's name on the side, and the colours stripped", () => {
  const { plan, limits } = kiroLimitsFromUsageText(PANEL);
  assert.equal(plan, "KIRO PRO");
  assert.deepEqual(limits, [
    { kind: "monthly", model: "", percent: 19, severity: "normal", resets_at: "2026-10-01T00:00:00.000Z", used: 186.63, limit: 1000 },
    { kind: "monthly", model: "Bonus credits", percent: 50, severity: "normal", resets_at: "2026-10-01T00:00:00.000Z", used: 50, limit: 100 },
  ]);
});

test("a panel without a plan name, or a login that is not signed in, reads as no rows", () => {
  assert.equal(kiroLimitsFromUsageText("Estimated Usage | resets on 2026-10-01\nCredits (1000 of 1000 covered in plan)").plan, "");
  assert.equal(kiroLimitsFromUsageText("Estimated Usage | resets on 2026-10-01\nCredits (1000 of 1000 covered in plan)").limits[0].severity, "exceeded");
  assert.deepEqual(kiroLimitsFromUsageText("You are not logged in. Run kiro-cli login."), { plan: "", limits: [] });
  assert.deepEqual(kiroLimitsFromUsageText(""), { plan: "", limits: [] });
});

test("each kiro login is asked with no prompt and no legacy flag, inside its own share folder", async () => {
  const asked = [];
  const run = async (args, env) => {
    asked.push([args, env]);
    if (env?.XDG_DATA_HOME?.includes("broken")) return "\x1b[31mNot logged in\x1b[0m\n";
    return PANEL;
  };
  const rows = await kiroLimitsPerAccount({ accounts: [{ name: "default", env: {} }, { name: "spare", env: { XDG_DATA_HOME: "/h/broken/share" } }], run });
  assert.deepEqual(asked.map(([args]) => args), [KIRO_USAGE_ARGS, KIRO_USAGE_ARGS]);
  assert.deepEqual(KIRO_USAGE_ARGS, ["chat", "--no-interactive", "/usage"], "--classic is --legacy-ui, which the v2 engine refuses to start beside");
  assert.equal(rows[0].provider, "kiro");
  assert.equal(rows[0].plan, "KIRO PRO");
  assert.equal(rows[0].limits.length, 2);
  assert.deepEqual(rows[1], { account: "spare", provider: "kiro", signedIn: true, limits: [], error: "Not logged in" });
});

test("a kiro login out of credits is dry until the month turns", () => {
  const next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const rows = [{ account: "default", provider: "kiro", limits: kiroLimitsFromUsageText(`Estimated Usage | resets on ${next} | KIRO PRO\nCredits (1000 of 1000 covered in plan)`).limits }];
  const dry = dryAccounts(rows);
  assert.equal(dry.length, 1);
  assert.match(dry[0].says, /month/);
  assert.ok(dry[0].until > Date.now());
});

test("the app asks kiro beside the others, on the login's own share folder, with room to answer, and marks its ledger", () => {
  assert.match(server, /kiroLimitsNow\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(server, /await markSpentAccounts\(rows, "kiro"\)/);
  assert.match(server, /env: providerEnv\("kiro", one\.dir\)/);
  assert.match(server, /execFile\(kiro\.path, args, \{ timeout: 30000, cwd: HIVE_HOME, env: \{ \.\.\.process\.env, \.\.\.env \} \}, \(err, stdout, stderr\)/, "the panel is printed on stderr, so both streams are read");
});

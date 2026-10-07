import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { registerProviderRoutes } from "../routes/providers.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function harness() {
  const routes = new Map();
  const calls = [];
  let providers = async (force) => { calls.push(["read", force]); return [{ id: "codex", ready: true }]; };
  let provider = async (action, data) => { calls.push(["run", action, data]); return { ok: true }; };
  registerProviderRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    readProviders: (force) => providers(force),
    runProvider: (action, data) => provider(action, data),
    invalidateProviders: () => calls.push(["invalidate"]),
  });
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };
  return { routes, calls, call, setProviders: (next) => { providers = next; }, setProvider: (next) => { provider = next; } };
}

test("the providers list is read fresh only when asked", async () => {
  const h = harness();
  const [plain] = await h.call("/api/providers");
  assert.deepEqual(plain.value, { providers: [{ id: "codex", ready: true }] });
  await h.call("/api/providers", { query: "?force=1" });
  assert.deepEqual(h.calls, [["read", false], ["read", true]]);
});

test("a provider action goes through, and the list is thrown away after anything but a look at the screen", async () => {
  const h = harness();
  const [toggled] = await h.call("/api/provider", { body: { action: "toggle", provider: "kimi", enabled: false } });
  assert.equal(toggled.status, 200);
  await h.call("/api/provider", { body: { action: "screen", provider: "kimi" } });
  assert.deepEqual(h.calls.map((c) => c[0]), ["run", "invalidate", "run"]);
});

test("what the action refuses comes back as a 400 with the sentence, not as a crash", async () => {
  const h = harness();
  h.setProvider(async () => ({ error: "no agent goes by that name" }));
  const [said] = await h.call("/api/provider", { body: { action: "toggle", provider: "gemini" } });
  assert.deepEqual(said, { value: { error: "no agent goes by that name" }, status: 400 });
  h.setProvider(async () => { throw new Error("tmux would not open the sign-in"); });
  const [threw] = await h.call("/api/provider", { body: { action: "sign-in", provider: "kimi", name: "work" } });
  assert.equal(threw.status, 400);
  assert.match(threw.value.error, /tmux/);
});

test("a list that cannot be read is a 500 with an empty list, so the screen can still paint", async () => {
  const h = harness();
  h.setProviders(async () => { throw new Error("the config file is broken"); });
  const [said] = await h.call("/api/providers");
  assert.equal(said.status, 500);
  assert.deepEqual(said.value.providers, []);
  assert.match(said.value.error, /config file/);
});

test("the server opens a seat inside its agent's own login folder and refuses an agent the pickers hide", () => {
  assert.match(server, /held = accountDir\(HIVE_HOME, agent, account\);\s*try \{ shapeProviderAccount\(HOME, agent, held\); \} catch \{\}/);
  assert.match(server, /if \(where !== "cloud"\) await providerReadyOrSay\(eng\);/);
  assert.match(server, /await providerReadyOrSay\(agent\);\s*const mod = await import/);
  assert.match(server, /function accountOf\(command\) \{\s*return accountNameInCommand\(command\);/);
});

test("the sign-in of any provider runs its own login command inside the login's variable, in a tmux window the screen can read", () => {
  assert.match(server, /const words = \[\.\.\.Object\.entries\(env\)\.map\(\(\[k, v\]\) => `\$\{k\}=\$\{quoted\(v\)\}`\), \.\.\.spec\.login\.map\(quoted\)\];/);
  assert.match(server, /"new-session", "-d", "-s", session, "-x", "120", "-y", "36", "-c", HOME, command/);
  assert.match(server, /if \(key && !TMUX_KEYS\.has\(key\)\) return \{ error/);
});

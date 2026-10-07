import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { challengeOf, createDemoLogin, createMemoryLogin, loginReach, memoryClientStore, memoryOrigin, openInBrowser, trustedUrl } from "../lib/memory-login.mjs";
import { createVault, memoryVault, vaultAccount, vaultFollowing } from "../lib/memory-vault.mjs";

const BASE = "https://memory.example";
const realFetch = globalThis.fetch;

function memoryServer({ email = "Ana@Example.com", refreshOk = true, rotate = false, meta = {} } = {}) {
  const seen = { registered: [], authorize: null, traded: [], refreshed: 0, calls: [] };
  let live = "access-1";
  let current = "refresh-1";
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const where = new URL(url);
    if (where.origin !== BASE) return realFetch(url, init);
    if (where.pathname === "/.well-known/oauth-authorization-server") {
      return reply(200, { issuer: BASE, authorization_endpoint: `${BASE}/oauth/authorize`, token_endpoint: `${BASE}/oauth/token`, registration_endpoint: `${BASE}/oauth/register`, ...meta });
    }
    if (where.pathname === "/oauth/register") {
      const body = JSON.parse(init.body);
      seen.registered.push(body);
      return reply(201, { client_id: `client-${seen.registered.length}`, redirect_uris: body.redirect_uris });
    }
    if (where.pathname === "/oauth/token") {
      const form = new URLSearchParams(init.body);
      if (form.get("grant_type") === "authorization_code") {
        seen.traded.push(Object.fromEntries(form));
        if (challengeOf(form.get("code_verifier")) !== seen.authorize.get("code_challenge")) return reply(400, { error: "invalid_grant" });
        return reply(200, { access_token: live, refresh_token: "refresh-1", expires_in: 3600, token_type: "Bearer" });
      }
      seen.refreshed++;
      if (!refreshOk) return reply(400, { error: "invalid_grant" });
      if (rotate) {
        await new Promise((done) => setTimeout(done, 20));
        if (form.get("refresh_token") !== current) return reply(400, { error: "invalid_grant" });
        current = `refresh-${seen.refreshed + 1}`;
      }
      live = `access-${seen.refreshed + 1}`;
      return reply(200, { access_token: live, refresh_token: rotate ? current : "refresh-2", expires_in: 3600 });
    }
    const auth = init.headers?.authorization || "";
    seen.calls.push({ path: where.pathname, method: init.method || "GET", auth });
    if (auth !== `Bearer ${live}`) return reply(401, { error: "unauthorized" });
    if (where.pathname === "/api/whoami") return reply(200, { kind: "person", email: email ? email.toLowerCase() : null });
    return reply(200, { ok: true });
  };
  return { seen, fetchImpl, expire: () => { live = `${live}-rotated`; } };
}

async function signIn(server, { vault = memoryVault(), clients = memoryClientStore(), now = Date.now } = {}) {
  const opened = [];
  const login = createMemoryLogin({ baseUrl: BASE, vault, clients, fetchImpl: server.fetchImpl, open: (url) => opened.push(url), now });
  const started = await login.begin();
  const asked = new URL(started.url);
  server.seen.authorize = asked.searchParams;
  return { login, vault, clients, opened, asked };
}

test("signing in registers the Hive once, sends PKCE and state, trades the code and keeps the tokens in the vault", async () => {
  const server = memoryServer();
  const { login, vault, clients, opened, asked } = await signIn(server);
  assert.equal(opened.length, 1, "the browser is opened outside the app");
  assert.equal(opened[0], asked.toString());
  assert.equal(asked.origin + asked.pathname, `${BASE}/oauth/authorize`);
  assert.equal(asked.searchParams.get("code_challenge_method"), "S256");
  assert.match(asked.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(asked.searchParams.get("state").length >= 16);
  const redirect = asked.searchParams.get("redirect_uri");
  assert.match(redirect, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.deepEqual(server.seen.registered[0].redirect_uris, [redirect]);
  assert.equal((await login.status()).state, "waiting");

  const back = await realFetch(`${redirect}?code=the-code&state=${asked.searchParams.get("state")}`);
  assert.equal(back.status, 200);
  assert.match(await back.text(), /Pronto/);
  assert.equal(server.seen.traded.length, 1);
  assert.equal(server.seen.traded[0].redirect_uri, redirect);
  assert.equal(createHash("sha256").update(server.seen.traded[0].code_verifier).digest("base64url"), asked.searchParams.get("code_challenge"));
  assert.deepEqual(await login.status(), { state: "in", email: "ana@example.com", canEdit: true });
  const kept = vault.peek();
  assert.equal(kept.access, "access-1");
  assert.equal(kept.refresh, "refresh-1");
  assert.equal(kept.email, "ana@example.com");
  assert.equal(clients.peek().redirect, redirect);
  const late = await realFetch(redirect).then((r) => r.status, () => "closed");
  assert.ok(late === "closed" || late === 404, "the callback listener stops taking codes once one arrived");

  const again = createMemoryLogin({ baseUrl: BASE, vault: memoryVault(), clients, fetchImpl: server.fetchImpl, open: () => {} });
  const second = new URL((await again.begin()).url);
  again.cancel();
  if (second.searchParams.get("redirect_uri") === redirect) assert.equal(server.seen.registered.length, 1, "the same redirect reuses the registered client");
  else assert.equal(server.seen.registered.length, 2, "a new port needs a new registration");
});

test("a callback with the wrong state is refused and nothing is kept", async () => {
  const server = memoryServer();
  const { login, vault, asked } = await signIn(server);
  const redirect = asked.searchParams.get("redirect_uri");
  const forged = await realFetch(`${redirect}?code=stolen&state=not-the-one`);
  assert.equal(forged.status, 400);
  assert.equal(server.seen.traded.length, 0, "a forged state never reaches the token endpoint");
  assert.equal(vault.peek(), null);
  assert.equal((await login.status()).state, "waiting", "the real answer can still arrive");
  login.cancel();
  assert.equal((await login.status()).state, "out");
});

test("an expired access token is renewed with the refresh token, and a refused renewal signs the person out", async () => {
  const server = memoryServer();
  const { login, vault, asked } = await signIn(server);
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  server.expire();
  const said = await login.call("PATCH", "/api/memories/m1", { title: "x" });
  assert.equal(said.status, 200);
  assert.equal(server.seen.refreshed, 1);
  assert.equal(vault.peek().access, "access-2");
  assert.equal(vault.peek().refresh, "refresh-2");
  assert.equal(server.seen.calls.at(-1).auth, "Bearer access-2");

  const dead = memoryServer({ refreshOk: false });
  const other = await signIn(dead);
  await realFetch(`${other.asked.searchParams.get("redirect_uri")}?code=c&state=${other.asked.searchParams.get("state")}`);
  dead.expire();
  const out = await other.login.call("POST", "/api/memories/m1/archive");
  assert.equal(out.status, 401);
  assert.equal(out.out, true);
  assert.equal(other.vault.peek(), null, "a refused refresh leaves nothing in the vault");
  assert.deepEqual(await other.login.status(), { state: "out", notice: "expired" });
});

test("a token close to its end is renewed before it is sent", async () => {
  const server = memoryServer();
  const box = { at: Date.now() };
  const { login, vault, asked } = await signIn(server, { now: () => box.at });
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  box.at += 3600 * 1000;
  assert.equal(await login.access(), "access-2");
  assert.equal(vault.peek().access, "access-2");
});

test("signing out wipes the tokens from the vault", async () => {
  const server = memoryServer();
  const { login, vault, asked } = await signIn(server);
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  assert.ok(vault.peek());
  assert.deepEqual(await login.logout(), { state: "out" });
  assert.equal(vault.peek(), null);
  assert.equal(await login.access(), "");
});

test("an account without e-mail is signed in but cannot edit", async () => {
  const server = memoryServer({ email: null });
  const { login, asked } = await signIn(server);
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  assert.deepEqual(await login.status(), { state: "in", email: "", canEdit: false });
});

test("the login lives only where the browser and the server share a machine", () => {
  assert.equal(loginReach({ host: "app", env: {} }), "here");
  assert.equal(loginReach({ host: "127.0.0.1:8796", env: {} }), "here");
  assert.equal(loginReach({ host: "localhost:8790", env: {} }), "here");
  assert.equal(loginReach({ host: "hive.someone.example.dev", env: {} }), "pod");
  assert.equal(loginReach({ host: "127.0.0.1:8790", env: { KUBERNETES_SERVICE_HOST: "10.0.0.1" } }), "pod");
  assert.equal(loginReach({ host: "app", env: { HIVE_MEMORY_LOGIN: "pod" } }), "pod");
});

test("the vault keeps the tokens in the keychain through stdin, never on the command line", async () => {
  const runs = [];
  const run = async (command, args, input = "") => {
    runs.push({ command, args, input });
    if (args[0] === "find-generic-password") return { code: 0, stdout: runs.find((one) => one.args[0] === "-i").input.match(/-w "([^"]+)"/)[1] };
    return { code: 0, stdout: "" };
  };
  const vault = createVault({ platform: "darwin", account: vaultAccount("/Users/x/.hive"), run });
  assert.ok(await vault.write({ access: "secret-access", refresh: "secret-refresh" }));
  assert.ok(runs.every((one) => !one.args.join(" ").includes("secret")), "no token in argv");
  assert.equal(runs[0].command, "/usr/bin/security");
  assert.deepEqual(runs[0].args, ["-i"]);
  assert.ok(!runs[0].input.includes("secret-access"), "the keychain line carries the tokens packed");
  assert.deepEqual(await vault.read(), { access: "secret-access", refresh: "secret-refresh" });
  assert.ok(await vault.clear());
  assert.deepEqual(runs.at(-1).args.slice(0, 1), ["delete-generic-password"]);
  assert.notEqual(vaultAccount("/a/.hive"), vaultAccount("/b/.hive"), "each Hive home has its own vault entry");
  assert.equal(await createVault({ platform: "win32" }).available(), false);
  const linux = createVault({ platform: "linux", account: "a", run: async () => ({ code: -1, missing: true, stdout: "" }) });
  assert.equal(await linux.available(), false);
});

test("the sample login signs in and out without a server", async () => {
  const demo = createDemoLogin();
  assert.equal((await demo.status()).state, "out");
  await demo.begin();
  const inside = await demo.status();
  assert.equal(inside.state, "in");
  assert.equal(inside.demo, true);
  await demo.logout();
  assert.equal((await demo.status()).state, "out");
});

test("three readings at once while the token is expiring renew it once and keep the person signed in", async () => {
  const server = memoryServer({ rotate: true });
  const box = { at: Date.now() };
  const { login, vault, asked } = await signIn(server, { now: () => box.at });
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  box.at += 3600 * 1000;
  const tokens = await Promise.all([login.access(), login.access(), login.access()]);
  assert.equal(server.seen.refreshed, 1, "one trip to the token endpoint");
  assert.deepEqual(tokens, ["access-2", "access-2", "access-2"]);
  assert.equal(vault.peek().refresh, "refresh-2");
  assert.equal((await login.status()).state, "in");
});

test("a refused renewal does not sign out when another renewal already swapped the refresh token", async () => {
  const server = memoryServer({ rotate: true });
  const box = { at: Date.now() };
  const { login, vault, asked } = await signIn(server, { now: () => box.at });
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  box.at += 3600 * 1000;
  const other = createMemoryLogin({ baseUrl: BASE, vault, fetchImpl: server.fetchImpl, open: () => {}, now: () => box.at });
  assert.equal(await other.access(), "access-2");
  assert.equal(await login.access(), "access-2");
  assert.equal(vault.peek().refresh, "refresh-2", "the vault keeps the token the other renewal got");
});

test("the memory server address must be https, except on loopback", async () => {
  assert.equal(trustedUrl("http://memory.example"), null);
  assert.equal(trustedUrl("ftp://memory.example"), null);
  assert.equal(trustedUrl("https://user:pw@memory.example"), null);
  assert.equal(trustedUrl("javascript:alert(1)"), null);
  assert.ok(trustedUrl("https://memory.example"));
  assert.ok(trustedUrl("http://127.0.0.1:9000"));
  assert.ok(trustedUrl("http://localhost:9000"));
  assert.equal(memoryOrigin("http://memory.example"), "");
  const asked = [];
  const login = createMemoryLogin({ baseUrl: "http://memory.example", vault: memoryVault({ access: "a", refresh: "r", expiresAt: Date.now() + 3600000 }), fetchImpl: async (url) => { asked.push(url); throw new Error("no"); }, open: () => {} });
  assert.match((await login.begin()).error, /https/);
  assert.equal(await login.access(), "", "a token never leaves for a plain http server");
  assert.equal((await login.call("GET", "/api/whoami")).status, 401);
  assert.equal((await login.status()).state, "out");
  assert.equal(asked.length, 0);
});

for (const [what, meta] of [
  ["another issuer", { issuer: "https://evil.example" }],
  ["an authorize endpoint on another host", { authorization_endpoint: "https://evil.example/oauth/authorize" }],
  ["a token endpoint on another host", { token_endpoint: "https://evil.example/oauth/token" }],
  ["a registration endpoint on another host", { registration_endpoint: "https://evil.example/oauth/register" }],
  ["a token endpoint over plain http", { token_endpoint: "http://memory.example/oauth/token" }],
  ["an authorize endpoint that is not a web address", { authorization_endpoint: "file:///etc/passwd" }]
]) {
  test(`metadata with ${what} is refused before anything opens`, async () => {
    const server = memoryServer({ meta });
    const opened = [];
    const login = createMemoryLogin({ baseUrl: BASE, vault: memoryVault(), clients: memoryClientStore(), fetchImpl: server.fetchImpl, open: (url) => opened.push(url) });
    const started = await login.begin();
    assert.ok(started.error);
    assert.equal(opened.length, 0);
    assert.equal(server.seen.registered.length, 0);
    assert.equal(login.waiting(), null);
  });
}

test("a renewal against metadata pointing elsewhere keeps the refresh token home", async () => {
  const server = memoryServer();
  const box = { at: Date.now() };
  const { login, asked } = await signIn(server, { now: () => box.at });
  await realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`);
  const sent = [];
  const twisted = async (url, init) => {
    sent.push(String(url));
    if (new URL(url).pathname === "/.well-known/oauth-authorization-server") {
      const body = { issuer: BASE, authorization_endpoint: `${BASE}/oauth/authorize`, token_endpoint: "https://evil.example/oauth/token" };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }
    return server.fetchImpl(url, init);
  };
  const vault = memoryVault({ access: "access-1", refresh: "refresh-1", expiresAt: box.at - 1 });
  const other = createMemoryLogin({ baseUrl: BASE, vault, fetchImpl: twisted, open: () => {}, now: () => box.at });
  assert.equal(await other.access(), "");
  assert.ok(sent.every((url) => new URL(url).origin === BASE));
  assert.equal(vault.peek().refresh, "refresh-1", "a refused metadata is not a refused renewal");
  assert.equal(login.waiting(), null);
});

test("the browser only opens https, or http on loopback", () => {
  const runs = [];
  const run = (command, args) => { runs.push([command, args]); return { on() {}, unref() {} }; };
  assert.equal(openInBrowser("file:///etc/passwd", { platform: "darwin", run }), false);
  assert.equal(openInBrowser("http://memory.example/oauth/authorize", { platform: "darwin", run }), false);
  assert.equal(openInBrowser("javascript:alert(1)", { platform: "linux", run }), false);
  assert.equal(openInBrowser("--help", { platform: "linux", run }), false);
  assert.equal(runs.length, 0);
  assert.equal(openInBrowser("https://memory.example/oauth/authorize", { platform: "darwin", run }), true);
  assert.equal(openInBrowser("http://127.0.0.1:9000/x", { platform: "linux", run }), true);
  assert.deepEqual(runs.map(([command]) => command), ["open", "xdg-open"]);
});

test("each memory server gets its own vault entry and its own registered client", async () => {
  assert.notEqual(vaultAccount("/a/.hive", "https://memory.example"), vaultAccount("/a/.hive", "https://other.example"));
  assert.equal(vaultAccount("/a/.hive", "https://memory.example"), vaultAccount("/a/.hive", "https://memory.example"));
  const server = memoryServer();
  const clients = memoryClientStore();
  const { login } = await signIn(server, { clients });
  login.cancel();
  assert.equal(clients.peek().origin, BASE);
  await clients.write({ ...clients.peek(), origin: "https://other.example" });
  const again = createMemoryLogin({ baseUrl: BASE, vault: memoryVault(), clients, fetchImpl: server.fetchImpl, open: () => {} });
  await again.begin();
  again.cancel();
  assert.equal(server.seen.registered.length, 2, "a client registered on another server is not reused");
});

test("a second click on sign in reuses the request in flight, and cancel closes it", async () => {
  const server = memoryServer();
  const opened = [];
  let listeners = 0;
  const login = createMemoryLogin({ baseUrl: BASE, vault: memoryVault(), clients: memoryClientStore(), fetchImpl: server.fetchImpl, open: (url) => opened.push(url), listen: (fn) => { listeners++; return createServer(fn); } });
  const [first, second] = await Promise.all([login.begin(), login.begin()]);
  const third = await login.begin();
  assert.equal(listeners, 1, "only one callback listener");
  assert.equal(server.seen.registered.length, 1);
  assert.equal(first.url, second.url);
  assert.equal(first.url, third.url);
  assert.ok(opened.every((url) => url === first.url));
  const redirect = new URL(first.url).searchParams.get("redirect_uri");
  login.cancel();
  assert.equal((await login.status()).state, "out");
  const late = await realFetch(redirect).then((r) => r.status, () => "closed");
  assert.equal(late, "closed", "the listener is closed after cancel");
});

test("cancel while the sign-in is still starting leaves no listener behind", async () => {
  const server = memoryServer();
  let made = null;
  const login = createMemoryLogin({ baseUrl: BASE, vault: memoryVault(), clients: memoryClientStore(), fetchImpl: server.fetchImpl, open: () => {}, listen: (fn) => (made = createServer(fn)) });
  const starting = login.begin();
  login.cancel();
  assert.deepEqual(await starting, { error: "cancelled" });
  assert.equal(login.waiting(), null);
  assert.equal(made?.listening ?? false, false);
});

test("a login that reads its address late starts working once the address arrives, without a new login", async () => {
  const server = memoryServer();
  let address = "";
  const vault = memoryVault();
  const login = createMemoryLogin({ baseUrl: () => address, vault, clients: memoryClientStore(), fetchImpl: server.fetchImpl, open: () => {} });
  assert.equal(login.configured(), false);
  assert.deepEqual(await login.begin(), { error: "HIVE_MEMORY_URL is not set" });
  assert.equal(await login.access(), "");
  address = `${BASE}/`;
  assert.equal(login.configured(), true);
  const started = await login.begin();
  assert.equal(new URL(started.url).origin, BASE);
  assert.equal((await login.status()).state, "waiting");
  address = "";
  assert.equal((await login.status()).state, "out", "losing the address drops the request in flight");
  assert.equal(login.waiting(), null);
});

test("the vault follows the memory address, one keychain entry per server", async () => {
  let origin = "";
  const made = [];
  const vault = vaultFollowing(() => vaultAccount("/home/ana/.hive", origin), (account) => {
    made.push(account);
    return memoryVault({ account });
  });
  assert.deepEqual(await vault.read(), { account: vaultAccount("/home/ana/.hive", "") });
  origin = BASE;
  assert.deepEqual(await vault.read(), { account: vaultAccount("/home/ana/.hive", BASE) });
  await vault.read();
  assert.equal(made.length, 2, "each account is made once and reused");
  assert.equal(vault.kind, "memory");
});

const A = "https://memory-a.example";
const B = "https://memory-b.example";

function twoServers() {
  const seen = [];
  const gates = {};
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const where = new URL(url);
    const auth = init.headers?.authorization || "";
    seen.push({ origin: where.origin, path: where.pathname, auth, body: String(init.body || "") });
    const gate = gates[`${where.origin}${where.pathname}`];
    if (gate) await gate;
    if (where.pathname === "/.well-known/oauth-authorization-server") {
      return reply(200, { issuer: where.origin, authorization_endpoint: `${where.origin}/oauth/authorize`, token_endpoint: `${where.origin}/oauth/token`, registration_endpoint: `${where.origin}/oauth/register` });
    }
    if (where.pathname === "/oauth/register") return reply(201, { client_id: `client-${where.hostname}` });
    if (where.pathname === "/oauth/token") return reply(200, { access_token: `fresh-${where.hostname}`, refresh_token: `refresh-${where.hostname}`, expires_in: 3600 });
    return reply(200, { kind: "person", email: `ana@${where.hostname}` });
  };
  const hold = (key) => {
    let open;
    gates[key] = new Promise((done) => { open = done; });
    return () => { delete gates[key]; open(); };
  };
  return { seen, fetchImpl, hold };
}

function vaultsPerServer(tokens) {
  const boxes = {};
  const gates = {};
  const made = (account) => {
    const inner = memoryVault(tokens[account] || null);
    boxes[account] = inner;
    return {
      kind: "memory",
      available: async () => true,
      async read() { if (gates[account]) await gates[account]; return inner.read(); },
      write: (value) => inner.write(value),
      clear: () => inner.clear()
    };
  };
  const hold = (account) => {
    let open;
    gates[account] = new Promise((done) => { open = done; });
    return () => { delete gates[account]; open(); };
  };
  return { boxes, made, hold };
}

const tokenFor = (name, expiresAt = Date.now() + 3600 * 1000) => ({ access: `access-${name}`, refresh: `refresh-${name}`, expiresAt, clientId: `client-${name}`, email: "" });

test("a vault read that ends after the address changed never sends the old server's token to the new one", async () => {
  let address = A;
  const servers = twoServers();
  const vaults = vaultsPerServer({ [A]: tokenFor("a"), [B]: tokenFor("b") });
  const vault = vaultFollowing(() => memoryOrigin(address), vaults.made);
  const login = createMemoryLogin({ baseUrl: () => address, vault, clients: memoryClientStore(), fetchImpl: servers.fetchImpl, open: () => {} });
  const release = vaults.hold(A);
  const pending = login.call("GET", "/api/whoami");
  await new Promise((done) => setTimeout(done, 5));
  address = B;
  release();
  const said = await pending;
  assert.equal(said.status, 401, "the call aimed at the old address gives up");
  assert.deepEqual(servers.seen, [], "nothing left the Hive with the old token");
  const again = await login.call("GET", "/api/whoami");
  assert.equal(again.status, 200);
  assert.deepEqual(servers.seen.map((one) => [one.origin, one.auth]), [[B, "Bearer access-b"]]);
});

test("a renewal that ends after the address changed is written to no vault", async () => {
  let address = A;
  const servers = twoServers();
  const vaults = vaultsPerServer({ [A]: tokenFor("a", Date.now() - 1000), [B]: tokenFor("b") });
  const vault = vaultFollowing(() => memoryOrigin(address), vaults.made);
  const login = createMemoryLogin({ baseUrl: () => address, vault, clients: memoryClientStore(), fetchImpl: servers.fetchImpl, open: () => {} });
  const release = servers.hold(`${A}/oauth/token`);
  const pending = login.access();
  await new Promise((done) => setTimeout(done, 5));
  address = B;
  release();
  assert.equal(await pending, "", "the renewed token of the old server is handed to nobody");
  assert.equal(vaults.boxes[A].peek().access, "access-a");
  assert.equal(vaults.boxes[B].peek().access, "access-b", "the new server's vault keeps its own token");
  assert.equal(await login.access(), "access-b");
});

test("a sign-in that comes back after the address changed is kept nowhere", async () => {
  let address = A;
  const servers = twoServers();
  const vaults = vaultsPerServer({});
  const vault = vaultFollowing(() => memoryOrigin(address), vaults.made);
  const login = createMemoryLogin({ baseUrl: () => address, vault, clients: memoryClientStore(), fetchImpl: servers.fetchImpl, open: () => {} });
  const asked = new URL((await login.begin()).url);
  const release = servers.hold(`${A}/oauth/token`);
  const back = realFetch(`${asked.searchParams.get("redirect_uri")}?code=c&state=${asked.searchParams.get("state")}`).then((r) => r.text());
  await new Promise((done) => setTimeout(done, 20));
  address = B;
  await login.status();
  release();
  assert.match(await back, /não terminou/);
  for (const box of Object.values(vaults.boxes)) assert.equal(box.peek(), null);
  assert.equal(await login.access(), "");
});

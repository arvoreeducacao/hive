import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

export const LOGIN_WAIT_MS = 5 * 60 * 1000;

export const TOKEN_SKEW_MS = 60000;

export const MEMORY_SCOPE = "mcp";

const LOCAL_HOSTS = new Set(["app", "127.0.0.1", "localhost", "::1", "[::1]"]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function trustedUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { return null; }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return url;
  return null;
}

export const memoryOrigin = (baseUrl) => trustedUrl(baseUrl)?.origin || "";

export const newVerifier = () => randomBytes(32).toString("base64url");

export const challengeOf = (verifier) => createHash("sha256").update(String(verifier)).digest("base64url");

export function loginReach({ host = "", env = process.env } = {}) {
  if (env.HIVE_MEMORY_LOGIN === "pod" || env.KUBERNETES_SERVICE_HOST) return "pod";
  const name = String(host || "").trim().toLowerCase().replace(/:\d+$/, "");
  return LOCAL_HOSTS.has(name) ? "here" : "pod";
}

export function openInBrowser(url, { platform = process.platform, run = spawn } = {}) {
  if (!trustedUrl(url)) return false;
  const [command, args] = platform === "darwin" ? ["open", [url]] : platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    const child = run(command, args, { stdio: "ignore", detached: true });
    child.on?.("error", () => {});
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

export function fileClientStore(file) {
  return {
    async read() {
      try { return JSON.parse(await readFile(file, "utf8")); } catch { return {}; }
    },
    async write(value) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(value, null, 2));
    }
  };
}

export function memoryClientStore(value = {}) {
  let held = value;
  return { async read() { return held; }, async write(next) { held = next; }, peek: () => held };
}

const pageOf = (ok, why = "") => `<!doctype html><meta charset="utf-8"><title>Hive</title><body style="font:16px system-ui;padding:48px;max-width:34rem;line-height:1.5">${ok
  ? "<p>Pronto: o Hive já edita a memória do time como você. Pode fechar esta aba.</p><p>Done: the Hive can now edit the team memory as you. You can close this tab.</p>"
  : `<p>O login não terminou. / The sign-in did not finish.</p><p>${String(why).replace(/[<>&"]/g, "")}</p>`}`;

async function readJson(answer) {
  const text = await answer.text();
  try { return JSON.parse(text); } catch { return {}; }
}

export function createMemoryLogin({
  baseUrl,
  vault,
  clients = memoryClientStore(),
  fetchImpl = globalThis.fetch,
  open = openInBrowser,
  listen = createServer,
  now = Date.now,
  waitMs = LOGIN_WAIT_MS,
  timeout = 8000
} = {}) {
  const addressOf = typeof baseUrl === "function" ? baseUrl : () => baseUrl;
  let root = null;
  let origin = "";
  let here = null;
  let held;
  let who = null;
  let notice = "";
  let pending = null;
  let starting = null;
  let renewing = null;
  let round = 0;

  function aim() {
    const next = String(addressOf() || "").replace(/\/+$/, "");
    if (next === root) return;
    if (root !== null) {
      round++;
      stopWaiting();
      held = undefined;
      who = null;
      notice = "";
    }
    root = next;
    origin = memoryOrigin(root);
    here = { root, origin, box: vault.pin ? vault.pin() : vault };
  }

  function aimed() {
    aim();
    return here;
  }

  const gone = (at) => aimed() !== at;

  const ask = async (url, init = {}) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeout);
    try { return await fetchImpl(url, { ...init, signal: stop.signal }); } finally { clearTimeout(timer); }
  };

  async function load(at) {
    if (held !== undefined) return held;
    const read = (await at.box.read()) || null;
    if (gone(at)) return null;
    if (held === undefined) held = read;
    return held;
  }

  async function keep(next, at) {
    if (gone(at)) return false;
    held = next;
    await at.box.write(next);
    return true;
  }

  async function forget(why, at) {
    if (gone(at)) return;
    held = null;
    who = null;
    notice = why;
    await at.box.clear();
  }

  async function endpoints({ root, origin }) {
    const answer = await ask(`${root}/.well-known/oauth-authorization-server`, { headers: { accept: "application/json" } });
    if (!answer.ok) throw new Error(`the memory server answered ${answer.status} for its oauth metadata`);
    const meta = await readJson(answer);
    if (!meta.authorization_endpoint || !meta.token_endpoint) throw new Error("the memory server does not announce an oauth server");
    if (String(meta.issuer || "").replace(/\/+$/, "") !== root) throw new Error("the memory server announces another issuer");
    const points = { authorize: String(meta.authorization_endpoint), token: String(meta.token_endpoint), register: String(meta.registration_endpoint || "") };
    for (const [name, value] of Object.entries(points)) {
      if (name === "register" && !value) continue;
      if (trustedUrl(value)?.origin !== origin) throw new Error(`the memory server announces a ${name} endpoint outside ${origin}`);
    }
    return points;
  }

  async function clientFor(points, redirect, { origin }) {
    const was = await clients.read();
    if (was?.clientId && was.redirect === redirect && was.origin === origin) return was.clientId;
    if (!points.register) throw new Error("the memory server does not let a client register itself");
    const answer = await ask(points.register, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_name: "Hive", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: MEMORY_SCOPE })
    });
    const body = await readJson(answer);
    if (!answer.ok || !body.client_id) throw new Error(`the memory server refused to register the Hive (${body.error_description || body.error || answer.status})`);
    await clients.write({ clientId: String(body.client_id), redirect, port: Number(new URL(redirect).port), origin });
    return String(body.client_id);
  }

  function heldOf(body, was = {}) {
    const access = String(body?.access_token || "");
    if (!access) return null;
    return {
      access,
      refresh: String(body?.refresh_token || was.refresh || ""),
      expiresAt: now() + (Number(body?.expires_in) || 3600) * 1000,
      clientId: was.clientId || "",
      email: was.email || ""
    };
  }

  async function exchange(code) {
    const { points, clientId, redirect, verifier } = pending;
    const answer = await ask(points.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirect, code, code_verifier: verifier }).toString()
    });
    const body = await readJson(answer);
    const next = answer.ok ? heldOf(body, { clientId }) : null;
    if (!next) throw new Error(`the memory server did not trade the code (${body.error_description || body.error || answer.status})`);
    return next;
  }

  function refresh(at) {
    if (renewing?.at !== at) {
      const job = { at, done: renew(at).finally(() => { if (renewing === job) renewing = null; }) };
      renewing = job;
    }
    return renewing.done;
  }

  async function renew(at) {
    const was = await load(at);
    if (!was?.refresh) return null;
    const spent = was.refresh;
    let next = null;
    try {
      const points = await endpoints(at);
      const answer = await ask(points.token, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: was.clientId || "", refresh_token: was.refresh }).toString()
      });
      if (answer.ok) next = heldOf(await readJson(answer), was);
      else if (answer.status >= 500) return null;
    } catch {
      return null;
    }
    if (gone(at)) return null;
    if (!next) {
      const kept = (await at.box.read()) || null;
      if (gone(at)) return null;
      if (kept?.refresh && kept.refresh !== spent) {
        held = kept;
        return kept.access || null;
      }
      await forget("expired", at);
      return null;
    }
    return (await keep(next, at)) ? next.access : null;
  }

  async function accessAt(at) {
    if (!at.origin) return "";
    const was = await load(at);
    if (gone(at) || !was?.access) return "";
    if (Number(was.expiresAt || 0) - TOKEN_SKEW_MS > now()) return was.access;
    const renewed = (await refresh(at)) || "";
    return gone(at) ? "" : renewed;
  }

  const access = () => accessAt(aimed());

  async function call(method, path, body) {
    const at = aimed();
    let token = await accessAt(at);
    if (!token || gone(at)) return { status: 401, out: true, body: {} };
    const send = (bearer) => ask(`${at.root}${path}`, {
      method,
      headers: { authorization: `Bearer ${bearer}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let answer = await send(token);
    if (answer.status === 401) {
      token = await refresh(at);
      if (gone(at)) return { status: 401, out: true, body: {} };
      if (!token && held) return { status: 502, body: { error: "the memory server did not renew the sign-in" } };
      if (!token) return { status: 401, out: true, body: {} };
      answer = await send(token);
      if (answer.status === 401) {
        await forget("expired", at);
        return { status: 401, out: true, body: {} };
      }
    }
    return { status: answer.status, ok: answer.ok, body: await readJson(answer) };
  }

  async function whoami() {
    if (who) return who;
    const at = aimed();
    try {
      const said = await call("GET", "/api/whoami");
      if (said.ok && said.body?.kind && !gone(at)) {
        who = { email: said.body.email ? String(said.body.email).trim().toLowerCase() : "", kind: String(said.body.kind) };
        const was = await load(at);
        if (was && was.email !== who.email) await keep({ ...was, email: who.email }, at);
      }
    } catch {}
    return who;
  }

  function stopWaiting(why = "") {
    if (!pending) return;
    clearTimeout(pending.timer);
    try { pending.server.close(); } catch {}
    pending = null;
    if (why) notice = why;
  }

  function listenOn(port, onRequest) {
    return new Promise((done, fail) => {
      const server = listen(onRequest);
      server.once("error", fail);
      server.listen(port, "127.0.0.1", () => done(server));
    });
  }

  async function landed(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback" || !pending) {
      res.writeHead(404, { connection: "close" }).end();
      return;
    }
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const refused = url.searchParams.get("error_description") || url.searchParams.get("error") || "";
    if (state !== pending.state) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8", connection: "close" }).end(pageOf(false, "state"));
      return;
    }
    if (refused || !code) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", connection: "close" }).end(pageOf(false, refused || "no code"));
      stopWaiting("refused");
      return;
    }
    const at = pending.at;
    try {
      const next = await exchange(code);
      if (!(await keep(next, at))) throw new Error("the memory address changed during the sign-in");
      who = null;
      notice = "";
      stopWaiting();
      await whoami();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", connection: "close" }).end(pageOf(true));
    } catch (wrong) {
      stopWaiting("failed");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", connection: "close" }).end(pageOf(false, wrong?.message || wrong));
    }
  }

  function begin() {
    aim();
    if (pending) {
      open(pending.url);
      return Promise.resolve({ url: pending.url });
    }
    if (!starting) starting = start().finally(() => { starting = null; });
    return starting;
  }

  async function start() {
    notice = "";
    const at = here;
    if (!at.root) return { error: "HIVE_MEMORY_URL is not set" };
    if (!at.origin) return { error: "HIVE_MEMORY_URL must be an https address" };
    const mine = round;
    let points;
    try { points = await endpoints(at); } catch (wrong) { return { error: String(wrong?.message || wrong) }; }
    const was = await clients.read();
    let server = null;
    for (const port of [Number(was?.port) || 0, 0]) {
      try { server = await listenOn(port, (req, res) => { landed(req, res); }); break; } catch {}
    }
    if (!server) return { error: "no free port on 127.0.0.1 for the sign-in" };
    const redirect = `http://127.0.0.1:${server.address().port}/callback`;
    let clientId;
    try { clientId = await clientFor(points, redirect, at); } catch (wrong) {
      server.close();
      return { error: String(wrong?.message || wrong) };
    }
    if (mine !== round) {
      server.close();
      return { error: "cancelled" };
    }
    const verifier = newVerifier();
    const state = randomBytes(16).toString("base64url");
    const url = new URL(points.authorize);
    for (const [key, value] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirect, scope: MEMORY_SCOPE, state, code_challenge: challengeOf(verifier), code_challenge_method: "S256" })) url.searchParams.set(key, value);
    const timer = setTimeout(() => stopWaiting("timeout"), waitMs);
    timer.unref?.();
    pending = { server, state, verifier, redirect, clientId, points, timer, at, url: url.toString() };
    open(pending.url);
    return { url: pending.url };
  }

  return {
    begin,
    cancel() {
      round++;
      stopWaiting();
    },
    access,
    call,
    configured() {
      aim();
      return !!root;
    },
    async status() {
      const at = aimed();
      if (pending) return { state: "waiting", url: pending.url };
      if (!at.origin) return { state: "out", notice };
      const was = await load(at);
      if (!was?.access) return { state: "out", notice };
      await accessAt(at);
      if (!held) return { state: "out", notice };
      const me = await whoami();
      if (!held) return { state: "out", notice };
      const email = me ? me.email : held.email || "";
      return { state: "in", email, canEdit: !!email };
    },
    async logout() {
      const at = aimed();
      round++;
      stopWaiting();
      await forget("", at);
      return { state: "out" };
    },
    waiting: () => (pending ? { redirect: pending.redirect, state: pending.state, url: pending.url } : null)
  };
}

export function createDemoLogin({ email = "voce@example.com" } = {}) {
  let inside = false;
  return {
    demo: true,
    async begin() { inside = true; return { url: "" }; },
    cancel() {},
    async access() { return inside ? "demo" : ""; },
    async call() { return { status: 401, out: true, body: {} }; },
    async status() { return inside ? { state: "in", email, canEdit: true, demo: true } : { state: "out", demo: true }; },
    async logout() { inside = false; return { state: "out" }; },
    waiting: () => null
  };
}

import { createHash, randomBytes, randomUUID } from "node:crypto";

export const NO_LEAF = "this hive is not pointed at a leaf yet — set HIVE_LEAF_URL in the hive config";
export const LEAF_SCOPES = "leaf:read leaf:write offline_access";
export const MCP_PROTOCOL = "2025-06-18";
export const TOKEN_SKEW = 60000;

export const leafBase = (env = process.env) =>
  String(env.LEAF_URL || env.HIVE_LEAF_URL || "").trim().replace(/\/+$/, "");

export const metadataUrl = (base) => `${base}/.well-known/oauth-authorization-server`;
export const mcpUrl = (base) => `${base}/api/mcp`;

export const newVerifier = () => randomBytes(32).toString("base64url");
export const challengeOf = (verifier) =>
  createHash("sha256").update(String(verifier)).digest("base64url");

export function registration(redirect) {
  return {
    client_name: "Hive",
    redirect_uris: [redirect],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: LEAF_SCOPES
  };
}

export function endpointsOf(meta) {
  const authorize = String(meta?.authorization_endpoint || "");
  const token = String(meta?.token_endpoint || "");
  const register = String(meta?.registration_endpoint || "");
  if (!authorize || !token) return { error: "the leaf at that address does not announce an oauth server" };
  return { authorize, token, register, issuer: String(meta?.issuer || "") };
}

export function authorizeUrl(endpoints, { clientId, redirect, challenge, state, resource }) {
  const url = new URL(endpoints.authorize);
  const asked = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    scope: LEAF_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource
  };
  for (const [key, value] of Object.entries(asked)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

export function codeForm({ clientId, redirect, code, verifier, resource }) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirect,
    code,
    code_verifier: verifier,
    ...(resource ? { resource } : {})
  });
}

export function refreshForm({ clientId, refresh, resource }) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refresh,
    ...(resource ? { resource } : {})
  });
}

export function heldOf(answer, was = {}, now = Date.now()) {
  const access = String(answer?.access_token || "");
  if (!access) return { error: String(answer?.error_description || answer?.error || "the leaf gave no token") };
  const life = Number(answer?.expires_in) || 900;
  return {
    access,
    refresh: String(answer?.refresh_token || was.refresh || ""),
    scopes: String(answer?.scope || was.scopes || LEAF_SCOPES),
    expiresAt: now + life * 1000
  };
}

export const stale = (held, now = Date.now()) =>
  !held?.access || Number(held.expiresAt || 0) - TOKEN_SKEW <= now;

export const canWrite = (held) => String(held?.scopes || "").split(/\s+/).includes("leaf:write");

export const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
export const note = (method, params) => ({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });

export function saidOf(body, kind = "") {
  const text = String(body || "");
  if (/text\/event-stream/i.test(kind) || /^event:|^data:/m.test(text)) {
    const said = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { said.push(JSON.parse(payload)); } catch {}
    }
    return said;
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export function answerOf(said, id) {
  const found = said.find((one) => one && one.id === id);
  if (!found) return { error: "the leaf answered nothing for that call" };
  if (found.error) return { error: String(found.error.message || found.error.code || "the leaf refused the call") };
  return { result: found.result };
}

export function toolText(result) {
  const parts = (result?.content || []).filter((one) => one?.type === "text").map((one) => one.text);
  const text = parts.join("\n");
  if (result?.isError) {
    let said = text;
    try { said = JSON.parse(text)?.message || text; } catch {}
    return { error: said || "the tool refused" };
  }
  try { return { said: JSON.parse(text) }; } catch { return { said: text }; }
}

export const takesArgument = (inputs, tool, name) =>
  Boolean(inputs?.[tool]?.properties?.[name]);

export function docUrl(base, id) {
  return `${base}/doc/${encodeURIComponent(String(id || ""))}`;
}

export function leafSession({ base, token, fetch: call = fetch, timeout = 30000 }) {
  const endpoint = mcpUrl(base);
  let session = "";
  let next = 0;
  const headers = () => ({
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": MCP_PROTOCOL,
    ...(session ? { "mcp-session-id": session } : {})
  });

  async function send(body, want) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    let answer;
    try {
      answer = await call(endpoint, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: abort.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const held = answer.headers?.get?.("mcp-session-id");
    if (held) session = held;
    if (answer.status === 401) return { error: "the leaf refused the token" };
    if (answer.status === 429) return { error: "the leaf is rate limiting this account, wait a minute" };
    const text = await answer.text();
    if (!answer.ok) return { error: `the leaf answered ${answer.status}: ${text.slice(0, 200)}` };
    if (!want) return { ok: true };
    return answerOf(saidOf(text, answer.headers?.get?.("content-type") || ""), want);
  }

  return {
    get session() { return session; },
    async open() {
      const id = ++next;
      const started = await send(rpc(id, "initialize", {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {},
        clientInfo: { name: "hive", version: "1" }
      }), id);
      if (started.error) return started;
      await send(note("notifications/initialized"), 0);
      return { server: started.result?.serverInfo || {} };
    },
    async tools() {
      const id = ++next;
      const listed = await send(rpc(id, "tools/list", {}), id);
      if (listed.error) return listed;
      const offered = listed.result?.tools || [];
      const inputs = {};
      for (const one of offered) inputs[one.name] = one.inputSchema || {};
      return { tools: offered.map((one) => one.name), inputs };
    },
    async call(name, args = {}) {
      const id = ++next;
      const said = await send(rpc(id, "tools/call", { name, arguments: args }), id);
      if (said.error) return said;
      return toolText(said.result);
    }
  };
}

export function consentUrl({ endpoints, clientId, redirect, resource }) {
  const verifier = newVerifier();
  const state = randomUUID();
  return {
    verifier,
    state,
    url: authorizeUrl(endpoints, { clientId, redirect, challenge: challengeOf(verifier), state, resource })
  };
}

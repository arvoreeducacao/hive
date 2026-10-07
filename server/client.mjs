import { bodyHashOf, newNonce, signRequest } from "./identity.mjs";

export const RETRY_STEP = 1000;
export const RETRY_CAP = 15000;
export const COMPLAIN_AFTER = 4;
export const CALL_TIMEOUT_MS = 60000;

export function signedHeaders({ secret, fingerprint, audience, method, path, body }) {
  const at = String(Date.now());
  const nonce = newNonce();
  const signature = signRequest(secret, { method, path, bodyHash: bodyHashOf(body), at, nonce, audience });
  return {
    "x-hive-key": fingerprint,
    "x-hive-at": at,
    "x-hive-nonce": nonce,
    "x-hive-signature": signature
  };
}

export function signedQuery({ secret, fingerprint, audience, path = "/stream" }) {
  const at = String(Date.now());
  const nonce = newNonce();
  const signature = signRequest(secret, { method: "GET", path, bodyHash: bodyHashOf(""), at, nonce, audience });
  const query = new URLSearchParams({ key: fingerprint, at, nonce, signature });
  return query.toString();
}

export const WHY_CEILING = 240;
export const DOOR_IS_DOWN = new Set([500, 502, 503, 504]);

export function whyOf({ ok, status }, parsed, text) {
  if (ok) return "";
  if (parsed?.error) return String(parsed.error);
  const bare = String(text || "").trim();
  if (!bare) return `the door answered ${status} and said nothing else`;
  if (bare.startsWith("<")) {
    return DOOR_IS_DOWN.has(status)
      ? `the server did not answer (${status}) — it is restarting or down`
      : `whoever answered ${status} was not the server`;
  }
  return bare.slice(0, WHY_CEILING);
}

export function createBrokerClient({ url, identity, audience, fetchImpl = fetch }) {
  const base = String(url).replace(/\/+$/, "");

  /* a caller that hands the server its own deadline — a scan, a sync — used to be
     cut off here at a minute regardless, so the answer it was still waiting for
     came back as "the server did not answer in time" while the work carried on
     over there. Such a caller passes its deadline along now; everything else
     keeps the minute it always had. */
  async function call(method, path, payload, { timeoutMs = CALL_TIMEOUT_MS } = {}) {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers = {
      ...signedHeaders({ secret: identity.secret, fingerprint: identity.fingerprint, audience, method, path, body }),
      ...(body ? { "content-type": "application/json" } : {})
    };
    let answer;
    try {
      answer = await fetchImpl(base + path, { method, headers, body: body || undefined, signal: AbortSignal.timeout(timeoutMs) });
    } catch (wrong) {
      const why = wrong?.name === "TimeoutError" || wrong?.name === "AbortError"
        ? "the server did not answer in time"
        : `the server could not be reached — ${String(wrong?.message || wrong)}`;
      return { ok: false, status: 0, body: null, error: why };
    }
    const text = await answer.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    return { ok: answer.ok, status: answer.status, body: parsed, error: whyOf(answer, parsed, text) };
  }

  return {
    get: (path, opts) => call("GET", path, undefined, opts),
    post: (path, payload, opts) => call("POST", path, payload ?? {}, opts),
    del: (path, opts) => call("DELETE", path, undefined, opts),
    me: () => call("GET", "/api/me"),
    board: () => call("GET", "/api/board"),
    say: (to, body, kind = "say") => call("POST", "/api/say", { to, body, kind }),
    panel: (panel) => call("POST", "/api/panel", { panel }),
    streamUrl: () => `${base.replace(/^http/, "ws")}/stream?${signedQuery({ secret: identity.secret, fingerprint: identity.fingerprint, audience })}`,
    terminalUrl: ({ seat, cols, rows, readOnly = false }) => {
      const asked = new URLSearchParams({ seat: String(seat), cols: String(cols), rows: String(rows) });
      if (readOnly) asked.set("read", "1");
      const signedPath = `/terminal?${asked.toString()}`;
      const signature = signedQuery({ secret: identity.secret, fingerprint: identity.fingerprint, audience, path: signedPath });
      return `${base.replace(/^http/, "ws")}${signedPath}&${signature}`;
    }
  };
}

export function attachStream({
  open,
  onEnvelope,
  warn = () => {},
  retryStep = RETRY_STEP,
  retryCap = RETRY_CAP,
  complainAfter = COMPLAIN_AFTER
} = {}) {
  let live = null;
  let attempt = 0;
  let leaving = false;
  let waking = null;

  function again(why) {
    if (leaving) return;
    attempt += 1;
    if (attempt === complainAfter || (attempt > complainAfter && attempt % 10 === 0)) warn(why);
    clearTimeout(waking);
    waking = setTimeout(attach, Math.min(retryCap, retryStep * attempt));
    waking.unref?.();
  }

  function attach() {
    waking = null;
    let mine = null;
    try { mine = open(); } catch (wrong) { return again(`could not reach the broker: ${wrong.message}`); }
    if (!mine) return again("could not reach the broker");
    live = mine;

    mine.on("open", () => { attempt = 0; });
    mine.on("message", (data) => {
      let heard = null;
      try { heard = JSON.parse(String(data)); } catch { return; }
      onEnvelope(heard);
    });
    mine.on("close", () => { if (live === mine) live = null; again("the broker stream closed"); });
    mine.on("error", (wrong) => warn(`broker stream: ${wrong?.message || wrong}`));
  }

  attach();

  return {
    get up() { return !!live && live.readyState === 1; },
    get tries() { return attempt; },
    stop() {
      leaving = true;
      clearTimeout(waking);
      const going = live;
      live = null;
      try { going?.close(); } catch {}
    }
  };
}

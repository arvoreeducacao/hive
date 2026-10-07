import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  NO_LEAF,
  canWrite,
  endpointsOf,
  heldOf,
  leafBase,
  leafSession,
  mcpUrl,
  metadataUrl,
  refreshForm,
  stale
} from "./leaf-link.mjs";

export const hiveHome = (env = process.env) => env.HIVE_HOME || join(homedir(), ".hive");
export const heldFile = (env = process.env) => join(hiveHome(env), "leaf.json");

export const NOT_LINKED = "this hive has no leaf token yet — run `node app/leaf-login.mjs` once";

export function readHeld(env = process.env) {
  try { return JSON.parse(readFileSync(heldFile(env), "utf8")); } catch { return {}; }
}

export function keepHeld(next, env = process.env) {
  mkdirSync(hiveHome(env), { recursive: true });
  writeFileSync(heldFile(env), JSON.stringify(next, null, 2));
  chmodSync(heldFile(env), 0o600);
  return next;
}

export async function metadataOf(base, call = fetch) {
  let answer;
  try { answer = await call(metadataUrl(base)); } catch (err) {
    return { error: `could not reach ${base}: ${err.message}` };
  }
  if (!answer.ok) return { error: `${base} answered ${answer.status} for its oauth metadata` };
  let body = {};
  try { body = JSON.parse(await answer.text()); } catch { return { error: `${base} did not answer json` }; }
  const endpoints = endpointsOf(body);
  return endpoints.error ? endpoints : { endpoints };
}

export async function refreshed({ was, endpoints, base, call = fetch, now = Date.now() }) {
  if (!was.refresh || !was.clientId) return { error: NOT_LINKED };
  let answer;
  try {
    answer = await call(endpoints.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: refreshForm({ clientId: was.clientId, refresh: was.refresh, resource: mcpUrl(base) }).toString()
    });
  } catch (err) {
    return { error: `could not renew the leaf token: ${err.message}` };
  }
  let body = {};
  try { body = JSON.parse(await answer.text()); } catch {}
  if (!answer.ok) {
    const why = body.error_description || body.error || `http ${answer.status}`;
    return { error: `the leaf refused to renew the token (${why}) — run \`node app/leaf-login.mjs\` again` };
  }
  const next = heldOf(body, was, now);
  return next.error ? next : { held: next };
}

export async function leafReady({ env = process.env, call = fetch, now = Date.now(), write = false } = {}) {
  const base = leafBase(env);
  if (!base) return { error: NO_LEAF };
  const was = readHeld(env);
  if (!was.access && !was.refresh) return { error: NOT_LINKED };

  let held = was;
  if (stale(was, now)) {
    const asked = await metadataOf(base, call);
    if (asked.error) return asked;
    const again = await refreshed({ was, endpoints: asked.endpoints, base, call, now });
    if (again.error) return again;
    held = keepHeld({ ...was, ...again.held }, env);
  }

  if (write && !canWrite(held)) {
    return { error: "this leaf token may only read — run `node app/leaf-login.mjs` again to ask for write" };
  }

  return { base, held, session: leafSession({ base, token: held.access, fetch: call }) };
}

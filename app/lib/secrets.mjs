import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MINTED = {
  HIVE_MCP_GATEWAY_TOKEN: [".mcp-servers", ".token"]
};

export function mintedFile(key, hub) {
  const path = MINTED[key];
  return path ? join(hub, ...path) : "";
}

export function readMinted(file, read = readFileSync, there = existsSync) {
  if (!file || !there(file)) return "";
  try {
    return String(read(file, "utf8")).trim();
  } catch {
    return "";
  }
}

export function valueFor(key, { env = {}, hub = "", read, there } = {}) {
  const written = env[key];
  if (written) return { value: written, from: "env" };
  const file = mintedFile(key, hub);
  const minted = readMinted(file, read, there);
  return minted ? { value: minted, from: "minted" } : { value: "", from: "nowhere" };
}

export function secretsForSeats(wanted, options = {}) {
  const out = {};
  for (const key of wanted) {
    const found = valueFor(key, options);
    if (found.value) out[key] = found.value;
  }
  return out;
}

const VAULT_REF = /^op:\/\//;
const VAULT_WAIT_MS = 10 * 1000;

export const isVaultRef = (value) => VAULT_REF.test(String(value ?? "").trim());

export function vaultThroughGateway({ port, token, fetchImpl = fetch, waitMs = VAULT_WAIT_MS } = {}) {
  return async (ref) => {
    const res = await fetchImpl(`http://127.0.0.1:${port}/vault/read`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ refs: [ref] }),
      signal: AbortSignal.timeout(waitMs)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `o gateway respondeu ${res.status}`);
    const value = payload.values?.[ref];
    if (!value) throw new Error(`o gateway nao devolveu ${ref}`);
    return value;
  };
}

export async function withVaultValues(found, read) {
  const refs = [...new Set(Object.values(found).filter(isVaultRef).map((value) => String(value).trim()))];
  const settled = await Promise.allSettled(refs.map((ref) => read(ref)));
  const values = new Map();
  const problems = [];
  settled.forEach((one, at) => {
    if (one.status === "fulfilled") values.set(refs[at], one.value);
    else problems.push(String(one.reason?.message || one.reason));
  });
  const out = {};
  for (const [key, value] of Object.entries(found)) {
    if (!isVaultRef(value)) out[key] = value;
    else if (values.has(String(value).trim())) out[key] = values.get(String(value).trim());
  }
  return { values: out, problems };
}

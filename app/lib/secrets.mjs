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

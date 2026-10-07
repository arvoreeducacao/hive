import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function stampedField(file, field, read) {
  try {
    return String(JSON.parse(read(file, "utf8"))[field] || "");
  } catch {
    return "";
  }
}

export function shippedServerRoot(shipped) {
  return shipped ? join(shipped, "..", "server") : "";
}

export function peerModuleIn(root) {
  return root ? join(root, "peer", "peer-mcp.mjs") : "";
}

export function liveServerRoot({ shipped = "", home = "", read = readFileSync, exists = existsSync } = {}) {
  if (!shipped || !home) return "";
  const print = stampedField(join(shipped, "build.json"), "shell", read);
  const current = join(home, "js", "current.json");
  const tag = stampedField(current, "tag", read);
  if (!print || !tag || print !== stampedField(current, "print", read)) return "";
  const root = join(home, "js", tag.replace(/[^A-Za-z0-9_-]/g, "_") || "_", "server");
  return exists(peerModuleIn(root)) ? root : "";
}

export function peerEntry({ env = process.env, here = HERE, exists = existsSync } = {}) {
  const shipped = shippedServerRoot(env.HIVE_APP_SHIPPED || "");
  const beside = join(here, "..", "peer", "peer-mcp.mjs");
  if (!shipped) return beside;
  for (const name of ["peer-mcp-live.mjs", "peer-mcp.mjs"]) {
    const stable = join(shipped, "peer", name);
    if (exists(stable)) return stable;
  }
  return beside;
}

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { shippedServerRoot } from "./peer-module.mjs";

export const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

const resolveInside = (root) => createRequire(join(root, "package.json")).resolve(SDK_PACKAGE);

export function shippedSdkUrl({ env = process.env, resolve = resolveInside } = {}) {
  const root = shippedServerRoot(env.HIVE_APP_SHIPPED || "");
  if (!root) return "";
  try {
    return pathToFileURL(resolve(root)).href;
  } catch {
    return "";
  }
}

export async function importSdk({ env = process.env, load = (specifier) => import(specifier), resolve = resolveInside } = {}) {
  try {
    return await load(SDK_PACKAGE);
  } catch (sweptAway) {
    const shipped = shippedSdkUrl({ env, resolve });
    if (!shipped) throw sweptAway;
    return load(shipped);
  }
}

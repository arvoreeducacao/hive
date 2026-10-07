import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function newestIn(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const at = entry.isDirectory() ? newestIn(path) : statSync(path).mtimeMs;
    if (at > newest) newest = at;
  }
  return newest;
}

export function bundleIsStale(appDir) {
  const sources = join(appDir, "src");
  if (!existsSync(sources)) return false;
  const bundle = join(appDir, "assets/dist/hive.mjs");
  if (!existsSync(bundle)) return true;
  const recipe = join(appDir, "build.mjs");
  const newestSource = Math.max(newestIn(sources), existsSync(recipe) ? statSync(recipe).mtimeMs : 0);
  return newestSource > statSync(bundle).mtimeMs;
}

export async function rebuildWhenStale(appDir, { stale = bundleIsStale, build = () => import(pathToFileURL(join(appDir, "build.mjs")).href).then(({ buildAndShip }) => buildAndShip()), log = console.error } = {}) {
  if (!stale(appDir)) return false;
  try {
    await build();
    return true;
  } catch (failure) {
    log(`hive: the page code is older than the source and could not be rebuilt: ${failure?.message || failure}`);
    return false;
  }
}

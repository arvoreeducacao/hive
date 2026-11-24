import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ERASED_KEPT = 5000;
const ERASED_ID = /^[0-9a-zA-Z][0-9a-zA-Z_-]{7,63}$/;

export const erasedFile = (home) => join(home, "erased.json");

const held = new Map();

export function readErased(home) {
  const file = erasedFile(home);
  if (held.has(file)) return held.get(file);
  let ids = [];
  if (existsSync(file)) {
    try {
      const read = JSON.parse(readFileSync(file, "utf8"));
      ids = Array.isArray(read?.ids) ? read.ids.filter((id) => typeof id === "string" && ERASED_ID.test(id)) : [];
    } catch {}
  }
  const set = new Set(ids);
  held.set(file, set);
  return set;
}

export function rememberErased(home, ids) {
  const set = readErased(home);
  for (const id of ids) if (ERASED_ID.test(String(id || ""))) set.add(id);
  const kept = [...set].slice(-ERASED_KEPT);
  held.set(erasedFile(home), new Set(kept));
  try {
    mkdirSync(dirname(erasedFile(home)), { recursive: true });
    const step = `${erasedFile(home)}.${process.pid}.tmp`;
    writeFileSync(step, JSON.stringify({ ids: kept }, null, 2));
    renameSync(step, erasedFile(home));
  } catch {}
  return held.get(erasedFile(home));
}

export function forgetErasedCache() {
  held.clear();
}

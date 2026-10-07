import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportPair, importPair, isJwkPair } from "./crypto.mjs";

export function fileStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = (key) => join(dir, `${String(key).replace(/[^A-Za-z0-9_.-]/g, "_")}.json`);
  return {
    async get(key) {
      if (!existsSync(file(key))) return undefined;
      let held;
      try { held = JSON.parse(readFileSync(file(key), "utf8")); } catch { return undefined; }
      if (held === null) return undefined;
      if (key === "agreer" && isJwkPair(held)) return importPair(held, "agreer");
      return held;
    },
    async set(key, value) {
      let out = value;
      if (key === "agreer" && value && !isJwkPair(value)) out = await exportPair(value);
      writeFileSync(file(key), JSON.stringify(out));
      try { chmodSync(file(key), 0o600); } catch {}
    }
  };
}

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprintOf, newIdentity } from "../../server/identity.mjs";

export const IDENTITY_FILE = "identity.json";

export function loadIdentity(home, { name = "desktop" } = {}) {
  const file = join(home, IDENTITY_FILE);
  if (existsSync(file)) {
    try {
      const held = JSON.parse(readFileSync(file, "utf8"));
      if (held?.secret && held?.publicSsh) return { ...held, fingerprint: fingerprintOf(held.publicSsh) };
    } catch {}
  }
  const fresh = newIdentity(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(fresh, null, 2));
  try { chmodSync(file, 0o600); } catch {}
  return fresh;
}

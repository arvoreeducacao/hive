import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprintOf, newIdentity } from "../../server/identity.mjs";

export const IDENTITY_FILE = "identity.json";
export const IDENTITY_PUBLIC_FILE = "identity.pub";

function writePublicHalf(home, publicSsh) {
  const file = join(home, IDENTITY_PUBLIC_FILE);
  const line = `${publicSsh}\n`;
  try {
    if (existsSync(file) && readFileSync(file, "utf8") === line) return;
    writeFileSync(file, line);
    chmodSync(file, 0o644);
  } catch {}
}

export function loadIdentity(home, { name = "desktop" } = {}) {
  const file = join(home, IDENTITY_FILE);
  if (existsSync(file)) {
    try {
      const held = JSON.parse(readFileSync(file, "utf8"));
      if (held?.secret && held?.publicSsh) {
        writePublicHalf(home, held.publicSsh);
        return { ...held, fingerprint: fingerprintOf(held.publicSsh) };
      }
    } catch {}
  }
  const fresh = newIdentity(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(fresh, null, 2));
  try { chmodSync(file, 0o600); } catch {}
  writePublicHalf(home, fresh.publicSsh);
  return fresh;
}

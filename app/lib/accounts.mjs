import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HELD_BY_EVERY_ACCOUNT } from "../../server/engine/seat-command.mjs";

export const DEFAULT_ACCOUNT = "default";

export function accountsDir(home) {
  return join(home, ".hive", "accounts");
}

export function accountNames(home) {
  try {
    return readdirSync(accountsDir(home), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function shapeAccount(home, dir) {
  mkdirSync(dir, { recursive: true });
  for (const item of HELD_BY_EVERY_ACCOUNT) {
    const from = join(home, ".claude", item);
    const to = join(dir, item);
    if (!existsSync(from) || existsSync(to)) continue;
    try { symlinkSync(from, to); } catch {}
  }
  const own = join(dir, ".claude.json");
  if (existsSync(own)) return dir;
  let base = {};
  try { base = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")); } catch {}
  delete base.oauthAccount;
  delete base.userID;
  writeFileSync(own, JSON.stringify(base, null, 2));
  return dir;
}

export async function readAccounts(home, status) {
  const held = [{ name: DEFAULT_ACCOUNT, dir: "" }, ...accountNames(home).map((name) => ({ name, dir: join(accountsDir(home), name) }))];
  return Promise.all(held.map(async ({ name, dir }) => {
    let said = null;
    try { said = JSON.parse((await status(dir)) || ""); } catch { said = null; }
    if (!said || typeof said !== "object") return { name, email: "", tier: "", loggedIn: false, blind: true };
    return { name, email: said.email || "", tier: said.subscriptionType || "", loggedIn: !!said.loggedIn, blind: false };
  }));
}

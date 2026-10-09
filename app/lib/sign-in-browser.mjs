import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OPENER = `#!/bin/sh
[ -n "$HIVE_SIGNIN_URL_FILE" ] && printf '%s\\n' "$1" > "$HIVE_SIGNIN_URL_FILE"
exit 0
`;

export const signInDir = (home) => join(home, "sign-in");

export const signInUrlFile = (home, id) => join(signInDir(home), `${id}.url`);

export function signInBrowserEnv(home, id) {
  const dir = signInDir(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const opener = join(dir, "open-in-hive.sh");
  let current = "";
  try { current = readFileSync(opener, "utf8"); } catch {}
  if (current !== OPENER) writeFileSync(opener, OPENER, { mode: 0o700 });
  chmodSync(opener, 0o700);
  return { BROWSER: opener, HIVE_SIGNIN_URL_FILE: signInUrlFile(home, id) };
}

export function directSignInUrl(home, id) {
  let text = "";
  try { text = readFileSync(signInUrlFile(home, id), "utf8"); } catch { return ""; }
  const url = text.trim().split("\n").pop() || "";
  return /^https:\/\/\S+$/.test(url) ? url : "";
}

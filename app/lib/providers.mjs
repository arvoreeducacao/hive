import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { PROVIDERS, PROVIDER_IDS, oneLoginOnly, providerEnv, providerEnvDir, providerHome, providerOf, providerOwn } from "../../server/engine/providers.mjs";
import { accountDir, accountsHeld } from "../../server/engine/accounts.mjs";
import { shapeAccount } from "./accounts.mjs";

export { PROVIDERS, PROVIDER_IDS, providerOf };

export function providerHomeOf(home, provider, platform = process.platform) {
  const held = providerHome(provider, platform);
  return held ? join(home, held) : "";
}

/* an account is the CLI's home mirrored with links, except what is the login's
   own — those paths start as nothing and the CLI writes them at sign-in. A path
   with a slash in it makes its parent a real folder, mirrored the same way. */
export function mirrorHome(from, to, own = []) {
  mkdirSync(to, { recursive: true });
  let entries = [];
  try { entries = readdirSync(from, { withFileTypes: true }); } catch { return to; }
  for (const entry of entries) {
    const inner = own.filter((path) => path === entry.name || path.startsWith(`${entry.name}/`));
    if (inner.some((path) => path === entry.name)) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (inner.length) {
      mirrorHome(source, target, inner.map((path) => path.slice(entry.name.length + 1)));
      continue;
    }
    if (existsSync(target) || isLink(target)) continue;
    try { symlinkSync(source, target); } catch {}
  }
  return to;
}

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

export function shapeProviderAccount(home, provider, dir, platform = process.platform) {
  if (!dir) return "";
  if (provider === "claude") return shapeAccount(home, dir);
  const spec = providerOf(provider);
  if (!spec) throw new Error(`no agent goes by ${provider}`);
  const only = oneLoginOnly(provider, platform);
  if (only) throw new Error(only);
  mirrorHome(providerHomeOf(home, provider, platform), providerEnvDir(provider, dir), providerOwn(provider, platform));
  if (provider === "cursor") mirrorHome(join(home, ".cursor"), join(providerEnvDir(provider, dir), "cursor"), ["auth.json"]);
  return dir;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function jwtClaims(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function codexIdentity(auth) {
  if (!auth || typeof auth !== "object") return { loggedIn: false, email: "", tier: "" };
  const tokens = auth.tokens || {};
  if (tokens.id_token || tokens.access_token) {
    const claims = jwtClaims(tokens.id_token) || {};
    const openai = claims["https://api.openai.com/auth"] || {};
    return { loggedIn: true, email: String(claims.email || ""), tier: String(openai.chatgpt_plan_type || "chatgpt") };
  }
  if (auth.OPENAI_API_KEY) return { loggedIn: true, email: "", tier: "api key" };
  return { loggedIn: false, email: "", tier: "" };
}

export function kimiIdentity(credential, region = "") {
  if (!credential?.access_token) return { loggedIn: false, email: "", tier: "" };
  const expired = Number(credential.expires_at) && Number(credential.expires_at) * 1000 < Date.now() && !credential.refresh_token;
  return { loggedIn: !expired, email: "", tier: [region, credential.scope].filter(Boolean).join(" · ") };
}

export function opencodeIdentity(auth) {
  if (!auth || typeof auth !== "object") return { loggedIn: false, email: "", tier: "" };
  const held = Object.entries(auth).filter(([, one]) => one && typeof one === "object");
  if (!held.length) return { loggedIn: false, email: "", tier: "" };
  return { loggedIn: true, email: "", tier: held.map(([name, one]) => `${name} · ${one.type || "key"}`).join(", ") };
}

export function cursorIdentity(auth) {
  if (!auth || typeof auth !== "object") return { loggedIn: false, email: "", tier: "" };
  if (auth.accessToken || auth.refreshToken) {
    const claims = jwtClaims(auth.accessToken) || {};
    return { loggedIn: true, email: String(claims.email || auth.email || ""), tier: String(auth.membershipType || auth.plan || "") };
  }
  if (auth.apiKey) return { loggedIn: true, email: "", tier: "api key" };
  return { loggedIn: false, email: "", tier: "" };
}

export function kiroIdentity(said) {
  const text = String(said || "");
  if (!text.trim() || /not logged in/i.test(text)) return { loggedIn: false, email: "", tier: "" };
  const email = /Email:\s*(\S+)/i.exec(text)?.[1] || "";
  const how = /Logged in with ([^(\n]+)/i.exec(text)?.[1]?.trim() || "";
  return { loggedIn: true, email, tier: how };
}

/* what a login says about itself, read off its own files when the CLI keeps them
   readable, and asked to the CLI when it does not. `dir` is the account folder,
   "" for the login everybody starts with. */
export async function providerIdentity({ home, provider, dir, run, platform = process.platform }) {
  const spec = providerOf(provider);
  if (!spec) return { loggedIn: false, email: "", tier: "", blind: true };
  const root = dir ? providerEnvDir(provider, dir) : providerHomeOf(home, provider, platform);
  if (provider === "codex") return { ...codexIdentity(readJson(join(root, "auth.json"))), blind: false };
  if (provider === "kimi") {
    let region = "";
    try { region = readFileSync(join(root, "region"), "utf8").trim(); } catch {}
    return { ...kimiIdentity(readJson(join(root, "credentials", "kimi-code.json")), region), blind: false };
  }
  if (provider === "opencode") return { ...opencodeIdentity(readJson(join(root, "opencode", "auth.json"))), blind: false };
  if (provider === "cursor") return { ...cursorIdentity(readJson(join(root, ...providerOwn(provider, platform)[0].split("/")))), blind: false };
  if (provider === "kiro") {
    if (!existsSync(join(root, "kiro-cli", "data.sqlite3"))) return { loggedIn: false, email: "", tier: "", blind: false };
    if (!run) return { loggedIn: false, email: "", tier: "", blind: true };
    const said = await run(spec.binary, ["whoami"], providerEnv(provider, dir)).catch(() => "");
    return { ...kiroIdentity(said), blind: !said };
  }
  return { loggedIn: false, email: "", tier: "", blind: true };
}

export async function readProviderAccounts({ home, hiveHome, provider, run, ledger = {}, platform = process.platform }) {
  const names = await accountsHeld(hiveHome, provider);
  return Promise.all(names.map(async (name) => {
    const dir = accountDir(hiveHome, provider, name);
    const who = await providerIdentity({ home, provider, dir, run, platform });
    return { name, dir, ...who, spent: ledger[name] || null };
  }));
}

export function parseVersion(out) {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(String(out || ""));
  return m ? m[1] : "";
}

export function providerSettings(config, provider) {
  const spec = providerOf(provider);
  const held = config?.providers?.[provider] || {};
  return {
    enabled: held.enabled !== false,
    name: held.name || spec?.label || provider,
    color: held.color || spec?.color || "",
    binary: held.binary || "",
    args: Array.isArray(held.args) ? held.args : [],
    env: held.env && typeof held.env === "object" ? held.env : {},
  };
}

/* the one word the pickers ask: can a chat be opened on this agent right now.
   Off by hand, not installed, or nobody signed in — each is a different sentence. */
export function providerReadiness({ enabled, installed, accounts, label }) {
  if (!enabled) return { ready: false, why: `${label} is turned off in providers` };
  if (!installed) return { ready: false, why: `${label} is not installed on this machine` };
  if (!(accounts || []).some((one) => one.loggedIn)) return { ready: false, why: `nobody is signed in to ${label} — open providers to sign in` };
  return { ready: true, why: "" };
}

export function agentsToSignIn(providers) {
  return (providers || [])
    .filter((one) => one.installed && one.enabled)
    .map((one) => {
      const signed = (one.accounts || []).find((account) => account.loggedIn);
      return { id: one.id, name: one.name || one.label || one.id, ready: !!one.ready, who: signed?.email || "", why: one.why || "" };
    });
}

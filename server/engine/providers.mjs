import { basename, dirname, join } from "node:path";
import { CLAUDE } from "./accounts.mjs";

/* every agent the hive can seat, and how one login of it is kept apart from the
   next. `home` is where the CLI keeps itself under the person's home, and `homeOn`
   names it again for a platform that puts it elsewhere; `homeEnv` is the variable
   that points it somewhere else; `own` is what a login must not share with the
   others, named again in `ownOn` when it moves with the home — the rest of the
   home is mirrored into the account with links, so skills, sessions and settings
   stay one thing. */
export const PROVIDERS = {
  claude: {
    id: "claude",
    label: "Claude",
    binary: "claude",
    color: "#D97757",
    home: ".claude",
    homeEnv: "CLAUDE_CONFIG_DIR",
    own: [],
    login: ["claude", "auth", "login"],
    logout: ["claude", "auth", "logout"],
    spent: /you'?ve hit your (?:org'?s |individual )?(?:monthly |weekly |session )?(?:spend )?limit|usage limit reached|credit balance is too low/i,
    gone: /failed to authenticate|oauth session expired|please run \/login|invalid api key/i,
  },
  codex: {
    id: "codex",
    label: "Codex",
    binary: "codex",
    color: "#10A37F",
    home: ".codex",
    homeEnv: "CODEX_HOME",
    own: ["auth.json"],
    login: ["codex", "login"],
    logout: ["codex", "logout"],
    spent: /usage_limit|usage limit|rate.?limit|credits_depleted|insufficient_quota|exceeded your current quota|too many requests|\b429\b/i,
    gone: /not logged in|login required|unauthorized|\b401\b|invalid.*token|refresh token|token.*expired|reauthenticat/i,
  },
  kimi: {
    id: "kimi",
    label: "Kimi",
    binary: "kimi",
    color: "#2E6FEF",
    home: ".kimi-code",
    homeEnv: "KIMI_CODE_HOME",
    own: ["credentials", "oauth"],
    login: ["kimi", "login"],
    logout: [],
    spent: /exceeded your current (?:token )?quota|exceeded_current_quota|check your account balance|insufficient balance|recharge|in arrears|rate.?limit|too many requests|\b429\b/i,
    gone: /token_unauthorized|run \/login|re-login required|no token for|not logged in|unauthorized|\b401\b|token.*expired/i,
  },
  kiro: {
    id: "kiro",
    label: "Kiro",
    binary: "kiro-cli",
    color: "#8B5CF6",
    home: ".local/share",
    homeOn: { darwin: "Library/Application Support" },
    homeEnv: "XDG_DATA_HOME",
    envDir: "share",
    own: ["kiro-cli/data.sqlite3"],
    login: ["kiro-cli", "login", "--use-device-flow"],
    logout: ["kiro-cli", "logout"],
    spent: /throttl|too many requests|usage limit|monthly limit|quota|\b429\b/i,
    gone: /not logged in|no refresh token|unable to refresh token|no registered client|no secret found|unauthorized|\b401\b|expired.?token|please log in/i,
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    binary: "cursor-agent",
    color: "#14B8A6",
    home: ".config",
    homeOn: { darwin: ".cursor" },
    homeEnv: "XDG_CONFIG_HOME",
    envDir: "config",
    own: ["cursor/auth.json"],
    ownOn: { darwin: ["auth.json"] },
    login: ["cursor-agent", "login"],
    logout: ["cursor-agent", "logout"],
    spent: /usage limit|rate.?limit|too many requests|quota|out of (?:credits|requests)|spend limit|hard limit|\b429\b/i,
    gone: /authentication required|not logged in|agent login|login required|unauthorized|\b401\b|token.*expired|auth token expired/i,
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    binary: "opencode",
    color: "#E8A33D",
    home: ".local/share",
    homeEnv: "XDG_DATA_HOME",
    envDir: "share",
    own: ["opencode/auth.json"],
    login: ["opencode", "auth", "login"],
    logout: ["opencode", "auth", "logout"],
    spent: /rate.?limit|too many requests|quota|insufficient|credit|\b429\b/i,
    gone: /ProviderAuthError|unauthorized|\b401\b|invalid api key|not logged|authentication|no credentials?/i,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export const providerOf = (id) => PROVIDERS[id] || null;

export const isProvider = (id) => Object.hasOwn(PROVIDERS, String(id || ""));

/* the folder the CLI keeps itself in, under the person's home. kiro-cli follows
   the platform instead of one path everywhere: XDG on linux, Application Support
   on a mac, and reading the linux one there says signed out about a login that is
   right there. */
export function providerHome(provider, platform = process.platform) {
  const spec = providerOf(provider);
  if (!spec) return "";
  return spec.homeOn?.[platform] || spec.home;
}

/* what a login keeps to itself, under the home above. The file moves with the
   home when the CLI names it differently per platform. */
export function providerOwn(provider, platform = process.platform) {
  const spec = providerOf(provider);
  if (!spec) return [];
  return spec.ownOn?.[platform] || spec.own;
}

/* an agent only holds one login apart from another when its CLI reads the
   variable that moves its home. Both of these read theirs on linux alone: on a mac
   kiro-cli keeps to Application Support and puts the token in the login keychain,
   and cursor-agent reads its token from ~/.cursor under the person's own home — so
   a second login there would quietly answer as the first. */
const ONE_LOGIN_ONLY = {
  kiro: { darwin: "kiro-cli holds one login per mac: it reads XDG_DATA_HOME on linux alone, and keeps its token in the login keychain, so a second login here would answer as the first" },
  cursor: { darwin: "cursor-agent holds one login per mac: it reads XDG_CONFIG_HOME on linux alone, and keeps its token at ~/.cursor/auth.json under your own home, so a second login here would answer as the first" },
};

export function oneLoginOnly(provider, platform = process.platform) {
  return ONE_LOGIN_ONLY[provider]?.[platform] || "";
}

/* the folder a login's home variable points at: the account itself, or the
   share/ folder inside it for the CLIs that live under XDG_DATA_HOME. */
export function providerEnvDir(provider, dir) {
  const spec = providerOf(provider);
  if (!spec || !dir) return "";
  return spec.envDir ? join(dir, spec.envDir) : dir;
}

export const providerEnvName = (provider) => providerOf(provider)?.homeEnv || "";

export function providerEnv(provider, dir) {
  const spec = providerOf(provider);
  if (!spec || !dir) return {};
  return { [spec.homeEnv]: providerEnvDir(provider, dir) };
}

/* the account folder behind a running seat's environment, or "" for the login
   everybody starts with. XDG_DATA_HOME may point anywhere on a machine, so it only
   reads as an account when it is the share/ folder inside one. */
export function accountDirFromEnv(provider, env = process.env) {
  const spec = providerOf(provider);
  if (!spec) return "";
  const held = String(env?.[spec.homeEnv] || "").replace(/[\\/]+$/, "");
  if (!held) return "";
  if (!spec.envDir) return held;
  return insideAnAccount(held, spec.envDir) ? dirname(held) : "";
}

/* the share/ folder of a login sits at …/accounts/<name>/share; the machine's own
   ~/.local/share ends the same way and must never read as one. */
function insideAnAccount(held, envDir) {
  return basename(held) === envDir && basename(dirname(dirname(held))) === "accounts";
}

export const ACCOUNT_ENV_NAMES = [...new Set(Object.values(PROVIDERS).map((spec) => spec.homeEnv))];

export const ACCOUNT_IN_COMMAND = new RegExp(`(?:^|\\s)(${ACCOUNT_ENV_NAMES.join("|")})=(\\S+)`);

export function accountNameInCommand(command) {
  const m = ACCOUNT_IN_COMMAND.exec(String(command || ""));
  if (!m) return "";
  const dir = m[2].replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const spec = Object.values(PROVIDERS).find((one) => one.homeEnv === m[1] && one.envDir);
  const account = spec && insideAnAccount(dir, spec.envDir) ? dirname(dir) : dir;
  return basename(account);
}

/* what a refusal from this agent means for the login it ran on. The claude
   driver reads a richer result shape; this is for the drivers that only get a
   line of text back. */
export function providerRanDry(provider, text) {
  const spec = providerOf(provider);
  const says = String(text || "").trim();
  if (!spec || !says) return null;
  if (spec.gone.test(says)) return { why: "login", says, until: 0 };
  if (spec.spent.test(says)) return { why: "spent", says, until: 0 };
  return null;
}

export const CLAUDE_PROVIDER = CLAUDE;

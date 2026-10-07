import { compareVersions } from "../../server/engine/claude-binary.mjs";

export const AGENT_UPDATES = {
  claude: { npm: "@anthropic-ai/claude-code", native: ["update"], knowsItsInstall: true, nativeAt: ["/.local/bin/claude", "/.local/share/claude/"] },
  codex: { npm: "@openai/codex", native: ["update"], knowsItsInstall: true, nativeAt: ["/.codex/packages/standalone/"] },
  opencode: { npm: "opencode-ai", native: ["upgrade"], knowsItsInstall: true, nativeAt: ["/.opencode/bin/opencode"] },
  kiro: { npm: "", native: ["update", "--non-interactive"], nativeAt: ["/.local/bin/kiro-cli", "/.local/share/kiro-cli/"] },
  cursor: { npm: "", native: ["update"], nativeAt: ["/.local/share/cursor-agent/", "/.local/bin/cursor-agent"] },
  kimi: { npm: "", native: ["upgrade", "--yes"], nativeAt: ["/.kimi-code/bin/"] },
};

export const LATEST_FRESH = 3600000;
export const LATEST_RETRY = 600000;
export const LATEST_TIMEOUT = 4000;

const slashed = (path) => String(path || "").replace(/\\/g, "/").toLowerCase();

const matches = (path, place) => (place.endsWith("/") ? path.includes(place) : path.endsWith(place) || path.endsWith(`${place}.exe`));

export function bundledWithHive(path) {
  const seen = slashed(path);
  return seen.includes("/node_modules/@anthropic-ai/claude-agent-sdk") || seen.includes("/hive/claude/");
}

export function npmPrefixOf(real, pkg) {
  const seen = String(real || "").replace(/\\/g, "/");
  const at = seen.toLowerCase().lastIndexOf(`/lib/node_modules/${pkg.toLowerCase()}/`);
  if (at < 0 || seen.slice(0, at).includes("/node_modules/")) return "";
  return at === 0 ? "/" : seen.slice(0, at);
}

const HOMEBREW_KEG = /^(.*)\/(cellar|caskroom)\/([^/]+)\/[^/]+\//i;

export function homebrewOf(real) {
  const found = HOMEBREW_KEG.exec(String(real || "").replace(/\\/g, "/"));
  if (!found) return null;
  const name = found[3];
  if (["node", "mise", "nvm", "asdf"].includes(name.toLowerCase())) return null;
  return { kind: found[2].toLowerCase() === "cellar" ? "formula" : "cask", name, prefix: found[1] };
}

export function updatePlanOf({ id, path, real, binary }) {
  const spec = AGENT_UPDATES[id];
  if (!spec || !path) return { action: null, command: "", bundled: false, brew: null };
  const command = [binary || id, ...spec.native].join(" ");
  if (id === "claude" && bundledWithHive(real || path)) return { action: null, command: "", bundled: true, brew: null };
  const places = [slashed(path), slashed(real)];
  if (spec.nativeAt.some((place) => places.some((one) => one && matches(one, place)))) {
    return { action: { bin: path, args: spec.native }, command, bundled: false, brew: null };
  }
  const prefix = spec.npm ? npmPrefixOf(real, spec.npm) : "";
  if (prefix) {
    const args = ["install", "-g", "--prefix", prefix, `--allow-scripts=${spec.npm}`, `${spec.npm}@latest`];
    return { action: { bin: "npm", args }, command: `npm ${args.join(" ")}`, bundled: false, brew: null };
  }
  const brew = homebrewOf(real);
  if (brew) {
    const args = brew.kind === "cask" ? ["upgrade", "--cask", brew.name] : ["upgrade", brew.name];
    return { action: { bin: "brew", args }, command: `brew ${args.join(" ")}`, bundled: false, brew };
  }
  if (spec.knowsItsInstall) return { action: { bin: path, args: spec.native }, command, bundled: false, brew: null };
  return { action: null, command, bundled: false, brew: null };
}

export function homebrewLatestOf(infoJson, brew) {
  try {
    const said = JSON.parse(String(infoJson || ""));
    const raw = brew.kind === "cask" ? said?.casks?.[0]?.version?.split(",")[0] : said?.formulae?.[0]?.versions?.stable;
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

export function behindOf(current, latest) {
  return !!current && !!latest && compareVersions(current, latest) < 0;
}

export function createLatestVersions({ fetchImpl = globalThis.fetch, now = () => Date.now(), runBrew = async () => "" } = {}) {
  const kept = new Map();

  async function ask(pkg) {
    const guard = new AbortController();
    const timer = setTimeout(() => guard.abort(), LATEST_TIMEOUT);
    try {
      const r = await fetchImpl(`https://registry.npmjs.org/${pkg.replace("/", "%2F")}/latest`, { headers: { accept: "application/json" }, signal: guard.signal });
      if (!r.ok) return "";
      const said = await r.json();
      return typeof said?.version === "string" ? said.version.trim() : "";
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async function askBrew(brew) {
    const args = brew.kind === "cask" ? ["info", "--json=v2", "--cask", brew.name] : ["info", "--json=v2", brew.name];
    return homebrewLatestOf(await runBrew(args).catch(() => ""), brew);
  }

  return async function latestOf(id, plan = null) {
    const brew = plan?.brew || null;
    const pkg = AGENT_UPDATES[id]?.npm;
    if (!brew && !pkg) return "";
    const key = brew ? `brew:${brew.kind}:${brew.name}` : pkg;
    const held = kept.get(key);
    if (held && held.until > now()) return held.version;
    const pending = held?.pending || (brew ? askBrew(brew) : ask(pkg));
    kept.set(key, { ...(held || {}), pending });
    const version = await pending;
    kept.set(key, { version, until: now() + (version ? LATEST_FRESH : LATEST_RETRY) });
    return version;
  };
}

export function tailOfUpdate(text, lines = 6) {
  const plain = String(text || "")
    .replace(/\u001b\[\d*D\u001b\[J/g, "\n")
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\r/g, "\n");
  const kept = plain.split("\n").map((one) => one.trim()).filter((one) => one && !/^[│◒◐◓◑]/.test(one));
  return kept.slice(-lines).join("\n");
}

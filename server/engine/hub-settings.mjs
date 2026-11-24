import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export const HUB_SETTINGS_FILE = "hub-settings.json";

const real = (path) => {
  try { return realpathSync(path); } catch { return path; }
};

const quoted = (word) => `'${String(word).replace(/'/g, "'\\''")}'`;

export function insideTheHub(cwd, hub) {
  if (!cwd || !hub) return false;
  const away = relative(real(hub), real(cwd));
  return !!away && !away.startsWith("..") && !isAbsolute(away);
}

export function hubSettingsOf(raw, hub) {
  const settings = JSON.parse(JSON.stringify(raw && typeof raw === "object" ? raw : {}));
  const lead = `CLAUDE_PROJECT_DIR=${quoted(hub)}; export CLAUDE_PROJECT_DIR; `;
  for (const groups of Object.values(settings.hooks || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (hook?.type === "command" && typeof hook.command === "string") hook.command = lead + hook.command;
      }
    }
  }
  return settings;
}

export function hubSettingsFor(cwd, hub) {
  if (!insideTheHub(cwd, hub)) return null;
  try {
    return hubSettingsOf(JSON.parse(readFileSync(join(hub, ".claude", "settings.json"), "utf8")), hub);
  } catch {
    return null;
  }
}

export function withHubSettings(options, hub) {
  const fromHub = hubSettingsFor(options?.cwd, hub);
  if (!fromHub) return options;
  const settings = typeof options.settings === "object" && options.settings ? options.settings : {};
  return {
    ...options,
    settings: { ...fromHub, ...settings },
    additionalDirectories: [...new Set([...(options.additionalDirectories || []), hub])]
  };
}

export function hubSettingsFile(cwd, hub, stateDir) {
  const settings = hubSettingsFor(cwd, hub);
  if (!settings || !stateDir) return "";
  const file = join(stateDir, HUB_SETTINGS_FILE);
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  let held = "";
  try { held = readFileSync(file, "utf8"); } catch {}
  if (held !== text) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(file, text);
  }
  return file;
}

export function hubClaudeArgs(cwd, hub, stateDir) {
  const file = hubSettingsFile(cwd, hub, stateDir);
  return file ? ["--settings", file, "--add-dir", hub] : [];
}

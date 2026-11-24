export const EFFORT_STYLES = ["word", "bars"];
export const EFFORT_STYLE_DEFAULT = "word";

export const CONFIRM_DEFAULTS = { unpin: false, archive: false, closeChat: true, closeTerminal: true };
export const CONFIRM_ACTIONS = Object.keys(CONFIRM_DEFAULTS);

export const BACKGROUND_MODES = ["economy", "balanced", "performance"];
export const BACKGROUND_DEFAULT = "balanced";

export const PROVIDER_CHECKS = ["auto", "30s", "1m", "5m", "15m", "off"];
export const PROVIDER_CHECK_DEFAULT = "auto";

export const TEXT_WRITERS = ["", "claude", "codex", "gemini", "kiro", "kimi", "cursor", "antigravity"];
export const TEXT_WRITER_DEFAULT = "";

export const PACED_BEATS = ["changes", "prs", "update", "agent-updates", "worktrees"];

const PACE = { economy: 3, balanced: 1, performance: 0.5 };
const PACE_FLOOR_MS = 4000;
const PROVIDER_AUTO_MS = { economy: 120000, balanced: 30000, performance: 15000 };
const PROVIDER_CHECK_MS = { "30s": 30000, "1m": 60000, "5m": 300000, "15m": 900000, off: 0 };

export function confirmFor(confirm, action) {
  const said = confirm && typeof confirm === "object" ? confirm[action] : undefined;
  return typeof said === "boolean" ? said : CONFIRM_DEFAULTS[action] ?? true;
}

export function pacedMs(mode, name, ms, { onBattery = false } = {}) {
  if (!PACED_BEATS.includes(name)) return ms;
  if (mode === "economy" && onBattery) return 0;
  const factor = PACE[mode] ?? 1;
  return factor === 1 ? ms : Math.max(PACE_FLOOR_MS, Math.round(ms * factor));
}

export function providerBeatMs(check, mode) {
  if (check in PROVIDER_CHECK_MS) return PROVIDER_CHECK_MS[check];
  return PROVIDER_AUTO_MS[mode] ?? PROVIDER_AUTO_MS.balanced;
}

export function effortBars(levels, level) {
  const list = Array.isArray(levels) ? levels.map((one) => (typeof one === "string" ? one : one?.value)).filter(Boolean) : [];
  const at = list.indexOf(level);
  return { total: list.length, lit: at < 0 ? 0 : at + 1 };
}

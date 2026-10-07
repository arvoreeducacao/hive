export const STATES = ["ok", "warn", "fail", "skip"];

const WEIGHT = { ok: 0, skip: 0, warn: 1, fail: 2 };
const BADGE = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" };
const COLOR = { ok: "\u001b[32m", warn: "\u001b[33m", fail: "\u001b[31m", skip: "\u001b[90m" };
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";
const PLACEHOLDER = /<[^>\s]+>/;
const NEEDS_A_HUMAN = [/^\s*sudo\b/, /\s-it\s/, /pod-login\.sh/, /pod-door\.sh/, /--grace-period=0/, /pod-power\.sh (force-remove|shell)\b/];

export function worstState(items) {
  if (!Array.isArray(items) || items.length === 0) return "fail";
  return items.reduce((worst, item) => (WEIGHT[item?.state] > WEIGHT[worst] ? item.state : worst), "ok");
}

export function exitCode(report) {
  return worstState(report?.items) === "fail" ? 1 : 0;
}

export function actionable(item) {
  return item?.state === "warn" || item?.state === "fail";
}

export function countByState(items) {
  const total = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const item of items || []) if (item?.state in total) total[item.state] += 1;
  return total;
}

export function fixable(item) {
  const command = item?.fix?.command || "";
  if (!command) return false;
  if (PLACEHOLDER.test(command)) return false;
  return !NEEDS_A_HUMAN.some((pattern) => pattern.test(command));
}

export function actionOf(item) {
  if (!item?.fix) return null;
  if (!fixable(item)) return "copy";
  if (item.fix.kind === "investigate") return "investigate";
  return "fix";
}

export function bySeverity(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  return list.sort((a, b) => (WEIGHT[b?.state] || 0) - (WEIGHT[a?.state] || 0));
}

export function fixOutcome(id, report) {
  const after = (report?.items || []).find((item) => item?.id === id);
  if (!after) return { ok: false, note: `${id} is no longer in the report, so the fix cannot be confirmed` };
  if (after.state === "ok") return { ok: true, note: `done: ${id}` };
  return { ok: false, note: `${id} is still ${after.state} after the fix: ${after.detail}` };
}

export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") throw new Error("doctor item is not an object");
  const id = String(raw.id || "");
  if (!id) throw new Error("doctor item without an id");
  if (!STATES.includes(raw.state)) throw new Error(`item ${id} has an invalid state: ${raw.state}`);
  let fix = null;
  if (raw.fix) {
    const label = String(raw.fix.label || "");
    const command = String(raw.fix.command || "");
    if (!label || !command) throw new Error(`item ${id} has an incomplete fix`);
    fix = { label, command };
    if (raw.fix.kind) fix.kind = String(raw.fix.kind);
    if (raw.fix.podScript) fix.podScript = String(raw.fix.podScript);
    if (raw.fix.shell) fix.shell = String(raw.fix.shell);
    if (raw.fix.heals === true) fix.heals = true;
  }
  const normalized = {
    id,
    title: String(raw.title || id),
    state: raw.state,
    detail: String(raw.detail || ""),
    fix
  };
  if (raw.group) normalized.group = String(raw.group);
  return normalized;
}

export function readReport(text) {
  const raw = String(text || "");
  const opens = raw.indexOf("{");
  const closes = raw.lastIndexOf("}");
  if (opens < 0 || closes < opens) throw new Error("the doctor returned no json");
  let data;
  try { data = JSON.parse(raw.slice(opens, closes + 1)); }
  catch { throw new Error("the doctor returned broken json"); }
  if (!data || !Array.isArray(data.items)) throw new Error("doctor json without the items list");
  return {
    dev: String(data.dev || ""),
    pod: String(data.pod || ""),
    generatedAt: String(data.generatedAt || ""),
    ranWith: String(data.ranWith || ""),
    items: data.items.map(normalizeItem)
  };
}

export function shortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatHuman(report, options = {}) {
  const color = !!options.color;
  const paint = (code, text) => (color ? `${code}${text}${RESET}` : text);
  const items = report?.items || [];
  const width = items.reduce((m, i) => Math.max(m, i.title.length), 0);
  const lines = [
    `hive doctor · ${report?.dev || "no dev"} · ${report?.pod || "no pod"} · ${shortTime(report?.generatedAt)}`,
    ""
  ];
  const printed = new Set();
  for (const item of items) {
    const detail = item.state === "skip" ? paint(DIM, item.detail) : item.detail;
    lines.push(`  ${paint(COLOR[item.state], BADGE[item.state])}  ${item.title.padEnd(width)}  ${detail}`);
    if (!item.fix) continue;
    const recipe = `${item.fix.label}: ${item.fix.command}`;
    if (printed.has(recipe)) continue;
    printed.add(recipe);
    lines.push(`        ${paint(DIM, recipe)}`);
  }
  const total = countByState(items);
  lines.push("");
  const skipped = total.skip ? ` · ${total.skip} skipped` : "";
  lines.push(`${items.length} checks · ${total.ok} ok · ${total.warn} warn · ${total.fail} fail${skipped}`);
  if (total.fail || total.warn) lines.push("run it again with --fix to apply the fixes that need no keyboard");
  return lines.join("\n");
}

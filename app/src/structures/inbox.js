import { IS_MAC, st } from "../app/core.js";
import { keepDraftingAfterSend, openDraft } from "../app/draft-seat.js";
import { markSeatRead, pool } from "../app/leader-key.js";
import { rename, retitle } from "../app/chat-name.js";
import { archiveSeatNow, reviveArchived } from "../app/mirror.js";
import { openPal } from "../app/palette.js";
import { placeWindowButtons } from "../app/preferences.js";
import { openPrs } from "../app/thread.js";
import { run as runCommand } from "../app/themes.js";
import { openUsage } from "../app/usage.js";
import { changes, openDiff, pullChanges } from "../app/seat-changes.js";
import { secretAskOf } from "../app/secret-asks.js";
import { paintStamp } from "../app/structured-seats.js";
import { openSeatMenu } from "../app/seat-menu.js";
import { goToTeam } from "../app/team.js";

const MARKS_KEY = "hive.inbox.marks";
const PANEL_KEY = "hive.inbox.details";
const SHELVES_KEY = "hive.inbox.shelves";
const WIDTH_KEY = "hive.inbox.width";
const WIDTH_MIN = 240;
const WIDTH_MAX = 480;
const LAST_CAP = 240;
const JUMP_SLOTS = 9;
const JUMP_HINT_DELAY = 200;
const HOUR = 3600000;
const DIFF_FRESH = 60000;
const TURNS_FRESH = 15000;

const LUCIDE = {
  pen: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  working: '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
  input: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  approval: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-2.82 3-2.82 3"/><path d="M12 17h.01"/>',
  failed: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  done: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  pr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  prArrow: '<circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="m15 9-3-3 3-3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  diff: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M9 10h6"/><path d="M12 13V7"/><path d="M9 17h6"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  local: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  terminal: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  rename: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  unread: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  sidebar: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  sidebarClose: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  bars: '<path d="M5 21v-6"/><path d="M12 21V3"/><path d="M19 21V9"/>',
  worktree: '<path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/><circle cx="13" cy="12" r="2"/><path d="M18 19c-2.8 0-5-2.2-5-5v8"/><circle cx="20" cy="19" r="2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>'
};

const FAV_HUES = [212, 262, 152, 28, 338, 190, 48, 286, 0, 120];

const hueOf = (text) => FAV_HUES[[...String(text)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % FAV_HUES.length];

const icon = (name, cls = "") => `<svg class="tx-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name] || ""}</svg>`;

const GROUPS = { needs: ["needs"], back: ["answered", "done"], busy: ["working", "stalled", "spawning"] };

const groupOf = (state) => Object.keys(GROUPS).find((id) => GROUPS[id].includes(state)) || "rest";

const WAITING = new Set(["needs", "back"]);

const STATUS = {
  secret: { label: "Secret", icon: "key", tone: "input" },
  limited: { label: "Limited", icon: "failed", tone: "warning" },
  working: { label: "Working", icon: "working", tone: "info" },
  waiting: { label: "Waiting", icon: "", tone: "muted" },
  approval: { label: "Approval", icon: "approval", tone: "warning" },
  input: { label: "Input", icon: "input", tone: "input" },
  failed: { label: "Failed", icon: "failed", tone: "error" },
  woke: { label: "Woke", icon: "alarm", tone: "warning" },
  done: { label: "Finished", icon: "done", tone: "success" }
};

function plain(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const SEED_LENGTH = 50;

const seedOf = (text) => {
  const said = plain(text);
  return said.length <= SEED_LENGTH ? said : `${said.slice(0, SEED_LENGTH)}...`;
};

const paragraphs = (md) => String(md || "").split(/\n\s*\n/).map(plain).filter(Boolean);

const clip = (text) => (text.length > LAST_CAP ? `${text.slice(0, LAST_CAP - 1).trimEnd()}…` : text);

function lastWords(seat) {
  const asked = (seat.asks || []).flatMap((one) => one.questions || []).map((q) => plain(q.question || q.text)).find(Boolean) || "";
  const said = paragraphs(seat.finish?.text);
  const group = groupOf(seat.state);
  const order = group === "needs"
    ? [asked, said.at(-1), plain(seat.now), plain(seat.summary)]
    : group === "busy"
      ? [plain(seat.now), plain(seat.summary), said[0], plain(seat.description)]
      : [said[0], plain(seat.now), plain(seat.summary), plain(seat.description)];
  return clip(order.find(Boolean) || "");
}

const stampOf = (seat) => {
  const stamps = [seat.finish?.at, seat.liveSince].map((at) => Date.parse(at || "")).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : 0;
};

function shortAgo(at, now, phrase) {
  if (!at) return "";
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return phrase("now");
  if (min < 60) return phrase("{n}m", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return phrase("{n}h", { n: h });
  return phrase("{n}d", { n: Math.floor(h / 24) });
}

function workingFor(ms) {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function statusOf(seat, mark = {}, asking = false, limited = false) {
  if (asking) return "secret";
  const group = groupOf(seat.state);
  if (limited && group !== "busy") return "limited";
  if (group === "needs") return (seat.asks || []).length ? "input" : "approval";
  if (group === "busy") return seat.state === "stalled" ? "waiting" : "working";
  if (seat.finish?.bad || seat.state === "failed") return "failed";
  if (mark.wokeAt && !mark.snoozeUntil) return "woke";
  if (group === "back" || mark.unread) return "done";
  return null;
}

function landed(prs) {
  return prs.length > 0 && prs.every((p) => p.state === "merged");
}

function sectionOf(mark = {}, now = Date.now(), settles = false) {
  if (mark.snoozeUntil && mark.snoozeUntil > now) return "snoozed";
  if (mark.settledAt || (settles && !mark.stayActive)) return "settled";
  if (mark.pinnedAt) return "pinned";
  return "active";
}

function settleMarks(marks, seats, now = Date.now()) {
  let changed = false;
  const known = new Set(seats.map((seat) => seat.key));
  for (const [key, mark] of Object.entries(marks)) {
    if (!known.has(key)) continue;
    const seat = seats.find((one) => one.key === key);
    if (mark.snoozeUntil && mark.snoozeUntil <= now) {
      delete mark.snoozeUntil;
      mark.wokeAt = now;
      changed = true;
    }
    if (mark.settledAt && WAITING.has(groupOf(seat.state)) && stampOf(seat) > mark.settledAt) {
      delete mark.settledAt;
      changed = true;
    }
    if (!Object.keys(mark).length) {
      delete marks[key];
      changed = true;
    }
  }
  return changed;
}

function snoozePresets(now = new Date()) {
  const at = (days, hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const monday = (8 - now.getDay()) % 7 || 7;
  return [
    { id: "1h", name: "In 1 hour", until: now.getTime() + HOUR },
    { id: "3h", name: "In 3 hours", until: now.getTime() + 3 * HOUR },
    { id: "tomorrow", name: "Tomorrow at 9", until: at(1, 9) },
    { id: "monday", name: "Monday at 9", until: at(monday, 9) }
  ];
}

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const treeOf = (seat) => (Array.isArray(seat.trees) ? seat.trees.find((one) => one?.repo) : null) || null;

function prsOf(name, prs) {
  return (prs || []).filter((p) => p.session === name).map((p) => ({
    url: p.url || "",
    tag: `${String(p.repo || "").split("/").pop()}#${p.number}`,
    title: p.title || "",
    ci: p.ci || "",
    failing: p.ci === "failed",
    conflict: p.mergeable === "conflicting",
    state: p.state || "open"
  }));
}

const mine = {
  marks: {}, details: true, shelves: { snoozed: false, settled: false, team: false, archived: false },
  query: "", teamPick: "", shown: [], reading: null, next: null, nodes: null,
  painted: new Map(), lastSel: "", menu: null, ticker: 0, jump: false, renaming: "",
  turns: new Map(), patch: null, scope: "", collapsed: false, injected: [], tone: "", toneOf: ""
};

const SCOPE_KEY = "hive.inbox.scope";
const COLLAPSED_KEY = "hive.inbox.collapsed";

const MONO_COLORS = [
  ["70.7% .022 261.325", "44.6% .03 256.802"], ["70.4% .191 22.216", "57.7% .245 27.325"], ["75% .183 55.934", "64.6% .222 41.116"],
  ["82.8% .189 84.429", "66.6% .179 58.318"], ["85.2% .199 91.936", "68.1% .162 75.834"], ["84.1% .238 128.85", "64.8% .2 131.684"],
  ["79.2% .209 151.711", "62.7% .194 149.214"], ["76.5% .177 163.223", "59.6% .145 163.225"], ["77.7% .152 181.912", "60% .118 184.704"],
  ["78.9% .154 211.53", "60.9% .126 221.723"], ["74.6% .16 232.661", "58.8% .158 241.966"], ["70.7% .165 254.624", "54.6% .245 262.881"],
  ["67.3% .182 276.935", "51.1% .262 276.966"], ["70.2% .183 293.541", "54.1% .281 293.009"], ["71.4% .203 305.504", "55.8% .288 302.321"],
  ["74% .238 322.16", "59.1% .293 322.896"], ["71.8% .202 349.761", "59.2% .249 .584"], ["71.2% .194 13.428", "58.6% .253 17.585"]
];

function initialsOf(repo) {
  const words = String(repo).normalize("NFKC").trim().match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return "PR";
  const glyphs = [...words[0]];
  const second = glyphs.slice(1).find((g) => /\p{N}/u.test(g)) ?? (words.length > 1 ? [...words.at(-1)][0] : glyphs.at(-1)) ?? glyphs[0];
  return [...`${glyphs[0]}${second}`.toUpperCase()].slice(0, 2).join("");
}

function monoColorOf(repo) {
  let at = 0;
  for (const glyph of String(repo).normalize("NFKC").trim().toLocaleLowerCase("en-US") || "project") at = (at * 31 + glyph.codePointAt(0)) % MONO_COLORS.length;
  return MONO_COLORS[at];
}

function monogramHtml(repo, esc, cls = "") {
  const text = initialsOf(repo);
  const [dark, light] = monoColorOf(repo);
  return `<span class="tx-fav tx-mono${cls}" style="--mono:oklch(${dark});--mono-light:oklch(${light})"><svg viewBox="0 0 16 16" aria-hidden="true"><text x="8" y="10.8" text-anchor="middle" fill="currentColor" font-size="8.25" font-weight="700" textLength="${text.length === 1 ? 6 : 12}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text></svg></span>`;
}

function favHtml(row, ctx, cls = "") {
  const { esc } = ctx;
  if (row.repo) return monogramHtml(row.repo, esc, cls);
  return `<span class="tx-fav tx-fav-icon${cls}">${icon(row.where === "cloud" ? "cloud" : "laptop")}</span>`;
}

function providerHtml(row, ctx) {
  if (row.kind === "terminal") return `<span class="tx-prov-i">${icon("terminal")}</span>`;
  const agent = ["codex", "kimi", "kiro", "cursor", "opencode"].includes(row.agent) ? row.agent : "claude";
  const account = row.account || "";
  const letters = (account === "default" ? agent : account).slice(0, 2).toUpperCase();
  const badge = account ? `<span class="tx-acct" style="--fav-h:${hueOf(account)}">${ctx.esc(letters)}</span>` : "";
  return `<span class="tx-prov-i ${agent}${badge ? " has-acct" : ""}" title="${ctx.esc(account)}">${ctx.svgIcon(`i-${agent}`)}${badge}</span>`;
}

async function pullTurns(ctx, name) {
  const had = mine.turns.get(name);
  if (had?.asking || (had && Date.now() - had.at < TURNS_FRESH)) return;
  mine.turns.set(name, { ...(had || {}), asking: true });
  let said = null;
  try { said = await (await fetch(`/api/checkpoints?name=${encodeURIComponent(name)}`)).json(); } catch {}
  mine.turns.set(name, { at: Date.now(), list: Array.isArray(said?.turns) ? said.turns : [], asking: false });
  ctx.render();
}

function turnsHtml(r, ctx) {
  const { esc, phrase } = ctx;
  const list = (mine.turns.get(r.name)?.list || []).slice().reverse();
  if (!list.length) return "";
  const rows = list.slice(0, 12).map((one, at) => {
    const when = shortAgo(one.at, Date.now(), phrase);
    const stat = one.baseline ? `<span class="tx-dl">${esc(phrase("start"))}</span>` : `<span class="tx-diff"><span class="add">+${one.added}</span> <span class="del">−${one.removed}</span></span>`;
    const look = one.baseline ? "" : `<button type="button" class="tx-tbtn" data-act="turn-diff" data-n="${one.ordinal}" title="${esc(phrase("See what this turn changed"))}">${icon("diff")}</button>`;
    const back = at === 0 ? "" : `<button type="button" class="tx-tbtn" data-act="turn-back" data-n="${one.ordinal}" title="${esc(phrase("Put the files back as they were here"))}">${icon("undo")}</button>`;
    return `<div class="tx-drow tx-turn"><span class="tx-tn">#${one.ordinal}</span>${stat}<span class="tx-dv">${esc(when)}</span>${look}${back}</div>`;
  }).join("");
  return `<div class="tx-dsec"><div class="tx-dhead">${esc(phrase("Turns"))}</div>${rows}</div>`;
}

function patchHtml(ctx) {
  const { esc, phrase } = ctx;
  const p = mine.patch;
  if (!p) return "";
  const lines = String(p.text || "").split("\n").slice(0, 4000).map((line) => {
    const cls = line.startsWith("+++") || line.startsWith("---") ? "h" : line.startsWith("+") ? "a" : line.startsWith("-") ? "d" : line.startsWith("@@") ? "c" : line.startsWith("diff ") ? "f" : "";
    return `<span class="${cls}">${esc(line) || " "}</span>`;
  }).join("");
  return `<div class="tx-patch"><div class="tx-patch-head"><span>${esc(phrase("Turn #{n}", { n: p.ordinal }))}</span><button type="button" class="tx-hbtn" data-act="patch-close">${icon("x")}</button></div><pre>${p.error ? esc(p.error) : lines}${p.cut ? `<span class="c">${esc(phrase("… cut at 2 MB"))}</span>` : ""}</pre></div>`;
}

function diffOf(name) {
  const data = changes.get(name)?.data;
  if (data?.state !== "ok") return null;
  const added = Number(data.added) || 0;
  const removed = Number(data.removed) || 0;
  return added || removed ? { added, removed } : null;
}

function refreshDiffs(rows, selected, now = Date.now()) {
  for (const row of rows) {
    if (!row.session || !row.branch || (row.where === "cloud" && row.key !== selected)) continue;
    const had = changes.get(row.name);
    if (had?.asking || (had?.at && now - had.at < DIFF_FRESH)) continue;
    pullChanges(row.name);
  }
}

function rowOf(seat, { now, prs, phrase }) {
  const mark = mine.marks[seat.key] || {};
  const tree = treeOf(seat);
  const status = statusOf(seat, mark, !!secretAskOf(seat.name), !!pool.get(seat.name)?.limitedUntil);
  const pulls = prsOf(seat.name, prs);
  const settles = landed(pulls) && !WAITING.has(groupOf(seat.state)) && groupOf(seat.state) !== "busy";
  return {
    key: seat.key,
    name: seat.name,
    title: (seat.naming && seedOf(seat.description || seat.mission)) || seat.title || seat.name || seat.key,
    retitling: !!seat.retitling,
    state: seat.state,
    group: groupOf(seat.state),
    status,
    section: sectionOf(mark, now, settles),
    autoSettled: settles && !mark.settledAt && !mark.stayActive,
    mark,
    last: lastWords(seat),
    stamp: seat.kind === "draft" || seat.kind === "job" ? now : stampOf(seat),
    when: seat.kind === "draft" ? "" : shortAgo(stampOf(seat), now, phrase),
    since: Date.parse(seat.liveSince || "") || 0,
    repo: tree?.repo || String(seat.cwd || "").split("/").filter(Boolean).pop() || "",
    branch: tree?.branch || "",
    path: tree?.path || "",
    prs: pulls,
    diff: diffOf(seat.name),
    block: seat.block,
    model: seat.model || "",
    agent: seat.agent || "",
    account: seat.account || "",
    where: seat.where || "",
    kind: seat.kind || "",
    draft: seat.kind === "draft",
    description: plain(seat.description),
    summary: plain(seat.summary),
    session: seat.kind !== "draft" && !!seat.name
  };
}

function matches(row, query) {
  if (!query) return true;
  const hay = `${row.title} ${row.repo} ${row.branch} ${row.last} ${row.name}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

function teamRowsOf(team, me, now, phrase) {
  return (team?.devs || []).filter((d) => d.dev !== me).flatMap((d) => (d.seats || []).map((s) => ({
    key: `team:${d.key}:${s.name}`,
    machine: d.key,
    dev: d.dev,
    title: s.title || s.name,
    state: s.state,
    group: groupOf(s.state),
    status: statusOf(s),
    last: clip(plain(s.now) || plain(s.summary) || plain(s.description)),
    when: shortAgo(Date.parse(s.liveSince || "") || 0, now, phrase),
    model: s.model || "",
    where: s.where || "",
    up: d.up !== false
  })));
}

function nextUp(rows, key) {
  const at = rows.findIndex((one) => one.key === key);
  const after = [...rows.slice(at + 1), ...rows.slice(0, Math.max(0, at))];
  return after.find((one) => WAITING.has(one.group) && one.key !== key) || null;
}

function step(rows, key, d) {
  if (!rows.length) return null;
  const at = rows.findIndex((one) => one.key === key);
  if (at < 0) return rows[d > 0 ? 0 : rows.length - 1];
  return rows[Math.max(0, Math.min(rows.length - 1, at + d))];
}

function viewModel(ctx) {
  const { phrase } = ctx;
  const now = Date.now();
  const focused = ctx.focused();
  const seats = ctx.seats();
  if (settleMarks(mine.marks, seats, now)) writeJson(MARKS_KEY, mine.marks);
  const all = seats.map((seat) => rowOf(seat, { now, prs: st.prs, phrase }));
  const repos = [...new Set(all.map((row) => row.repo).filter(Boolean))].sort();
  if (mine.scope && !repos.includes(mine.scope)) mine.scope = "";
  const rows = all.filter((row) => matches(row, mine.query) && (!mine.scope || row.repo === mine.scope));
  const recent = (a, b) => b.stamp - a.stamp;
  const pinned = rows.filter((one) => one.section === "pinned").sort((a, b) => a.mark.pinnedAt - b.mark.pinnedAt);
  const active = rows.filter((one) => one.section === "active").sort(recent);
  const snoozed = rows.filter((one) => one.section === "snoozed").sort((a, b) => a.mark.snoozeUntil - b.mark.snoozeUntil);
  const settledAt = (row) => row.mark.settledAt || row.stamp;
  const settled = rows.filter((one) => one.section === "settled").sort((a, b) => settledAt(b) - settledAt(a));
  const team = teamRowsOf(st.team, st.team?.me, now, phrase).filter((row) => matches(row, mine.query));
  const archived = (st.data?.archived || [])
    .map((one) => ({ key: `archived:${one.where}:${one.name}`, name: one.name, where: one.where || "local", title: one.title || one.name, model: one.model || "", agent: one.agent || "", repo: String(one.cwd || "").split("/").pop() || "", at: Number(one.archivedAt) || 0, last: "", branch: "" }))
    .filter((row) => matches(row, mine.query))
    .sort((a, b) => b.at - a.at);
  const pick = mine.teamPick ? team.find((one) => one.key === mine.teamPick) || null : null;
  const reading = pick ? null : all.find((one) => one.key === focused) || null;
  const shown = [
    ...pinned, ...active,
    ...(mine.shelves.snoozed || mine.query ? snoozed : []),
    ...(mine.shelves.settled || mine.query ? settled : []),
    ...(mine.shelves.team || mine.query ? team : [])
  ];
  return {
    all, repos, pinned, active, snoozed, settled, team, archived, pick, reading, shown,
    selected: pick ? pick.key : reading?.key || "",
    asking: all.filter((one) => one.group === "needs").length,
    next: reading ? nextUp(shown, reading.key) : null,
    workspace: (st.spaces || []).find((w) => w.id === st.space)?.name || ""
  };
}

function statusHtml(row, ctx) {
  const { esc, phrase } = ctx;
  if (row.section === "snoozed") {
    const until = new Date(row.mark.snoozeUntil);
    const label = until.toDateString() === new Date().toDateString()
      ? until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : until.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return `<span class="tx-st tone-warning">${icon("alarm")}<span>${esc(label)}</span></span>`;
  }
  const s = row.status && STATUS[row.status];
  if (!s) {
    const when = row.section === "settled" ? shortAgo(row.mark.settledAt || row.stamp, Date.now(), phrase) : row.when;
    return `<span class="tx-st tone-time">${esc(when)}</span>`;
  }
  const dur = row.status === "working" && row.since ? `<span class="tx-dur" data-t0="${row.since}">${esc(workingFor(Date.now() - row.since))}</span>` : "";
  return `<span class="tx-st tone-${s.tone}">${s.icon ? icon(s.icon) : ""}<span role="status">${esc(phrase(s.label))}</span>${dur}</span>`;
}

function rowActionsHtml(row, ctx) {
  const { esc, phrase } = ctx;
  if (row.section === "settled") return `<button type="button" class="tx-ract" data-act="unsettle" data-of="${esc(row.key)}" title="${esc(phrase("Move back to active"))}">${icon("undo")}</button>`;
  if (row.section === "snoozed") return `<button type="button" class="tx-ract" data-act="unsnooze" data-of="${esc(row.key)}" title="${esc(phrase("Unsnooze"))}">${icon("alarm")}</button>`;
  return `<button type="button" class="tx-ract" data-act="snooze" data-of="${esc(row.key)}" title="${esc(phrase("Snooze"))}">${icon("alarm")}</button><button type="button" class="tx-ract tx-settle" data-act="settle" data-of="${esc(row.key)}" title="${esc(phrase("Settle thread"))}">${icon("check")}<span>${esc(phrase("Settle"))}</span></button>`;
}

function titleTone(row, selected) {
  if (selected) return "t-strong";
  if (row.status && row.status !== "working" && row.status !== "waiting") return "t-strong";
  return "t-recede";
}

function rowHtml(row, v, ctx, slot) {
  const { esc, phrase } = ctx;
  const selected = row.key === v.selected;
  const recede = titleTone(row, selected) === "t-recede";
  const cls = ["tx-row"];
  if (selected) cls.push("sel");
  if (recede) cls.push("recede");
  if (recede && row.status === "working") cls.push("busy-fade");
  const project = row.repo || (row.where === "cloud" ? phrase("cloud") : phrase("this machine"));
  const pin = row.section === "pinned" ? `<span class="tx-mark" title="${esc(phrase("Pinned"))}">${icon("pin")}</span>` : "";
  const draft = row.draft ? `<span class="tx-mark">${icon("pen")}</span>` : "";
  const prs = row.prs.slice(0, 2).map((p) => `<span class="tx-prb pr-${esc(p.state)}${p.failing ? " fail" : ""}" title="${esc(p.title || p.tag)}">${icon("pr")}#${esc(p.tag.split("#").pop())}</span>`).join("");
  const diff = row.diff ? `<span class="tx-diff"><span class="add">+${row.diff.added}</span> <span class="del">−${row.diff.removed}</span></span>` : "";
  const branch = row.branch
    ? `${row.path ? `<span class="tx-wt" title="${esc(phrase("Worktree"))}">${icon("worktree")}</span>` : ""}<span class="tx-br">${esc(row.branch)}</span>`
    : `<span class="tx-br"></span>`;
  const jump = slot ? `<span class="tx-jumphint">${IS_MAC ? "⌘" : "Ctrl+"}${slot}</span>` : "";
  return `<li class="tx-li"><div class="${cls.join(" ")}" role="button" tabindex="0" data-key="${esc(row.key)}" title="${esc(row.last || row.title)}">
    <div class="tx-l1">${draft}${favHtml(row, ctx)}<span class="tx-proj">${esc(project)}</span>${pin}<span class="tx-slot">${statusHtml(row, ctx)}<span class="tx-racts">${rowActionsHtml(row, ctx)}</span></span></div>
    <div class="tx-l2"><span class="tx-title ${titleTone(row, selected)}">${esc(row.title)}</span></div>
    <div class="tx-l3">${branch}${prs}${diff}<span class="tx-prov">${row.where === "cloud" ? `<span class="tx-prov-i">${icon("cloud")}</span>` : ""}${providerHtml(row, ctx)}</span></div>
    ${jump}</div></li>`;
}

function compactRowHtml({ key, attrs = "", fav, title, slot, acts = "", selected = false }) {
  return `<li class="tx-li compact"><div class="tx-row compact${selected ? " sel" : ""}" role="button" tabindex="0" ${key ? `data-key="${key}"` : ""} ${attrs}>${fav}<span class="tx-title t-recede">${title}</span><span class="tx-slot">${slot}<span class="tx-racts">${acts}</span></span></div></li>`;
}

function settledRowHtml(row, v, ctx) {
  const { esc, phrase } = ctx;
  return compactRowHtml({
    key: esc(row.key), selected: row.key === v.selected, fav: favHtml(row, ctx, " dim"), title: esc(row.title),
    slot: `<span class="tx-st tone-time">${esc(shortAgo(row.mark.settledAt || row.stamp, Date.now(), phrase))}</span>`,
    acts: rowActionsHtml(row, ctx)
  });
}

function teamRowHtml(row, v, ctx) {
  const { esc, phrase } = ctx;
  const s = row.status && STATUS[row.status];
  const badge = s ? `<span class="tx-st tone-${s.tone}">${s.icon ? icon(s.icon) : ""}<span>${esc(phrase(s.label))}</span></span>` : `<span class="tx-st tone-time">${esc(row.when)}</span>`;
  return compactRowHtml({
    key: esc(row.key), selected: row.key === v.selected, attrs: `title="${esc(row.last || row.title)}"`,
    fav: `<span class="tx-fav tx-av" style="--fav-h:${hueOf(row.dev)}">${esc(row.dev.slice(0, 1).toUpperCase())}</span>`,
    title: `${esc(row.title)} <span class="tx-who">· ${esc(row.dev)}</span>`, slot: badge
  });
}

function archivedRowHtml(row, ctx) {
  const { esc, phrase } = ctx;
  return compactRowHtml({
    attrs: `data-arch="${esc(row.name)}" title="${esc(row.title)}"`, fav: favHtml(row, ctx, " dim"), title: esc(row.title),
    slot: `<span class="tx-st tone-time">${esc(shortAgo(row.at, Date.now(), phrase))}</span>`,
    acts: `<button type="button" class="tx-ract tx-settle" data-act="revive" data-name="${esc(row.name)}" data-where="${esc(row.where)}">${icon("undo")}<span>${esc(phrase("Reopen"))}</span></button>`
  });
}

function shelfHtml(id, label, rows, v, ctx, draw, tone = "muted") {
  if (!rows.length) return "";
  const { esc } = ctx;
  const open = mine.shelves[id] || !!mine.query;
  return `<button type="button" class="tx-shelf tone-${tone}${open ? " open" : ""}" data-shelf="${esc(id)}" aria-expanded="${open}"><span>${esc(label)} (${rows.length})</span><span class="tx-rule"></span>${icon("down")}</button>${open ? `<ul class="tx-ul">${rows.map((row) => draw(row)).join("")}</ul>` : ""}`;
}

function listHtml(v, ctx) {
  const { esc, phrase } = ctx;
  let slot = 0;
  const draw = (row) => rowHtml(row, v, ctx, slot < JUMP_SLOTS ? ++slot : 0);
  const pinned = v.pinned.length ? `<ul class="tx-ul">${v.pinned.map(draw).join("")}</ul><div class="tx-divider"></div>` : "";
  const active = v.active.length
    ? `<ul class="tx-ul">${v.active.map(draw).join("")}</ul>`
    : `<p class="tx-empty">${esc(phrase(mine.query ? "No threads found" : "No active chats"))}</p>`;
  const snoozed = shelfHtml("snoozed", phrase("Snoozed"), v.snoozed, v, ctx, draw, "info");
  const settled = shelfHtml("settled", phrase("Settled"), v.settled, v, ctx, (row) => settledRowHtml(row, v, ctx));
  const team = shelfHtml("team", phrase("From the team"), v.team, v, ctx, (row) => teamRowHtml(row, v, ctx));
  const archived = shelfHtml("archived", phrase("Archived"), v.archived, v, ctx, (row) => archivedRowHtml(row, ctx));
  return `${pinned}${active}<div class="tx-shelves">${snoozed}${settled}${team}${archived}</div>`;
}

function headHtml(v, ctx) {
  const { esc, phrase } = ctx;
  const r = v.reading;
  const reopen = mine.collapsed ? `<button type="button" class="tx-ghost" data-act="collapse" title="${esc(phrase("Show the sidebar"))}">${icon("sidebar")}</button>` : "";
  if (!r) return `<div class="tx-crumbs">${reopen}<span class="tx-crumb-title">${esc(v.pick ? v.pick.title : phrase("New chat"))}</span></div>`;
  const tile = ctx.tile(r.key);
  const web = tile?.querySelector(".t-web");
  const groups = [];
  groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="new" title="${esc(phrase("New chat"))}">${icon("plus")}</button><button type="button" class="tx-ob tx-ob-chev" data-act="menu" data-of="${esc(r.key)}" title="${esc(phrase("More"))}">${icon("down")}</button></span>`);
  if (web && !web.hidden) groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="web" title="${esc(phrase("Browser"))}">${icon("globe")}</button></span>`);
  if (r.prs.length) {
    const p = r.prs[0];
    groups.push(`<span class="tx-group"><a class="tx-ob tx-ob-pr pr-${esc(p.state)}${p.failing ? " fail" : ""}" href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(p.title || p.tag)}">${icon("pr")}<span>#${esc(p.tag.split("#").pop())}</span></a>${r.prs.length > 1 ? `<button type="button" class="tx-ob tx-ob-chev" data-act="details" title="${esc(phrase("Thread details"))}">${icon("down")}</button>` : ""}</span>`);
  }
  if (r.session) groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="diff" title="${esc(phrase("Changes"))}">${icon("diff")}<span>Diff</span></button></span>`);
  const project = r.repo
    ? `<span class="tx-crumb-proj">${favHtml(r, ctx)}<span>${esc(r.repo)}</span></span><span class="tx-crumb-sep">/</span>`
    : "";
  return `<div class="tx-crumbs">${reopen}${project}<button type="button" class="tx-crumb-title" data-act="menu" data-of="${esc(r.key)}"><span>${esc(r.title)}</span>${icon("down", "tx-crumb-chev")}</button></div>
    <div class="tx-hacts">${groups.join("")}<button type="button" class="tx-ghost${mine.details ? " on" : ""}" data-act="details" title="${esc(phrase("Thread details"))}">${icon("panel")}</button></div>`;
}

function detailRow(iconName, label, value, ctx, extra = "") {
  const { esc } = ctx;
  if (!value) return "";
  return `<div class="tx-drow${extra}">${icon(iconName)}<span class="tx-dl">${esc(label)}</span><span class="tx-dv" title="${esc(value)}">${esc(value)}</span></div>`;
}

function detailsHtml(v, ctx) {
  const { esc, phrase } = ctx;
  const r = v.reading;
  if (!r || !mine.details) return "";
  const s = r.status && STATUS[r.status];
  const status = s ? phrase(s.label) : ctx.label(r.state);
  const ci = (p) => (p.ci === "failed" ? phrase("checks failing") : p.ci === "passed" || p.ci === "success" ? phrase("checks passing") : p.ci === "pending" || p.ci === "running" ? phrase("checks running") : "");
  const said = (p) => (p.state === "merged" ? phrase("merged") : p.state === "draft" ? phrase("draft") : p.conflict ? phrase("conflict") : ci(p));
  const prs = r.prs.map((p) => `<a class="tx-drow tx-dlink pr-${esc(p.state)}${p.failing || p.conflict ? " fail" : ""}" href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(p.title)}">${icon("pr")}<span class="tx-dv">${esc(p.tag)}</span><span class="tx-dl">${esc(said(p))}</span></a>`).join("");
  const blockAt = typeof r.block === "number" ? phrase("block {n}", { n: r.block + 1 }) : "";
  const about = r.summary || r.description;
  return `<div class="tx-dsec"><div class="tx-dhead">${esc(phrase("Chat"))}</div>
    ${detailRow(s?.icon || "clock", phrase("Status"), status, ctx, s ? ` tone-${s.tone}` : "")}
    ${detailRow("bot", phrase("Model"), r.model, ctx)}
    ${detailRow(r.where === "cloud" ? "cloud" : "local", phrase("Runs on"), r.where ? phrase(r.where) : "", ctx)}
    ${detailRow("users", phrase("Account"), r.account, ctx)}
    ${detailRow("clock", phrase("Last activity"), r.when, ctx)}</div>
    <div class="tx-dsec"><div class="tx-dhead">${esc(phrase("Workspace"))}</div>
    ${detailRow("folder", phrase("Project"), r.repo, ctx)}
    ${detailRow("terminal", phrase("Worktree"), r.path ? r.path.replace(/^\/Users\/[^/]+/, "~") : "", ctx)}
    ${detailRow("panel", phrase("Block"), blockAt, ctx)}</div>
    ${r.branch || prs ? `<div class="tx-dsec"><div class="tx-dhead">${esc(phrase("Version control"))}</div>${detailRow("branch", phrase("Branch"), r.branch, ctx)}${prs}</div>` : ""}
    ${turnsHtml(r, ctx)}
    ${about ? `<div class="tx-dsec"><div class="tx-dhead">${esc(phrase("About"))}</div><p class="tx-dabout">${esc(clip(about))}</p></div>` : ""}`;
}

function blankHtml(v, ctx) {
  const { esc, phrase } = ctx;
  const p = v.pick;
  if (p) {
    return `<div class="tx-pick"><h1>${esc(p.title)}</h1><div class="tx-pick-sub">${icon("users")}<span>${esc(p.dev)}</span>${p.model ? `<span>· ${esc(p.model)}</span>` : ""}</div>
      <p>${esc(p.last || phrase("no card written yet"))}</p>
      <button type="button" class="tx-primary" data-act="team" data-machine="${esc(p.machine)}">${esc(phrase("Open {dev}'s hive", { dev: p.dev }))}</button></div>`;
  }
  if (v.reading) return "";
  return `<div class="tx-blank"><h1>${esc(phrase("What should we build?"))}</h1><p>${esc(phrase("Pick a chat on the left, or start a new one."))}</p>
    <button type="button" class="tx-primary" data-act="new">${icon("pen")}<span>${esc(phrase("New chat"))}</span></button></div>`;
}

function paintInto(el, html) {
  if (mine.painted.get(el) === html) return false;
  el.innerHTML = html;
  mine.painted.set(el, html);
  return true;
}

function paintTools(ctx) {
  const { esc, phrase, keyHint } = ctx;
  const n = mine.nodes;
  const headline = JSON.stringify(phrase("What should we build?"));
  if (n.frame.style.getPropertyValue("--tx-draft-title") !== headline) n.frame.style.setProperty("--tx-draft-title", headline);
  const placeholder = phrase("Search");
  if (n.query.placeholder !== placeholder) n.query.placeholder = placeholder;
  n.newChat.title = `${phrase("New chat")}${keyHint("new") ? ` (${keyHint("new")})` : ""}`;
  n.scope.title = mine.scope || phrase("All projects");
  n.scope.classList.toggle("on", !!mine.scope);
  paintInto(n.scope, mine.scope ? monogramHtml(mine.scope, esc) : icon("folder"));
  paintInto(n.foot, `<button type="button" class="tx-foot-btn" data-act="settings" title="${esc(phrase("Settings"))}">${icon("settings")}</button><button type="button" class="tx-foot-btn" data-act="prs" title="${esc(phrase("Pull requests"))}">${icon("prArrow")}</button><button type="button" class="tx-foot-btn" data-act="usage" title="${esc(phrase("Usage"))}">${icon("bars")}</button>`);
}

function build(ctx) {
  const { esc, phrase } = ctx;
  ctx.root.innerHTML = `<div class="tx">
    <aside class="tx-side" aria-label="${esc(phrase("Chats"))}">
      <div class="tx-brand"><button type="button" class="tx-brand-btn" data-act="collapse" title="${esc(phrase("Hide the sidebar"))}">${icon("sidebarClose")}</button><span class="tx-word"><b>Hive</b><span class="tx-wsname"></span></span></div>
      <div class="tx-tools">
        <div class="tx-toolrow"><label class="tx-find">${icon("search")}<input type="search" class="tx-q" spellcheck="false" autocomplete="off"></label><button type="button" class="tx-iconbtn tx-scope" data-act="scope"></button><button type="button" class="tx-iconbtn" data-act="new">${icon("pen")}</button></div>
      </div>
      <div class="tx-scroll"></div>
      <div class="tx-sfoot"></div>
      <div class="tx-grip" role="separator" aria-orientation="vertical"></div>
    </aside>
    <section class="tx-main">
      <header class="tx-head"></header>
      <div class="tx-body">
        <div class="tx-page"><div class="tx-host"></div><div class="tx-blankhost"></div><div class="tx-patchhost"></div></div>
        <aside class="tx-details" aria-label="${esc(phrase("Thread details"))}"></aside>
      </div>
    </section>
  </div>`;
  const q = (sel) => ctx.root.querySelector(sel);
  mine.nodes = {
    wsname: q(".tx-wsname"), scroll: q(".tx-scroll"), foot: q(".tx-sfoot"), head: q(".tx-head"),
    host: q(".tx-host"), blank: q(".tx-blankhost"), patch: q(".tx-patchhost"), details: q(".tx-details"), query: q(".tx-q"),
    newChat: q(".tx-iconbtn[data-act=new]"), scope: q(".tx-scope"), frame: q(".tx")
  };
  mine.nodes.query.value = mine.query;
  mine.nodes.frame.classList.toggle("collapsed", mine.collapsed);
  const width = readJson(WIDTH_KEY, 0);
  if (width) sizeSidebar(width);
}

function sizeSidebar(width) {
  const px = Math.round(Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, width)));
  mine.nodes?.frame.style.setProperty("--tx-sidebar", `${px}px`);
  return px;
}

function dragSidebar(event) {
  const grip = event.target.closest(".tx-grip");
  if (!grip || event.button !== 0) return;
  event.preventDefault();
  const left = mine.nodes.frame.getBoundingClientRect().left;
  let width = 0;
  grip.classList.add("on");
  const moved = (move) => { width = sizeSidebar(move.clientX - left); };
  const done = () => {
    grip.classList.remove("on");
    window.removeEventListener("pointermove", moved);
    window.removeEventListener("pointerup", done);
    if (width) writeJson(WIDTH_KEY, width);
  };
  window.addEventListener("pointermove", moved);
  window.addEventListener("pointerup", done);
}

function composerOf(ctx, key) {
  return key ? ctx.tile(key)?.querySelector(".sv-composer textarea") || null : null;
}

function saveMarks() {
  writeJson(MARKS_KEY, mine.marks);
}

function markOf(key) {
  mine.marks[key] ||= {};
  return mine.marks[key];
}

function tidy(key) {
  if (mine.marks[key] && !Object.keys(mine.marks[key]).length) delete mine.marks[key];
}

function setMark(ctx, key, change) {
  if (!key || key.startsWith("team:")) return;
  change(markOf(key));
  tidy(key);
  saveMarks();
  ctx.render();
}

const settle = (ctx, key) => {
  if (key === mine.reading?.key) moveOff(ctx, key);
  setMark(ctx, key, (m) => { m.settledAt = Date.now(); delete m.pinnedAt; delete m.wokeAt; delete m.unread; delete m.snoozeUntil; delete m.stayActive; });
};
const unsettle = (ctx, key) => {
  const row = mine.shown.find((one) => one.key === key);
  setMark(ctx, key, (m) => { delete m.settledAt; if (row?.autoSettled) m.stayActive = true; });
};
const togglePin = (ctx, key) => setMark(ctx, key, (m) => { if (m.pinnedAt) delete m.pinnedAt; else { m.pinnedAt = Date.now(); delete m.settledAt; } });
const snooze = (ctx, key, until) => {
  if (key === mine.reading?.key) moveOff(ctx, key);
  setMark(ctx, key, (m) => { m.snoozeUntil = until; delete m.wokeAt; delete m.settledAt; });
};
const unsnooze = (ctx, key) => setMark(ctx, key, (m) => { delete m.snoozeUntil; });
const markUnread = (ctx, key) => setMark(ctx, key, (m) => { m.unread = true; });

function moveOff(ctx, key) {
  const at = mine.shown.findIndex((one) => one.key === key);
  const then = at < 0 ? null : mine.shown[at + 1] || mine.shown[at - 1];
  if (then && !then.key.startsWith("team:")) choose(ctx, then.key);
}

function choose(ctx, key) {
  if (!key) return;
  closeMenu();
  if (key.startsWith("team:")) {
    mine.teamPick = key;
    ctx.render();
    return;
  }
  mine.teamPick = "";
  const mark = mine.marks[key];
  if (mark && (mark.wokeAt || mark.unread)) {
    delete mark.wokeAt;
    delete mark.unread;
    tidy(key);
    saveMarks();
  }
  markSeatRead(key);
  if (ctx.focused() === key) ctx.render();
  else ctx.focusSeat(key);
}

function move(ctx, d) {
  const now = mine.reading?.key || mine.teamPick || ctx.focused();
  const to = step(mine.shown, now, d);
  if (to) choose(ctx, to.key);
}

function replyAndNext(ctx) {
  const key = mine.reading?.key;
  const box = composerOf(ctx, key);
  if (!box || !box.value.trim()) return false;
  const next = mine.next;
  const form = box.closest("form");
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event("submit", { cancelable: true }));
  if (next) {
    box.blur();
    choose(ctx, next.key);
  }
  return true;
}

const sessionOf = (name) => (st.data?.sessions || []).find((one) => one.name === name) || null;

function archive(ctx, key = mine.reading?.key) {
  const row = mine.shown.find((one) => one.key === key) || mine.reading;
  if (!row?.session) return;
  const s = sessionOf(row.name);
  if (!s) return;
  if (key === mine.reading?.key) moveOff(ctx, key);
  delete mine.marks[key];
  saveMarks();
  archiveSeatNow(s);
}

const nodes = () => mine.nodes;

function beginRename(ctx, key) {
  if (ctx.focused() !== key) choose(ctx, key);
  requestAnimationFrame(() => {
    const row = mine.reading;
    const slot = mine.nodes?.head.querySelector(".tx-crumb-title");
    if (!row || row.key !== key || !slot) return;
    const s = sessionOf(row.name);
    if (!s) return;
    mine.renaming = key;
    const input = document.createElement("input");
    input.className = "tx-rename";
    input.maxLength = 60;
    input.spellcheck = false;
    input.value = s.title || s.name;
    input.placeholder = ctx.phrase("empty gives the chat its seat name back");
    const stop = (commit) => {
      if (mine.renaming !== key) return;
      mine.renaming = "";
      const written = input.value.trim();
      mine.painted.delete(mine.nodes?.head);
      ctx.render();
      if (commit && written !== (s.title || "")) rename(s, written);
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); stop(true); }
      if (event.key === "Escape") { event.preventDefault(); stop(false); }
    });
    input.addEventListener("blur", () => stop(true));
    input.addEventListener("click", (event) => event.stopPropagation());
    slot.replaceWith(input);
    input.focus();
    input.select();
  });
}

function closeMenu() {
  mine.menu?.remove();
  mine.menu = null;
}

function openMenu(ctx, items, x, y) {
  closeMenu();
  const { esc } = ctx;
  const menu = document.createElement("div");
  menu.className = "tx-menu";
  menu.innerHTML = items.map((one) => (one === "-" ? '<div class="tx-msep"></div>' : `<button type="button" class="tx-mitem${one.danger ? " danger" : ""}" data-mi="${esc(one.id)}"${one.disabled ? " disabled" : ""}>${one.icon ? icon(one.icon) : '<span class="tx-i"></span>'}<span>${esc(one.name)}</span>${one.hint ? `<span class="tx-mhint">${esc(one.hint)}</span>` : ""}</button>`)).join("");
  ctx.root.append(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
  menu.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-mi]");
    if (!hit) return;
    event.stopPropagation();
    const item = items.find((one) => one !== "-" && one.id === hit.dataset.mi);
    closeMenu();
    item?.run();
  });
  mine.menu = menu;
}

function snoozeItems(ctx, key) {
  const { phrase } = ctx;
  return snoozePresets().map((one) => ({ id: `snooze:${one.id}`, icon: "alarm", name: phrase(one.name), run: () => snooze(ctx, key, one.until) }));
}

function rowMenu(ctx, key, x, y) {
  const { phrase } = ctx;
  const row = mine.shown.find((one) => one.key === key) || (mine.reading?.key === key ? mine.reading : null);
  if (!row || key.startsWith("team:")) return;
  const items = [
    { id: "pin", icon: "pin", name: phrase(row.section === "pinned" ? "Unpin" : "Pin"), hint: "p", run: () => togglePin(ctx, key) },
    row.section === "settled"
      ? { id: "unsettle", icon: "undo", name: phrase("Move back to active"), hint: "s", run: () => unsettle(ctx, key) }
      : { id: "settle", icon: "check", name: phrase("Settle"), hint: "s", run: () => settle(ctx, key) },
    row.section === "snoozed"
      ? { id: "unsnooze", icon: "alarm", name: phrase("Unsnooze"), run: () => unsnooze(ctx, key) }
      : null,
    ...(row.section === "snoozed" ? [] : snoozeItems(ctx, key)),
    "-",
    { id: "unread", icon: "unread", name: phrase("Mark as unread"), hint: "u", run: () => markUnread(ctx, key) },
    row.session ? { id: "rename", icon: "rename", name: phrase("Rename"), run: () => beginRename(ctx, key) } : null,
    row.session ? { id: "retitle", icon: "sparkles", name: phrase(row.retitling ? "Regenerating…" : "Regenerate title"), disabled: row.retitling, run: () => { const s = sessionOf(row.name); if (s) retitle(s); } } : null,
    row.session ? { id: "diff", icon: "diff", name: phrase("Changes"), run: () => openDiff(row.name) } : null,
    "-",
    row.session ? { id: "more", icon: "more", name: phrase("More actions…"), run: () => { const s = sessionOf(row.name); if (s) openSeatMenu(s, x, y); } } : null,
    row.session ? { id: "archive", icon: "archive", name: phrase("Archive"), hint: "e", danger: true, run: () => archive(ctx, key) } : null
  ].filter(Boolean);
  openMenu(ctx, items, x, y);
}

function clicked(event, ctx) {
  if (mine.menu && !mine.menu.contains(event.target)) closeMenu();
  const hit = event.target.closest("[data-shelf], [data-act], [data-key], [data-arch]");
  if (!hit || !ctx.root.contains(hit)) return;
  if (hit.dataset.shelf) {
    mine.shelves[hit.dataset.shelf] = !mine.shelves[hit.dataset.shelf];
    writeJson(SHELVES_KEY, mine.shelves);
    ctx.render();
    return;
  }
  const act = hit.dataset.act;
  if (act) {
    event.stopPropagation();
    const of = hit.dataset.of;
    const box = hit.getBoundingClientRect();
    if (act === "settle") return settle(ctx, of);
    if (act === "unsettle") return unsettle(ctx, of);
    if (act === "snooze") return openMenu(ctx, snoozeItems(ctx, of), box.left, box.bottom + 4);
    if (act === "menu") return rowMenu(ctx, of, box.left, box.bottom + 4);
    if (act === "new") return openDraft();
    if (act === "search") return openPal();
    if (act === "diff") return mine.reading && openDiff(mine.reading.name);
    if (act === "details") {
      mine.details = !mine.details;
      writeJson(PANEL_KEY, mine.details);
      return ctx.render();
    }
    if (act === "turn-diff") return showTurn(ctx, Number(hit.dataset.n));
    if (act === "turn-back") return goBack(ctx, Number(hit.dataset.n));
    if (act === "patch-close") { mine.patch = null; return ctx.render(); }
    if (act === "unsnooze") return unsnooze(ctx, of);
    if (act === "scope") return openMenu(ctx, scopeItems(ctx), box.left, box.bottom + 4);
    if (act === "collapse") { mine.collapsed = !mine.collapsed; writeJson(COLLAPSED_KEY, mine.collapsed); mine.nodes.frame.classList.toggle("collapsed", mine.collapsed); return ctx.render(); }
    if (act === "settings") return runCommand("help");
    if (act === "prs") return openPrs();
    if (act === "usage") return openUsage();
    if (act === "team") return goToTeam(hit.dataset.machine);
    if (act === "revive") return reviveArchived(hit.dataset.name, hit.dataset.where);
    if (act === "web") return ctx.tile(mine.reading?.key)?.querySelector(".t-web")?.click();
    return;
  }
  if (hit.dataset.arch) return;
  if (hit.dataset.key) choose(ctx, hit.dataset.key);
}

async function showTurn(ctx, ordinal) {
  const r = mine.reading;
  if (!r) return;
  mine.patch = { ordinal, text: "", error: "" };
  ctx.render();
  let said = null;
  try { said = await (await fetch(`/api/checkpoints/diff?name=${encodeURIComponent(r.name)}&ordinal=${ordinal}`)).json(); } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (mine.patch?.ordinal !== ordinal) return;
  mine.patch = { ordinal, text: said?.patch || "", error: said?.error || "", cut: !!said?.cut };
  ctx.render();
}

async function goBack(ctx, ordinal) {
  const r = mine.reading;
  if (!r) return;
  if (!window.confirm(ctx.phrase("Put the files of {name} back as they were at turn #{n}? What is there now is kept as a new turn, so you can come back.", { name: r.title, n: ordinal }))) return;
  let said = null;
  try {
    said = await (await fetch("/api/checkpoints/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: r.name, ordinal }) })).json();
  } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (said?.error) window.alert(said.error);
  mine.turns.delete(r.name);
  ctx.render();
}

function scopeItems(ctx) {
  const { phrase } = ctx;
  const repos = [...new Set((mine.allRepos || []))];
  const pick = (repo) => () => { mine.scope = repo; writeJson(SCOPE_KEY, repo); ctx.render(); };
  return [
    { id: "scope:", icon: mine.scope ? "" : "check", name: phrase("All projects"), run: pick("") },
    ...(repos.length ? ["-"] : []),
    ...repos.map((repo) => ({ id: `scope:${repo}`, icon: mine.scope === repo ? "check" : "folder", name: repo, run: pick(repo) }))
  ];
}

function reopenLast() {
  const last = [...(st.data?.archived || [])].sort((a, b) => (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0))[0];
  if (last) reviveArchived(last.name, last.where || "local");
  return !!last;
}

function contextMenu(event, ctx) {
  const hit = event.target.closest(".tx-row[data-key]");
  if (!hit || !ctx.root.contains(hit)) return;
  event.preventDefault();
  rowMenu(ctx, hit.dataset.key, event.clientX, event.clientY);
}

function tick() {
  const root = mine.nodes?.scroll;
  if (!root) return;
  const now = Date.now();
  for (const el of root.querySelectorAll(".tx-dur[data-t0]")) el.textContent = workingFor(now - Number(el.dataset.t0));
}

function holdJump(on) {
  clearTimeout(mine.jumpTimer);
  if (on) mine.jumpTimer = setTimeout(() => showJump(true), JUMP_HINT_DELAY);
  else showJump(false);
}

function showJump(on) {
  if (mine.jump === on) return;
  mine.jump = on;
  mine.nodes?.scroll?.classList.toggle("jumping", on);
}

function paintTone(ctx) {
  const raw = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  if (raw === mine.toneOf) return;
  mine.toneOf = raw;
  const probe = document.createElement("span");
  probe.style.color = raw || "#000";
  document.body.append(probe);
  const [r, g, b] = (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
  probe.remove();
  ctx.root.dataset.tone = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? "light" : "dark";
}

function placeLights() {
  if (!IS_MAC || !window.hiveWindow?.placeButtons || !mine.nodes) return;
  const brand = mine.nodes.frame.querySelector(".tx-brand")?.getBoundingClientRect();
  const bar = !mine.collapsed && brand?.height > 0 ? brand : mine.nodes.head.getBoundingClientRect();
  if (!(bar.height > 0)) return;
  const spot = { x: Math.round(Math.max(0, bar.left) + 16), y: Math.round(bar.top + (bar.height - 14) / 2) };
  const said = JSON.stringify(spot);
  if (said === mine.lightsAt) return;
  mine.lightsAt = said;
  window.hiveWindow.placeButtons(spot);
}

function unInject() {
  for (const el of mine.injected) el.remove();
  mine.injected = [];
  for (const box of document.querySelectorAll("textarea[data-tx-ph]")) {
    box.placeholder = box.dataset.txPh;
    delete box.dataset.txPh;
  }
}

function lastTurn(name) {
  const list = mine.turns.get(name)?.list || [];
  const last = list.at(-1);
  return last && !last.baseline && (last.added || last.removed) ? last : null;
}

function dressComposer(ctx, r) {
  if (!mine.nodes) return;
  const { esc, phrase } = ctx;
  const tile = r ? ctx.tile(r.key) : null;
  const form = tile?.querySelector("form.sv-composer") || null;
  for (const el of mine.injected) if (!form || el.parentElement !== form.parentElement) el.remove();
  mine.injected = mine.injected.filter((el) => el.isConnected);
  for (const box of document.querySelectorAll("textarea[data-tx-ph]")) {
    if (form && form.contains(box)) continue;
    box.placeholder = box.dataset.txPh;
    delete box.dataset.txPh;
  }
  if (!form) return;
  const box = form.querySelector("textarea");
  const wanted = phrase("Ask for changes, send follow-ups, or attach images");
  if (box && box.placeholder !== wanted) {
    if (box.dataset.txPh === undefined) box.dataset.txPh = box.placeholder;
    box.placeholder = wanted;
  }
  const place = (cls, where) => {
    let el = form.parentElement.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement("div");
      el.className = cls;
      if (where === "before") form.before(el);
      else form.after(el);
      mine.injected.push(el);
    }
    return el;
  };
  const turn = r.group === "busy" ? null : lastTurn(r.name);
  const files = turn ? place("tx-files", "before") : form.parentElement.querySelector(":scope > .tx-files");
  if (turn) {
    const html = `<span class="tx-files-n">${esc(phrase(turn.files === 1 ? "1 changed file" : "{n} changed files", { n: turn.files }))}</span><span class="tx-diff"><span class="add">+${turn.added}</span> <span class="del">−${turn.removed}</span></span><span class="tx-files-fill"></span><button type="button" class="tx-files-open" data-act="turn-diff" data-n="${turn.ordinal}">${icon("diff")}<span>${esc(phrase("Open diff"))}</span></button>`;
    if (files.dataset.h !== html) { files.innerHTML = html; files.dataset.h = html; }
  } else if (files) {
    files.remove();
  }
  const strip = place("tx-ctx", "after");
  const where = r.where === "cloud" ? `${icon("cloud")}<span>${esc(phrase("Cloud"))}</span>` : r.path ? `${icon("worktree")}<span>${esc(phrase("Worktree"))}</span>` : `${icon("laptop")}<span>${esc(phrase("Local"))}</span>`;
  const prs = r.prs.slice(0, 1).map((p) => `<a class="tx-ctx-pr pr-${esc(p.state)}" href="${esc(p.url)}" target="_blank" rel="noreferrer">${icon("pr")}<span>#${esc(p.tag.split("#").pop())}</span></a>`).join("");
  const branch = r.branch ? `<span class="tx-ctx-br" title="${esc(r.branch)}">${icon("branch")}<span>${esc(r.branch)}</span></span>` : "";
  const html = `<span class="tx-ctx-where">${where}</span><span class="tx-ctx-fill"></span>${prs}${branch}`;
  if (strip.dataset.h !== html) { strip.innerHTML = html; strip.dataset.h = html; }
  for (const said of tile.querySelectorAll(".sv-msg.stamped")) if (!said.querySelector(":scope > .sv-stamp")) paintStamp(said);
}

const inbox = {
  id: "inbox",
  ready: true,
  groupOf,
  lastWords,
  nextUp,
  statusOf,
  sectionOf,
  landed,
  settleMarks,
  snoozePresets,
  enter(ctx) {
    keepDraftingAfterSend(true);
    mine.marks = readJson(MARKS_KEY, {});
    mine.details = readJson(PANEL_KEY, false) === true;
    mine.shelves = { snoozed: false, settled: false, team: false, archived: false, ...readJson(SHELVES_KEY, {}) };
    mine.scope = String(readJson(SCOPE_KEY, "") || "");
    mine.collapsed = readJson(COLLAPSED_KEY, false) === true;
    mine.injected = [];
    mine.toneOf = "";
    mine.teamPick = "";
    mine.shown = [];
    mine.reading = null;
    mine.next = null;
    mine.lastSel = "";
    mine.painted = new Map();
    build(ctx);
    ctx.listen(ctx.root, "click", (event) => clicked(event, ctx));
    ctx.listen(ctx.root, "contextmenu", (event) => contextMenu(event, ctx));
    ctx.listen(ctx.root, "pointerdown", dragSidebar);
    ctx.listen(ctx.root, "dblclick", (event) => {
      const hit = event.target.closest(".tx-row[data-key], .tx-crumb-title");
      if (!hit || !ctx.root.contains(hit)) return;
      const key = hit.dataset.key || mine.reading?.key;
      if (key && !key.startsWith("team:")) beginRename(ctx, key);
    });
    ctx.listen(ctx.root, "input", (event) => {
      if (!event.target.classList.contains("tx-q")) return;
      mine.query = event.target.value;
      ctx.render();
    });
    ctx.listen(window, "keyup", (event) => { if (event.key === "Meta" || event.key === "Control") holdJump(false); });
    ctx.listen(window, "blur", () => holdJump(false));
    ctx.listen(document, "click", (event) => { if (mine.menu && !ctx.root.contains(event.target)) closeMenu(); });
    mine.ticker = setInterval(tick, 1000);
    mine.lightsAt = "";
    if (IS_MAC && window.hiveWindow?.placeButtons) ctx.root.classList.add("tx-mac");
  },
  leave(ctx) {
    keepDraftingAfterSend(false);
    clearInterval(mine.ticker);
    holdJump(false);
    closeMenu();
    unInject();
    ctx.root.classList.remove("tx-mac");
    delete ctx.root.dataset.tone;
    placeWindowButtons();
    mine.nodes = null;
    mine.painted = new Map();
    mine.shown = [];
    mine.reading = null;
    mine.next = null;
    ctx.root.replaceChildren();
  },
  paint(ctx) {
    if (!mine.nodes) build(ctx);
    const n = mine.nodes;
    const v = viewModel(ctx);
    const { esc, phrase } = ctx;
    ctx.root.classList.toggle("tx-off", ctx.onPlane());
    mine.shown = v.shown;
    mine.reading = v.reading;
    mine.next = v.next;
    mine.allRepos = v.repos;
    n.wsname.textContent = v.workspace;
    paintTone(ctx);
    paintTools(ctx);
    paintInto(n.scroll, listHtml(v, ctx));
    if (!mine.renaming) paintInto(n.head, headHtml(v, ctx));
    paintInto(n.blank, blankHtml(v, ctx));
    paintInto(n.details, detailsHtml(v, ctx));
    paintInto(n.patch, patchHtml(ctx));
    if (v.reading?.session && v.reading.where !== "cloud" && v.reading.path) pullTurns(ctx, v.reading.name);
    n.details.hidden = !v.reading || !mine.details;
    n.host.hidden = !v.reading;
    if (v.reading) ctx.place(v.reading.key, n.host);
    queueMicrotask(() => { refreshDiffs(v.shown, v.selected); dressComposer(ctx, v.reading); placeLights(); });
    if (v.selected !== mine.lastSel) {
      mine.lastSel = v.selected;
      n.scroll.querySelector(".tx-row.sel")?.scrollIntoView?.({ block: "nearest" });
    }
  },
  keydown(event, ctx) {
    if (!mine.nodes || ctx.onPlane()) return false;
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    if ((event.key === "Meta" && IS_MAC) || (event.key === "Control" && !IS_MAC)) { holdJump(true); return false; }
    if (mod && !/^[1-9]$/.test(event.key)) holdJump(false);
    if (event.key === "Escape" && mine.menu) { closeMenu(); return true; }
    if (mod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
      const row = mine.shown[Number(event.key) - 1];
      if (!row) return false;
      holdJump(false);
      choose(ctx, row.key);
      return true;
    }
    if (mod && event.shiftKey && !event.altKey && (event.key === "t" || event.key === "T")) return reopenLast();
    if (event.key === "Enter" && mod && !event.shiftKey && !event.altKey) {
      const box = composerOf(ctx, mine.reading?.key);
      return !!box && document.activeElement === box && replyAndNext(ctx);
    }
    if (event.target === nodes()?.query) {
      if (event.key === "Escape") { mine.query = ""; event.target.value = ""; event.target.blur(); ctx.render(); return true; }
      if (event.key === "ArrowDown" || event.key === "Enter") { event.target.blur(); move(ctx, event.key === "Enter" ? 0 : 1); return true; }
      return false;
    }
    if (ctx.inField() || event.metaKey || event.ctrlKey || event.altKey) return false;
    const at = document.activeElement;
    if (at && at !== document.body && !ctx.root.contains(at)) return false;
    const key = mine.reading?.key;
    if (event.key === "j" || event.key === "ArrowDown") { move(ctx, 1); return true; }
    if (event.key === "k" || event.key === "ArrowUp") { move(ctx, -1); return true; }
    if (event.key === "/") { nodes()?.query?.focus(); return true; }
    if (event.key === "Enter" && !event.shiftKey) {
      const box = composerOf(ctx, key);
      if (!box) return false;
      markSeatRead(key);
      box.focus();
      return true;
    }
    if (!key) return false;
    if (event.key === "e" && !event.shiftKey && mine.reading?.session) { archive(ctx); return true; }
    if (event.key === "s" && !event.shiftKey) { if (mine.reading.section === "settled") unsettle(ctx, key); else settle(ctx, key); return true; }
    if (event.key === "p" && !event.shiftKey) { togglePin(ctx, key); return true; }
    if (event.key === "u" && !event.shiftKey) { markUnread(ctx, key); return true; }
    return false;
  }
};

export { inbox };

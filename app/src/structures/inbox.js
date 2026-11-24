import { IS_MAC, st } from "../app/core.js";
import { askNewChat, openDraftOnBranchOf, scopeNewChatsBy } from "../app/draft-seat.js";
import { branchPlaceOf } from "../app/draft-place.js";
import { markSeatRead, pool } from "../app/leader-key.js";
import { rename, retitle, retitlingNow } from "../app/chat-name.js";
import { archiveSeatNow, reviveArchived } from "../app/mirror.js";
import { openPal } from "../app/palette.js";
import { placeWindowButtons } from "../app/preferences.js";
import { openPrs } from "../app/thread.js";
import { run as runCommand } from "../app/themes.js";
import { openUsage } from "../app/usage.js";
import { openDiff } from "../app/seat-changes.js";
import { secretAskOf } from "../app/secret-asks.js";
import { forgetStruct, paintStamp, structPool, svLine } from "../app/structured-seats.js";
import { getStructured, svReset } from "../app/chat-stretches.js";
import { svConvRestore, svConvShow, svConvTimeline } from "../app/conversation-model.js";
import { clockOf, fullTimeOf, liveFor } from "../app/timeline-rows.js";
import { spokenNow } from "/assets/i18n.mjs";
import { seatAgent, setPlanMode, svEvent } from "../app/chat-and-panes.js";
import { openSeatMenu } from "../app/seat-menu.js";
import { closeCustomSnooze, customSnoozeOpen, forgetSeatMark, markUnreadSeat, openCustomSnooze, seatMark, seatSection, seenSeat, setNeverSettles, settleSeats, snoozeChoicesNow, snoozeSeats, togglePinSeat, unsettleSeats, wakeSeats } from "../app/seat-marks.js";
import { askToErase, openThreadSettings } from "../app/seat-marks-menu.js";
import { isPicked, pickClick, selectionBarHtml } from "../app/seat-selection.js";
import { discardDraft, hasDraft } from "../app/draft-marks.js";
import { findInChats, hitSays, messageHit } from "../app/seat-find.js";
import { agentPillHtml } from "../app/agent-updates.js";
import { toClipboard } from "../app/terminal-history.js";
import { goToTeam } from "../app/team.js";
import { takeFiles, zoneOf } from "../app/drop-zone.js";
import { prOf as prOfUrl } from "../app/context-chips.js";
import { closePrSide, openPrSide, prSideAct, prSideDraft, prSideHtml, prSideKey, prSideTyped } from "./inbox-pr.js";
import { checkpointsOfTurns, pathIn, turnFilesHtml } from "./inbox-turn-files.js";
import { nightlySkyHtml } from "./inbox-nightly.js";
import { clockOptions } from "../app/clock-format.js";
import { canDragFilesOf } from "../app/file-drag.js";

const PANEL_KEY = "hive.inbox.details";
const SHELVES_KEY = "hive.inbox.shelves";
const FOLDERS_KEY = "hive.inbox.foldersShut";
const WIDTH_KEY = "hive.inbox.width";
const WIDTH_MIN = 240;
const WIDTH_MAX = 480;
const LAST_CAP = 240;
const JUMP_SLOTS = 9;
const JUMP_HINT_DELAY = 200;
const HOUR = 3600000;
const TURNS_FRESH = 15000;
const TURNS_SETTLE = 1500;

const LUCIDE = {
  pen: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pinOff: '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
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
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  filter: '<path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  prClosed: '<circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="m21 3-6 6"/><path d="m21 9-6-6"/><path d="M18 11.5V15"/><circle cx="18" cy="18" r="3"/>',
  prDraft: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 6V5"/><path d="M18 11v-1"/><line x1="6" x2="6" y1="9" y2="21"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  arrowUpLeft: '<path d="M7 17V7h10"/><path d="M17 17 7 7"/>',
  circleDashed: '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
  circleX: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  sort: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  commit: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  clip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  ruler: '<path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m18 16 2-2"/><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'
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
  const stamps = [seat.finish?.at, seat.turnSince, seat.liveSince].map((at) => Date.parse(at || "")).filter(Number.isFinite);
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

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const MIDDLE_TAIL = 10;
const MIDDLE_SEGMENT_TAIL = 16;
const MIDDLE_WORD_TAIL = 4;
const WORD_BREAK = /[-_./]/;

function splitMiddle(value) {
  const chars = Array.from(String(value));
  let keep = MIDDLE_TAIL;
  const slash = chars.lastIndexOf("/");
  if (slash > 0 && slash < chars.length - 1) {
    const segment = chars.length - slash - 1;
    keep = segment <= MIDDLE_SEGMENT_TAIL ? segment : MIDDLE_TAIL;
  }
  if (chars.length <= keep + 4) return null;
  let cut = chars.length - keep;
  if (!WORD_BREAK.test(chars[cut - 1])) {
    const startsWord = (at) => WORD_BREAK.test(chars[at - 1]);
    let snapped = -1;
    for (let at = cut + 1; at <= chars.length - MIDDLE_WORD_TAIL; at++) {
      if (startsWord(at)) { snapped = at; break; }
    }
    for (let at = cut - 1; snapped < 0 && at >= chars.length - MIDDLE_SEGMENT_TAIL && at > 4; at--) {
      if (startsWord(at)) snapped = at;
    }
    if (snapped > 0) cut = snapped;
  }
  return { head: chars.slice(0, cut).join(""), tail: chars.slice(cut).join("") };
}

function middleHtml(value, esc, cls = "") {
  const split = splitMiddle(value);
  const inner = split
    ? `<span class="tx-mid-head">${esc(split.head)}</span><span class="tx-mid-tail">${esc(split.tail)}</span>`
    : `<span class="tx-mid-whole">${esc(value)}</span>`;
  return `<span class="tx-mid${cls ? ` ${cls}` : ""}" title="${esc(value)}">${inner}</span>`;
}

function fitMiddles(root) {
  for (const head of root?.querySelectorAll(".tx-mid-head") || []) {
    head.style.maxWidth = "";
    head.removeAttribute("data-over");
    const text = head.firstChild;
    if (!(text instanceof Text) || head.scrollWidth <= head.clientWidth) continue;
    head.setAttribute("data-over", "");
    const room = head.clientWidth;
    const left = head.getBoundingClientRect().left;
    const range = document.createRange();
    const widthTo = (end) => { range.setStart(text, 0); range.setEnd(text, end); return range.getBoundingClientRect().right - left; };
    let fits = 0;
    let over = text.length;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if (widthTo(mid) <= room) fits = mid;
      else over = mid;
    }
    head.style.maxWidth = `${Math.max(0, Math.floor(widthTo(fits)))}px`;
  }
}

const PR_ICONS = { open: "prArrow", merged: "merge", closed: "prClosed", draft: "prDraft" };
const PR_FIRST = ["open", "draft", "merged", "closed"];

function prBadgeHtml(prs, ctx) {
  if (!prs.length) return "";
  const { esc } = ctx;
  const state = prs.length === 1 ? prs[0].state : PR_FIRST.find((one) => prs.some((p) => p.state === one)) || "open";
  const text = prs.length === 1 ? prs[0].tag.split("#").pop() : `+${prs.length}`;
  const first = prs.find((p) => p.state === state) || prs[0];
  const list = prs.map((p) => `${p.tag} ${p.title}`.trim()).join("\n");
  return `<button type="button" class="tx-prb pr-${esc(state)}" data-act="pr-open" data-pr="${esc(first.key)}" title="${esc(list)}">${icon(PR_ICONS[state] || PR_ICONS.open)}<span>${esc(text)}</span></button>`;
}

const treeOf = (seat) => (Array.isArray(seat.trees) ? seat.trees.find((one) => one?.repo) : null) || null;

function prsOf(name, prs) {
  return (prs || []).filter((p) => p.session === name).map((p) => ({
    key: p.key || "",
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
  painted: new Map(), lastSel: "", menu: null, dialog: null, ticker: 0, jump: false, renaming: "",
  turns: new Map(), patch: null, scope: "", collapsed: false, injected: [], tone: "", toneOf: "",
  looks: new Map(), lastRead: "",
  rows: new Map(), tip: null, tipKey: "", tipTimer: 0, tipClosedAt: 0,
  subs: new Map(), subOpen: null, subsShelf: false, subsShown: 6
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
  const agent = ["codex", "kimi", "kiro", "cursor", "gemini", "antigravity", "opencode"].includes(row.agent) ? row.agent : "claude";
  const account = row.account || "";
  const letters = (account === "default" ? agent : account).slice(0, 2).toUpperCase();
  const badge = account ? `<span class="tx-acct" style="--fav-h:${hueOf(account)}">${ctx.esc(letters)}</span>` : "";
  return `<span class="tx-prov-i ${agent}${badge ? " has-acct" : ""}" title="${ctx.esc(account)}">${ctx.svgIcon(`i-${agent}`)}${badge}</span>`;
}

async function pullTurns(ctx, name, stamp = 0) {
  const had = mine.turns.get(name);
  const moved = !!had && had.stamp !== stamp;
  if (had?.asking || (had && !moved && Date.now() - had.at < TURNS_FRESH)) return;
  mine.turns.set(name, { ...(had || {}), asking: true });
  if (moved) await new Promise((go) => setTimeout(go, TURNS_SETTLE));
  let said = null;
  try { said = await (await fetch(`/api/checkpoints?name=${encodeURIComponent(name)}`)).json(); } catch {}
  mine.turns.set(name, { at: Date.now(), stamp, list: Array.isArray(said?.turns) ? said.turns : [], asking: false });
  ctx.render();
}

function lookOf(name, ordinal) {
  const key = `${name}:${ordinal}`;
  if (!mine.looks.has(key)) mine.looks.set(key, { all: false, open: new Map() });
  return mine.looks.get(key);
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

const SUBS_FRESH = 15000;
const SUBS_LIVE = 4000;
const SUBS_SHOWN = 6;
const SUBS_PAGE = 12;
const SUB_ENDED = new Set(["done", "stopped"]);

const subsOf = (name) => mine.subs.get(name)?.list || [];

async function pullSubs(ctx, name, stamp = 0) {
  const had = mine.subs.get(name);
  const live = (had?.list || []).some((one) => one.status === "running");
  if (had?.asking || (had && had.stamp === stamp && Date.now() - had.at < (live ? SUBS_LIVE : SUBS_FRESH))) return;
  mine.subs.set(name, { ...(had || {}), asking: true });
  let said = null;
  try { said = await (await fetch(`/api/subagents?name=${encodeURIComponent(name)}`)).json(); } catch {}
  mine.subs.set(name, { at: Date.now(), stamp, list: Array.isArray(said?.agents) ? said.agents : had?.list || [], asking: false });
  ctx.render();
}

function subLasted(sub, now = Date.now()) {
  return workingFor((sub.endedAt || now) - sub.startedAt);
}

function subSays(sub, phrase, now = Date.now()) {
  if (sub.status === "running") return phrase("Working for {d}", { d: liveFor(now - sub.startedAt) });
  const d = liveFor((sub.endedAt || now) - sub.startedAt);
  return sub.status === "done" ? phrase("Finished in {d}", { d }) : phrase("Stopped after {d}", { d });
}

function subIconHtml(sub, r, ctx) {
  const agent = ["codex", "kimi", "kiro", "cursor", "gemini", "antigravity", "opencode"].includes(r.agent) ? r.agent : "claude";
  return `<span class="tx-sub-i ${agent}">${ctx.svgIcon(`i-${agent}`)}<i class="tx-sub-dot st-${ctx.esc(sub.status)}"></i></span>`;
}

function subRowHtml(sub, r, ctx) {
  const { esc } = ctx;
  const live = sub.status === "running";
  const on = mine.subOpen?.id === sub.id ? " on" : "";
  return `<button type="button" class="tx-drow tx-sub${on}" data-act="sub-open" data-id="${esc(sub.id)}" title="${esc(sub.title)}">${subIconHtml(sub, r, ctx)}<span class="tx-dv">${esc(sub.title)}</span><span class="tx-dl tx-sub-ms"${live ? ` data-t0="${sub.startedAt}"` : ""}>${esc(subLasted(sub))}</span></button>`;
}

function agentsHtml(r, ctx) {
  const { esc, phrase } = ctx;
  const list = subsOf(r.name);
  if (!list.length) return "";
  const active = list.filter((one) => !SUB_ENDED.has(one.status));
  const ended = list.filter((one) => SUB_ENDED.has(one.status));
  const shown = ended.slice(0, mine.subsShown);
  const more = ended.length - shown.length;
  const fold = ended.length
    ? `<button type="button" class="tx-drow tx-subs-fold${mine.subsShelf ? " open" : ""}" data-act="subs-fold" aria-expanded="${mine.subsShelf}">${icon("bot")}<span class="tx-dv">${esc(phrase("Previous agents"))}</span>${mine.subsShelf ? "" : `<span class="tx-dl">${ended.length}</span>`}${icon("down", "tx-subs-chev")}</button>`
    : "";
  const previous = mine.subsShelf
    ? `${shown.map((one) => subRowHtml(one, r, ctx)).join("")}${more > 0 ? `<button type="button" class="tx-drow tx-subs-more" data-act="subs-more">${icon("plus")}<span class="tx-dv">${esc(phrase("Show {n} more", { n: Math.min(more, SUBS_PAGE) }))}</span></button>` : ""}`
    : "";
  return `<div class="tx-dsec tx-agents">${active.map((one) => subRowHtml(one, r, ctx)).join("")}${fold}${previous}</div>`;
}

function subViewOf(name, id) {
  return getStructured({ name: `sub:${name}:${id}`, where: "local", mirror: { sub: true, seat: name, id } });
}

async function pullSubEvents(ctx) {
  const open = mine.subOpen;
  if (!open || open.asking) return;
  open.asking = true;
  let said = null;
  try { said = await (await fetch(`/api/subagents/events?name=${encodeURIComponent(open.name)}&id=${encodeURIComponent(open.id)}`)).json(); } catch {}
  open.asking = false;
  open.at = Date.now();
  if (mine.subOpen !== open) return;
  const events = Array.isArray(said?.events) ? said.events : [];
  const e = subViewOf(open.name, open.id);
  if (!said?.events && !open.seen && !open.error) {
    open.error = ctx.phrase("That subagent left no transcript");
    svLine(e, "sv-meta warn", open.error);
  }
  for (const ev of events.slice(open.seen)) svEvent(e, { ...ev, replayed: true });
  open.seen = Math.max(open.seen, events.length);
  ctx.render();
}

function openSub(ctx, id) {
  const r = mine.reading;
  if (!r || !subsOf(r.name).some((one) => one.id === id)) return;
  hideTip();
  mine.subOpen = { key: r.key, name: r.name, id, seen: 0, at: 0, asking: false, error: "" };
  const e = subViewOf(r.name, id);
  svReset(e);
  e.host.classList.add("tx-subconv");
  mine.nodes.subhost.replaceChildren(e.host, mine.nodes.subbar);
  pullSubEvents(ctx);
  ctx.render();
}

function closeSub(ctx) {
  const open = mine.subOpen;
  if (!open) return;
  mine.subOpen = null;
  forgetStruct(`sub:${open.name}:${open.id}`);
  mine.nodes?.subhost.replaceChildren(mine.nodes.subbar);
  ctx?.render();
}

function subBarHtml(sub, r, ctx) {
  const { esc, phrase } = ctx;
  const model = prettyModel(sub.model) || r.model;
  const live = sub.status === "running";
  return `<div class="tx-subbar-in">
    <span class="tx-subbar-who">${subIconHtml(sub, r, ctx)}<span class="tx-subbar-model">${esc(model || phrase("Subagent"))}</span><span class="tx-subbar-st"${live ? ` data-t0="${sub.startedAt}"` : ""}>${esc(subSays(sub, phrase))}</span></span>
    <span class="tx-subbar-note">${esc(phrase("Runs on its own"))}</span>
    <button type="button" class="tx-subbar-btn" data-act="sub-close">${icon("arrowUpLeft")}<span>${esc(phrase("Open parent"))}</span></button>
  </div>`;
}

function prettyModel(id) {
  const m = String(id || "").match(/^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : String(id || "");
}

function patchHtml(ctx) {
  const { esc, phrase } = ctx;
  const p = mine.patch;
  if (!p) return "";
  const lines = String(p.text || "").split("\n").slice(0, 4000).map((line) => {
    const cls = line.startsWith("+++") || line.startsWith("---") ? "h" : line.startsWith("+") ? "a" : line.startsWith("-") ? "d" : line.startsWith("@@") ? "c" : line.startsWith("diff ") ? "f" : "";
    const file = cls === "f" ? line.match(/^diff --git a\/.+? b\/(.+)$/)?.[1] || "" : "";
    return `<span class="${cls}"${file ? ` data-file="${esc(file)}"` : ""}>${esc(line) || " "}</span>`;
  }).join("");
  return `<div class="tx-patch"><div class="tx-patch-head"><span>${esc(phrase("Turn #{n}", { n: p.ordinal }))}</span><button type="button" class="tx-hbtn" data-act="patch-close">${icon("x")}</button></div><pre>${p.error ? esc(p.error) : lines}${p.cut ? `<span class="c">${esc(phrase("… cut at 2 MB"))}</span>` : ""}</pre></div>`;
}

function rowOf(seat, { now, prs, phrase }) {
  const mark = seatMark(seat.key);
  const tree = treeOf(seat);
  const status = statusOf(seat, mark, !!secretAskOf(seat.name), !!pool.get(seat.name)?.limitedUntil);
  const pulls = prsOf(seat.name, prs);
  return {
    key: seat.key,
    name: seat.name,
    title: (seat.naming && seedOf(seat.description || seat.mission)) || seat.title || seat.name || seat.key,
    retitling: retitlingNow(seat),
    state: seat.state,
    group: groupOf(seat.state),
    status,
    section: seatSection(seat.key, now),
    autoSettled: !!mark.autoSettled,
    mark,
    last: lastWords(seat),
    stamp: seat.kind === "draft" || seat.kind === "job" ? now : stampOf(seat),
    when: seat.kind === "draft" ? "" : shortAgo(stampOf(seat), now, phrase),
    turnStamp: stampOf(seat),
    since: Date.parse(seat.turnSince || "") || 0,
    repo: tree?.repo || String(seat.cwd || "").split("/").filter(Boolean).pop() || "",
    branch: tree?.branch || "",
    path: tree?.path || "",
    worktree: !!tree && !tree.main,
    prs: pulls,
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

function markHit(text, query, esc) {
  const word = String(query || "").trim().split(/\s+/)[0] || "";
  const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<mark>${esc(text.slice(at, at + word.length))}</mark>${esc(text.slice(at + word.length))}`;
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
  const seats = [...ctx.seats(), ...ctx.shelved()];
  const all = seats.map((seat) => rowOf(seat, { now, prs: st.prs, phrase }));
  const repos = [...new Set(all.map((row) => row.repo).filter(Boolean))].sort();
  if (mine.scope && !repos.includes(mine.scope)) mine.scope = "";
  if (mine.query) findInChats(mine.query);
  const rows = all
    .map((row) => {
      if (!mine.query || matches(row, mine.query)) return row;
      const hit = row.session ? messageHit(row.name, mine.query) : null;
      return hit ? { ...row, reason: hitSays(hit) } : null;
    })
    .filter((row) => row && (!mine.scope || row.repo === mine.scope));
  const recent = (a, b) => b.stamp - a.stamp;
  const pinned = rows.filter((one) => one.section === "pinned").sort((a, b) => a.mark.pinnedAt - b.mark.pinnedAt);
  const live = rows.filter((one) => one.section === "active").sort(recent);
  const working = st.threadRules.workingSection ? live.filter((one) => one.group === "busy").sort((a, b) => b.since - a.since) : [];
  const active = live.filter((one) => !working.includes(one));
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
    ...(mine.shelves.working || mine.query ? working : []),
    ...(mine.shelves.snoozed || mine.query ? snoozed : []),
    ...(mine.shelves.settled || mine.query ? settled : []),
    ...(mine.shelves.team || mine.query ? team : [])
  ];
  return {
    all, repos, pinned, active, working, snoozed, settled, team, archived, pick, reading, shown,
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
      ? until.toLocaleTimeString([], clockOptions({ hour: "2-digit", minute: "2-digit" }))
      : until.toLocaleDateString([], clockOptions({ weekday: "short", hour: "2-digit", minute: "2-digit" }));
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
  if (isPicked(row.key)) cls.push("picked");
  if (recede) cls.push("recede");
  if (recede && row.status === "working") cls.push("busy-fade");
  const project = row.repo || (row.where === "cloud" ? phrase("cloud") : phrase("this machine"));
  const pin = row.section === "pinned" ? `<button type="button" class="tx-mark tx-unpin" data-act="unpin" data-of="${esc(row.key)}" title="${esc(phrase("Unpin"))}" aria-label="${esc(phrase("Unpin"))}">${icon("pin", "on")}${icon("pinOff", "off")}</button>` : "";
  const draft = row.draft
    ? `<span class="tx-mark">${icon("pen")}</span>`
    : row.session && hasDraft(row.name) ? `<button type="button" class="tx-mark tx-unpin tx-draft" data-act="discard" data-of="${esc(row.name)}" title="${esc(phrase("Discard draft"))}" aria-label="${esc(phrase("Discard draft"))}">${icon("pen", "on")}${icon("x", "off")}</button>` : "";
  const prs = prBadgeHtml(row.prs, ctx);
  const branch = row.branch
    ? `${row.worktree ? `<span class="tx-wt" title="${esc(phrase("Worktree"))}">${icon("worktree")}</span>` : ""}<span class="tx-br">${middleHtml(row.branch, esc)}</span>`
    : `<span class="tx-br"></span>`;
  const jump = slot ? `<span class="tx-jumphint">${IS_MAC ? "⌘" : "Ctrl+"}${slot}</span>` : "";
  return `<li class="tx-li"><div class="${cls.join(" ")}" role="button" tabindex="0" data-key="${esc(row.key)}" data-tip="${esc(row.key)}" aria-label="${esc(row.title)}">
    <div class="tx-l1">${draft}${favHtml(row, ctx)}<span class="tx-proj">${esc(project)}</span>${pin}<span class="tx-slot">${statusHtml(row, ctx)}<span class="tx-racts">${rowActionsHtml(row, ctx)}</span></span></div>
    <div class="tx-l2"><span class="tx-title ${titleTone(row, selected)}${row.retitling ? " title-regenerating" : ""}"${row.retitling ? ' aria-busy="true"' : ""}>${esc(row.title)}</span></div>
    <div class="tx-l3">${row.reason ? `<span class="tx-why">${markHit(row.reason, mine.query, esc)}</span>` : branch}${prs}<span class="tx-prov">${row.where === "cloud" ? `<span class="tx-prov-i">${icon("cloud")}</span>` : ""}${providerHtml(row, ctx)}</span></div>
    ${jump}</div></li>`;
}

function compactRowHtml({ key, attrs = "", fav, title, slot, acts = "", selected = false, picked = false, regenerating = false }) {
  return `<li class="tx-li compact"><div class="tx-row compact${selected ? " sel" : ""}${picked ? " picked" : ""}" role="button" tabindex="0" ${key ? `data-key="${key}"` : ""} ${attrs}>${fav}<span class="tx-title t-recede${regenerating ? " title-regenerating" : ""}"${regenerating ? ' aria-busy="true"' : ""}>${title}</span><span class="tx-slot">${slot}<span class="tx-racts">${acts}</span></span></div></li>`;
}

function settledRowHtml(row, v, ctx) {
  const { esc, phrase } = ctx;
  return compactRowHtml({
    key: esc(row.key), selected: row.key === v.selected, picked: isPicked(row.key), attrs: `data-tip="${esc(row.key)}"`, fav: favHtml(row, ctx, " dim"), title: esc(row.title), regenerating: row.retitling,
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
  return `<button type="button" class="tx-shelf tone-${tone}${open ? " open" : ""}" data-shelf="${esc(id)}" aria-expanded="${open}"><span>${esc(label)}</span><span class="tx-rule"></span><span class="tx-count">${rows.length}</span>${icon("down")}</button>${open ? `<ul class="tx-ul">${rows.map((row) => draw(row)).join("")}</ul>` : ""}`;
}

function foldersHtml(rows, draw, ctx) {
  const { esc, phrase } = ctx;
  const folders = new Map();
  for (const row of rows) {
    const repo = row.repo || phrase("no project");
    if (!folders.has(repo)) folders.set(repo, []);
    folders.get(repo).push(row);
  }
  return [...folders].sort(([a], [b]) => a.localeCompare(b)).map(([repo, list]) => {
    const open = !mine.foldersShut.has(repo) || !!mine.query;
    const needs = list.some((row) => row.group === "needs");
    return `<button type="button" class="tx-folder${open ? " open" : ""}" data-folder="${esc(repo)}" aria-expanded="${open}">${icon("folder")}<span>${esc(repo)}</span>${needs ? `<i class="tx-folder-needs" aria-label="${esc(phrase("a chat here needs you"))}"></i>` : ""}<span class="tx-count">${list.length}</span>${icon("down")}</button>${open ? `<ul class="tx-ul">${list.map(draw).join("")}</ul>` : ""}`;
  }).join("");
}

function listHtml(v, ctx) {
  const { esc, phrase } = ctx;
  let slot = 0;
  const draw = (row) => rowHtml(row, v, ctx, slot < JUMP_SLOTS ? ++slot : 0);
  const pinned = v.pinned.length ? `<ul class="tx-ul">${v.pinned.map(draw).join("")}</ul><div class="tx-divider"></div>` : "";
  const foundElsewhere = !!mine.query && (v.working.length || v.snoozed.length || v.settled.length || v.team.length || v.archived.length);
  const active = !v.active.length
    ? (foundElsewhere ? "" : `<p class="tx-empty">${esc(phrase(mine.query ? "No threads found" : "No active chats"))}</p>`)
    : st.threadRules.groupByProject ? foldersHtml(v.active, draw, ctx) : `<ul class="tx-ul">${v.active.map(draw).join("")}</ul>`;
  const working = shelfHtml("working", phrase("Working"), v.working, v, ctx, draw);
  const snoozed = shelfHtml("snoozed", phrase("Snoozed"), v.snoozed, v, ctx, draw);
  const settled = shelfHtml("settled", phrase("Settled"), v.settled, v, ctx, (row) => settledRowHtml(row, v, ctx));
  const team = shelfHtml("team", phrase("From the team"), v.team, v, ctx, (row) => teamRowHtml(row, v, ctx));
  const archived = shelfHtml("archived", phrase("Archived"), v.archived, v, ctx, (row) => archivedRowHtml(row, ctx));
  return `${selectionBarHtml(undefined, "tx-selbar")}${pinned}${active}<div class="tx-shelves">${working}${snoozed}${settled}${team}${archived}</div>`;
}

function headHtml(v, ctx) {
  const { esc, phrase } = ctx;
  const r = v.reading;
  const reopen = mine.collapsed ? `<button type="button" class="tx-ghost" data-act="collapse" title="${esc(phrase("Show the sidebar"))}">${icon("sidebar")}</button>` : "";
  if (!r) return `<div class="tx-crumbs">${reopen}<span class="tx-crumb-title">${esc(v.pick ? v.pick.title : phrase("New chat"))}</span></div>`;
  const sub = mine.subOpen?.key === r.key && subsOf(r.name).find((one) => one.id === mine.subOpen.id);
  if (sub) {
    const project = r.repo ? `<span class="tx-crumb-proj">${favHtml(r, ctx)}<span>${esc(r.repo)}</span></span><span class="tx-crumb-sep">/</span>` : "";
    return `<div class="tx-crumbs">${reopen}${project}<button type="button" class="tx-crumb-parent" data-act="sub-close" title="${esc(phrase("Open parent"))}">${esc(r.title)}</button><span class="tx-crumb-sep">/</span><span class="tx-crumb-title tx-crumb-sub">${icon("bot")}<span>${esc(sub.title)}</span></span></div>
    <div class="tx-hacts"><button type="button" class="tx-ghost${mine.details ? " on" : ""}" data-act="details" title="${esc(phrase("Thread details"))}">${icon("panel")}</button></div>`;
  }
  const tile = ctx.tile(r.key);
  const web = tile?.querySelector(".t-web");
  const groups = [];
  groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="new" title="${esc(phrase("New chat"))}">${icon("plus")}</button><button type="button" class="tx-ob tx-ob-chev" data-act="menu" data-of="${esc(r.key)}" title="${esc(phrase("More"))}">${icon("down")}</button></span>`);
  if (web && !web.hidden) groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="web" title="${esc(phrase("Browser"))}">${icon("globe")}</button></span>`);
  if (r.prs.length) {
    const p = r.prs[0];
    groups.push(`<span class="tx-group"><a class="tx-ob tx-ob-pr pr-${esc(p.state)}${p.failing ? " fail" : ""}${prSideKey() && prSideKey() === p.key ? " on" : ""}" data-act="pr-open" data-pr="${esc(p.key)}" href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(p.title || p.tag)}">${icon("pr")}<span>#${esc(p.tag.split("#").pop())}</span></a>${r.prs.length > 1 ? `<button type="button" class="tx-ob tx-ob-chev" data-act="details" title="${esc(phrase("Thread details"))}">${icon("down")}</button>` : ""}</span>`);
  }
  if (r.session) groups.push(`<span class="tx-group"><button type="button" class="tx-ob" data-act="diff" title="${esc(phrase("Changes"))}">${icon("diff")}<span>Diff</span></button></span>`);
  const project = r.repo
    ? `<span class="tx-crumb-proj">${favHtml(r, ctx)}<span>${esc(r.repo)}</span></span><span class="tx-crumb-sep">/</span>`
    : "";
  return `<div class="tx-crumbs">${reopen}${project}<button type="button" class="tx-crumb-title" data-act="menu" data-of="${esc(r.key)}"${r.retitling ? ' aria-busy="true"' : ""}><span${r.retitling ? ' class="title-regenerating"' : ""}>${esc(r.title)}</span>${icon("down", "tx-crumb-chev")}</button></div>
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
  const prs = r.prs.map((p) => `<a class="tx-drow tx-dlink pr-${esc(p.state)}${p.failing || p.conflict ? " fail" : ""}" data-act="pr-open" data-pr="${esc(p.key)}" href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(p.title)}">${icon("pr")}<span class="tx-dv">${esc(p.tag)}</span><span class="tx-dl">${esc(said(p))}</span></a>`).join("");
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
    ${agentsHtml(r, ctx)}
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
  const clear = n.frame.querySelector(".tx-qclear");
  if (clear) {
    clear.hidden = !mine.query;
    clear.setAttribute("aria-label", phrase("Clear the search"));
    clear.title = phrase("Clear the search");
  }
  n.newChat.title = phrase("New chat ({k}) — shift-click starts it in the project you are in", { k: keyHint("new") || "⌘N" });
  n.scope.title = mine.scope || phrase("Filter threads by project");
  n.scope.setAttribute("aria-label", n.scope.title);
  n.scope.classList.toggle("on", !!mine.scope);
  paintInto(n.scope, mine.scope ? monogramHtml(mine.scope, esc) : icon("filter"));
  paintInto(n.foot, `${agentPillHtml(undefined, "agent-pill tx-agent-pill")}<button type="button" class="tx-foot-btn" data-act="settings" title="${esc(phrase("Settings"))}">${icon("settings")}</button><button type="button" class="tx-foot-btn" data-act="prs" title="${esc(phrase("Pull requests"))}">${icon("prArrow")}</button><button type="button" class="tx-foot-btn" data-act="usage" title="${esc(phrase("Usage"))}">${icon("bars")}</button>`);
}

function paintPrSide(ctx) {
  const n = mine.nodes;
  const { main, compose } = prSideHtml(icon, ctx.render);
  const body = n.prMain.querySelector(".tp-body");
  const kept = body ? { tab: n.prMain.querySelector(".tp-seg .on")?.dataset.tab, top: body.scrollTop } : null;
  paintInto(n.prMain, main);
  const now = n.prMain.querySelector(".tp-body");
  if (now && kept && kept.tab === n.prMain.querySelector(".tp-seg .on")?.dataset.tab) now.scrollTop = kept.top;
  if (paintInto(n.prCompose, compose)) {
    const box = n.prCompose.querySelector(".tp-text");
    if (box) box.value = prSideDraft();
  }
  n.prSide.hidden = !main;
}

function build(ctx) {
  const { esc, phrase } = ctx;
  ctx.root.innerHTML = `<div class="tx">
    <aside class="tx-side" aria-label="${esc(phrase("Chats"))}">
      ${nightlySkyHtml()}
      <div class="tx-brand"><button type="button" class="tx-brand-btn" data-act="collapse" title="${esc(phrase("Hide the sidebar"))}">${icon("sidebarClose")}</button><span class="tx-word"><b>Hive</b><span class="tx-channel">Nightly</span><span class="tx-wsname"></span></span></div>
      <div class="tx-tools">
        <div class="tx-toolrow"><label class="tx-find">${icon("search")}<input type="search" class="tx-q" spellcheck="false" autocomplete="off"><button type="button" class="tx-qclear" data-act="qclear" hidden>${icon("x")}</button></label><button type="button" class="tx-iconbtn tx-scope" data-act="scope"></button><button type="button" class="tx-iconbtn" data-act="new">${icon("pen")}</button></div>
      </div>
      <div class="tx-scroll"></div>
      <div class="tx-sfoot"></div>
      <div class="tx-grip" role="separator" aria-orientation="vertical"></div>
    </aside>
    <section class="tx-main">
      <header class="tx-head"></header>
      <div class="tx-body">
        <div class="tx-page"><div class="tx-host"></div><div class="tx-host tx-subhost" hidden><div class="tx-subbar"></div></div><div class="tx-blankhost"></div><div class="tx-patchhost"></div></div>
        <aside class="tx-details" aria-label="${esc(phrase("Thread details"))}"></aside>
        <aside class="tx-prside" aria-label="${esc(phrase("Pull request panel"))}" hidden><div class="tp"><div class="tp-main"></div><div class="tp-composehost"></div></div></aside>
      </div>
    </section>
  </div>`;
  const q = (sel) => ctx.root.querySelector(sel);
  mine.nodes = {
    side: q(".tx-side"), wsname: q(".tx-wsname"), scroll: q(".tx-scroll"), foot: q(".tx-sfoot"), head: q(".tx-head"),
    host: q(".tx-host"), subhost: q(".tx-subhost"), subbar: q(".tx-subbar"), blank: q(".tx-blankhost"), patch: q(".tx-patchhost"), details: q(".tx-details"), query: q(".tx-q"),
    prSide: q(".tx-prside"), prMain: q(".tp-main"), prCompose: q(".tp-composehost"),
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
  const moved = (move) => { width = sizeSidebar(move.clientX - left); fitMiddles(mine.nodes?.scroll); };
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

const settle = (ctx, key) => {
  if (key === mine.reading?.key) moveOff(ctx, key);
  settleSeats([key]);
};
const unsettle = (ctx, key) => unsettleSeats([key]);
const togglePin = (ctx, key) => togglePinSeat(key);
const snooze = (ctx, key, until) => {
  if (key === mine.reading?.key) moveOff(ctx, key);
  snoozeSeats([key], until);
};
const unsnooze = (ctx, key) => wakeSeats([key]);
const markUnread = (ctx, key) => markUnreadSeat(key);

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
  seenSeat(key);
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

function toggleCollapsed(ctx) {
  mine.collapsed = !mine.collapsed;
  writeJson(COLLAPSED_KEY, mine.collapsed);
  mine.nodes?.frame.classList.toggle("collapsed", mine.collapsed);
  ctx.render();
  return true;
}

function stepChat(ctx, d) {
  const rows = mine.shown.filter((one) => one.session);
  const now = mine.reading?.key;
  const at = now ? rows.findIndex((one) => one.key === now) : -1;
  const to = at < 0 ? rows.at(d > 0 ? 0 : -1) : rows[at + d];
  if (to) choose(ctx, to.key);
  return true;
}

function rowAt(ctx, el) {
  const hit = el?.closest?.(".tx-row[data-key]");
  const row = hit ? mine.shown.find((one) => one.key === hit.dataset.key) : null;
  if (!row?.session) return null;
  return { name: row.name, el: hit, menu: (x, y) => rowMenu(ctx, row.key, x, y) };
}

function archive(ctx, key = mine.reading?.key) {
  const row = mine.shown.find((one) => one.key === key) || mine.reading;
  if (!row?.session) return;
  const s = sessionOf(row.name);
  if (!s) return;
  if (key === mine.reading?.key) moveOff(ctx, key);
  forgetSeatMark(key);
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

const TIP_DELAY = 600;
const TIP_WARM = 400;

function tipHtml(row, ctx) {
  const { esc, phrase } = ctx;
  const line = (lead, text) => `<div class="tx-tip-row">${lead}${text}</div>`;
  const words = (text) => `<span class="tx-tip-text">${esc(text)}</span>`;
  const place = row.where === "cloud" ? phrase("cloud") : st.team?.machine || st.team?.machineHere || phrase("this machine");
  const model = [row.model, row.account && row.account !== "default" ? row.account : ""].filter(Boolean).join(" · ");
  const prs = row.prs.map((p) => `<div class="tx-tip-pr pr-${esc(p.state)}">${icon(PR_ICONS[p.state] || PR_ICONS.open)}<span class="tx-tip-num">#${esc(p.tag.split("#").pop())}</span><span class="tx-tip-text">${esc(p.title || p.tag)}</span></div>`).join("");
  return `<div class="tx-tip-title">${esc(row.title)}</div>
    <div class="tx-tip-rows">
      ${row.repo ? line(monogramHtml(row.repo, esc, " tx-tip-fav"), words(row.repo)) : ""}
      ${line(icon(row.where === "cloud" ? "cloud" : "local"), words(place))}
      ${row.branch ? line(icon("branch"), middleHtml(row.branch, esc, "tx-tip-text")) : ""}
      ${model ? line(`<span class="tx-tip-prov">${providerHtml({ ...row, account: "" }, ctx)}</span>`, words(model)) : ""}
    </div>
    ${prs ? `<div class="tx-tip-foot">${prs}</div>` : ""}`;
}

function hideTip() {
  clearTimeout(mine.tipTimer);
  mine.tipTimer = 0;
  if (!mine.tip) return;
  mine.tip.remove();
  mine.tip = null;
  mine.tipClosedAt = Date.now();
}

function showTip(ctx, el) {
  const row = mine.rows?.get(el.dataset.tip);
  if (!row || !el.isConnected) return hideTip();
  hideTip();
  const tip = document.createElement("div");
  tip.className = "tx-tip";
  tip.setAttribute("role", "tooltip");
  tip.innerHTML = tipHtml(row, ctx);
  mine.nodes.side.append(tip);
  const box = el.getBoundingClientRect();
  const room = window.innerHeight - tip.offsetHeight - 8;
  tip.style.left = `${Math.round(box.right + 4)}px`;
  tip.style.top = `${Math.round(Math.max(8, Math.min(box.top, room)))}px`;
  fitMiddles(tip);
  mine.tip = tip;
  mine.tipKey = row.key;
}

function hoverTip(event, ctx) {
  const el = event.target.closest?.("[data-tip]");
  if (el && mine.tip && mine.tipKey === el.dataset.tip) return;
  clearTimeout(mine.tipTimer);
  if (!el || !ctx.root.contains(el) || mine.menu || mine.renaming) return hideTip();
  const warm = !!mine.tip || Date.now() - (mine.tipClosedAt || 0) < TIP_WARM;
  if (mine.tip) hideTip();
  mine.tipTimer = setTimeout(() => showTip(ctx, el), warm ? 0 : TIP_DELAY);
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
  return [
    ...snoozeChoicesNow().map((one) => ({ id: `snooze:${one.id}`, icon: "alarm", name: one.says, hint: one.when, run: () => snooze(ctx, key, one.until) })),
    "-",
    { id: "snooze:custom", icon: "clock", name: phrase("Custom…"), run: () => openCustomSnooze([key], { host: ctx.root, onSnooze: (until) => snooze(ctx, key, until) }) },
    { id: "snooze-options", icon: "settings", name: phrase("Edit options…"), run: openThreadSettings }
  ];
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
    row.session && branchPlaceOf(sessionOf(row.name)) ? { id: "new-on-branch", icon: "branch", name: phrase("New chat on {branch}", { branch: branchPlaceOf(sessionOf(row.name)).branch }), run: () => openDraftOnBranchOf(sessionOf(row.name)) } : null,
    "-",
    row.session && !sessionOf(row.name)?.anon ? { id: "link", icon: "message", name: phrase("Copy chat link"), run: () => toClipboard(`hive://seat/${row.name}`) } : null,
    row.session ? { id: "more", icon: "more", name: phrase("More actions…"), run: () => { const s = sessionOf(row.name); if (s) openSeatMenu(s, x, y); } } : null,
    row.session ? { id: "never", icon: "clock", name: phrase("Never settle on its own"), hint: row.mark.neverSettles ? "✓" : "", run: () => setNeverSettles(key, !row.mark.neverSettles) } : null,
    row.session ? { id: "archive", icon: "archive", name: phrase("Archive"), hint: "e", danger: true, run: () => archive(ctx, key) } : null,
    row.session ? { id: "erase", icon: "trash", name: phrase("Delete for good…"), danger: true, run: () => askToErase([{ name: row.name, where: row.where, title: row.title }]) } : null
  ].filter(Boolean);
  openMenu(ctx, items, x, y);
}

function clicked(event, ctx) {
  if (mine.menu && !mine.menu.contains(event.target)) closeMenu();
  const link = event.target.closest(".tx-prside a[href]:not([data-act])");
  if (link) {
    event.preventDefault();
    const pr = prOfUrl(link.href);
    if (pr && (st.prs || []).some((p) => p.key === pr.key) && !event.metaKey && !event.ctrlKey) {
      openPrSide(pr.key);
      return ctx.render();
    }
    return window.open(link.href, "_blank", "noopener,noreferrer");
  }
  const hit = event.target.closest("[data-shelf], [data-folder], [data-act], [data-key], [data-arch]");
  if (!hit || !ctx.root.contains(hit)) return;
  if (hit.dataset.folder) {
    if (mine.foldersShut.has(hit.dataset.folder)) mine.foldersShut.delete(hit.dataset.folder);
    else mine.foldersShut.add(hit.dataset.folder);
    writeJson(FOLDERS_KEY, [...mine.foldersShut]);
    return ctx.render();
  }
  if (hit.dataset.shelf) {
    mine.shelves[hit.dataset.shelf] = !mine.shelves[hit.dataset.shelf];
    writeJson(SHELVES_KEY, mine.shelves);
    ctx.render();
    return;
  }
  const act = hit.dataset.act;
  if (act === "pr-open") {
    if (event.metaKey || event.ctrlKey || event.button === 1) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    const row = hit.closest(".tx-row[data-key]");
    if (row && row.dataset.key !== mine.reading?.key) choose(ctx, row.dataset.key);
    if (prSideKey() === hit.dataset.pr) closePrSide();
    else openPrSide(hit.dataset.pr);
    return ctx.render();
  }
  if (act?.startsWith("pr-")) {
    event.stopPropagation();
    return prSideAct(hit, ctx.render);
  }
  if (act) {
    event.stopPropagation();
    const of = hit.dataset.of;
    const box = hit.getBoundingClientRect();
    if (act === "settle") return settle(ctx, of);
    if (act === "unpin") return togglePin(ctx, of);
    if (act === "discard") return discardDraft(of);
    if (act === "qclear") {
      mine.query = "";
      if (nodes()?.query) nodes().query.value = "";
      nodes()?.query?.focus();
      return ctx.render();
    }
    if (act === "unsettle") return unsettle(ctx, of);
    if (act === "snooze") return openMenu(ctx, snoozeItems(ctx, of), box.left, box.bottom + 4);
    if (act === "menu") return rowMenu(ctx, of, box.left, box.bottom + 4);
    if (act === "new") return askNewChat({ here: event.shiftKey });
    if (act === "search") return openPal();
    if (act === "diff") return mine.reading && openDiff(mine.reading.name);
    if (act === "details") {
      mine.details = !mine.details;
      if (mine.details && mine.reading) mine.subs.delete(mine.reading.name);
      writeJson(PANEL_KEY, mine.details);
      return ctx.render();
    }
    if (act === "sub-open") return openSub(ctx, hit.dataset.id);
    if (act === "sub-close") return closeSub(ctx);
    if (act === "subs-fold") { mine.subsShelf = !mine.subsShelf; mine.subsShown = SUBS_SHOWN; return ctx.render(); }
    if (act === "subs-more") { mine.subsShown += SUBS_PAGE; return ctx.render(); }
    if (act === "turn-diff") return showTurn(ctx, Number(hit.dataset.n));
    if (act === "turn-back") return goBack(ctx, Number(hit.dataset.n));
    if (act === "patch-close") { mine.patch = null; return ctx.render(); }
    if (act === "unsnooze") return unsnooze(ctx, of);
    if (act === "scope") return openMenu(ctx, scopeItems(ctx), box.left, box.bottom + 4);
    if (act === "collapse") return toggleCollapsed(ctx);
    if (act === "settings") return runCommand("help");
    if (act === "prs") return openPrs();
    if (act === "usage") return openUsage();
    if (act === "team") return goToTeam(hit.dataset.machine);
    if (act === "revive") return reviveArchived(hit.dataset.name, hit.dataset.where);
    if (act === "web") return ctx.tile(mine.reading?.key)?.querySelector(".t-web")?.click();
    return;
  }
  if (hit.dataset.arch) return;
  if (hit.dataset.key && !hit.dataset.key.startsWith("team:") && pickClick(event, hit.dataset.key, mine.shown.map((one) => one.key))) return;
  if (hit.dataset.key) choose(ctx, hit.dataset.key);
}

function pickFiles(button) {
  const zone = zoneOf({ target: button });
  if (!zone) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => takeFiles(zone, [...(input.files || [])]), { once: true });
  input.click();
}

async function showTurn(ctx, ordinal, file = "") {
  const r = mine.reading;
  if (!r) return;
  mine.patch = { ordinal, file, text: "", error: "" };
  ctx.render();
  let said = null;
  try { said = await (await fetch(`/api/checkpoints/diff?name=${encodeURIComponent(r.name)}&ordinal=${ordinal}`)).json(); } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (mine.patch?.ordinal !== ordinal || mine.patch.file !== file) return;
  mine.patch = { ordinal, file, text: said?.patch || "", error: said?.error || "", cut: !!said?.cut };
  ctx.render();
  if (file) [...(mine.nodes?.patch.querySelectorAll(".tx-patch [data-file]") || [])].find((el) => el.dataset.file === file)?.scrollIntoView?.({ block: "start" });
}

function turnFilesAct(ctx, hit) {
  const r = mine.reading;
  const ordinal = Number(hit.dataset.n);
  if (!r) return;
  if (hit.dataset.act === "turn-diff") return showTurn(ctx, ordinal, hit.dataset.file || "");
  const look = lookOf(r.name, ordinal);
  if (hit.dataset.act === "cf-all") Object.assign(look, { all: !look.all, open: new Map() });
  else look.open.set(hit.dataset.path, !(look.open.get(hit.dataset.path) ?? look.all));
  const e = structPool.get(r.name);
  if (e) svConvShow(e);
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
  const hit = event.target.closest(".tx-row[data-key], .tx-crumb-title");
  if (!hit || !ctx.root.contains(hit)) return;
  const key = hit.dataset.key || mine.reading?.key;
  if (!key) return;
  event.preventDefault();
  rowMenu(ctx, key, event.clientX, event.clientY);
}

function resetSidebarWidth() {
  mine.nodes?.frame.style.removeProperty("--tx-sidebar");
  try { localStorage.removeItem(WIDTH_KEY); } catch {}
  fitMiddles(mine.nodes?.scroll);
}

function tick(ctx) {
  const root = mine.nodes?.scroll;
  if (!root) return;
  const now = Date.now();
  for (const el of root.querySelectorAll(".tx-dur[data-t0]")) el.textContent = workingFor(now - Number(el.dataset.t0));
  for (const el of mine.nodes.details.querySelectorAll(".tx-sub-ms[data-t0]")) el.textContent = workingFor(now - Number(el.dataset.t0));
  const bar = mine.nodes.subbar.querySelector(".tx-subbar-st[data-t0]");
  if (bar) bar.textContent = ctx.phrase("Working for {d}", { d: liveFor(now - Number(bar.dataset.t0)) });
  const r = mine.reading;
  if (r && (mine.details || mine.subOpen) && subsOf(r.name).some((one) => one.status === "running")) pullSubs(ctx, r.name, r.turnStamp);
  const open = mine.subOpen;
  if (open && !open.asking && subsOf(open.name).find((one) => one.id === open.id)?.status === "running" && now - open.at > SUBS_LIVE) pullSubEvents(ctx);
  syncTimeline(ctx);
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

function planModeOf(name) {
  const e = structPool.get(name);
  return e && seatAgent(e) === "claude" ? e : null;
}

function paintModeToggle(ctx, r, form) {
  const { esc, phrase } = ctx;
  const pick = form.querySelector(".sv-pick");
  let toggle = pick?.querySelector(":scope > .tx-mode") || null;
  const e = planModeOf(r.name);
  if (!pick || !e) return toggle?.remove();
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sv-pill tx-mode";
    toggle.addEventListener("click", () => mine.reading && togglePlanMode(ctx, mine.reading.name));
    pick.append(toggle);
    mine.injected.push(toggle);
  }
  const plan = e.mode === "plan";
  const said = plan ? phrase("Plan mode — click to return to normal build mode") : phrase("Default mode — click to enter plan mode");
  const html = `${icon(plan ? "ruler" : "bot")}<span>${esc(phrase(plan ? "Plan" : "Build"))}</span>`;
  if (toggle.dataset.h !== html) { toggle.innerHTML = html; toggle.dataset.h = html; }
  toggle.title = said;
  toggle.setAttribute("aria-label", said);
  toggle.setAttribute("aria-pressed", String(plan));
}

function syncModeToggle(ctx) {
  const r = mine.reading;
  const form = r ? ctx.tile(r.key)?.querySelector("form.sv-composer") : null;
  if (form) paintModeToggle(ctx, r, form);
}

async function togglePlanMode(ctx, name) {
  const e = planModeOf(name);
  if (!e) return false;
  await setPlanMode(e, e.mode !== "plan");
  dressComposer(ctx, mine.reading);
  return true;
}

function dressComposer(ctx, r) {
  if (!mine.nodes) return;
  const { esc, phrase } = ctx;
  const tile = r ? ctx.tile(r.key) : null;
  const form = tile?.querySelector("form.sv-composer") || null;
  for (const el of mine.injected) if (!form?.parentElement?.contains(el)) el.remove();
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
  const btns = form.querySelector(".sv-btns");
  if (btns && !btns.querySelector(":scope > .tx-clip")) {
    const clip = document.createElement("button");
    clip.type = "button";
    clip.className = "tx-clip";
    clip.title = phrase("Attach files");
    clip.setAttribute("aria-label", clip.title);
    clip.innerHTML = icon("clip");
    clip.addEventListener("click", () => pickFiles(clip));
    btns.prepend(clip);
    mine.injected.push(clip);
  }
  paintModeToggle(ctx, r, form);
  if (!r.draft) {
    form.parentElement.querySelector(":scope > .tx-ctx")?.remove();
    return paintStamps(ctx, tile);
  }
  const strip = place("tx-ctx", "after");
  const where = r.where === "cloud" ? `${icon("cloud")}<span>${esc(phrase("Cloud"))}</span>` : r.worktree ? `${icon("worktree")}<span>${esc(phrase("Worktree"))}</span>` : `${icon("laptop")}<span>${esc(phrase("Local"))}</span>`;
  const prs = r.prs.slice(0, 1).map((p) => `<a class="tx-ctx-pr pr-${esc(p.state)}" data-act="pr-open" data-pr="${esc(p.key)}" href="${esc(p.url)}" target="_blank" rel="noreferrer">${icon("pr")}<span>#${esc(p.tag.split("#").pop())}</span></a>`).join("");
  const branch = r.branch ? `<span class="tx-ctx-br" title="${esc(r.branch)}">${icon("branch")}<span>${esc(r.branch)}</span></span>` : "";
  const html = `<span class="tx-ctx-where">${where}</span><span class="tx-ctx-fill"></span>${prs}${branch}`;
  if (strip.dataset.h !== html) { strip.innerHTML = html; strip.dataset.h = html; }
  paintStamps(ctx, tile);
}

function seatRowOf(name) {
  for (const row of mine.rows.values()) if (row.name === name) return row;
  return null;
}

const filesDrawn = new WeakMap();

function turnFilesOf(row, asks, ctx) {
  const out = new Map();
  const list = mine.turns.get(row.name)?.list;
  if (!list?.length) return out;
  const drag = canDragFilesOf(structPool.get(row.name) || row);
  for (const [at, one] of checkpointsOfTurns(asks, list)) {
    const look = lookOf(row.name, one.ordinal);
    const sig = `${ctx.phrase("Open diff")}|${look.all}|${[...look.open].join(",")}|${drag}`;
    let drawn = filesDrawn.get(one);
    if (drawn?.sig !== sig) filesDrawn.set(one, drawn = { sig, html: turnFilesHtml({ turn: one, ...look, drag }, ctx) });
    out.set(at, { n: one.ordinal, html: drawn.html, pathOf: (file) => pathIn(one, file) });
  }
  return out;
}

function timelineOf(ctx) {
  return {
    look: (e) => {
      const row = seatRowOf(e.name);
      if (!row) return {};
      return { since: row.since, turnFiles: (asks) => turnFilesOf(row, asks, ctx) };
    },
    painted: (e) => paintStamps(ctx, e.scroll),
    files: (e, hit) => turnFilesAct(ctx, hit)
  };
}

function syncTimeline(ctx) {
  const r = mine.reading;
  const e = r ? structPool.get(r.name) : null;
  if (!e) return;
  const files = mine.turns.get(r.name);
  const sig = JSON.stringify([r.since, r.section, r.mark, files?.at || 0, e.queuedEls?.length || 0, e.subs?.size || 0]);
  if (e.tlSig === sig) return;
  e.tlSig = sig;
  svConvShow(e);
}

function repaintSeats() {
  for (const e of structPool.values()) {
    e.tlSig = "";
    svConvShow(e);
  }
}

function paintStamps(ctx, tile) {
  for (const said of tile.querySelectorAll(".sv-msg.stamped")) if (!said.querySelector(":scope > .sv-stamp")) paintStamp(said);
  for (const stamp of tile.querySelectorAll(".sv-stamp")) {
    const block = stamp.parentElement;
    const clock = clockOf(Number(block.dataset.at || block.dataset.said || 0), ctx.phrase);
    let el = stamp.querySelector(":scope > .tx-clock");
    if (!el) {
      el = document.createElement("span");
      el.className = "tx-clock";
      stamp.append(el);
    }
    if (el.textContent !== clock) el.textContent = clock;
    const full = fullTimeOf(Number(block.dataset.at || block.dataset.said || 0), spokenNow());
    if (el.title !== full) el.title = full;
  }
}

const inbox = {
  id: "inbox",
  ready: true,
  groupOf,
  lastWords,
  splitMiddle,
  nextUp,
  statusOf,
  landed,
  ownsShelves: true,
  stepChat,
  toggleSidebar: toggleCollapsed,
  rowAt,
  enter(ctx) {
    scopeNewChatsBy(() => mine.scope);
    mine.details = readJson(PANEL_KEY, false) === true;
    mine.shelves = { working: false, snoozed: false, settled: false, team: false, archived: false, ...readJson(SHELVES_KEY, {}) };
    mine.scope = String(readJson(SCOPE_KEY, "") || "");
    mine.foldersShut = new Set(readJson(FOLDERS_KEY, []));
    mine.collapsed = readJson(COLLAPSED_KEY, false) === true;
    mine.injected = [];
    mine.toneOf = "";
    mine.teamPick = "";
    mine.shown = [];
    mine.reading = null;
    mine.next = null;
    mine.lastSel = "";
    mine.painted = new Map();
    mine.lastRead = "";
    mine.ctx = ctx;
    mine.subOpen = null;
    mine.subsShelf = false;
    mine.subsShown = SUBS_SHOWN;
    build(ctx);
    ctx.listen(ctx.root, "click", (event) => clicked(event, ctx));
    ctx.listen(ctx.root, "contextmenu", (event) => { hideTip(); contextMenu(event, ctx); });
    ctx.listen(ctx.root, "pointerover", (event) => hoverTip(event, ctx));
    ctx.listen(ctx.root, "pointerout", (event) => { if (!event.relatedTarget || !ctx.root.contains(event.relatedTarget)) hideTip(); });
    ctx.listen(ctx.root, "pointerdown", hideTip);
    ctx.listen(ctx.root, "scroll", hideTip, true);
    ctx.listen(window, "resize", () => fitMiddles(mine.nodes?.scroll));
    ctx.listen(ctx.root, "pointerdown", dragSidebar);
    ctx.listen(ctx.root, "dblclick", (event) => {
      if (event.target.closest(".tx-grip")) return resetSidebarWidth();
      const hit = event.target.closest(".tx-row[data-key], .tx-crumb-title");
      if (!hit || !ctx.root.contains(hit)) return;
      const key = hit.dataset.key || mine.reading?.key;
      if (!key || key.startsWith("team:")) return;
      closeMenu();
      beginRename(ctx, key);
    });
    ctx.listen(ctx.root, "input", (event) => {
      if (prSideTyped(event.target)) return;
      if (!event.target.classList.contains("tx-q")) return;
      mine.query = event.target.value;
      ctx.render();
    });
    ctx.listen(window, "keyup", (event) => { if (event.key === "Meta" || event.key === "Control") holdJump(false); });
    ctx.listen(window, "blur", () => holdJump(false));
    ctx.listen(document, "click", (event) => { if (mine.menu && !ctx.root.contains(event.target)) closeMenu(); });
    mine.ticker = setInterval(() => { tick(ctx); syncModeToggle(ctx); }, 1000);
    mine.lightsAt = "";
    if (IS_MAC && window.hiveWindow?.placeButtons) ctx.root.classList.add("tx-mac");
    svConvTimeline(timelineOf(ctx));
    repaintSeats();
  },
  leave(ctx) {
    scopeNewChatsBy(null);
    clearInterval(mine.ticker);
    holdJump(false);
    closeMenu();
    closeCustomSnooze();
    hideTip();
    closeSub(null);
    unInject();
    svConvTimeline(null);
    repaintSeats();
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
    mine.rows = new Map(v.all.map((row) => [row.key, row]));
    if (mine.tip && !n.scroll.querySelector(`[data-tip="${CSS.escape(mine.tipKey)}"]`)) hideTip();
    n.wsname.textContent = v.workspace;
    paintTone(ctx);
    paintTools(ctx);
    if (paintInto(n.scroll, listHtml(v, ctx))) fitMiddles(n.scroll);
    if (!mine.renaming) paintInto(n.head, headHtml(v, ctx));
    paintInto(n.blank, blankHtml(v, ctx));
    paintInto(n.details, detailsHtml(v, ctx));
    paintPrSide(ctx);
    paintInto(n.patch, patchHtml(ctx));
    if (v.reading?.session && v.reading.where !== "cloud" && v.reading.path) pullTurns(ctx, v.reading.name, v.reading.turnStamp);
    if (mine.subOpen && mine.subOpen.key !== v.reading?.key) closeSub(null);
    if (v.reading?.session && v.reading.where !== "cloud" && (mine.details || mine.subOpen)) pullSubs(ctx, v.reading.name, v.reading.turnStamp);
    n.details.hidden = !v.reading || !mine.details || !!prSideKey();
    const sub = mine.subOpen && subsOf(mine.subOpen.name).find((one) => one.id === mine.subOpen.id);
    n.host.hidden = !v.reading || !!mine.subOpen;
    n.subhost.hidden = !mine.subOpen;
    paintInto(n.subbar, sub && v.reading ? subBarHtml(sub, v.reading, ctx) : "");
    if (v.reading) ctx.place(v.reading.key, n.host);
    queueMicrotask(() => { dressComposer(ctx, v.reading); placeLights(); syncTimeline(ctx); });
    if (v.reading && v.reading.key !== mine.lastRead) {
      mine.lastRead = v.reading.key;
      const e = structPool.get(v.reading.name);
      if (e) requestAnimationFrame(() => svConvRestore(e));
    } else if (!v.reading) mine.lastRead = "";
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
    if (customSnoozeOpen()) {
      if (event.key !== "Escape") return false;
      closeCustomSnooze();
      return true;
    }
    if (event.key === "Escape" && mine.menu) { closeMenu(); return true; }
    if (event.key === "Enter" && mod && event.target?.classList?.contains("tp-text")) { prSideAct({ dataset: { act: "pr-send" } }, ctx.render); return true; }
    if (event.key === "Escape" && prSideKey() && !ctx.inField()) { closePrSide(); ctx.render(); return true; }
    if (event.key === "Escape" && mine.subOpen && !ctx.inField()) { closeSub(ctx); return true; }
    if (mod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
      const row = mine.shown[Number(event.key) - 1];
      if (!row) return false;
      holdJump(false);
      choose(ctx, row.key);
      return true;
    }
    if (mod && event.shiftKey && !event.altKey && (event.key === "t" || event.key === "T")) return reopenLast();
    if (event.key === "Enter" && mod && !event.shiftKey && !event.altKey) {
      if (mine.reading?.draft) return false;
      const box = composerOf(ctx, mine.reading?.key);
      return !!box && document.activeElement === box && replyAndNext(ctx);
    }
    if (event.key === "Tab" && event.shiftKey && !mod && !event.altKey) {
      const box = composerOf(ctx, mine.reading?.key);
      if (!box || document.activeElement !== box || box.closest(".sv")?.querySelector(".sv-suggest")?.hidden === false) return false;
      if (!planModeOf(mine.reading.name)) return false;
      togglePlanMode(ctx, mine.reading.name);
      return true;
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

export { TIP_DELAY, TIP_WARM, fitMiddles, inbox, prsOf, tipHtml, treeOf };

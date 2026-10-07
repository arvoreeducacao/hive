import { st } from "../state.js";
import { createEffect, createMemo, createRoot, createSignal, batch, untrack, on } from "solid-js";
import { Terminal } from "/vendor/xterm.mjs";
import { FitAddon } from "/vendor/addon-fit.mjs";
import { WebLinksAddon } from "/vendor/addon-web-links.mjs";
import { messageHtml, previewOf, emojiOf } from "/assets/slack-text.mjs";
import { renderMarkdown, renderMarkdownBlocks, liveMarkdown, liveStart, liveStep } from "/assets/markdown.mjs";
import { refuseDrop, isImageName } from "/assets/drops.mjs";
import { commandCounts, commandOf, commandSpot, commandsIn, isNativeCommand, NATIVE_COMMAND_NAMES, withCommand, withoutCommand } from "/assets/slash-command.mjs";
import { mountPet } from "/assets/pets/pets.mjs";
import { mountVisitor } from "/assets/pets/visitor.mjs";
import { DEFAULT_LANGUAGE, LANGUAGES, paintStatic, phrase, speak } from "/assets/i18n.mjs";
import { avatarSvg, avatarFor, BLOB_FACE, parseAvatar, avatarKey, lookDeltas, dealFaces, faceSlot, nearestFree, SLOTS, SHAPES, FACES, COLOURS, WEAR, WEAR_SLOTS, parseWear, wearKey, isDressed, fitsBody } from "/assets/avatar/avatar.mjs";
import { mountPlayer, holdOf, PLAY_IDS } from "/assets/avatar/avatar-play.mjs";
import { fleetMood, playOfMood, MOOD_BREATH, STAYS } from "/assets/mood.mjs";
import { readPage, sayPage, reachRef, chooseOption, lookFor, markUpload, forgetUpload } from "/assets/page-map.mjs";
import { THEME_UI_VARS, THEME_TERM_KEYS, THEME_NAME_MAX, hex6, cleanThemeDef, themeShareJson, parseThemeShare, BUILTIN_THEMES, RAYCAST_THEME } from "/assets/themes.mjs";
import { every, stopBeat, beatOn } from "/assets/pollers.mjs";
import { apiGet, apiPost } from "/assets/api.mjs";
import { makePerf, perfWanted, watchLongTasks } from "/assets/perf.mjs";

window.__hiveState = st;

import("/assets/status-strip.mjs?v=3").catch(() => {});

const perf = makePerf({ mark: perfWanted() ? (name) => performance.mark(name) : undefined });

window.__hivePerf = perf;

watchLongTasks(perf);

const solidMounts = [];

const renderKey = () => JSON.stringify([
  st.data, st.blocks, st.block, st.space, st.spaces, st.open, st.focus, st.typing, st.composing, st.mirrorDev,
  st.seatLayout, ...(raycastOn() ? [st.structure] : []), st.planeOn, st.holding, st.renaming, st.threadChat, st.reviewChat, st.webChat, st.deviceChat, st.cockChat, st.fieldPane, st.LIMIT
]);

const RUNAWAY_RUNS = 50;

function steady(name, run) {
  const [rested, rest] = createSignal(0);
  let runs = 0;
  let since = 0;
  let warned = 0;
  let resting = 0;
  const restOf = (now) => {
    rested();
    if (!resting) resting = setTimeout(() => { resting = 0; rest((n) => n + 1); }, 1001 - (now - since));
  };
  return () => {
    const now = Date.now();
    if (now - since > 1000) { since = now; runs = 0; }
    if (++runs > RUNAWAY_RUNS) {
      restOf(now);
      if (now - warned > 10000) {
        warned = now;
        console.warn(`${name} ran ${runs} times in a second — the writer is in this stack`, new Error().stack);
      }
      return;
    }
    try { run(); } catch (err) {
      restOf(now);
      console.warn(`${name} could not follow the state`, err);
    }
  };
}

const svgIcon = (name) => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;

const screenOpens = () => document.dispatchEvent(new CustomEvent("hive:screen"));

await Promise.all([...(document.body.classList.contains("experience-raycast") ? ['400 12px "Geist Mono"', '700 12px "Geist Mono"'] : []), "400 12px Hack", "700 12px Hack", "italic 400 12px Hack", "italic 700 12px Hack"]
  .map((face) => document.fonts.load(face).catch(() => {})));

st.pet = null;

st.visitor = null;

const LABEL = { needs: "needs you", answered: "answered", working: "working", done: "done", ready: "ready", stalled: "stalled", idle: "idle" };

const PILL_LABEL = { ...LABEL, needs: "needs input", answered: "new reply", stalled: "quiet" };

const GLYPH = { needs: "g-needs", answered: "g-answered", working: "g-working", done: "g-done", ready: "g-ready", stalled: "g-stalled", idle: "g-idle" };

const COLOR = { needs: "var(--accent)", answered: "var(--yellow)", working: "var(--term-dim)", done: "var(--green)", ready: "var(--txt-2)", stalled: "var(--violet)", idle: "var(--txt-3)" };

const STALE_AFTER = 10 * 60 * 1000;

const COOLS_AFTER = 10 * 60 * 1000;

const RAYCAST_COLOR = { needs: "var(--signal)", answered: "var(--blue)", working: "var(--yellow)", done: "var(--green)", ready: "var(--txt-2)", stalled: "var(--yellow)", idle: "var(--txt-3)" };

const stateColor = (state) => (raycastOn() ? RAYCAST_COLOR : COLOR)[state];

const RAYCAST_FONT = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: '"Geist Mono", Hack, ui-monospace, SFMono-Regular, Menlo, monospace'
};

const RAYCAST_TERMINAL = { ...RAYCAST_THEME.def.terminal, cursorAccent: RAYCAST_THEME.def.terminal.background };

const ORDER = { needs: 0, answered: 1, working: 2, done: 3, ready: 4, stalled: 5, idle: 6 };

const BLOCK_SIZE_KEY = "hive.blockSize";

const BLOCK_SIZE_RANGE = [2, 6];

const BLOCK_SIZE_DEFAULT = 4;

function blockSizeSaved() {
  try {
    const n = Math.round(Number(localStorage.getItem(BLOCK_SIZE_KEY)));
    return n >= BLOCK_SIZE_RANGE[0] && n <= BLOCK_SIZE_RANGE[1] ? n : BLOCK_SIZE_DEFAULT;
  } catch { return BLOCK_SIZE_DEFAULT; }
}

st.LIMIT = blockSizeSaved();

const THEME = {
  background: "#0A0A0A", foreground: "#EDEBE7", cursor: "#CD694A", cursorAccent: "#0A0A0A",
  selectionBackground: "#3B2C24",
  black: "#15161E", red: "#F7768E", green: "#4EA96F", yellow: "#E0AF68",
  blue: "#7AA2F7", magenta: "#BB9AF7", cyan: "#7DCFFF", white: "#C6C1B8",
  brightBlack: "#4C463E", brightRed: "#F7768E", brightGreen: "#9ECE6A", brightYellow: "#E0AF68",
  brightBlue: "#7AA2F7", brightMagenta: "#BB9AF7", brightCyan: "#7DCFFF", brightWhite: "#FFFDF9"
};

st.customThemes = {};

st.themeName = "Hive";

st.themePreview = null;

const HIVE_THEME = BUILTIN_THEMES[0];

const builtinTheme = (name) => BUILTIN_THEMES.find((t) => t.name === name);

const themeDef = (name) => builtinTheme(name)?.def || st.customThemes[name] || null;

const wornThemeName = () => (themeDef(st.themeName) ? st.themeName : HIVE_THEME.name);

const fullThemeDef = (def) => ({ ui: { ...HIVE_THEME.def.ui, ...(def?.ui || {}) }, terminal: { ...HIVE_THEME.def.terminal, ...(def?.terminal || {}) } });

function themeCssVars(full) {
  const vars = {};
  for (const [key, cssVar] of Object.entries(THEME_UI_VARS)) vars[cssVar] = full.ui[key];
  vars["--term"] = full.terminal.foreground;
  vars["--term-dim"] = full.ui.txt2;
  vars["--term-bg"] = full.terminal.background;
  return vars;
}

const $ = (id) => document.getElementById(id);

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

st.data = { sessions: [], spawning: [], archived: [], pod: {} };

st.seatsKnown = false;

const unfolded = new Set(JSON.parse(localStorage.getItem("hive.unfolded") || "[]"));

const saveUnfolded = () => localStorage.setItem("hive.unfolded", JSON.stringify([...unfolded]));

const sidesShut = new Set(JSON.parse(localStorage.getItem("hive.sideshut") || "[]"));

const saveSidesShut = () => localStorage.setItem("hive.sideshut", JSON.stringify([...sidesShut]));

const sideShut = (name) => sidesShut.has(name);

const experienceNext = () => document.body.classList.contains("experience-next");

const raycastOn = () => document.body.classList.contains("experience-raycast");

const statusFolded = (name) => (experienceNext() ? sideShut(name) : !unfolded.has(name));

const foldedNow = (name) => (st.open === name ? sideShut(name) : statusFolded(name));

function paintFold(name, el) {
  const tile = el || document.querySelector(`.tile[data-name="${CSS.escape(name)}"]`);
  if (!tile) return;
  const alone = st.open === name;
  const on = foldedNow(name);
  tile.classList.toggle("folded", on);
  const b = tile.querySelector(".t-fold");
  if (b) {
    b.hidden = false;
    b.innerHTML = svgIcon(on ? "i-plus" : "i-minus");
    b.setAttribute("aria-pressed", String(on));
    b.title = on
      ? (alone ? phrase("bring the cards back") : phrase("bring the status back"))
      : (alone ? phrase("fold the cards away — the chat takes the room") : phrase("fold the status away — the terminal takes the room"));
    b.setAttribute("aria-label", b.title);
  }
}

const COMPOSER_MIN = 66;

const SV_ASK = "message this chat — enter sends, shift+enter breaks the line";

const SV_ASK_SLIM = "message this chat";

const finishSeen = (() => {
  try { return JSON.parse(localStorage.getItem("hive.finish.seen") || "{}"); }
  catch { return {}; }
})();

const saveFinishSeen = () => localStorage.setItem("hive.finish.seen", JSON.stringify(finishSeen));

function markFinishSeen(name) {
  const s = st.data.sessions.find((x) => x.name === name);
  if (!s?.finish || finishSeen[name] === s.finish.seq) return false;
  finishSeen[name] = s.finish.seq;
  saveFinishSeen();
  return true;
}

st.audio = null;

st.focus = 0;

st.block = 0;

st.open = null;

st.typing = null;

st.composing = false;

st.sound = false;

st.answeredAlert = false;

st.teamKnocks = true;

const paneOfSeat = new Map();

st.sounds = {};

st.volume = null;

const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");

const MAC_KEYS = {
  new: { meta: true, code: "KeyN" },
  term: { meta: true, code: "KeyT" },
  calls: { alt: true, code: "KeyP" },
  prs: { meta: true, code: "KeyG" },
  threads: { meta: true, code: "KeyS" },
  accounts: { alt: true, code: "KeyA" },
  usage: { meta: true, code: "KeyU" },
  routines: { alt: true, code: "KeyI" },
  meetings: { alt: true, code: "KeyJ" },
  shelf: { alt: true, code: "KeyE" },
  memories: { alt: true, shift: true, code: "KeyM" },
  day: { alt: true, code: "KeyD" },
  tasks: { alt: true, code: "KeyF" },
  history: { alt: true, code: "KeyH" },
  alerts: { alt: true, code: "KeyW" },
  kill: { alt: true, shift: true, code: "KeyW" },
  seat: { meta: true, code: "Digit" },
  block: { alt: true, code: "Digit" },
  space: { meta: true, alt: true, code: "Digit" },
  arrange: { meta: true, alt: true, code: "Digit0" },
  prevBlock: { meta: true, code: "BracketLeft" },
  nextBlock: { meta: true, code: "BracketRight" },
  fullscreen: { meta: true, code: "Enter" },
  type: { code: "Enter" },
  release: { meta: true, code: "Escape" },
  reconnect: { alt: true, code: "KeyR" },
  sound: { alt: true, code: "KeyV" },
  answered: { alt: true, shift: true, code: "KeyV" },
  copy: { alt: true, code: "KeyC" },
  help: { meta: true, code: "Comma" },
  palette: { meta: true, code: "KeyK" },
  openFile: { meta: true, code: "KeyP" },
  searchCode: { meta: true, shift: true, code: "KeyF" },
  compose: { alt: true, code: "KeyM" },
  talk: { alt: true, shift: true, code: "Space" },
  dim: { meta: true, code: "KeyD" },
  bar: { meta: true, code: "KeyB" },
  plane: { alt: true, code: "KeyL" }
};

const CTRL_KEYS = {
  new: { ctrl: true, code: "KeyN" },
  term: { ctrl: true, code: "KeyT" },
  calls: { ctrl: true, code: "KeyP" },
  prs: { ctrl: true, code: "KeyG" },
  threads: { ctrl: true, code: "KeyS" },
  accounts: { ctrl: true, shift: true, code: "KeyA" },
  usage: { ctrl: true, code: "KeyU" },
  routines: { alt: true, code: "KeyI" },
  meetings: { alt: true, code: "KeyJ" },
  shelf: { ctrl: true, shift: true, code: "KeyE" },
  memories: { ctrl: true, alt: true, code: "KeyM" },
  day: { ctrl: true, shift: true, code: "KeyY" },
  tasks: { ctrl: true, alt: true, code: "KeyF" },
  history: { ctrl: true, code: "KeyH" },
  alerts: { ctrl: true, code: "KeyW" },
  kill: { ctrl: true, shift: true, code: "KeyW" },
  seat: { ctrl: true, code: "Digit" },
  block: { alt: true, code: "Digit" },
  space: { ctrl: true, alt: true, code: "Digit" },
  arrange: { ctrl: true, alt: true, code: "Digit0" },
  prevBlock: { ctrl: true, code: "BracketLeft" },
  nextBlock: { ctrl: true, code: "BracketRight" },
  fullscreen: { ctrl: true, code: "Enter" },
  type: { code: "Enter" },
  release: { ctrl: true, code: "Period" },
  reconnect: { ctrl: true, code: "KeyE" },
  sound: { ctrl: true, code: "KeyM" },
  answered: { ctrl: true, shift: true, code: "KeyV" },
  copy: { ctrl: true, shift: true, code: "KeyC" },
  help: { ctrl: true, code: "Comma" },
  palette: { ctrl: true, shift: true, code: "KeyK" },
  openFile: { ctrl: true, shift: true, code: "KeyP" },
  searchCode: { ctrl: true, shift: true, code: "KeyF" },
  compose: { ctrl: true, shift: true, code: "KeyM" },
  talk: { ctrl: true, shift: true, code: "Space" },
  dim: { ctrl: true, shift: true, code: "KeyD" },
  bar: { ctrl: true, shift: true, code: "KeyB" },
  plane: { ctrl: true, shift: true, code: "KeyL" }
};

const UNBOUND_KEYS = { archive: null, detach: null, rename: null, worktrees: null, themes: null, doctor: null, extensions: null, focusLeft: null, focusRight: null, focusUp: null, focusDown: null, moveLeft: null, moveRight: null, moveUp: null, moveDown: null };

const RETIRED_ACTIONS = ["pod", "asked"];

const DEFAULT_KEYS = { ...(IS_MAC ? MAC_KEYS : CTRL_KEYS), ...UNBOUND_KEYS };

const DIGIT_ACTIONS = ["seat", "block", "space"];

const digitSpan = (a) => (a === "block" || a === "space" ? 9 : st.LIMIT);

const DEFAULT_LEADER = { ctrl: true, code: "KeyB" };

const DEFAULT_CHORDS = {
  new: "n", term: "t", calls: "p", prs: "g", threads: "s", usage: "u", routines: "i", meetings: "shift+g", shelf: "e", memories: "shift+m", day: "d", tasks: "shift+f", history: "h", alerts: "w", accounts: "a", kill: "x", extensions: "shift+e",
  worktrees: "k", themes: "shift+t", doctor: "shift+d", rename: "shift+r",
  seat: "digit", focusLeft: "left", focusRight: "right", focusUp: "up", focusDown: "down",
  prevBlock: "[", nextBlock: "]", fullscreen: "f", detach: "o", type: "enter", release: "esc",
  reconnect: "r", sound: "v", answered: "j", copy: "c", help: ",",
  palette: "space", compose: "m", dim: "q", bar: "b", arrange: "l", plane: "y"
};

const DIRECT_MODES = ["keep", "off"];

const OFF_WORDS = ["off", "none", "no", "-"];

const FOCUS_MOVES = { focusLeft: [-1, 0], focusRight: [1, 0], focusUp: [0, -1], focusDown: [0, 1] };

const MOVE_DIRS = { moveLeft: [-1, 0], moveRight: [1, 0], moveUp: [0, -1], moveDown: [0, 1] };

const MOVE_MODES = ["navigate", "type"];

const ACTION_GROUPS = [
  ["chats", "chats and seats", ["new", "term", "calls", "fullscreen", "detach", "rename", "reconnect", "type", "release", "copy", "archive", "kill"]],
  ["screens", "screens and panels", ["palette", "openFile", "searchCode", "prs", "threads", "day", "tasks", "shelf", "memories", "history", "accounts", "extensions", "usage", "routines", "meetings", "worktrees", "themes", "help", "doctor", "alerts", "compose", "bar", "dim"]],
  ["talking", "talking instead of typing", ["talk"]],
  ["moving", "moving around", ["seat", "block", "space", "prevBlock", "nextBlock", "arrange", "plane", "focusLeft", "focusRight", "focusUp", "focusDown", "moveLeft", "moveRight", "moveUp", "moveDown"]],
  ["notices", "notices", ["sound", "answered"]]
];

const ACTION_SAID = {
  new: "new chat",
  term: "new terminal — a plain shell in a seat",
  calls: "next one that needs you",
  fullscreen: "open fullscreen",
  detach: "open the focused chat in a window of its own",
  rename: "rename the focused chat — your name sticks, the AI stops renaming it",
  reconnect: "reconnect the terminal",
  talk: "hold it and talk — let go and the words land in the composer. A quick tap leaves it listening until you tap again",
  type: "type in the focused session (hands over the keyboard)",
  release: "release the terminal keyboard",
  copy: "copy the terminal selection",
  archive: "archive the focused chat — it stops, and comes back the same",
  kill: "kill the focused chat — it stops for good and the seat frees",
  palette: "search anything — sessions, blocks, commands",
  openFile: "open a file — any repo, this machine or the server",
  searchCode: "search the code of every repo",
  prs: "PR panel",
  threads: "the Slack thread this chat came from",
  day: "your day — what you asked for, and what came back",
  tasks: "your tasks — yours, the ones passed to you and the team's",
  shelf: "the shelf — every page this team published",
  memories: "memories — what the team memory holds, and how it grows",
  history: "past sessions (revive)",
  accounts: "providers and accounts — the agents this hive seats, their logins and limits",
  extensions: "extensions — what this hive runs on top of the hive",
  usage: "usage and concurrency",
  routines: "routines — chats that open themselves on a schedule",
  meetings: "meetings — record a conversation, read the notes, see what the team recorded",
  worktrees: "the worktrees on this machine — what every repo is holding, and how much disk",
  themes: "themes — the colours of the app and every terminal in it",
  help: "open the shortcuts and the settings",
  doctor: "check the environment again — runs the doctor and reports what moved",
  alerts: "show / hide the environment alerts",
  compose: "write in the composer under the canvas",
  bar: "the message bar at the bottom",
  dim: "dim the other seats while you type",
  seat: "seat in the block (1…{limit})",
  block: "block in the workspace (1…9)",
  space: "workspace (1…9)",
  prevBlock: "previous block, then the workspace before",
  nextBlock: "next block, then the workspace after",
  arrange: "the floors — every workspace at once, and every block inside it",
  plane: "the plane \u2014 every seat on one field, and you place them",
  focusLeft: "focus the tile on the left",
  focusRight: "focus the tile on the right",
  focusUp: "focus the tile above",
  focusDown: "focus the tile below",
  moveLeft: "move the focused tile left",
  moveRight: "move the focused tile right",
  moveUp: "move the focused tile up",
  moveDown: "move the focused tile down",
  sound: "the chime when a seat needs you",
  answered: "the notice when a seat answers"
};

const ACTIONS = ACTION_GROUPS.flatMap(([, , actions]) => actions.map((a) => [a, ACTION_SAID[a]]));

st.keys = { ...DEFAULT_KEYS };

st.chords = {};

st.leader = null;

st.directMode = "keep";

st.pending = false;

st.whichTimer = null;

st.moveMode = "navigate";

st.capturing = null;

st.holding = null;

st.holdArmed = null;

st.holdTimer = null;

st.explicitKeys = new Set();

st.keysOpen = false;

st.keysFilter = "";

const CODE_NAME = {
  Enter: "Enter", Escape: "Esc", Space: "Space", Tab: "Tab", Backspace: "⌫",
  Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Comma: ",", Period: ".", Semicolon: ";", Quote: "'", Backquote: "`", Minus: "-", Equal: "=",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→"
};

const KEY_WORD = {
  enter: "Enter", esc: "Escape", escape: "Escape", space: "Space", tab: "Tab",
  backspace: "Backspace", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  "/": "Slash", "\\": "Backslash", "[": "BracketLeft", "]": "BracketRight",
  ",": "Comma", ".": "Period", ";": "Semicolon", "'": "Quote", "`": "Backquote", "-": "Minus", "=": "Equal",
  digit: "Digit"
};

const WORD_KEY = Object.fromEntries(Object.entries(KEY_WORD).map(([w, c]) => [c, w]));

const RAW_CODE = {
  pageup: "PageUp", pagedown: "PageDown", home: "Home", end: "End", delete: "Delete", insert: "Insert",
  capslock: "CapsLock", numlock: "NumLock", scrolllock: "ScrollLock", pause: "Pause",
  printscreen: "PrintScreen", contextmenu: "ContextMenu",
  numpadadd: "NumpadAdd", numpadsubtract: "NumpadSubtract", numpadmultiply: "NumpadMultiply",
  numpaddivide: "NumpadDivide", numpaddecimal: "NumpadDecimal", numpadcomma: "NumpadComma",
  numpadequal: "NumpadEqual", numpadenter: "NumpadEnter"
};

const MOD_WORD = { control: "ctrl", ctrl: "ctrl", alt: "alt", option: "alt", opt: "alt", shift: "shift", meta: "meta", cmd: "meta", command: "meta", super: "meta", win: "meta" };

function parseKey(text) {
  const parts = String(text || "").split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const b = {};
  const last = parts.pop();
  for (const p of parts) {
    const mod = MOD_WORD[p.toLowerCase()];
    if (!mod) return null;
    b[mod] = true;
  }
  const low = last.toLowerCase();
  if (KEY_WORD[low]) b.code = KEY_WORD[low];
  else if (/^[a-z]$/.test(low)) b.code = "Key" + low.toUpperCase();
  else if (/^[0-9]$/.test(low)) b.code = "Digit" + low;
  else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(low)) b.code = "F" + low.slice(1);
  else if (/^intl(ro|yen|backslash)$/.test(low)) b.code = "Intl" + low.slice(4, 5).toUpperCase() + low.slice(5);
  else if (RAW_CODE[low]) b.code = RAW_CODE[low];
  else if (/^numpad[0-9]$/.test(low)) b.code = "Numpad" + low.slice(6);
  else if (/^[A-Za-z][A-Za-z0-9]*$/.test(last)) b.code = last;
  else return null;
  return b;
}

function formatKey(b) {
  if (!b || !b.code) return "";
  const parts = [];
  if (b.ctrl) parts.push("ctrl");
  if (b.alt) parts.push("alt");
  if (b.shift) parts.push("shift");
  if (b.meta) parts.push("meta");
  if (WORD_KEY[b.code]) parts.push(WORD_KEY[b.code]);
  else if (b.code.startsWith("Key")) parts.push(b.code.slice(3).toLowerCase());
  else if (/^Digit\d$/.test(b.code)) parts.push(b.code.slice(5));
  else parts.push(b.code);
  return parts.join("+");
}

const isOff = (text) => OFF_WORDS.includes(String(text || "").trim().toLowerCase());

const defaultChord = (action) => parseKey(DEFAULT_CHORDS[action] || "");

const defaultChords = () => Object.fromEntries(Object.keys(DEFAULT_KEYS).map((a) => [a, defaultChord(a)]));

function overrides() {
  const out = {};
  if (st.leader) out.leader = formatKey(st.leader) === formatKey(DEFAULT_LEADER) ? "on" : formatKey(st.leader);
  if (st.directMode !== "keep") out.direct = st.directMode;
  if (st.moveMode !== "navigate") out.move = st.moveMode;
  for (const [action, b] of Object.entries(st.keys)) {
    if (formatKey(b) !== formatKey(DEFAULT_KEYS[action])) out[action] = formatKey(b) || "off";
  }
  for (const [action, b] of Object.entries(st.chords)) {
    if (formatKey(b) !== formatKey(defaultChord(action))) out[`leader.${action}`] = formatKey(b) || "off";
  }
  return out;
}

st.cfgStamp = "";

st.configPath = "~/.hive/config.jsonc";

st.configIgnored = "";

st.fontDefaults = null;

st.fontPrefs = null;

st.look = "classic";

const FONT_TAIL = {
  classic: {
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
  },
  dimension: {
    sans: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: '"Geist Mono", Hack, ui-monospace, SFMono-Regular, Menlo, monospace'
  }
};

const fontTail = (kind) => (FONT_TAIL[st.look] || FONT_TAIL.classic)[kind];

function withTail(value, kind) {
  const stack = value.trim().replace(/,\s*$/, "");
  const has = (name) => stack.toLowerCase().includes(name);
  if (!stack) return fontTail(kind);
  if (kind === "sans" && (has("system-ui") || has("sans-serif"))) return stack;
  if (kind === "mono" && has("monospace")) return stack;
  return `${stack}, ${fontTail(kind)}`;
}

function paintFonts() {
  if (!st.fontPrefs || !st.fontDefaults) return;
  const fill = (id, value) => {
    const el = $(id);
    if (el !== document.activeElement) el.value = value;
  };
  fill("f-sans", st.fontPrefs.sans === st.fontDefaults.sans ? "" : st.fontPrefs.sans);
  fill("f-mono", st.fontPrefs.mono === st.fontDefaults.mono ? "" : st.fontPrefs.mono);
  fill("f-term", st.fontPrefs.terminalSize);
  fill("f-chat-line", st.fontPrefs.chatLineHeight);
  fill("f-chat-gap", st.fontPrefs.chatSpacing);
  $("cfg-path").textContent = st.configPath;
  const ignored = $("cfg-ignored");
  ignored.textContent = st.configIgnored ? phrase("{n} — the default is in use until that line is fixed", { n: st.configIgnored }) : "";
  ignored.hidden = !st.configIgnored;
}

function fontFromPanel() {
  const size = Number($("f-term").value);
  const [low, high] = [8, 32];
  const line = Number($("f-chat-line").value);
  const gap = Number($("f-chat-gap").value);
  return {
    sans: $("f-sans").value.trim() || st.fontDefaults.sans,
    mono: $("f-mono").value.trim() || st.fontDefaults.mono,
    terminalSize: size >= low && size <= high ? Math.round(size) : st.fontDefaults.terminalSize,
    chatLineHeight: line >= 1 && line <= 2.5 ? line : st.fontDefaults.chatLineHeight,
    chatSpacing: gap >= 0 && gap <= 40 ? Math.round(gap) : st.fontDefaults.chatSpacing
  };
}

export { $, ACTION_GROUPS, BLOB_FACE, experienceNext, raycastOn, RAYCAST_COLOR, RAYCAST_FONT, RAYCAST_TERMINAL, RAYCAST_THEME, ACTION_SAID, ACTIONS, apiGet, apiPost, avatarFor, avatarKey, avatarSvg, batch, beatOn, BLOCK_SIZE_DEFAULT, BLOCK_SIZE_KEY, BLOCK_SIZE_RANGE, blockSizeSaved, BUILTIN_THEMES, builtinTheme, chooseOption, cleanThemeDef, CODE_NAME, COLOR, COLOURS, commandCounts, commandOf, commandsIn, commandSpot, COMPOSER_MIN, COOLS_AFTER, createEffect, createMemo, createRoot, CTRL_KEYS, dealFaces, DEFAULT_CHORDS, DEFAULT_KEYS, DEFAULT_LANGUAGE, DEFAULT_LEADER, defaultChord, defaultChords, DIGIT_ACTIONS, digitSpan, DIRECT_MODES, emojiOf, esc, every, FACES, faceSlot, finishSeen, FitAddon, fleetMood, FOCUS_MOVES, FONT_TAIL, fontFromPanel, forgetUpload, formatKey, fullThemeDef, GLYPH, hex6, HIVE_THEME, holdOf, IS_MAC, isImageName, isNativeCommand, isOff, KEY_WORD, LABEL, LANGUAGES, PILL_LABEL, liveMarkdown, liveStart, liveStep, lookDeltas, lookFor, MAC_KEYS, makePerf, markFinishSeen, markUpload, messageHtml, MOD_WORD, MOOD_BREATH, mountPet, mountPlayer, mountVisitor, MOVE_DIRS, NATIVE_COMMAND_NAMES, MOVE_MODES, nearestFree, OFF_WORDS, on, ORDER, overrides, paintFold, paintFonts, paintStatic, paneOfSeat, parseAvatar, parseKey, parseThemeShare, perf, phrase, PLAY_IDS, playOfMood, previewOf, RAW_CODE, reachRef, readPage, refuseDrop, renderKey, renderMarkdown, renderMarkdownBlocks, RETIRED_ACTIONS, RUNAWAY_RUNS, saveFinishSeen, saveSidesShut, saveUnfolded, sayPage, screenOpens, SHAPES, sideShut, sidesShut, SLOTS, solidMounts, speak, st, STALE_AFTER, stateColor, statusFolded, STAYS, steady, stopBeat, SV_ASK, SV_ASK_SLIM, svgIcon, Terminal, THEME, THEME_NAME_MAX, THEME_TERM_KEYS, THEME_UI_VARS, themeCssVars, themeDef, themeShareJson, UNBOUND_KEYS, unfolded, untrack, watchLongTasks, WEAR, WEAR_SLOTS, wearKey, WebLinksAddon, withCommand, withoutCommand, withTail, WORD_KEY, wornThemeName, isDressed, parseWear, fitsBody };

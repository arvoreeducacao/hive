import * as views from "../views.js";
import { paintStrip, render } from "./arrange.js";
import { activeItems } from "./blocks.js";
import { offerFace, paintGate, saveConfig } from "./brand-face.js";
import { setSound } from "./chimes-and-notices.js";
import { BLOB_FACE, createEffect, createRoot, experienceNext, raycastOn, RAYCAST_FONT, RAYCAST_TERMINAL, DEFAULT_KEYS, DEFAULT_LEADER, defaultChords, DIGIT_ACTIONS, DIRECT_MODES, formatKey, fullThemeDef, HIVE_THEME, isOff, MOVE_MODES, on, paintFold, parseAvatar, parseKey, parseWear, phrase, renderKey, RETIRED_ACTIONS, saveSidesShut, saveUnfolded, sidesShut, solidMounts, st, steady, SV_ASK, SV_ASK_SLIM, THEME, themeCssVars, themeDef, unfolded, untrack, withTail, wornThemeName } from "./core.js";
import { paintFaceSheet } from "./face-door.js";
import { renderHistory } from "./history.js";
import { paintHold } from "./hold-numbers.js";
import { disarmLeader, paintKeys, pool } from "./leader-key.js";
import { paintLimPop, paintLimitChip } from "./limit-chip.js";
import { paintBlocks, paintRail, paintTeamRail } from "./mirror.js";
import { paintRailToggle } from "./new-chat.js";
import { paintProviders } from "./providers.js";
import { paintPalPreview } from "./palette.js";
import { paintPlaneMap } from "./plane.js";
import { paintPortaria, paintWorkspace } from "./pod.js";
import { paintChoices } from "./preferences.js";
import { paintComposerTo } from "./seat-layout.js";
import { paintPrButton, paintPrPop } from "./seat-menu.js";
import { paintShelf } from "./shelf.js";
import { structPool } from "./structured-seats.js";
import { paintKnocks, renderMirror } from "./team.js";
import { refit } from "./terminal-history.js";
import { TERM_LOOK } from "./terminal-pool.js";
import { paintThemes } from "./themes.js";
import { paintPrList, paintPrMid } from "./thread.js";
import { paintRelnotes, paintTour } from "./tour.js";
import { paintBrandAvatar, paintSettingsFace } from "./welcome.js";
import { paintWorktreeRail, paintWorktrees } from "./worktrees.js";

function bootSolid() {
  for (const mount of solidMounts) mount(views);
  reactViews();
}

const REACTIVE_PAINTERS = () => [
  paintGate, paintKeys, paintChoices, paintThemes, paintSettingsFace, paintFaceSheet, paintTour, paintRelnotes,
  paintRail, paintTeamRail, paintWorktreeRail, paintRailToggle, paintKnocks, paintBlocks, paintHold, paintComposerTo,
  paintPrButton, paintPrPop, paintLimitChip, paintLimPop, paintPlaneMap, paintPalPreview,
  renderMirror, paintWorktrees, paintWorkspace, paintPortaria, renderHistory, paintPrList, paintPrMid, paintProviders, paintShelf
];

let renderQueued = 0;

function reactViews() {
  createRoot(() => {
    createEffect(on(renderKey, () => {
      if (!st.seatsKnown || renderQueued) return;
      renderQueued = requestAnimationFrame(() => {
        renderQueued = 0;
        untrack(() => render());
      });
    }, { defer: true }));
    for (const paint of REACTIVE_PAINTERS()) {
      const follow = steady(paint.name, paint);
      createEffect(() => {
        if (!st.seatsKnown) return;
        follow();
      });
    }
    const strip = steady("paintStrip", () => paintStrip(st.mirrorDev ? null : st.blocks[st.block], st.mirrorDev ? [] : activeItems()));
    createEffect(() => {
      if (!st.seatsKnown) return;
      strip();
    });
  });
}

function applyTheme() {
  const def = st.themePreview || themeDef(wornThemeName());
  const bare = !st.themePreview && wornThemeName() === HIVE_THEME.name;
  const full = fullThemeDef(def);
  const vars = themeCssVars(full);
  for (const [cssVar, color] of Object.entries(vars)) {
    for (const el of [document.documentElement, document.body]) {
      if (bare) el.style.removeProperty(cssVar);
      else el.style.setProperty(cssVar, color);
    }
  }
  if (!st.themePreview) {
    try { localStorage.setItem("hive.theme.css", bare ? "" : JSON.stringify(vars)); } catch {}
  }
  const raycast = raycastOn();
  for (const el of [document.documentElement, document.body]) {
    if (raycast && !bare) el.style.setProperty("--signal", full.ui.accent);
    else if (el.style.getPropertyValue("--signal")) el.style.removeProperty("--signal");
  }
  const t = raycast && bare ? RAYCAST_TERMINAL : { ...THEME, ...full.terminal, cursorAccent: full.terminal.background };
  TERM_LOOK.theme = t;
  for (const e of pool.values()) {
    e.term.options.theme = t;
    if (e.hist) e.hist.term.options.theme = t;
  }
}

function adoptTheme(r) {
  st.customThemes = r.config.themes || {};
  st.themeName = r.config.theme || HIVE_THEME.name;
  applyTheme();
  paintThemes();
}

function toggleFold(name) {
  const alone = st.open === name;
  const shared = alone || experienceNext();
  const kept = shared ? sidesShut : unfolded;
  if (kept.has(name)) kept.delete(name);
  else kept.add(name);
  if (shared) saveSidesShut();
  else saveUnfolded();
  paintFold(name);
  const e = pool.get(name);
  if (e?.host.isConnected) requestAnimationFrame(() => refit(e));
}

function paintSlim(name, el) {
  const e = structPool.get(name);
  if (!e?.host.isConnected) return;
  const ta = e.host.querySelector(".sv-composer textarea");
  if (!ta) return;
  const slim = raycastOn() || (!el.classList.contains("focused") && !el.classList.contains("open"));
  const says = phrase(slim ? SV_ASK_SLIM : SV_ASK);
  if (ta.placeholder !== says) ta.placeholder = says;
}

function applyBindings(raw) {
  const next = { ...DEFAULT_KEYS };
  const nextChords = defaultChords();
  const bad = [];
  const explicit = new Set();
  let move = "navigate";
  let lead = null;
  let direct = "keep";
  for (const [action, text] of Object.entries(raw || {})) {
    if (RETIRED_ACTIONS.includes(action.startsWith("leader.") ? action.slice(7) : action)) continue;
    if (action === "move") {
      if (MOVE_MODES.includes(text)) move = text;
      else bad.push(`move: ${text}`);
      continue;
    }
    if (action === "direct") {
      if (DIRECT_MODES.includes(text)) direct = text;
      else bad.push(`direct: ${text}`);
      continue;
    }
    if (action === "leader") {
      if (isOff(text)) { lead = null; continue; }
      const word = String(text).trim().toLowerCase();
      const parsed = word === "on" || word === "default" ? { ...DEFAULT_LEADER } : parseKey(text);
      if (!parsed) { bad.push(`leader: ${text}`); continue; }
      if (!parsed.ctrl && !parsed.alt && !parsed.meta) { bad.push(phrase("leader: {text} needs ctrl, alt or meta", { text: text })); continue; }
      lead = parsed;
      continue;
    }
    if (action.startsWith("leader.")) {
      const a = action.slice(7);
      if (!(a in DEFAULT_KEYS)) { bad.push(action); continue; }
      if (isOff(text)) { nextChords[a] = null; continue; }
      const parsed = parseKey(text);
      if (!parsed) { bad.push(`${action}: ${text}`); continue; }
      if (DIGIT_ACTIONS.includes(a) && parsed.code !== "Digit") { bad.push(phrase("{action}: {text} is the 1…9 family, so it takes digit", { action: action, text: text })); continue; }
      nextChords[a] = parsed;
      continue;
    }
    if (!(action in DEFAULT_KEYS)) { bad.push(action); continue; }
    if (isOff(text)) { next[action] = null; continue; }
    const parsed = parseKey(text);
    if (!parsed) { bad.push(`${action}: ${text}`); continue; }
    /* the same check the leader chords always had: a level of the digit family bound to a
       letter would be accepted here and then never fire, because the dispatch only reads it
       through the digit branch. it said nothing and did nothing. */
    if (DIGIT_ACTIONS.includes(action) && parsed.code !== "Digit") {
      bad.push(phrase("{action}: {text} is the 1…9 family, so it takes digit", { action: action, text: text }));
      continue;
    }
    next[action] = parsed;
    explicit.add(action);
  }
  const taken = new Map();
  for (const [action, b] of Object.entries(next)) {
    const label = formatKey(b);
    if (!label) continue;
    const owner = taken.get(label);
    if (owner && explicit.has(action) && !explicit.has(owner)) {
      next[owner] = null;
      taken.set(label, action);
    } else if (owner && !explicit.has(action) && explicit.has(owner)) next[action] = null;
    else if (owner) bad.push(phrase("{label} on {action}: {owner} already has it", { label: label, action: action, owner: owner }));
    else taken.set(label, action);
  }
  if (lead) {
    const label = formatKey(lead);
    const owner = taken.get(label);
    if (owner) bad.push(phrase("{label} on {owner}: the leader already has it", { label: label, owner: owner }));
    const chordTaken = new Map();
    for (const [action, b] of Object.entries(nextChords)) {
      const chord = formatKey(b);
      if (!chord) continue;
      const holder = chordTaken.get(chord);
      if (holder) bad.push(`${label} ${chord} on ${action}: ${holder} already has it`);
      else chordTaken.set(chord, action);
    }
  }
  st.keys = next;
  st.chords = nextChords;
  st.leader = lead;
  st.directMode = direct;
  st.moveMode = move;
  st.explicitKeys = explicit;
  if (!st.leader) disarmLeader();
  return bad;
}

function raycastFonts(font) {
  if (!raycastOn() || !st.fontDefaults) return font;
  return {
    ...font,
    sans: font.sans === st.fontDefaults.sans ? RAYCAST_FONT.sans : font.sans,
    mono: font.mono === st.fontDefaults.mono ? RAYCAST_FONT.mono : font.mono
  };
}

function applyFonts(font) {
  st.fontPrefs = font;
  const worn = raycastFonts(font);
  const mono = withTail(worn.mono, "mono");
  document.documentElement.style.setProperty("--sans", withTail(worn.sans, "sans"));
  document.documentElement.style.setProperty("--mono", mono);
  document.documentElement.style.setProperty("--chat-line", String(font.chatLineHeight));
  document.documentElement.style.setProperty("--chat-gap", `${font.chatSpacing}px`);
  TERM_LOOK.fontFamily = mono;
  TERM_LOOK.fontSize = font.terminalSize;
  for (const e of pool.values()) {
    e.term.options.fontFamily = mono;
    e.term.options.fontSize = font.terminalSize;
    if (e.host.isConnected) refit(e);
  }
}

function migrateStoredSound(r) {
  const stored = localStorage.getItem("hive.sound");
  if (stored === null) return;
  localStorage.removeItem("hive.sound");
  if (r.has?.sound || stored !== "1") return;
  setSound(true, true);
  saveConfig({ sound: true });
}

function adoptAvatar(r) {
  st.configHas = r?.has || {};
  st.configRead = true;
  const saved = parseAvatar(r?.config?.avatar);
  st.myFace = saved && r?.has?.avatar ? saved : null;
  st.myBlob = !!r?.has?.avatar && String(r?.config?.avatar || "").trim() === BLOB_FACE;
  st.myWear = parseWear(r?.config?.wear);
  paintBrandAvatar();
  offerFace();
}

export { REACTIVE_PAINTERS, adoptAvatar, adoptTheme, applyBindings, applyFonts, applyTheme, bootSolid, migrateStoredSound, paintSlim, reactViews, renderQueued, toggleFold };

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  if (st.fontPrefs) applyFonts(st.fontPrefs);
  applyTheme();
});

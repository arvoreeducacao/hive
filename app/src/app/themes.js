import { arrangeOn, closeArrange, openArrange } from "./arrange.js";
import { openWelcome } from "./avatars.js";
import { activeItems, itemOf } from "./blocks.js";
import { keyLabel, saveConfig } from "./brand-face.js";
import { startRename } from "./chat-name.js";
import { DEFAULT_SOUNDS, ensureAudio, openNewestSeatNotice, paintNotices, playSound, setAnswered, setSound, setVolume } from "./chimes-and-notices.js";
import { $, BUILTIN_THEMES, DEFAULT_KEYS, DEFAULT_LEADER, FOCUS_MOVES, HIVE_THEME, MOVE_DIRS, THEME_NAME_MAX, THEME_TERM_KEYS, builtinTheme, defaultChords, esc, fontFromPanel, fullThemeDef, hex6, paintFonts, parseThemeShare, phrase, RAYCAST_THEME, raycastOn, solidMounts, st, svgIcon, themeDef, themeShareJson, wornThemeName } from "./core.js";
import { closeDay, dayOnScreen, openDay } from "./day.js";
import { closeTasks, openTasks, tasksOn } from "./tasks.js";
import { closeTile, goTo, goToBlockAt, goToSeat, goToSpaceAt, openTile, releaseKeyboard, sendSeatToBlockAt, stepBlock, stepFocus, stepMove, stepSendSeat, takeKeyboard } from "./focus-navigation.js";
import { closeHistory, openHistory } from "./history.js";
import { commitKeys, disarmLeader, paintKeys } from "./leader-key.js";
import { closeLimPop, limPopOpen, placeLimPop, pullLimits, toggleLimPop } from "./limit-chip.js";
import { archiveSeatNow, closeMirrorChat, focusedSeat, openMirrorChat } from "./mirror.js";
import { closeProviders, openProviders, providersOnScreen } from "./providers.js";
import { closeExtensions, extensionsOnScreen, openExtensions } from "./extensions.js";
import { closePal, openPal, palOn } from "./palette.js";
import { capsOf, dressHost, followRaycast, footModel, keysHtml, leavePanel, openActions, panelOf, registerPanel, runAction, undressHost } from "./panel-window.js";
import { togglePlane } from "./plane.js";
import { ask } from "./pod.js";
import { setLanguage, setPet } from "./preferences.js";
import { paintAutocompactReach, setAutocompact, setCalm, setDiaryDays, setPref, setQuietDays } from "./pure-helpers.js";
import { discardDraft, draftInFocus, openDraft } from "./draft-seat.js";
import { openComposer, setBlockSize, setLayout } from "./seat-layout.js";
import { closePrPop, placePrPop, prOfChat, prPopOpen, togglePrPop } from "./seat-menu.js";
import { applyFonts, applyTheme } from "./shared.js";
import { closeShelf, openShelf, shelfOnScreen } from "./shelf.js";
import { closeMemories, memoriesOnScreen, openMemories } from "./memories.js";
import { toggleTalking } from "./stt.js";
import { mirrorRow } from "./team.js";
import { copySelection, reconnect, toClipboard } from "./terminal-history.js";
import { closePrs, closeThreadPanel, exitReview, openPrs, openShell, openThreadOf, prsOnScreen, reviewInChat } from "./thread.js";
import { carrySeatOut, closeSeat } from "./tiles.js";
import { closeUsage, openUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, openWorktrees, worktreesOnScreen } from "./worktrees.js";
import { closeRoutines, openRoutines, routinesOnScreen } from "./routines.js";
import { closeMeetings, meetingsOnScreen, openMeetings } from "./meetings.js";
import { paintSettingsFace } from "./welcome.js";

st.themeEditing = null;

const THEME_UI_LABELS = {
  bg: "background", panel: "panel", panel2: "panel raised", panel3: "panel top", well: "well",
  line: "line", line2: "line strong", line3: "line loud",
  txt: "text", txt2: "text dim", txt3: "text faint",
  accent: "accent", accentD: "accent dark", accentHi: "accent high", accentBg: "accent wash",
  green: "green", yellow: "yellow", blue: "blue", violet: "violet"
};

const termColorLabel = (key) => key.replace(/([A-Z])/g, " $1").toLowerCase();

const themesOn = () => $("themes").classList.contains("on");

function showThemeView(which) {
  if (raycastOn()) {
    $("thm-browse").hidden = true;
    if (which === "browse") {
      $("themes").classList.remove("on");
      paintThemes();
      return;
    }
    for (const v of ["edit", "paste"]) $(`thm-${v}`).hidden = v !== which;
    $("themes").classList.add("on");
    return;
  }
  for (const v of ["browse", "edit", "paste"]) $(`thm-${v}`).hidden = v !== which;
}

function openThemes() {
  releaseKeyboard();
  if (raycastOn()) {
    st.themePick = wornThemeName();
    return openHelp("look");
  }
  showThemeView("browse");
  paintThemes();
  $("themes").classList.add("on");
}

function closeThemes() {
  st.themePreview = null;
  st.themeEditing = null;
  applyTheme();
  $("themes").classList.remove("on");
  if (raycastOn()) paintThemes();
}

function backToThemeBrowse() {
  st.themePreview = null;
  st.themeEditing = null;
  applyTheme();
  paintThemes();
  showThemeView("browse");
}

function paintThemes() {
  $("thm-cfg").textContent = st.configPath;
  if (raycastOn()) {
    if ($("thm-count")) $("thm-count").textContent = String(BUILTIN_THEMES.length + Object.keys(st.customThemes).filter((name) => !builtinTheme(name)).length);
    themesSolid.show(themesWindowModel());
    themePreviewSolid?.show(themePreviewModel());
    paintHelpFoot();
    return;
  }
  themesSolid.show(themesViewModel());
}

let themesSolid = null;

let themePreviewSolid = null;

let themesHive = null;

const NEW_THEME_KEY = { alt: true, code: "KeyN" };

const SHARE_THEME_KEY = { meta: true, shift: true, code: "KeyC" };

function themeIsLight(full) {
  const bg = String(full.ui.bg || "").replace("#", "");
  if (bg.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(bg.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.5;
}

const pickedTheme = () => (themeDef(st.themePick) && (builtinTheme(st.themePick) || st.customThemes[st.themePick]) ? st.themePick : wornThemeName());

const wearsRaycast = (name) => name === HIVE_THEME.name;

function themeRowModel(name, def, custom, worn) {
  const full = fullThemeDef(wearsRaycast(name) ? RAYCAST_THEME.def : def);
  return {
    key: name, name, say: wearsRaycast(name) ? RAYCAST_THEME.name : name, custom, worn: name === worn, here: name === pickedTheme(),
    bg: full.ui.bg, panel: full.ui.panel, txt: full.ui.txt, accent: full.ui.accent,
    fresh: wearsRaycast(name), freshSay: phrase("new"),
    tone: themeIsLight(full) ? phrase("light") : phrase("dark"), wearing: phrase("wearing")
  };
}

function themesWindowModel() {
  const worn = wornThemeName();
  return {
    raycast: true,
    rows: BUILTIN_THEMES.map((t) => themeRowModel(t.name, t.def, false, worn)),
    mine: Object.entries(st.customThemes).filter(([name]) => !builtinTheme(name)).map(([name, def]) => themeRowModel(name, def, true, worn)),
    mineSay: phrase("yours"), newSay: phrase("new theme from this one"), newKeys: capsOf(NEW_THEME_KEY)
  };
}

const THEME_CHIPS = [["bg", "the wall"], ["panel", "cards"], ["panel2", "raised"], ["line3", "hairline"], ["txt2", "dim text"], ["accent", "accent colour"], ["signal", "signal colour"], ["accentBg", "accent wash"]];

function themePreviewModel() {
  const name = pickedTheme();
  const full = fullThemeDef(wearsRaycast(name) ? RAYCAST_THEME.def : themeDef(name));
  const ui = { ...full.ui, signal: wearsRaycast(name) ? RAYCAST_THEME.def.terminal.red : full.ui.signal || full.ui.accent };
  return {
    key: name, name: wearsRaycast(name) ? RAYCAST_THEME.name : name, fresh: wearsRaycast(name), freshSay: phrase("new"),
    desc: wearsRaycast(name) ? phrase("Void black behind, ink cards on a key shadow, coral only for the brand and for whoever needs you. Inter in the interface, Geist Mono in the metadata and the terminal.") : "",
    seatSay: phrase("validate publishers"),
    vars: { "--p-bg": ui.bg, "--p-panel": ui.panel, "--p-panel2": ui.panel2, "--p-line": ui.line3, "--p-txt": ui.txt, "--p-txt2": ui.txt2, "--p-txt3": ui.txt3, "--p-accent": ui.accent, "--p-signal": ui.signal, "--p-yellow": ui.yellow },
    seats: [
      { key: "a", name: "fix login redirect", state: "working", say: phrase("working") },
      { key: "b", name: "checkout", state: "needs", say: phrase("needs you") },
      { key: "c", name: "explore refunds", state: "ready", say: phrase("ready") }
    ],
    palette: THEME_CHIPS.map(([key, say]) => ({ key, name: phrase(say), value: hex6(ui[key] || "") }))
  };
}

function pickTheme(name) {
  st.themePick = name;
  paintThemes();
  $("thm-grid").querySelector(`[data-name="${CSS.escape(name)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepTheme(step) {
  const names = [...BUILTIN_THEMES.map((t) => t.name), ...Object.keys(st.customThemes).filter((name) => !builtinTheme(name))];
  const at = names.indexOf(pickedTheme());
  pickTheme(names[(at + step + names.length) % names.length]);
}

function newThemeFromPicked() {
  const name = pickedTheme();
  openThemeEditor(nextFreeThemeName(`${name} (mine)`), themeDef(name), null);
}

function pasteTheme(text) {
  $("thm-json").value = text || "";
  $("thm-paste-err").hidden = true;
  if (text) return keepPastedTheme();
  showThemeView("paste");
  $("thm-json").focus();
}

function themeCardModel(name, def, custom, worn) {
  const full = fullThemeDef(def);
  return {
    key: name, name, custom, here: name === worn,
    bg: full.ui.bg, txt: full.ui.txt, txt2: full.ui.txt2,
    wears: phrase("the hive wears this"), wearing: phrase("wearing"), yours: phrase("yours"),
    dots: [full.ui.accent, full.terminal.red, full.terminal.green, full.terminal.yellow, full.terminal.blue, full.terminal.magenta, full.terminal.cyan]
      .map((colour, at) => ({ key: at, colour })),
    acts: custom
      ? [{ key: "edit", act: "edit", label: phrase("edit") }, { key: "share", act: "share", label: phrase("share") }, { key: "delete", act: "delete", label: phrase("delete") }]
      : [{ key: "tweak", act: "tweak", label: phrase("make it mine") }, { key: "share", act: "share", label: phrase("share") }]
  };
}

function themesViewModel() {
  const worn = wornThemeName();
  const cards = BUILTIN_THEMES.map((t) => themeCardModel(t.name, t.def, false, worn));
  for (const [name, def] of Object.entries(st.customThemes)) if (!builtinTheme(name)) cards.push(themeCardModel(name, def, true, worn));
  return { cards };
}

solidMounts.push((hive) => {
  const grid = $("thm-grid");
  if (!grid) return;
  themesHive = hive;
  themesSolid = hive.mountThemes(grid);
  hive.themeRowActions({ pick: (name) => { pickTheme(name); $("pref-find")?.focus(); }, wear: (name) => setTheme(name), fresh: () => newThemeFromPicked() });
  paintThemes();
});

function setTheme(name) {
  st.themeName = name;
  st.themePick = name;
  st.themePreview = null;
  applyTheme();
  paintThemes();
  saveConfig({ theme: name }).catch(() => {});
}

function saveThemesToConfig(extra) {
  return saveConfig({ themes: st.customThemes, ...(extra || {}) })
    .catch(() => {});
}

function nextFreeThemeName(base) {
  const taken = (name) => builtinTheme(name) || st.customThemes[name];
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base} ${n}`)) return `${base} ${n}`;
}

function shareTheme(name) {
  toClipboard(themeShareJson(name, fullThemeDef(themeDef(name))));
}

async function deleteTheme(name) {
  const yes = await ask(phrase("Delete this theme"), `<b>${esc(name)}</b> ${phrase("goes away from your palettes. A json you already shared keeps living wherever you sent it.")}`, "delete");
  if (!yes) return;
  delete st.customThemes[name];
  if (st.themeName === name) st.themeName = HIVE_THEME.name;
  applyTheme();
  paintThemes();
  saveThemesToConfig({ theme: st.themeName });
}

function themeColorRow(group, key, label, value) {
  const v = hex6(value);
  return `<label class="thm-color"><input type="color" data-group="${group}" data-key="${esc(key)}" value="${v}" /><small><b>${esc(label)}</b><span>${v}</span></small></label>`;
}

function openThemeEditor(name, def, was) {
  st.themeEditing = was || null;
  st.themePreview = fullThemeDef(def);
  $("thm-edit-title").textContent = was ? phrase("Edit theme") : phrase("New theme");
  $("thm-name").value = name;
  $("thm-edit-err").hidden = true;
  $("thm-ui").innerHTML = Object.entries(THEME_UI_LABELS).map(([key, label]) => themeColorRow("ui", key, label, st.themePreview.ui[key])).join("");
  $("thm-terminal").innerHTML = THEME_TERM_KEYS.map((key) => themeColorRow("terminal", key, termColorLabel(key), st.themePreview.terminal[key])).join("");
  applyTheme();
  showThemeView("edit");
}

function saveThemeFromEditor() {
  const name = $("thm-name").value.trim().slice(0, THEME_NAME_MAX);
  const err = $("thm-edit-err");
  const complain = (t) => { err.textContent = t; err.hidden = false; };
  if (!name) return complain("give the theme a name");
  if (builtinTheme(name)) return complain(phrase('"{name}" is a built-in theme — pick another name', { name: name }));
  if (st.themeEditing && st.themeEditing !== name) delete st.customThemes[st.themeEditing];
  st.customThemes[name] = { ui: { ...st.themePreview.ui }, terminal: { ...st.themePreview.terminal } };
  st.themeName = name;
  st.themePreview = null;
  st.themeEditing = null;
  applyTheme();
  paintThemes();
  showThemeView("browse");
  saveThemesToConfig({ theme: name });
}

function keepPastedTheme() {
  const r = parseThemeShare($("thm-json").value);
  const err = $("thm-paste-err");
  if (r.error) { err.textContent = r.error; err.hidden = false; return; }
  err.hidden = true;
  const mine = !builtinTheme(r.name) && st.customThemes[r.name];
  const name = builtinTheme(r.name) ? nextFreeThemeName(r.name) : r.name;
  openThemeEditor(name, r.def, mine ? r.name : null);
}

$("btn-themes").addEventListener("click", () => openThemes());

$("thm-ok").addEventListener("click", closeThemes);

$("themes").addEventListener("click", (e) => { if (e.target === $("themes")) closeThemes(); });

$("thm-new").addEventListener("click", () => openThemeEditor(nextFreeThemeName(`${wornThemeName()} (mine)`), themeDef(wornThemeName()), null));

$("thm-import").addEventListener("click", () => { $("thm-json").value = ""; $("thm-paste-err").hidden = true; showThemeView("paste"); $("thm-json").focus(); });

$("thm-cancel").addEventListener("click", backToThemeBrowse);

$("thm-paste-cancel").addEventListener("click", () => showThemeView("browse"));

$("thm-save").addEventListener("click", saveThemeFromEditor);

$("thm-keep").addEventListener("click", keepPastedTheme);

$("thm-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".thm-card");
  if (!card) return;
  const name = card.dataset.name;
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return setTheme(name);
  if (act === "share") return shareTheme(name);
  if (act === "delete") return deleteTheme(name);
  if (act === "edit") return openThemeEditor(name, st.customThemes[name], name);
  if (act === "tweak") return openThemeEditor(nextFreeThemeName(`${name} (mine)`), themeDef(name), null);
});

$("thm-grid").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".thm-card");
  if (!card || e.target.closest("[data-act]")) return;
  e.preventDefault();
  setTheme(card.dataset.name);
});

document.addEventListener("paste", (e) => {
  if (!raycastOn() || !$("help").classList.contains("on") || helpPane !== "look" || themesOn()) return;
  const text = e.clipboardData?.getData("text") || "";
  if (parseThemeShare(text).error) return;
  e.preventDefault();
  pasteTheme(text);
});

followRaycast((on) => {
  if (on) {
    if ($("help").classList.contains("on")) openHelp();
    return;
  }
  undressHelp();
  if (themesSolid) paintThemes();
});

$("thm-edit").addEventListener("input", (e) => {
  const input = e.target.closest('input[type="color"]');
  if (!input || !st.themePreview) return;
  const v = input.value.toUpperCase();
  st.themePreview[input.dataset.group][input.dataset.key] = v;
  input.parentElement.querySelector("small span").textContent = v;
  applyTheme();
});

function paintShotsUsage() {
  const spot = $("f-shots");
  if (!spot) return;
  fetch("/api/shots/usage").then((r) => r.json()).then((said) => {
    if (!said || said.error) { spot.textContent = ""; return; }
    const mb = Math.round((said.bytes || 0) / (1 << 20));
    spot.textContent = phrase("Right now: {mb} MB in {files} shots across {chats} chats.", { mb, files: said.files || 0, chats: said.chats || 0 });
  }).catch(() => { spot.textContent = ""; });
}

let helpPane = "keyboard";

let helpFootSolid = null;

const PANE_TITLES = { keyboard: "Keyboard", look: "Appearance", performance: "Performance", experimental: "Experiments", dictation: "Dictation", meetings: "Meetings", character: "Your character", notices: "Notices", screen: "The screen", conversation: "The conversation", slack: "Slack" };

const PANE_ICONS = { keyboard: "i-keys", look: "i-image", performance: "i-bolt", experimental: "i-flow", dictation: "i-mic", meetings: "i-quote", character: "i-user", notices: "i-sound", screen: "i-grid", conversation: "i-quote", slack: "i-hash" };

function helpActions() {
  if (helpPane !== "look") {
    return [
      { key: "tour", say: phrase("Setup and tour"), icon: "i-play", go: () => $("t-setup").click() },
      helpPane === "keyboard" ? { key: "reset", say: phrase("Restore default shortcuts"), icon: "i-reload", go: () => $("t-reset").click() } : null
    ];
  }
  const name = pickedTheme();
  const custom = !builtinTheme(name);
  return [
    { key: "wear", say: phrase("Wear"), icon: "i-check", primary: true, off: name === wornThemeName(), go: () => setTheme(name) },
    { key: "share", say: phrase("Share"), icon: "i-copy", combo: SHARE_THEME_KEY, foot: true, go: () => shareTheme(name) },
    { key: "paste", say: phrase("Paste a theme"), icon: "i-quote", combo: { meta: true, code: "KeyV" }, foot: true, go: () => pasteTheme("") },
    { key: "fresh", say: phrase("New theme from this one"), icon: "i-plus", combo: NEW_THEME_KEY, go: newThemeFromPicked },
    custom ? { key: "edit", say: phrase("Edit"), icon: "i-pen", group: phrase("Yours"), go: () => openThemeEditor(name, st.customThemes[name], name) } : null,
    custom ? { key: "delete", say: phrase("Delete"), icon: "i-close", group: phrase("Yours"), go: () => deleteTheme(name) } : null
  ];
}

function helpStep(step) {
  if (helpPane === "look") return stepTheme(step);
  const tabs = [...$("pref-nav").querySelectorAll("button[data-pane]:not([hidden])")];
  const at = tabs.findIndex((tab) => tab.dataset.pane === helpPane);
  const next = tabs[(at + step + tabs.length) % tabs.length];
  if (next) showPrefPane(next.dataset.pane);
}

registerPanel("help", {
  el: () => $("help").querySelector(".box"),
  search: () => $("pref-find"),
  list: () => (helpPane === "look" ? $("thm-grid") : $("pref-nav")),
  actions: helpActions,
  step: helpStep,
  subject: () => (helpPane === "look" ? pickedTheme() : phrase(PANE_TITLES[helpPane] || "Settings"))
});

function paintHelpFoot() {
  helpFootSolid?.show(footModel(panelOf("help"), {
    icon: "i-keys", title: phrase("Settings"),
    trail: [phrase(PANE_TITLES[helpPane] || ""), helpPane === "look" ? phrase("Theme") : ""]
  }));
}

function findSetting(text) {
  const q = text.trim().toLowerCase();
  let first = "";
  for (const tab of $("pref-nav").querySelectorAll("button[data-pane]")) {
    const pane = $("pref-body").querySelector(`.pref-pane[data-pane="${tab.dataset.pane}"]`);
    const hit = !q || `${tab.textContent} ${pane?.textContent || ""}`.toLowerCase().includes(q);
    tab.classList.toggle("miss", !hit);
    if (hit && !first) first = tab.dataset.pane;
  }
  if (q && first && $("pref-nav").querySelector(`button[data-pane="${helpPane}"]`)?.classList.contains("miss")) showPrefPane(first);
}

let lookWas = null;

function dressHelp() {
  const box = $("help").querySelector(".box");
  if (!box || box.classList.contains("pw")) return;
  const say = (text) => esc(phrase(text));
  const reset = $("t-reset"), setup = $("t-setup");
  const tabs = Object.keys(PANE_TITLES).map((pane) => `<button type="button" data-pane="${pane}">${svgIcon(PANE_ICONS[pane])}<span>${say(PANE_TITLES[pane])}</span></button>`).join("");
  dressHost(box, `
    <header class="pw-head" data-no-t>
      <span class="pw-ico">${svgIcon("i-keys")}</span>
      <h2 class="pw-title">${say("Settings")}</h2>
      <span class="pw-vsep"></span>
      <label class="pw-search">${svgIcon("i-mag")}<input id="pref-find" spellcheck="false" autocomplete="off" placeholder="${say("Search a setting — theme, font, shortcut, sound…")}" aria-label="${say("Search a setting — theme, font, shortcut, sound…")}"></label>
      <span class="pw-vsep"></span>
      <span class="pw-hint" id="help-key"></span>
      <button data-pw-keep="h-ok" type="button" class="pw-esc" aria-label="${say("close")}" title="${say("close")}">esc</button>
    </header>
    <div class="pw-body help-body">
      <nav data-pw-keep="pref-nav" class="pref-nav pw-nav">${tabs}</nav>
      <div data-pw-keep="pref-body"></div>
    </div>
    <footer class="pw-foot" id="help-foot" data-no-t></footer>`, {
    on: (dressed) => {
      dressed.classList.add("compact");
      dressed.querySelector("#pref-find").addEventListener("input", (e) => findSetting(e.target.value));
      const keyboard = $("pref-body").querySelector('.pref-pane[data-pane="keyboard"]');
      const tour = document.createElement("div");
      tour.className = "stt-act";
      tour.dataset.pwTour = "";
      keyboard.appendChild(tour);
      lookWas = { reset: [reset, reset.parentNode, reset.nextSibling], setup: [setup, setup.parentNode, setup.nextSibling], children: null };
      tour.append(reset, setup);
      const look = $("pref-body").querySelector('.pref-pane[data-pane="look"]');
      lookWas.children = [...look.childNodes];
      const grid = $("thm-grid"), cfg = $("thm-cfg");
      lookWas.grid = [grid, grid.parentNode, grid.nextSibling];
      lookWas.cfg = [cfg, cfg.parentNode, cfg.nextSibling];
      const list = document.createElement("div");
      list.className = "thm-list";
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", phrase("themes"));
      list.innerHTML = `<div class="pw-sec"><span>${say("Appearance")}</span><span aria-hidden="true">›</span><span>${say("Theme")}</span><span class="n" id="thm-count"></span></div>`;
      list.appendChild(grid);
      const side = document.createElement("div");
      side.className = "thm-side";
      side.innerHTML = `<div class="pw-cap">${say("Preview")}</div><div id="thm-prev" data-no-t></div><p class="hint thm-where">${say("The choice lives in")} <span data-pw-cfg></span>${say(", next to your fonts and shortcuts.")}</p><div class="pw-hr"></div><div class="pw-cap">${say("Fonts and size")}</div>`;
      side.querySelector("[data-pw-cfg]").replaceWith(cfg);
      side.append(...lookWas.children.filter((node) => !(node.nodeType === 1 && node.tagName === "H2")));
      look.classList.add("pref-look");
      look.replaceChildren(list, side);
    },
    off: () => {
      const look = $("pref-body").querySelector('.pref-pane[data-pane="look"]');
      look.classList.remove("pref-look");
      for (const [node, parent, next] of [lookWas.grid, lookWas.cfg, lookWas.reset, lookWas.setup]) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
      look.replaceChildren(...lookWas.children);
      $("pref-body").querySelector("[data-pw-tour]")?.remove();
      lookWas = null;
    }
  });
  box.classList.add("compact");
  if (themesHive) {
    themePreviewSolid ||= themesHive.mountThemePreview($("thm-prev"));
    helpFootSolid ||= themesHive.mountFoot($("help-foot"), {
      actions: { act: (key) => runAction(panelOf("help"), key), more: () => openActions(panelOf("help")) }
    });
  }
  showPrefPane(helpPane);
}

function undressHelp() {
  const box = $("help").querySelector(".box");
  if (!box?.classList.contains("pw")) return;
  themePreviewSolid?.dispose();
  themePreviewSolid = null;
  helpFootSolid?.dispose();
  helpFootSolid = null;
  undressHost(box);
  box.classList.remove("compact");
  delete box.dataset.pane;
  for (const tab of $("pref-nav").querySelectorAll("button")) tab.classList.remove("miss");
  showPrefPane(helpPane);
}

function openHelp(pane) {
  st.cfgFaceOpen = false;
  paintSettingsFace();
  paintAutocompactReach();
  paintShotsUsage();
  if (raycastOn()) {
    dressHelp();
    if (pane) showPrefPane(pane);
    $("help-key").innerHTML = keysHtml(st.keys.help);
    $("help").classList.add("on");
    paintThemes();
    $("pref-find").focus();
    return;
  }
  $("help").classList.add("on");
}

function closeHelp() {
  st.cfgFaceOpen = false;
  if (raycastOn() && $("pref-find")) {
    leavePanel($("help"));
    $("pref-find").value = "";
    findSetting("");
  }
  $("help").classList.remove("on");
  st.capturing = null;
  st.keysOpen = false;
  st.keysFilter = "";
  paintKeys();
}

function showPrefPane(name) {
  helpPane = name;
  for (const pane of $("pref-body").querySelectorAll(".pref-pane")) pane.hidden = pane.dataset.pane !== name;
  for (const tab of $("pref-nav").querySelectorAll("button")) {
    if (tab.dataset.pane === name) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }
  $("pref-body").scrollTop = 0;
  if (raycastOn() && $("help").querySelector(".box").classList.contains("pw")) {
    $("help").querySelector(".box").dataset.pane = name;
    paintHelpFoot();
  }
}

$("pref-nav").addEventListener("click", (e) => {
  const tab = e.target.closest("button[data-pane]");
  if (!tab) return;
  showPrefPane(tab.dataset.pane);
  tab.scrollIntoView({ block: "nearest", inline: "nearest" });
});

showPrefPane("keyboard");

$("h-ok").addEventListener("click", closeHelp);

$("help").addEventListener("click", (e) => { if (e.target === $("help")) closeHelp(); });

$("t-setup").addEventListener("click", () => { $("help").classList.remove("on"); openWelcome("hello"); });

$("t-reset").addEventListener("click", () => {
  st.keys = { ...DEFAULT_KEYS };
  st.explicitKeys = new Set();
  st.chords = defaultChords();
  st.directMode = "keep";
  st.leader = null;
  disarmLeader();
  commitKeys("shortcuts back to default, leader key off");
});

$("p-asked").addEventListener("click", () => { ensureAudio(); playSound(DEFAULT_SOUNDS.asked); });

$("btn-prs").addEventListener("click", (ev) => { ev.stopPropagation(); togglePrPop(); });

$("btn-lim").addEventListener("click", (ev) => { ev.stopPropagation(); toggleLimPop(); });

$("lim-again").addEventListener("click", (ev) => { ev.stopPropagation(); pullLimits(true); });

$("lp-all").addEventListener("click", (ev) => {
  ev.stopPropagation();
  closeLimPop();
  if (!usageOnScreen()) openUsage();
});

document.addEventListener("pointerdown", (ev) => {
  if (!limPopOpen()) return;
  if (ev.target.closest?.("#limpop, #btn-lim, #lim-again")) return;
  closeLimPop();
}, true);

addEventListener("resize", () => { if (limPopOpen()) placeLimPop(); });

$("pp-all").addEventListener("click", (ev) => {
  ev.stopPropagation();
  closePrPop();
  if (!prsOnScreen()) openPrs();
});

document.addEventListener("pointerdown", (ev) => {
  if (!prPopOpen()) return;
  if (ev.target.closest?.("#prpop, #btn-prs")) return;
  closePrPop();
}, true);

addEventListener("resize", () => { if (prPopOpen()) placePrPop(); });

$("s-volume").addEventListener("input", (e) => { st.volume = Number(e.target.value); paintNotices(); });

$("s-volume").addEventListener("change", (e) => {
  setVolume(Number(e.target.value));
  ensureAudio();
  playSound(st.sounds.answered);
});

$("f-lang").addEventListener("change", (e) => setLanguage(e.target.value));

$("f-visual").addEventListener("change", (e) => setCalm(e.target.value !== "full"));

$("f-pet").addEventListener("change", (e) => setPet(e.target.value));

$("f-layout").addEventListener("change", (e) => setLayout(e.target.value));

$("f-size").addEventListener("change", (e) => setBlockSize(e.target.value));

$("f-compact").addEventListener("change", (e) => setAutocompact(e.target.value));

$("f-quiet-days").addEventListener("change", (e) => setQuietDays(e.target.value));

$("f-diary-days").addEventListener("change", (e) => setDiaryDays(e.target.value));

for (const id of ["f-sans", "f-mono", "f-term", "f-chat-line", "f-chat-gap"]) {
  $(id).addEventListener("change", () => {
    if (!st.fontDefaults) return;
    const font = fontFromPanel();
    applyFonts(font);
    paintFonts();
    saveConfig({ font }).catch(() => {});
  });
}

$("help-keys").addEventListener("click", (e) => {
  if (e.target.closest('[data-w="keys-toggle"]')) {
    st.keysOpen = !st.keysOpen;
    paintKeys();
    if (st.keysOpen) $("help-keys").querySelector('[data-w="keys-find"]')?.focus();
    else $("help-keys").scrollIntoView({ block: "nearest" });
    return;
  }
  const cell = e.target.closest("[data-slot]");
  if (!cell) return;
  const want = cell.dataset.slot === "chord" ? `chord:${cell.dataset.action}` : cell.dataset.action;
  st.capturing = st.capturing === want ? null : want;
  paintKeys();
});

$("help-keys").addEventListener("input", (e) => {
  if (!e.target.matches?.('[data-w="keys-find"]')) return;
  st.keysFilter = e.target.value;
  paintKeys();
});

$("help-leader").addEventListener("click", (e) => {
  if (e.target.id === "t-leader") {
    st.leader = st.leader ? null : { ...DEFAULT_LEADER };
    if (!st.leader) disarmLeader();
    return commitKeys(st.leader ? phrase("leader key on: {key} and then one key", { key: keyLabel(st.leader) }) : phrase("leader key off"));
  }
  if (e.target.id === "t-direct") {
    st.directMode = st.directMode === "off" ? "keep" : "off";
    return commitKeys(st.directMode === "off"
      ? phrase("direct shortcuts off — everything goes through {key}", { key: keyLabel(st.leader) })
      : phrase("direct shortcuts back on"));
  }
  const cell = e.target.closest("[data-slot]");
  if (!cell) return;
  st.capturing = st.capturing === "leader" ? null : "leader";
  paintKeys();
});

$("btn-calls").addEventListener("click", () => {
  const s = st.data.sessions.find((x) => x.state === "needs");
  if (s) goTo(s.name);
});

function run(action, digit) {
  switch (action) {
    case "new": return openDraft();
    case "term": return openShell("local");
    case "dim": return setPref("dim", !st.dimOn);
    case "bar": return setPref("bar", !st.barOn);
    case "sound": return setSound(!st.sound);
    case "answered": return setAnswered(!st.answeredAlert);
    case "prs": {
      if (st.threadChat) closeThreadPanel();
      if (st.reviewChat) return exitReview();
      if (prsOnScreen()) return closePrs();
      const target = st.open || activeItems()[st.focus]?.name;
      if (target && prOfChat(target)) return reviewInChat(target);
      return openPrs();
    }
    case "threads": {
      if (st.threadChat) return closeThreadPanel();
      const seat = st.open || activeItems()[st.focus]?.name;
      if (!seat) return;
      return openThreadOf(seat, st.openThread);
    }
    case "usage": return usageOnScreen() ? closeUsage() : openUsage();
    case "routines": return routinesOnScreen() ? closeRoutines() : openRoutines();
    case "meetings": return meetingsOnScreen() ? closeMeetings() : openMeetings();
    case "shelf": return shelfOnScreen() ? closeShelf() : openShelf();
    case "memories": return memoriesOnScreen() ? closeMemories() : openMemories();
    case "day": return dayOnScreen() ? closeDay() : openDay();
    case "tasks": return tasksOn() ? closeTasks() : openTasks();
    case "worktrees": return worktreesOnScreen() ? closeWorktrees() : openWorktrees();
    case "themes":
      if (raycastOn()) return $("help").classList.contains("on") && helpPane === "look" ? closeHelp() : openThemes();
      return themesOn() ? closeThemes() : openThemes();
    case "doctor": return window.hiveDoctorCheck?.();
    case "talk": return void toggleTalking();
    case "calls": {
      if (openNewestSeatNotice()) return;
      const targets = [];
      st.blocks.forEach((b, bi) => b.keys.forEach((c, ci) => {
        if (itemOf(c)?.state === "needs") targets.push({ bi, ci, name: c });
      }));
      if (!targets.length) return;
      const current = targets.findIndex((a) => a.bi === st.block && a.ci === st.focus);
      return goTo(targets[(current + 1) % targets.length].name);
    }
    case "reconnect": {
      const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
      if (it?.kind === "session") reconnect(it.name);
      return;
    }
    case "rename": {
      const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
      if (it?.kind !== "session") return;
      return startRename(it.name);
    }
    case "arrange": return arrangeOn() ? closeArrange() : openArrange();
    case "plane": return togglePlane();
    case "prevBlock": return stepBlock(-1);
    case "nextBlock": return stepBlock(1);
    case "sendPrevBlock": return stepSendSeat(-1);
    case "sendNextBlock": return stepSendSeat(1);
    case "fullscreen": {
      if (st.mirrorDev) {
        if (st.mirrorOpen) return closeMirrorChat();
        const lent = (mirrorRow()?.seats || []).find((x) => x.keyboard?.with === st.team.me);
        if (!lent) return;
        return openMirrorChat(lent.name);
      }
      const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
      if (it?.kind === "session") (st.open === it.name ? closeTile() : openTile(it.name));
      return;
    }
    case "detach": {
      const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
      if (it?.kind !== "session") return;
      return carrySeatOut(it.name);
    }
    case "help": return openHelp();
    case "palette": return palOn() ? closePal() : openPal();
    case "openFile": return openPal("file");
    case "searchCode": return openPal("code");
    case "compose": return openComposer();
    case "accounts": return providersOnScreen() ? closeProviders() : openProviders();
    case "extensions": return extensionsOnScreen() ? closeExtensions() : openExtensions();
    case "history": return $("history").classList.contains("on") ? closeHistory() : openHistory();
    case "archive": return archiveSeatNow(focusedSeat());
    case "kill": {
      const draft = draftInFocus();
      if (draft) {
        if (!draft.sending) discardDraft(draft);
        return;
      }
      const s = focusedSeat();
      if (s) closeSeat(s);
      return;
    }
    case "alerts": return window.hiveAlertsToggle?.();
    case "copy": return copySelection();
    case "type": {
      const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
      if (it?.kind === "session") takeKeyboard(it.name);
      return;
    }
    case "release": return releaseKeyboard();
    case "seat": return goToSeat(digit - 1);
    case "block": return goToBlockAt(digit - 1);
    case "sendBlock": return sendSeatToBlockAt(digit - 1);
    case "space": return goToSpaceAt(digit - 1);
    case "focusLeft":
    case "focusRight":
    case "focusUp":
    case "focusDown": return stepFocus(...FOCUS_MOVES[action]);
    case "moveLeft":
    case "moveRight":
    case "moveUp":
    case "moveDown": return stepMove(...MOVE_DIRS[action]);
  }
}

export { helpActions, pasteTheme, pickTheme, showPrefPane, stepTheme, themePreviewModel, themeRowModel, themesWindowModel, THEME_UI_LABELS, backToThemeBrowse, closeHelp, closeThemes, deleteTheme, keepPastedTheme, nextFreeThemeName, openHelp, openThemeEditor, openThemes, paintThemes, run, saveThemeFromEditor, saveThemesToConfig, setTheme, shareTheme, showThemeView, termColorLabel, themeCardModel, themeColorRow, themesOn, themesSolid, themesViewModel };

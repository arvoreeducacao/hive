import { render } from "./arrange.js";
import { activeItems } from "./blocks.js";
import { IS_MAC, esc, phrase, st } from "./core.js";
import { keyHint } from "./leader-key.js";
import { lucide } from "./lucide.js";

const withKey = (said, action) => (keyHint(action) ? `${said} (${keyHint(action)})` : said);
import { paneShownFor } from "./plane.js";
import { ART_WEBVIEW } from "./subagents-dock.js";
import { openPrSide, prSideAct, prSideDraft, prSideHtml, prSideKey, prSideTyped } from "./pr-side.js";
import { openTile } from "./focus-navigation.js";
import { prOf as prOfLink } from "./context-chips.js";

const STATE_KEY = "hive.sidePanel";
const MAX_KEY = "hive.sidePanel.max";
const WIDTH_KEY = "hive.sidePanel.width";
const WIDTH_MIN = 360;
const CHAT_MIN = 320;
const SHEET_BELOW = 980;
const NAMES_KEPT = 200;
const CLOSED_KEPT = 10;
const DIFF_ID = "diff";
const WEB_ID = "browser";
const PR_PREFIX = "pr:";
const PR_ICONS = { open: "prArrow", merged: "merge", closed: "prClosed", draft: "prDraft" };

const surfaces = new Map();

const isPlain = (value) => !!value && typeof value === "object" && !Array.isArray(value);

const prKeyOfTab = (id) => (typeof id === "string" && id.startsWith(PR_PREFIX) ? id.slice(PR_PREFIX.length) : "");

const prTabOf = (key) => `${PR_PREFIX}${key}`;

const kindOf = (id) => (prKeyOfTab(id) ? "pr" : surfaces.has(id) ? id : "");

const knownTab = (id) => !!kindOf(id);

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; }
}

function cleanEntry(raw) {
  if (!isPlain(raw)) return null;
  const tabs = Array.isArray(raw.tabs) ? [...new Set(raw.tabs.filter((id) => typeof id === "string" && (id.startsWith(PR_PREFIX) || /^[a-z][\w:.-]{0,80}$/.test(id))))] : [];
  const active = tabs.includes(raw.active) ? raw.active : null;
  const closed = Array.isArray(raw.closed) ? raw.closed.filter((id) => typeof id === "string").slice(-CLOSED_KEPT) : [];
  const extra = isPlain(raw.extra) ? raw.extra : {};
  return { open: raw.open === true, active, tabs, closed, extra };
}

function cleanState(raw) {
  const out = {};
  if (!isPlain(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    const entry = cleanEntry(value);
    if (entry) out[name] = entry;
  }
  return out;
}

const panel = {
  byName: cleanState(readJson(STATE_KEY, {})),
  max: readJson(MAX_KEY, false) === true,
  width: Number(readJson(WIDTH_KEY, 0)) || 0,
  lastWeb: "",
  closingWeb: "",
  menu: null,
  nodes: new Map()
};

function stateOf(name, create = false) {
  if (!name) return null;
  if (!panel.byName[name] && create) panel.byName[name] = { open: false, active: null, tabs: [], closed: [], extra: {} };
  return panel.byName[name] || null;
}

function save() {
  const names = Object.keys(panel.byName);
  for (const old of names.slice(0, Math.max(0, names.length - NAMES_KEPT))) delete panel.byName[old];
  try { localStorage.setItem(STATE_KEY, JSON.stringify(panel.byName)); } catch {}
}

const seatOf = (name) => (st.data?.sessions || []).find((one) => one.name === name) || null;

const prsOfSeat = (s) => (st.prs || []).filter((p) => p.session === s?.name && !p.error);

const prOfKey = (key) => (st.prs || []).find((p) => p.key === key) || null;

function registerSurface(def) {
  surfaces.set(def.id, { order: 50, letter: "", ...surfaces.get(def.id), ...def });
}

const surfaceList = () => [...surfaces.values()].sort((a, b) => a.order - b.order);

const surfaceReady = (id, s) => {
  const def = surfaces.get(id);
  return !!def && !!s && (typeof def.ready !== "function" || def.ready(s));
};

const otherPaneOn = (name) => st.cockChat === name || st.deviceChat === name || st.threadChat === name || st.reviewChat === name || st.diffChat === name;

const TILE_ROOM = 680;

function sheetWanted(el) {
  if ((window.innerWidth || 0) <= SHEET_BELOW) return true;
  const width = el?.getBoundingClientRect?.().width || 0;
  return width > 0 && width < TILE_ROOM;
}

const panelShown = (name) => {
  const s = stateOf(name);
  return !!s?.open && paneShownFor(name) && !otherPaneOn(name) && !!seatOf(name);
};

const sidePanelOpenFor = (name) => !!stateOf(name)?.open;


const webWanted = (name) => {
  const s = stateOf(name);
  return !!s?.open && s.active === WEB_ID && paneShownFor(name) && !otherPaneOn(name);
};

function addTab(s, id) {
  if (!s.tabs.includes(id)) s.tabs.push(id);
  s.active = id;
  s.closed = s.closed.filter((one) => one !== id);
}

function dropTab(s, id) {
  const at = s.tabs.indexOf(id);
  if (at < 0) return;
  s.tabs = s.tabs.filter((one) => one !== id);
  s.closed = [...s.closed.filter((one) => one !== id), id].slice(-CLOSED_KEPT);
  if (s.active === id) s.active = s.tabs[Math.min(at, s.tabs.length - 1)] || null;
}

function syncWeb(name) {
  const s = stateOf(name);
  const now = st.webChat || "";
  const was = panel.lastWeb;
  panel.lastWeb = now;
  if (was === name && now !== name) {
    const ours = panel.closingWeb === name;
    panel.closingWeb = "";
    if (!ours && s?.tabs.includes(WEB_ID) && st.open === name) {
      dropTab(s, WEB_ID);
      save();
    }
  }
  if (now === name && was !== name && !webWanted(name)) {
    const mine = stateOf(name, true);
    addTab(mine, WEB_ID);
    mine.open = true;
    save();
    return;
  }
  if (webWanted(name) && ART_WEBVIEW && now !== name) {
    st.webChat = name;
    panel.lastWeb = name;
    queueMicrotask(render);
  }
}

function releaseWeb(name) {
  if (st.webChat !== name) return;
  panel.closingWeb = name;
  st.webChat = null;
}

const sidePanelWebHost = (name) => {
  if (!webWanted(name)) return null;
  return panel.nodes.get(name)?.querySelector('.sp-pane[data-surface="browser"]') || null;
};

function tabHtml(id, active, reachable) {
  const key = prKeyOfTab(id);
  const on = id === active;
  let label = "";
  let face = "";
  let title = "";
  if (key) {
    const p = prOfKey(key);
    const state = p?.state && PR_ICONS[p.state] ? p.state : "open";
    label = p?.tag ? `#${String(p.tag).split("#").pop()}` : phrase("Pull request");
    title = p?.title || label;
    face = `<span class="sp-ti pr-${esc(state)}">${lucide(PR_ICONS[state])}</span>`;
  } else {
    const def = surfaces.get(id);
    const said = typeof def.tabLabel === "function" ? def.tabLabel(seatOf(panel.painting)) : null;
    label = said?.label || phrase(def.label);
    title = said?.title || label;
    face = said?.face || `<span class="sp-ti">${lucide(def.icon)}</span>`;
  }
  return `<div class="sp-tab${on ? " on" : ""}" data-tab="${esc(id)}"><button type="button" role="tab" class="sp-tb" data-act="sp-tab" data-tab="${esc(id)}" aria-selected="${on}" tabindex="${reachable ? 0 : -1}" title="${esc(title)}">${face}<span class="sp-tl">${esc(label)}</span></button><button type="button" class="sp-tx" data-act="sp-close" data-tab="${esc(id)}" tabindex="-1" aria-label="${esc(phrase("Close tab"))}" title="${esc(phrase("Close tab"))}">${lucide("x")}</button></div>`;
}

function launcherHtml(s) {
  const rows = surfaceList().filter((def) => def.launcher !== false).map((def) => {
    const ready = surfaceReady(def.id, s);
    const letter = def.letter ? `<kbd>${esc(def.letter.toUpperCase())}</kbd>` : "";
    const why = !ready && typeof def.whyNot === "function" ? def.whyNot(s) : "";
    return ready
      ? `<button type="button" class="sp-li" data-act="sp-open" data-surface="${esc(def.id)}" data-letter="${esc(def.letter)}">${lucide(def.icon)}<span>${esc(phrase(def.label))}</span>${letter}</button>`
      : `<div class="sp-li off" data-letter="${esc(def.letter)}" aria-disabled="true" title="${esc(why)}">${lucide(def.icon)}<span>${esc(phrase(def.label))}</span>${letter}</div>`;
  });
  const pr = prsOfSeat(s)[0];
  rows.push(pr
    ? `<button type="button" class="sp-li" data-act="sp-open-pr" data-pr="${esc(pr.key)}" data-letter="p">${lucide("prArrow")}<span>${esc(phrase("Pull request"))}</span><kbd>P</kbd></button>`
    : `<div class="sp-li off" data-letter="p" aria-disabled="true" title="${esc(phrase("This chat has no pull request yet"))}">${lucide("prArrow")}<span>${esc(phrase("Pull request"))}</span><kbd>P</kbd></div>`);
  const extras = surfaceList().map((def) => (typeof def.launcherExtra === "function" ? def.launcherExtra(s, () => render()) : "")).join("");
  return `<div class="sp-launch-in"><h3>${esc(phrase("Open a surface"))}</h3><div class="sp-list">${rows.join("")}</div>${extras}</div>`;
}

function mount(el, name, sheet) {
  let node = panel.nodes.get(name);
  const home = sheet ? document.body : el;
  if (node && node.parentElement === home) return node;
  if (node) {
    home.appendChild(node);
    return node;
  }
  node = document.createElement("section");
  node.className = "art sp";
  node.dataset.panelHost = "";
  node.dataset.name = name;
  node.setAttribute("aria-label", phrase("Workspace panel"));
  node.innerHTML = `<div class="sp-bar"><div class="sp-tabs" role="tablist" aria-label="${esc(phrase("Panel tabs"))}"></div><button type="button" class="sp-add sp-ib" data-act="sp-new" aria-label="${esc(phrase("New tab"))}" title="${esc(phrase("New tab"))}">${lucide("plus")}</button><span class="sp-fill"></span><button type="button" class="sp-ib sp-max" data-act="sp-max"></button><button type="button" class="sp-ib" data-act="sp-hide" aria-label="${esc(phrase("Close the panel"))}" title="${esc(withKey(phrase("Close the panel"), "sidePanel"))}">${lucide("x")}</button></div>
    <div class="sp-body" role="tabpanel"><div class="sp-launch" tabindex="-1"></div></div>`;
  node.insertAdjacentHTML("afterbegin", `<div class="sp-grip" role="separator" aria-orientation="vertical" aria-label="${esc(phrase("Resize panel"))}"></div>`);
  node.querySelector(".sp-grip").addEventListener("pointerdown", (event) => dragWidth(event, node));
  node.querySelector(".sp-grip").addEventListener("dblclick", () => keepWidth(node, 0));
  node.addEventListener("click", (event) => clicked(event, name));
  node.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const tab = event.target.closest?.(".sp-tab");
    if (!tab) return;
    event.preventDefault();
    closeTab(name, tab.dataset.tab);
  });
  node.addEventListener("mousedown", (event) => { if (event.button === 1 && event.target.closest?.(".sp-tab")) event.preventDefault(); });
  node.addEventListener("contextmenu", (event) => {
    const tab = event.target.closest?.(".sp-tab");
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    openTabMenu(name, tab.dataset.tab, event.clientX, event.clientY);
  });
  node.addEventListener("change", (event) => {
    const def = surfaces.get(node.querySelector(".sp-body").dataset.kind);
    if (def?.changed?.(event, seatOf(name), stateOf(name, true).extra)) { save(); render(); }
  });
  node.addEventListener("input", (event) => {
    const def = surfaces.get(node.querySelector(".sp-body").dataset.kind);
    def?.typed?.(event, seatOf(name), stateOf(name, true).extra);
  });
  home.appendChild(node);
  panel.nodes.set(name, node);
  return node;
}

function applyWidth(node) {
  const tile = node.closest(".tile");
  if (!tile) return;
  if (panel.width) tile.style.setProperty("--sp-width", `${panel.width}px`);
  else tile.style.removeProperty("--sp-width");
}

function keepWidth(node, width) {
  panel.width = width;
  applyWidth(node);
  try { localStorage.setItem(WIDTH_KEY, JSON.stringify(width)); } catch {}
}

function dragWidth(event, node) {
  if (event.button !== 0) return;
  event.preventDefault();
  const tile = node.closest(".tile");
  const box = tile.getBoundingClientRect();
  node.classList.add("dragging");
  const move = (ev) => {
    const width = Math.round(Math.max(WIDTH_MIN, Math.min(box.right - ev.clientX, box.width - CHAT_MIN)));
    panel.width = width;
    applyWidth(node);
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    node.classList.remove("dragging");
    keepWidth(node, panel.width);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}

function paneOf(node, kind) {
  let pane = node.querySelector(`:scope > .sp-body > .sp-pane[data-surface="${CSS.escape(kind)}"]`);
  if (pane) return pane;
  pane = document.createElement("div");
  pane.className = "sp-pane";
  pane.dataset.surface = kind;
  node.querySelector(".sp-body").appendChild(pane);
  return pane;
}

function paintMaxButton(node) {
  const button = node.querySelector('[data-act="sp-max"]');
  const said = panel.max ? phrase("Restore the panel") : phrase("Maximize the panel");
  const html = lucide(panel.max ? "minimize" : "maximize");
  if (button.dataset.h !== html) { button.innerHTML = html; button.dataset.h = html; }
  button.setAttribute("aria-pressed", String(panel.max));
  button.setAttribute("aria-label", said);
  button.title = withKey(said, "sidePanelMax");
}

function paintSidePanelOfChat(el, s) {
  const name = s.name;
  syncWeb(name);
  const shown = panelShown(name);
  const sheet = shown && sheetWanted(el);
  const node = shown ? mount(el, name, sheet) : panel.nodes.get(name);
  el.classList.toggle("sp-on", shown);
  el.classList.toggle("sp-max", shown && panel.max && !sheet);
  if (!node) return;
  node.hidden = !shown;
  node.classList.toggle("sp-sheet", sheet);
  if (sheet) {
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
  } else {
    node.removeAttribute("role");
    node.removeAttribute("aria-modal");
  }
  paintScrim(el, sheet, name);
  if (!shown) return;
  if (!sheet) el.classList.add("arting");
  applyWidth(node);
  const state = stateOf(name);
  for (const id of [...state.tabs]) if (!knownTab(id)) dropTab(state, id);
  const kind = kindOf(state.active);
  const body = node.querySelector(".sp-body");
  body.dataset.kind = kind;
  panel.painting = name;
  const tabs = node.querySelector(".sp-tabs");
  const reach = state.tabs.includes(state.active) ? state.active : state.tabs[0];
  const tabsHtml = state.tabs.map((id) => tabHtml(id, state.active, id === reach)).join("");
  if (tabs.dataset.h !== tabsHtml) { tabs.innerHTML = tabsHtml; tabs.dataset.h = tabsHtml; }
  paintMaxButton(node);
  const launch = node.querySelector(".sp-launch");
  launch.hidden = !!state.active;
  if (!state.active) {
    const html = launcherHtml(s);
    if (launch.dataset.h !== html) { launch.innerHTML = html; launch.dataset.h = html; }
  }
  for (const pane of node.querySelectorAll(":scope > .sp-body > .sp-pane")) pane.hidden = pane.dataset.surface !== kind;
  if (kind === "pr") paintPrPane(paneOf(node, "pr"), prKeyOfTab(state.active), name);
  else if (kind && kind !== WEB_ID) surfaces.get(kind).paint?.(paneOf(node, kind), s, state.extra, () => render());
  else if (kind === WEB_ID) paneOf(node, WEB_ID);
  panel.painting = "";
}

const scrims = new Map();

function paintScrim(el, on, name) {
  let scrim = scrims.get(name);
  if (!on) { if (scrim) scrim.hidden = true; return; }
  if (!scrim || !scrim.isConnected) {
    scrim = document.createElement("div");
    scrim.className = "sp-scrim";
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", () => toggleSidePanel(name));
    document.body.appendChild(scrim);
    scrims.set(name, scrim);
  }
  scrim.hidden = false;
}

function paintPrPane(pane, key, name) {
  if (prSideKey() !== key) openPrSide(key);
  const { main, compose } = prSideHtml(lucide, () => render());
  let mainHost = pane.querySelector(":scope > .tp > .tp-main");
  let composeHost = pane.querySelector(":scope > .tp > .tp-composehost");
  if (!mainHost) {
    pane.innerHTML = '<div class="tp"><div class="tp-main"></div><div class="tp-composehost"></div></div>';
    mainHost = pane.querySelector(".tp-main");
    composeHost = pane.querySelector(".tp-composehost");
    pane.addEventListener("input", (event) => prSideTyped(event.target));
  }
  const kept = mainHost.querySelector(".tp-body")?.scrollTop || 0;
  if (mainHost.dataset.h !== main) {
    mainHost.innerHTML = main;
    mainHost.dataset.h = main;
    const now = mainHost.querySelector(".tp-body");
    if (now) now.scrollTop = kept;
  }
  if (composeHost.dataset.h !== compose) {
    composeHost.innerHTML = compose;
    composeHost.dataset.h = compose;
    const box = composeHost.querySelector(".tp-text");
    if (box) box.value = prSideDraft();
  }
  pane.dataset.name = name;
}

function focusLauncher(name) {
  const node = panel.nodes.get(name);
  (node?.querySelector(".sp-li:not(.off)") || node?.querySelector(".sp-launch"))?.focus();
}

function focusActiveTab(name) {
  panel.nodes.get(name)?.querySelector(".sp-tab.on .sp-tb")?.focus();
}

function bringUp(name) {
  if (st.open !== name && !paneShownFor(name)) openTile(name, false);
}

function closeOtherPanes(name) {
  if (st.cockChat === name || st.deviceChat === name || st.threadChat === name || st.reviewChat === name || st.diffChat === name) {
    st.cockChat = st.cockChat === name ? null : st.cockChat;
    st.deviceChat = st.deviceChat === name ? null : st.deviceChat;
    st.threadChat = st.threadChat === name ? null : st.threadChat;
    st.reviewChat = st.reviewChat === name ? null : st.reviewChat;
    st.diffChat = st.diffChat === name ? null : st.diffChat;
  }
}

const targetName = () => st.open || activeItems()[st.focus]?.key || "";

function toggleSidePanel(name = targetName()) {
  if (!name || !seatOf(name)) return false;
  const s = stateOf(name, true);
  const node = panel.nodes.get(name);
  const leaving = s.open && !!node?.contains(document.activeElement);
  s.open = !(s.open && panelShown(name));
  if (!s.open) releaseWeb(name);
  if (s.open) {
    closeOtherPanes(name);
    bringUp(name);
  }
  save();
  render();
  if (leaving) document.querySelector(`.tile[data-name="${CSS.escape(name)}"] .chat-bar [data-act="side-panel"]`)?.focus();
  else if (s.open && !s.active) requestAnimationFrame(() => focusLauncher(name));
  return true;
}

function activate(name, id, { focus = true } = {}) {
  const s = stateOf(name, true);
  if (!s) return false;
  const node = panel.nodes.get(name);
  const held = !!node && [...node.querySelectorAll(".sp-bar, .sp-launch")].some((part) => part.contains(document.activeElement));
  if (id !== WEB_ID) releaseWeb(name);
  addTab(s, id);
  s.open = true;
  closeOtherPanes(name);
  bringUp(name);
  save();
  render();
  if (held && focus) requestAnimationFrame(() => focusActiveTab(name));
  return true;
}

function openSurface(name, id, extra = null) {
  const s = seatOf(name);
  if (!s || !surfaceReady(id, s)) return false;
  if (extra) Object.assign(stateOf(name, true).extra, extra);
  return activate(name, id);
}

function toggleSurface(id, name = targetName()) {
  const s = seatOf(name);
  if (!s || !surfaceReady(id, s)) return false;
  const state = stateOf(name, true);
  if (panelShown(name) && state.active === id) return toggleSidePanel(name);
  return activate(name, id);
}

function openPrTab(name, key) {
  if (!name || !key || !seatOf(name)) return false;
  return activate(name, prTabOf(key));
}

function closeTab(name, id) {
  const s = stateOf(name);
  if (!s) return;
  dropTab(s, id);
  if (s.active !== WEB_ID) releaseWeb(name);
  save();
  render();
  requestAnimationFrame(() => (s.active ? focusActiveTab(name) : focusLauncher(name)));
}

function closeTabs(name, which, id) {
  const s = stateOf(name);
  if (!s) return;
  const at = s.tabs.indexOf(id);
  const doomed = which === "others" ? s.tabs.filter((one) => one !== id)
    : which === "right" ? s.tabs.slice(at + 1)
      : which === "all" ? [...s.tabs] : [id];
  for (const one of doomed) dropTab(s, one);
  if (which !== "all" && s.tabs.includes(id)) s.active = id;
  if (s.active !== WEB_ID) releaseWeb(name);
  save();
  render();
  requestAnimationFrame(() => (s.active ? focusActiveTab(name) : focusLauncher(name)));
}

function reopenTab(name) {
  const s = stateOf(name);
  const back = [...(s?.closed || [])].reverse().find((id) => knownTab(id) && (kindOf(id) === "pr" || surfaceReady(id, seatOf(name))));
  if (!back) return false;
  return activate(name, back);
}

function newTab(name) {
  const s = stateOf(name, true);
  if (!s) return;
  s.active = null;
  s.open = true;
  releaseWeb(name);
  closeOtherPanes(name);
  bringUp(name);
  save();
  render();
  requestAnimationFrame(() => focusLauncher(name));
}

function toggleMax(name = targetName()) {
  if (!name || !panelShown(name)) return false;
  panel.max = !panel.max;
  try { localStorage.setItem(MAX_KEY, JSON.stringify(panel.max)); } catch {}
  render();
  requestAnimationFrame(() => panel.nodes.get(name)?.querySelector('[data-act="sp-max"]')?.focus({ preventScroll: true }));
  return true;
}

function closeTabMenu() {
  panel.menu?.remove();
  panel.menu = null;
}

function openTabMenu(name, id, x, y) {
  closeTabMenu();
  const s = stateOf(name);
  if (!s) return;
  const at = s.tabs.indexOf(id);
  const items = [
    ["one", phrase("Close"), IS_MAC ? "⌘W" : "Ctrl+W", true],
    ["others", phrase("Close others"), "", s.tabs.length > 1],
    ["right", phrase("Close to the right"), "", at >= 0 && at < s.tabs.length - 1],
    ["all", phrase("Close all"), "", s.tabs.length > 0]
  ];
  const menu = document.createElement("div");
  menu.className = "sp-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = items.map(([which, label, keys, on]) => `<button type="button" role="menuitem" class="sp-mi" data-which="${which}"${on ? "" : " disabled"}><span>${esc(label)}</span>${keys ? `<kbd>${esc(keys)}</kbd>` : ""}</button>`).join("");
  document.body.appendChild(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - box.height - 4))}px`;
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    const hit = event.target.closest(".sp-mi");
    if (!hit || hit.disabled) return;
    closeTabMenu();
    closeTabs(name, hit.dataset.which, id);
  });
  menu.dataset.name = name;
  menu.addEventListener("keydown", (event) => {
    const all = [...menu.querySelectorAll(".sp-mi:not([disabled])")];
    const at = all.indexOf(document.activeElement);
    if (event.key === "ArrowDown") { event.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
  });
  panel.menu = menu;
  menu.querySelector(".sp-mi:not([disabled])")?.focus();
}

document.addEventListener("pointerdown", (event) => { if (panel.menu && !panel.menu.contains(event.target)) closeTabMenu(); }, true);

function prLink(event, name) {
  const link = event.target.closest?.('.sp-pane[data-surface="pr"] a[href]:not([data-act])');
  if (!link) return false;
  event.preventDefault();
  const pr = prOfLink(link.href);
  if (pr && prOfKey(pr.key) && !event.metaKey && !event.ctrlKey) openPrTab(name, pr.key);
  else window.open(link.href, "_blank", "noopener,noreferrer");
  return true;
}

function clicked(event, name) {
  event.stopPropagation();
  if (prLink(event, name)) return;
  const hit = event.target.closest?.("[data-act]");
  if (!hit) return;
  const act = hit.dataset.act;
  if (act === "sp-tab") return activate(name, hit.dataset.tab);
  if (act === "sp-close") return closeTab(name, hit.dataset.tab);
  if (act === "sp-new") return newTab(name);
  if (act === "sp-max") return toggleMax(name);
  if (act === "sp-hide") return toggleSidePanel(name);
  if (act === "sp-open") return activate(name, hit.dataset.surface);
  if (act === "sp-open-pr") return openPrTab(name, hit.dataset.pr);
  if (act.startsWith("pr-")) {
    if (act === "pr-close") return closeTab(name, stateOf(name)?.active);
    if (act === "pr-open") return;
    event.preventDefault();
    return prSideAct(hit, () => render());
  }
  const state = stateOf(name, true);
  for (const def of surfaces.values()) {
    if (def.acts && def.acts(act, hit, seatOf(name), state.extra, () => { save(); render(); }, event) === true) return;
  }
}

const modOf = (event) => (IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

const editing = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

const TAB_STEPS = { ArrowLeft: -1, ArrowRight: 1 };

function tabKeys(event, node) {
  const from = event.target?.closest?.(".sp-tb");
  if (!from || !node.contains(from) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const all = [...node.querySelectorAll(".sp-tabs .sp-tb")];
  const at = all.indexOf(from);
  let to = -1;
  if (event.key in TAB_STEPS) to = (at + TAB_STEPS[event.key] + all.length) % all.length;
  else if (event.key === "Home") to = 0;
  else if (event.key === "End") to = all.length - 1;
  else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    closeTab(node.dataset.name, from.dataset.tab);
    return true;
  } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    const box = from.getBoundingClientRect();
    event.preventDefault();
    openTabMenu(node.dataset.name, from.dataset.tab, box.left, box.bottom + 4);
    return true;
  }
  if (to < 0) return false;
  event.preventDefault();
  for (const one of all) one.setAttribute("tabindex", one === all[to] ? "0" : "-1");
  all[to].focus();
  return true;
}

function launcherKey(event, node) {
  const launch = node.querySelector(".sp-launch");
  if (!launch || launch.hidden || !launch.contains(document.activeElement) || editing(document.activeElement)) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || String(event.key || "").length !== 1) return false;
  const hit = launch.querySelector(`.sp-li[data-letter="${CSS.escape(String(event.key).toLowerCase())}"]`);
  if (!hit) return false;
  event.preventDefault();
  if (!hit.classList.contains("off")) hit.click();
  return true;
}

function keysInside(event, name) {
  const node = panel.nodes.get(name);
  if (!node) return;
  if (tabKeys(event, node)) return;
  launcherKey(event, node);
}

function inPanelOf(el) {
  const node = el?.closest?.(".art.sp");
  return node?.dataset.name || "";
}

function tabChords(event, name) {
  if (!name || !modOf(event) || event.altKey) return false;
  if (event.key === "Enter" && !event.shiftKey && document.activeElement?.classList?.contains("tp-text")) {
    prSideAct({ dataset: { act: "pr-send" } }, () => render());
    return true;
  }
  if (!event.shiftKey && event.code === "KeyW") {
    const active = stateOf(name)?.active;
    if (active) closeTab(name, active);
    else toggleSidePanel(name);
    return true;
  }
  if (!event.shiftKey && event.code === "KeyT") { newTab(name); return true; }
  if (event.shiftKey && event.code === "KeyT") return reopenTab(name) || true;
  return false;
}

function escapeKeys(event) {
  if (event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (panel.menu) {
    const name = panel.menu.dataset.name;
    closeTabMenu();
    focusActiveTab(name);
    return true;
  }
  const name = inPanelOf(document.activeElement);
  if (!name || !panel.nodes.get(name)?.classList.contains("sp-sheet") || editing(document.activeElement)) return false;
  toggleSidePanel(name);
  return true;
}

function sidePanelKeys(event) {
  if (event.type !== "keydown" || event.repeat) return false;
  if (escapeKeys(event)) return true;
  const name = inPanelOf(document.activeElement);
  return !!name && tabChords(event, name);
}

const plainKey = (event) => !event.metaKey && !event.ctrlKey && !event.altKey && event.key !== "Tab";

const OWN_CONTROLS = ".chat-bar, .chat-ctl";

window.addEventListener("keydown", (event) => {
  if (sidePanelKeys(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const el = document.activeElement;
  if (event.type !== "keydown" || !plainKey(event) || editing(el)) return;
  const name = inPanelOf(el);
  if (name) {
    keysInside(event, name);
    event.stopPropagation();
  } else if (el?.closest?.(OWN_CONTROLS) && (event.key === "Enter" || event.key === " ")) event.stopPropagation();
}, true);

const EDITING_CHORDS = new Set(["KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyY"]);

function keyFromPage(said, name) {
  if (!said || !name) return false;
  const event = { code: String(said.code || ""), key: String(said.key || ""), altKey: !!said.alt, ctrlKey: !!said.ctrl, metaKey: !!said.meta, shiftKey: !!said.shift };
  if (event.key === "Escape") {
    if (!panel.nodes.get(name)?.classList.contains("sp-sheet")) return false;
    return toggleSidePanel(name);
  }
  if (!modOf(event) || EDITING_CHORDS.has(event.code)) return false;
  if (webWanted(name) && tabChords(event, name)) return true;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: event.key, code: event.code, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, bubbles: true, cancelable: true }));
  return true;
}

const sidePanelHoldsWeb = (name) => !!name && webWanted(name);

function sidePanelToggleHtml(name) {
  const on = panelShown(name);
  const said = withKey(phrase("Toggle right panel"), "sidePanel");
  return `<button type="button" class="cb-btn${on ? " on" : ""}" data-act="side-panel" aria-pressed="${on}" aria-label="${esc(phrase("Toggle right panel"))}" title="${esc(said)}">${lucide("panel")}</button>`;
}

registerSurface({
  id: WEB_ID,
  icon: "globe",
  label: "Browser",
  letter: "b",
  order: 20,
  ready: (s) => ART_WEBVIEW && !!s,
  whyNot: () => phrase("The browser only opens in the Hive app")
});

export { DIFF_ID, WEB_ID, closeTabs, keyFromPage, sidePanelHoldsWeb, openPrTab, openSurface, paintSidePanelOfChat, registerSurface, reopenTab, sidePanelKeys, sidePanelOpenFor, sidePanelToggleHtml, sidePanelWebHost, toggleMax, toggleSidePanel, toggleSurface };

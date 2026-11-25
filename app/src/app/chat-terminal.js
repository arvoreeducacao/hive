import { render } from "./arrange.js";
import { openWebPage } from "./chat-and-panes.js";
import { registerChatControl } from "./chat-bar.js";
import { keyLabel } from "./brand-face.js";
import { confirmBefore } from "./confirmations.js";
import { IS_MAC, esc, phrase, st } from "./core.js";
import { openTile } from "./focus-navigation.js";
import { putInComposer, terminalExcerpt } from "./file-mentions.js";
import { pool, tiles } from "./leader-key.js";
import { lucide } from "./lucide.js";
import { ask } from "./pod.js";
import { runningTerminalSay, runningTerminalsOf } from "./running-terminals.js";
import { getTerminal, routeTerminalLinks } from "./terminal-pool.js";
import { dropTerminal, mount, observer, onWheel, refit } from "./terminal-history.js";
import { keepTerminalKeys, terminalNavKey } from "./terminal-keys.js";
import { openTerminalMenu } from "./terminal-menu.js";
import { paintWithTiles } from "./tile-extras.js";
import { chordOf, shortcutText, withShortcut } from "./chat-terminal-keys.js";
import { MAX_PER_GROUP, SIDE_BY_SIDE, STACKED, activateTerminal, activeGroup, groupHeadersShown, groupWord, nextNumber, normalizeGroups, placeTerminal, removeTerminal, renameTerminal, splitFull, terminalNamed, visibleNames } from "./chat-terminal-groups.js";

const STATE_KEY = "hive.chatTerminal";
const HEIGHT_DEFAULT = 280;
const HEIGHT_MIN = 180;
const HEIGHT_STEP = 24;
const HEIGHT_SHARE = 0.75;
const CHAT_ROOM = 160;
const BORN_GRACE = 20000;
const DROPPED_GRACE = 20000;
const MISSING_GRACE = 8000;
const STRAY_RETRY = 10000;
const CHATS_KEPT = 200;
const SEND_WAIT = 15000;
const SEND_POLL = 100;
const SEND_SETTLE = 800;

const OWN_ICONS = {
  splitRow: '<path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"/><path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"/><line x1="12" x2="12" y1="4" y2="20"/>',
  splitColumn: '<path d="M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3"/><path d="M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3"/><line x1="4" x2="20" y1="12" y2="12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>'
};

const icon = (name, cls = "") => (OWN_ICONS[name]
  ? `<svg class="lu${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${OWN_ICONS[name]}</svg>`
  : lucide(name, cls));

const keyText = (code, shift = false) => shortcutText(code, { mac: IS_MAC, shift });

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; }
};

const isPlain = (value) => !!value && typeof value === "object" && !Array.isArray(value);

const freshEntry = (name, n) => ({ name, n, pending: false, bornAt: 0, seen: false, missingSince: 0, killing: false, asking: false, waiting: [] });

const emptyState = () => ({ open: false, height: HEIGHT_DEFAULT, terminals: [], groups: [], active: "", error: "", dropped: new Map() });

function cleanTerminals(value) {
  const listed = Array.isArray(value.terminals) ? value.terminals : [];
  const out = [];
  for (const one of listed) {
    const name = typeof one?.name === "string" ? one.name : "";
    if (!name || out.some((kept) => kept.name === name)) continue;
    const n = Number(one.n);
    out.push(freshEntry(name, Number.isInteger(n) && n > 0 && !out.some((kept) => kept.n === n) ? n : 0));
  }
  for (const one of out) if (!one.n) one.n = nextNumber({ terminals: out.filter((kept) => kept.n) });
  return out;
}

const cleanGroups = (value) => (Array.isArray(value.groups) ? value.groups.filter(isPlain).map((group) => ({
  id: typeof group.id === "string" ? group.id : "",
  dir: group.dir === STACKED ? STACKED : SIDE_BY_SIDE,
  names: Array.isArray(group.names) ? group.names.filter((name) => typeof name === "string") : []
})) : []);

function cleanState(raw) {
  const out = {};
  if (!isPlain(raw)) return out;
  for (const [chat, value] of Object.entries(raw)) {
    if (!isPlain(value)) continue;
    const height = Number(value.height);
    out[chat] = normalizeGroups({
      ...emptyState(),
      open: value.open === true,
      height: Number.isFinite(height) && height > 0 ? height : HEIGHT_DEFAULT,
      terminals: cleanTerminals(value),
      groups: cleanGroups(value),
      active: typeof value.active === "string" ? value.active : ""
    });
  }
  return out;
}

const drawer = {
  byChat: cleanState(readJson(STATE_KEY, {})),
  nodes: new Map(),
  recheck: 0
};

function stateOf(chat, create = false) {
  if (!chat) return null;
  if (!drawer.byChat[chat] && create) drawer.byChat[chat] = emptyState();
  return drawer.byChat[chat] || null;
}

function keptOf(s) {
  const terminals = s.terminals.filter((one) => !one.pending);
  const names = new Set(terminals.map((one) => one.name));
  return {
    open: s.open,
    height: s.height,
    active: names.has(s.active) ? s.active : terminals[0]?.name || "",
    terminals: terminals.map((one) => ({ name: one.name, n: one.n })),
    groups: s.groups.map((group) => ({ id: group.id, dir: group.dir, names: group.names.filter((name) => names.has(name)) })).filter((group) => group.names.length)
  };
}

function save() {
  const chats = Object.keys(drawer.byChat);
  for (const old of chats.slice(0, Math.max(0, chats.length - CHATS_KEPT))) delete drawer.byChat[old];
  const kept = Object.fromEntries(Object.entries(drawer.byChat).map(([chat, s]) => [chat, keptOf(s)]));
  try { localStorage.setItem(STATE_KEY, JSON.stringify(kept)); } catch {}
}

const seatOf = (chat) => (st.data?.sessions || []).find((one) => one.name === chat) || null;

const ownsTerminal = (s) => !!s?.name && !!s.structured && s.where !== "cloud" && !s.of && s.kind !== "shell";

function homeOf(chat) {
  const seat = seatOf(chat);
  return seat?.trees?.find((tree) => tree.path)?.path || seat?.cwd || "";
}

const readNow = (chat) => st.open === chat;

const sheetOpen = () => !!document.querySelector(".art.sp.sp-sheet:not([hidden])");

const nothingFocused = () => !document.activeElement || document.activeElement === document.body;

const drawerShown = (chat) => {
  const node = drawer.nodes.get(chat);
  return !!node && node.isConnected && !node.hidden;
};

function recheckLater(wait) {
  if (drawer.recheck) return;
  drawer.recheck = setTimeout(() => {
    drawer.recheck = 0;
    render();
  }, wait + 100);
}

const strayTried = new Map();

const dropName = (s, name) => s.dropped.set(name, { goneSince: 0 });

function settleStrays(chat, s, local, now) {
  if (!st.seatsKnown) return false;
  const listed = new Set(local.map((one) => one.name));
  for (const [name, mark] of [...s.dropped]) {
    if (listed.has(name)) {
      mark.goneSince = 0;
      continue;
    }
    mark.goneSince ||= now;
    if (now - mark.goneSince < DROPPED_GRACE) {
      recheckLater(DROPPED_GRACE - (now - mark.goneSince));
      continue;
    }
    s.dropped.delete(name);
    strayTried.delete(name);
  }
  let changed = false;
  for (const one of local) {
    if (one.of !== chat || one.dropping || terminalNamed(s, one.name)) continue;
    if (!s.dropped.has(one.name)) {
      const entry = freshEntry(one.name, nextNumber(s));
      entry.seen = true;
      const active = s.active;
      placeTerminal(s, entry, "new");
      if (active) s.active = active;
      changed = true;
      continue;
    }
    if (now - (strayTried.get(one.name) || 0) < STRAY_RETRY) {
      recheckLater(STRAY_RETRY);
      continue;
    }
    strayTried.set(one.name, now);
    killShell(one.name).then((gone) => { if (!gone) recheckLater(STRAY_RETRY); });
  }
  return changed;
}

function endedTerminal(one, listed, now) {
  if (one.pending || one.killing) return false;
  if (listed.has(one.name)) {
    one.seen = true;
    one.missingSince = 0;
    return false;
  }
  if (!st.seatsKnown) return false;
  if (!one.seen && now - (one.bornAt || 0) < BORN_GRACE) {
    recheckLater(BORN_GRACE - (now - one.bornAt));
    return false;
  }
  if (one.seen) {
    one.missingSince ||= now;
    if (now - one.missingSince < MISSING_GRACE) {
      recheckLater(MISSING_GRACE - (now - one.missingSince));
      return false;
    }
  }
  return true;
}

function reconcileChat(chat) {
  const s = stateOf(chat);
  if (!s) return "";
  const local = (st.data?.sessions || []).filter((one) => one.where !== "cloud");
  const listed = new Set(local.map((one) => one.name));
  const now = Date.now();
  let changed = settleStrays(chat, s, local, now);
  let ended = "";
  const gone = s.terminals.filter((one) => endedTerminal(one, listed, now));
  if (gone.length) {
    for (const one of gone) {
      removeTerminal(s, one.name);
      dropTerminal(one.name);
    }
    if (!s.terminals.length) s.open = false;
    changed = true;
    ended = s.terminals.length ? "moved" : "closed";
  }
  if (changed) save();
  return ended;
}

async function killShell(name) {
  try {
    const res = await fetch("/api/kill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, where: "local" }) });
    const said = await res.json().catch(() => ({}));
    return res.ok !== false && !said?.error;
  } catch {
    return false;
  }
}

const freshShellName = () => `sh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function startShell(chat, s, mode = "new", dir = SIDE_BY_SIDE) {
  const entry = { ...freshEntry(freshShellName(), nextNumber(s)), pending: true };
  if (!placeTerminal(s, entry, mode, dir)) return null;
  s.error = "";
  openShellFor(chat, s, entry);
  return entry;
}

async function openShellFor(chat, s, entry) {
  const asked = entry.name;
  let answer = null;
  try {
    const res = await fetch("/api/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ where: "local", name: asked, of: chat, cwd: homeOf(chat) }) });
    answer = await res.json();
  } catch {
    answer = { error: "the terminal could not be opened" };
  }
  if (answer?.cancelled) return;
  if (terminalNamed(s, asked) !== entry) {
    if (answer?.name && !terminalNamed(s, answer.name)) {
      dropName(s, answer.name);
      if (!(await killShell(answer.name))) recheckLater(STRAY_RETRY);
    }
    return;
  }
  const wasHere = !!drawer.nodes.get(chat)?.contains(document.activeElement);
  if (answer?.error || !answer?.name) {
    removeTerminal(s, asked);
    s.error = answer?.error || "the terminal could not be opened";
  } else {
    if (answer.name !== asked && terminalNamed(s, answer.name)) removeTerminal(s, asked);
    else renameTerminal(s, asked, answer.name);
    Object.assign(entry, { pending: false, bornAt: Date.now(), seen: false, missingSince: 0 });
  }
  save();
  render();
  if (entry.pending) return;
  for (const text of entry.waiting.splice(0)) sendWhenReady(answer.name, text);
  if (s.active === entry.name && drawerShown(chat) && (wasHere || nothingFocused())) focusShell(chat);
}

function sendWhenReady(name, text, waited = 0) {
  const e = pool.get(name);
  if (e?.ws?.readyState === 1 && Date.now() - (e.since || 0) >= SEND_SETTLE) {
    e.ws.send(text);
    return;
  }
  if (waited >= SEND_WAIT) return;
  setTimeout(() => sendWhenReady(name, text, waited + SEND_POLL), SEND_POLL);
}

function paneNamed(node, name) {
  return [...node.querySelectorAll(".ct-pane")].find((pane) => pane.dataset.name === name) || null;
}

function focusShell(chat) {
  const s = stateOf(chat);
  const node = drawer.nodes.get(chat);
  const one = s ? terminalNamed(s, s.active) : null;
  if (!one || !node || node.hidden) return;
  const pane = paneNamed(node, one.name);
  pane?.focus({ preventScroll: true });
  if (one.pending) return;
  const e = getTerminal({ name: one.name, where: "local" });
  const go = () => requestAnimationFrame(() => {
    if (!pane || document.activeElement === pane || nothingFocused()) e.term.focus();
  });
  if (typeof e.term.ready === "function") e.term.ready(go);
  else go();
}

function focusComposer(chat) {
  tiles.get(chat)?.querySelector(".sv-composer textarea")?.focus();
}

function newPane(chat, name) {
  const pane = document.createElement("div");
  pane.className = "ct-pane";
  pane.dataset.name = name;
  pane.tabIndex = -1;
  pane.setAttribute("role", "group");
  pane.innerHTML = '<div class="ct-well"></div><div class="ct-pane-say" role="status" hidden></div>';
  pane.addEventListener("pointerdown", () => pickTerminal(chat, pane.dataset.name, false));
  pane.addEventListener("focusin", () => pickTerminal(chat, pane.dataset.name, false));
  const well = pane.querySelector(".ct-well");
  well.addEventListener("wheel", (ev) => {
    const e = well.dataset.name ? pool.get(well.dataset.name) : null;
    if (e) onWheel(e, ev);
  }, { capture: true, passive: false });
  pane.addEventListener("contextmenu", (ev) => {
    const e = pool.get(pane.dataset.name);
    if (!e) return;
    ev.preventDefault();
    ev.stopPropagation();
    openTerminalMenu(e, ev.clientX, ev.clientY, () => e.term.focus(), { addToChat: (text) => putInComposer(chat, terminalExcerpt(text), { block: true }) });
  });
  return pane;
}

function paintPanes(node, chat, s) {
  const panes = node.querySelector(".ct-panes");
  const names = visibleNames(s);
  const stacked = activeGroup(s)?.dir === STACKED;
  panes.classList.toggle("stacked", stacked);
  panes.style.gridTemplateColumns = stacked ? "" : `repeat(${names.length || 1}, minmax(0, 1fr))`;
  panes.style.gridTemplateRows = stacked ? `repeat(${names.length || 1}, minmax(0, 1fr))` : "";
  const byName = new Map([...panes.children].map((pane) => [pane.dataset.name, pane]));
  for (const [name, pane] of byName) {
    if (names.includes(name)) continue;
    const well = pane.querySelector(".ct-well");
    if (well.dataset.name) observer.unobserve(well);
    pane.remove();
  }
  names.forEach((name, at) => {
    const pane = byName.get(name) || newPane(chat, name);
    if (panes.children[at] !== pane) panes.insertBefore(pane, panes.children[at] || null);
  });
  for (const name of names) {
    const one = terminalNamed(s, name);
    const pane = paneNamed(node, name);
    pane.classList.toggle("on", name === s.active && names.length > 1);
    pane.setAttribute("aria-label", phrase("Terminal {n}", { n: one.n }));
    const well = pane.querySelector(".ct-well");
    const say = pane.querySelector(".ct-pane-say");
    if (one.pending) {
      if (well.dataset.name) observer.unobserve(well);
      well.dataset.name = "";
      well.replaceChildren();
      say.hidden = false;
      say.textContent = phrase("Starting the terminal…");
      continue;
    }
    say.hidden = true;
    const e = getTerminal({ name, where: "local" });
    if (well.dataset.name !== name) {
      if (well.dataset.name) observer.unobserve(well);
      well.dataset.name = name;
      observer.observe(well);
    }
    if (e.host.parentElement !== well) {
      well.replaceChildren();
      mount(e, well);
    }
  }
}

function sideHtml(s) {
  const headers = groupHeadersShown(s);
  return s.groups.map((group) => {
    const holdsActive = group.names.includes(s.active);
    const lead = holdsActive ? s.active : group.names[0];
    const word = phrase(groupWord(group));
    const head = headers
      ? `<button type="button" class="ct-group${holdsActive ? " on" : ""}" data-act="ct-pick" data-name="${esc(lead)}" aria-label="${esc(phrase("{word}, {n} terminals", { word, n: group.names.length }))}">${icon(group.names.length < 2 ? "square" : group.dir === STACKED ? "splitColumn" : "splitRow")}<span class="ct-group-word">${esc(word)}</span><span class="ct-count" aria-hidden="true">${group.names.length}</span></button>`
      : "";
    const rows = group.names.map((name) => {
      const one = terminalNamed(s, name);
      const label = phrase("Terminal {n}", { n: one.n });
      const on = name === s.active;
      const close = withShortcut(phrase("Close {name}", { name: label }), on ? keyText("W") : "");
      return `<div class="ct-tab${on ? " on" : ""}" role="listitem"><button type="button" class="ct-tab-x" data-act="ct-close" data-name="${esc(name)}" aria-label="${esc(close)}" title="${esc(close)}">${icon("terminal", "ct-tab-icon")}${icon("x", "ct-tab-close")}</button><button type="button" class="ct-tab-name" data-act="ct-pick" data-name="${esc(name)}"${on ? ' aria-current="true"' : ""}>${esc(label)}</button></div>`;
    }).join("");
    return `<div class="ct-set">${head}<div class="ct-list" role="list">${rows}</div></div>`;
  }).join("");
}

function paintSide(node, s) {
  const side = node.querySelector(".ct-side");
  const many = s.terminals.length > 1;
  side.hidden = !many;
  node.classList.toggle("ct-many", many);
  const html = many ? sideHtml(s) : "";
  if (side.dataset.html === html) return;
  const was = side.contains(document.activeElement) ? document.activeElement : null;
  const keep = was ? [was.dataset.act, was.dataset.name] : null;
  side.dataset.html = html;
  side.innerHTML = html;
  if (!keep) return;
  const again = [...side.querySelectorAll("button")].find((one) => one.dataset.act === keep[0] && one.dataset.name === keep[1])
    || side.querySelector(".ct-tab.on .ct-tab-name")
    || side.querySelector("button");
  (again || node.querySelector(".ct-x"))?.focus();
}

function labelAct(button, said, disabled = false) {
  button.setAttribute("aria-label", said);
  button.title = said;
  if (disabled) button.setAttribute("aria-disabled", "true");
  else button.removeAttribute("aria-disabled");
}

function paintBar(node, chat, s) {
  const title = node.querySelector(".ct-title");
  const failed = !!(s.terminals.length && s.error);
  const folder = homeOf(chat).replace(/^\/(?:Users|home)\/[^/]+/, "~");
  title.textContent = failed ? phrase(s.error) : "";
  title.classList.toggle("bad", failed);
  title.setAttribute("role", failed ? "alert" : "presentation");
  node.setAttribute("aria-label", folder ? `${phrase("Terminal")} · ${folder}` : phrase("Terminal"));
  const full = splitFull(s);
  const max = { n: MAX_PER_GROUP };
  const acts = node.querySelector(".ct-acts");
  labelAct(acts.querySelector('[data-act="ct-split"]'), full ? phrase("Split Terminal Horizontally (max {n} per group)", max) : withShortcut(phrase("Split Terminal Horizontally"), keyText("D")), full);
  labelAct(acts.querySelector('[data-act="ct-split-down"]'), full ? phrase("Split Terminal Vertically (max {n} per group)", max) : withShortcut(phrase("Split Terminal Vertically"), keyText("D", true)), full);
  labelAct(acts.querySelector('[data-act="ct-new"]'), withShortcut(phrase("New Terminal"), keyText("N")));
  labelAct(acts.querySelector('[data-act="ct-kill"]'), withShortcut(phrase("Close Terminal"), keyText("W")));
}

function heightCap(well) {
  const room = well?.getBoundingClientRect().height || window.innerHeight;
  return Math.max(HEIGHT_MIN, Math.min(window.innerHeight * HEIGHT_SHARE, room - CHAT_ROOM));
}

const clampHeight = (well, height) => Math.round(Math.max(HEIGHT_MIN, Math.min(heightCap(well), height)));

function applyHeight(node, s) {
  const well = node.parentElement;
  if (!well) return;
  const height = clampHeight(well, s.height);
  well.style.setProperty("--ct-height", `${height}px`);
  const grip = node.querySelector(".ct-grip");
  grip.setAttribute("aria-valuenow", String(height));
  grip.setAttribute("aria-valuemin", String(HEIGHT_MIN));
  grip.setAttribute("aria-valuemax", String(Math.round(heightCap(well))));
  for (const name of visibleNames(s)) {
    const one = terminalNamed(s, name);
    if (!one || one.pending) continue;
    const e = pool.get(name);
    if (e) requestAnimationFrame(() => refit(e));
  }
}

function chooseHeight(chat, height) {
  const s = stateOf(chat, true);
  const node = drawer.nodes.get(chat);
  if (!s || !node?.parentElement) return;
  s.height = clampHeight(node.parentElement, height);
  applyHeight(node, s);
  save();
}

function dragHeight(chat, event) {
  if (event.button !== 0) return;
  const s = stateOf(chat, true);
  const node = drawer.nodes.get(chat);
  if (!s || !node?.parentElement) return;
  event.preventDefault();
  const startY = event.clientY;
  const start = clampHeight(node.parentElement, s.height);
  node.classList.add("dragging");
  const move = (ev) => {
    s.height = clampHeight(node.parentElement, start + (startY - ev.clientY));
    applyHeight(node, s);
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    node.classList.remove("dragging");
    save();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}

const GRIP_STEPS = { ArrowUp: HEIGHT_STEP, ArrowDown: -HEIGHT_STEP };

function gripKeys(node, event) {
  const chat = node.dataset.name;
  const s = stateOf(chat);
  if (!s || !node.parentElement || !document.activeElement?.classList.contains("ct-grip") || !plainKey(event)) return false;
  if (event.key !== "Home" && !(event.key in GRIP_STEPS)) return false;
  chooseHeight(chat, event.key === "Home" ? HEIGHT_DEFAULT : clampHeight(node.parentElement, s.height) + GRIP_STEPS[event.key]);
  return true;
}

function buildDrawer(chat) {
  const node = document.createElement("section");
  node.className = "ct";
  node.dataset.panelHost = "";
  node.dataset.name = chat;
  node.hidden = true;
  node.setAttribute("aria-label", phrase("Terminal"));
  node.innerHTML = `<div class="ct-grip" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${esc(phrase("Resize terminal"))}"></div>
    <div class="ct-bar"><span class="ct-title"></span><div class="ct-acts" role="group" aria-label="${esc(phrase("Terminal actions"))}">
      <button type="button" class="ct-act" data-act="ct-split">${icon("splitRow")}</button>
      <button type="button" class="ct-act" data-act="ct-split-down">${icon("splitColumn")}</button>
      <button type="button" class="ct-act" data-act="ct-new">${icon("plus")}</button>
      <button type="button" class="ct-act ct-x" data-act="ct-kill">${icon("trash")}</button>
    </div></div>
    <div class="ct-body"><div class="ct-panes"></div><nav class="ct-side" aria-label="${esc(phrase("Terminals"))}" hidden></nav></div>
    <div class="ct-say" role="status" hidden></div>`;
  const grip = node.querySelector(".ct-grip");
  grip.addEventListener("pointerdown", (event) => dragHeight(chat, event));
  grip.addEventListener("dblclick", () => chooseHeight(chat, HEIGHT_DEFAULT));
  node.addEventListener("click", (event) => {
    const hit = event.target.closest?.("[data-act]");
    if (!hit || !node.contains(hit) || !hit.dataset.act.startsWith("ct-")) return;
    event.stopPropagation();
    if (hit.getAttribute("aria-disabled") === "true") return;
    drawerAct(chat, hit.dataset.act, hit);
  });
  drawer.nodes.set(chat, node);
  return node;
}

function mountDrawer(well, chat) {
  const node = drawer.nodes.get(chat) || buildDrawer(chat);
  if (node.parentElement !== well) well.appendChild(node);
  return node;
}

function paintChatTerminalOfChat(el, s) {
  const well = el.querySelector(":scope > .well");
  if (!well) return;
  const chat = s.name;
  const state = ownsTerminal(s) ? stateOf(chat) : null;
  let node = drawer.nodes.get(chat);
  const wasHere = !!node?.contains(document.activeElement);
  const ended = state ? reconcileChat(chat) : "";
  const open = !!state?.open && readNow(chat);
  if (open) node = mountDrawer(well, chat);
  well.classList.toggle("ct-on", open);
  if (!node) return;
  node.hidden = !open;
  if (!open) {
    if (ended === "closed" && wasHere) focusComposer(chat);
    return;
  }
  if (!state.terminals.length && !state.error) startShell(chat, state);
  paintBar(node, chat, state);
  applyHeight(node, state);
  paintPanes(node, chat, state);
  paintSide(node, state);
  const say = node.querySelector(".ct-say");
  say.hidden = !!state.terminals.length;
  say.textContent = state.terminals.length ? "" : phrase(state.error || "the terminal could not be opened");
  if (ended === "moved" && wasHere && !node.contains(document.activeElement)) focusShell(chat);
}

function pickTerminal(chat, name, focus) {
  const s = stateOf(chat);
  if (!s || !name) return false;
  if (activateTerminal(s, name)) {
    save();
    render();
  }
  if (focus) focusShell(chat);
  return true;
}

function toggleChatTerminal(chat) {
  if (!ownsTerminal(seatOf(chat)) || sheetOpen()) return false;
  const s = stateOf(chat, true);
  reconcileChat(chat);
  const node = drawer.nodes.get(chat);
  const shown = s.open && drawerShown(chat) && readNow(chat);
  const wasInside = !!node?.contains(document.activeElement);
  s.open = !shown;
  if (s.open) {
    s.error = "";
    if (!readNow(chat)) openTile(chat, false);
  }
  save();
  render();
  if (s.open) focusShell(chat);
  else if (wasInside || nothingFocused()) focusComposer(chat);
  return true;
}

function addTerminal(chat, mode, dir = SIDE_BY_SIDE) {
  const s = stateOf(chat, true);
  if (mode === "split" && s.terminals.length && splitFull(s)) return true;
  s.open = true;
  s.error = "";
  const entry = startShell(chat, s, mode, dir);
  save();
  render();
  if (entry) focusShell(chat);
  return true;
}

async function programIn(name) {
  try {
    const res = await fetch(`/api/seat/running?name=${encodeURIComponent(name)}`);
    const said = await res.json();
    return { running: typeof said?.running === "boolean" ? said.running : null, program: String(said?.program || "") };
  } catch {
    return { running: null, program: "" };
  }
}

async function closeAllowed(one, at) {
  if (one.pending || !confirmBefore("closeTerminal")) return true;
  const { running, program } = await programIn(one.name);
  if (running === false) return true;
  const why = running && program
    ? phrase("{program} is still running in it and stops when the terminal closes.", { program })
    : phrase("Whatever runs in it stops when the terminal closes.");
  return ask(phrase("Close this terminal?"), esc(why), phrase("close the terminal"), { at });
}

async function closeTerminal(chat, wanted, at = null) {
  const s = stateOf(chat);
  const name = wanted || s?.active;
  const one = s && name ? terminalNamed(s, name) : null;
  if (!one || one.killing || one.asking) return;
  one.asking = true;
  const allowed = await closeAllowed(one, at);
  one.asking = false;
  if (terminalNamed(s, name) !== one || one.killing) return;
  if (!allowed) {
    focusShell(chat);
    return;
  }
  s.error = "";
  if (one.pending) {
    removeTerminal(s, name);
    dropName(s, name);
    killShell(name);
  } else {
    one.killing = true;
    render();
    const gone = await killShell(name);
    one.killing = false;
    if (!gone) {
      s.error = "the terminal would not close";
      render();
      return;
    }
    removeTerminal(s, name);
    dropName(s, name);
    dropTerminal(name);
  }
  if (!s.terminals.length) s.open = false;
  save();
  render();
  if (s.terminals.length) focusShell(chat);
  else focusComposer(chat);
}

function clearTerminal(chat) {
  const s = stateOf(chat);
  const one = s ? terminalNamed(s, s.active) : null;
  if (!one || one.pending) return false;
  const e = pool.get(one.name);
  if (e?.ws?.readyState === 1) e.ws.send("\f");
  return true;
}

function openChatTerminal(chat) {
  if (stateOf(chat)?.open && drawerShown(chat) && readNow(chat)) return true;
  return toggleChatTerminal(chat);
}

function openRunningTerminal(chat) {
  if (!openChatTerminal(chat)) return false;
  const s = stateOf(chat);
  const active = s ? seatOf(s.active) : null;
  const running = active?.foreground ? "" : runningTerminalsOf(chat)[0]?.name || "";
  if (running && terminalNamed(s, running)) pickTerminal(chat, running, true);
  return true;
}

function runInChatTerminal(chat, command) {
  const text = String(command || "").trim();
  if (!text || !ownsTerminal(seatOf(chat)) || sheetOpen()) return false;
  const s = stateOf(chat, true);
  reconcileChat(chat);
  s.open = true;
  s.error = "";
  if (!readNow(chat)) openTile(chat, false);
  const ready = terminalNamed(s, s.active);
  const target = ready && !ready.killing ? ready : startShell(chat, s);
  if (!target) return false;
  if (target.pending) target.waiting.push(`${text}\r`);
  else sendWhenReady(target.name, `${text}\r`);
  save();
  render();
  focusShell(chat);
  return true;
}

function drawerAct(chat, act, hit) {
  if (act === "ct-kill") return closeTerminal(chat, undefined, hit?.getBoundingClientRect() || null);
  if (act === "ct-close") return closeTerminal(chat, hit?.dataset.name, hit?.getBoundingClientRect() || null);
  if (act === "ct-pick") return pickTerminal(chat, hit?.dataset.name, true);
  if (act === "ct-new") return addTerminal(chat, "new");
  if (act === "ct-split") return addTerminal(chat, "split", SIDE_BY_SIDE);
  if (act === "ct-split-down") return addTerminal(chat, "split", STACKED);
  return false;
}

const plainKey = (event) => !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);

function walkSide(node, event) {
  if (!plainKey(event) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const at = document.activeElement;
  if (!at?.closest?.(".ct-side") || !node.contains(at)) return false;
  const stops = [...node.querySelectorAll(".ct-side .ct-group, .ct-side .ct-tab-name")];
  const from = stops.indexOf(at.classList.contains("ct-tab-x") ? at.nextElementSibling : at);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const to = event.key === "Home" ? 0 : event.key === "End" ? stops.length - 1 : Math.max(0, Math.min(stops.length - 1, from + step));
  event.preventDefault();
  stops[to]?.focus();
  return true;
}

function backToTheShell(chat, node, event) {
  if (event.key !== "Escape" || !plainKey(event)) return false;
  const at = document.activeElement;
  if (!at?.closest?.(".ct-bar, .ct-side") || !node.contains(at)) return false;
  const s = stateOf(chat);
  if (!s || !terminalNamed(s, s.active)) return false;
  event.preventDefault();
  focusShell(chat);
  return true;
}

const drawerOfFocus = () => {
  const node = document.activeElement?.closest?.(".ct");
  return node && !node.hidden && drawer.nodes.get(node.dataset.name) === node ? node : null;
};

const inDrawerTerminal = () => !!drawerOfFocus() && !!document.activeElement.closest(".ct-pane");

const CHORD_RUNS = {
  clear: (chat) => clearTerminal(chat),
  split: (chat) => addTerminal(chat, "split", SIDE_BY_SIDE),
  "split-down": (chat) => addTerminal(chat, "split", STACKED),
  new: (chat) => addTerminal(chat, "new"),
  close: (chat) => { closeTerminal(chat); return true; }
};

function drawerChord(event) {
  if (event.type !== "keydown") return false;
  const node = drawerOfFocus();
  if (!node) return false;
  if (gripKeys(node, event) || walkSide(node, event) || backToTheShell(node.dataset.name, node, event)) return true;
  const chord = chordOf(event, { mac: IS_MAC, inTerminal: inDrawerTerminal(), inDrawer: true });
  return !!chord && CHORD_RUNS[chord](node.dataset.name) === true;
}

function drawerLink(ev, uri) {
  const node = ev?.target?.closest?.(".ct");
  const chat = node?.dataset.name || "";
  if (!chat || drawer.nodes.get(chat) !== node || !/^https?:\/\//i.test(String(uri || ""))) return false;
  openWebPage(chat, uri);
  return true;
}

routeTerminalLinks(drawerLink);

window.addEventListener("keydown", (event) => {
  if (!drawerChord(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

keepTerminalKeys((event, action) => {
  if (!inDrawerTerminal()) return false;
  if (terminalNavKey(event, { mac: IS_MAC })) return true;
  if (IS_MAC || action === "terminal") return false;
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
});

document.addEventListener("hive:open-terminal", (event) => {
  const chat = String(event.detail?.name || "");
  if (!openRunningTerminal(chat)) openTile(chat, false);
});

document.addEventListener("hive:run-in-terminal", (event) => {
  const { name, command } = event.detail || {};
  runInChatTerminal(String(name || ""), command);
});

function toggleHtml(chat) {
  const s = seatOf(chat);
  if (!s || !s.structured) return "";
  const able = ownsTerminal(s);
  const on = able && !!stateOf(chat)?.open;
  const said = phrase("Toggle terminal");
  const keys = st.keys?.terminal ? keyLabel(st.keys.terminal) : "";
  const title = !able ? phrase("Only chats on this machine have a terminal") : keys ? `${said} (${keys})` : said;
  return `<button type="button" class="cb-btn${on ? " on" : ""}" data-act="chat-terminal" aria-pressed="${on}" aria-label="${esc(said)}" title="${esc(title)}"${able ? "" : " disabled"}>${lucide("panelBottom")}</button>`;
}

registerChatControl({
  order: 60,
  html: toggleHtml,
  act: (act, chat) => (act === "chat-terminal" ? toggleChatTerminal(chat) : false),
  key: (action, chat) => (action === "terminal" ? toggleChatTerminal(chat) : false)
});

paintWithTiles(paintChatTerminalOfChat);

function paintRunningTerminalOfChat(el, s) {
  const icon = el.querySelector(".t-term");
  if (!icon) return;
  if (!icon.dataset.wired) {
    icon.dataset.wired = "1";
    icon.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      openRunningTerminal(el.dataset.name);
    });
  }
  const say = ownsTerminal(s) ? runningTerminalSay(s.name) : "";
  icon.hidden = !say;
  icon.title = say;
  icon.setAttribute("aria-label", say);
}

paintWithTiles(paintRunningTerminalOfChat);

export { openChatTerminal, paintChatTerminalOfChat, runInChatTerminal, toggleChatTerminal };

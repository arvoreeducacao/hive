import { arrangeOn, openArrange, paintArrange, render } from "./arrange.js";
import { lentFace } from "./avatars.js";
import { blockNumber, blocksOf, canGiveBack, giveSeatBack, hideSeat, itemOf, labelOf, moveSeatToBlock, moveToNewBlock, ofBlock, openSpace, seatsOf, shutSpace, soloSeat, spaceName, spaceOf } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { fitChipRow } from "./chip-row.js";
import { artifactTabOf, canopy, drivingNow, markArtRows, openBrowser, openCockpit, openKeptPage, pagesOfChat, paintCanopyOfChat, paintCockpitOfChat, paintDeviceChipOfChat, paintDeviceOfChat, paintFrontsOfChat, paintWebChipOfChat, paintWebOfChat, showingArtifact, startDevice, wireLinks } from "./chat-and-panes.js";
import { paintName, startRename } from "./chat-name.js";
import { mountStructured } from "./chat-stretches.js";
import { $, GLYPH, LABEL, PILL_LABEL, esc, experienceNext, markFinishSeen, paintFold, phrase, previewOf, raycastOn, renderMarkdown, saveUnfolded, sideShut, solidMounts, st, statusFolded, svgIcon, unfolded } from "./core.js";
import { behaviorOn } from "./experience.js";
import { closeTile, focusSeat, goToBlock, goToSpace, openTile, pull, takeKeyboard } from "./focus-navigation.js";
import { keyHint, keyParts, liveBadge, liveOf, liveTitle, pool, receiving, tiles } from "./leader-key.js";
import { memoryChip, memoryChipClick } from "./memory-signal.js";
import { archiveSeatNow } from "./mirror.js";
import { paneOnField } from "./plane.js";
import { ago, ask } from "./pod.js";
import { paintDiffOfChat, paintInfoOfChat } from "./seat-changes.js";
import { appendLeftovers, leftoversOf, worktreesThatStayed, worktreesToDrop } from "./seat-leftovers.js";
import { WHERE_ICON, knock, shortBranch } from "./seat-layout.js";
import { SHELF_TABS } from "./shelf.js";
import { openPrInASeat } from "./page-in-a-seat.js";
import { paintSlim, toggleFold } from "./shared.js";
import { artFileOf } from "./subagents-dock.js";
import { goToTeam, takeKeyboardBack, teamRow } from "./team.js";
import { mount, observer, onWheel, paintWellKeys, reconnect, toClipboard } from "./terminal-history.js";
import { getTerminal } from "./terminal-pool.js";
import { deleteBranch, exitReview, hidePr, mergePr, mergeState, movePrPanel, moveThreadPanel, openPrs, openThreadOf, paintPrs, prsOnScreen, pullPrs, rerunChecks, reviewInChat } from "./thread.js";
import { canDetach, closeSeat, detachToWindow, seatDrag } from "./tiles.js";

st.seatMenuFor = "";

const seatMenuOn = () => $("seatmenu").classList.contains("on");

function closeSeatMenu() {
  $("seatmenu").classList.remove("on");
  st.seatMenuFor = "";
  menuStop("seatmenu");
}

function seatMenuRows(s) {
  if (raycastOn()) return seatMenuRowsRaycast(s);
  const rows = [];
  const isOpen = st.open === s.name;
  const here = st.blocks.findIndex((b) => b.keys.includes(s.name));
  rows.push({ label: isOpen ? phrase("back to the mosaic") : phrase("open it alone"), note: keyHint("fullscreen"), go: () => (isOpen ? closeTile() : openTile(s.name)) });
  rows.push({ label: phrase("type in this session"), note: keyHint("type"), go: () => takeKeyboard(s.name) });
  if (s.finish) rows.push({ label: phrase("what it left for you"), note: ago(s.finish.at), go: () => openFinishOf(s.name) });
  rows.push({ label: phrase("rename…"), go: () => startRename(s.name) });
  rows.push(isOpen
    ? { label: sideShut(s.name) ? phrase("bring the cards back") : phrase("fold the cards away"), go: () => toggleFold(s.name) }
    : { label: statusFolded(s.name) ? "unfold the status" : "fold the status away", go: () => toggleFold(s.name) });
  if (threadsOfChat(s.name).length) rows.push({ label: phrase("its Slack thread"), note: keyHint("threads"), go: () => openThreadOf(s.name, st.openThread) });
  if (prOfChat(s.name)) rows.push({ label: phrase("review its PR"), note: keyHint("prs"), go: () => reviewInChat(s.name) });
  rows.push({ label: phrase("open the browser here"), go: () => openBrowser(s.name) });
  rows.push({ label: phrase("open the phone here"), go: () => startDevice(s.name) });
  rows.push({ label: phrase("its browser cockpit"), note: canopy.up ? "canopy" : phrase("canopy is not running"), go: () => openCockpit(s.name) });
  rows.push({ sep: true });
  st.blocks.forEach((b, i) => {
    if (i === here) return;
    const full = b.keys.length >= st.LIMIT;
    rows.push({
      label: `move to block ${blockNumber(i)}`,
      note: full ? "full" : labelOf(b, ofBlock(b)).txt,
      off: full,
      go: () => moveSeatToBlock(s.name, i)
    });
  });
  rows.push({ label: phrase("move to a block of its own"), off: (st.blocks[here]?.keys.length || 0) < 2, go: () => moveToNewBlock(s.name) });
  if (canDetach()) rows.push({ label: phrase("open in a window of its own"), note: keyHint("detach"), go: () => detachToWindow(s.name) });
  if (canGiveBack()) rows.push({ label: phrase("put it back in the grid"), note: keyHint("detach"), go: () => giveSeatBack(s.name) });
  rows.push({ sep: true });
  rows.push({ label: phrase("reconnect"), note: keyHint("reconnect"), go: () => reconnect(s.name) });
  rows.push({ label: phrase("copy the seat name"), note: s.name, go: () => toClipboard(s.name) });
  rows.push({ label: phrase("hide until it works again"), go: () => hideUntilItWorks(s) });
  rows.push({ label: phrase("archive"), note: keyHint("archive") || phrase("no key"), go: () => archiveSeatNow(s) });
  rows.push({ label: phrase("close the seat"), danger: true, go: (at) => closeSeat(s, at) });
  return rows;
}

function seatMenuRowsRaycast(s) {
  const rows = [];
  const isOpen = st.open === s.name;
  const here = st.blocks.findIndex((b) => b.keys.includes(s.name));
  rows.push({ icon: "i-expand", label: isOpen ? phrase("back to the mosaic") : phrase("open it alone"), keys: keyHint("fullscreen"), go: () => (isOpen ? closeTile() : openTile(s.name)) });
  rows.push({ icon: "i-term", label: phrase("type in this session"), keys: keyHint("type"), go: () => takeKeyboard(s.name) });
  if (s.finish) rows.push({ icon: "i-check", label: phrase("what it left for you"), note: ago(s.finish.at), go: () => openFinishOf(s.name) });
  rows.push({ icon: "i-pen", label: phrase("rename…"), go: () => startRename(s.name) });
  rows.push(isOpen
    ? { icon: "i-minus", label: sideShut(s.name) ? phrase("bring the cards back") : phrase("fold the cards away"), go: () => toggleFold(s.name) }
    : { icon: "i-minus", label: statusFolded(s.name) ? "unfold the status" : "fold the status away", go: () => toggleFold(s.name) });
  rows.push({ sep: true });
  if (threadsOfChat(s.name).length) rows.push({ icon: "i-hash", label: phrase("its Slack thread"), keys: keyHint("threads"), go: () => openThreadOf(s.name, st.openThread) });
  if (prOfChat(s.name)) rows.push({ icon: "i-pr", label: phrase("review its PR"), keys: keyHint("prs"), go: () => reviewInChat(s.name) });
  rows.push({ icon: "i-browser", label: phrase("open the browser here"), go: () => openBrowser(s.name) });
  rows.push({ icon: "i-phone", label: phrase("open the phone here"), go: () => startDevice(s.name) });
  rows.push({ icon: "i-screen", label: phrase("its browser cockpit"), note: canopy.up ? "canopy" : phrase("canopy is not running"), go: () => openCockpit(s.name) });
  rows.push({ sep: true });
  const moves = [];
  st.blocks.forEach((b, i) => {
    if (i === here) return;
    const full = b.keys.length >= st.LIMIT;
    moves.push({
      icon: "i-grid",
      label: phrase("block {n}", { n: blockNumber(i) }),
      note: full ? phrase("full") : labelOf(b, ofBlock(b)).txt,
      off: full,
      go: () => moveSeatToBlock(s.name, i)
    });
  });
  moves.push({ icon: "i-plus", label: phrase("a block of its own"), off: (st.blocks[here]?.keys.length || 0) < 2, go: () => moveToNewBlock(s.name) });
  rows.push({
    icon: "i-grid",
    label: phrase("move to a block"),
    note: [...st.blocks.map((_, i) => i).filter((i) => i !== here).map((i) => blockNumber(i)), phrase("new")].join(" · "),
    sub: moves
  });
  if (canDetach()) rows.push({ icon: "i-rail", label: phrase("open in a window of its own"), keys: keyHint("detach"), go: () => detachToWindow(s.name) });
  if (canGiveBack()) rows.push({ icon: "i-rail", label: phrase("put it back in the grid"), keys: keyHint("detach"), go: () => giveSeatBack(s.name) });
  rows.push({ sep: true });
  rows.push({ icon: "i-reload", label: phrase("reconnect"), keys: keyHint("reconnect"), go: () => reconnect(s.name) });
  rows.push({ icon: "i-copy", label: phrase("copy the seat name"), note: s.name, go: () => toClipboard(s.name) });
  rows.push({ icon: "i-minus", label: phrase("hide until it works again"), go: () => hideUntilItWorks(s) });
  rows.push({ icon: "i-clock", label: phrase("archive"), keys: keyHint("archive"), go: () => archiveSeatNow(s) });
  rows.push({ icon: "i-x", label: phrase("close the seat…"), keys: keyHint("kill"), danger: true, go: (at) => closeSeat(s, at) });
  return rows;
}

function hideUntilItWorks(s) {
  if (!s) return;
  if (st.open === s.name) closeTile();
  hideSeat(s.name);
}

function seatSpot(s) {
  const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
  if (bi < 0) return "";
  return `b${blockNumber(bi)} · ${st.blocks[bi].keys.indexOf(s.name) + 1}/${st.blocks[bi].keys.length}`;
}

function paintMenu(cap, rows, x, y) {
  if (raycastOn()) return paintMenuRaycast(cap, rows, x, y);
  const el = $("seatmenu");
  st.menuShown = rows;
  menuSolid.show(menuViewModel(cap, rows));
  el.classList.add("on");
  const box = el.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(x, innerWidth - box.width - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(y, innerHeight - box.height - 6))}px`;
}

function paintMenuRaycast(cap, rows, x, y, at = "") {
  const el = $("seatmenu");
  menuShow("seatmenu", cap, rows, { at, pick: (row, rect) => { closeSeatMenu(); row?.go?.(rect); }, close: closeSeatMenu });
  el.classList.add("on");
  const box = el.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(x, innerWidth - box.width - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(y, innerHeight - box.height - 6))}px`;
  el.querySelector(".mi-q")?.focus({ preventScroll: true });
}

let menuSolid = null;

let palActsSolid = null;

let menuViews = null;

st.menuShown = [];

function menuViewModel(cap, rows) {
  return {
    on: true,
    cap: String(cap ?? ""),
    rows: rows.map((r, i) => (r.sep
      ? { key: `sep-${i}`, sep: true }
      : { key: `row-${i}`, at: i, label: String(r.label ?? ""), note: r.note ? String(r.note) : "", danger: !!r.danger, off: !!r.off }))
  };
}

solidMounts.push((hive) => {
  menuViews = hive;
  menuSolid = hive.mountMenu($("seatmenu"), {
    pick: (at, rect) => {
      if (menus.has("seatmenu")) return menuPick("seatmenu", at, rect);
      const row = st.menuShown[at];
      closeSeatMenu();
      row?.go(rect);
    },
    hover: (at) => menuHover("seatmenu", at),
    find: (q) => menuFind("seatmenu", q),
    key: (ev) => menuKeys("seatmenu", ev),
    back: () => menuBack("seatmenu")
  });
});

const menus = new Map();

function menuRaycastModel(cap, rows, extra = {}) {
  return {
    on: true,
    raycast: true,
    cap: String(cap ?? ""),
    at: String(extra.at ?? ""),
    back: !!extra.back,
    backSay: phrase("back"),
    find: !!extra.find,
    findSay: phrase("Filter…"),
    q: String(extra.q ?? ""),
    rows: rows.map((r, i) => (r.sep
      ? { key: `sep-${i}`, sep: true }
      : {
        key: `row-${i}`, at: i, label: String(r.label ?? ""), icon: r.icon || "", note: r.note ? String(r.note) : "",
        keys: keyParts(r.keys), danger: !!r.danger, off: !!r.off, sub: !!r.sub, sel: i === extra.sel
      }))
  };
}

const liveRow = (r) => r && !r.sep && !r.off;

function nextLive(list, from, step) {
  const n = list.length;
  for (let k = 1; k <= n; k++) {
    const at = (((from + step * k) % n) + n) % n;
    if (liveRow(list[at])) return at;
  }
  return -1;
}

function menuList(m) {
  const top = m.stack[m.stack.length - 1];
  const list = top ? top.rows : m.rows;
  const q = m.q.trim().toLowerCase();
  if (!q) return list;
  const flat = top ? list : list.flatMap((r) => (r.sub ? [r, ...r.sub] : [r]));
  return flat.filter((r) => !r.sep && `${r.label} ${r.note || ""}`.toLowerCase().includes(q));
}

function forgetPalActs() {
  palActsSolid?.dispose?.();
  palActsSolid = null;
  menuStop("pal-acts");
}

function palActsView() {
  if (!palActsSolid && menuViews && $("pal-acts")) palActsSolid = menuViews.mountMenu($("pal-acts"), menuActions("pal-acts"));
  return palActsSolid;
}

function menuPaint(m) {
  const top = m.stack[m.stack.length - 1];
  m.shown = menuList(m);
  if (m.id === "seatmenu") st.menuShown = m.shown;
  const solid = m.id === "seatmenu" ? menuSolid : palActsView();
  solid?.show(menuRaycastModel(top ? top.cap : m.cap, m.shown, { at: top ? "" : m.at, back: !!top, find: true, q: m.q, sel: m.sel }));
}

function menuShow(id, cap, rows, { at = "", pick = null, close = null } = {}) {
  const m = { id, cap, at, rows, stack: [], q: "", sel: -1, shown: [], pick, close };
  menus.set(id, m);
  m.sel = nextLive(menuList(m), -1, 1);
  menuPaint(m);
  $(id)?.querySelector(".mi-q")?.focus({ preventScroll: true });
}

function menuStop(id) {
  menus.delete(id);
}

function menuPick(id, at, rect) {
  const m = menus.get(id);
  const row = m?.shown[at];
  if (!row || row.sep || row.off) return;
  if (row.sub) {
    m.stack.push({ cap: row.label, rows: row.sub });
    m.q = "";
    m.sel = nextLive(menuList(m), -1, 1);
    menuPaint(m);
    $(id).querySelector(".mi-q")?.focus({ preventScroll: true });
    return;
  }
  if (m.pick) return m.pick(row, rect);
  row.go?.(rect);
}

function menuBack(id) {
  const m = menus.get(id);
  if (!m?.stack.length) return false;
  m.stack.pop();
  m.q = "";
  m.sel = nextLive(menuList(m), -1, 1);
  menuPaint(m);
  $(id).querySelector(".mi-q")?.focus({ preventScroll: true });
  return true;
}

function menuHover(id, at) {
  const m = menus.get(id);
  if (!m || m.sel === at || !liveRow(m.shown[at])) return;
  m.sel = at;
  menuPaint(m);
}

function menuFind(id, q) {
  const m = menus.get(id);
  if (!m) return;
  m.q = q;
  m.sel = nextLive(menuList(m), -1, 1);
  menuPaint(m);
}

function menuKeys(id, e) {
  const m = menus.get(id);
  if (!m) return false;
  const stop = () => { e.preventDefault(); e.stopPropagation(); return true; };
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    m.sel = nextLive(m.shown, m.sel, e.key === "ArrowDown" ? 1 : -1);
    menuPaint(m);
    $(id).querySelector(".mi.sel")?.scrollIntoView({ block: "nearest" });
    return stop();
  }
  if (e.key === "Enter" || (e.key === "ArrowRight" && m.shown[m.sel]?.sub)) {
    if (m.sel >= 0) menuPick(id, m.sel, $(id).querySelector(".mi.sel")?.getBoundingClientRect() || null);
    return stop();
  }
  if ((e.key === "ArrowLeft" || e.key === "Escape" || (e.key === "Backspace" && !m.q)) && menuBack(id)) return stop();
  if (e.key === "Escape") {
    m.close?.();
    return stop();
  }
  return false;
}

function menuActions(id) {
  return {
    pick: (at, rect) => menuPick(id, at, rect),
    hover: (at) => menuHover(id, at),
    find: (q) => menuFind(id, q),
    key: (ev) => menuKeys(id, ev),
    back: () => menuBack(id)
  };
}

function asksForTheEditMenu(ev, within) {
  if (ev.target.closest("textarea, input, [contenteditable]:not([contenteditable=\"false\"])")) return true;
  const picked = document.getSelection();
  if (!picked || picked.isCollapsed || !picked.anchorNode) return false;
  return within.contains(picked.anchorNode) && picked.toString().trim().length > 0;
}

function openSeatMenu(s, x, y) {
  if (raycastOn()) paintMenuRaycast(s.title || s.name, seatMenuRows(s), x, y, seatSpot(s));
  else paintMenu(s.title || s.name, seatMenuRows(s), x, y);
  st.seatMenuFor = s.name;
}

function blockMenuRows(i) {
  const rows = [];
  const seats = ofBlock(st.blocks[i]).filter((x) => x.kind === "session");
  if (i !== st.block) rows.push({ label: phrase("go to this block"), go: () => goToBlock(i) });
  rows.push({ sep: true });
  rows.push({
    label: seats.length === 1 ? "close its seat" : `close all ${seats.length} seats`,
    note: seats.length ? "" : "nothing to close",
    off: !seats.length,
    danger: true,
    go: (at) => closeBlock(i, at)
  });
  return rows;
}

function spaceCloseNote(id) {
  const mine = blocksOf(id);
  if (st.spaces.length < 2) return phrase("the last one stays");
  return mine.length ? phrase("its {n} blocks walk to the one before", { n: mine.length }) : phrase("nothing in it");
}

/* the same close from the menu, the tag button and the palette: one confirmation, one place */
async function closeSpace(id, at) {
  if (st.spaces.length < 2) return;
  const w = spaceOf(id);
  const seats = seatsOf(id);
  if (seats && !await ask(
    phrase("Close the workspace {name}?", { name: spaceName(w) }),
    phrase("No chat closes: the {n} seats walk to the workspace before this one, and you can carry them back.", { n: seats }),
    phrase("close the workspace"),
    { who: spaceName(w), at }
  )) return;
  if (shutSpace(id)) render();
}

function spaceMenuRows(id) {
  return [
    { label: phrase("rename this workspace"), go: () => renameSpace(id) },
    { label: phrase("new workspace"), note: phrase("the next chat opens in it"), go: () => goToSpace(openSpace("").id) },
    { sep: true },
    {
      label: phrase("close this workspace"),
      note: spaceCloseNote(id),
      off: st.spaces.length < 2,
      danger: true,
      go: (at) => closeSpace(id, at)
    }
  ];
}

function openSpaceMenu(id, x, y) {
  if (soloSeat || st.mirrorDev) return;
  paintMenu(spaceName(spaceOf(id)), spaceMenuRows(id), x, y);
}

function renameSpace(id) {
  if (!arrangeOn()) openArrange();
  st.arrangeFloor = id;
  paintArrange();
  const el = $("arrange").querySelector(`.fl-name[data-w="${CSS.escape(id)}"]`);
  if (!el) return;
  el.focus();
  el.select?.();
}

function teamMenuRows(dev) {
  const row = teamRow(dev);
  const quiet = row?.knocks === false;
  const noteOf = (said) => (!row?.up ? phrase("server asleep") : quiet ? phrase("not taking pokes right now") : said);
  return [
    { label: dev === st.mirrorDev ? "leave their hive" : "open their hive", go: () => goToTeam(teamRow(dev)?.key || "") },
    { sep: true },
    { label: phrase("say hi"), note: noteOf(phrase("your face walks in at the foot of their rail, waving")), off: !row?.up || quiet, go: () => helloTeam(dev) },
    { label: phrase("poke"), note: noteOf(phrase("one shake, nothing to answer")), off: !row?.up || quiet, go: () => pokeTeam(dev) }
  ];
}

function openTeamMenu(dev, x, y) {
  if (!st.team.poke || !teamRow(dev)) return;
  paintMenu(dev, teamMenuRows(dev), x, y);
}

async function pokeTeam(dev, hello = false) {
  await fetch("/api/team/poke", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(hello ? { dev, hello: true } : { dev })
  }).catch(() => {});
}

function helloTeam(dev) {
  st.pet?.wave();
  return pokeTeam(dev, true);
}

function openBlockMenu(i, x, y) {
  if (!st.blocks[i]) return;
  paintMenu(labelOf(st.blocks[i], ofBlock(st.blocks[i])).txt || `block ${blockNumber(i)}`, blockMenuRows(i), x, y);
}

async function closeBlock(i, at) {
  const b = st.blocks[i];
  if (!b) return;
  const seats = ofBlock(b).filter((x) => x.kind === "session");
  if (!seats.length) return;
  const many = seats.length > 1;
  const pending = seats.map((s) => leftoversOf(s));
  const settles = seats.map((s, k) => appendLeftovers(pending[k], { who: many ? (s.title || s.name) : "" }));
  const ok = await ask(
    many ? phrase("Close all {n} seats?", { n: seats.length }) : phrase("Close this seat?"),
    `${many ? phrase("All {n} windows close", { n: seats.length }) : phrase("The window closes")} ` +
    `${many ? phrase("and whatever runs in them stops.") : phrase("and whatever runs in it stops.")} ` +
    `${phrase("A chat keeps its transcript:")} <b>${keyLabel(st.keys.history)}</b> ${phrase("brings it back with its whole context.")}`,
    many ? phrase("close the {n} seats", { n: seats.length }) : phrase("close the seat"),
    { who: labelOf(b, ofBlock(b)).txt || `block ${blockNumber(i)}`, at }
  );
  for (const settle of settles) settle();
  if (!ok) return;
  const left = await Promise.all(pending);
  const drops = seats.map((s, k) => worktreesToDrop(left[k]));
  for (const s of seats) unfolded.delete(s.name);
  saveUnfolded();
  const answers = await Promise.all(seats.map((s, k) => fetch("/api/kill", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: s.name, where: s.where, ...(drops[k].length ? { dropWorktrees: drops[k] } : {}) })
  }).then((answer) => answer.json()).catch(() => null)));
  const stayed = answers.map((said) => worktreesThatStayed(said)).join("");
  if (stayed) ask(phrase("The seat closed, but a worktree stayed"), stayed, phrase("understood"), { at });
  if (seats.some((s) => s.name === st.open)) closeTile();
  pull();
}

document.addEventListener("pointerdown", (e) => { if (seatMenuOn() && !e.target.closest("#seatmenu")) closeSeatMenu(); }, true);

const finishOn = () => $("finish").classList.contains("on");

const closeFinish = () => $("finish").classList.remove("on");

function finishMeta(f) {
  const said = [];
  if (f.at) said.push(phrase("finished {when} ago", { when: ago(f.at) }));
  if (f.ms) said.push(f.ms < 60000 ? phrase("took {n}s", { n: Math.max(1, Math.round(f.ms / 1000)) }) : phrase("took {n} min", { n: Math.round(f.ms / 60000) }));
  if (f.turns) said.push(f.turns > 1 ? phrase("{n} turns", { n: f.turns }) : phrase("{n} turn", { n: f.turns }));
  if (f.cost) said.push(`$${f.cost.toFixed(2)}`);
  return said;
}

function finishWarnings(f) {
  return [
    f.error ? phrase("the turn ended in an error") : "",
    f.stop ? phrase("it stopped on {stop}, not on its own", { stop: f.stop }) : "",
    f.denials ? (f.denials > 1 ? phrase("{n} permissions denied", { n: f.denials }) : phrase("{n} permission denied", { n: f.denials })) : ""
  ].filter(Boolean);
}

function openFinish(name, at) {
  const s = st.data.sessions.find((x) => x.name === name);
  if (!s?.finish) return;
  const f = s.finish;
  const el = $("finish");
  const prs = prsOfChat(name);
  el.innerHTML = `
    <div class="cap">${esc(s.title || s.name)} ${phrase("— what it left for you")}</div>
    <div class="fin-meta">${finishMeta(f).map((b) => `<span>${esc(b)}</span>`).join("")}${finishWarnings(f).map((w) => `<span class="bad">${esc(w)}</span>`).join("")}</div>
    <div class="fin-say sv-msg md">${f.text ? renderMarkdown(f.text) : `<p>${phrase("It stopped without a closing word — the seat itself is the only place left to look.")}</p>`}${f.clipped ? `<span class="fin-clip">${phrase("the rest of it is in the seat")}</span>` : ""}</div>
    ${prs.map((pr) => `<a class="fin-pr" href="${esc(pr.url || "#")}" target="_blank" rel="noreferrer"><b>${esc(pr.repo.split("/").pop())}#${pr.number}</b><span>${esc(pr.title || pr.error || "")}</span></a>`).join("")}
    <div class="fin-go"><button class="ghost b-open">${phrase("open the chat")}</button><button class="ghost b-shut">${phrase("close")}</button></div>`;
  wireLinks(name, el);
  el.querySelector(".b-open").addEventListener("click", () => { closeFinish(); openTile(name); });
  el.querySelector(".b-shut").addEventListener("click", closeFinish);
  el.classList.add("on");
  el.scrollTop = 0;
  const box = el.getBoundingClientRect();
  const anchor = at || { left: innerWidth / 2 - box.width / 2, bottom: 80 };
  el.style.left = `${Math.max(6, Math.min(anchor.left, innerWidth - box.width - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(anchor.bottom + 6, innerHeight - box.height - 6))}px`;
  if (markFinishSeen(name)) render();
}

function openFinishOf(name) {
  const tile = document.querySelector(`.tile[data-name="${CSS.escape(name)}"]`);
  openFinish(name, tile ? tile.getBoundingClientRect() : null);
}

document.addEventListener("pointerdown", (e) => { if (finishOn() && !e.target.closest("#finish")) closeFinish(); }, true);

addEventListener("resize", () => { if (finishOn()) closeFinish(); });

addEventListener("resize", () => { if (seatMenuOn()) closeSeatMenu(); });

addEventListener("blur", () => { if (seatMenuOn()) closeSeatMenu(); });

/* a tile is built once and repainted in place, so every handler it binds outlives the names
   the person writes after it. What a handler acts on has to be looked up when the click
   happens, or it acts on the seat as it was the day the tile was born. */
const seatNow = (s) => st.data.sessions.find((x) => x.name === s.name) || s;

function createTile(s) {
  const el = document.createElement("article");
  el.className = "tile";
  el.dataset.name = s.name;
  el.dataset.key = s.name;
  el.innerHTML = `
    <div class="side">
      <div class="t-head">
        <div class="t-ident"><div class="t-name"></div><div class="t-sub"></div></div>
        <span class="t-tags"><span class="acct" hidden></span><span class="where"><svg aria-hidden="true"><use href="#i-local"/></svg><span class="where-txt"></span></span><button class="t-web" title="${phrase("open the browser here")}" aria-label="${phrase("open the browser here")}"><svg aria-hidden="true"><use href="#i-browser"/></svg></button><button class="t-phone" title="${phrase("open the phone here")}" aria-label="${phrase("open the phone here")}"><svg aria-hidden="true"><use href="#i-phone"/></svg></button><button class="t-edit" title="${phrase("rename this chat — empty gives the seat name back")}" aria-label="${phrase("rename this chat")}"><svg aria-hidden="true"><use href="#i-pen"/></svg></button><button class="t-fold" title="${phrase("fold the status away — the terminal takes the room")}" aria-label="${phrase("fold the status away")}" aria-pressed="false"><svg aria-hidden="true"><use href="#i-minus"/></svg></button><button class="t-min" title="${phrase("Back to all chats (esc)")}" aria-label="${phrase("Back to all chats (esc)")}"><svg aria-hidden="true"><use href="#i-minus"/></svg></button><button class="t-close" title="${phrase("close this seat")}" aria-label="${phrase("close this seat")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button></span>
      </div>
      <div class="t-state"><span class="t-pill"><svg class="gl" aria-hidden="true"><use href="#g-idle"/></svg><span class="label"></span></span><span class="t-live" hidden><svg aria-hidden="true"><use href="#i-clock"/></svg><b></b></span><button class="t-canopy" hidden title="${phrase("its browser cockpit")}"><svg aria-hidden="true"><use href="#i-screen"/></svg><span></span><i></i></button><button class="t-device" hidden title="${phrase("its device")}"><svg aria-hidden="true"><use href="#i-phone"/></svg><span></span><i></i></button><button class="t-page" hidden title="${phrase("the page this seat has open — open the pane to watch it")}"><svg aria-hidden="true"><use href="#i-browser"/></svg><span></span></button><span class="when"></span><span class="t-where"></span></div>
      <button class="t-shot" hidden title="${phrase("its browser cockpit")}"><img alt=""><span></span></button>
      <div class="t-chips"></div>
      <p class="summary"></p>
      <div class="t-slack-wrap" data-heading="${phrase("Slack threads")}"></div>
      <div class="t-pr-wrap" data-heading="${phrase("Pull requests")}"></div>
      <div class="t-art-wrap" data-heading="${phrase("Pages")}"></div>
      <div class="actions">
        <button class="btn b-back">${phrase("back (esc)")}</button>
        <button class="btn b-reconnect">${phrase("reconnect ({n})", { n: keyLabel(st.keys.reconnect) })}</button>
        <button class="btn b-kill">${phrase("kill session")}</button>
      </div>
    </div>
    <div class="well" data-name="${esc(s.name)}"><span class="badge">${phrase("live terminal")}</span><div class="cover"><span>${phrase("click or {n} to type in this session", { n: keyLabel(st.keys.type) })}</span></div></div>
    <div class="x-split" role="separator" aria-orientation="vertical" tabindex="0" aria-label="${phrase("width of the chat details")}" title="${phrase("drag or use the arrows to resize the chat details — double-click restores them")}"></div>
    <div class="x-split-thread" role="separator" aria-orientation="vertical" tabindex="0" aria-label="${phrase("width of the slack thread")}" title="${phrase("drag or use the arrows to resize the thread — double-click restores it")}"></div>
    <div class="x-split-pane" role="separator" aria-orientation="vertical" tabindex="0" aria-label="${phrase("Width of the pane")}" title="${phrase("Drag or use the arrows to resize the pane — double-click restores it")}"></div>
    <div class="y-split" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="${phrase("height of the chat details")}" title="${phrase("drag or use the arrows to share the height between the details and the chat — double-click restores it")}"></div>`;
  el.addEventListener("pointerdown", () => { if (focusSeat(s.name)) render(); });
  const side = el.querySelector(".side");
  side.addEventListener("click", (ev) => {
    if (experienceNext() && st.open !== s.name) return;
    for (const node of ev.composedPath()) {
      if (node === side) break;
      if (node.$$click || node.tagName === "BUTTON") return;
    }
    return st.open === s.name ? closeTile() : openTile(s.name);
  });
  el.addEventListener("contextmenu", (ev) => {
    if (asksForTheEditMenu(ev, el)) return;
    ev.preventDefault();
    const it = st.data.sessions.find((x) => x.name === s.name);
    if (!it) return;
    if (focusSeat(s.name)) render();
    openSeatMenu(it, ev.clientX, ev.clientY);
  });
  el.querySelector(".t-edit").addEventListener("click", (ev) => { ev.stopPropagation(); startRename(s.name); });
  el.querySelector(".t-web").addEventListener("click", (ev) => { ev.stopPropagation(); openBrowser(s.name); });
  el.querySelector(".t-phone").addEventListener("click", (ev) => { ev.stopPropagation(); startDevice(s.name); });
  el.querySelector(".t-name").addEventListener("dblclick", (ev) => { ev.stopPropagation(); startRename(s.name); });
  el.querySelector(".t-fold").addEventListener("click", (ev) => { ev.stopPropagation(); toggleFold(s.name); });
  el.querySelector(".t-close").addEventListener("click", (ev) => { ev.stopPropagation(); closeSeat(seatNow(s), ev.currentTarget.getBoundingClientRect()); });
  el.querySelector(".cover").addEventListener("click", (ev) => { ev.stopPropagation(); takeKeyboard(s.name); });
  el.querySelector(".well").addEventListener("wheel", (ev) => {
    const e = pool.get(s.name);
    if (e) onWheel(e, ev);
  }, { capture: true, passive: false });
  el.querySelector(".b-back").addEventListener("click", (ev) => { ev.stopPropagation(); closeTile(); });
  el.querySelector(".b-reconnect").addEventListener("click", (ev) => { ev.stopPropagation(); reconnect(s.name); });
  el.querySelector(".b-kill").addEventListener("click", (ev) => { ev.stopPropagation(); closeSeat(seatNow(s), ev.currentTarget.getBoundingClientRect()); });
  observer.observe(el.querySelector(".well"));
  tileSideOf(el, s);
  seatDrag(el, s.name);
  return el;
}

function sinceStart(at) {
  if (!at) return "";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}`;
}

function createJobTile(it) {
  const el = document.createElement("article");
  el.className = "tile spawning";
  el.dataset.key = it.key;
  el.innerHTML = `
    <div class="side">
      <div class="t-head">
        <div class="t-ident"><div class="t-name"></div><div class="t-sub"></div></div>
        <span class="where"><svg aria-hidden="true"><use href="#i-local"/></svg><span class="where-txt"></span></span>
      </div>
      <div class="t-state"><span class="t-pill"><svg class="gl" aria-hidden="true"><use href="#g-flight"/></svg><span class="label">${phrase("first flight")}</span></span><span class="when"></span></div>
      <div class="t-chips"></div>
      <p class="summary"></p>
    </div>
    <div class="well"><div class="spawn">
      <div class="step"><span class="blink"></span><span class="step-txt"></span></div>
      <div class="bar"><i></i></div>
      <p class="wait">${phrase("the card fills in as soon as it answers")}</p>
      <p class="notice"></p>
      <button class="btn b-forget" style="display:none">${phrase("take off the screen")}</button>
    </div></div>`;
  el.querySelector(".b-forget").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await fetch("/api/spawning/forget", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: it.id }) });
    pull();
  });
  return el;
}

function updateJob(el, it, pos) {
  const side = jobSideOf(el, it);
  el.classList.toggle("focused", pos === st.focus);
  el.classList.toggle("bad", !!it.error);
  if (raycastOn()) side.show({ ...jobViewModel(it), ...raycastJob(it) });
  else side.show(jobViewModel(it));
  el.querySelector(".step-txt").textContent = it.error ? phrase("failed") : `${it.step}…`;
  el.querySelector(".blink").style.display = it.error ? "none" : "";
  el.querySelector(".notice").textContent = it.error || "";
  el.querySelector(".b-forget").style.display = it.error ? "" : "none";
}

st.jobSide = null;

const jobSides = new WeakMap();

function jobViewModel(it) {
  return {
    name: it.naming ? "" : it.name || phrase("naming the mission…"),
    sub: it.error ? phrase("did not start") : phrase("opening the chat"),
    where: it.where,
    whereIcon: it.where === "local" ? "#i-local" : "#i-cloud",
    glyph: it.error ? "#g-needs" : "#g-flight",
    label: it.error ? phrase("failed to start") : phrase("starting"),
    when: sinceStart(it.at),
    summary: { text: it.mission || phrase("no mission written"), empty: !it.mission },
    chips: [
      it.model ? { key: "model", cls: "model", title: it.model, text: it.model } : null,
      { key: "where", cls: it.where, title: it.where, icon: it.where === "local" ? "#i-local" : "#i-cloud", text: it.where },
      it.repo ? { key: "repo", cls: "", title: it.repo, text: it.repo } : null
    ].filter(Boolean)
  };
}

function raycastJob(it) {
  return {
    raycast: true,
    dot: it.error ? "failed" : "opening",
    say: it.error ? phrase("did not start") : [phrase("first flight"), sinceStart(it.at)].filter(Boolean).join(" · ")
  };
}

function jobSideOf(el, it) {
  let side = jobSides.get(el);
  if (!side) {
    side = st.jobSide(el.querySelector(".side"), jobViewModel(it));
    jobSides.set(el, side);
  }
  return side;
}

const tileNodes = new WeakMap();

function nodeOf(el, selector) {
  let known = tileNodes.get(el);
  if (!known) {
    known = new Map();
    tileNodes.set(el, known);
  }
  let node = known.get(selector);
  if (node) return node;
  node = el.querySelector(selector);
  if (node) known.set(selector, node);
  return node;
}

function openingSeatOf(it) {
  return { name: it.name, where: it.where || "local", state: "working", model: it.model || "", summary: it.mission || "", when: sinceStart(it.at || Date.now()), structured: true };
}

/* the seat's own tile is born the moment the chat is asked for, in an
   "opening" state, and the job and the seat that follow paint the same
   element: nothing closes and reopens on the way from enter to first word. */
function createOpeningTile(it) {
  const el = createTile(openingSeatOf(it));
  el.classList.add("opening");
  return el;
}

function updateOpening(el, it, pos) {
  const s = openingSeatOf(it);
  const side = tileSideOf(el, s);
  el.dataset.state = it.error ? "needs" : "working";
  el.classList.toggle("focused", pos === st.focus);
  el.classList.toggle("open", st.open === it.key || st.open === it.name);
  el.classList.toggle("bad", !!it.error);
  const label = it.error ? phrase("failed to start") : phrase("starting");
  side.show({
    ...(raycastOn() ? tileViewModel(s, { pos }) : tileViewModel(s)),
    glyph: it.error ? "#g-needs" : "#g-flight",
    label,
    ...(raycastOn() ? { dot: it.error ? "failed" : "opening", say: it.error ? phrase("did not start") : [phrase("first flight"), s.when].filter(Boolean).join(" · ") } : {}),
    summary: { text: it.error || it.mission || phrase("no mission written"), empty: !it.error && !it.mission },
  });
  const badge = el.querySelector(".well .badge");
  if (badge) badge.textContent = it.error ? phrase("did not start") : `${it.step || phrase("opening the chat")}…`;
}

function update(el, s, pos) {
  el.classList.remove("opening");
  const side = tileSides.get(el);
  const was = el.dataset.state;
  if (was && was !== "needs" && s.state === "needs") knock(el);
  el.dataset.state = s.state;
  el.classList.toggle("focused", pos === st.focus);
  el.classList.toggle("open", st.open === s.name);
  el.classList.toggle("fielded", paneOnField(s.name));
  if (raycastOn()) side.show(tileViewModel(s, { pos }));
  else side.show(tileViewModel(s));
  fitChipsOf(el);
  paintFold(s.name, el);
  el.classList.toggle("typing", st.typing === s.name);
  paintName(el, s);
  nodeOf(el, ".badge").textContent = receiving.get(s.name) || (st.typing === s.name ? phrase("typing here") : (s.verb ? `${s.verb}… ${s.measure}` : phrase("live terminal")));
  paintWellKeys(el, s);
  paintCanopyOfChat(el, s);
  paintDeviceChipOfChat(el, s);
  paintWebChipOfChat(el, s);
  paintPrOfChat(el, s);
  paintInfoOfChat(el, s, tileActions);
  paintDiffOfChat(el, s);
  markArtRows(s.name);
  el.classList.remove("arting");
  paintCockpitOfChat(el, s);
  paintWebOfChat(el, s);
  paintDeviceOfChat(el, s);
  el.classList.toggle("threading", st.threadChat === s.name && st.open === s.name);
  if (st.threadChat === s.name && st.open === s.name) moveThreadPanel(el);
  paintFrontsOfChat(el, s);
  const well = el.querySelector(".well");
  if (s.structured) mountStructured(s, well);
  else mount(getTerminal(s), well);
  paintSlim(s.name, el);
  if (raycastOn()) paintSince(well, s);
}

function paintSince(well, s) {
  const since = well.querySelector(".sv-when");
  if (since) since.textContent = s.when ? phrase("{when} ago", { when: s.when }) : "";
}

st.tileSide = null;

const tileSides = new WeakMap();

function tileChipsModel(s) {
  const chips = (s.trees || []).map((tree) => ({
    key: `tree:${tree.path || tree.repo}`,
    cls: tree.main ? "tree" : "tree apart",
    title: [tree.path, tree.branch, tree.main ? "" : phrase("worktree")].filter(Boolean).join("\n"),
    icon: "#i-tree",
    text: tree.repo,
    twig: shortBranch(tree.branch)
  }));
  if (s.account) chips.push({ key: "acc", cls: "acc", title: s.account, icon: "#i-user", text: s.account });
  const out = st.lentHere.find((k) => k.seat === s.name);
  if (out) chips.push({
    key: "lent", take: s.name, title: phrase("take the keyboard back"),
    html: lentFace(out.with) + phrase(experienceNext() ? "{n} · take back" : "{n} at the keyboard · take it back", { n: esc(out.with) })
  });
  const pr = prsOnCard(s.name).find((one) => !prIsGone(one));
  if (pr) {
    const repo = pr.repo.split("/").pop();
    if (!(s.trees || []).some((tree) => tree.repo === repo)) chips.push({ key: "repo", cls: "repo", title: repo, text: repo });
    chips.push({ key: "pr", cls: "pr", title: `pr #${pr.number}`, icon: "#i-pr", text: `pr #${pr.number}` });
  }
  const memory = memoryChip(s);
  if (memory) chips.push(memory);
  return chips;
}

const middleOf = (text, room = 16) => {
  const said = String(text || "");
  if (said.length <= room) return said;
  const half = (room - 1) / 2;
  return `${said.slice(0, Math.ceil(half))}…${said.slice(said.length - Math.floor(half))}`;
};

function tileHeadChips(s) {
  const heads = [];
  const tree = (s.trees || []).find((one) => !one.main) || (s.trees || [])[0];
  if (tree) heads.push({
    key: `tree:${tree.path || tree.repo}`,
    cls: tree.main ? "tree main" : "tree",
    title: [tree.branch ? `${tree.repo} · ${tree.branch}` : tree.repo, tree.branch ? phrase("click copies the branch") : ""].filter(Boolean).join("\n"),
    icon: "#i-tree",
    text: middleOf(tree.main ? tree.repo : shortBranch(tree.branch) || tree.repo),
    copy: tree.branch || ""
  });
  if (s.where !== "local") heads.push({ key: s.where, cls: s.where, title: s.where, icon: WHERE_ICON[s.where] || "#i-cloud", text: s.where });
  const pr = prsOnCard(s.name).find((one) => !prIsGone(one));
  if (pr) heads.push({ key: "pr", cls: pr.ci === "failed" ? "pr bad" : "pr", title: `${pr.repo.split("/").pop()} #${pr.number}`, icon: "#i-pr", text: `#${pr.number}` });
  const memory = memoryChip(s);
  if (memory) heads.push(memory);
  return heads;
}

const TIMED_STATES = ["working", "stalled"];

function raycastHead(s, pos) {
  const typing = st.typing === s.name;
  const label = typing ? phrase("typing here") : phrase(LABEL[s.state]);
  const live = liveOf(s);
  return {
    raycast: true,
    dot: s.state,
    say: !typing && TIMED_STATES.includes(s.state) && s.when ? `${label} · ${s.when}` : label,
    key: pos >= 0 && pos < 9 ? keyLabel(st.keys.seat, pos + 1) : "",
    keyHint: phrase("jump to this seat"),
    heads: tileHeadChips(s),
    live: { on: !!live.length, badge: liveBadge(s), count: live.length ? String(live.length) : "", age: liveBadge(s).split(" · ")[1] || "", title: liveTitle(s) }
  };
}

function prCardModel(p, here) {
  const says = prSays(p);
  return {
    key: p.key, here,
    bad: !!p.error || p.ci === "failed" || mergeTrouble.has(p.key),
    landed: prIsGone(p),
    repo: p.repo.split("/").pop(),
    number: p.number,
    scale: p.additions || p.deletions ? { added: `+${p.additions || 0}`, gone: `−${p.deletions || 0}` } : null,
    says,
    tone: prTone(p),
    subject: p.title || p.key,
    acts: prActions(p).map((a) => ({
      key: `${p.key}:${a.act}`, pr: p.key, act: a.act, label: a.label,
      tone: a.tone || "", busy: !!a.busy, check: a.check || ""
    }))
  };
}

function tilePrsModel(s) {
  const list = prsOnCard(s.name);
  const full = st.open === s.name;
  const here = st.reviewChat === s.name ? st.openPr : "";
  return {
    cards: (full ? list : list.slice(0, 1)).map((p) => prCardModel(p, p.key === here)),
    more: !full && list.length > 1
      ? phrase("{n} more pull request{n2} — open the seat to see them", { n: list.length - 1, n2: list.length > 2 ? "s" : "" })
      : ""
  };
}

function threadCardModel(t, here) {
  const fresh = freshOf(t);
  const last = t.last || null;
  return {
    key: t.key, link: t.link, here, fresh: !!fresh.length,
    glyph: t.private ? "#i-lock" : "#i-hash",
    channel: String(t.channel || "slack").replace(/^#/, ""),
    opener: t.opener ? phrase("{n} asked", { n: t.opener }) : "",
    news: fresh.length ? `${fresh.length} new` : "nothing new",
    error: t.error ? phrase("could not read it: {n}", { n: t.error }) : "",
    stale: t.stale ? phrase("showing what was read before — {n}", { n: t.stale }) : "",
    asked: t.ask ? previewOf(t.ask, t.names) : "",
    last: last ? { who: last.who, said: previewOf(last, t.names) } : null
  };
}

function tileThreadsModel(s) {
  const list = threadsOfChat(s.name);
  const full = st.open === s.name;
  const here = st.threadChat === s.name ? (threadOfChat(s.name)?.key || "") : "";
  return {
    cards: (full ? list : list.slice(0, 1)).map((t) => threadCardModel(t, t.key === here)),
    more: !full && list.length > 1
      ? phrase("{n} more thread{n2} — open the seat to see them", { n: list.length - 1, n2: list.length > 2 ? "s" : "" })
      : ""
  };
}

const TAB_FILE = [["telas", /canvas|telas|mockup|screens/], ["lente", /lente/]];

const pageTabOf = (one) => one.tab || (TAB_FILE.find(([, pattern]) => pattern.test(artFileOf(one).toLowerCase()))?.[0] || "documento");

const tabRank = (one) => {
  const at = SHELF_TABS.indexOf(pageTabOf(one));
  return at < 0 ? SHELF_TABS.length : at;
};

function onePerPage(name) {
  const bySlug = new Map();
  for (const one of pagesOfChat(name)) {
    const key = one.slug || one.key;
    const kept = bySlug.get(key);
    if (!kept || tabRank(one) < tabRank(kept)) bySlug.set(key, one);
  }
  return [...bySlug.values()];
}

function tilePagesModel(s) {
  const list = onePerPage(s.name);
  const full = st.open === s.name;
  const here = showingArtifact(s.name) ? artifactTabOf(s.name)?.slug || "" : "";
  return {
    cards: (full ? list : list.slice(0, 1)).map((one) => ({
      key: one.key, here: !!here && one.slug === here,
      name: artFileOf(one),
      version: `v${one.n}${one.label ? ` · ${one.label}` : ""}`,
      open: phrase("open"),
      subject: one.title || one.slug || one.path
    })),
    more: !full && list.length > 1
      ? phrase("{n} more page{n2} — open the seat to see them", { n: list.length - 1, n2: list.length > 2 ? "s" : "" })
      : ""
  };
}

function usingOf(s) {
  if (drivingNow(s.name)) return { kind: "browser", icon: "#i-browser", text: phrase("browser") };
  if (s.device?.busy) return { kind: "phone", icon: "#i-phone", text: phrase("phone") };
  return null;
}

function tileViewModel(s, raycast = null) {
  const live = liveOf(s);
  return {
    sub: {
      text: s.errand ? `${s.errand} · ${s.name}` : `${s.name}${s.model ? " · " + s.model : ""}`,
      ofErrand: !!s.errand,
      hint: s.errand ? phrase("part of what you asked: {asked}", { asked: s.asked || s.errand }) : ""
    },
    account: s.account || "",
    accountHint: s.account ? phrase('signed in as the account "{account}"', { account: s.account }) : "",
    where: s.where,
    whereIcon: s.where === "local" ? "#i-local" : "#i-cloud",
    place: { cls: s.where === "local" ? "local" : "cloud", icon: s.where === "local" ? "#i-local" : WHERE_ICON[s.where] || "#i-cloud", title: s.where },
    glyph: st.typing === s.name ? "#g-typing" : "#" + GLYPH[s.state],
    label: st.typing === s.name ? phrase("you're typing") : phrase(PILL_LABEL[s.state]),
    using: usingOf(s),
    live: { on: !!live.length, badge: liveBadge(s), title: liveTitle(s) },
    when: s.when,
    whereChip: s.where === "local" ? null
      : { key: s.where, cls: s.where, title: s.where, icon: WHERE_ICON[s.where] || "#i-cloud", text: s.where },
    chips: tileChipsModel(s),
    summary: {
      text: s.summary || s.description || phrase("no status written yet — only the terminal speaks for it"),
      empty: !s.summary && !s.description
    },
    threads: tileThreadsModel(s),
    prs: tilePrsModel(s),
    pages: tilePagesModel(s),
    sections: { threads: phrase("Slack threads"), prs: phrase("Pull requests"), pages: phrase("Pages") },
    tags: {
      web: phrase("open the browser here"),
      phone: phrase("open the phone here"),
      edit: phrase("rename this chat — empty gives the seat name back"),
      editShort: phrase("rename this chat"),
      fold: phrase("fold the status away — the terminal takes the room"),
      home: canGiveBack() ? phrase("put this seat back in the grid") : "",
      min: phrase("Back to all chats (esc)"),
      close: phrase("close this seat"),
      grip: st.open === s.name ? phrase("Back to all chats (esc)") : phrase("open this chat — drag to reorder"),
      canopy: phrase("its browser cockpit"),
      device: phrase("its device"),
      page: phrase("the page this seat has open — open the pane to watch it")
    },
    acts: {
      back: phrase("back (esc)"),
      reconnect: phrase("reconnect ({n})", { n: keyLabel(st.keys.reconnect) }),
      kill: phrase("kill session")
    },
    ...(raycast ? raycastHead(s, raycast.pos) : {})
  };
}

function tileActions(s) {
  return {
    rename: () => startRename(s.name),
    titleClick: (ev) => {
      if (!behaviorOn("titleClick")) return;
      ev.stopPropagation();
      startRename(s.name);
    },
    browser: () => openBrowser(s.name),
    phone: () => startDevice(s.name),
    fold: () => toggleFold(s.name),
    giveBack: () => giveSeatBack(s.name),
    close: (at) => closeSeat(seatNow(s), at),
    back: () => closeTile(),
    reconnect: () => reconnect(s.name),
    takeBack: (seat) => takeKeyboardBack(seat),
    memory: (state, chip) => memoryChipClick(s.name, state, chip),
    copy: (text, chip) => {
      void toClipboard(text).then((ok) => {
        if (!ok) return;
        chip.dataset.said = phrase("copied");
        clearTimeout(chip.saidTimer);
        chip.saidTimer = setTimeout(() => delete chip.dataset.said, 1500);
      });
    },
    openSeat: () => openTile(s.name),
    expand: () => (st.open === s.name ? closeTile() : openTile(s.name)),
    openThread: (key) => openThreadOf(s.name, key),
    openPage: (key) => {
      const one = pagesOfChat(s.name).find((x) => x.key === key);
      if (one) openKeptPage(s.name, one);
    },
    goToPr: (key) => {
      const p = st.prs.find((x) => x.key === key);
      if (p) goToPr(p);
    },
    prAct: (key, act, check, btn) => {
      const p = st.prs.find((x) => x.key === key);
      if (!p) return;
      if (act === "merge") return mergePr(p, btn);
      if (act === "force") return mergePr(p, btn, true);
      if (act === "rerun") return rerunChecks(p, true, btn);
      if (act === "forget") return hidePr(p);
      if (act === "branch") return deleteBranch(p, btn);
      st.openCheck = check || "";
      st.prTab = "checks";
      goToPr(p);
    }
  };
}

const HEADER_HEIGHTS = { "t-head": "--t-head-h", "t-state": "--t-state-h", "t-chips": "--t-chips-h" };

function measureHeader(side) {
  const heights = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const part = Object.keys(HEADER_HEIGHTS).find((name) => target.classList.contains(name));
      side.style.setProperty(HEADER_HEIGHTS[part], `${target.offsetHeight}px`);
    }
  });
  for (const part of side.querySelectorAll(":scope > :is(.t-head, .t-state, .t-chips)")) heights.observe(part);
}

const chipsFit = (el) => experienceNext() && !el.classList.contains("open");

function fitChipsOf(el) {
  const row = nodeOf(el, ".t-chips");
  if (row) fitChipRow(row, chipsFit(el));
}

let chipRows = null;

function watchChipRow(row) {
  chipRows ||= new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const el = target.closest(".tile");
      if (el) fitChipRow(target, chipsFit(el));
    }
  });
  chipRows.observe(row);
}

function tileSideOf(el, s) {
  let side = tileSides.get(el);
  if (!side) {
    side = st.tileSide(el.querySelector(".side"), tileViewModel(s), tileActions(s));
    tileSides.set(el, side);
    measureHeader(el.querySelector(".side"));
    const row = el.querySelector(".side .t-chips");
    if (row) watchChipRow(row);
    tileNodes.delete(el);
  }
  return side;
}

solidMounts.push((hive) => {
  st.tileSide = hive.mountTileSide;
  st.jobSide = hive.mountJobSide;
  st.fileSide = hive.mountFileSide;
  st.blankSide = hive.mountBlank;
});

const PR_GONE = ["merged", "closed"];

const prIsGone = (p) => PR_GONE.includes(p.state);

const merging = new Map();

const mergeTrouble = new Map();

const branchTrouble = new Map();

const MERGE_BUSY = {
  now: { act: "merging…", says: "merging…" },
  auto: { act: "scheduling…", says: "scheduling the merge…" }
};

const MERGE_ARMED = "merge armed";

const MERGE_ARMED_LONG = "merge armed — it lands when CI passes";

const MERGE_LANDING_WAIT = 45000;

const SPINNER = '<i class="spinner" aria-hidden="true"></i>';

const chatOfPr = (p) => (p?.session && st.blocks.some((b) => b.keys.includes(p.session)) ? p.session : "");

const chatOfThread = (t) => (t?.session && st.blocks.some((b) => b.keys.includes(t.session)) ? t.session : "");

let prsMemoOf = null;

let prsMemo = new Map();

function prsOfChat(name) {
  if (prsMemoOf !== st.prs) {
    prsMemoOf = st.prs;
    prsMemo = new Map();
  }
  let list = prsMemo.get(name);
  if (!list) {
    list = st.prs
      .filter((p) => p.session === name)
      .sort((a, b) => Number(prIsGone(a)) - Number(prIsGone(b)));
    prsMemo.set(name, list);
  }
  return list;
}

const landedSeen = (() => {
  try { return JSON.parse(localStorage.getItem("hive.prs.landed.seen") || "{}"); }
  catch { return {}; }
})();

const saveLandedSeen = () => localStorage.setItem("hive.prs.landed.seen", JSON.stringify(landedSeen));

function markLandedSeen(keys) {
  let fresh = false;
  for (const key of keys) {
    if (!key || landedSeen[key]) continue;
    landedSeen[key] = true;
    fresh = true;
  }
  if (fresh) saveLandedSeen();
  return fresh;
}

function markSeatLandedSeen(name) {
  return markLandedSeen(prsOfChat(name).filter(prIsGone).map((p) => p.key));
}

function prsOnCard(name) {
  const here = st.open === name;
  return prsOfChat(name).filter((p) => !prIsGone(p) || here || !landedSeen[p.key]);
}

function prOfChat(name) {
  return prsOfChat(name)[0] || null;
}

const CI_MARK = { passed: svgIcon("i-check"), failed: svgIcon("i-x"), running: svgIcon("g-working"), none: "·" };

function brokenCheck(p) {
  return (p.checks || []).find((c) => c.state === "failed") || null;
}

function prSays(p) {
  if (merging.has(p.key)) return phrase(MERGE_BUSY[merging.get(p.key)].says);
  if (p.error) return p.error;
  if (prIsGone(p)) return branchTrouble.get(p.key) || p.state;
  if (mergeTrouble.has(p.key)) return mergeTrouble.get(p.key);
  if (p.state === "draft") return phrase("draft");
  if (p.mergeable === "conflicting") return phrase("conflict with the base");
  if (p.ci === "failed") return phrase("{check} failed", { check: brokenCheck(p)?.name || phrase("a check") });
  if (p.autoMerge) return phrase(MERGE_ARMED);
  if (p.ci === "running") return phrase("{what} running", { what: p.ciDetail || phrase("checks") });
  if (p.review === "changes_requested") return phrase("changes requested");
  return p.ciDetail || (p.ci === "none" ? phrase("no ci") : "");
}

function prTone(p) {
  if (merging.has(p.key) || p.autoMerge || p.ci === "running") return "running";
  if (p.error || mergeTrouble.has(p.key) || p.mergeable === "conflicting" || p.ci === "failed" || p.review === "changes_requested") return "bad";
  if (prIsGone(p) || p.state === "draft") return "quiet";
  if (p.ci === "passed") return "ok";
  return "quiet";
}

function prActions(p) {
  if (p.error) return [];
  if (prIsGone(p)) {
    const forget = { act: "forget", label: phrase("take off the list") };
    return p.branchLeft ? [{ act: "branch", label: phrase("delete branch"), tone: "warn" }, forget] : [forget];
  }
  if (merging.has(p.key)) return [{ act: "merge", label: phrase(MERGE_BUSY[merging.get(p.key)].act), busy: true }];
  const broken = brokenCheck(p);
  if (broken) {
    const acts = [{ act: "log", label: phrase("see the log"), tone: "warn", check: broken.name }];
    if (broken.run) acts.push({ act: "rerun", label: phrase("rerun") });
    return acts;
  }
  const way = mergeState(p);
  if (!way || way.locked || way.confirm) return [];
  const force = { act: "force", label: phrase("force merge"), tone: "warn" };
  if (way.armed) return way.force ? [force] : [];
  const acts = [{ act: "merge", label: way.label, tone: way.ready ? "ready" : "" }];
  if (way.force) acts.push(force);
  return acts;
}

const PR_WAITS_ON_YOU = 1;

const PR_LANDED = 4;

function prUrgency(p) {
  if (prIsGone(p)) return PR_LANDED;
  if (p.error || p.ci === "failed") return 0;
  if (p.mergeable === "conflicting" || p.review === "changes_requested") return 1;
  if (mergeState(p)?.ready) return 1;
  if (p.ci === "running") return 2;
  return 3;
}

function prsWorthShowing() {
  return [...st.prs].sort((a, b) => prUrgency(a) - prUrgency(b) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function paintPrButton() {
  const btn = $("btn-prs");
  if (!btn) return;
  const live = st.prs.filter((p) => p.state === "open" || p.state === "draft");
  btn.hidden = st.prs.length === 0;
  if (raycastOn()) btn.title = `${phrase("the pull requests the hive is watching")} · ${keyHint("prs")}`;
  else btn.classList.toggle("hot", live.filter((p) => p.ci === "failed").length > 0);
  prButtonSolid.show(prButtonViewModel());
}

let prButtonSolid = null;

function raycastPrButton() {
  const live = st.prs.filter((p) => p.state === "open" || p.state === "draft");
  const broken = live.filter((p) => p.ci === "failed").length;
  const waiting = live.filter((p) => prUrgency(p) <= PR_WAITS_ON_YOU).length;
  const running = live.filter((p) => p.ci === "running").length;
  const shown = live.length || st.prs.length;
  if (broken) return { key: "prbtn", rc: true, tone: "needs", lead: String(broken), word: broken === 1 ? phrase("PR failing") : phrase("PRs failing") };
  if (waiting) return { key: "prbtn", rc: true, tone: "done", lead: String(waiting), word: waiting === 1 ? phrase("PR ready") : phrase("PRs ready") };
  if (running) return { key: "prbtn", rc: true, tone: "working", lead: String(running), word: running === 1 ? phrase("PR running") : phrase("PRs running") };
  return { key: "prbtn", rc: true, tone: "", lead: String(shown), word: shown === 1 ? "PR" : "PRs" };
}

function prButtonViewModel() {
  if (raycastOn()) return raycastPrButton();
  const live = st.prs.filter((p) => p.state === "open" || p.state === "draft");
  const broken = live.filter((p) => p.ci === "failed").length;
  const waiting = live.filter((p) => prUrgency(p) <= PR_WAITS_ON_YOU).length;
  const shown = live.length || st.prs.length;
  const count = shown === 1 ? "1 PR" : `${shown} PRs`;
  if (broken) return { key: "prbtn", lead: String(broken), word: ` ${phrase("failing")} `, count: `· ${count}` };
  if (waiting) return { key: "prbtn", lead: String(waiting), word: ` ${phrase("ready")} `, count: `· ${count}` };
  return { key: "prbtn", lead: "", word: "", count };
}

solidMounts.push((hive) => {
  prButtonSolid = hive.mountPrButton($("btn-prs"));
});

function prPopOpen() {
  return !$("prpop").hidden;
}

function placePrPop() {
  const pop = $("prpop");
  const host = pop.offsetParent;
  if (!host) return;
  const seat = $("btn-prs").getBoundingClientRect();
  const edge = Math.min(innerWidth - 6, Math.max(seat.right, pop.offsetWidth + 6));
  pop.style.right = `${Math.round(host.getBoundingClientRect().right - edge)}px`;
}

function openPrPop() {
  paintPrPop();
  $("prpop").hidden = false;
  placePrPop();
  $("btn-prs").setAttribute("aria-expanded", "true");
  pullPrs();
}

document.addEventListener("hive:screen", () => closePrPop());

function closePrPop() {
  $("prpop").hidden = true;
  $("prpop").style.right = "";
  $("btn-prs").setAttribute("aria-expanded", "false");
}

function togglePrPop() {
  if (prPopOpen()) return closePrPop();
  openPrPop();
}

function paintPrPop() {
  prPopSolid.show(prPopViewModel());
}

let prPopSolid = null;

const PR_SHELVES = [
  ["waiting on you", 0, PR_WAITS_ON_YOU],
  ["running along", PR_WAITS_ON_YOU + 1, PR_LANDED - 1],
  ["landed — they leave on their own", PR_LANDED, PR_LANDED]
];

function prPopRowModel(p) {
  const gone = prIsGone(p);
  return {
    key: p.key, kind: "pr", prKey: p.key, gone,
    ci: p.error ? "failed" : p.ci || "none",
    mark: p.error ? "!" : CI_MARK[p.ci] || "·",
    where: `${p.repo.split("/").pop()}#${p.number}`,
    flag: gone ? p.state : "",
    seat: p.session ? itemOf(p.session)?.title || p.session : phrase("no chat"),
    seatNone: !p.session,
    when: p.updatedAt ? phrase("{when} ago", { when: ago(p.updatedAt) }) : "",
    subject: p.title || p.error || p.key,
    why: p.error || gone ? "" : prSays(p),
    acts: prActions(p).map((a) => ({
      key: `${p.key}/${a.act}`, act: a.act, tone: a.tone || "", busy: !!a.busy,
      check: a.check || "", label: a.label
    }))
  };
}

function prPopViewModel() {
  const list = prsWorthShowing();
  if (!list.length) {
    return {
      key: "prpop", empty: true, count: "", bad: false,
      rows: [{ key: "pp-empty", kind: "empty", text: phrase("No pull request in the hive. One shows up here the moment a session opens it.") }]
    };
  }
  const rows = [];
  for (const [name, from, to] of PR_SHELVES) {
    const shelf = list.filter((p) => prUrgency(p) >= from && prUrgency(p) <= to);
    if (!shelf.length) continue;
    rows.push({ key: `sec/${name}`, kind: "sec", text: phrase(name) });
    for (const p of shelf) rows.push(prPopRowModel(p));
  }
  const broken = list.filter((p) => !prIsGone(p) && p.ci === "failed").length;
  return { key: "prpop", empty: false, rows, count: broken ? phrase("{n} failing", { n: broken }) : "", bad: broken > 0 };
}

solidMounts.push((hive) => {
  prPopSolid = hive.mountPrPop($("prpop"), {
    actions: {
      open: (key) => {
        const p = st.prs.find((y) => y.key === key);
        if (p) goToPr(p);
      },
      act: (key, act, check, el) => {
        const p = st.prs.find((y) => y.key === key);
        if (!p) return;
        if (act === "merge") return mergePr(p, el);
        if (act === "force") return mergePr(p, el, true);
        if (act === "rerun") return rerunChecks(p, true, el);
        if (act === "forget") return hidePr(p);
        if (act === "branch") return deleteBranch(p, el);
        st.openCheck = check || "";
        st.prTab = "checks";
        goToPr(p);
      }
    }
  });
});

function goToPr(p) {
  if (prIsGone(p)) markLandedSeen([p.key]);
  closePrPop();
  if (finishOn()) closeFinish();
  if (experienceNext()) return openPrInASeat(p);
  st.openPr = p.key;
  st.openFile = null;
  if (chatOfPr(p)) return reviewInChat(p.session, p.key);
  if (!prsOnScreen()) openPrs();
  paintPrs();
}

function prWindowOf(el) {
  const win = document.createElement("section");
  win.className = "pr-window";
  win.innerHTML = `
    <div class="pr-win-head">
      <span class="num"></span>
      <span class="st"></span>
      <button class="art-btn first pr-win-out">${phrase("open on GitHub")}</button>
      <button class="art-btn shut pr-win-shut" aria-label="${phrase("close the review")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </div>
    <div class="pr-win-body"></div>`;
  win.addEventListener("click", (ev) => ev.stopPropagation());
  win.querySelector(".pr-win-shut").addEventListener("click", exitReview);
  win.querySelector(".pr-win-out").addEventListener("click", () => {
    const p = st.prs.find((x) => x.key === st.openPr);
    if (p?.url) window.open(p.url, "_blank");
  });
  el.appendChild(win);
  return win;
}

function paintPrOfChat(el, s) {
  const reviewing = st.reviewChat === s.name && !!prsOfChat(s.name).length;
  el.classList.toggle("reviewing", reviewing);
  const had = el.querySelector(".pr-window");
  if (!reviewing) { if (had) { movePrPanel($("prs")); had.remove(); } return; }
  const win = had || prWindowOf(el);
  movePrPanel(win.querySelector(".pr-win-body"));
  const p = st.prs.find((x) => x.key === st.openPr) || prOfChat(s.name);
  const says = p ? prSays(p) : "";
  win.querySelector(".num").textContent = p ? `${p.repo.split("/").pop()}#${p.number}` : "";
  const own = win.querySelector(".st");
  own.textContent = says;
  own.hidden = !says;
  own.classList.toggle("bad", !!p && (!!p.error || p.ci === "failed"));
}

function threadsOfChat(name) {
  return st.threads.filter((t) => t.session === name);
}

function threadOfChat(name) {
  const list = threadsOfChat(name);
  return list.find((t) => t.key === st.openThread) || list[0] || null;
}

function readSeenThreads() {
  try { return JSON.parse(localStorage.getItem("hive.threads.seen") || "{}"); }
  catch { return {}; }
}

const seenThreads = readSeenThreads();

const saveSeenThreads = () => localStorage.setItem("hive.threads.seen", JSON.stringify(seenThreads));

function freshOf(t) {
  const said = t.said || [];
  const mark = seenThreads[t.key];
  if (mark) return said.filter((m) => !m.mine && m.ts > mark);
  return t.newFrom ? said.filter((m) => !m.mine && m.ts >= t.newFrom) : [];
}

function markThreadSeen(t) {
  if (!t?.newest) return;
  if (seenThreads[t.key] === t.newest) return;
  seenThreads[t.key] = t.newest;
  saveSeenThreads();
}

const CHANNEL_GLYPH = (t) => `<svg aria-hidden="true"><use href="#${t.private ? "i-lock" : "i-hash"}"/></svg><span>${esc(String(t.channel || "slack").replace(/^#/, ""))}</span>`;

export { forgetPalActs, hideUntilItWorks, menuKeys, menuShow, menuStop, seatSpot, branchTrouble, CHANNEL_GLYPH, CI_MARK, MERGE_ARMED, MERGE_ARMED_LONG, MERGE_BUSY, MERGE_LANDING_WAIT, PR_GONE, PR_LANDED, PR_SHELVES, PR_WAITS_ON_YOU, SPINNER, blockMenuRows, brokenCheck, chatOfPr, chatOfThread, closeBlock, closeFinish, closePrPop, closeSeatMenu, closeSpace, spaceCloseNote, createJobTile, createOpeningTile, createTile, updateOpening, finishMeta, finishOn, finishWarnings, freshOf, goToPr, helloTeam, jobSideOf, jobSides, jobViewModel, landedSeen, markLandedSeen, markSeatLandedSeen, markThreadSeen, menuSolid, menuViewModel, mergeTrouble, merging, nodeOf, openBlockMenu, openFinish, openFinishOf, openPrPop, openSeatMenu, openSpaceMenu, openTeamMenu, paintMenu, paintPrButton, paintPrOfChat, paintPrPop, placePrPop, pokeTeam, prActions, prButtonSolid, prButtonViewModel, prCardModel, prIsGone, prOfChat, prPopOpen, prPopRowModel, prPopSolid, prPopViewModel, prSays, prUrgency, prWindowOf, prsMemo, prsMemoOf, prsOfChat, prsOnCard, prsWorthShowing, readSeenThreads, renameSpace, saveLandedSeen, saveSeenThreads, seatMenuOn, seatMenuRows, seenThreads, sinceStart, spaceMenuRows, teamMenuRows, threadCardModel, threadOfChat, threadsOfChat, tileActions, tileChipsModel, tileNodes, tilePagesModel, tilePrsModel, tileSideOf, tileSides, tileThreadsModel, tileViewModel, togglePrPop, update, updateJob };

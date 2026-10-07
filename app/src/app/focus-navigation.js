import { render } from "./arrange.js";
import { activeItems, attachSeat, bringSeatIn, blocksOf, detached, landOnBlock, moveToNewBlock, saveBlockAt, saveSpaceAt, spaceAt } from "./blocks.js";
import { reloadConfig } from "./brand-face.js";
import { driveBrowsers, openBrowser, openCockpit, openDevice, stopDeviceFrames } from "./chat-and-panes.js";
import { keepStructuredUp, soakDrafts } from "./chat-stretches.js";
import { announceCanopy, announceChange } from "./chimes-and-notices.js";
import { $, GLYPH, LABEL, ORDER, PILL_LABEL, apiGet, batch, markFinishSeen, paneOfSeat, perf, phrase, raycastOn, st } from "./core.js";
import { disarmLeader, markSeatRead, pool, receiving, stateOf, tiles } from "./leader-key.js";
import { paintLimitChip } from "./limit-chip.js";
import { calmly } from "./pure-helpers.js";
import { inARow, inAStrip } from "./seat-layout.js";
import { markSeatLandedSeen, threadsOfChat } from "./seat-menu.js";
import { takeShelfThumbs } from "./shelf-thumbs.js";
import { stepAcrossLanes } from "./strip.js";
import { structPool } from "./structured-seats.js";
import { keepTerminalsUp } from "./terminal-history.js";
import { exitReview, openThreadOf, reviewInChat } from "./thread.js";
import { swapSeats } from "./tiles.js";

const RAYCAST_CLOCK = { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };

function focusSeat(name) {
  markSeatRead(name);
  const i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0) return false;
  const at = Math.max(0, st.blocks[i].keys.indexOf(name));
  if (st.block === i && st.focus === at) return false;
  st.block = i;
  st.focus = at;
  saveBlockAt(i);
  return true;
}

function takeKeyboard(name, callIt) {
  st.typing = name;
  markSeatRead(name);
  focusSeat(name);
  render();
  const se = structPool.get(name);
  if (se) se.host.querySelector("textarea")?.focus();
  else pool.get(name)?.term.focus();
}

function releaseKeyboard(focusBody = true) {
  if (!st.typing) return;
  const name = st.typing;
  const e = pool.get(name);
  const se = structPool.get(name);
  st.typing = null;
  try { e?.term.blur(); } catch {}
  try { se?.host.querySelector("textarea")?.blur(); } catch {}
  if (focusBody) document.body.focus();
  document.body.classList.remove("typing-on");
  const el = tiles.get(name);
  if (!el) return;
  el.classList.remove("typing");
  const s = st.data.sessions.find((one) => one.name === name);
  if (!s) return;
  if (raycastOn()) el.querySelector(".t-say").textContent = phrase(LABEL[s.state]);
  else {
    el.querySelector(".t-pill .label").textContent = phrase(PILL_LABEL[s.state]);
    el.querySelector(".t-pill use")?.setAttribute("href", `#${GLYPH[s.state]}`);
  }
  el.querySelector(".badge").textContent = receiving.get(name) || (s.verb ? `${s.verb}… ${s.measure}` : phrase("live terminal"));
}

function keyboardHome() {
  if (!st.typing) return null;
  return tiles.get(st.typing) || null;
}

function clickLeavesKeyboard(target) {
  const home = keyboardHome();
  return !!home && !home.contains(target);
}

document.addEventListener("click", (ev) => {
  disarmLeader();
  if (clickLeavesKeyboard(ev.target)) releaseKeyboard(false);
}, true);

function goToBlock(i) {
  if (i < 0 || i >= st.blocks.length) return;
  releaseKeyboard();
  keepPane();
  st.mirrorDev = "";
  const sideways = st.blocks[i].ws === st.space && i !== st.block;
  const lift = st.blocks[i].ws !== st.space ? (st.spaces.findIndex((x) => x.id === st.blocks[i].ws) > spaceAt() ? 1 : -1) : 0;
  st.block = i; st.focus = 0; st.open = null;
  if (st.blocks[i].ws !== st.space) { st.space = st.blocks[i].ws; saveSpaceAt(); }
  saveBlockAt(i);
  render();
  if (sideways) slideCanvas();
  if (lift) liftCanvas(lift > 0);
}

let canvasSlide = 0;

function slideCanvas() {
  const c = $("canvas");
  if (!c || calmly()) return;
  clearTimeout(canvasSlide);
  c.classList.remove("slid");
  void c.offsetWidth;
  c.classList.add("slid");
  canvasSlide = setTimeout(() => c.classList.remove("slid"), 260);
}

let canvasLift = 0;

function liftCanvas(up) {
  const c = $("canvas");
  if (!c || calmly()) return;
  clearTimeout(canvasLift);
  c.classList.remove("rose", "sank");
  void c.offsetWidth;
  c.classList.add(up ? "rose" : "sank");
  canvasLift = setTimeout(() => c.classList.remove("rose", "sank"), 300);
}

function goToSpace(id) {
  const w = st.spaces.find((x) => x.id === id);
  if (!w || w.id === st.space) return;
  const up = st.spaces.findIndex((x) => x.id === w.id) > spaceAt();
  releaseKeyboard();
  keepPane();
  st.mirrorDev = "";
  st.space = w.id;
  st.focus = 0;
  st.open = null;
  st.block = st.blocks.findIndex((b) => b.ws === st.space);
  saveSpaceAt();
  saveBlockAt(st.block);
  render();
  liftCanvas(up);
}

function reclaimSeat(name) {
  if (!detached.has(name)) return false;
  window.hiveSeatWindow?.close?.(name);
  attachSeat(name);
  return true;
}

function goTo(name) {
  let i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0 && (reclaimSeat(name) || bringSeatIn(name))) i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0) return;
  releaseKeyboard();
  st.mirrorDev = "";
  if (st.blocks[i].ws !== st.space) { st.space = st.blocks[i].ws; saveSpaceAt(); }
  st.block = i;
  st.focus = Math.max(0, st.blocks[i].keys.indexOf(name));
  saveSpaceAt();
  saveBlockAt(i);
  if (st.open && st.open !== name) {
    keepPane();
    st.open = name;
    render();
    return restorePane(name);
  }
  render();
}

function goToBlockAt(i) {
  const mine = blocksOf(st.space);
  if (!(i >= 0 && i < mine.length)) return;
  goToBlock(st.blocks.indexOf(mine[i]));
}

function goToSpaceAt(i) {
  if (!(i >= 0 && i < st.spaces.length)) return;
  goToSpace(st.spaces[i].id);
}

function goToSeat(i) {
  const list = activeItems();
  if (i < 0 || i >= list.length) return;
  releaseKeyboard();
  st.focus = i;
  if (st.open) {
    keepPane();
    st.open = list[i].kind === "session" ? list[i].name : null;
    render();
    return st.open ? restorePane(st.open) : undefined;
  }
  render();
}

const GRID_ROWS = { 1: [[0]], 2: [[0, 1]], 3: [[0, 2], [1, 2]], 4: [[0, 1], [2, 3]], 5: [[0, 1, 2], [3, 4]], 6: [[0, 1, 2], [3, 4, 5]] };

const gridRows = (n) => (inARow() || inAStrip() ? [Array.from({ length: n }, (_, i) => i)] : GRID_ROWS[n]);

function stepFocus(dx, dy) {
  const list = activeItems();
  const rows = gridRows(Math.min(st.LIMIT, list.length));
  if (!rows) return;
  const r = rows.findIndex((row) => row.includes(st.focus));
  if (r < 0) return;
  const y = r + dy, x = rows[r].indexOf(st.focus) + dx;
  if (inAStrip() && dy === 0 && (x < 0 || x >= rows[r].length)) {
    if (stepAcrossLanes(dx)) render();
    return;
  }
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return;
  const target = rows[y][x];
  if (target === st.focus) return;
  goToSeat(target);
  if (st.moveMode === "type" && list[target]?.kind === "session") takeKeyboard(list[target].name);
}

function stepBlock(d) {
  const mine = blocksOf(st.space);
  const at = mine.indexOf(st.blocks[st.block]);
  const to = at + d;
  if (at >= 0 && to >= 0 && to < mine.length) return goToBlock(st.blocks.indexOf(mine[to]));
  const w = spaceAt() + d;
  if (w < 0 || w >= st.spaces.length) {
    if (mine.length < 2 || at < 0) return;
    return goToBlock(st.blocks.indexOf(mine[(at + d + mine.length) % mine.length]));
  }
  const next = blocksOf(st.spaces[w].id);
  const target = d < 0 ? next[next.length - 1] : next[0];
  if (target) return goToBlock(st.blocks.indexOf(target));
  goToSpace(st.spaces[w].id);
}

function focusedSeatName() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  return it?.kind === "session" ? it.name : null;
}

function sendSeatToBlockAt(i) {
  const name = focusedSeatName();
  const mine = blocksOf(st.space);
  if (!name || !(i >= 0 && i < mine.length)) return;
  if (landOnBlock(name, st.blocks.indexOf(mine[i]))) goTo(name);
}

function stepSendSeat(d) {
  const name = focusedSeatName();
  if (!name) return;
  const mine = blocksOf(st.space);
  const at = mine.findIndex((b) => b.keys.includes(name));
  if (at < 0) return;
  const to = at + d;
  if (to >= mine.length) {
    moveToNewBlock(name);
    return goTo(name);
  }
  sendSeatToBlockAt(to);
}

function stepMove(dx, dy) {
  const list = activeItems();
  const it = list[st.focus];
  if (!it) return;
  const rows = gridRows(Math.min(st.LIMIT, list.length));
  const r = rows ? rows.findIndex((row) => row.includes(st.focus)) : -1;
  if (r >= 0) {
    const y = r + dy, x = rows[r].indexOf(st.focus) + dx;
    if (y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] !== st.focus) {
      const target = list[rows[y][x]];
      if (target) swapSeats(it.key, target.key);
      return;
    }
  }
  if (dy !== 0) return;
  const neighbor = st.blocks[st.block + dx];
  const edge = neighbor && (dx < 0 ? neighbor.keys[neighbor.keys.length - 1] : neighbor.keys[0]);
  if (edge) swapSeats(it.key, edge);
}

function openTile(name, restore = true) {
  markSeatRead(name);
  markFinishSeen(name);
  markSeatLandedSeen(name);
  let i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0 && (reclaimSeat(name) || bringSeatIn(name))) i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0) return;
  keepPane();
  if (st.cockChat && st.cockChat !== name) st.cockChat = null;
  if (st.webChat && st.webChat !== name) st.webChat = null;
  if (st.deviceChat && st.deviceChat !== name) { st.deviceChat = null; stopDeviceFrames(); }
  st.open = name;
  st.block = i;
  st.focus = Math.max(0, st.blocks[i].keys.indexOf(name));
  render();
  if (restore) restorePane(name);
}

function closeTile() {
  keepPane();
  st.cockChat = null;
  st.webChat = null;
  if (st.deviceChat) { st.deviceChat = null; stopDeviceFrames(); }
  if (st.reviewChat) exitReview();
  st.open = null;
  render();
}

function keepPane() {
  const name = st.open;
  if (!name) return;
  if (st.cockChat === name) paneOfSeat.set(name, { kind: "cockpit" });
  else if (st.webChat === name) paneOfSeat.set(name, { kind: "browser" });
  else if (st.deviceChat === name) paneOfSeat.set(name, { kind: "device" });
  else if (st.threadChat === name) paneOfSeat.set(name, { kind: "thread", key: st.openThread });
  else if (st.reviewChat === name) paneOfSeat.set(name, { kind: "review", key: st.openPr });
  else paneOfSeat.delete(name);
}

const paneHere = (name) => st.cockChat === name || st.webChat === name || st.deviceChat === name || st.threadChat === name || st.reviewChat === name;

function restorePane(name) {
  const pane = paneOfSeat.get(name);
  if (!pane || paneHere(name)) return;
  if (pane.kind === "cockpit") return openCockpit(name);
  if (pane.kind === "browser") return openBrowser(name);
  if (pane.kind === "device") return openDevice(name);
  if (pane.kind === "thread") return threadsOfChat(name).some((t) => t.key === pane.key) ? openThreadOf(name, pane.key) : undefined;
  if (pane.kind === "review") return st.prs.some((p) => p.key === pane.key) ? reviewInChat(name, pane.key) : undefined;
}

async function pull() {
  try {
    const raw = await apiGet("/api/hive");
    for (const s of raw.sessions) { s.raw = s.state; s.state = stateOf(s); }
    raw.sessions.sort((a, b) => (ORDER[a.state] - ORDER[b.state]) || a.name.localeCompare(b.name));
    const hive = withoutClock(raw);
    const shape = JSON.stringify(hive);
    batch(() => {
      if (shape !== hiveShape) st.data = hive;
      hiveShape = shape;
      st.seatsKnown = true;
    });
    soakDrafts();
    takeShelfThumbs(raw.thumbs);
    if (raw.configAt !== undefined && raw.configAt !== st.cfgStamp && !st.capturing) {
      const first = st.cfgStamp === "";
      st.cfgStamp = raw.configAt;
      if (!first) reloadConfig();
    }
    if (!document.hidden) {
      $("clock").textContent = new Date().toLocaleTimeString(undefined, raycastOn() ? RAYCAST_CLOCK : { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      driveBrowsers();
      const seen = pollKey(raw, Date.now());
      if (seen === pollSeen) perf.skip("poll");
      else {
        pollSeen = seen;
        render();
      }
      paintLimitChip();
    }
    announceChange();
    announceCanopy();
  } catch { $("clock").textContent = phrase("no connection"); }
  keepTerminalsUp();
  keepStructuredUp();
}

let pollSeen = "";

let hiveShape = "";

const POLL_STILL = 30000;

const withoutClock = ({ at, ...answered }) => answered;

function pollKey(raw, now) {
  const beat = (raw.spawning || []).length ? 1 : POLL_STILL;
  return `${Math.floor(now / beat)}|${JSON.stringify(withoutClock(raw))}`;
}

export { GRID_ROWS, POLL_STILL, canvasLift, canvasSlide, clickLeavesKeyboard, closeTile, focusSeat, goTo, goToBlock, goToBlockAt, goToSeat, goToSpace, goToSpaceAt, gridRows, keepPane, keyboardHome, liftCanvas, openTile, paneHere, pollKey, pollSeen, pull, reclaimSeat, releaseKeyboard, restorePane, sendSeatToBlockAt, slideCanvas, stepBlock, stepSendSeat, stepFocus, stepMove, takeKeyboard };

import { render } from "./arrange.js";
import { activeItems } from "./blocks.js";
import { saveConfig } from "./brand-face.js";
import { BLOCK_SIZE_DEFAULT, BLOCK_SIZE_KEY, BLOCK_SIZE_RANGE, raycastOn, st } from "./core.js";
import { focusSeat, pull } from "./focus-navigation.js";
import { pool, tiles } from "./leader-key.js";
import { paintChoices } from "./preferences.js";
import { calmly } from "./pure-helpers.js";
import { structPool } from "./structured-seats.js";
import { refit } from "./terminal-history.js";

const LAYOUT_KEY = "hive.layout";

const LAYOUTS = ["grid", "row", "strip"];

const LAYOUT_NAMES = { grid: "in a grid", row: "side by side, in one row", strip: "every chat in one strip, scrolling sideways" };

st.seatLayout = LAYOUTS[0];

const inARow = () => st.seatLayout === "row";

const inAStrip = () => st.seatLayout === "strip";

const FOCUS_MODE_KEY = "hive.focusMode";

st.focusMode = false;

const inFocusMode = () => st.focusMode;

function bootLayout() {
  let saved = "", focusing = "";
  try {
    saved = localStorage.getItem(LAYOUT_KEY) || "";
    focusing = localStorage.getItem(FOCUS_MODE_KEY) || "";
  } catch {}
  st.seatLayout = LAYOUTS.includes(saved) ? saved : LAYOUTS[0];
  st.focusMode = focusing === "1";
}

function setFocusMode(on) {
  st.focusMode = !!on;
  try { localStorage.setItem(FOCUS_MODE_KEY, st.focusMode ? "1" : ""); } catch {}
  render();
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
}

function watchFocusClicks(canvas) {
  if (canvas.dataset.focusWatched) return;
  canvas.dataset.focusWatched = "1";
  canvas.addEventListener("pointerdown", (ev) => {
    if (!inFocusMode()) return;
    const tile = ev.target.closest?.(".tile");
    if (tile?.parentElement === canvas && tile.dataset.key && focusSeat(tile.dataset.key)) render();
  });
}

function setLayout(id, quiet) {
  st.seatLayout = LAYOUTS.includes(id) ? id : LAYOUTS[0];
  try { localStorage.setItem(LAYOUT_KEY, st.seatLayout); } catch {}
  paintChoices();
  render();
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
  if (quiet) return;
  saveConfig({ layout: st.seatLayout }).catch(() => {});
}

function adoptLayout(r) {
  const wanted = r.config.layout || LAYOUTS[0];
  if (wanted !== st.seatLayout) setLayout(wanted, true);
}

function setBlockSize(n, quiet) {
  n = Math.round(Number(n));
  st.LIMIT = n >= BLOCK_SIZE_RANGE[0] && n <= BLOCK_SIZE_RANGE[1] ? n : BLOCK_SIZE_DEFAULT;
  try { localStorage.setItem(BLOCK_SIZE_KEY, String(st.LIMIT)); } catch {}
  paintChoices();
  render();
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
  if (quiet) return;
  saveConfig({ blockSize: st.LIMIT }).catch(() => {});
}

function adoptBlockSize(r) {
  const wanted = r.config.blockSize || BLOCK_SIZE_DEFAULT;
  if (wanted !== st.LIMIT) setBlockSize(wanted, true);
}

function knock(el) {
  if (calmly()) return;
  el.classList.remove("just-needs");
  void el.offsetWidth;
  el.classList.add("just-needs");
  clearTimeout(el._knock);
  el._knock = setTimeout(() => el.classList.remove("just-needs"), 1500);
}

function born(el) {
  if (calmly()) return;
  el.classList.add("born");
  setTimeout(() => el.classList.remove("born"), 260);
}

function flipStart() {
  if (calmly()) return null;
  const seen = new Map();
  for (const [key, el] of tiles) if (el.isConnected) seen.set(key, el.getBoundingClientRect());
  return seen;
}

function flipEnd(before) {
  const flights = [];
  if (!before || !before.size) return flights;
  for (const [key, el] of tiles) {
    const from = before.get(key);
    const wasHidden = !from || !from.width || !from.height;
    if (wasHidden || !el.isConnected || el.dataset.gone) continue;
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const moved = Math.abs(dx) >= 2 || Math.abs(dy) >= 2;
    const grew = Math.abs(sx - 1) >= 0.01 || Math.abs(sy - 1) >= 0.01;
    if (!moved && !grew) continue;
    const away = grew ? `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` : `translate(${dx}px, ${dy}px)`;
    const flight = el.animate([{ transformOrigin: "top left", transform: away }, { transformOrigin: "top left", transform: "none" }],
      { duration: 420, easing: "cubic-bezier(0.22,0.68,0.36,1)" });
    if (flight) flights.push(flight);
  }
  return flights;
}

const GONE_MS = 210;

function vanish(el) {
  if (calmly() || !el.isConnected || el.dataset.gone) return el.remove();
  const host = el.parentElement;
  const box = el.getBoundingClientRect();
  const around = host.getBoundingClientRect();
  el.dataset.gone = "1";
  el.dataset.wasStyle = el.getAttribute("style") || "";
  el.style.position = "absolute";
  el.style.left = `${box.left - around.left + host.scrollLeft}px`;
  el.style.top = `${box.top - around.top + host.scrollTop}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.pointerEvents = "none";
  el.classList.add("gone");
  setTimeout(() => {
    el.classList.remove("gone");
    if (el.dataset.wasStyle) el.setAttribute("style", el.dataset.wasStyle); else el.removeAttribute("style");
    delete el.dataset.gone;
    delete el.dataset.wasStyle;
    el.remove();
  }, GONE_MS);
}

const WHERE_ICON = { local: "#i-local", cloud: "#i-cloud" };

const shortBranch = (branch) => (String(branch || "").split("/").filter(Boolean).pop() || "").replace(/^-+/, "");

const onASleepingPod = (target) => target.where === "cloud" && !!st.data?.pod?.name && !st.data.pod.up;

async function driverUp(name, within) {
  const end = Date.now() + within;
  while (Date.now() < end) {
    const se = structPool.get(name);
    if (se?.ws?.readyState === 1) return se;
    await new Promise((again) => setTimeout(again, 1500));
  }
  return null;
}

function wakeAndSay(target, text, images = []) {
  fetch("/api/say", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: target.name, where: target.where, text })
  }).then((x) => x.json()).then(async (r) => {
    if (!r?.ok) return;
    await pull();
    if (r.delivered) return;
    const se = await driverUp(target.name, 90000);
    if (!se) return;
    se.type(text, images);
  }).catch(() => {});
  return true;
}

function sendToSeat(target, text, images = []) {
  const se = structPool.get(target.name);
  if (se) {
    if (se.ws?.readyState !== 1) {
      if (onASleepingPod(target)) return wakeAndSay(target, text, images);
      return false;
    }
    se.type(text, images);
    return true;
  }
  const e = pool.get(target.name);
  if (!e || e.ws?.readyState !== 1) {
    if (onASleepingPod(target)) return wakeAndSay(target, text);
    return false;
  }
  e.ws.send(text);
  setTimeout(() => { if (e.ws?.readyState === 1) e.ws.send("\r"); }, 40);
  return true;
}

function openQuestionCard() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  if (it?.kind !== "session") return null;
  const e = structPool.get(it.name);
  if (!e) return null;
  const cards = [...e.asked.values()].filter((c) => c.isConnected && !c.classList.contains("answered"));
  return cards[cards.length - 1] || null;
}

function answerWithDigit(n) {
  const card = openQuestionCard();
  if (!card) return false;
  const btn = card.querySelector(".qstep:not([hidden])")?.querySelectorAll(".qo")[n - 1];
  if (!btn) return false;
  if (raycastOn() && card.classList.contains("later")) card.querySelector(".qwake")?.click();
  btn.click();
  if (raycastOn()) btn.focus({ preventScroll: true });
  (card.querySelector(".qstep:not([hidden])") || card).scrollIntoView({ block: "nearest" });
  return true;
}

function stepQuestionCard() {
  const next = openQuestionCard()?.querySelector(".qnext");
  if (!next || next.disabled) return false;
  next.click();
  return true;
}

export { FOCUS_MODE_KEY, GONE_MS, LAYOUTS, LAYOUT_KEY, LAYOUT_NAMES, WHERE_ICON, adoptBlockSize, adoptLayout, answerWithDigit, bootLayout, born, driverUp, flipEnd, flipStart, inARow, inAStrip, inFocusMode, knock, onASleepingPod, openQuestionCard, sendToSeat, setBlockSize, setFocusMode, setLayout, shortBranch, stepQuestionCard, vanish, wakeAndSay, watchFocusClicks };

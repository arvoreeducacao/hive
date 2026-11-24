import { rename } from "./chat-name.js";
import { $, phrase, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { hudOnScreen } from "./hud.js";
import { focusedSeat } from "./mirror.js";
import { openSeatMenu } from "./seat-menu.js";
import { structureHook } from "./structure.js";
import { structPool } from "./structured-seats.js";

const LIST_SPOTS = [".tx-side", ".lx-list", ".em-queue", ".stg-stack", ".il-pill", ".ck-fleet", ".mp-area"];
const PANEL_SPOTS = ["#thread", ".tile.open > .side", ".tx-prside", "[data-focus-area=\"panel\"]"];
const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
const ROW_SPOTS = "#rail-sessions .item[data-name]:not(.parked), #structure-root [data-seat], #structure-root [data-key]";
const RING_MS = 900;

const lastFocus = new Map();
let ringed = null;
let ringTimer = 0;

const shown = (el) => !!el?.isConnected && !el.closest("[hidden]") && el.getClientRects().length > 0;

function conversationHost() {
  const name = focusedSeat()?.name;
  const host = name ? structPool.get(name)?.host : null;
  if (shown(host)) return host;
  return [...structPool.values()].map((one) => one.host).find(shown) || null;
}

function listArea() {
  const spots = LIST_SPOTS.map((spot) => document.querySelector(`#structure-root ${spot}`));
  return [...spots, $("rail")].find(shown) || null;
}

function workspaceAreas() {
  const list = listArea();
  const host = conversationHost();
  const scroll = host?.querySelector(".sv-scroll");
  const composer = host?.querySelector(".sv-composer");
  const panels = [...new Set(PANEL_SPOTS.flatMap((spot) => [...document.querySelectorAll(spot)]))].filter(shown);
  const notice = hudOnScreen() && $("hud")?.querySelector(".hud-act") ? $("hud") : null;
  return [
    list ? { name: "list", el: list } : null,
    shown(scroll) ? { name: "conversation", el: scroll } : null,
    shown(composer) ? { name: "composer", el: composer } : null,
    ...panels.map((el, at) => ({ name: `panel:${el.id || at}`, el })),
    notice ? { name: "notice", el: notice } : null
  ].filter(Boolean);
}

function settingsAreas() {
  const nav = $("pref-nav");
  const body = $("pref-body");
  return [nav, body].filter(shown).map((el) => ({ name: `settings:${el.id}`, el }));
}

const settingsOpen = () => !!$("help")?.classList.contains("on");

const areasNow = () => (settingsOpen() ? settingsAreas() : workspaceAreas());

function listEntry(el) {
  const name = focusedSeat()?.name;
  const here = name ? el.querySelector(`[data-name="${CSS.escape(name)}"], [data-seat="${CSS.escape(name)}"]`) : null;
  return el.querySelector(".tx-row.sel, .item.sel[data-name], .item.here[data-name]") || here || el.querySelector(".item[data-name], .tx-row[data-key]") || el.querySelector(FOCUSABLE);
}

function settingsEntry(el) {
  if (el.id === "pref-nav") return el.querySelector("button[aria-current=\"true\"]") || el.querySelector("button");
  const pane = [...el.querySelectorAll(".pref-pane")].find((one) => !one.hidden) || el;
  return pane.querySelector(FOCUSABLE) || pane;
}

function entryOf(area) {
  if (area.name === "list") return listEntry(area.el);
  if (area.name === "conversation") return area.el;
  if (area.name === "composer") return area.el.querySelector("textarea") || area.el;
  if (area.name === "notice") return area.el.querySelector(".hud-act");
  if (area.name.startsWith("settings:")) return settingsEntry(area.el);
  return area.el.querySelector(FOCUSABLE) || area.el;
}

function ring(el) {
  clearTimeout(ringTimer);
  ringed?.classList.remove("area-ring");
  ringed = el;
  el.classList.add("area-ring");
  ringTimer = setTimeout(() => { el.classList.remove("area-ring"); if (ringed === el) ringed = null; }, RING_MS);
}

function enterArea(area) {
  const kept = lastFocus.get(area.name);
  const target = kept && area.el.contains(kept) && shown(kept) ? kept : entryOf(area);
  if (!target) return false;
  if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: false });
  ring(area.el);
  return true;
}

function stepArea(step) {
  if (st.typing) releaseKeyboard();
  const all = areasNow();
  if (!all.length) return false;
  const at = all.findIndex((one) => one.el.contains(document.activeElement));
  const next = at < 0 ? (step > 0 ? 0 : all.length - 1) : (at + step + all.length) % all.length;
  return enterArea(all[next]);
}

function rowAt(el) {
  if (!el?.closest || el.closest(".sv, input, textarea, select, [contenteditable=\"true\"]")) return null;
  const hooked = structureHook("rowAt", el);
  if (hooked) return hooked;
  const row = el?.closest?.(ROW_SPOTS);
  if (!row) return null;
  const name = row.dataset.name || row.dataset.seat || row.dataset.key;
  const seat = (st.data?.sessions || []).find((one) => one.name === name);
  return seat ? { name, el: row } : null;
}

function renameRow(row) {
  const seat = (st.data?.sessions || []).find((one) => one.name === row.name);
  if (!seat || document.querySelector(".row-rename")) return false;
  const box = row.el.getBoundingClientRect();
  const input = document.createElement("input");
  input.className = "row-rename";
  input.spellcheck = false;
  input.maxLength = 60;
  input.value = seat.title || seat.name;
  input.placeholder = phrase("empty gives the chat its seat name back");
  input.setAttribute("aria-label", phrase("name of the chat {name}", { name: seat.name }));
  Object.assign(input.style, { left: `${Math.round(box.left)}px`, top: `${Math.round(box.top)}px`, width: `${Math.max(160, Math.round(box.width))}px`, height: `${Math.max(28, Math.round(box.height))}px` });
  let done = false;
  const stop = (commit) => {
    if (done) return;
    done = true;
    const written = input.value.trim();
    input.remove();
    const back = rowAt(row.el)?.el || document.querySelector(`[data-name="${CSS.escape(row.name)}"], [data-seat="${CSS.escape(row.name)}"]`);
    back?.focus?.({ preventScroll: true });
    if (commit && written !== (seat.title || "")) rename(seat, written);
  };
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); stop(true); }
    if (ev.key === "Escape") { ev.preventDefault(); stop(false); }
  });
  input.addEventListener("blur", () => stop(true));
  document.body.append(input);
  input.focus();
  input.select();
  return true;
}

function openRowMenu(row) {
  const box = row.el.getBoundingClientRect();
  if (typeof row.menu === "function") {
    row.menu(box.left, box.bottom + 2);
    return true;
  }
  const seat = (st.data?.sessions || []).find((one) => one.name === row.name);
  if (!seat) return false;
  openSeatMenu(seat, box.left, box.bottom + 2);
  return true;
}

const asksForMenu = (ev) => ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey);

function rowKeys(ev) {
  const plainF2 = ev.key === "F2" && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey;
  if (!plainF2 && !asksForMenu(ev)) return false;
  const row = rowAt(document.activeElement);
  if (!row) return false;
  const done = plainF2 ? renameRow(row) : openRowMenu(row);
  if (!done) return false;
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

if (typeof document !== "undefined") {
  document.addEventListener("focusin", (ev) => {
    for (const area of areasNow()) if (area.el.contains(ev.target)) lastFocus.set(area.name, ev.target);
  });
  document.addEventListener("keydown", rowKeys, true);
}

export { areasNow, renameRow, rowAt, rowKeys, stepArea };

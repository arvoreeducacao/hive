import { contextMenuView } from "../views.js";
import { phrase, st } from "./core.js";
import { openOutside, openWebPage } from "./chat-and-panes.js";
import { closeTableMenu, landingOf } from "./markdown-rich.js";
import { openInMachineEditor } from "./seat-changes.js";
import { prsOfChat } from "./seat-menu.js";
import { structPool } from "./structured-seats.js";
import { ART_WEBVIEW } from "./subagents-dock.js";
import { toClipboard } from "./terminal-history.js";
import { pullPrs } from "./thread.js";

const WEB_LINK = /^https?:\/\//i;
const PULL_LINK = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#]|$)/i;
const FILE_TARGET = ".md-chip[data-kind=file], a.md-file";
const KEY_ECHO_MS = 400;

let menu = null;

const seatHolding = (el) => [...structPool.values()].find((e) => e.host?.contains?.(el)) || null;

const sessionOf = (seat) => (st.data?.sessions || []).find((one) => one.name === seat.name && (!seat.where || one.where === seat.where)) || null;

const inChat = (el) => !!el?.closest?.(".sv-scroll");

async function revealFile(seat, rel) {
  try {
    const answer = await fetch("/api/changes/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: seat.name, where: seat.where, path: rel })
    });
    const said = await answer.json();
    return said?.error ? { error: String(said.error) } : { ok: true };
  } catch (wrong) {
    return { error: String(wrong?.message || wrong) };
  }
}

async function tellPrLink(path, seat, href) {
  try {
    const answer = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: seat.name, where: seat.where || "local", url: href })
    });
    const said = await answer.json();
    if (said?.error) return { error: String(said.error) };
  } catch (wrong) {
    return { error: String(wrong?.message || wrong) };
  }
  pullPrs().catch(() => {});
  return { ok: true };
}

export function pullKeyOf(href) {
  const found = PULL_LINK.exec(String(href || ""));
  return found ? `${found[1]}/${found[2]}#${found[3]}` : "";
}

export function prMenuItems(href, seat) {
  const key = pullKeyOf(href);
  if (!key || !seat?.name) return [];
  const mine = prsOfChat(seat.name);
  const linkedHere = mine.some((pr) => pr.key === key && pr.linked);
  const others = mine.filter((pr) => pr.key !== key).map((pr) => `#${pr.number}`);
  return [
    { separator: true },
    {
      label: phrase("Link to this chat"),
      hint: others.length && !linkedHere ? phrase("in place of {prs}", { prs: others.join(", ") }) : "",
      disabled: linkedHere,
      run: () => tellPrLink("/api/prs/link", seat, href)
    },
    { label: phrase("Unlink from this chat"), disabled: !linkedHere, run: () => tellPrLink("/api/prs/unlink", seat, href) }
  ];
}

export function linkMenuItems(href, seat, { panel = ART_WEBVIEW } = {}) {
  return [
    panel && seat?.name ? { label: phrase("Open in panel browser"), run: () => openWebPage(seat.name, href) } : null,
    { label: phrase("Open in system browser"), run: () => openOutside(href) },
    { label: phrase("Copy link"), copy: true, run: () => toClipboard(href) },
    ...prMenuItems(href, seat)
  ].filter(Boolean);
}

export function fileMenuItems({ seat, rel, line }) {
  const cwd = String(sessionOf(seat)?.cwd || "").replace(/\/+$/, "");
  const local = seat.where !== "cloud";
  return [
    { label: phrase("Open in editor"), run: () => openInMachineEditor(seat.name, rel, line || 1) },
    local ? { label: phrase("Show in folder"), run: () => revealFile(seat, rel) } : null,
    { label: phrase("Copy relative path"), copy: true, run: () => toClipboard(rel) },
    cwd ? { label: phrase("Copy full path"), copy: true, run: () => toClipboard(`${cwd}/${rel}`) } : null
  ].filter(Boolean);
}

function fileLanding(el) {
  const held = seatHolding(el);
  const seat = { name: el.dataset.seat || held?.name || "", where: el.dataset.where || held?.where || "local" };
  if (!seat.name) return null;
  if (el.matches(".md-chip")) return el.dataset.path ? { seat, rel: el.dataset.path, line: Number(el.dataset.line) || 0 } : null;
  const landing = landingOf(el.dataset.path, seat);
  return landing ? { seat, rel: landing.rel, line: landing.line } : null;
}

export function menuTargetOf(node) {
  const file = node?.closest?.(FILE_TARGET);
  if (file && inChat(file)) {
    const landing = fileLanding(file);
    return landing ? { el: file, label: phrase("File actions"), items: fileMenuItems(landing) } : null;
  }
  const link = node?.closest?.("a[href]");
  if (!link || !inChat(link)) return null;
  const href = link.getAttribute("href") || "";
  if (!WEB_LINK.test(href)) return null;
  const held = seatHolding(link);
  return { el: link, label: phrase("Link actions"), items: linkMenuItems(href, held ? { name: held.name, where: held.where } : null) };
}

export function closeContextMenu(refocus = false) {
  if (!menu) return;
  const { view, owner } = menu;
  menu = null;
  view.close();
  if (refocus && owner?.isConnected) owner.focus({ preventScroll: true });
}

const menuModel = (shown) => ({
  label: shown.label,
  tone: shown.tone,
  x: shown.x,
  y: shown.y,
  note: shown.note,
  items: shown.items.map((item, at) => ({ key: String(at), separator: !!item.separator, label: item.label || "", hint: item.hint || "", disabled: !!item.disabled }))
});

async function pick(item, view) {
  const byKey = !!menu?.byKey;
  const said = await item.run();
  if (!menu || menu.view !== view) return;
  if (said?.error) {
    menu.shown.note = said.error;
    return view.show(menuModel(menu.shown));
  }
  closeContextMenu(byKey && !!item.copy);
}

export function openContextMenu(items, { x, y, owner = null, label = "", byKey = false }) {
  closeContextMenu();
  closeTableMenu();
  if (!items.length) return null;
  const shown = { items, label, tone: owner?.closest?.("[data-tone]")?.dataset.tone || "", x, y, note: "" };
  const view = contextMenuView(menuModel(shown), {
    pick: (at) => pick(items[at], view),
    close: (refocus) => closeContextMenu(refocus)
  });
  menu = { view, owner, byKey, at: Date.now(), shown };
  view.focusFirst();
  return view.el;
}

function pickedInside(el) {
  const picked = document.getSelection?.();
  if (!picked || picked.isCollapsed || !picked.toString().trim()) return false;
  return !!picked.containsNode?.(el, true);
}

function showFor(target, at) {
  openContextMenu(target.items, { ...at, owner: target.el, label: target.label });
}

function onContext(ev) {
  if (menu?.view.el.contains(ev.target)) return;
  const target = menuTargetOf(ev.target);
  if (!target || pickedInside(target.el)) return closeContextMenu();
  ev.preventDefault();
  ev.stopPropagation();
  if (menu?.byKey && menu.owner === target.el && Date.now() - menu.at < KEY_ECHO_MS) return;
  showFor(target, { x: ev.clientX, y: ev.clientY });
}

function onKey(ev) {
  if (ev.key !== "ContextMenu" && !(ev.key === "F10" && ev.shiftKey)) return;
  const target = menuTargetOf(document.activeElement);
  if (!target) return;
  ev.preventDefault();
  ev.stopPropagation();
  const box = target.el.getBoundingClientRect();
  showFor(target, { x: box.left, y: box.bottom + 2, byKey: true });
}

function onPointer(ev) {
  if (menu && !menu.view.el.contains(ev.target)) closeContextMenu();
}

function onScroll(ev) {
  if (!menu) return;
  const moved = ev.target;
  if (moved === document || moved?.contains?.(menu.owner)) closeContextMenu();
}

if (typeof document !== "undefined") {
  document.addEventListener("contextmenu", onContext, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("blur", () => closeContextMenu());
  window.addEventListener("resize", () => closeContextMenu());
}

import { phrase, st } from "./core.js";
import { applePlatform, openOutside, openWebPage } from "./chat-and-panes.js";
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
const EDGE = 6;
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
    local ? { label: applePlatform() ? phrase("Reveal in Finder") : phrase("Show in folder"), run: () => revealFile(seat, rel) } : null,
    { label: phrase("Copy relative path"), copy: true, run: () => toClipboard(rel) },
    cwd ? { label: phrase("Copy full path"), copy: true, run: () => toClipboard(`${cwd}/${rel}`) } : null
  ].filter(Boolean);
}

function fileLanding(el) {
  const held = seatHolding(el);
  const seat = { name: el.dataset.seat || held?.name || "", where: el.dataset.where || held?.where || "local" };
  if (!seat.name) return null;
  if (el.classList.contains("md-chip")) return el.dataset.path ? { seat, rel: el.dataset.path, line: Number(el.dataset.line) || 0 } : null;
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
  const { el, owner } = menu;
  menu = null;
  el.remove();
  if (refocus && owner?.isConnected) owner.focus({ preventScroll: true });
}

function place(el, x, y) {
  const box = el.getBoundingClientRect();
  const wide = document.documentElement.clientWidth || innerWidth;
  const tall = document.documentElement.clientHeight || innerHeight;
  const left = Math.max(EDGE, Math.min(x, wide - box.width - EDGE));
  const top = y + box.height + EDGE > tall ? Math.max(EDGE, y - box.height) : y;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function sayTrouble(el, why) {
  let note = el.querySelector(".md-ctx-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "md-ctx-note";
    note.setAttribute("role", "alert");
    el.append(note);
  }
  note.textContent = why;
}

async function pick(item, el) {
  const byKey = !!menu?.byKey;
  const said = await item.run();
  if (!menu || menu.el !== el) return;
  if (said?.error) return sayTrouble(el, said.error);
  closeContextMenu(byKey && !!item.copy);
}

function onMenuKey(ev) {
  if (!menu) return;
  const items = [...menu.el.querySelectorAll("button:not(:disabled)")];
  const at = items.indexOf(document.activeElement);
  const go = (n) => items[(n + items.length) % items.length]?.focus({ preventScroll: true });
  if (ev.key === "Tab") {
    ev.stopPropagation();
    return closeContextMenu(true);
  }
  if (ev.key === "Enter" || ev.key === " ") return void ev.stopPropagation();
  if (ev.key === "ArrowDown") go(at + 1);
  else if (ev.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
  else if (ev.key === "Home") go(0);
  else if (ev.key === "End") go(items.length - 1);
  else if (ev.key === "Escape") closeContextMenu(true);
  else return;
  ev.preventDefault();
  ev.stopPropagation();
}

export function openContextMenu(items, { x, y, owner = null, label = "", byKey = false }) {
  closeContextMenu();
  closeTableMenu();
  if (!items.length) return null;
  const el = document.createElement("div");
  el.className = "md-menu md-ctx";
  el.setAttribute("role", "menu");
  if (label) el.setAttribute("aria-label", label);
  const tone = owner?.closest?.("[data-tone]")?.dataset.tone;
  if (tone) el.dataset.tone = tone;
  for (const item of items) {
    if (item.separator) {
      const line = document.createElement("div");
      line.className = "md-ctx-sep";
      line.setAttribute("role", "separator");
      el.append(line);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("role", "menuitem");
    button.textContent = item.label;
    if (item.hint) {
      const hint = document.createElement("span");
      hint.className = "md-ctx-hint";
      hint.textContent = item.hint;
      button.append(hint);
    }
    if (item.disabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      pick(item, el);
    });
    el.append(button);
  }
  el.addEventListener("keydown", onMenuKey);
  el.addEventListener("contextmenu", (ev) => ev.preventDefault());
  document.body.append(el);
  place(el, x, y);
  menu = { el, owner, byKey, at: Date.now() };
  el.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  return el;
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
  if (menu?.el.contains(ev.target)) return;
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
  if (menu && !menu.el.contains(ev.target)) closeContextMenu();
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

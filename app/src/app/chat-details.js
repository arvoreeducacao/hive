import { render } from "./arrange.js";
import { esc, phrase, st } from "./core.js";
import { registerChatControl } from "./chat-bar.js";
import { openWebPage } from "./chat-and-panes.js";
import { keyHint } from "./leader-key.js";
import { LIMIT_BEAT, accountSaid, limitHeat, limitLabel, limitWhen, pullLimits } from "./limit-chip.js";
import { lucide } from "./lucide.js";
import { DIFF_ID, openPrTab, openSurface } from "./side-panel.js";
import { structPool } from "./structured-seats.js";
import { toClipboard } from "./terminal-history.js";
import { openUsage } from "./usage.js";

const FRESH = 15000;
const OPENER_KEY = "hive.openIn";
const PR_ICONS = { open: "prArrow", merged: "merge", closed: "prClosed", draft: "prDraft" };
const COPIED_FOR = 1400;
const ITEMS_KEY = "hive.details.items";
const DETAIL_ITEMS = [
  { id: "workspace", label: "Machine and folder", on: true },
  { id: "openIn", label: "Open in editor", on: true },
  { id: "branch", label: "Branch and pull request", on: true },
  { id: "changes", label: "Changes", on: true },
  { id: "servers", label: "Servers", on: true },
  { id: "usage", label: "Usage limits", on: false }
];

const card = { node: null, name: "", anchor: null, menu: "", menuAt: null, copied: "", trouble: "" };


function chosenItems() {
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) || "{}") || {}; } catch { return {}; }
}

function itemOn(id) {
  const kept = chosenItems()[id];
  return typeof kept === "boolean" ? kept : !!DETAIL_ITEMS.find((one) => one.id === id)?.on;
}

function keepItems(kept) {
  try {
    if (Object.keys(kept).length) localStorage.setItem(ITEMS_KEY, JSON.stringify(kept));
    else localStorage.removeItem(ITEMS_KEY);
  } catch {}
  paintUsageSwitch();
  if (itemOn("usage")) freshLimits();
  repaint();
}

function setDetailsItem(id, on) {
  const item = DETAIL_ITEMS.find((one) => one.id === id);
  if (!item) return;
  const kept = chosenItems();
  if (on === item.on) delete kept[id];
  else kept[id] = on;
  keepItems(kept);
}

const resetDetailsItems = () => keepItems({});

const itemsAtDefault = () => DETAIL_ITEMS.every((item) => itemOn(item.id) === item.on);

function paintUsageSwitch() {
  const flip = document.getElementById("btn-details-usage");
  if (!flip) return;
  const on = itemOn("usage");
  flip.textContent = on ? phrase("on") : phrase("off");
  flip.classList.toggle("on", on);
  flip.setAttribute("aria-pressed", String(on));
}

function freshLimits() {
  if (Date.now() - (st.limitsAt || 0) > LIMIT_BEAT / 2) pullLimits().then(() => repaint()).catch(() => {});
}



const changes = new Map();
const servers = new Map();
let openers = null;

const seatOf = (name) => (st.data?.sessions || []).find((one) => one.name === name) || null;

const local = (s) => !!s && s.where === "local";

const repaint = () => {
  if (card.node) paintCard();
  else render();
};

async function pull(map, key, url) {
  const had = map.get(key);
  map.set(key, { ...(had || {}), asking: true });
  let said = null;
  try { said = await (await fetch(url)).json(); } catch {}
  map.set(key, { at: Date.now(), said: said || had?.said || null, asking: false });
  repaint();
}

function fresh(map, key, url) {
  const had = map.get(key);
  if (!had?.asking && (!had || Date.now() - had.at > FRESH)) pull(map, key, url);
  return had?.said || null;
}

const changesOf = (s) => fresh(changes, s.name, `/api/changes?name=${encodeURIComponent(s.name)}&where=${s.where === "cloud" ? "cloud" : "local"}`);

const serversOf = (s) => (local(s) ? fresh(servers, s.name, `/api/seat/servers?name=${encodeURIComponent(s.name)}`)?.servers || [] : []);

function openersHere() {
  if (openers) return openers;
  openers = [];
  fetch("/api/open-in").then((answer) => answer.json()).then((said) => { openers = said.apps || []; repaint(); }).catch(() => {});
  return openers;
}

function preferredOpener() {
  const list = openersHere();
  let kept = "";
  try { kept = localStorage.getItem(OPENER_KEY) || ""; } catch {}
  return list.find((one) => one.id === kept) || list[0] || null;
}

const branchOf = (s) => changes.get(s?.name)?.said?.branch || (s?.trees || []).find((one) => one?.branch)?.branch || "";

const pathOf = (s) => (s?.trees || []).find((one) => one?.path)?.path || changes.get(s?.name)?.said?.top || s?.cwd || "";

const machineOf = () => phrase("This computer");

const count = (n) => Number(n || 0).toLocaleString("en-US");

function rowHtml({ icon, label, end = "", act = "", title = "", data = "" }) {
  const body = `${lucide(icon, "cd-i")}<span class="cd-label">${esc(label)}</span>${end}`;
  const tip = title ? ` title="${esc(title)}"` : "";
  return act
    ? `<button type="button" class="cd-row" data-act="${esc(act)}"${data}${tip}>${body}</button>`
    : `<div class="cd-row cd-still"${tip}>${body}</div>`;
}

const sectionHtml = (rows, label) => (rows ? `<section class="cd-sec" aria-label="${esc(label)}">${rows}</section>` : "");

function copyButtonHtml(act, label, view = card) {
  const done = view.copied === act;
  return `<button type="button" class="cd-ib" data-act="${esc(act)}" aria-label="${esc(label)}" title="${esc(done ? phrase("Copied") : label)}">${lucide(done ? "check" : "copy")}</button>`;
}

const lineHtml = (row, tail) => `<div class="cd-line">${row}${tail}</div>`;

function prSaid(p) {
  if (p.state === "merged") return phrase("merged");
  if (p.state === "closed") return phrase("closed");
  if (p.state === "draft") return phrase("draft");
  if (p.conflict) return phrase("conflict");
  if (p.ci === "failed") return phrase("checks failing");
  if (p.ci === "pending" || p.ci === "running") return phrase("checks running");
  if (p.ci === "passed" || p.ci === "success") return phrase("checks passing");
  return "";
}

function prFlag(p) {
  if (p.state === "merged" || p.state === "closed") return "";
  if (p.conflict || p.ci === "failed") return lucide("circleX", "cd-flag bad");
  if (p.ci === "pending" || p.ci === "running") return lucide("circleDashed", "cd-flag");
  return "";
}

function prRowHtml(p) {
  const number = `#${String(p.tag || "").split("#").pop()}`;
  const tip = [p.title || p.tag, [number, prSaid(p)].filter(Boolean).join(" · ")].join("\n");
  return `<button type="button" class="cd-row cd-pr pr-${esc(p.state || "open")}" data-act="cd-pr" data-pr="${esc(p.key)}" title="${esc(tip)}">${lucide(PR_ICONS[p.state] || PR_ICONS.open, "cd-i")}<span class="cd-label">${esc(p.title || p.tag)}</span>${prFlag(p)}</button>`;
}

function changesEnd(said) {
  if (!said || said.state !== "ok") return "";
  const added = (said.files || []).reduce((sum, file) => sum + (file.added || 0), 0);
  const removed = (said.files || []).reduce((sum, file) => sum + (file.removed || 0), 0);
  if (!said.files?.length) return `<span class="cd-end cd-muted">${esc(phrase("clean"))}</span>`;
  return `<span class="cd-end cd-stat"><span class="add">+${esc(count(added))}</span> <span class="del">−${esc(count(removed))}</span></span>`;
}

function serverRowHtml(one) {
  const tip = [String(one.command || "").trim(), phrase("Open in the panel browser")].filter(Boolean).join("\n");
  const open = `<button type="button" class="cd-row" data-act="cd-server-open" data-url="${esc(one.url)}" title="${esc(tip)}">${lucide("globe", "cd-i")}<span class="cd-label">localhost:${esc(one.port)}</span></button>`;
  const stop = `<button type="button" class="cd-ib cd-stop" data-act="cd-server-stop" data-pid="${esc(one.pid)}" aria-label="${esc(phrase("Stop localhost:{port}", { port: one.port }))}" title="${esc(phrase("Stop this server"))}">${lucide("stop")}</button>`;
  return lineHtml(open, stop);
}

function accountOfChat(s) {
  const provider = s.agent || "claude";
  const account = structPool.get(s.name)?.account || "default";
  const rows = (st.limits?.accounts || []).filter((one) => (one.provider || "claude") === provider && one.signedIn !== false);
  return rows.find((one) => one.account === account) || (rows.length === 1 ? rows[0] : null);
}

function windowName(one) {
  if (one.kind === "session") return "5h";
  if (one.kind === "monthly") return one.model ? `${phrase("Month")} · ${one.model}` : phrase("Month");
  if (one.kind === "weekly_scoped") return `${phrase("Week")} · ${one.model || ""}`.replace(/ · $/, "");
  return phrase("Week");
}

function usageRowHtml(one) {
  const used = Math.max(0, Math.min(100, Math.round(Number(one.percent) || 0)));
  const heat = limitHeat(used);
  const back = one.resets_at ? limitWhen(one.resets_at) : "";
  const said = phrase("{label}: {n}% used", { label: limitLabel(one), n: used });
  const tip = [said, back ? phrase("resets {n}", { n: back }) : "", phrase("Open usage")].filter(Boolean).join("\n");
  return `<button type="button" class="cd-use${heat ? ` ${heat}` : ""}" data-act="cd-usage" aria-label="${esc(said)}" title="${esc(tip)}"><span class="cd-use-l">${esc(windowName(one))}</span><span class="cd-use-bar" style="--used:${used}%"><i></i></span><span class="cd-use-v">${used}%</span></button>`;
}

function usageHtml(s) {
  const row = accountOfChat(s);
  if (!row) return "";
  const windows = row.limits || [];
  if (!windows.length) return `<div class="cd-uses"><button type="button" class="cd-use" data-act="cd-usage" title="${esc(accountSaid(row))}"><span class="cd-use-l">${esc(phrase("Limits"))}</span><span class="cd-use-v cd-wide">${esc(phrase("unavailable"))}</span></button></div>`;
  return `<div class="cd-uses">${windows.map(usageRowHtml).join("")}</div>`;
}

function itemsMenuHtml(s) {
  if (card.menu !== "items") return "";
  const at = card.menuAt || { x: 0, y: 0 };
  const copies = [
    pathOf(s) ? ["cd-copy-path", phrase("Copy path")] : null,
    branchOf(s) ? ["cd-copy-branch", phrase("Copy branch")] : null,
    ["cd-copy-id", phrase("Copy chat ID")]
  ].filter(Boolean).map(([act, label]) => `<button type="button" role="menuitem" class="cd-pop-i" data-act="${act}"><span class="cd-tick" aria-hidden="true"></span><span>${esc(label)}</span>${card.copied === act ? lucide("check") : ""}</button>`).join("");
  const checks = DETAIL_ITEMS.map((item) => `<button type="button" role="menuitemcheckbox" aria-checked="${itemOn(item.id)}" class="cd-pop-i" data-act="cd-item" data-item="${esc(item.id)}"><span class="cd-tick" aria-hidden="true">${itemOn(item.id) ? lucide("check") : ""}</span><span>${esc(phrase(item.label))}</span></button>`).join("");
  const reset = `<button type="button" role="menuitem" class="cd-pop-i" data-act="cd-items-reset"${itemsAtDefault() ? ' aria-disabled="true"' : ""}><span class="cd-tick" aria-hidden="true"></span><span>${esc(phrase("Reset to default"))}</span></button>`;
  return `<div class="cd-pop cd-ctx" role="menu" aria-label="${esc(phrase("Chat details"))}" style="left:${Math.round(at.x)}px;top:${Math.round(at.y)}px">${copies}<hr><div class="cd-pop-h">${esc(phrase("Show in chat details"))}</div>${checks}<hr>${reset}</div>`;
}

function openerHtml(s, view = card) {
  if (!local(s)) return "";
  const best = preferredOpener();
  if (!best) return "";
  const keys = keyHint("openIn");
  const said = phrase("Open in {app}", { app: best.name });
  const list = view.menu === "open" ? `<div class="cd-pop" role="menu">${openersHere().map((one) => `<button type="button" role="menuitemradio" aria-checked="${one.id === best.id}" class="cd-pop-i" data-act="cd-open-with" data-app="${esc(one.id)}"><span>${esc(one.name)}</span>${one.id === best.id ? `<kbd>${esc(keys)}</kbd>` : ""}</button>`).join("")}</div>` : "";
  return `<div class="cd-open"><button type="button" class="cd-open-main" data-act="cd-open" title="${esc(`${said} (${keys})`)}">${lucide("external", "cd-i")}<span>${esc(said)}</span></button><button type="button" class="cd-open-pick" data-act="cd-open-menu" aria-haspopup="menu" aria-expanded="${view.menu === "open"}" aria-label="${esc(phrase("Choose the app"))}">${lucide("chevronDown")}</button>${list}</div>`;
}

const serversHtml = (s) => serversOf(s).map(serverRowHtml).join("");

function workspaceHtml(s, cloud) {
  const tree = (s.trees || []).find((one) => one?.path);
  const path = pathOf(s);
  const machine = rowHtml({ icon: cloud ? "cloud" : "laptop", label: cloud ? phrase("Server") : machineOf(), title: phrase("Where this chat runs") });
  const folder = tree
    ? rowHtml({ icon: "worktree", label: phrase("Worktree"), title: tree.path })
    : rowHtml({ icon: "folder", label: (path || "").replace(/^\/Users\/[^/]+/, "~") || phrase("No folder"), title: path });
  return machine + (path ? lineHtml(folder, copyButtonHtml("cd-copy-path", phrase("Copy path"))) : folder);
}

function cardHtml(s) {
  const cloud = s.where === "cloud";
  const said = itemOn("changes") && (s.cwd || cloud) ? changesOf(s) : null;
  const branch = itemOn("branch") ? branchOf(s) : "";
  const prs = itemOn("branch") ? (st.prs || []).filter((p) => p.session === s.name && !p.error) : [];
  const version = [
    branch ? lineHtml(rowHtml({ icon: "branch", label: branch, title: branch }), copyButtonHtml("cd-copy-branch", phrase("Copy branch"))) : "",
    prs.map(prRowHtml).join(""),
    said ? rowHtml({ icon: "diff", label: phrase("Changes"), end: changesEnd(said), act: "cd-diff", title: phrase("Uncommitted changes in this chat's folder") }) : ""
  ].join("");
  const sections = [
    sectionHtml([itemOn("workspace") ? workspaceHtml(s, cloud) : "", itemOn("openIn") ? openerHtml(s) : ""].join(""), phrase("Workspace")),
    sectionHtml(version, phrase("Version control")),
    itemOn("servers") ? sectionHtml(serversHtml(s), phrase("Servers")) : "",
    itemOn("usage") ? sectionHtml(usageHtml(s), phrase("Usage limits")) : ""
  ].join("");
  const empty = sections ? "" : `<section class="cd-sec"><button type="button" class="cd-row" data-act="cd-items">${lucide("settings", "cd-i")}<span class="cd-label">${esc(phrase("Choose what shows"))}</span></button></section>`;
  const trouble = card.trouble ? `<p class="cd-trouble" role="alert">${esc(card.trouble)}</p>` : "";
  return `${sections}${empty}${trouble}${itemsMenuHtml(s)}`;
}

function place() {
  const node = card.node;
  const anchor = card.anchor?.isConnected ? card.anchor : document.querySelector(`.chat-ctl[data-name="${CSS.escape(card.name)}"] [data-act="chat-details"]`);
  if (!node) return;
  const box = anchor?.getBoundingClientRect() || { right: window.innerWidth - 16, bottom: 56 };
  const width = node.offsetWidth || 280;
  node.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`;
  node.style.top = `${Math.min(box.bottom + 6, window.innerHeight - 80)}px`;
  const menu = node.querySelector(".cd-ctx");
  if (!menu) return;
  const room = menu.getBoundingClientRect();
  if (room.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, window.innerWidth - room.width - 8)}px`;
  if (room.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - room.height - 8)}px`;
}

function focusKey(el) {
  if (!el?.dataset?.act) return "";
  const named = `[data-act="${CSS.escape(el.dataset.act)}"]`;
  if (el.dataset.app) return `${named}[data-app="${CSS.escape(el.dataset.app)}"]`;
  if (el.dataset.pid) return `${named}[data-pid="${CSS.escape(el.dataset.pid)}"]`;
  if (el.dataset.url) return `${named}[data-url="${CSS.escape(el.dataset.url)}"]`;
  if (el.dataset.pr) return `${named}[data-pr="${CSS.escape(el.dataset.pr)}"]`;
  if (el.dataset.item) return `${named}[data-item="${CSS.escape(el.dataset.item)}"]`;
  return named;
}

function paintCard() {
  const s = seatOf(card.name);
  if (!s) return closeCard();
  const html = cardHtml(s);
  if (card.node.dataset.h === html) return place();
  const held = card.node.contains(document.activeElement) ? focusKey(document.activeElement) : "";
  card.node.innerHTML = html;
  card.node.dataset.h = html;
  place();
  if (held) card.node.querySelector(held)?.focus();
}

function openCard(name, anchor) {
  closeCard(false);
  const s = seatOf(name);
  if (!s) return false;
  card.name = name;
  card.anchor = anchor || null;
  card.menu = "";
  card.trouble = "";
  const node = document.createElement("div");
  node.className = "cd-card";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-label", phrase("Chat details"));
  node.tabIndex = -1;
  node.addEventListener("click", (event) => cardClick(event));
  node.addEventListener("contextmenu", (event) => cardMenu(event));
  document.body.appendChild(node);
  card.node = node;
  changes.delete(name);
  servers.delete(name);
  if (itemOn("usage")) freshLimits();
  paintCard();
  node.focus({ preventScroll: true });
  anchor?.setAttribute?.("aria-expanded", "true");
  return true;
}

function closeCard(giveFocusBack = true) {
  if (!card.node) return false;
  const anchor = card.anchor;
  const name = card.name;
  card.node.remove();
  card.node = null;
  card.menu = "";
  anchor?.setAttribute?.("aria-expanded", "false");
  if (giveFocusBack) (anchor?.isConnected ? anchor : document.querySelector(`.chat-ctl[data-name="${CSS.escape(name)}"] [data-act="chat-details"]`))?.focus({ preventScroll: true });
  return true;
}

const toggleCard = (name, anchor) => (card.node && card.name === name ? closeCard() : openCard(name, anchor));

function markCopied(view, act, text) {
  if (!text) return;
  toClipboard(text);
  view.copied = act;
  setTimeout(() => { if (view.copied === act) { view.copied = ""; repaint(); } }, COPIED_FOR);
}

async function openWith(s, id, view = card) {
  if (!s || !id) return;
  try { localStorage.setItem(OPENER_KEY, id); } catch {}
  view.menu = "";
  view.trouble = "";
  let said = null;
  try {
    said = await (await fetch("/api/open-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: s.name, app: id }) })).json();
  } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (said?.error) view.trouble = phrase("Could not open: {why}", { why: said.error });
  repaint();
}

async function stopServer(s, pid, view = card) {
  view.trouble = "";
  let said = null;
  try {
    said = await (await fetch("/api/seat/servers/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: s.name, pid: Number(pid) }) })).json();
  } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (said?.error) view.trouble = phrase("Could not stop it: {why}", { why: said.error });
  servers.delete(s.name);
  repaint();
}

function openInBrowser(name, url) {
  closeCard(false);
  openWebPage(name, url);
}

function detailsAct(name, hit, view = card) {
  const s = seatOf(name);
  const act = hit?.dataset?.act || "";
  if (!s || !act.startsWith("cd-")) return false;
  if (act === "cd-open-menu") view.menu = view.menu === "open" ? "" : "open";
  else if (act === "cd-item") { setDetailsItem(hit.dataset.item, !itemOn(hit.dataset.item)); return true; }
  else if (act === "cd-items-reset") { if (!itemsAtDefault()) resetDetailsItems(); return true; }
  else if (act === "cd-items") { const box = hit.getBoundingClientRect(); openItemsMenu(box.left, box.bottom + 4); return true; }
  else if (act === "cd-usage") { closeCard(false); openUsage(); return true; }
  else if (act === "cd-copy-path") markCopied(view, act, pathOf(s));
  else if (act === "cd-copy-branch") markCopied(view, act, branchOf(s));
  else if (act === "cd-copy-id") markCopied(view, act, s.name);
  else if (act === "cd-open") { openWith(s, preferredOpener()?.id, view); return true; }
  else if (act === "cd-open-with") { openWith(s, hit.dataset.app, view); return true; }
  else if (act === "cd-diff") { closeCard(false); openSurface(s.name, DIFF_ID); return true; }
  else if (act === "cd-pr") { closeCard(false); openPrTab(s.name, hit.dataset.pr); return true; }
  else if (act === "cd-server-open") { openInBrowser(s.name, hit.dataset.url); return true; }
  else if (act === "cd-server-stop") { stopServer(s, hit.dataset.pid, view); return true; }
  else return false;
  repaint();
  return true;
}

function cardClick(event) {
  event.stopPropagation();
  const hit = event.target.closest("[data-act]");
  if (!hit) {
    if (card.menu === "items") { card.menu = ""; repaint(); }
    return;
  }
  const inMenu = !!hit.closest(".cd-ctx");
  if (card.menu === "items" && !inMenu) card.menu = "";
  if (!detailsAct(card.name, hit, card)) return;
  if (inMenu && card.node && card.menu === "items" && !hit.matches('[data-act="cd-item"], [data-act="cd-items-reset"]')) { card.menu = ""; repaint(); card.node?.focus(); return; }
  if (card.menu && card.node && !inMenu) card.node.querySelector(".cd-pop .cd-pop-i")?.focus();
}

function openItemsMenu(x, y) {
  if (!card.node) return;
  card.menu = "items";
  card.menuAt = { x, y };
  paintCard();
  card.node.querySelector(".cd-ctx .cd-pop-i")?.focus();
}

function cardMenu(event) {
  const target = event.target;
  const selection = window.getSelection?.();
  if (target.closest?.("input, textarea, a[href]") || (selection && !selection.isCollapsed && card.node.contains(selection.anchorNode))) return;
  event.preventDefault();
  event.stopPropagation();
  openItemsMenu(event.clientX, event.clientY);
}

function cardKeys(event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const all = [...card.node.querySelectorAll(card.menu ? ".cd-pop .cd-pop-i" : "button")];
    const at = all.indexOf(document.activeElement);
    const next = all[(at + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length];
    if (next) { event.preventDefault(); next.focus(); }
  }
}

window.addEventListener("keydown", (event) => {
  if (!card.node || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (card.menu) { card.menu = ""; repaint(); (card.node.querySelector('[aria-expanded="false"][aria-haspopup="menu"]') || card.node).focus(); return; }
    closeCard();
    return;
  }
  if (!card.node.contains(document.activeElement) || event.key === "Tab") return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    const box = card.node.getBoundingClientRect();
    openItemsMenu(box.left + 12, box.top + 12);
    event.stopPropagation();
    return;
  }
  cardKeys(event);
  event.stopPropagation();
}, true);

document.addEventListener("pointerdown", (event) => {
  if (!card.node || card.node.contains(event.target) || event.target.closest?.('[data-act="chat-details"]')) return;
  closeCard(false);
}, true);

window.addEventListener("resize", () => place());

document.getElementById("btn-details-usage")?.addEventListener("click", (event) => {
  event.stopPropagation();
  setDetailsItem("usage", !itemOn("usage"));
});
document.getElementById("help")?.addEventListener("focusin", paintUsageSwitch);
document.addEventListener("hive:limits", () => { if (card.node && itemOn("usage")) paintCard(); });
paintUsageSwitch();

function detailsButtonHtml(name) {
  const on = !!card.node && card.name === name;
  const said = keyHint("details") ? `${phrase("Chat details")} (${keyHint("details")})` : phrase("Chat details");
  return `<button type="button" class="cb-btn${on ? " on" : ""}" data-act="chat-details" aria-haspopup="dialog" aria-expanded="${on}" aria-label="${esc(phrase("Chat details"))}" title="${esc(said)}">${lucide("squareMenu")}</button>`;
}

registerChatControl({
  id: "details",
  order: 10,
  html: detailsButtonHtml,
  act: (act, name, hit) => (act === "chat-details" ? toggleCard(name, hit) || true : false),
  key: (action, name) => {
    if (action === "details") return toggleCard(name, document.querySelector(`.chat-ctl[data-name="${CSS.escape(name)}"] [data-act="chat-details"]`)) || true;
    if (action === "openIn") {
      const s = seatOf(name);
      if (!local(s)) return true;
      const best = preferredOpener();
      if (best) openWith(s, best.id);
      return true;
    }
    return false;
  }
});

const copyRowsOf = (s) => [
  pathOf(s) ? { label: phrase("Copy path"), note: pathOf(s).replace(/^\/Users\/[^/]+/, "~"), go: () => toClipboard(pathOf(s)) } : null,
  branchOf(s) ? { label: phrase("Copy branch"), note: branchOf(s), go: () => toClipboard(branchOf(s)) } : null
].filter(Boolean);

export { DETAIL_ITEMS, branchOf, closeCard, copyRowsOf, itemOn as detailsItemOn, pathOf, resetDetailsItems, setDetailsItem, toggleCard };

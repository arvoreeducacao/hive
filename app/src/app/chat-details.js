import { chatDetailsView, mountDetailsSwitch } from "../views.js";
import { render } from "./arrange.js";
import { esc, phrase, solidMounts, st } from "./core.js";
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

const card = { view: null, name: "", anchor: null, menu: "", menuAt: null, copied: "", trouble: "" };

let usageSwitch = null;


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

function usageSwitchModel() {
  const on = itemOn("usage");
  return { on, said: on ? phrase("on") : phrase("off") };
}

function paintUsageSwitch() {
  usageSwitch?.show(usageSwitchModel());
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
  if (card.view) paintCard();
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

function copyOf(act, label) {
  const done = card.copied === act;
  return { act, label, title: done ? phrase("Copied") : label, icon: done ? "check" : "copy" };
}

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
  if (p.state === "merged" || p.state === "closed") return null;
  if (p.conflict || p.ci === "failed") return { icon: "circleX", class: "cd-flag bad" };
  if (p.ci === "pending" || p.ci === "running") return { icon: "circleDashed", class: "cd-flag" };
  return null;
}

function prOf(p) {
  const number = `#${String(p.tag || "").split("#").pop()}`;
  const title = [p.title || p.tag, [number, prSaid(p)].filter(Boolean).join(" · ")].join("\n");
  return { key: String(p.key), state: p.state || "open", icon: PR_ICONS[p.state] || PR_ICONS.open, label: String(p.title || p.tag), title, flag: prFlag(p) };
}

function changesEnd(said) {
  if (!said || said.state !== "ok") return null;
  const added = (said.files || []).reduce((sum, file) => sum + (file.added || 0), 0);
  const removed = (said.files || []).reduce((sum, file) => sum + (file.removed || 0), 0);
  if (!said.files?.length) return { clean: phrase("clean") };
  return { added: count(added), removed: count(removed) };
}

function serverOf(one) {
  const title = [String(one.command || "").trim(), phrase("Open in the panel browser")].filter(Boolean).join("\n");
  return { key: String(one.pid), pid: one.pid, url: one.url, label: `localhost:${one.port}`, title, stop: phrase("Stop localhost:{port}", { port: one.port }), stopTitle: phrase("Stop this server") };
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

function usageWindowOf(one, at) {
  const used = Math.max(0, Math.min(100, Math.round(Number(one.percent) || 0)));
  const back = one.resets_at ? limitWhen(one.resets_at) : "";
  const said = phrase("{label}: {n}% used", { label: limitLabel(one), n: used });
  const title = [said, back ? phrase("resets {n}", { n: back }) : "", phrase("Open usage")].filter(Boolean).join("\n");
  return { key: String(at), heat: limitHeat(used) || "", label: windowName(one), used, said, title };
}

function usageOf(s) {
  const row = accountOfChat(s);
  if (!row) return null;
  const windows = row.limits || [];
  if (!windows.length) return { none: { title: accountSaid(row), label: phrase("Limits"), value: phrase("unavailable") }, windows: [] };
  return { none: null, windows: windows.map(usageWindowOf) };
}

function itemsMenuOf(s) {
  if (card.menu !== "items") return null;
  const copies = [
    pathOf(s) ? ["cd-copy-path", phrase("Copy path")] : null,
    branchOf(s) ? ["cd-copy-branch", phrase("Copy branch")] : null,
    ["cd-copy-id", phrase("Copy chat ID")]
  ].filter(Boolean).map(([act, label]) => ({ key: act, act, label, done: card.copied === act }));
  const checks = DETAIL_ITEMS.map((item) => ({ key: item.id, id: item.id, label: phrase(item.label), on: itemOn(item.id) }));
  return { label: phrase("Chat details"), at: card.menuAt || { x: 0, y: 0 }, copies, head: phrase("Show in chat details"), checks, reset: { label: phrase("Reset to default"), disabled: itemsAtDefault() } };
}

function openerOf(s) {
  if (!local(s)) return null;
  const best = preferredOpener();
  if (!best) return null;
  const keys = keyHint("openIn");
  const said = phrase("Open in {app}", { app: best.name });
  return { said, title: `${said} (${keys})`, keys, pick: phrase("Choose the app"), open: card.menu === "open", apps: openersHere().map((one) => ({ key: String(one.id), id: one.id, name: one.name, best: one.id === best.id })) };
}

function workspaceOf(s, cloud) {
  const tree = (s.trees || []).find((one) => one?.path);
  const path = pathOf(s);
  const folder = tree
    ? { icon: "worktree", label: phrase("Worktree"), title: tree.path }
    : { icon: "folder", label: (path || "").replace(/^\/Users\/[^/]+/, "~") || phrase("No folder"), title: path };
  return {
    machine: { icon: cloud ? "cloud" : "laptop", label: cloud ? phrase("Server") : machineOf(), title: phrase("Where this chat runs") },
    folder,
    copy: path ? copyOf("cd-copy-path", phrase("Copy path")) : null
  };
}

function versionOf(s, cloud) {
  const said = itemOn("changes") && (s.cwd || cloud) ? changesOf(s) : null;
  const branch = itemOn("branch") ? branchOf(s) : "";
  const prs = itemOn("branch") ? (st.prs || []).filter((p) => p.session === s.name && !p.error).map(prOf) : [];
  const changed = said ? { label: phrase("Changes"), title: phrase("Uncommitted changes in this chat's folder"), end: changesEnd(said) } : null;
  if (!branch && !prs.length && !changed) return null;
  return { branch: branch ? { label: branch, copy: copyOf("cd-copy-branch", phrase("Copy branch")) } : null, prs, changes: changed };
}

function cardModel(s) {
  const cloud = s.where === "cloud";
  const workspace = itemOn("workspace") ? workspaceOf(s, cloud) : null;
  const opener = itemOn("openIn") ? openerOf(s) : null;
  const version = versionOf(s, cloud);
  const serverRows = itemOn("servers") ? serversOf(s).map(serverOf) : [];
  const usage = itemOn("usage") ? usageOf(s) : null;
  const shown = workspace || opener || version || serverRows.length || usage;
  return {
    label: phrase("Chat details"),
    sections: { workspace: phrase("Workspace"), version: phrase("Version control"), servers: phrase("Servers"), usage: phrase("Usage limits") },
    workspace,
    opener,
    version,
    servers: serverRows,
    usage,
    empty: shown ? "" : phrase("Choose what shows"),
    trouble: card.trouble,
    menu: itemsMenuOf(s)
  };
}

const detailsButtonOf = (name) => document.querySelector(`.chat-ctl[data-name="${CSS.escape(name)}"] [data-act="chat-details"]`);

const anchorOf = () => (card.anchor?.isConnected ? card.anchor : detailsButtonOf(card.name));

const placeCard = () => card.view?.place(anchorOf());

function paintCard() {
  const s = seatOf(card.name);
  if (!s) return closeCard();
  card.view.show(cardModel(s));
  placeCard();
}

function openCard(name, anchor) {
  closeCard(false);
  const s = seatOf(name);
  if (!s) return false;
  card.name = name;
  card.anchor = anchor || null;
  card.menu = "";
  card.trouble = "";
  changes.delete(name);
  servers.delete(name);
  if (itemOn("usage")) freshLimits();
  card.view = chatDetailsView(cardModel(s), { click: cardClick, menu: openItemsMenu });
  placeCard();
  card.view.focusCard({ preventScroll: true });
  anchor?.setAttribute?.("aria-expanded", "true");
  return true;
}

function closeCard(giveFocusBack = true) {
  if (!card.view) return false;
  const anchor = card.anchor;
  const name = card.name;
  card.view.close();
  card.view = null;
  card.menu = "";
  anchor?.setAttribute?.("aria-expanded", "false");
  if (giveFocusBack) (anchor?.isConnected ? anchor : detailsButtonOf(name))?.focus({ preventScroll: true });
  return true;
}

const toggleCard = (name, anchor) => (card.view && card.name === name ? closeCard() : openCard(name, anchor));

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

function detailsAct(name, hit) {
  const s = seatOf(name);
  const act = hit?.act || "";
  if (!s || !act.startsWith("cd-")) return false;
  if (act === "cd-open-menu") card.menu = card.menu === "open" ? "" : "open";
  else if (act === "cd-item") { setDetailsItem(hit.item, !itemOn(hit.item)); return true; }
  else if (act === "cd-items-reset") { if (!itemsAtDefault()) resetDetailsItems(); return true; }
  else if (act === "cd-items") { openItemsMenu(hit.box.left, hit.box.bottom + 4); return true; }
  else if (act === "cd-usage") { closeCard(false); openUsage(); return true; }
  else if (act === "cd-copy-path") markCopied(card, act, pathOf(s));
  else if (act === "cd-copy-branch") markCopied(card, act, branchOf(s));
  else if (act === "cd-copy-id") markCopied(card, act, s.name);
  else if (act === "cd-open") { openWith(s, preferredOpener()?.id); return true; }
  else if (act === "cd-open-with") { openWith(s, hit.app); return true; }
  else if (act === "cd-diff") { closeCard(false); openSurface(s.name, DIFF_ID); return true; }
  else if (act === "cd-pr") { closeCard(false); openPrTab(s.name, hit.pr); return true; }
  else if (act === "cd-server-open") { openInBrowser(s.name, hit.url); return true; }
  else if (act === "cd-server-stop") { stopServer(s, hit.pid); return true; }
  else return false;
  repaint();
  return true;
}

function cardClick(hit) {
  if (!hit) {
    if (card.menu === "items") { card.menu = ""; repaint(); }
    return;
  }
  if (card.menu === "items" && !hit.inMenu) card.menu = "";
  if (!detailsAct(card.name, hit)) return;
  if (hit.inMenu && card.view && card.menu === "items" && hit.act !== "cd-item" && hit.act !== "cd-items-reset") { card.menu = ""; repaint(); card.view?.focusCard(); return; }
  if (card.menu && card.view && !hit.inMenu) card.view.focusPop();
}

function openItemsMenu(x, y) {
  if (!card.view) return;
  card.menu = "items";
  card.menuAt = { x, y };
  paintCard();
  card.view.focusItemsMenu();
}

window.addEventListener("keydown", (event) => {
  if (!card.view || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (card.menu) { card.menu = ""; repaint(); card.view.focusPicker(); return; }
    closeCard();
    return;
  }
  if (!card.view.holdsFocus() || event.key === "Tab") return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    const box = card.view.box();
    openItemsMenu(box.left + 12, box.top + 12);
    event.stopPropagation();
    return;
  }
  card.view.step(event, !!card.menu);
  event.stopPropagation();
}, true);

document.addEventListener("pointerdown", (event) => {
  if (!card.view || card.view.owns(event.target) || event.target.closest?.('[data-act="chat-details"]')) return;
  closeCard(false);
}, true);

window.addEventListener("resize", () => placeCard());

solidMounts.push(() => {
  const host = document.querySelector('[data-control="btn-details-usage"] > .set-ctl');
  if (host) usageSwitch = mountDetailsSwitch(host, usageSwitchModel(), () => setDetailsItem("usage", !itemOn("usage")));
});
document.getElementById("help")?.addEventListener("focusin", paintUsageSwitch);
document.addEventListener("hive:limits", () => { if (card.view && itemOn("usage")) paintCard(); });

function detailsButtonHtml(name) {
  const on = !!card.view && card.name === name;
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

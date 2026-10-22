import { isLeader } from "../app/brand-face.js";
import { esc, phrase } from "../app/core.js";
import { keyCaps } from "../app/leader-key.js";

const SHOWN = 10;

const HISTORY_KEEP = 50;

const HISTORY_KEY = "hive.cockpit.history.";

const mini = { on: false, el: null, input: null, list: null, opts: null, shown: [], at: 0, histAt: -1, typed: "", back: null, moved: false };

function readHistory(name) {
  if (!name) return [];
  try {
    const kept = JSON.parse(localStorage.getItem(HISTORY_KEY + name) || "[]");
    return Array.isArray(kept) ? kept.filter((one) => typeof one === "string") : [];
  } catch { return []; }
}

function keepHistory(name, id) {
  if (!name || !id) return;
  const next = [id, ...readHistory(name).filter((one) => one !== id)].slice(0, HISTORY_KEEP);
  try { localStorage.setItem(HISTORY_KEY + name, JSON.stringify(next)); } catch {}
}

function fuzzyScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const initials = t.split(/[\s\-:·/]+/).map((word) => word[0] || "").join("");
  if (q.length > 1 && initials.startsWith(q.replace(/\s+/g, ""))) return 1500 - initials.length;
  const exact = t.indexOf(q);
  if (exact >= 0) return 1000 - exact + (exact === 0 || /[\s\-:·/]/.test(t[exact - 1]) ? 200 : 0);
  let score = 0;
  let from = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const at = t.indexOf(ch, from);
    if (at < 0) return -1;
    run = at === from ? run + 1 : 0;
    score += 10 + run * 5 + (at === 0 || /[\s\-:·/]/.test(t[at - 1]) ? 15 : 0) - Math.min(9, at - from);
    from = at + 1;
  }
  return score;
}

function rank(items, query, history) {
  const recent = new Map(history.map((id, i) => [id, i]));
  const words = query.trim();
  const scored = items.map((item) => ({ item, score: words ? fuzzyScore(words, `${item.label} ${item.hint || ""} ${item.search || ""}`) : 0 }))
    .filter((one) => one.score >= 0);
  const recency = (one) => (recent.has(one.item.id) ? HISTORY_KEEP - recent.get(one.item.id) : 0);
  return scored.sort((a, b) => b.score - a.score || recency(b) - recency(a)).map((one) => one.item);
}

function candidatesOf(query) {
  const { opts } = mini;
  const items = typeof opts.items === "function" ? opts.items(query) : opts.items;
  return opts.ranked ? items : rank(items, query, readHistory(opts.history));
}

function rowHtml(item, i) {
  const keys = item.keys ? `<span class="ck-mk">${keyCaps(item.keys)}</span>` : "";
  const hint = item.hint ? `<span class="ck-mh">${esc(item.hint)}</span>` : "";
  return `<li class="ck-mc${i === mini.at ? " on" : ""}" data-at="${i}"><span class="ck-ml">${esc(item.label)}</span>${hint}${keys}</li>`;
}

function paintMini() {
  if (!mini.on) return;
  mini.shown = candidatesOf(mini.input.value);
  mini.at = Math.min(mini.at, Math.max(0, mini.shown.length - 1));
  if (mini.opts.idle && !mini.moved && !mini.input.value.trim()) mini.at = -1;
  const from = Math.max(0, Math.min(mini.at - SHOWN + 1, mini.shown.length - SHOWN));
  const rows = mini.shown.slice(from, from + SHOWN).map((item, i) => rowHtml(item, from + i)).join("");
  mini.list.innerHTML = rows || `<li class="ck-mc none">${esc(mini.opts.empty || phrase("no match"))}</li>`;
  mini.el.querySelector(".ck-mn").textContent = mini.shown.length ? `${Math.max(0, mini.at + 1)}/${mini.shown.length}` : "0/0";
}

function closeMini() {
  if (!mini.on) return;
  mini.on = false;
  mini.el?.remove();
  const back = mini.back;
  mini.el = mini.input = mini.list = mini.opts = mini.back = null;
  mini.shown = [];
  if (back?.isConnected) back.focus({ preventScroll: true });
}

function pick(item) {
  if (!item) return;
  const { opts } = mini;
  keepHistory(opts.history, item.id);
  closeMini();
  opts.pick(item);
}

function openMini(root, opts) {
  closeMini();
  mini.back = document.activeElement;
  mini.opts = opts;
  mini.on = true;
  mini.at = 0;
  mini.histAt = -1;
  mini.moved = false;
  const el = document.createElement("div");
  el.className = "ck-mini";
  el.innerHTML = `<ul class="ck-ms" role="listbox"></ul><label class="ck-mp"><span class="ck-mq">${esc(opts.prompt)}</span><input type="text" spellcheck="false" autocomplete="off" aria-label="${esc(opts.prompt)}"><span class="ck-mn"></span></label>`;
  mini.el = el;
  mini.list = el.querySelector(".ck-ms");
  mini.input = el.querySelector("input");
  mini.input.value = opts.initial || "";
  mini.input.addEventListener("input", () => { mini.at = 0; mini.histAt = -1; mini.moved = false; paintMini(); });
  mini.list.addEventListener("mousedown", (event) => {
    const row = event.target.closest(".ck-mc[data-at]");
    if (!row) return;
    event.preventDefault();
    pick(mini.shown[Number(row.dataset.at)]);
  });
  root.append(el);
  paintMini();
  mini.input.focus({ preventScroll: true });
}

function step(d) {
  if (!mini.shown.length) return;
  mini.moved = true;
  mini.at = mini.at < 0 ? (d > 0 ? 0 : mini.shown.length - 1) : (mini.at + d + mini.shown.length) % mini.shown.length;
  paintMini();
}

function walkHistory(d) {
  const past = readHistory(mini.opts.history);
  const labels = past.map((id) => mini.shown.find((one) => one.id === id)?.label || candidatesOf("").find((one) => one.id === id)?.label).filter(Boolean);
  if (!labels.length) return;
  if (mini.histAt < 0) mini.typed = mini.input.value;
  mini.histAt = Math.max(-1, Math.min(labels.length - 1, mini.histAt + d));
  mini.input.value = mini.histAt < 0 ? mini.typed : labels[mini.histAt];
  mini.at = 0;
  paintMini();
}

const ctrl = (event, code) => event.ctrlKey && !event.altKey && !event.metaKey && event.code === code;

const alt = (event, code) => event.altKey && !event.ctrlKey && !event.metaKey && event.code === code;

function miniKey(event) {
  if (!mini.on) return false;
  if (event.key === "Escape" || ctrl(event, "KeyG")) {
    const cancel = mini.opts.cancel;
    closeMini();
    cancel?.();
    return true;
  }
  if (event.key === "Enter") { pick(mini.shown[mini.at]); return true; }
  if (event.key === "ArrowDown" || ctrl(event, "KeyN")) { step(1); return true; }
  if (event.key === "ArrowUp" || ctrl(event, "KeyP")) { step(-1); return true; }
  if (alt(event, "KeyP")) { walkHistory(1); return true; }
  if (alt(event, "KeyN")) { walkHistory(-1); return true; }
  if (event.key === "Tab") {
    const item = mini.shown[mini.at];
    if (item) { mini.input.value = item.label; paintMini(); }
    return true;
  }
  return isLeader(event);
}

const miniOn = () => mini.on;

const refreshMini = () => paintMini();

export { closeMini, fuzzyScore, miniKey, miniOn, openMini, rank, readHistory, refreshMini };

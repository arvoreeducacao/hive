import { IS_MAC, esc, phrase } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { refuseTooLong } from "./composer-length.js";
import { canSteer, onComposerMode, paintComposer } from "./composer-modes.js";
import { foldPastes, pasteLines } from "./pasted-text.js";
import { splitPeerHandle } from "./pure-helpers.js";

const QUEUE_VISIBLE_ROWS = 3;

const keysOf = (mac, other) => (IS_MAC ? mac : other);

function queuePreview(text, images) {
  const plain = foldPastes(String(text || ""), (words) => `[Pasted text +${pasteLines(words)} lines]`);
  return (images ? plain.replace(/\[Image #\d+\] ?/g, "") : plain).trim();
}

const userRows = (e) => (e.queuedEls || []).filter((el) => !el.dataset.system);

function rowSignature(e, item, at, total) {
  return JSON.stringify([item.dataset.text, item.dataset.images, e.editing?.item === item, at, total, !!e.turnOpen, !!e.ask, canSteer(e), phrase("Send now")]);
}

function fillQueueRow(e, item, at, total) {
  const sig = rowSignature(e, item, at, total);
  if (item.dataset.sig === sig) return;
  item.dataset.sig = sig;
  const images = JSON.parse(item.dataset.images || "[]");
  const quotes = JSON.parse(item.dataset.quotes || "[]");
  item.className = "sv-qitem cp-q";
  const editing = e.editing?.item === item;
  const thumbs = images.map((path) => `<span class="cp-q-thumb"><img alt="${esc(path.split("/").pop())}" src="/api/image?path=${encodeURIComponent(path)}&where=${e.where}&name=${encodeURIComponent(e.name)}"></span>`).join("");
  const text = queuePreview(splitPeerHandle(item.dataset.text || "").body, images.length);
  const nowTip = !e.turnOpen ? phrase("Start a turn with this message") : canSteer(e) ? phrase("Send into the current turn") : phrase("Skip compaction and send this message");
  const firstKeys = at === 0 ? ` (${keysOf("⌘⇧↵", "Ctrl+Shift+Enter")})` : "";
  const lastKeys = at === total - 1 ? ` (${keysOf("⌥↑", "Alt+↑")})` : "";
  const blocked = e.ask ? phrase("Answer the question to edit queued messages") : "";
  const acts = editing
    ? `<span class="cp-q-editing">${esc(phrase("Editing in the composer"))}</span><button type="button" class="cp-q-btn" data-act="q-cancel" aria-label="${esc(phrase("Cancel editing queued message"))}">${esc(phrase("Cancel"))}</button>`
    : `<button type="button" class="cp-q-btn cp-q-icon cp-q-now" data-act="q-now" aria-label="${esc(phrase("Send now"))}" title="${esc(`${phrase("Send now")} · ${nowTip}${firstKeys}`)}">${composerIcon("arrowUp")}</button>`
      + `<button type="button" class="cp-q-btn cp-q-icon" data-act="q-edit" aria-label="${esc(phrase("Edit queued message"))}" title="${esc(blocked || phrase("Edit in the composer") + lastKeys)}"${blocked ? " disabled" : ""}>${composerIcon("pencil")}</button>`
      + `<button type="button" class="cp-q-btn cp-q-icon" data-act="q-drop" aria-label="${esc(phrase("Remove queued message"))}" title="${esc(phrase("Remove from queue"))}">${composerIcon("x")}</button>`;
  item.setAttribute("aria-label", phrase("Queued message {n} of {total}, not sent", { n: at + 1, total }));
  item.innerHTML = `<div class="cp-q-bubble${editing ? " editing" : ""}">${thumbs ? `<span class="cp-q-thumbs">${thumbs}</span>` : ""}<p class="cp-q-text"></p></div><div class="cp-q-acts">${acts}</div>`;
  const said = item.querySelector(".cp-q-text");
  said.textContent = text || quotes.map((one) => `“${one.said}”`).join(" ");
  said.classList.toggle("cp-q-quoted", !text && !!quotes.length);
  if (!said.textContent) said.remove();
}

function wireQueue(e, tray) {
  if (tray.dataset.wired) return;
  tray.dataset.wired = "1";
  tray.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".cp-q-btn, .cp-q-more")) ev.preventDefault(); });
  tray.addEventListener("click", (ev) => {
    if (ev.target.closest(".cp-q-more")) {
      e.queueAll = !e.queueAll;
      return paintQueue(e);
    }
    const hit = ev.target.closest(".cp-q-btn[data-act]");
    const item = hit?.closest(".sv-qitem");
    if (!hit || !item || hit.disabled) return;
    const act = hit.dataset.act;
    if (act === "q-now") return e.box?.sendNow(item);
    if (act === "q-edit") return beginEdit(e, item);
    if (act === "q-cancel") return cancelEdit(e, true);
    if (act === "q-drop") return e.box?.remove(item);
  });
}

function paintQueue(e) {
  const tray = e.host?.querySelector(".sv-queue");
  if (!tray) return;
  wireQueue(e, tray);
  const held = (e.queuedEls || []).filter((el) => el.parentElement === tray);
  if (e.editing && !held.includes(e.editing.item)) editLeft(e);
  const rows = held.filter((el) => !el.dataset.system);
  rows.forEach((item, at) => fillQueueRow(e, item, at, rows.length));
  if ([...tray.children].filter((el) => held.includes(el)).some((el, at) => el !== held[at])) for (const item of held) tray.append(item);
  const folds = held.length > QUEUE_VISIBLE_ROWS;
  held.forEach((item, at) => { item.hidden = folds && !e.queueAll && at >= QUEUE_VISIBLE_ROWS - 1 && item !== e.editing?.item; });
  let more = tray.querySelector(":scope > .cp-q-more");
  if (!folds) more?.remove();
  else {
    if (!more) {
      more = document.createElement("button");
      more.type = "button";
      more.className = "cp-q-more";
    }
    tray.append(more);
    more.setAttribute("aria-expanded", String(!!e.queueAll));
    more.innerHTML = `<span>${esc(e.queueAll ? phrase("Show fewer") : phrase("Show all {n} queued", { n: held.length }))}</span>${composerIcon("chevronDown", e.queueAll ? "up" : "")}`;
  }
  tray.classList.toggle("on", held.length > 0);
}

function beginEdit(e, item) {
  if (!e.box || e.ask) return false;
  if (e.editing?.item === item) return true;
  if (e.editing) cancelEdit(e);
  e.editing = { item, saved: null, start: null, busy: false };
  e.holding = true;
  e.editing.saved = e.box.snapshot();
  e.box.restore({ text: "" });
  e.box.putBack(item);
  e.editing.start = e.box.snapshot();
  e.holding = false;
  paintQueue(e);
  paintComposer(e);
  e.box.textarea.focus();
  return true;
}

function giveBack(e, editing, keep = null) {
  if (!e.box || !editing?.saved) return;
  e.holding = true;
  e.box.restore(keep || editing.saved);
  e.holding = false;
}

function cancelEdit(e, focus = false) {
  const editing = e.editing;
  if (!editing) return;
  e.editing = null;
  giveBack(e, editing);
  paintQueue(e);
  paintComposer(e);
  if (focus) e.box?.textarea.focus();
}

function editLeft(e) {
  const editing = e.editing;
  e.editing = null;
  if (!editing?.saved || !e.box) return paintComposer(e);
  const now = e.box.snapshot();
  const changed = JSON.stringify(now) !== JSON.stringify(editing.start);
  const waiting = !!(editing.saved.text?.trim() || editing.saved.images?.length || editing.saved.quotes?.length);
  giveBack(e, editing, changed && !waiting ? now : null);
  paintComposer(e);
}

function updateEdit(e) {
  const editing = e.editing;
  if (!editing || editing.busy || !e.box) return;
  const out = e.box.outgoing();
  if (out.error) return void e.box.warn(out.error);
  if (!out.text && !out.images.length) return;
  if (refuseTooLong(e.host, out.text)) return;
  editing.busy = true;
  e.sending = true;
  paintComposer(e);
  e.box.resay(editing.item, out).then((r) => {
    editing.busy = false;
    e.sending = false;
    if (e.editing !== editing) return paintComposer(e);
    if (!r?.ok) {
      paintComposer(e);
      if (r?.gone) return editLeft(e);
      return void e.box.warn(r?.error || phrase("the driver refused it"));
    }
    cancelEdit(e, true);
  });
}

function editLatest(e) {
  if (e.ask || e.editing) return false;
  const last = userRows(e).at(-1);
  if (!last) return false;
  e.queueAll = true;
  return beginEdit(e, last);
}

function sendFirstQueued(e) {
  const first = userRows(e)[0];
  if (!first) return false;
  e.box?.sendNow(first);
  return true;
}

function editingBanner() {
  return `<section class="cp-ban"><div class="cp-brow"><span class="cp-bi">${composerIcon("pencil")}</span><span class="cp-bc"><span class="cp-bmuted">${esc(phrase("Editing queued message"))}</span></span><span class="cp-ba"><button type="button" class="cp-bbtn" data-act="edit-cancel">${esc(phrase("Cancel"))}</button></span></div></section>`;
}

onComposerMode({
  before(e, mode) {
    if (!e.holding && e.editing && mode !== "edit") cancelEdit(e);
  },
  repaint: paintQueue
});

export { QUEUE_VISIBLE_ROWS, beginEdit, cancelEdit, editLatest, editingBanner, paintQueue, queuePreview, sendFirstQueued, updateEdit, userRows };

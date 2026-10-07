import { markCopied } from "./avatars.js";
import { activeItems } from "./blocks.js";
import { closeSeatPicker } from "./chat-and-panes.js";
import { connectStructured } from "./chat-stretches.js";
import { keyLabel } from "./brand-face.js";
import { esc, phrase, raycastOn, st } from "./core.js";
import { pool } from "./leader-key.js";
import { forgetStruct, structPool } from "./structured-seats.js";
import { TERM_LOOK, copyOnSelect, hostClass, newTerm } from "./terminal-pool.js";

const notches = (ev) => Math.min(10, Math.max(1, Math.round(Math.abs(ev.deltaY) / (ev.deltaMode === 0 ? 24 : 1))));

const atBottom = (t) => (t.atBottom ? t.atBottom() : t.buffer.active.viewportY >= t.buffer.active.baseY);

function historyOf(e) {
  if (e.hist) return e.hist;
  const wrap = document.createElement("div");
  wrap.className = "hist";
  const host = document.createElement("div");
  const chip = document.createElement("button");
  chip.className = "hist-chip";
  chip.textContent = phrase("looking back · esc for live");
  if (raycastOn()) paintHistChip(chip);
  wrap.append(host, chip);
  const { term, fit } = newTerm({ ...TERM_LOOK, scrollback: 20000, disableStdin: true, cursorInactiveStyle: "none" }, e);
  host.className = hostClass("hist-term", term);
  copyOnSelect(term);
  chip.addEventListener("click", (ev) => { ev.stopPropagation(); backToLive(e); });
  e.hist = { term, fit, wrap, host, opened: false };
  return e.hist;
}

const tracksMouse = (e) => (e.term.modes?.mouseTrackingMode || "none") !== "none";

const wheelReports = (ev) => Math.min(5, Math.max(1, Math.round(Math.abs(ev.deltaY) / (ev.deltaMode === 0 ? 40 : 1))));

function wheelToPane(e, ev) {
  const box = e.host.getBoundingClientRect();
  if (!box.width || !box.height || e.ws?.readyState !== 1) return;
  const col = Math.min(e.term.cols, Math.max(1, Math.ceil((ev.clientX - box.left) / (box.width / e.term.cols))));
  const row = Math.min(e.term.rows, Math.max(1, Math.ceil((ev.clientY - box.top) / (box.height / e.term.rows))));
  e.ws.send(`\x1b[<${ev.deltaY < 0 ? 64 : 65};${col};${row}M`.repeat(wheelReports(ev)));
}

function onWheel(e, ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (tracksMouse(e)) {
    if (e.lookingBack) backToLive(e);
    return wheelToPane(e, ev);
  }
  const rows = notches(ev);
  if (!e.lookingBack) {
    if (ev.deltaY < 0) lookBack(e, rows);
    return;
  }
  const term = e.hist?.term;
  if (!term) return;
  if (ev.deltaY < 0) return term.scrollLines(-rows);
  if (atBottom(term)) return backToLive(e);
  term.scrollLines(rows);
}

async function lookBack(e, rows) {
  const well = e.host.parentElement;
  if (!well || e.lookingBack || e.loadingBack) return;
  e.loadingBack = true;
  let text = "";
  try {
    const r = await fetch(`/api/history?name=${encodeURIComponent(e.name)}&where=${e.where}`);
    text = (await r.json()).text || "";
  } catch {}
  e.loadingBack = false;
  const body = text.replace(/\s+$/, "");
  if (!body || body.split("\n").length <= e.term.rows) {
    return;
  }
  if (e.lookingBack || e.host.parentElement !== well) return;
  const h = historyOf(e);
  e.lookingBack = true;
  well.appendChild(h.wrap);
  if (!h.opened) { h.term.open(h.host); h.opened = true; }
  requestAnimationFrame(() => {
    try { h.fit.fit(); } catch {}
    if (!e.lookingBack) return;
    h.term.reset();
    h.term.write(body.replace(/\r?\n/g, "\r\n"), () => {
      h.term.scrollToBottom();
      h.term.scrollLines(-rows);
    });
  });
}

function backToLive(e) {
  if (!e.lookingBack) return;
  e.lookingBack = false;
  e.hist?.wrap.remove();
  if (st.typing === e.name) e.term.focus();
}

class HiveSocket {
  constructor(path) {
    this.readyState = 0;
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.link = window.hiveLink.open(path, {
      open: () => { this.readyState = 1; this.onopen?.(); },
      data: (payload) => this.onmessage?.({ data: payload }),
      close: () => { this.readyState = 3; this.onclose?.(); },
      error: (why) => { this.onerror?.(new Error(why || "the hive link broke")); }
    });
  }
  send(text) { if (this.readyState === 1) this.link.send(text); }
  close() { this.readyState = 3; this.link.close(); }
}

const lookingBack = () => [...pool.values()].find((x) => x.lookingBack) || null;

function connect(e) {
  const cols = e.term.cols || 120;
  const rows = e.term.rows || 30;
  const path = `/pty?name=${encodeURIComponent(e.name)}&where=${e.where}&cols=${cols}&rows=${rows}${e.root ? "&target=pod" : ""}`;
  const ws = window.hiveLink ? new HiveSocket(path) : new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`);
  ws.binaryType = "arraybuffer";
  e.ws = ws;
  e.since = Date.now();
  ws.onopen = () => { e.size = ""; refit(e); };
  ws.onmessage = (ev) => e.term.write(typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data));
  ws.onclose = () => { if (e.ws === ws) e.ws = null; };
  ws.onerror = () => {};
}

const RETRY_AFTER = 6000;

function paintHistChip(chip) {
  if (raycastOn()) {
    const html = `<b>${phrase("looking back")}</b><span class="rc-key">esc</span>${phrase("back to live")}`;
    if (chip.innerHTML === html) return;
    chip.title = phrase("looking back · esc for live");
    chip.innerHTML = html;
  } else if (chip.hasAttribute("title")) {
    chip.removeAttribute("title");
    chip.textContent = phrase("looking back · esc for live");
  }
}

function paintWellKeys(el, s) {
  const well = el.querySelector(".well");
  if (!well) return;
  const hist = well.querySelector(".hist-chip");
  if (hist) paintHistChip(hist);
  let keys = well.querySelector(":scope > .well-keys");
  const cover = well.querySelector(":scope > .cover > span");
  if (!raycastOn() || s.structured) {
    if (!keys) return;
    keys.remove();
    well.classList.remove("dropped");
    if (cover) cover.innerHTML = phrase("click or {n} to type in this session", { n: keyLabel(st.keys.type) });
    return;
  }
  if (!keys) {
    keys = document.createElement("span");
    keys.className = "well-keys";
    well.querySelector(":scope > .badge")?.after(keys);
  }
  const e = pool.get(s.name);
  const typing = st.typing === s.name;
  const dropped = !!e?.attached && !e.ws && Date.now() - (e.since || 0) > RETRY_AFTER;
  const [key, said] = dropped ? [keyLabel(st.keys.reconnect), phrase("reconnect")]
    : typing ? [keyLabel(st.keys.release), phrase("gives the keyboard back")]
    : [keyLabel(st.keys.type), phrase("to type here")];
  const size = e?.term?.cols ? `<span class="sz">${e.term.cols}×${e.term.rows}</span>` : "";
  const html = `<span class="rc-key">${esc(key)}</span>${esc(said)}${size}`;
  if (keys.innerHTML !== html) keys.innerHTML = html;
  const coverHtml = phrase("click or {n} to type in this session", { n: `<span class="rc-key">${esc(keyLabel(st.keys.type))}</span>` });
  if (cover && cover.innerHTML !== coverHtml) cover.innerHTML = coverHtml;
  well.classList.toggle("dropped", dropped);
  if (dropped) well.querySelector(":scope > .badge").textContent = phrase("the connection to the terminal dropped — trying again");
}

function keepTerminalsUp() {
  for (const e of pool.values()) {
    if (!e.host.isConnected) continue;
    refit(e);
    if (e.ws || Date.now() - (e.since || 0) < RETRY_AFTER) continue;
    connect(e);
  }
}

function refit(e) {
  if (!e.host.isConnected || !e.host.clientWidth) return;
  if (e.lookingBack && e.hist?.host.clientWidth) { try { e.hist.fit.fit(); } catch {} }
  try { e.fit.fit(); } catch { return; }
  if (!e.term.cols || !e.term.rows) return;
  const size = `${e.term.cols}x${e.term.rows}`;
  if (e.ws?.readyState !== 1 || e.size === size) return;
  e.size = size;
  e.ws.send("\x01" + JSON.stringify({ c: e.term.cols, r: e.term.rows }));
}

async function toClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

const boxText = (pre) => (pre.classList.contains("md-diff")
  ? [...pre.children].map((line) => line.textContent.replaceAll("\u200b", "")).join("\n")
  : pre.textContent);

function blockText(block) {
  const buttons = [...block.querySelectorAll(".md-copy"), ...block.querySelectorAll(".sv-stamp")];
  for (const one of buttons) one.style.display = "none";
  const said = block.innerText;
  for (const one of buttons) one.style.display = "";
  return said;
}

document.addEventListener("click", async (ev) => {
  const button = ev.target.closest(".md-copy");
  if (!button) return;
  ev.preventDefault();
  const pre = button.parentElement?.querySelector(".md-code");
  if (pre && await toClipboard(boxText(pre))) markCopied(button);
}, true);

function focusedTerminal() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  return it?.kind === "session" ? pool.get(it.name) || null : null;
}

function terminalSelection() {
  const term = focusedTerminal()?.term;
  return term?.hasSelection() ? term.getSelection() : "";
}

const fieldHasSelection = () => {
  const el = document.activeElement;
  return /^(INPUT|TEXTAREA)$/.test(el?.tagName || "") && el.selectionStart !== el.selectionEnd;
};

function copySelection() {
  const text = terminalSelection() || (fieldHasSelection() ? "" : String(document.getSelection() || ""));
  if (!text) return false;
  toClipboard(text);
  return true;
}

const observer = new ResizeObserver((entries) => {
  for (const ent of entries) {
    const name = ent.target.dataset.name;
    const e = pool.get(name);
    if (e) requestAnimationFrame(() => refit(e));
  }
});

function dropTerminal(name) {
  const e = pool.get(name);
  if (!e) return;
  try { e.ws?.close(); e.term.dispose(); e.hist?.term.dispose(); } catch {}
  pool.delete(name);
  e.host.remove();
  e.hist?.wrap.remove();
}

function dropStructured(name) {
  const se = structPool.get(name);
  if (!se) return;
  closeSeatPicker(se);
  try { se.ws?.close(); } catch {}
  forgetStruct(name);
  se.host.remove();
}

function mount(e, well) {
  dropStructured(e.name);
  well.classList.remove("structured");
  if (e.host.parentElement === well) return;
  well.appendChild(e.host);
  if (e.lookingBack && e.hist) well.appendChild(e.hist.wrap);
  if (!e.attached) { e.term.open(e.host); e.attached = true; }
  requestAnimationFrame(() => {
    refit(e);
    if (!e.ws) connect(e);
  });
}

function reconnect(name) {
  const se = structPool.get(name);
  if (se) {
    try { se.ws?.close(); } catch {}
    se.since = 0;
    connectStructured(se);
    return;
  }
  const e = pool.get(name);
  if (!e) return;
  backToLive(e);
  try { e.ws?.close(); } catch {}
  connect(e);
}

export { HiveSocket, RETRY_AFTER, atBottom, backToLive, paintWellKeys, blockText, boxText, connect, copySelection, dropStructured, dropTerminal, focusedTerminal, historyOf, keepTerminalsUp, lookBack, lookingBack, mount, notches, observer, onWheel, reconnect, refit, terminalSelection, toClipboard, tracksMouse, wheelReports, wheelToPane };

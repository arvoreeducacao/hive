import { esc, phrase } from "./core.js";

/* a long paste stays out of the box: what the person sees is one mark, and the words travel whole,
   wrapped so the session can tell what was written from what was pasted. */

const PASTE_MIN_LINES = 10;

const PASTE_MIN_CHARS = 1000;

const PASTE_MARK_RE = /\[Pasted text #(\d+) \+(\d+) lines\]/g;

const PASTED_RE = /<pasted_content>\n?([\s\S]*?)\n?<\/pasted_content>/g;

const pasteLines = (text) => String(text).replace(/\n+$/, "").split("\n").length;

const isLongPaste = (text) => !!text && (pasteLines(text) >= PASTE_MIN_LINES || text.length >= PASTE_MIN_CHARS);

const pasteMark = (n, text) => `[Pasted text #${n} +${pasteLines(text)} lines]`;

const wrapPasted = (text) => `<pasted_content>\n${String(text).replace(/\n+$/, "")}\n</pasted_content>`;

function pasteSpots(said) {
  PASTE_MARK_RE.lastIndex = 0;
  return [...String(said).matchAll(PASTE_MARK_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, n: Number(m[1]) }));
}

const pasteAt = (said, at) => pasteSpots(said).find((spot) => at > spot.start && at < spot.end) || null;

function outboundPastes(text, held) {
  PASTE_MARK_RE.lastIndex = 0;
  return String(text).replace(PASTE_MARK_RE, (mark, n) => {
    const words = held.get(Number(n));
    return words === undefined ? mark : wrapPasted(words);
  });
}

/* a message taken back into the box — from the queue, or from ↑ — folds its pastes again, so the
   box never fills up with what it hid the first time. */
function foldPastes(text, add) {
  PASTED_RE.lastIndex = 0;
  return String(text).replace(PASTED_RE, (_, words) => add(words));
}

function pastedPieces(text) {
  const said = String(text ?? "");
  const pieces = [];
  let last = 0;
  PASTED_RE.lastIndex = 0;
  for (const m of said.matchAll(PASTED_RE)) {
    const before = said.slice(last, m.index).replace(/^\n+|\n+$/g, "");
    if (before) pieces.push({ kind: "text", text: before });
    pieces.push({ kind: "paste", text: m[1] });
    last = m.index + m[0].length;
  }
  const after = said.slice(last).replace(/^\n+|\n+$/g, "");
  if (after) pieces.push({ kind: "text", text: after });
  return pieces;
}

const hasPasted = (text) => String(text ?? "").includes("<pasted_content>");

/* the folded block in the chat: one click on the head opens it, one more closes it, and the words
   inside stay selectable — a double click in there picks a word, it never folds the block. */
function pastedCardHtml(words) {
  const n = pasteLines(words);
  return `<details class="sv-paste"><summary title="${esc(phrase("click to open or close · esc closes"))}"><svg aria-hidden="true"><use href="#i-quote"/></svg><span class="pl">${esc(phrase("Pasted text"))}</span><span class="pn">${esc(phrase(n === 1 ? "{n} line" : "{n} lines", { n }))}</span></summary><pre class="sv-paste-body">${esc(words)}</pre></details>`;
}

function fillWithPastes(el, text, fillText) {
  const doc = el.ownerDocument;
  for (const piece of pastedPieces(text)) {
    if (piece.kind === "paste") {
      const hold = doc.createElement("template");
      hold.innerHTML = pastedCardHtml(piece.text);
      el.append(hold.content);
      continue;
    }
    const part = doc.createElement("div");
    part.className = "sv-said-part";
    fillText(part, piece.text);
    el.append(part);
  }
  return el;
}

const keyFor = (name) => `hive.pastes:${name}`;

/* what each mark stands for lives next to the box, and in the browser so a reload does not leave
   a mark pointing at nothing. */
function pasteStore(name) {
  const held = new Map();
  let seq = 0;
  try {
    const kept = JSON.parse(localStorage.getItem(keyFor(name())) || "null");
    for (const [n, words] of kept?.held || []) held.set(Number(n), String(words));
    seq = Number(kept?.seq) || 0;
  } catch {}
  const save = () => {
    try {
      if (held.size) localStorage.setItem(keyFor(name()), JSON.stringify({ seq, held: [...held] }));
      else localStorage.removeItem(keyFor(name()));
    } catch {}
  };
  return {
    held,
    count: () => held.size,
    add(words) {
      const n = ++seq;
      held.set(n, words);
      save();
      return n;
    },
    set(n, words) {
      held.set(n, words);
      save();
    },
    get: (n) => held.get(n),
    clear() {
      held.clear();
      seq = 0;
      save();
    }
  };
}

function insertMark(box, mark) {
  const at = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? at;
  const pad = at > 0 && !/\s$/.test(box.value.slice(0, at)) ? " " : "";
  const words = `${pad}${mark} `;
  box.focus();
  /* insertText keeps the paste on the undo stack, the same way a typed paste would be. */
  if (!document.execCommand?.("insertText", false, words)) box.setRangeText(words, at, end, "end");
}

/* the peek opens over the box when the caret lands on a mark. the head closes it, esc closes it,
   and what is edited in there is what will be sent. */
function pastePeek(composer, box, store, onChange) {
  let open = null;
  const peek = document.createElement("div");
  peek.className = "sv-paste-peek";
  peek.hidden = true;
  peek.innerHTML = `<button type="button" class="pp-head"><svg aria-hidden="true"><use href="#i-quote"/></svg><span class="pl"></span><span class="pn"></span><span class="pc" aria-hidden="true">▾</span></button><div class="pp-body" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-multiline="true"></div>`;
  const head = peek.querySelector(".pp-head");
  const body = peek.querySelector(".pp-body");
  /* it lives in the tray over the box, which both layouts of the composer carry along. the words are
     an editable block and not a textarea: the rest of the app reads the chat's first textarea as the
     box, and this one must never be it. */
  const tray = composer.querySelector(".sv-attach") || composer;
  tray.append(peek);
  const lay = () => tray.classList.toggle("on", !peek.hidden || !!tray.querySelector(".att"));
  const close = (refocus = true) => {
    if (open === null) return;
    open = null;
    peek.hidden = true;
    lay();
    onChange?.();
    if (refocus) box.focus();
  };
  const show = (n) => {
    const words = store.get(n);
    if (words === undefined) return;
    if (open === n) return close();
    open = n;
    head.querySelector(".pl").textContent = phrase("Pasted text #{n}", { n });
    head.querySelector(".pn").textContent = phrase(pasteLines(words) === 1 ? "{n} line" : "{n} lines", { n: pasteLines(words) });
    head.title = phrase("click to close · esc closes");
    body.textContent = words;
    peek.hidden = false;
    lay();
    onChange?.();
  };
  head.addEventListener("click", () => close());
  body.addEventListener("input", () => { if (open !== null) store.set(open, body.innerText ?? body.textContent); });
  body.addEventListener("keydown", (kev) => {
    kev.stopPropagation();
    if (kev.key === "Escape") { kev.preventDefault(); close(); }
  });
  return { show, close, open: () => open, el: peek };
}

export { PASTE_MARK_RE, PASTE_MIN_CHARS, PASTE_MIN_LINES, fillWithPastes, foldPastes, hasPasted, insertMark, isLongPaste, outboundPastes, pasteAt, pasteLines, pasteMark, pastePeek, pasteSpots, pasteStore, pastedCardHtml, pastedPieces, wrapPasted };

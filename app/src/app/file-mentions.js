import { st } from "./core.js";
import { markZone } from "./drag-files.js";
import { pool } from "./leader-key.js";
import { structPool } from "./structured-seats.js";

const MENTION_TYPE = "application/x-hive-file-mention";

let dragging = null;

const trimmed = (path) => String(path || "").replace(/\/+$/, "");

function mentionPathOf(seat, { root, path, folder, where }) {
  const rel = `${path}${folder ? "/" : ""}`;
  const top = trimmed(root);
  const cwd = trimmed(seat?.cwd);
  const sameSide = (seat?.where === "cloud" ? "cloud" : "local") === (where === "cloud" ? "cloud" : "local");
  if (!top || (sameSide && top === cwd)) return rel;
  if (sameSide && cwd && top.startsWith(`${cwd}/`)) return `${top.slice(cwd.length + 1)}/${rel}`;
  return `${top}/${rel}`;
}

const asMention = (path) => (/[\s"'()]/.test(path) ? `@"${path.replace(/"/g, '\\"')}"` : `@${path}`);

const seatNamed = (name) => (st.data?.sessions || []).find((one) => one.name === name) || null;

function composerOf(name) {
  const e = structPool.get(name);
  if (!e || e.mirror) return null;
  const box = e.host?.querySelector(".sv-composer textarea");
  return box && !box.disabled && !box.readOnly ? box : null;
}

const terminalOf = (name) => {
  if (seatNamed(name)?.kind === "shell") return null;
  const e = pool.get(name);
  return e?.term && e.ws?.readyState === 1 ? e : null;
};

const canTake = (name) => !!composerOf(name) || (!structPool.has(name) && !!terminalOf(name));

function leadOf(before, block) {
  if (!before) return "";
  if (!block) return /\s$/.test(before) ? "" : " ";
  return /\n\n$/.test(before) ? "" : /\n$/.test(before) ? "\n" : "\n\n";
}

function putInComposer(name, text, { block = false, focus = true } = {}) {
  const box = composerOf(name);
  if (box) {
    const caret = document.activeElement === box;
    const at = caret ? box.selectionStart ?? box.value.length : box.value.length;
    const end = caret ? box.selectionEnd ?? at : at;
    const said = `${leadOf(box.value.slice(0, at), block)}${text}${block ? "\n" : " "}`;
    if (focus) {
      box.focus();
      box.setSelectionRange(at, end);
      if (document.execCommand?.("insertText", false, said)) return true;
    }
    box.setRangeText(said, at, end, "end");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (structPool.has(name)) return false;
  const term = terminalOf(name);
  if (!term) return false;
  term.term.paste(block ? `${text}\n` : `${text} `);
  if (focus) term.term.focus?.();
  return true;
}

function fenceFor(text) {
  const longest = Math.max(0, ...[...String(text).matchAll(/`{3,}/g)].map((run) => run[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

function terminalExcerpt(text) {
  const body = String(text).replace(/\s+$/, "");
  const fence = fenceFor(body);
  return `${fence}console\n${body}\n${fence}`;
}

function linesExcerpt(path, from, to, text, language = "") {
  const range = from === to ? `#L${from}` : `#L${from}-${to}`;
  const fence = fenceFor(text);
  return `${asMention(`${path}`)}${range}\n${fence}${language}\n${String(text).replace(/\n$/, "")}\n${fence}`;
}

const carriesMention = (dt) => [...(dt?.types || [])].includes(MENTION_TYPE);

function dropTargetOf(event) {
  const node = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!node || node.closest(".art.sp")) return null;
  const tile = node.closest(".tile[data-name]");
  const name = tile?.dataset.name || "";
  const seat = name ? seatNamed(name) : null;
  return seat && canTake(name) ? { tile, name, seat } : null;
}

function startMentionDrag(event, payload, seat) {
  if (!event.dataTransfer || !payload?.path) return;
  dragging = payload;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(MENTION_TYPE, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", asMention(mentionPathOf(seat, payload)));
}

function readPayload(dt) {
  try {
    const said = JSON.parse(dt.getData(MENTION_TYPE) || "null");
    if (said && typeof said.path === "string" && typeof said.root === "string") return said;
  } catch {}
  return dragging;
}

if (typeof window !== "undefined") {
  window.addEventListener("dragover", (event) => {
    if (!carriesMention(event.dataTransfer)) return;
    event.stopPropagation();
    event.preventDefault();
    const target = dropTargetOf(event);
    event.dataTransfer.dropEffect = target ? "copy" : "none";
    markZone(target ? { el: target.tile } : null);
  }, true);

  window.addEventListener("drop", (event) => {
    if (!carriesMention(event.dataTransfer)) return;
    event.stopPropagation();
    event.preventDefault();
    markZone(null);
    const target = dropTargetOf(event);
    const payload = readPayload(event.dataTransfer);
    dragging = null;
    if (target && payload) putInComposer(target.name, asMention(mentionPathOf(target.seat, payload)));
  }, true);

  window.addEventListener("dragend", () => {
    if (!dragging) return;
    dragging = null;
    markZone(null);
  }, true);
}

export { MENTION_TYPE, asMention, canTake, linesExcerpt, mentionPathOf, putInComposer, startMentionDrag, terminalExcerpt };

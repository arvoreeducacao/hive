import { IS_MAC, st } from "./core.js";
import { editBox } from "./composer-editing.js";
import { composerUsable, focusedComposer, layerOpen } from "./composer-focus.js";

const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]';

const INTERACTIVE = 'button, a[href], summary, [role="application"], [role="button"], [role="checkbox"], [role="menuitem"], [role="option"], [role="radio"], [role="switch"], [role="tab"]';

const PLAIN_PASTE_ARMED_MS = 1000;

let plainUntil = 0;

function pathHas(ev, selector) {
  const path = ev.composedPath?.() || [];
  if (!path.length && ev.target) path.push(ev.target);
  return path.some((node) => node instanceof Element && !!node.closest(selector));
}

function redirectable(ev) {
  if (ev.defaultPrevented || st.typing) return false;
  if (pathHas(ev, EDITABLE) || pathHas(ev, INTERACTIVE)) return false;
  return !layerOpen();
}

function armPlainPaste(ev) {
  const mod = IS_MAC ? ev.metaKey : ev.ctrlKey;
  if (mod && ev.shiftKey && !ev.altKey && ev.code === "KeyV" && redirectable(ev)) plainUntil = Date.now() + PLAIN_PASTE_ARMED_MS;
}

function pastedWords(data) {
  if (!data || data.files?.length || [...(data.items || [])].some((one) => one.kind === "file")) return "";
  return data.getData("text/plain") || "";
}

function redirectPaste(ev) {
  const words = pastedWords(ev.clipboardData);
  if (!words || !redirectable(ev)) return;
  const target = focusedComposer();
  if (!composerUsable(target?.box)) return;
  const plain = Date.now() <= plainUntil;
  plainUntil = 0;
  const box = target.box;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  if (target.paste) target.paste(words, plain);
  else editBox(box, box.value.length, box.value.length, words);
  ev.preventDefault();
  ev.stopPropagation();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", armPlainPaste, true);
  window.addEventListener("paste", redirectPaste);
}

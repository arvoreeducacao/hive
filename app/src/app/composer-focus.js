import { activeItems } from "./blocks.js";
import { st } from "./core.js";
import { draftInFocus } from "./draft-seat.js";
import { structPool } from "./structured-seats.js";

const OPEN_LAYERS = [
  ".modal.on", ".menu.on", ".shot.on", ".sv-menu",
  "#pal:not([hidden])", "#nudge:not([hidden])", "#usage:not([hidden])", "#routines:not([hidden])",
  "#worktrees:not([hidden])", "#memories:not([hidden])", "#day:not([hidden])", "#shelf:not([hidden])",
  "#workspace:not([hidden])", "#portaria:not([hidden])", "#arrange:not([hidden])"
].join(", ");

const layerOpen = () => [...document.querySelectorAll(OPEN_LAYERS)].some((el) => !el.parentElement?.closest("[hidden]"));

function focusedComposer() {
  const draft = draftInFocus();
  if (draft) return { box: draft.e.host.querySelector(".sv-composer textarea"), paste: null };
  const name = st.open || activeItems()[st.focus]?.name;
  const e = name ? structPool.get(name) : null;
  return e?.box ? { box: e.box.textarea, paste: e.box.paste } : null;
}

const composerUsable = (box) => !!box?.isConnected && !box.disabled && !box.closest("[hidden], [inert]");

function focusComposerAtEnd() {
  const box = focusedComposer()?.box;
  if (!composerUsable(box)) return false;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  return document.activeElement === box;
}

function nobodyHoldsFocus() {
  const now = document.activeElement;
  return !now || now === document.body || now === document.documentElement || !!now.closest?.("#pal");
}

function focusAfterPalette() {
  if (!document.getElementById("pal")?.hidden || !nobodyHoldsFocus() || layerOpen()) return;
  focusComposerAtEnd();
}

export { composerUsable, focusAfterPalette, focusComposerAtEnd, focusedComposer, layerOpen };

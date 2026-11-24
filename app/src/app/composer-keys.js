import { openSeatPicker, seatAgent, setPlanMode } from "./chat-and-panes.js";
import { IS_MAC } from "./core.js";
import { advanceAsk } from "./composer-ask.js";
import { stashBox, stashMenuKeys } from "./composer-drawer.js";
import { composerLive, composerMode, requiresModifier, sendIntent } from "./composer-modes.js";
import { implementPlan } from "./composer-plan.js";
import { cancelEdit, editLatest, sendFirstQueued, updateEdit } from "./composer-queue.js";
import { structPool } from "./structured-seats.js";

const modOf = (kev) => (IS_MAC ? kev.metaKey : kev.ctrlKey);

const bare = (kev) => !kev.metaKey && !kev.ctrlKey && !kev.altKey && !kev.shiftKey;

function composerKeys(e, kev) {
  if (!composerLive(e)) return false;
  const mod = modOf(kev);
  if (kev.code === "KeyS" && mod && !kev.altKey && !kev.shiftKey) {
    stashBox(e);
    return true;
  }
  if (e.stashOpen && stashMenuKeys(e, kev)) return true;
  if (kev.key === "Tab" && kev.shiftKey && !kev.metaKey && !kev.ctrlKey && !kev.altKey && seatAgent(e) === "claude") {
    setPlanMode(e, e.mode !== "plan");
    return true;
  }
  if (kev.key === "Enter" && mod && kev.shiftKey && !kev.altKey && !requiresModifier(e.box?.textarea.value)) return sendFirstQueued(e);
  if (kev.key === "ArrowUp" && kev.altKey && !kev.metaKey && !kev.ctrlKey && !kev.shiftKey) return editLatest(e);
  if (kev.key === "Escape" && e.editing) {
    cancelEdit(e, true);
    return true;
  }
  if (kev.key !== "Enter" || kev.shiftKey || kev.isComposing) return false;
  const mode = composerMode(e);
  if (mode === "question") {
    if (bare(kev)) advanceAsk(e);
    return true;
  }
  if (mode === "edit") {
    const intent = sendIntent(kev, { text: e.box?.textarea.value || "" });
    if (intent) updateEdit(e);
    return !!intent;
  }
  if (mode === "plan" && bare(kev) && !e.box?.textarea.value.trim()) {
    implementPlan(e);
    return true;
  }
  if (mode === "resume" && bare(kev)) {
    e.box?.say(false);
    return true;
  }
  return false;
}

function composerOfEvent(ev) {
  const box = ev.target;
  if (!box || box.tagName !== "TEXTAREA") return null;
  for (const e of structPool.values()) if (e.box?.textarea === box) return e;
  return null;
}

/* the app binds some of these chords to the whole screen (mod+s opens the Slack thread) and that listener runs first. */
function claimComposerKeys(ev) {
  if (ev.isComposing) return;
  const mod = modOf(ev);
  const other = IS_MAC ? ev.ctrlKey : ev.metaKey;
  if (!mod || other || ev.altKey) return;
  const e = composerOfEvent(ev);
  if (!composerLive(e) || !e.box) return;
  let took = false;
  if (ev.shiftKey && (ev.code === "KeyM" || ev.code === "KeyE")) {
    openSeatPicker(e, ev.code === "KeyM" ? "model" : "effort");
    took = true;
  } else if (ev.code === "KeyS" && !ev.shiftKey) {
    stashBox(e);
    took = true;
  } else if (ev.key === "Enter") {
    const mode = composerMode(e);
    const intent = sendIntent(ev, { text: e.box.textarea.value, running: mode === "steer" || mode === "queue" });
    if (ev.shiftKey && !requiresModifier(e.box.textarea.value)) {
      took = sendFirstQueued(e);
    } else if (mode === "steer" || mode === "queue") {
      if (intent) e.box.say(intent === "alternate");
      took = !!intent;
    } else if (mode === "edit") {
      updateEdit(e);
      took = true;
    } else if (mode === "question" || mode === "plan") {
      took = true;
    }
  }
  if (!took) return;
  ev.preventDefault();
  ev.stopPropagation();
}

if (typeof window !== "undefined") window.addEventListener("keydown", claimComposerKeys, true);

export { composerKeys };

import { IS_MAC, esc, phrase } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { structPool } from "./seat-pool.js";

const STOP_PENDING_MAX_MS = 10_000;

const STOP_LANDED_GUARD_MS = 500;

const COMPACTING = "compacting the conversation…";

const MOD = IS_MAC ? "⌘" : "Ctrl";

const ALTERNATE_KEYS = IS_MAC ? "⌘↵" : "Ctrl+Enter";

const FOLLOW_UPS = ["queue", "steer"];

const FOLLOW_UP_DEFAULT = "queue";

const SEND_SHORTCUTS = ["enter", "mod-enter-multiline", "mod-enter"];

const RESUME = "Resume chat";

const SEND_ARROW = '<svg class="cp-i" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const STOP_SQUARE = '<svg class="cp-i" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5"/></svg>';

const SPINNER = '<span class="cp-spin" aria-hidden="true"></span>';

const SEND_ICONS = {
  idle: SEND_ARROW,
  steer: composerIcon("cornerUpRight"),
  queue: composerIcon("listPlus"),
  edit: composerIcon("check"),
  resume: composerIcon("play"),
  busy: SPINNER
};

const modeHooks = [];

function onComposerMode(hook) {
  modeHooks.push(hook);
}

let followUpPreference = FOLLOW_UP_DEFAULT;

function setFollowUp(value) {
  followUpPreference = FOLLOW_UPS.includes(value) ? value : FOLLOW_UP_DEFAULT;
  repaintComposers();
}

const followUp = () => followUpPreference;

let sendShortcutPreference = "enter";

function setSendShortcut(value) {
  sendShortcutPreference = SEND_SHORTCUTS.includes(value) ? value : "enter";
  repaintComposers();
}

const sendShortcut = () => sendShortcutPreference;

const requiresModifier = (text, shortcut = sendShortcutPreference) => shortcut === "mod-enter" || (shortcut === "mod-enter-multiline" && /[\r\n]/.test(String(text || "")));

function sendIntent(kev, { text = "", running = false, shortcut = sendShortcutPreference } = {}) {
  if (kev.key !== "Enter" || kev.isComposing || kev.keyCode === 229) return null;
  const mod = IS_MAC ? kev.metaKey : kev.ctrlKey;
  const other = IS_MAC ? kev.ctrlKey : kev.metaKey;
  if (other || kev.altKey) return null;
  const strict = requiresModifier(text, shortcut);
  if (kev.shiftKey) return mod && strict && running ? "alternate" : null;
  if (mod) return !strict && running ? "alternate" : "foreground";
  return strict ? null : "foreground";
}

const driverHooks = [];

function onComposerDriver(hook) {
  driverHooks.push(hook);
}

function composerDriverNote(e, ev, live) {
  let taken = false;
  for (const hook of driverHooks) if (hook.note?.(e, ev, live)) taken = true;
  return taken;
}

function composerSaw(e, ev, live) {
  for (const hook of driverHooks) hook.saw?.(e, ev, live);
}

function composerDriverState(e, state) {
  for (const hook of driverHooks) hook.state?.(e, state);
}

const slashHooks = [];

function onComposerSlash(hook) {
  slashHooks.push(hook);
}

function composerCommands(e) {
  if (!composerLive(e)) return [];
  return slashHooks.flatMap((hook) => hook.offer?.(e) || []);
}

function composerPickTaken(e, name) {
  if (!composerLive(e)) return false;
  return slashHooks.some((hook) => hook.pick?.(e, name));
}

const sendHooks = [];

function onComposerSend(hook) {
  sendHooks.push(hook);
  sendHooks.sort((a, b) => (a.order || 0) - (b.order || 0));
}

function composerSendTaken(e, asked = {}) {
  if (!composerLive(e)) return false;
  for (const hook of sendHooks) if (hook.take(e, asked)) return true;
  return false;
}

const composerLive = (e) => !!e?.host && !e.mirror && !e.draft;

const compacting = (e) => !!e.activity && e.activity === phrase(COMPACTING);

const queuedCompact = (e) => (e.queuedEls || []).some((el) => el.dataset.system === "compact");

const canSteer = (e) => !e.steerRefused && !compacting(e) && !queuedCompact(e);

function dispatchMode({ running, alternate, steerable = true, preferred = FOLLOW_UP_DEFAULT }) {
  if (!running) return "auto";
  if (!steerable) return "queue";
  const other = preferred === "steer" ? "queue" : "steer";
  return alternate ? other : preferred;
}

let modHeld = false;

function holdMod(on) {
  if (modHeld === on) return;
  modHeld = on;
  for (const e of structPool.values()) if (e.host?.isConnected && e.turnOpen) paintComposer(e);
}

function composerMode(e) {
  if (!composerLive(e)) return "";
  if (e.ask && !e.ask.waiting) return "question";
  if (e.editing) return "edit";
  if (e.planAsk) return "plan";
  if (!e.turnOpen && resumeOffered(e)) return "resume";
  if (e.turnOpen) return dispatchMode({ running: true, alternate: modHeld, steerable: canSteer(e), preferred: followUp() });
  return "idle";
}

function boxHasContent(e) {
  const box = e.box?.snapshot?.();
  if (!box) return false;
  return !!box.text.trim() || !!box.images.length || !!box.quotes.length;
}

const heldRows = (e) => (e.queuedEls || []).some((el) => !el.dataset.system);

const resumeOffered = (e) => !!e.queueHeld && !e.sending && (heldRows(e) || e.heldCount > 0) && !boxHasContent(e) && !e.dictating;

function stopShown(e, mode) {
  if (mode === "edit" || mode === "plan") return false;
  if (e.stopPhase === "pending" || e.stopPhase === "timedOut") return true;
  if (!e.turnOpen) return false;
  if (mode === "question") return true;
  return !boxHasContent(e) && !e.sending;
}

function requestStop(e, interrupt) {
  if (e.stopPhase === "pending") return;
  if (e.stopPhase !== "timedOut") e.stopAskedAt = Date.now();
  e.stopPhase = "pending";
  clearTimeout(e.stopTimer);
  e.stopTimer = setTimeout(() => {
    if (e.stopPhase !== "pending") return;
    e.stopPhase = "timedOut";
    paintComposer(e);
  }, STOP_PENDING_MAX_MS);
  paintComposer(e);
  interrupt();
}

function stopLanded(e) {
  if (e.stopPhase !== "pending" && e.stopPhase !== "timedOut") return;
  clearTimeout(e.stopTimer);
  e.stopPhase = "landed";
  e.stopTimer = setTimeout(() => {
    if (e.stopPhase !== "landed") return;
    e.stopPhase = null;
    paintComposer(e);
  }, STOP_LANDED_GUARD_MS);
}

const stopGuarding = (e) => e?.stopPhase === "landed";

function sendLabels(e, mode) {
  if (e.sending) {
    const busy = mode === "edit" ? phrase("Updating queued message") : phrase("Submitting message");
    return { label: busy, tip: busy };
  }
  if (mode === "edit") return { label: phrase("Update queued message"), tip: phrase("Update queued message") };
  if (mode === "resume") return { label: phrase(RESUME), tip: phrase(RESUME) };
  if (mode === "idle") return { label: phrase("Submit message"), tip: phrase("Submit message") };
  const label = mode === "queue" ? phrase("Queue message") : phrase("Steer message");
  if (!canSteer(e)) return { label, tip: label };
  const tip = followUp() === "steer"
    ? phrase("Click to steer, {modifier}-click or {shortcut} to queue", { modifier: MOD, shortcut: ALTERNATE_KEYS })
    : phrase("Click to queue, {modifier}-click or {shortcut} to steer", { modifier: MOD, shortcut: ALTERNATE_KEYS });
  return { label, tip };
}

function paintSend(e, form, mode) {
  const send = form.querySelector(".sv-send");
  if (!send) return;
  const look = e.sending ? "busy" : SEND_ICONS[mode] ? mode : "idle";
  if (send.dataset.icon !== look) {
    send.dataset.icon = look;
    send.innerHTML = SEND_ICONS[look];
  }
  const { label, tip } = sendLabels(e, mode);
  if (send.title !== tip) send.title = tip;
  if (send.getAttribute("aria-label") !== label) send.setAttribute("aria-label", label);
  send.setAttribute("aria-busy", e.sending ? "true" : "false");
  send.disabled = !!e.sending || ((mode === "idle" || mode === "steer" || mode === "queue" || mode === "edit") && !boxHasContent(e));
  send.hidden = mode === "question" || mode === "plan" || stopShown(e, mode);
}

function paintStop(e, form, mode) {
  const stop = form.querySelector(".sv-stop");
  if (!stop) return;
  const pending = e.stopPhase === "pending";
  if (stop.dataset.icon !== "stop") {
    stop.dataset.icon = "stop";
    stop.innerHTML = STOP_SQUARE;
  }
  stop.hidden = !stopShown(e, mode);
  stop.disabled = pending;
  const label = pending ? phrase("Stopping") : phrase("Stop generation");
  if (stop.getAttribute("aria-label") !== label) stop.setAttribute("aria-label", label);
  const tip = pending ? phrase("Stopping…") : phrase("Interrupt");
  if (stop.title !== tip) stop.title = tip;
}

function paintComposer(e) {
  const form = e?.host?.querySelector(".sv-composer");
  if (!form) return;
  const mode = composerMode(e);
  for (const hook of modeHooks) hook.before?.(e, mode);
  if ((form.dataset.cpMode || "") !== mode) {
    if (mode) form.dataset.cpMode = mode;
    else delete form.dataset.cpMode;
  }
  form.classList.toggle("stopping", e.stopPhase === "pending");
  if (!mode) return;
  paintSend(e, form, mode);
  paintStop(e, form, mode);
  for (const hook of modeHooks) hook.paint?.(e, form, mode);
}

function repaintComposers() {
  for (const e of structPool.values()) {
    for (const hook of modeHooks) hook.repaint?.(e);
    paintComposer(e);
  }
}

const keyHint = (keys, said) => `<kbd class="rc-key">${esc(keys)}</kbd>${esc(said)}`;

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (ev) => holdMod(IS_MAC ? ev.metaKey : ev.ctrlKey), true);
  window.addEventListener("keyup", (ev) => holdMod(IS_MAC ? ev.metaKey : ev.ctrlKey), true);
  window.addEventListener("blur", () => holdMod(false));
}

export {
  ALTERNATE_KEYS, FOLLOW_UPS, MOD, SEND_SHORTCUTS, STOP_LANDED_GUARD_MS, STOP_PENDING_MAX_MS, boxHasContent, canSteer, composerCommands, composerDriverNote, composerDriverState, composerLive, composerSaw, composerMode, composerPickTaken, composerSendTaken, dispatchMode, followUp,
  holdMod, keyHint, onComposerDriver, onComposerMode, onComposerSend, onComposerSlash, paintComposer, repaintComposers, requestStop, requiresModifier, resumeOffered, sendIntent, sendShortcut, setFollowUp, setSendShortcut, stopGuarding, stopLanded, stopShown
};

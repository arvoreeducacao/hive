import { svCmd } from "./chat-stretches.js";
import { phrase } from "./core.js";
import { composerMode, onComposerDriver, onComposerSend, paintComposer } from "./composer-modes.js";
import { svConvUnsay } from "./conversation-model.js";
import { refreshDriverState, svLine } from "./structured-seats.js";

const RESUME_FAILED = "Could not resume chat.";

const OLD_DRIVER = /unknown command/i;

const HELD_NOTE_FRESH_MS = 10_000;

function holdQueue(e, held, count = 0) {
  const next = !!held;
  const was = !!e.queueHeld;
  e.queueHeld = next;
  e.heldCount = next ? Number(count) || 0 : 0;
  if (was !== next) paintComposer(e);
}

function bringBackHeldRows(e, queue) {
  if (!Array.isArray(queue) || !e.box?.enqueue) return;
  const shown = new Set((e.queuedEls || []).map((el) => el.dataset.cid).filter(Boolean));
  for (const item of queue) {
    if (!item?.cid || shown.has(item.cid) || typeof item.text !== "string") continue;
    if (e.conv) svConvUnsay(e, item.cid);
    e.box.enqueue(item.text, Array.isArray(item.images) ? item.images : [], [], item.cid, item.uuid || "");
  }
}

async function resumeQueue(e) {
  if (e.resuming) return;
  e.resuming = true;
  e.sending = true;
  paintComposer(e);
  const r = await svCmd(e, { type: "resume" });
  e.resuming = false;
  e.sending = false;
  if (r?.ok) {
    e.atBottom = true;
    holdQueue(e, false);
  } else if (!r?.silent) {
    svLine(e, "sv-meta warn", OLD_DRIVER.test(r?.error || "") || !r?.error ? phrase(RESUME_FAILED) : `${phrase(RESUME_FAILED)} ${r.error}`);
  }
  paintComposer(e);
}

onComposerSend({
  order: 20,
  take(e) {
    if (composerMode(e) !== "resume") return false;
    resumeQueue(e);
    return true;
  }
});

onComposerDriver({
  note(e, ev, live) {
    if (!live) return false;
    const fresh = Date.now() - (Number(e.at) || 0) < HELD_NOTE_FRESH_MS;
    if (ev.subtype === "queue_held") {
      if (fresh) holdQueue(e, true, ev.count);
      return true;
    }
    if (ev.subtype === "queue_released") {
      if (fresh) holdQueue(e, false);
      return true;
    }
    if (ev.subtype === "started") setTimeout(() => { if (e.host?.isConnected) refreshDriverState(e); }, 1500);
    return false;
  },
  state(e, state) {
    if (typeof state?.held !== "boolean") return;
    bringBackHeldRows(e, state.queue);
    holdQueue(e, state.held, state.queued);
  }
});

export { bringBackHeldRows, holdQueue, resumeQueue };

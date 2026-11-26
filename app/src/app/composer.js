import "./composer-actions.js";
import "./composer-drawer.js";
import "./composer-keys.js";
import "./composer-place.js";
import "./composer-paste-redirect.js";
import "./composer-next-prompt.js";
import "./media-menu.js";
import "./composer-resume.js";
import "./composer-force-stop.js";
import "./composer-compact.js";
import "./composer-fresh.js";
import "./composer-dictation.js";
import "./composer-provider.js";
import { closeAsk, dropAsk, noteAsk } from "./composer-ask.js";
import { composerDriverNote, composerDriverState, composerSaw, paintComposer, repaintComposers, stopLanded } from "./composer-modes.js";
import { forgetPlan, notePlan } from "./composer-plan.js";
import { paintQueue } from "./composer-queue.js";

function pruneAsks(e, pending) {
  if (!Array.isArray(pending)) return;
  if (e.ask && !pending.includes(e.ask.id)) dropAsk(e);
  if (e.planAsk && !pending.includes(e.planAsk.id)) forgetPlan(e, e.planAsk.id);
}

function composerHeard(e) {
  if (!e.turnOpen) stopLanded(e);
  paintComposer(e);
}

export { closeAsk, composerDriverNote, composerDriverState, composerHeard, composerSaw, forgetPlan, noteAsk, notePlan, paintComposer, paintQueue, pruneAsks, repaintComposers };

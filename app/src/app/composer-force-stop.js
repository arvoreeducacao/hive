import { svCmd } from "./chat-stretches.js";
import { esc, every, phrase } from "./core.js";
import { addDrawerBanner, onDrawerAct } from "./composer-drawer.js";
import { composerIcon } from "./composer-icons.js";
import { onComposerDriver, onComposerMode, paintComposer } from "./composer-modes.js";
import { refreshDriverState, structPool, svLine } from "./structured-seats.js";

const FORCE_STOP_FAILED = "Could not force stop the agent";

function stopClock(ms) {
  const span = Math.max(1000, Number(ms) || 0);
  const seconds = span / 1000;
  if (seconds < 10) return `${(Math.round(seconds * 10) / 10).toFixed(1).replace(/\.0$/, "")}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", rest ? `${rest}s` : ""].filter(Boolean).join(" ") || "0s";
}

const stopWaiting = (e) => !!e.turnOpen && (e.stopPhase === "pending" || e.stopPhase === "timedOut");

function stopBanner(e) {
  if (!stopWaiting(e)) return "";
  const clock = `<time class="cp-stop-clock" data-since="${Number(e.stopAskedAt) || 0}"></time>`;
  if (e.stopPhase === "pending") {
    return `<section class="cp-ban cp-stop"><div class="cp-brow"><span class="cp-bi">${composerIcon("circleStop")}</span><span class="cp-bc"><span class="cp-bstrong">${esc(phrase("Stopping"))}</span>${clock}</span></div></section>`;
  }
  const busy = !!e.forceStopping;
  return `<section class="cp-ban cp-stop cp-stop-stuck" role="alert"><div class="cp-brow"><span class="cp-bi">${composerIcon("triangleAlert")}</span>`
    + `<span class="cp-bc"><span class="cp-bstrong">${esc(phrase("Agent not responding to Stop"))}</span>${clock}</span>`
    + `<span class="cp-ba"><button type="button" class="cp-bbtn cp-force" data-act="force-stop"${busy ? " disabled" : ""}>${esc(busy ? phrase("Force stopping...") : phrase("Force stop"))}</button></span></div>`
    + `<p class="cp-stop-why">${esc(phrase("It may be short on memory. Force stop kills its processes."))}</p></section>`;
}

function tickStopClocks(e) {
  for (const clock of e.host?.querySelectorAll(".sv-drawer .cp-stop-clock") || []) {
    const since = Number(clock.dataset.since) || Date.now();
    const said = stopClock(Date.now() - since);
    if (clock.textContent !== said) clock.textContent = said;
  }
}

async function forceStop(e) {
  if (e.forceStopping || !stopWaiting(e)) return;
  e.forceStopping = true;
  paintComposer(e);
  const r = await svCmd(e, { type: "forceStop" });
  e.forceStopping = false;
  if (!r?.ok) {
    svLine(e, "sv-meta warn", r?.error ? `${phrase(FORCE_STOP_FAILED)}: ${r.error}` : phrase(FORCE_STOP_FAILED));
    return void paintComposer(e);
  }
  await refreshDriverState(e);
  paintComposer(e);
}

addDrawerBanner({ order: 5, html: stopBanner });

onDrawerAct("force-stop", (e) => forceStop(e));

onComposerMode({ paint: (e) => tickStopClocks(e) });

onComposerDriver({
  note(e, ev, live) {
    if (ev.subtype !== "force_stopped") return false;
    svLine(e, "sv-meta sv-stopped", phrase("Force stopped by user"));
    if (live) {
      e.forceStopping = false;
      paintComposer(e);
    }
    return true;
  }
});

every("stop-clock", 1000, () => {
  for (const e of structPool.values()) if (e.host?.isConnected && stopWaiting(e)) tickStopClocks(e);
});

export { forceStop, stopBanner, stopClock };

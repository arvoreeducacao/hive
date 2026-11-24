const MINUTE = 60000;

const HOUR = 60 * MINUTE;

const DAY = 24 * HOUR;

const SESSION_MINUTES = 5 * 60;

const WEEK_MINUTES = 7 * 24 * 60;

const PACE_MARGIN = 5;

const resetOf = (one) => {
  const at = one?.resets_at ? new Date(one.resets_at).getTime() : NaN;
  return Number.isFinite(at) ? at : null;
};

function monthBefore(reset) {
  const start = new Date(reset);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return reset - start.getTime();
}

function windowLength(one) {
  const minutes = Number(one?.window_minutes);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * MINUTE;
  const kind = String(one?.kind || "");
  if (kind === "session") return SESSION_MINUTES * MINUTE;
  if (kind.startsWith("weekly")) return WEEK_MINUTES * MINUTE;
  if (kind === "monthly") {
    const reset = resetOf(one);
    return reset === null ? null : monthBefore(reset);
  }
  return null;
}

function elapsedShare(one, now = Date.now()) {
  const reset = resetOf(one);
  const length = windowLength(one);
  if (reset === null || !length || reset <= now) return null;
  return Math.max(0, Math.min(1, (length - (reset - now)) / length));
}

function paceRemainingPercent(one, now = Date.now()) {
  const elapsed = elapsedShare(one, now);
  return elapsed === null ? null : Math.round((1 - elapsed) * 100);
}

function evenPacePercent(one, now = Date.now()) {
  const elapsed = elapsedShare(one, now);
  return elapsed === null ? null : Math.round(elapsed * 1000) / 10;
}

function paceOf(one, now = Date.now()) {
  const elapsed = elapsedShare(one, now);
  if (elapsed === null) return null;
  const gap = (Number(one.percent) || 0) - elapsed * 100;
  if (gap > PACE_MARGIN) return "ahead";
  if (gap < -PACE_MARGIN) return "under";
  return "on";
}

function spanSaid(ms) {
  const left = Math.max(0, ms);
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export { elapsedShare, evenPacePercent, paceOf, paceRemainingPercent, resetOf, spanSaid, windowLength };

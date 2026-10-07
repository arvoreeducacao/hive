export const QUIET_DAYS_OFF = 0;
export const QUIET_DAYS_RANGE = [1, 90];
export const QUIET_SWEEP_EVERY_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSY_STATES = new Set(["working", "needs"]);

export function cleanQuietDays(raw, where, problems) {
  if (raw === undefined || raw === null || raw === "" || raw === QUIET_DAYS_OFF || raw === false) return QUIET_DAYS_OFF;
  const [low, high] = QUIET_DAYS_RANGE;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= low && raw <= high) return raw;
  problems.push(`${where}: closeQuietAfterDays should be 0 to never close, or a whole number of days from ${low} to ${high}`);
  return QUIET_DAYS_OFF;
}

function seatIsBusy(session) {
  if (!session) return false;
  if (BUSY_STATES.has(session.state)) return true;
  return Array.isArray(session.live) && session.live.length > 0;
}

export function seatsGoneQuiet({ seats, sessions, lastActiveAt, days, now, held = new Set() }) {
  if (!days) return [];
  const byName = new Map((sessions || []).filter((one) => one.where !== "cloud").map((one) => [one.name, one]));
  const cutoff = now - days * DAY_MS;
  return (seats || []).filter((seat) => {
    if (seat.where !== "local") return false;
    if (held.has(seat.name)) return false;
    if (seatIsBusy(byName.get(seat.name))) return false;
    const at = lastActiveAt(seat);
    return Number.isFinite(at) && at > 0 && at < cutoff;
  });
}

export function quietReason(days) {
  return days === 1 ? "closed after a day without activity" : `closed after ${days} days without activity`;
}

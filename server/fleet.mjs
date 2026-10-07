export const BENCH = "mac";
export const HERE = "local";
export const PANEL_SIDE_POD = "cloud";
export const PANEL_STALE_MS = 180000;
export const CLOSED = "closed";
export const LIVE_KEPT = 6;

const text = (value, ceiling) => String(value ?? "").slice(0, ceiling);

export function seatOfSession(session) {
  return {
    name: session.name,
    title: text(session.title || session.name, 120),
    where: HERE,
    state: text(session.state || "idle", 24),
    model: text(session.model, 40),
    errand: text(session.errand, 80),
    live: Array.isArray(session.live) ? session.live.slice(0, LIVE_KEPT) : [],
    liveSince: text(session.liveSince, 40)
  };
}

export function seatsOfPanel(row, at = Date.now()) {
  const seats = Array.isArray(row?.panel?.seats) ? row.panel.seats : [];
  const asleep = at - (row?.at || 0) > PANEL_STALE_MS;
  return seats
    .filter((seat) => seat?.name && seat.where !== PANEL_SIDE_POD)
    .map((seat) => ({ ...seat, where: BENCH, key: row?.fingerprint || "", at: row?.at || 0, asleep }));
}

export function benchOf(rows, at) {
  const home = rows.find((row) => seatsOfPanel(row, at).length) || rows[0];
  if (!home) return null;
  return {
    at: home.at || 0,
    asleep: at - (home.at || 0) > PANEL_STALE_MS,
    says: "",
    key: home.fingerprint || "",
    dev: text(home.panel?.dev, 40),
    avatar: text(home.panel?.avatar, 60),
    wear: text(home.panel?.wear, 80)
  };
}

export function fleetOf({ sessions = [], rows = [], pod = "", at = Date.now() } = {}) {
  const home = rows.flatMap((row) => seatsOfPanel(row, at));
  const known = new Set(home.map((seat) => seat.name));
  const here = sessions.filter((one) => !known.has(one.name) && one.state !== CLOSED).map(seatOfSession);
  const bench = benchOf(rows, at);
  return {
    sessions: [...home, ...here],
    ...(pod ? { pod: { name: pod, up: true } } : {}),
    ...(bench ? { bench } : {})
  };
}

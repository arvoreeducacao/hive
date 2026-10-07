import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const ERRAND_MAX = 60;
const SEAT = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const errandsFile = (home) => join(home, "errands.json");
export const seenFile = (home) => join(home, "errands-seen.json");

export const oneLine = (text, max = ERRAND_MAX) =>
  String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

export function readErrands(home) {
  try {
    const said = JSON.parse(readFileSync(errandsFile(home), "utf8"));
    return said && typeof said === "object" && !Array.isArray(said) ? said : {};
  } catch { return {}; }
}

export function noteErrand(home, { seat, errand, asked = "", at = 0, race = 0, by = "" }) {
  const name = String(seat || "").trim().toLowerCase();
  const label = oneLine(errand);
  const parent = String(by || "").trim().toLowerCase();
  if (!SEAT.test(name)) return { error: "an errand needs a seat and a line" };
  if (!label && !parent) return { error: "an errand needs a seat and a line, or the chat that opened it" };
  if (parent && (!SEAT.test(parent) || parent === name)) return { error: "the chat that opened it is another seat, by name" };
  const all = readErrands(home);
  const of = Math.floor(Number(race?.of ?? race) || 0);
  all[name] = { errand: label, asked: oneLine(asked, 400), at: at || 0, endedAt: 0, prs: [], ...(of > 1 ? { race: of } : {}), ...(parent ? { by: parent } : {}) };
  try {
    mkdirSync(dirname(errandsFile(home)), { recursive: true });
    writeFileSync(errandsFile(home), `${JSON.stringify(all, null, 2)}\n`);
  } catch (wrong) { return { error: String(wrong?.message || wrong) }; }
  return { errands: all };
}

export const ERRAND_KEPT_FOR = 14 * 24 * 60 * 60 * 1000;

export function keepErrands(home, sessions, { now = Date.now(), prsOf = () => [] } = {}) {
  const live = new Map((sessions || []).map((seat) => [String(seat.name || "").toLowerCase(), seat]));
  const all = readErrands(home);
  const left = {};
  let changed = false;
  let dropped = 0;

  for (const [seat, one] of Object.entries(all)) {
    const here = live.get(seat);
    if (here) {
      const prs = [...new Set(prsOf(here.name) || [])];
      const same = one.endedAt === 0 && String(one.prs || []) === String(prs);
      left[seat] = same ? one : { ...one, endedAt: 0, prs };
      if (!same) changed = true;
      continue;
    }
    const ended = one.endedAt || now;
    if (now - ended > ERRAND_KEPT_FOR) { dropped += 1; changed = true; continue; }
    left[seat] = one.endedAt ? one : { ...one, endedAt: ended };
    if (!one.endedAt) changed = true;
  }

  if (!changed) return { errands: all, dropped: 0 };
  try { writeFileSync(errandsFile(home), `${JSON.stringify(left, null, 2)}\n`); } catch {}
  return { errands: left, dropped };
}

export function renameErrand(home, from, to) {
  const was = oneLine(from);
  const now = oneLine(to);
  if (!was || !now) return { error: "a rename needs the name it had and the name it gets" };
  if (was === now) return { errands: readErrands(home), moved: 0 };
  const all = readErrands(home);
  const moved = Object.values(all).filter((one) => one.errand === was).length;
  if (!moved) return { error: `no request is called “${was}” any more` };
  const left = {};
  for (const [seat, one] of Object.entries(all)) left[seat] = one.errand === was ? { ...one, errand: now } : one;
  try {
    mkdirSync(dirname(errandsFile(home)), { recursive: true });
    writeFileSync(errandsFile(home), `${JSON.stringify(left, null, 2)}\n`);
  } catch (wrong) { return { error: String(wrong?.message || wrong) }; }

  const seen = readSeen(home);
  if (Object.prototype.hasOwnProperty.call(seen, was)) {
    const carried = { ...seen, [now]: seen[was] };
    delete carried[was];
    try { writeFileSync(seenFile(home), `${JSON.stringify(carried, null, 2)}\n`); } catch {}
  }
  return { errands: left, moved };
}

export const closedErrands = (errands) => {
  const index = new Map();
  for (const one of Object.values(errands || {})) {
    if (!one.endedAt || !one.errand) continue;
    const had = index.get(one.errand);
    if (had) {
      had.prs = [...new Set([...had.prs, ...(one.prs || [])])];
      had.endedAt = Math.max(had.endedAt, one.endedAt);
      continue;
    }
    index.set(one.errand, {
      errand: one.errand, asked: one.asked || "", at: one.at || 0,
      endedAt: one.endedAt, prs: [...new Set(one.prs || [])]
    });
  }
  return [...index.values()];
};

export const withErrands = (sessions, errands) =>
  (sessions || []).map((seat) => {
    const one = errands?.[String(seat.name || "").toLowerCase()];
    return one ? { ...seat, errand: one.errand, asked: one.asked || "", ...(one.race > 1 ? { race: one.race } : {}), ...(one.by ? { by: one.by } : {}) } : seat;
  });

export const errandOf = (errands, seat) => errands?.[String(seat || "").trim().toLowerCase()]?.errand || "";

export function forgetOldKin(home, seat) {
  const name = String(seat || "").trim().toLowerCase();
  if (!SEAT.test(name)) return { errands: readErrands(home), dropped: 0 };
  const all = readErrands(home);
  const left = {};
  let dropped = 0;
  for (const [one, row] of Object.entries(all)) {
    if (row?.by === name && row.endedAt) { dropped += 1; continue; }
    left[one] = row;
  }
  if (!dropped) return { errands: all, dropped: 0 };
  try {
    mkdirSync(dirname(errandsFile(home)), { recursive: true });
    writeFileSync(errandsFile(home), `${JSON.stringify(left, null, 2)}\n`);
  } catch (wrong) { return { error: String(wrong?.message || wrong) }; }
  return { errands: left, dropped };
}

export const goneKin = (errands, alive) => {
  const here = new Set((alive || []).map((seat) => String(seat?.name || "").toLowerCase()).filter(Boolean));
  return Object.entries(errands || {})
    .filter(([seat, one]) => one?.by && one.endedAt && !here.has(seat) && here.has(one.by))
    .map(([seat, one]) => ({
      name: seat,
      by: one.by,
      errand: one.errand || "",
      endedAt: one.endedAt,
      prs: [...new Set(one.prs || [])]
    }))
    .sort((a, b) => a.endedAt - b.endedAt);
};

export const raceOf = (seats) => {
  const list = seats || [];
  if (list.length < 2) return 0;
  const sizes = new Set(list.map((seat) => Number(seat?.race) || 0));
  return sizes.size === 1 ? [...sizes][0] : 0;
};

export function seatsOfErrand(errands, label) {
  const wanted = oneLine(label);
  if (!wanted) return [];
  return Object.entries(errands || {})
    .filter(([, one]) => one.errand === wanted && !one.endedAt)
    .map(([seat]) => seat);
}

export function byErrand(sessions) {
  const errands = [];
  const index = new Map();
  const loose = [];
  for (const seat of sessions || []) {
    const label = seat.errand || "";
    if (!label) { loose.push(seat); continue; }
    if (!index.has(label)) {
      const one = { errand: label, asked: seat.asked || "", seats: [] };
      index.set(label, one);
      errands.push(one);
    }
    index.get(label).seats.push(seat);
  }
  return { errands, loose };
}

export function readSeen(home) {
  try {
    const said = JSON.parse(readFileSync(seenFile(home), "utf8"));
    return said && typeof said === "object" && !Array.isArray(said) ? said : {};
  } catch { return {}; }
}

export function markSeen(home, errand, at = 0) {
  const label = oneLine(errand);
  if (!label) return { error: "nothing to mark" };
  const all = readSeen(home);
  all[label] = at || 0;
  try {
    mkdirSync(dirname(seenFile(home)), { recursive: true });
    writeFileSync(seenFile(home), `${JSON.stringify(all, null, 2)}\n`);
  } catch (wrong) { return { error: String(wrong?.message || wrong) }; }
  return { seen: all };
}

const NEEDS = new Set(["needs"]);
const RESTING = new Set(["done", "ready", "idle", "stalled"]);

const stillRunning = (seat) => Array.isArray(seat?.live) && seat.live.length > 0;

export function zonesOf({ sessions = [], prsOf = () => [], seen = {}, closed = [] } = {}) {
  const { errands, loose } = byErrand(sessions);
  const groups = errands.concat(loose.map((seat) => ({ errand: "", asked: "", seats: [seat] })));
  const open = new Set(errands.map((one) => one.errand));
  const needsYou = [];
  const cameBack = [];
  const onTheWay = [];
  const byHand = [];

  for (const one of groups) {
    const seats = one.seats;
    const prs = seats.flatMap((seat) => prsOf(seat.name) || []);
    const waiting = seats.filter((seat) => NEEDS.has(seat.state));
    const resting = seats.filter((seat) => RESTING.has(seat.state) && !stillRunning(seat));
    const said = seats.find((seat) => seat.asked)?.asked || one.asked || "";
    const at = seats.reduce((newest, seat) => Math.max(newest, seat.at || 0), 0);
    const group = { ...one, asked: said, seats, prs, at, race: raceOf(seats) };

    if (waiting.length) { needsYou.push({ ...group, waiting }); continue; }
    if (!one.errand) { byHand.push(group); continue; }
    const done = resting.length === seats.length;
    if (done && prs.length && !seen[one.errand]) { cameBack.push(group); continue; }
    onTheWay.push(group);
  }

  for (const one of closed) {
    if (open.has(one.errand) || seen[one.errand] || !one.prs.length) continue;
    cameBack.push({ ...one, seats: [], closed: true, at: one.endedAt });
  }

  return { needsYou, cameBack, onTheWay, byHand };
}

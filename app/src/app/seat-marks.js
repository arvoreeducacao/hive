import { cleanThreads, customSnoozeUntil, sectionOf, snoozeChoices, sweepMarks } from "/assets/thread-rules.mjs";
import { clockOptions } from "./clock-format.js";
import { esc, phrase, st } from "./core.js";
import { hudUndo } from "./hud.js";
import { ask } from "./pod.js";
import { confirmBefore } from "./confirmations.js";

const MARKS_ROUTE = "/api/inbox/marks";
const LOCAL_MARKS_KEY = "hive.inbox.marks";
const HOUR = 3600000;

const marks = {};
let seenData = null;
let moving = false;
let dialog = null;

st.threadRules = cleanThreads(undefined);

const repaint = () => document.dispatchEvent(new CustomEvent("hive:marks"));

const isSeatKey = (key) => !!key && !/^(team|draft|job|file|gone):/.test(key);

function sendMarks(body) {
  return fetch(MARKS_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

function keepInBrowser() {
  try { localStorage.setItem(LOCAL_MARKS_KEY, JSON.stringify(marks)); } catch {}
}

function saveMarks(keys) {
  if (!keys.length) return;
  if (!st.data?.marks) return keepInBrowser();
  sendMarks({ marks: Object.fromEntries(keys.map((key) => [key, marks[key]])) });
}

function takeMarks(said) {
  for (const [key, mark] of Object.entries(said || {})) if (mark && (!marks[key] || (mark.at || 0) > (marks[key].at || 0))) marks[key] = { ...mark };
}

function moveLocalMarks() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(LOCAL_MARKS_KEY) || "null"); } catch {}
  if (!old || moving) return;
  moving = true;
  sendMarks({ marks: old, moving: true }).then((said) => {
    moving = false;
    if (!said?.ok) return;
    try { localStorage.removeItem(LOCAL_MARKS_KEY); } catch {}
    takeMarks(said.marks);
    repaint();
  });
}

function adoptSeatMarks() {
  const said = st.data?.marks;
  if (!said) {
    if (!seenData) {
      try { takeMarks(JSON.parse(localStorage.getItem(LOCAL_MARKS_KEY) || "{}")); } catch {}
    }
    return;
  }
  if (said === seenData) return;
  seenData = said;
  takeMarks(said);
  moveLocalMarks();
}

function adoptThreads(r) {
  st.threadRules = cleanThreads(r?.config?.threads);
}

const seatMark = (key) => marks[key] || {};

const seatSection = (key, now = Date.now()) => sectionOf(marks[key], now);

const isShelved = (key, now = Date.now()) => {
  const section = seatSection(key, now);
  return section === "snoozed" || section === "settled";
};

const sessionOf = (key) => (st.data?.sessions || []).find((one) => one.name === key) || null;

const titleOf = (key) => {
  const s = sessionOf(key);
  return (s && !s.anon && s.title) || key;
};

function change(keys, edit) {
  const now = Date.now();
  const before = new Map();
  for (const key of keys) {
    if (!isSeatKey(key) || before.has(key)) continue;
    before.set(key, marks[key] ? { ...marks[key] } : null);
    marks[key] ||= {};
    edit(marks[key], key);
    marks[key].at = now;
  }
  const touched = [...before.keys()];
  saveMarks(touched);
  repaint();
  return () => {
    const at = Date.now();
    for (const [key, was] of before) marks[key] = { ...(was || {}), at };
    saveMarks(touched);
    repaint();
  };
}

const many = (keys, one, more) => (keys.length === 1 ? phrase(one, { title: titleOf(keys[0]) }) : phrase(more, { n: keys.length }));

function wakeSaid(until, now = new Date()) {
  const at = new Date(until);
  const time = at.toLocaleTimeString([], clockOptions({ hour: "2-digit", minute: "2-digit" }));
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function settleSeats(keys, { undo = true } = {}) {
  const restore = change(keys, (m) => {
    m.settledAt = Date.now();
    for (const field of ["autoSettled", "pinnedAt", "wokeAt", "wokeEarly", "unread", "snoozeUntil", "stayActive"]) delete m[field];
  });
  if (undo) hudUndo({ icon: "i-check", text: many(keys, "Settled “{title}”", "Settled {n} chats"), run: restore });
  return restore;
}

function unsettleSeats(keys) {
  return change(keys, (m) => {
    if (m.autoSettled) m.stayActive = Date.now();
    delete m.settledAt;
    delete m.autoSettled;
  });
}

const settleSeat = (key) => (seatSection(key) === "settled" ? unsettleSeats([key]) : settleSeats([key]));

function snoozeSeats(keys, until, { undo = true } = {}) {
  const restore = change(keys, (m) => {
    m.snoozeUntil = until;
    m.snoozedAt = Date.now();
    for (const field of ["wokeAt", "wokeEarly", "settledAt", "autoSettled"]) delete m[field];
  });
  if (undo) hudUndo({ icon: "i-clock", text: many(keys, "Snoozed “{title}”", "Snoozed {n} chats"), mono: wakeSaid(until), run: restore });
  return restore;
}

const wakeSeats = (keys) => change(keys, (m) => {
  delete m.snoozeUntil;
  delete m.snoozedAt;
});

const asksBefore = (action) => confirmBefore(action);

async function togglePinSeat(key, { confirmed = false } = {}) {
  const pinned = !!marks[key]?.pinnedAt;
  if (pinned && !confirmed && asksBefore("unpin") && !(await ask(phrase("Unpin “{title}”?", { title: titleOf(key) }), phrase("It goes back to its place in the list."), phrase("unpin")))) return null;
  const restore = change([key], (m) => {
    if (pinned) delete m.pinnedAt;
    else {
      m.pinnedAt = Date.now();
      delete m.settledAt;
      delete m.autoSettled;
    }
  });
  if (pinned) hudUndo({ icon: "i-pin", text: phrase("Unpinned “{title}”", { title: titleOf(key) }), run: restore });
  return restore;
}

const setNeverSettles = (key, on) => change([key], (m) => { if (on) m.neverSettles = true; else delete m.neverSettles; });


function seenSeat(key) {
  const m = marks[key];
  if (!m || !(m.wokeAt || m.wokeEarly || m.unread)) return;
  change([key], (mark) => {
    delete mark.wokeAt;
    delete mark.wokeEarly;
    delete mark.unread;
  });
}

function forgetSeatMark(key) {
  if (!isSeatKey(key)) return;
  marks[key] = { at: Date.now() };
  saveMarks([key]);
}

function stampOf(seat) {
  const stamps = [seat.finish?.at, seat.turnSince, seat.liveSince].map((at) => Date.parse(at || "")).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : 0;
}

function seatFacts(seat, prs) {
  return {
    key: seat.name,
    session: true,
    state: seat.state,
    stamp: stampOf(seat),
    failed: !!seat.finish?.bad || seat.state === "failed",
    live: Array.isArray(seat.live) && seat.live.length > 0,
    prs: prs.filter((pr) => pr.session === seat.name).map((pr) => ({ state: pr.state || "open" }))
  };
}

function sweepSeatMarks(now = Date.now()) {
  adoptSeatMarks();
  const seats = (st.data?.sessions || []).filter((one) => one.name && !one.anon).map((one) => seatFacts(one, st.prs || []));
  const changed = sweepMarks(marks, seats, st.threadRules, now);
  saveMarks(changed);
  return changed;
}

const DAY_SAYS = { tomorrow: "Tomorrow", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const UNIT_SAYS = { minutes: ["In {n} minute", "In {n} minutes"], hours: ["In {n} hour", "In {n} hours"], days: ["In {n} day", "In {n} days"] };

function snoozeOptionSays(option) {
  if (option.in !== undefined) return phrase(UNIT_SAYS[option.unit][option.in === 1 ? 0 : 1], { n: option.in });
  if (option.day !== "today") return phrase(DAY_SAYS[option.day]);
  return phrase(Number(option.at.slice(0, 2)) >= 17 ? "This evening" : "Later today");
}

function snoozeChoicesNow(now = new Date()) {
  return snoozeChoices(st.threadRules.snoozeOptions, now).map((one) => ({ ...one, says: snoozeOptionSays(one), when: wakeSaid(one.until, now) }));
}

function closeCustomSnooze() {
  if (!dialog) return;
  const { scrim, back } = dialog;
  dialog = null;
  scrim.remove();
  if (back?.isConnected) back.focus({ preventScroll: true });
}

const pad = (n) => String(n).padStart(2, "0");
const dateField = (d) => `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeField = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openCustomSnooze(keys, { host = document.body, onSnooze = null } = {}) {
  closeCustomSnooze();
  const initial = new Date(Date.now() + HOUR);
  const scrim = document.createElement("div");
  scrim.className = "snz-scrim";
  scrim.innerHTML = `<form class="snz-dialog" role="dialog" aria-modal="true" aria-labelledby="snz-title" novalidate>
    <div class="snz-head"><h2 id="snz-title">${esc(phrase("Custom snooze"))}</h2><p>${esc(phrase("Choose when the chat comes back to the list."))}</p></div>
    <div class="snz-body">
      <div class="snz-seg" role="group" aria-label="${esc(phrase("Schedule type"))}"><button type="button" data-mode="date" aria-pressed="true">${esc(phrase("Date and time"))}</button><button type="button" data-mode="duration" aria-pressed="false">${esc(phrase("Duration"))}</button></div>
      <div class="snz-grid" data-for="date"><label>${esc(phrase("Date"))}<input type="date" name="date" min="${dateField(new Date())}" value="${dateField(initial)}" required></label><label>${esc(phrase("Time"))}<input type="time" name="time" value="${timeField(initial)}" required></label></div>
      <div class="snz-grid" data-for="duration" hidden><label>${esc(phrase("Snooze for"))}<input type="number" name="amount" min="0" step="any" value="2" required></label><label>${esc(phrase("Unit"))}<select name="unit"><option value="minutes">${esc(phrase("Minutes"))}</option><option value="hours" selected>${esc(phrase("Hours"))}</option><option value="days">${esc(phrase("Days"))}</option></select></label></div>
      <p class="snz-err" role="alert" hidden></p>
    </div>
    <div class="snz-foot"><button type="button" class="snz-btn" data-snz="cancel">${esc(phrase("Cancel"))}</button><button type="submit" class="snz-btn primary">${esc(phrase("Snooze"))}</button></div>
  </form>`;
  const form = scrim.firstElementChild;
  const err = form.querySelector(".snz-err");
  let mode = "date";
  const quiet = () => { err.hidden = true; };
  form.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-mode]");
    if (pick) {
      mode = pick.dataset.mode;
      for (const one of form.querySelectorAll("[data-mode]")) one.setAttribute("aria-pressed", String(one === pick));
      for (const one of form.querySelectorAll("[data-for]")) one.hidden = one.dataset.for !== mode;
      quiet();
    }
    if (event.target.closest('[data-snz="cancel"]')) closeCustomSnooze();
  });
  form.addEventListener("input", quiet);
  form.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeCustomSnooze();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const field = (name) => form.elements[name].value;
    const until = customSnoozeUntil(mode === "date" ? { mode, date: field("date"), time: field("time") } : { mode, amount: field("amount"), unit: field("unit") });
    if (!until) {
      err.textContent = phrase(mode === "date" ? "Choose a valid date and time in the future." : "Enter a positive duration.");
      err.hidden = false;
      return;
    }
    closeCustomSnooze();
    if (onSnooze) onSnooze(until);
    else snoozeSeats(keys, until);
  });
  scrim.addEventListener("pointerdown", (event) => { if (event.target === scrim) closeCustomSnooze(); });
  dialog = { scrim, back: document.activeElement };
  host.append(scrim);
  form.elements.date.focus();
  return scrim;
}


function spanSaid(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return phrase("now");
  if (min < 60) return phrase("{n}m", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return phrase("{n}h", { n: h });
  return phrase("{n}d", { n: Math.floor(h / 24) });
}

function marksStatusLines(name, now = Date.now()) {
  const mark = marks[name];
  if (!mark) return [];
  const section = sectionOf(mark, now);
  if (section === "snoozed") {
    const left = mark.snoozeUntil - now;
    return [{ id: "snoozed", icon: "alarm", label: left >= 60000 ? phrase("Snoozed, {left} left", { left: spanSaid(left) }) : phrase("Snoozed"), action: phrase("Wake now"), act: "unsnooze" }];
  }
  if (section === "settled") {
    const ago = now - (mark.settledAt || now);
    return [{ id: "settled", icon: "check", label: ago < 60000 ? phrase("Settled just now") : phrase("Settled {ago} ago", { ago: spanSaid(ago) }), action: phrase("Un-settle"), act: "unsettle" }];
  }
  if (mark.wokeAt) return [{ id: "woke", icon: "alarm", label: phrase(mark.wokeEarly ? "Back early from snooze" : "Woke from snooze"), action: phrase("Dismiss"), act: "dismiss-woke" }];
  return [];
}

function marksStatusAct(name, act) {
  if (act === "unsnooze") return wakeSeats([name]);
  if (act === "unsettle") return unsettleSeats([name]);
  if (act === "dismiss-woke") return seenSeat(name);
  return null;
}

export { asksBefore, adoptSeatMarks, adoptThreads, forgetSeatMark, isShelved, marksStatusAct, marksStatusLines, openCustomSnooze, seatMark, seatSection, seenSeat, setNeverSettles, settleSeat, settleSeats, snoozeChoicesNow, snoozeSeats, stampOf, sweepSeatMarks, togglePinSeat, unsettleSeats, wakeSaid, wakeSeats };

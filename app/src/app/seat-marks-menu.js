import { esc, phrase, raycastOn, st } from "./core.js";
import { hud } from "./hud.js";
import { closeTile, goTo, openBeside, pull } from "./focus-navigation.js";
import { ask } from "./pod.js";
import { forgetSeatMark, openCustomSnooze, seatMark, seatSection, setNeverSettles, settleSeats, snoozeChoicesNow, snoozeSeats, togglePinSeat, unsettleSeats, wakeSaid, wakeSeats } from "./seat-marks.js";
import { openHelp } from "./themes.js";

function openThreadSettings() {
  openHelp("threads");
}

function snoozeRows(keys) {
  return [
    ...snoozeChoicesNow().map((one) => ({ icon: "i-alarm", label: one.says, note: one.when, go: () => snoozeSeats(keys, one.until) })),
    { sep: true },
    { icon: "i-clock", label: phrase("Custom…"), go: () => openCustomSnooze(keys) },
    { icon: "i-list", label: phrase("Edit options…"), go: openThreadSettings }
  ];
}

function marksMenuRows(s) {
  if (!s?.name || s.anon) return [];
  const key = s.name;
  const section = seatSection(key);
  const mark = seatMark(key);
  const beside = st.threadRules.listClick === "beside";
  const rows = [
    beside ? { icon: "i-expand", label: phrase("Open in the main view"), go: () => goTo(key) } : { icon: "i-grid", label: phrase("Open beside"), go: () => openBeside(key) },
    { icon: "i-pin", label: phrase(section === "pinned" ? "Unpin" : "Pin"), go: () => togglePinSeat(key) }
  ];
  rows.push(section === "settled"
    ? { icon: "i-reload", label: phrase("Reopen"), go: () => unsettleSeats([key]) }
    : { icon: "i-check", label: phrase("Settle"), go: () => { if (st.open === key) closeTile(); settleSeats([key]); } });
  rows.push(section === "snoozed"
    ? { icon: "i-alarm", label: phrase("Wake now"), note: phrase("back {when}", { when: wakeSaid(mark.snoozeUntil) }), go: () => wakeSeats([key]) }
    : { icon: "i-alarm", label: phrase("Snooze"), note: snoozeChoicesNow()[0]?.when || "", sub: snoozeRows([key]) });
  rows.push({
    icon: "i-clock",
    label: phrase("Settle on its own"),
    note: phrase(mark.neverSettles ? "never" : "follow settings"),
    sub: [
      { icon: mark.neverSettles ? "" : "i-check", on: !mark.neverSettles, label: phrase("Follow settings"), go: () => setNeverSettles(key, false) },
      { icon: mark.neverSettles ? "i-check" : "", on: !!mark.neverSettles, label: phrase("Never"), go: () => setNeverSettles(key, true) }
    ]
  });
  return rows;
}

function eraseRow(s) {
  if (!s?.name || s.anon) return null;
  return { icon: "i-trash", label: phrase("Delete for good…"), danger: true, go: (at) => askToErase([{ name: s.name, where: s.where, title: s.title || s.name }], at) };
}

async function eraseOne({ name, where }) {
  const said = await fetch("/api/seat/erase", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, where })
  }).then((r) => r.json()).catch((wrong) => ({ error: String(wrong?.message || wrong) }));
  if (said?.error) throw new Error(said.error);
  forgetSeatMark(name);
  return said;
}

async function askToErase(list, at = null) {
  if (!list.length) return false;
  const one = list.length === 1;
  const keyCaps = (text) => (raycastOn() ? `<b>${esc(text)}</b>` : esc(text));
  const ok = await ask(
    one ? phrase("Delete “{title}” for good?", { title: list[0].title }) : phrase("Delete {n} conversations for good?", { n: list.length }),
    `${esc(phrase("The transcript, the history and the marks are deleted from this computer, and from the server for a cloud chat. Nothing brings them back."))} ${keyCaps(phrase("The worktree and the files the chat changed stay where they are."))}`,
    one ? phrase("delete for good") : phrase("delete {n} for good", { n: list.length }),
    { who: one ? list[0].title : "", at }
  );
  if (!ok) return false;
  const failed = [];
  for (const entry of list) {
    if (st.open === entry.name) closeTile();
    try { await eraseOne(entry); } catch (wrong) { failed.push(`${entry.title}: ${wrong.message}`); }
  }
  await pull();
  if (failed.length) hud({ icon: "i-warn", tone: "warn", text: phrase("Could not delete {n}", { n: failed.length }), mono: failed[0], stays: 8000 });
  else hud({ icon: "i-trash", text: one ? phrase("Deleted “{title}”", { title: list[0].title }) : phrase("Deleted {n} conversations", { n: list.length }) });
  return !failed.length;
}

export { askToErase, eraseRow, marksMenuRows, snoozeRows };

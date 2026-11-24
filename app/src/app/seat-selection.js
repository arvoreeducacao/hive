import { IS_MAC, phrase, st } from "./core.js";
import { archiveSeatNow } from "./mirror.js";
import { asksBefore, seatSection, settleSeats, togglePinSeat, unsettleSeats } from "./seat-marks.js";
import { ask } from "./pod.js";
import { askToErase, snoozeRows } from "./seat-marks-menu.js";
import { openMenuRows } from "./seat-menu.js";

const picked = new Set();
let anchor = "";

const repaint = () => document.dispatchEvent(new CustomEvent("hive:marks"));

const sessionOf = (key) => (st.data?.sessions || []).find((one) => one.name === key && !one.anon) || null;

const pickedKeys = () => [...picked].filter((key) => sessionOf(key));

const isPicked = (key) => picked.has(key);

function pickToggle(key) {
  if (!sessionOf(key)) return;
  if (picked.has(key)) picked.delete(key);
  else picked.add(key);
  anchor = key;
  repaint();
}

function pickRange(key, order) {
  const to = order.indexOf(key);
  const from = order.indexOf(anchor);
  if (to < 0) return;
  if (from < 0) return pickToggle(key);
  for (const one of order.slice(Math.min(from, to), Math.max(from, to) + 1)) if (sessionOf(one)) picked.add(one);
  repaint();
}

function clearPicks() {
  if (!picked.size) return false;
  picked.clear();
  anchor = "";
  repaint();
  return true;
}

function pickClick(event, key, order) {
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    pickToggle(key);
    return true;
  }
  if (event.shiftKey && !mod && !event.altKey) {
    event.preventDefault();
    document.getSelection()?.removeAllRanges();
    pickRange(key, order);
    return true;
  }
  clearPicks();
  return false;
}

function selectionModel() {
  const keys = pickedKeys();
  if (!keys.length) return null;
  const settled = keys.every((key) => seatSection(key) === "settled");
  const pinned = keys.every((key) => seatSection(key) === "pinned");
  return {
    count: keys.length,
    say: phrase(keys.length === 1 ? "{n} chat picked" : "{n} chats picked", { n: keys.length }),
    clearSay: phrase("Clear the selection"),
    actions: [
      { act: "settle", say: phrase(settled ? "Reopen" : "Settle") },
      { act: "snooze", say: phrase("Snooze"), more: true },
      { act: "pin", say: phrase(pinned ? "Unpin" : "Pin") },
      { act: "archive", say: phrase("Archive") },
      { act: "erase", say: phrase("Delete…"), danger: true }
    ]
  };
}

const askForAll = async (action, keys, title, text, yes) => !asksBefore(action) || await ask(phrase(title, { n: keys.length }), phrase(text), phrase(yes, { n: keys.length }));

async function runPicked(act, rect) {
  const keys = pickedKeys();
  if (act === "clear" || !keys.length) return clearPicks();
  if (act === "settle") {
    if (keys.every((key) => seatSection(key) === "settled")) unsettleSeats(keys);
    else settleSeats(keys);
    return clearPicks();
  }
  if (act === "pin") {
    const pinned = keys.every((key) => seatSection(key) === "pinned");
    if (pinned && !(await askForAll("unpin", keys, "Unpin {n} chats?", "They go back to their places in the list.", "unpin {n}"))) return null;
    for (const key of keys) if ((seatSection(key) === "pinned") === pinned) togglePinSeat(key, { confirmed: true });
    return clearPicks();
  }
  if (act === "snooze") {
    const rows = snoozeRows(keys).map((row) => (row.go ? { ...row, go: (at) => { row.go(at); clearPicks(); } } : row));
    return openMenuRows(phrase("Snooze {n} chats", { n: keys.length }), rows, rect?.left ?? 0, (rect?.bottom ?? 0) + 4);
  }
  if (act === "archive") {
    if (!(await askForAll("archive", keys, "Archive {n} chats?", "They close and wait in Archived, where each comes back with its whole conversation.", "archive {n}"))) return null;
    for (const key of keys) archiveSeatNow(sessionOf(key), { confirmed: true });
    return clearPicks();
  }
  if (act === "erase") {
    const list = keys.map((key) => { const s = sessionOf(key); return { name: s.name, where: s.where, title: s.title || s.name }; });
    return askToErase(list).then((done) => { if (done) clearPicks(); });
  }
  return null;
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest?.("[data-pick-act]");
  if (!hit) return;
  event.stopPropagation();
  runPicked(hit.dataset.pickAct, hit.getBoundingClientRect());
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !picked.size || event.defaultPrevented) return;
  if (document.querySelector("#seatmenu.on, #confirm.on, .snz-scrim, #help.on")) return;
  event.preventDefault();
  clearPicks();
});

export { clearPicks, isPicked, pickClick, pickedKeys, runPicked, selectionModel };

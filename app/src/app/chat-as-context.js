import { $, esc, st } from "./core.js";
import { DRAFT_ANONYMOUS, draftFrom } from "./draft-seat.js";
import { closePal } from "./palette.js";
import { isLongPaste } from "./pasted-text.js";
import { MENTION, seatHandle, seatLabel } from "./pure-helpers.js";
import { clearPicks, isPicked, pickedKeys } from "./seat-selection.js";

const SEATS_MIME = "application/x-hive-seats";
const SEAT_LINK = /\[[^\]\n]{0,512}\]\(hive:\/\/seat\/([\w.-]+)\)|hive:\/\/seat\/([\w.-]+)/g;
const COMPOSER_WAIT_FRAMES = 90;

const ROW_SOURCES = [
  ["#rail-sessions .item[data-name]", (row) => row.dataset.name],
  ["#pal-list .pal-row[data-i]", (row) => paletteSeatName(row)],
];

const ROW_SELECTOR = ROW_SOURCES.map(([selector]) => selector).join(", ");

function paletteSeatName(row) {
  const id = st.palRows?.filter((one) => !one.sec)[Number(row.dataset.i)]?.id || "";
  return /^(seat|msg):/.test(id) ? id.slice(id.indexOf(":") + 1) : "";
}

const liveSeat = (name) => (name ? (st.data?.sessions || []).find((one) => one.name === name && !one.anon) || null : null);

const sideOf = (seat) => (seat?.where === "cloud" ? "cloud" : "local");

function rowOf(node) {
  const row = node?.closest?.(ROW_SELECTOR);
  if (!row) return null;
  const read = ROW_SOURCES.find(([selector]) => row.matches(selector))?.[1];
  const seat = liveSeat(read?.(row));
  return seat ? { row, seat } : null;
}

function handleOf(seat, sessions = st.data?.sessions || []) {
  const handle = seatHandle(seat);
  if (/^\d+$/.test(handle)) return seat.name;
  return sessions.filter((one) => seatHandle(one) === handle).length === 1 ? handle : seat.name;
}

function mentionedIn(text) {
  const named = new Set();
  MENTION.lastIndex = 0;
  for (let m; (m = MENTION.exec(text)); ) named.add(m[2].toLowerCase());
  return named;
}

function weaveSeats(textarea, seats) {
  const said = mentionedIn(textarea.value);
  const handles = seats.map((seat) => handleOf(seat)).filter((handle) => !said.has(handle.toLowerCase()));
  if (!handles.length) return void textarea.focus();
  const at = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? at;
  const before = textarea.value.slice(0, at);
  const after = textarea.value.slice(end);
  const words = `${before && !/\s$/.test(before) ? " " : ""}${handles.map((handle) => `#${handle}`).join(" ")}${/^\s/.test(after) ? "" : " "}`;
  textarea.focus();
  textarea.setSelectionRange(at, end);
  if (document.execCommand?.("insertText", false, words)) return;
  textarea.setRangeText(words, at, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function composerTarget(tile) {
  const textarea = tile?.querySelector(":scope .sv-composer textarea");
  if (!textarea || tile.querySelector(".sv-mirror")) return null;
  const draft = draftFrom(tile);
  if (draft) return draft.where === DRAFT_ANONYMOUS ? null : { textarea, side: draft.where === "cloud" ? "cloud" : "local", name: "" };
  const seat = liveSeat(tile.dataset.name);
  return seat ? { textarea, side: sideOf(seat), name: seat.name } : null;
}

function dropTargetOf(node) {
  const hit = rowOf(node);
  if (hit) return hit.seat.structured && !hit.seat.mirror ? { kind: "row", el: hit.row, name: hit.seat.name, side: sideOf(hit.seat) } : null;
  const tile = node?.closest?.(".tile[data-name]");
  const composer = composerTarget(tile);
  return composer ? { kind: "composer", el: tile.querySelector(".sv-composer"), ...composer } : null;
}

const othersThan = (target, seats) => seats.filter((seat) => seat.name !== target?.name);

const takes = (target, seats) => {
  const others = othersThan(target, seats);
  return !!target && others.length > 0 && others.every((seat) => sideOf(seat) === target.side);
};

const drag = { seats: [], fromPicks: false, over: null, lit: null, ghost: null, leave: null };

const OVERLAYS = [
  {
    within: "#pal-list",
    lift: () => $("pal")?.classList.add("chat-dragging-out"),
    leave: () => {
      $("pal")?.classList.remove("chat-dragging-out");
      closePal();
    },
  },
];

function surfaceOf(el) {
  const box = el?.matches(".sv-composer") ? el.querySelector(":scope > .sv-box") : null;
  if (!box) return el;
  const look = getComputedStyle(box);
  const drawn = look.backgroundColor !== "rgba(0, 0, 0, 0)" || look.boxShadow !== "none" || Number.parseFloat(look.borderTopWidth) > 0;
  return drawn ? box : el;
}

function markOver(el) {
  if (drag.over === el) return;
  drag.lit?.classList.remove("chat-drop-over");
  drag.over = el;
  drag.lit = surfaceOf(el);
  drag.lit?.classList.add("chat-drop-over");
}

function ghostOf(seats) {
  const ghost = document.createElement("div");
  ghost.className = "chat-drag-ghost";
  ghost.innerHTML = `<svg aria-hidden="true"><use href="#i-hash"/></svg><span class="cl">${esc(seatLabel(seats[0]))}</span>${seats.length > 1 ? `<span class="more">+${seats.length - 1}</span>` : ""}`;
  document.body.append(ghost);
  return ghost;
}

function endDrag() {
  disarm();
  markOver(null);
  drag.ghost?.remove();
  drag.leave?.();
  drag.seats = [];
  drag.fromPicks = false;
  drag.ghost = null;
  drag.leave = null;
  document.body.classList.remove("chat-dragging");
}

function carriesSeats(ev) {
  return [...(ev.dataTransfer?.types || [])].includes(SEATS_MIME);
}

function seatsCarried(ev) {
  if (drag.seats.length) return drag.seats;
  try {
    return JSON.parse(ev.dataTransfer.getData(SEATS_MIME) || "[]").map(liveSeat).filter(Boolean);
  } catch {
    return [];
  }
}

function whenComposer(name) {
  return new Promise((done) => {
    let frames = 0;
    const look = () => {
      const tile = document.querySelector(`.tile[data-name="${CSS.escape(name)}"]`);
      const target = composerTarget(tile);
      if (target) return done(target.textarea);
      frames += 1;
      if (frames > COMPOSER_WAIT_FRAMES) return done(null);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

async function dropOnRow(row, name, seats) {
  row.click();
  const textarea = await whenComposer(name);
  if (textarea) weaveSeats(textarea, seats);
}

let armed = null;

function disarm() {
  if (armed) {
    armed.draggable = false;
    armed.style.removeProperty("-webkit-user-drag");
  }
  armed = null;
}

document.addEventListener("pointerdown", (ev) => {
  disarm();
  if (ev.button !== 0 || ev.pointerType === "touch") return;
  const hit = rowOf(ev.target);
  if (!hit || hit.row.draggable) return;
  armed = hit.row;
  armed.draggable = true;
  armed.style.setProperty("-webkit-user-drag", "element");
}, true);

document.addEventListener("pointerup", disarm, true);

document.addEventListener("dragstart", (ev) => {
  const hit = rowOf(ev.target);
  if (!hit || ev.target !== hit.row) return;
  const fromPicks = isPicked(hit.seat.name);
  const seats = fromPicks ? [hit.seat, ...pickedKeys().filter((key) => key !== hit.seat.name).map(liveSeat).filter(Boolean)] : [hit.seat];
  drag.seats = seats;
  drag.fromPicks = fromPicks;
  const overlay = OVERLAYS.find((one) => hit.row.closest(one.within));
  drag.leave = overlay?.leave || null;
  ev.dataTransfer.effectAllowed = "copy";
  ev.dataTransfer.setData(SEATS_MIME, JSON.stringify(seats.map((seat) => seat.name)));
  ev.dataTransfer.setData("text/plain", seats.map((seat) => `hive://seat/${seat.name}`).join("\n"));
  drag.ghost = ghostOf(seats);
  ev.dataTransfer.setDragImage(drag.ghost, -12, -12);
  hit.row.addEventListener("dragend", endDrag, { once: true });
  document.body.classList.add("chat-dragging");
  requestAnimationFrame(() => {
    drag.ghost?.remove();
    overlay?.lift();
  });
});

document.addEventListener("dragover", (ev) => {
  if (!carriesSeats(ev)) return;
  const target = dropTargetOf(ev.target);
  if (!takes(target, seatsCarried(ev))) {
    markOver(null);
    ev.dataTransfer.dropEffect = "none";
    return;
  }
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "copy";
  markOver(target.el);
}, true);

const leavesWindow = (ev) => ev.clientX <= 0 || ev.clientY <= 0 || ev.clientX >= innerWidth || ev.clientY >= innerHeight;

document.addEventListener("dragleave", (ev) => {
  if (carriesSeats(ev) && leavesWindow(ev)) markOver(null);
});

document.addEventListener("drop", (ev) => {
  if (!carriesSeats(ev)) return;
  ev.preventDefault();
  ev.stopPropagation();
  const seats = seatsCarried(ev);
  const target = dropTargetOf(ev.target);
  const fromPicks = drag.fromPicks;
  markOver(null);
  if (drag.seats.length) endDrag();
  if (!takes(target, seats)) return;
  if (fromPicks) clearPicks();
  const others = othersThan(target, seats);
  if (target.kind === "row") return void dropOnRow(target.el, target.name, others);
  weaveSeats(target.textarea, others);
}, true);

function seatsInLinks(text, here) {
  let found = false;
  const woven = String(text).replace(SEAT_LINK, (link, labelled, bare, at, whole) => {
    const seat = liveSeat(labelled || bare);
    if (!seat || seat.name === here.name || sideOf(seat) !== here.side) return link;
    found = true;
    return `#${handleOf(seat)}${at + link.length === whole.length ? " " : ""}`;
  });
  return found ? woven : "";
}

document.addEventListener("paste", (ev) => {
  const textarea = ev.target instanceof HTMLTextAreaElement ? ev.target : null;
  const target = textarea ? composerTarget(textarea.closest(".tile[data-name]")) : null;
  if (!target || target.textarea !== textarea) return;
  const data = ev.clipboardData;
  if (!data || [...(data.items || [])].some((one) => one.type.startsWith("image/"))) return;
  const words = data.getData("text/plain");
  if (!words || isLongPaste(words)) return;
  const woven = seatsInLinks(words, target);
  if (!woven) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (document.execCommand?.("insertText", false, woven)) return;
  const at = textarea.selectionStart ?? textarea.value.length;
  textarea.setRangeText(woven, at, textarea.selectionEnd ?? at, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}, true);

export { SEATS_MIME, handleOf, seatsInLinks };

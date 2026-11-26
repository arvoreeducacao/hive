import { avatarPulse } from "./avatars.js";
import { activeItems, blockNumber, blockTitle, blocksOf, itemOf, stripItems, labelOf, landOnBlock, moveToNewBlock, nameSpace, ofBlock, openSpace, seatsOf, soloSeat, spaceName, spaceOf, subchatOpen, tidy } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { paintYards } from "./chat-and-panes.js";
import { healStructuredScroll } from "./chat-stretches.js";
import { $, LABEL, batch, every, paneOfSeat, perf, phrase, raycastOn, solidMounts, st, stateColor, statusFolded } from "./core.js";
import { dayOnScreen, dayWhatItDecided, paintDay } from "./day.js";
import { createFileTile, dropEditor, updateFile } from "./files-editor.js";
import { createDraftTile, updateDraft } from "./draft-seat.js";
import { goTo, goToSpace, releaseKeyboard } from "./focus-navigation.js";
import { keyHint, pool, tiles } from "./leader-key.js";
import { blockKey, paintBlocks, seatsSaid } from "./mirror.js";
import { palOn, palPaint } from "./palette.js";
import { paintPlane, planeShown, planeSlot } from "./plane.js";
import { pullThreads } from "./prs.js";
import { calmly } from "./pure-helpers.js";
import { born, flipEnd, flipStart, inARow, inAStrip, inFocusMode, vanish, watchFocusClicks } from "./seat-layout.js";
import { closeSeatMenu, createJobTile, createOpeningTile, createTile, openSpaceMenu, update, updateJob, updateOpening } from "./seat-menu.js";
import { followInStrip, forgetFollow, paintStripEdges, watchStripScroll } from "./strip.js";
import { forgetStruct, structPool } from "./structured-seats.js";
import { mirrorRow } from "./team.js";
import { movePrPanel, moveThreadPanel } from "./thread.js";
import { emptyWallModel, swapSeats } from "./tiles.js";
import { followFocusedChat } from "./screen-reader.js";
import { putAttr, putHidden, putText, putTitle } from "./dom-writes.js";

st.arrangeCursor = { i: 0, j: 0 };

st.arrangeHeld = null;

st.arrangeDragging = false;

st.arrangeScrim = false;

st.arrangeFloor = "";

st.arrangeLanding = 0;

/* the lane the pointer is over, so the highlight follows the mouse and not the keyboard cursor */
st.arrangeOver = -1;

/* the floor the pointer is resting on while carrying a seat, and the wait before it comes forward */
st.arrangeClimb = 0;

st.arrangeClimbTo = "";

const CLIMB_WAIT = 400;

let deckOpen = false;

let deckRise = 0;

let deckModel = null;

let deckSolid = null;

let climbMark = "";

const arrangeOn = () => deckOpen;

const canArrange = () => !soloSeat && !st.mirrorDev;

const arrangeNewCard = () => st.blocks.length;

const FLOORS_SHOWN = 6;

const deckFloor = () => (st.spaces.some((w) => w.id === st.arrangeFloor) ? st.arrangeFloor : st.space);

const floorCards = (id) => st.blocks.map((b, i) => i).filter((i) => (st.blocks[i].ws || st.space) === id);

const floorAt = () => Math.max(0, st.spaces.findIndex((w) => w.id === deckFloor()));

function openArrange() {
  if (!canArrange() || arrangeOn()) return;
  releaseKeyboard();
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  st.arrangeFloor = st.space;
  clearTimeout(st.arrangeLanding);
  stopClimb();
  const here = activeItems()[st.focus]?.key;
  const j = here ? st.blocks[st.block]?.keys.indexOf(here) : -1;
  st.arrangeCursor = { i: Math.max(0, st.block), j: Math.max(0, j) };
  wheelPile = 0;
  wheelStepAt = 0;
  deckOpen = true;
  deckRise += 1;
  paintArrange();
}

function closeArrange() {
  if (!arrangeOn()) return;
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  clearTimeout(st.arrangeLanding);
  stopClimb();
  deckOpen = false;
  deckModel = null;
  deckSolid?.show({ ...DECK_SHUT, rise: deckRise });
}

function arrangeLandOn(id) {
  if (!st.spaces.some((w) => w.id === id)) return;
  if (id === deckFloor()) { closeArrange(); goToSpace(id); return; }
  st.arrangeFloor = id;
  paintArrange();
  clearTimeout(st.arrangeLanding);
  st.arrangeLanding = setTimeout(() => { closeArrange(); goToSpace(id); }, calmly() ? 0 : 300);
}

function arrangeFloorStep(d) {
  const i = floorAt() + d;
  if (i < 0 || i >= st.spaces.length) return;
  clearTimeout(st.arrangeLanding);
  st.arrangeFloor = st.spaces[i].id;
  const first = floorCards(st.arrangeFloor)[0];
  st.arrangeCursor = { i: first === undefined ? arrangeNewCard() : first, j: 0 };
  paintArrange();
}

function arrangeSay() {
  if (st.arrangeHeld) {
    const it = itemOf(st.arrangeHeld);
    const takers = st.blocks.filter((b) => !b.keys.includes(st.arrangeHeld)).length + 1;
    return { lead: `${phrase("moving")} `, em: it?.title || it?.name || st.arrangeHeld, rest: ` — ${phrase("{n} blocks take it, on any floor", { n: takers })}` };
  }
  const w = spaceOf(deckFloor());
  const cards = floorCards(w.id).length;
  return { lead: "", em: spaceName(w), rest: ` — ${cards === 1 ? phrase("1 block") : phrase("{n} blocks", { n: cards })} · ${phrase("{n} seats", { n: seatsOf(w.id) })}` };
}

function arrangeChip(key, i, j) {
  const it = itemOf(key);
  const state = it?.state || "idle";
  return {
    key: `chip:${key}`, seat: key, i, j, state,
    color: stateColor(state),
    label: phrase(LABEL[state] || state),
    title: it?.title || key,
    name: it?.title || it?.name || key,
    errand: it?.errand || "",
    at: st.arrangeCursor.i === i && st.arrangeCursor.j === j,
    lifting: false,
    swap: false
  };
}

function arrangeSlot(i, j) {
  return { key: `slot:${i}:${j}`, i, j, at: st.arrangeCursor.i === i && st.arrangeCursor.j === j, hot: false, text: "" };
}

/* the mouse wins while it is over a lane; the keyboard cursor answers when it is not */
function takingLane(i) {
  if (!st.arrangeHeld || st.blocks[i]?.keys.includes(st.arrangeHeld)) return false;
  return st.arrangeOver >= 0 ? st.arrangeOver === i : st.arrangeCursor.i === i;
}

function arrangeNote(i) {
  const b = st.blocks[i];
  if (!b) return "";
  const room = st.LIMIT - b.keys.length;
  if (st.arrangeHeld) {
    if (b.keys.includes(st.arrangeHeld)) return phrase("where it came from");
    return room > 0
      ? phrase("becomes {n}/{limit}", { n: b.keys.length + 1, limit: st.LIMIT })
      : phrase("full — on a name, or the last one leaves");
  }
  if (i === st.block && b.ws === st.space) return phrase("where you are");
  if (!room) return phrase("full");
  return room === 1 ? phrase("1 free seat") : phrase("{n} free seats", { n: room });
}

const FRESH_FLOOR = { id: "", name: "", tint: "#6E6A63" };

function floorInner(w, front) {
  const cards = floorCards(w.id).map((i) => {
    const b = st.blocks[i];
    const items = ofBlock(b);
    const cells = [];
    for (let j = 0; j < st.LIMIT; j++) cells.push(j < b.keys.length ? arrangeChip(b.keys[j], i, j) : arrangeSlot(i, j));
    return {
      key: `card:${i}`, i,
      n: blocksOf(w.id).indexOf(b) + 1,
      name: labelOf(b, items).txt || phrase("unnamed"),
      count: `${b.keys.length}/${st.LIMIT}`,
      here: i === st.block && w.id === st.space,
      full: b.keys.length >= st.LIMIT,
      taking: false,
      note: "",
      cells
    };
  });
  const newAt = st.arrangeCursor.i === arrangeNewCard() && w.id === deckFloor();
  return dressInner({
    cards,
    room: front ? { at: newAt, hot: false, say: phrase("new block") } : null,
    name: w.name,
    placeholder: spaceName(w),
    nameLabel: phrase("what this workspace is about"),
    seats: `${floorCards(w.id).length}·${seatsOf(w.id)}`,
    moreLabel: phrase("rename or close this workspace")
  });
}

function dressInner(inner) {
  if (!inner?.cards) return inner;
  const held = st.arrangeHeld;
  return {
    ...inner,
    cards: inner.cards.map((card) => ({
      ...card,
      taking: takingLane(card.i),
      note: arrangeNote(card.i),
      cells: card.cells.map((cell) => {
        if (cell.seat) {
          const mine = cell.seat === held;
          return { ...cell, lifting: mine, swap: !mine && st.blocks[cell.i]?.keys.length >= st.LIMIT && takingLane(cell.i) };
        }
        const hot = !!held && !st.blocks[cell.i]?.keys.includes(held);
        return { ...cell, hot, text: hot ? phrase("drop here") : phrase("free") };
      })
    })),
    room: inner.room && { ...inner.room, hot: !!held }
  };
}

function freshInner() {
  return { title: phrase("new workspace"), say: phrase("another subject, with blocks of its own — the next chat opens in it") };
}

function floorShell(id, at, front) {
  const d = (id === "" ? st.spaces.length : st.spaces.findIndex((x) => x.id === id)) - at;
  const away = d < -1 || d >= FLOORS_SHOWN;
  const ty = d < 0 ? d * -166 * 1.9 : d * -166;
  const tz = d < 0 ? Math.abs(d) * -150 * 0.45 : d * -150;
  return {
    d,
    here: !!id && id === front,
    climbing: !!climbMark && id === climbMark,
    transform: `translate3d(0,${ty}px,${tz}px)`,
    opacity: away ? 0 : d === 0 ? 1 : d > 0 ? Math.max(.44, .92 - (d - 1) * .12) : .34,
    pointer: !away && d >= 0 ? "auto" : "none"
  };
}

let wheelPile = 0;

let wheelAt = 0;

let wheelStepAt = 0;

const WHEEL_WORTH = 80;

const WHEEL_GAP = 170;

const WHEEL_CALM = 420;

function arrangeWheel(ev) {
  ev.preventDefault();
  if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
  const now = Date.now();
  const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
  if (now - wheelAt > WHEEL_GAP || (wheelPile && Math.sign(dy) !== Math.sign(wheelPile))) wheelPile = 0;
  wheelAt = now;
  wheelPile += dy;
  if (Math.abs(wheelPile) < WHEEL_WORTH) return;
  if (now - wheelStepAt < (calmly() ? 0 : WHEEL_CALM)) return;
  wheelStepAt = now;
  const d = wheelPile > 0 ? -1 : 1;
  wheelPile = 0;
  arrangeFloorStep(d);
}

const DECK_SHUT = { key: "arrange", on: false, rise: 0, floors: [], more: "", moreShown: false, say: { lead: "", em: "", rest: "" }, keys: { floor: "", seat: "", pickUp: "", close: "" } };

const spaceOfSeat = (key) => {
  const b = st.blocks.find((one) => one.keys.includes(key));
  return b ? (b.ws || st.space) : "";
};

function stopClimb() {
  clearTimeout(st.arrangeClimb);
  st.arrangeClimb = 0;
  st.arrangeClimbTo = "";
  if (!climbMark) return;
  climbMark = "";
  markClimb();
}

function markClimb() {
  if (!deckModel) return;
  deckModel = { ...deckModel, floors: deckModel.floors.map((one) => ({ ...one, climbing: !!climbMark && one.w === climbMark })) };
  deckSolid?.show(deckModel);
}

/* the floor comes forward without redrawing anything: the seat in your hand lives in one of
   these cards, and rebuilding them mid-gesture is what used to kill the drag */
function slideFloors() {
  if (!deckModel) return;
  const at = floorAt();
  const front = deckFloor();
  deckModel = { ...deckModel, floors: deckModel.floors.map((one) => ({ ...one, ...floorShell(one.w, at, front) })) };
  deckSolid?.show(deckModel);
}

function climbTo(id) {
  if (!id || id === deckFloor() || st.arrangeClimbTo === id) return;
  stopClimb();
  st.arrangeClimbTo = id;
  climbMark = id;
  markClimb();
  st.arrangeClimb = setTimeout(() => {
    st.arrangeClimb = 0;
    st.arrangeClimbTo = "";
    if (!st.arrangeHeld || !st.spaces.some((w) => w.id === id)) return;
    st.arrangeFloor = id;
    slideFloors();
    dressDrag();
  }, calmly() ? 0 : CLIMB_WAIT);
}

/* let go on another floor, the seat takes the first place with room there, or opens a block of
   its own. Let go on the floor it already lives in, it stays where it was. */
function landOnFloor(id) {
  const key = st.arrangeHeld;
  if (!key) return;
  const from = st.blocks.find((b) => b.keys.includes(key));
  const here = from ? (from.ws || st.space) : "";
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  stopClimb();
  if (id !== "" && id === here) { arrangeFollow(key); return; }
  const to = id === "" ? openSpace("").id : id;
  st.arrangeFloor = to;
  const room = st.blocks.findIndex((b) => (b.ws || st.space) === to && b.keys.length < st.LIMIT);
  if (room >= 0) landOnBlock(key, room, null);
  else moveToNewBlock(key, to);
  arrangeFollow(key);
}

function floorClick(ev, id) {
  if (ev.target.closest(".a-chip, .a-slot, .a-new, .fl-name, .fl-more-btn")) return;
  /* carrying a seat, the click puts it down here — it never walks you to another workspace */
  if (st.arrangeHeld) { landOnFloor(id); return; }
  if (id === "") { const w = openSpace(""); closeArrange(); goToSpace(w.id); return; }
  arrangeLandOn(id);
}

function floorMenu(ev, id) {
  if (!id) return;
  ev.preventDefault();
  openSpaceMenu(id, ev.clientX, ev.clientY);
}

function floorDragOver(ev, id) {
  if (!st.arrangeHeld) return;
  /* a lane answers for itself, and stops the event when it takes the seat */
  if (ev.target.closest(".a-card")) return;
  /* the floor the seat already lives in has nothing to offer outside its lanes, so the
     cursor keeps saying no there instead of promising a move that does nothing */
  if (id !== "" && id === spaceOfSeat(st.arrangeHeld)) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
  if (id && id !== deckFloor()) climbTo(id);
  else {
    stopClimb();
    if (st.arrangeOver !== -1) { st.arrangeOver = -1; dressDrag(); }
  }
}

function floorDragLeave(ev, id) {
  if (ev.currentTarget.contains(ev.relatedTarget)) return;
  if (st.arrangeClimbTo === id) stopClimb();
}

function floorDrop(ev, id) {
  if (!st.arrangeHeld || ev.target.closest(".a-card, .a-new")) return;
  ev.preventDefault();
  ev.stopPropagation();
  landOnFloor(id);
}

function nameChange(id, value) {
  nameSpace(id, value);
  paintArrange();
  paintBlocks();
}

function nameBlur(id, value) {
  nameSpace(id, value);
  paintBlocks();
}

/* the same menu the right button opens, with a door you can see */
function moreClick(ev, id) {
  ev.stopPropagation();
  const at = ev.currentTarget.getBoundingClientRect();
  openSpaceMenu(id, at.left, at.bottom + 6);
}

function laneDragOver(ev, i) {
  if (!st.arrangeHeld || st.blocks[i]?.keys.includes(st.arrangeHeld)) return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.dataTransfer.dropEffect = "move";
  /* a lane of a floor further back brings its floor forward, same as its empty surface */
  const w = ev.currentTarget.closest(".floor")?.dataset.w;
  if (w && w !== deckFloor()) climbTo(w);
  else stopClimb();
  if (st.arrangeOver === i) return;
  st.arrangeOver = i;
  dressDrag();
}

function laneDragLeave(ev, i) {
  if (ev.currentTarget.contains(ev.relatedTarget) || st.arrangeOver !== i) return;
  st.arrangeOver = -1;
  dressDrag();
}

/* the whole lane takes the seat: on a name it says who leaves, anywhere else the last one does */
function laneDrop(ev, i) {
  if (!st.arrangeHeld) return;
  ev.preventDefault();
  ev.stopPropagation();
  arrangeDrop(st.arrangeHeld, i, ev.target.closest(".a-chip")?.dataset.key || null);
}

function chipClick(ev, key, i, j) {
  ev.stopPropagation();
  if (!st.arrangeDragging) arrangeTake(key, i, j);
}

/* nothing is rebuilt while the gesture is alive: this element is the one in the person's
   hand, and taking it out of the page mid-drag is what used to lose the drop */
function chipDragStart(ev, key) {
  st.arrangeDragging = true;
  st.arrangeHeld = key;
  st.arrangeOver = -1;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", key);
  dressDrag();
}

function chipDragEnd() {
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  stopClimb();
  if (!st.arrangeHeld) return;
  st.arrangeHeld = null;
  if (arrangeOn()) paintArrange();
}

function newClick(ev) {
  ev.stopPropagation();
  if (st.arrangeHeld) arrangeDrop(st.arrangeHeld, arrangeNewCard(), null);
}

function newDragOver(ev) {
  if (!st.arrangeHeld) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
}

function newDrop(ev) {
  if (!st.arrangeHeld) return;
  ev.preventDefault();
  ev.stopPropagation();
  arrangeDrop(st.arrangeHeld, arrangeNewCard(), null);
}

/* everything the drag changes on screen is a class or a line of text, so it is written straight
   onto the elements already there. paintArrange rebuilds the deck, which a live gesture cannot take. */
function dressDrag() {
  if (!deckModel || !arrangeOn()) return;
  deckModel = { ...deckModel, floors: deckModel.floors.map((one) => ({ ...one, inner: dressInner(one.inner) })), say: arrangeSay() };
  deckSolid?.show(deckModel);
}

const namingFloor = () => {
  const now = document.activeElement;
  return now?.matches?.("#arrange .fl-name") ? now.dataset.w : null;
};

function paintArrange() {
  st.arrangeFloor = deckFloor();
  const at = floorAt();
  const front = deckFloor();
  const naming = namingFloor();
  const was = new Map((deckModel?.floors || []).map((one) => [one.w, one.inner]));
  const floors = st.spaces.map((w) => w.id).concat([""]).map((id) => {
    const w = id ? spaceOf(id) : FRESH_FLOOR;
    const inner = naming === id || st.arrangeDragging ? was.get(id) ?? null : id ? floorInner(w, id === front) : freshInner();
    return { key: `floor:${id}`, w: id, tint: w.tint, fresh: !id, inner, ...floorShell(id, at, front) };
  });
  const above = st.spaces.length - at - FLOORS_SHOWN;
  deckModel = {
    key: "arrange",
    on: deckOpen,
    rise: deckRise,
    floors,
    more: above > 0 ? phrase("+{n} further up", { n: above }) : deckModel?.more || "",
    moreShown: above > 0,
    say: arrangeSay(),
    keys: { floor: phrase("floor"), seat: phrase("seat"), pickUp: phrase("pick up"), close: phrase("close") }
  };
  deckSolid?.show(deckModel);
}

solidMounts.push((hive) => {
  deckSolid = hive.mountArrangeDeck($("arrange"), {
    close: () => closeArrange(),
    wheel: (ev) => arrangeWheel(ev),
    nameOf: (id) => spaceOf(id).name,
    floorClick, floorMenu, floorDragOver, floorDragLeave, floorDrop,
    nameChange, nameBlur, moreClick,
    laneDragOver, laneDragLeave, laneDrop,
    chipClick, chipDragStart, chipDragEnd,
    newClick, newDragOver, newDrop
  });
  if (deckModel) deckSolid.show(deckModel);
});

function arrangeTake(key, i, j) {
  if (!st.arrangeHeld) {
    st.arrangeHeld = key;
    st.arrangeCursor = { i, j };
    paintArrange();
    return;
  }
  if (st.arrangeHeld === key) { st.arrangeHeld = null; paintArrange(); return; }
  arrangeDrop(st.arrangeHeld, i, key);
}

function arrangeDrop(key, i, onto) {
  const from = st.blocks.findIndex((b) => b.keys.includes(key));
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  stopClimb();
  if (i === arrangeNewCard()) moveToNewBlock(key, deckFloor());
  else if (i === from) { if (onto && onto !== key) swapSeats(key, onto); }
  else landOnBlock(key, i, onto);
  arrangeFollow(key);
}

function arrangeFollow(key) {
  const i = st.blocks.findIndex((b) => b.keys.includes(key));
  if (i >= 0) {
    st.arrangeCursor = { i, j: Math.max(0, st.blocks[i].keys.indexOf(key)) };
    if (st.blocks[i].ws && st.spaces.some((w) => w.id === st.blocks[i].ws)) st.arrangeFloor = st.blocks[i].ws;
  } else st.arrangeCursor = { i: Math.min(st.arrangeCursor.i, Math.max(0, st.blocks.length - 1)), j: 0 };
  if (arrangeOn()) paintArrange();
}

function arrangeStep(di, dj) {
  const last = arrangeNewCard();
  const lane = [...floorCards(deckFloor()), last];
  let { i, j } = st.arrangeCursor;
  if (di) {
    const at = lane.indexOf(i);
    const to = at < 0 ? (di > 0 ? 0 : lane.length - 1) : Math.max(0, Math.min(lane.length - 1, at + di));
    i = lane[to];
    if (i === last) j = 0;
    else j = Math.min(j, st.LIMIT - 1);
  }
  if (dj && i !== last) j = Math.max(0, Math.min(st.LIMIT - 1, j + dj));
  st.arrangeCursor = { i, j };
  paintArrange();
}

function arrangeKeys(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const { i, j } = st.arrangeCursor;
  const b = st.blocks[i];
  if (e.key === "Escape") {
    e.preventDefault();
    if (st.arrangeHeld) { st.arrangeHeld = null; paintArrange(); } else closeArrange();
    return true;
  }
  if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    arrangeFloorStep(e.key === "ArrowUp" ? 1 : -1);
    return true;
  }
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (step) { e.preventDefault(); arrangeStep(step[0], step[1]); return true; }
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    const key = b?.keys[j];
    if (!st.arrangeHeld) {
      if (key) { st.arrangeHeld = key; paintArrange(); }
      return true;
    }
    arrangeDrop(st.arrangeHeld, i, key || null);
    return true;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const key = b?.keys[j];
    if (key) { closeArrange(); goTo(key); }
    else arrangeLandOn(deckFloor());
    return true;
  }
  return true;
}

function paintStrip(b, list) {
  const inp = $("f-label");
  stripSolid.show(stripViewModel(b, list));
  if (st.mirrorDev) {
    inp.disabled = true;
    inp.value = phrase("{dev}'s hive", { dev: st.mirrorDev });
    inp.title = phrase("another hive — the label is theirs to write");
    return;
  }
  if (!b) {
    inp.disabled = true;
    if (document.activeElement !== inp) inp.value = "";
    return;
  }
  const sub = subchatOpen();
  if (sub) {
    const opener = st.data.sessions.find((one) => one.name === sub.by);
    inp.disabled = true;
    const head = opener?.title || sub.by;
    inp.value = `${head.length > 24 ? `${head.slice(0, 23).trimEnd()}…` : head} / ${sub.title || sub.name}`;
    inp.title = subchatAway();
    return;
  }
  inp.disabled = false;
  if (document.activeElement !== inp) inp.value = labelOf(b, list).txt;
  inp.title = phrase("click to name the block");
}

const subchatAway = () => phrase("outside the blocks · Esc goes back to {block}", { block: phrase("block {n}", { n: blockNumber(st.block) }) });

let stripSolid = null;

function stripViewModel(b, list) {
  if (raycastOn()) return raycastStrip(b, list);
  if (st.mirrorDev) {
    const row = mirrorRow();
    const needs = (row?.seats || []).filter((seat) => seat.state === "needs").length;
    return {
      key: "strip", mirrorOf: true,
      num: phrase("mirror · {server}", { server: row?.dev || st.mirrorDev }),
      seats: `${phrase("{n} seats · read-only", { n: (row?.seats || []).length })}${needs ? " · " : ""}`,
      bold: needs ? phrase("{n} need {dev}", { n: needs, dev: st.mirrorDev }) : ""
    };
  }
  if (!b) return { key: "strip", mirrorOf: false, num: "—", seats: "", bold: "" };
  const mine = blocksOf(st.space);
  const needs = list.filter((i) => i.state === "needs").length;
  const errands = new Set(list.map((i) => i.errand).filter(Boolean)).size;
  const askedFor = errands ? ` · ${errands === 1 ? phrase("1 errand of yours") : phrase("{n} errands of yours", { n: errands })}` : "";
  return {
    key: "strip", mirrorOf: false,
    num: phrase("block {n} of {total}", { n: mine.indexOf(b) + 1, total: mine.length }),
    seats: `${phrase("{n} of {total} seats", { n: list.length, total: st.LIMIT })}${askedFor}${needs ? " · " : ""}`,
    bold: needs ? phrase("{n} waiting on you", { n: needs }) : ""
  };
}

function raycastStrip(b, list) {
  if (st.mirrorDev) {
    const row = mirrorRow();
    const needs = (row?.seats || []).filter((seat) => seat.state === "needs").length;
    return {
      key: "strip", mirrorOf: true, rc: true, title: "",
      num: phrase("mirror · {server}", { server: row?.dev || st.mirrorDev }),
      seats: `${phrase("{n} seats · read-only", { n: (row?.seats || []).length })}${needs ? " · " : ""}`,
      bold: needs ? phrase("{n} need {dev}", { n: needs, dev: st.mirrorDev }) : ""
    };
  }
  if (!b) return { key: "strip", mirrorOf: false, num: "—", seats: "", bold: "", rc: true, title: "" };
  const errands = new Set(list.map((i) => i.errand).filter(Boolean)).size;
  const askedFor = errands ? ` · ${errands === 1 ? phrase("1 errand of yours") : phrase("{n} errands of yours", { n: errands })}` : "";
  const num = blockKey(blocksOf(st.space).indexOf(b) + 1);
  return {
    key: "strip", mirrorOf: false, rc: true, at: 3 + blocksOf(st.space).indexOf(b),
    num,
    seats: "",
    bold: "",
    title: `${blockTitle(b, list)} · ${seatsSaid(list.length)}${askedFor} · ${num}`
  };
}

solidMounts.push((hive) => {
  stripSolid = hive.mountStrip($("strip"));
});

function render({ animate = true } = {}) {
  const from = perf.start("render");
  try {
    batch(() => {
      try { paintEverything({ animate }); }
      catch (err) { console.warn("the render could not finish — the screen keeps what it had", err); }
    });
  }
  finally { perf.end("render", from); }
  followFocusedChat();
}

let layoutSeen = "";

function layoutKey(onPlane) {
  const seats = activeItems().map((it) => `${it.key}${statusFolded(it.key) ? "-" : "+"}`).join(",");
  return [st.space, st.blocks[st.block]?.id, st.open, onPlane ? "plane" : "canvas", inFocusMode() ? "focus" : inAStrip() ? "strip" : inARow() ? "row" : "grid", seats].join("|");
}

function paintCalls() {
  const calling = st.data.sessions.filter((s) => s.state === "needs");
  const said = `${calling.length} ${calling.length === 1 ? phrase("needs you") : phrase("need you")}`;
  const btn = $("btn-calls");
  putTitle(btn, [said, ...calling.map((s) => s.title || s.name), keyHint("calls")].join(" · "));
  putAttr(btn, "aria-label", said);
}

function paintEverything({ animate = true } = {}) {
  tidy();
  avatarPulse();
  document.body.classList.toggle("typing-on", !!st.typing);
  const onPlane = planeShown();
  putHidden($("canvas"), !!st.mirrorDev || onPlane);
  putHidden($("plane"), !onPlane);
  for (const id of ["btn-plane", "btn-plane-top"]) putAttr($(id), "aria-pressed", st.planeOn ? "true" : "false");
  putHidden($("mirror"), !st.mirrorDev);
  if (st.mirrorDev) {
    paintStripEdges();
    paintYards();
    return;
  }
  const focusing = !onPlane && inFocusMode();
  if (focusing && !st.open) animate = false;
  const layout = layoutKey(onPlane);
  if (layout === layoutSeen) animate = false;
  layoutSeen = layout;
  const moved = onPlane || !animate ? null : flipStart();
  const c = $("canvas");
  const b = st.blocks[st.block];
  const list = activeItems();
  const strip = !onPlane && !st.open && !focusing && inAStrip();
  document.body.classList.toggle("strip-on", !onPlane && !focusing && inAStrip());
  const shown = strip ? stripItems() : list.map((it, at) => ({ it, lane: 0, at, here: true }));
  if (st.focus >= list.length) st.focus = Math.max(0, list.length - 1);
  if (st.seatMenuFor && !st.data.sessions.some((i) => i.name === st.seatMenuFor)) closeSeatMenu();
  if (st.reviewChat && (st.open !== st.reviewChat || !list.some((i) => i.name === st.reviewChat))) st.reviewChat = null;
  if (!st.reviewChat) movePrPanel($("prs"));
  if (st.threadChat && (st.open !== st.threadChat || !list.some((i) => i.name === st.threadChat))) st.threadChat = null;
  if (!st.threadChat && !$("thread").hidden) {
    $("thread").hidden = true;
    every("threads", 45000, () => pullThreads(false));
  }
  if (!st.threadChat) moveThreadPanel(document.body);
  const live = new Set(st.blocks.flatMap((x) => x.keys));
  if (subchatOpen()) live.add(st.open);
  const liveEls = new Set([...live].map((key) => tiles.get(key)).filter(Boolean));
  for (const [key, el] of tiles) {
    if (!live.has(key) && !liveEls.has(el)) {
      paneOfSeat.delete(key);
      const e = pool.get(key);
      if (e) { try { e.ws?.close(); e.term.dispose(); e.hist?.term.dispose(); } catch {} pool.delete(key); }
      const se = structPool.get(key);
      if (se) { try { se.ws?.close(); } catch {} forgetStruct(key); }
      dropEditor(key);
      vanish(el); tiles.delete(key);
    }
  }

  c.className = st.open ? "zoom" : focusing ? "focus-mode" : strip ? "strip" : `g${Math.min(st.LIMIT, Math.max(1, list.length))}${inARow() ? " row" : ""}`;

  if (!shown.length) {
    for (const kid of [...c.children]) if (!kid.dataset.gone && !kid.classList.contains("blank")) kid.remove();
    let blank = c.querySelector(".blank");
    if (!blank) { blank = document.createElement("div"); blank.className = "blank"; c.appendChild(blank); }
    let side = blankSides.get(blank);
    if (!side) blankSides.set(blank, (side = st.blankSide(blank, wallModel())));
    side.show(wallModel());
  } else {
    const blank = c.querySelector(".blank");
    if (blank) blank.remove();
    for (const [key, el] of tiles) {
      if (!shown.some(({ it: i }) => i.key === key || tiles.get(i.key) === el) && el.isConnected) el.remove();
    }
    shown.forEach(({ it, lane, at, here }) => {
      const pos = here ? at : -1;
      let el = tiles.get(it.key);
      if (el && it.kind === "job" && it.name && !el.classList.contains("opening")) {
        el.remove();
        el = null;
      }
      if (!el) {
        el = it.kind === "job" ? (it.name ? tiles.get(it.name) || createOpeningTile(it) : createJobTile(it)) : it.kind === "file" ? createFileTile(it) : it.kind === "draft" ? createDraftTile(it) : createTile(it);
        tiles.set(it.key, el);
      }
      if (it.kind === "job" && it.name && tiles.get(it.name) !== el) tiles.set(it.name, el);
      const host = onPlane ? planeSlot(it.key) : c;
      const fresh = !el.isConnected;
      if (el.parentElement !== host) host.appendChild(el);
      if (fresh && !el.classList.contains("opening")) born(el);
      el.classList.toggle("lane-start", strip && lane > 0 && at === 0);
      if (focusing && here) el.style.setProperty("--from-focus", String(at - st.focus));
      else el.style.removeProperty("--from-focus");
      el.classList.toggle("focus-aside", focusing && pos !== st.focus);
      if (it.kind === "job") (el.classList.contains("opening") ? updateOpening : updateJob)(el, it, pos);
      else if (it.kind === "file") updateFile(el, it, pos);
      else if (it.kind === "draft") updateDraft(el, it, pos);
      else update(el, it, pos);
    });
    if (!onPlane) {
      const wanted = shown.map(({ it: i }) => tiles.get(i.key));
      const onScreen = [...c.children].filter((x) => x.dataset.key && !x.dataset.gone);
      if (wanted.length !== onScreen.length || wanted.some((el, at) => el !== onScreen[at])) wanted.forEach((el) => c.appendChild(el));
    }
  }

  if (strip) {
    watchStripScroll(c);
    followInStrip(c);
  } else forgetFollow();
  if (focusing) watchFocusClicks(c);
  paintStripEdges();

  const flights = flipEnd(moved);
  healStructuredScroll();
  const calls = st.data.sessions.filter((s) => s.state === "needs").length;
  putText($("n-calls"), String(calls));
  paintCalls();
  putHidden($("btn-calls"), calls === 0);
  if (palOn()) palPaint();
  if (dayOnScreen()) paintDay();
  dayWhatItDecided();
  paintYards();
  if (flights.length) Promise.allSettled(flights.map((flight) => flight.finished)).then(paintYards);
  if (onPlane) paintPlane();
}

st.blankSide = null;

const blankSides = new WeakMap();

const wallModel = () => (raycastOn() ? emptyWallModel() : blankViewModel());

function blankViewModel() {
  return {
    head: phrase("No worker alive"),
    server: st.data.pod.up ? phrase("server {name} up", { name: st.data.pod.name }) : phrase("server asleep"),
    nothing: phrase("nothing in"),
    home: phrase("hive-local"),
    opens: phrase("{n} opens a new chat", { n: keyLabel(st.keys.new) })
  };
}

export { CLIMB_WAIT, FLOORS_SHOWN, FRESH_FLOOR, WHEEL_CALM, WHEEL_GAP, WHEEL_WORTH, arrangeChip, arrangeDrop, arrangeFloorStep, arrangeFollow, arrangeKeys, arrangeLandOn, arrangeNewCard, arrangeNote, arrangeOn, arrangeSay, arrangeSlot, arrangeStep, arrangeTake, arrangeWheel, blankSides, climbTo, dressDrag, landOnFloor, slideFloors, stopClimb, takingLane, blankViewModel, canArrange, closeArrange, deckFloor, floorAt, floorCards, floorInner, freshInner, layoutKey, layoutSeen, openArrange, paintArrange, paintEverything, paintStrip, render, stripSolid, stripViewModel, wheelAt, wheelPile, wheelStepAt, floorShell, dressInner, floorClick, floorDragOver, laneDragOver, chipDragStart, chipDragEnd };

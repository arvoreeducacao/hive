import { avatarPulse } from "./avatars.js";
import { activeItems, blockTitle, blocksOf, itemOf, stripItems, labelOf, landOnBlock, moveToNewBlock, nameSpace, ofBlock, openSpace, seatsOf, soloSeat, spaceName, spaceOf, tidy } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { paintYards } from "./chat-and-panes.js";
import { healStructuredScroll } from "./chat-stretches.js";
import { $, LABEL, batch, esc, every, paneOfSeat, perf, phrase, raycastOn, solidMounts, st, stateColor, statusFolded } from "./core.js";
import { dayOnScreen, dayWhatItDecided, paintDay } from "./day.js";
import { createFileTile, dropEditor, updateFile } from "./files-editor.js";
import { createDraftTile, updateDraft } from "./draft-seat.js";
import { goTo, goToSpace, releaseKeyboard } from "./focus-navigation.js";
import { keyHint, pool, tiles } from "./leader-key.js";
import { blockKey, paintBlocks } from "./mirror.js";
import { palOn, palPaint } from "./palette.js";
import { paintPlane, planeShown, planeSlot } from "./plane.js";
import { pullThreads } from "./prs.js";
import { calmly } from "./pure-helpers.js";
import { born, flipEnd, flipStart, inARow, inAStrip, paintComposer, vanish } from "./seat-layout.js";
import { closeSeatMenu, createJobTile, createOpeningTile, createTile, openSpaceMenu, update, updateJob, updateOpening } from "./seat-menu.js";
import { followInStrip, forgetFollow, paintStripEdges, watchStripScroll } from "./strip.js";
import { paintStructure } from "./structure.js";
import { forgetStruct, structPool } from "./structured-seats.js";
import { mirrorRow } from "./team.js";
import { movePrPanel, moveThreadPanel } from "./thread.js";
import { emptyWallModel, swapSeats } from "./tiles.js";

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

const arrangeOn = () => !$("arrange").hidden;

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
  const host = $("arrange");
  if (!st.arrangeScrim) {
    st.arrangeScrim = true;
    host.addEventListener("mousedown", (ev) => { if (ev.target === host) closeArrange(); });
  }
  wheelPile = 0;
  wheelStepAt = 0;
  host.hidden = false;
  host.classList.remove("up");
  paintArrange();
  void host.offsetWidth;
  host.classList.add("up");
}

function closeArrange() {
  if (!arrangeOn()) return;
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  clearTimeout(st.arrangeLanding);
  stopClimb();
  $("arrange").classList.remove("up");
  $("arrange").hidden = true;
  $("arrange").innerHTML = "";
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
    return `${phrase("moving")} <em>${esc(it?.title || it?.name || st.arrangeHeld)}</em> — ${phrase("{n} blocks take it, on any floor", { n: takers })}`;
  }
  const w = spaceOf(deckFloor());
  const cards = floorCards(w.id).length;
  return `<em>${esc(spaceName(w))}</em> — ${cards === 1 ? phrase("1 block") : phrase("{n} blocks", { n: cards })} · ${phrase("{n} seats", { n: seatsOf(w.id) })}`;
}

function arrangeChip(key, i, j) {
  const it = itemOf(key);
  const state = it?.state || "idle";
  const held = st.arrangeHeld === key;
  /* the swap mark belongs to the lane being aimed at: on every full lane at once it is noise */
  const swap = !held && st.blocks[i]?.keys.length >= st.LIMIT && takingLane(i);
  const at = st.arrangeCursor.i === i && st.arrangeCursor.j === j;
  return `<button type="button" class="a-chip${held ? " lifting" : ""}${swap ? " swap" : ""}${at ? " at" : ""}" draggable="true"
      data-key="${esc(key)}" data-i="${i}" data-j="${j}" data-state="${esc(state)}"
      title="${esc(it?.title || key)}">
      <span class="st"><i style="background:${stateColor(state)}"></i>${esc(phrase(LABEL[state] || state))}</span>
      <span class="nm">${esc(it?.title || it?.name || key)}</span>
      ${it?.errand ? `<span class="er">${esc(it.errand)}</span>` : ""}
    </button>`;
}

function arrangeSlot(i, j) {
  const hot = !!st.arrangeHeld && !st.blocks[i]?.keys.includes(st.arrangeHeld);
  const at = st.arrangeCursor.i === i && st.arrangeCursor.j === j;
  return `<button type="button" class="a-slot${hot ? " hot" : ""}${at ? " at" : ""}" data-i="${i}" data-j="${j}">
      ${hot ? esc(phrase("drop here")) : esc(phrase("free"))}</button>`;
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
    const taking = takingLane(i);
    const n = blocksOf(w.id).indexOf(b) + 1;
    return `<div class="a-card${i === st.block && w.id === st.space ? " here" : ""}${b.keys.length >= st.LIMIT ? " full" : ""}${taking ? " taking" : ""}" data-i="${i}">
      <div class="a-top"><i>${n}</i><span class="name">${esc(labelOf(b, items).txt || phrase("unnamed"))}</span><em>${b.keys.length}/${st.LIMIT}</em></div>
      <div class="a-grid">${cells.join("")}</div>
      <div class="a-note">${esc(arrangeNote(i))}</div>
    </div>`;
  }).join("");

  const newAt = st.arrangeCursor.i === arrangeNewCard() && w.id === deckFloor();
  const room = front
    ? `<button type="button" class="a-new${st.arrangeHeld ? " hot" : ""}${newAt ? " at" : ""}" data-w="${esc(w.id)}">
        <span class="plus">+</span><span class="t">${esc(phrase("new block"))}</span></button>`
    : "";

  return `<div class="surface"><div class="grid"></div>
      <div class="fl-blocks">${cards}${room}</div>
    </div>
    <div class="tag" data-w="${esc(w.id)}"><span class="swatch"></span>
      <input class="fl-name" data-w="${esc(w.id)}" value="${esc(w.name)}" placeholder="${esc(spaceName(w))}" spellcheck="false"
        aria-label="${esc(phrase("what this workspace is about"))}" />
      <span class="seats">${floorCards(w.id).length}·${seatsOf(w.id)}</span>
      <button type="button" class="fl-more-btn" data-w="${esc(w.id)}"
        title="${esc(phrase("rename or close this workspace"))}"
        aria-label="${esc(phrase("rename or close this workspace"))}">×</button></div>`;
}

function freshInner() {
  return `<div class="surface"><div class="grid"></div>
      <div class="fl-empty"><span class="plus">+</span><span class="t">${esc(phrase("new workspace"))}</span>
      <span class="s">${esc(phrase("another subject, with blocks of its own — the next chat opens in it"))}</span></div>
    </div>
    <div class="tag" data-w=""><span class="swatch"></span>${esc(phrase("new workspace"))}</div>`;
}

function placeFloors(host) {
  const at = floorAt();
  host.querySelectorAll(".floor").forEach((el) => {
    const d = Number(el.dataset.d);
    const away = d < -1 || d >= FLOORS_SHOWN;
    const ty = d < 0 ? d * -166 * 1.9 : d * -166;
    const tz = d < 0 ? Math.abs(d) * -150 * 0.45 : d * -150;
    el.style.transform = `translate3d(0,${ty}px,${tz}px)`;
    el.style.opacity = away ? 0 : d === 0 ? 1 : d > 0 ? Math.max(.44, .92 - (d - 1) * .12) : .34;
    el.style.pointerEvents = !away && d >= 0 ? "auto" : "none";
  });
  return at;
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

const part = (tag, cls, into) => {
  const el = document.createElement(tag);
  el.className = cls;
  if (into) into.appendChild(el);
  return el;
};

function arrangeScaffold(host) {
  if (host.querySelector(".deck")) return;
  host.innerHTML = "";
  part("div", "glow", host);
  const scene = part("div", "scene", host);
  part("div", "deck", scene);
  part("div", "fl-more", host).hidden = true;
  const foot = part("div", "fl-foot", host);
  part("span", "say", foot);
  part("span", "keys", foot).innerHTML =
    `<span><kbd>shift</kbd><kbd>↑</kbd><kbd>↓</kbd> ${esc(phrase("floor"))}</span>
     <span><kbd>←</kbd><kbd>→</kbd> ${esc(phrase("seat"))}</span>
     <span><kbd>space</kbd> ${esc(phrase("pick up"))}</span>
     <span><kbd>esc</kbd> ${esc(phrase("close"))}</span>`;
  scene.addEventListener("wheel", arrangeWheel, { passive: false });
}

const spaceOfSeat = (key) => {
  const b = st.blocks.find((one) => one.keys.includes(key));
  return b ? (b.ws || st.space) : "";
};

function stopClimb() {
  clearTimeout(st.arrangeClimb);
  st.arrangeClimb = 0;
  st.arrangeClimbTo = "";
  $("arrange").querySelectorAll(".floor.climbing").forEach((one) => one.classList.remove("climbing"));
}

/* the floor comes forward without redrawing anything: the seat in your hand lives in one of
   these cards, and rebuilding them mid-gesture is what used to kill the drag */
function slideFloors(host) {
  const at = floorAt();
  host.querySelectorAll(".floor").forEach((el) => {
    const id = el.dataset.w;
    const idx = id === "" ? st.spaces.length : st.spaces.findIndex((x) => x.id === id);
    el.dataset.d = String(idx - at);
    el.classList.toggle("here", !!id && id === deckFloor());
  });
  placeFloors(host);
}

function climbTo(id) {
  if (!id || id === deckFloor() || st.arrangeClimbTo === id) return;
  stopClimb();
  st.arrangeClimbTo = id;
  $("arrange").querySelector(`.floor[data-w="${CSS.escape(id)}"]`)?.classList.add("climbing");
  st.arrangeClimb = setTimeout(() => {
    st.arrangeClimb = 0;
    st.arrangeClimbTo = "";
    if (!st.arrangeHeld || !st.spaces.some((w) => w.id === id)) return;
    st.arrangeFloor = id;
    slideFloors($("arrange"));
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

function bindFloorShell(el) {
  el.addEventListener("click", (ev) => {
    if (ev.target.closest(".a-chip, .a-slot, .a-new, .fl-name, .fl-more-btn")) return;
    const id = el.dataset.w;
    /* carrying a seat, the click puts it down here — it never walks you to another workspace */
    if (st.arrangeHeld) { landOnFloor(id); return; }
    if (id === "") { const w = openSpace(""); closeArrange(); goToSpace(w.id); return; }
    arrangeLandOn(id);
  });
  el.addEventListener("contextmenu", (ev) => {
    const id = el.dataset.w;
    if (!id) return;
    ev.preventDefault();
    openSpaceMenu(id, ev.clientX, ev.clientY);
  });
  el.addEventListener("dragover", (ev) => {
    if (!st.arrangeHeld) return;
    /* a lane answers for itself, and stops the event when it takes the seat */
    if (ev.target.closest(".a-card")) return;
    const id = el.dataset.w;
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
  });
  el.addEventListener("dragleave", (ev) => {
    if (el.contains(ev.relatedTarget)) return;
    if (st.arrangeClimbTo === el.dataset.w) stopClimb();
  });
  el.addEventListener("drop", (ev) => {
    if (!st.arrangeHeld || ev.target.closest(".a-card, .a-new")) return;
    ev.preventDefault();
    ev.stopPropagation();
    landOnFloor(el.dataset.w);
  });
}

function bindFloor(el) {
  el.querySelectorAll(".fl-name").forEach((one) => {
    one.addEventListener("click", (ev) => ev.stopPropagation());
    one.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") one.blur();
      if (ev.key === "Escape") { one.value = spaceOf(one.dataset.w).name; one.blur(); }
    });
    one.addEventListener("change", () => { nameSpace(one.dataset.w, one.value); paintArrange(); paintBlocks(); });
    one.addEventListener("blur", () => { nameSpace(one.dataset.w, one.value); paintBlocks(); });
  });

  /* the same menu the right button opens, with a door you can see */
  el.querySelectorAll(".fl-more-btn").forEach((one) => {
    one.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const at = one.getBoundingClientRect();
      openSpaceMenu(one.dataset.w, at.left, at.bottom + 6);
    });
  });

  el.querySelectorAll(".a-card").forEach((one) => {
    const i = Number(one.dataset.i);
    one.addEventListener("dragover", (ev) => {
      if (!st.arrangeHeld || st.blocks[i]?.keys.includes(st.arrangeHeld)) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "move";
      /* a lane of a floor further back brings its floor forward, same as its empty surface */
      const w = one.closest(".floor")?.dataset.w;
      if (w && w !== deckFloor()) climbTo(w);
      else stopClimb();
      if (st.arrangeOver === i) return;
      st.arrangeOver = i;
      dressDrag();
    });
    one.addEventListener("dragleave", (ev) => {
      if (one.contains(ev.relatedTarget) || st.arrangeOver !== i) return;
      st.arrangeOver = -1;
      dressDrag();
    });
    /* the whole lane takes the seat: on a name it says who leaves, anywhere else the last one does */
    one.addEventListener("drop", (ev) => {
      if (!st.arrangeHeld) return;
      ev.preventDefault();
      ev.stopPropagation();
      arrangeDrop(st.arrangeHeld, i, ev.target.closest(".a-chip")?.dataset.key || null);
    });
  });

  el.querySelectorAll(".a-chip").forEach((one) => {
    const key = one.dataset.key;
    const i = Number(one.dataset.i);
    const j = Number(one.dataset.j);
    one.addEventListener("click", (ev) => { ev.stopPropagation(); if (!st.arrangeDragging) arrangeTake(key, i, j); });
    /* nothing is redrawn while the gesture is alive: this element is the one in the person's
       hand, and taking it out of the page mid-drag is what used to lose the drop */
    one.addEventListener("dragstart", (ev) => {
      st.arrangeDragging = true;
      st.arrangeHeld = key;
      st.arrangeOver = -1;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", key);
      dressDrag();
    });
    one.addEventListener("dragend", () => {
      st.arrangeDragging = false;
      st.arrangeOver = -1;
      stopClimb();
      if (!st.arrangeHeld) return;
      st.arrangeHeld = null;
      if (arrangeOn()) paintArrange();
    });
  });

  el.querySelectorAll(".a-slot").forEach((one) => {
    one.addEventListener("click", (ev) => ev.stopPropagation());
  });

  el.querySelectorAll(".a-new").forEach((one) => {
    one.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (st.arrangeHeld) arrangeDrop(st.arrangeHeld, arrangeNewCard(), null);
    });
    one.addEventListener("dragover", (ev) => {
      if (!st.arrangeHeld) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
    });
    one.addEventListener("drop", (ev) => {
      if (!st.arrangeHeld) return;
      ev.preventDefault();
      ev.stopPropagation();
      arrangeDrop(st.arrangeHeld, arrangeNewCard(), null);
    });
  });
}

/* everything the drag changes on screen is a class or a line of text, so it is written straight
   onto the elements already there. paintArrange rebuilds the deck, which a live gesture cannot take. */
function dressDrag() {
  const host = $("arrange");
  if (!host || host.hidden) return;
  const held = st.arrangeHeld;
  host.querySelectorAll(".a-chip").forEach((one) => {
    const i = Number(one.dataset.i);
    const mine = one.dataset.key === held;
    one.classList.toggle("lifting", mine);
    one.classList.toggle("swap", !mine && st.blocks[i]?.keys.length >= st.LIMIT && takingLane(i));
  });
  host.querySelectorAll(".a-slot").forEach((one) => {
    const i = Number(one.dataset.i);
    const hot = !!held && !st.blocks[i]?.keys.includes(held);
    one.classList.toggle("hot", hot);
    one.textContent = hot ? phrase("drop here") : phrase("free");
  });
  host.querySelectorAll(".a-card").forEach((one) => {
    const i = Number(one.dataset.i);
    one.classList.toggle("taking", takingLane(i));
    const note = one.querySelector(".a-note");
    if (note) note.textContent = arrangeNote(i);
  });
  host.querySelectorAll(".a-new").forEach((one) => one.classList.toggle("hot", !!held));
  const say = host.querySelector(".fl-foot .say");
  if (say) say.innerHTML = arrangeSay();
}

function paintArrange() {
  const host = $("arrange");
  st.arrangeFloor = deckFloor();
  arrangeScaffold(host);
  const deck = host.querySelector(".deck");
  const at = floorAt();
  const front = deckFloor();
  const ids = st.spaces.map((w) => w.id).concat([""]);

  for (const el of [...deck.children]) if (!ids.includes(el.dataset.w)) el.remove();

  ids.forEach((id) => {
    const w = id ? spaceOf(id) : FRESH_FLOOR;
    let el = deck.querySelector(`.floor[data-w="${CSS.escape(id)}"]`);
    if (!el) {
      el = document.createElement("section");
      el.className = "floor";
      el.dataset.w = id;
      deck.appendChild(el);
      bindFloorShell(el);
    }
    const naming = el.contains(document.activeElement) && document.activeElement.classList.contains("fl-name");
    if (!naming && !st.arrangeDragging) {
      el.innerHTML = id ? floorInner(w, id === front) : freshInner();
      bindFloor(el);
    }
    el.style.setProperty("--wtint", w.tint);
    el.classList.toggle("fresh", !id);
    el.classList.toggle("here", !!id && id === front);
    el.dataset.d = String((id === "" ? st.spaces.length : st.spaces.findIndex((x) => x.id === id)) - at);
  });

  placeFloors(host);

  const above = st.spaces.length - at - FLOORS_SHOWN;
  const more = host.querySelector(".fl-more");
  more.hidden = above <= 0;
  if (above > 0) more.textContent = phrase("+{n} further up", { n: above });
  host.querySelector(".fl-foot .say").innerHTML = arrangeSay();
}

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
  inp.disabled = false;
  if (document.activeElement !== inp) inp.value = labelOf(b, list).txt;
  inp.title = phrase("click to name the block");
}

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
  return {
    key: "strip", mirrorOf: false, rc: true,
    num: blockKey(blocksOf(st.space).indexOf(b) + 1),
    seats: list.length === 1 ? phrase("1 seat") : phrase("{n} seats", { n: list.length }),
    bold: "",
    title: `${blockTitle(b, list)}${askedFor}`
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
}

let layoutSeen = "";

function layoutKey(onPlane) {
  const seats = activeItems().map((it) => `${it.key}${statusFolded(it.key) ? "-" : "+"}`).join(",");
  return [st.space, st.blocks[st.block]?.id, st.open, onPlane ? "plane" : "canvas", inAStrip() ? "strip" : inARow() ? "row" : "grid", seats].join("|");
}

function paintCalls() {
  const calling = st.data.sessions.filter((s) => s.state === "needs");
  const say = $("calls-say");
  if (say) say.textContent = calling.length === 1 ? phrase("needs you") : phrase("need you");
  $("btn-calls").title = [...calling.map((s) => s.title || s.name), keyHint("calls")].join(" · ");
}

function paintEverything({ animate = true } = {}) {
  tidy();
  avatarPulse();
  document.body.classList.toggle("typing-on", !!st.typing);
  const onPlane = planeShown();
  $("canvas").hidden = !!st.mirrorDev || onPlane;
  $("plane").hidden = !onPlane;
  for (const id of ["btn-plane", "btn-plane-top"]) $(id).setAttribute("aria-pressed", st.planeOn ? "true" : "false");
  $("mirror").hidden = !st.mirrorDev;
  const placed = paintStructure();
  if (st.mirrorDev) {
    paintStripEdges();
    paintYards();
    return;
  }
  const layout = layoutKey(onPlane);
  if (layout === layoutSeen) animate = false;
  layoutSeen = layout;
  const moved = onPlane || !animate ? null : flipStart();
  const c = $("canvas");
  const b = st.blocks[st.block];
  const list = activeItems();
  const strip = !onPlane && !st.open && inAStrip();
  document.body.classList.toggle("strip-on", !onPlane && inAStrip());
  const shown = strip ? stripItems() : list.map((it, at) => ({ it, lane: 0, at, here: true }));
  if (placed.size && !onPlane) {
    for (const key of placed.keys()) {
      if (shown.some(({ it }) => it.key === key)) continue;
      const it = itemOf(key);
      if (it) shown.push({ it, lane: 0, at: -1, here: false });
    }
  }
  if (st.focus >= list.length) st.focus = Math.max(0, list.length - 1);
  if (st.seatMenuFor && !st.data.sessions.some((i) => i.name === st.seatMenuFor)) closeSeatMenu();
  if (st.reviewChat && (st.open !== st.reviewChat || !list.some((i) => i.name === st.reviewChat))) st.reviewChat = null;
  if (!st.reviewChat) movePrPanel($("prs"));
  if (st.threadChat && (st.open !== st.threadChat || !list.some((i) => i.name === st.threadChat))) {
    st.threadChat = null;
    $("thread").hidden = true;
    every("threads", 45000, () => pullThreads(false));
  }
  if (!st.threadChat) moveThreadPanel(document.body);
  const live = new Set(st.blocks.flatMap((x) => x.keys));
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

  c.className = st.open ? "zoom" : strip ? "strip" : `g${Math.min(st.LIMIT, Math.max(1, list.length))}${inARow() ? " row" : ""}`;

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
      if (!el) {
        el = it.kind === "job" ? (it.name ? tiles.get(it.name) || createOpeningTile(it) : createJobTile(it)) : it.kind === "file" ? createFileTile(it) : it.kind === "draft" ? createDraftTile(it) : createTile(it);
        tiles.set(it.key, el);
      }
      if (it.kind === "job" && it.name && tiles.get(it.name) !== el) tiles.set(it.name, el);
      const host = onPlane ? planeSlot(it.key) : placed.get(it.key) || c;
      const fresh = !el.isConnected;
      if (el.parentElement !== host) host.appendChild(el);
      if (fresh && !el.classList.contains("opening")) born(el);
      el.classList.toggle("lane-start", strip && lane > 0 && at === 0);
      if (it.kind === "job") (el.classList.contains("opening") ? updateOpening : updateJob)(el, it, pos);
      else if (it.kind === "file") updateFile(el, it, pos);
      else if (it.kind === "draft") updateDraft(el, it, pos);
      else update(el, it, pos);
    });
    if (!onPlane) {
      const inCanvas = placed.size ? shown.filter(({ it: i }) => !placed.has(i.key)) : shown;
      const onScreen = [...c.children].filter((x) => x.dataset.key).map((x) => x.dataset.key).join(",");
      if (onScreen !== inCanvas.map(({ it: i }) => i.key).join(",")) inCanvas.forEach(({ it: i }) => c.appendChild(tiles.get(i.key)));
    }
  }

  if (strip) {
    watchStripScroll(c);
    followInStrip(c);
  } else forgetFollow();
  paintStripEdges();

  const flights = flipEnd(moved);
  healStructuredScroll();
  paintComposer();
  const calls = st.data.sessions.filter((s) => s.state === "needs").length;
  $("n-calls").textContent = calls;
  if (raycastOn()) paintCalls();
  else $("btn-calls").classList.toggle("calls", calls > 0);
  $("btn-calls").hidden = calls === 0;
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

export { CLIMB_WAIT, FLOORS_SHOWN, FRESH_FLOOR, WHEEL_CALM, WHEEL_GAP, WHEEL_WORTH, arrangeChip, arrangeDrop, arrangeFloorStep, arrangeFollow, arrangeKeys, arrangeLandOn, arrangeNewCard, arrangeNote, arrangeOn, arrangeSay, arrangeScaffold, arrangeSlot, arrangeStep, arrangeTake, arrangeWheel, bindFloor, bindFloorShell, blankSides, climbTo, dressDrag, landOnFloor, slideFloors, stopClimb, takingLane, blankViewModel, canArrange, closeArrange, deckFloor, floorAt, floorCards, floorInner, freshInner, layoutKey, layoutSeen, openArrange, paintArrange, paintEverything, paintStrip, part, placeFloors, render, stripSolid, stripViewModel, wheelAt, wheelPile, wheelStepAt };

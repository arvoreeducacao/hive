import { render } from "./arrange.js";
import { itemOf } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { $, GLYPH, IS_MAC, LABEL, esc, phrase, raycastOn, solidMounts, st } from "./core.js";
import { goTo, pull } from "./focus-navigation.js";
import { pool, tiles } from "./leader-key.js";
import { openDraft } from "./draft-seat.js";
import { paintMenu, prIsGone, prsOfChat } from "./seat-menu.js";
import { refit } from "./terminal-history.js";

const PLANE_KEY = "hive.plane";

const PLANE_AT_KEY = "hive.plane.at";

const PLANE_SPOTS_KEY = "hive.plane.spots";

const PLANE_LINKS_KEY = "hive.plane.links";

const PLANE_SIZES_KEY = "hive.plane.sizes";

const PLANE_AREAS_KEY = "hive.plane.areas";

const PLANE_NOTES_KEY = "hive.plane.notes";

const NODE_W = 560;

const NODE_H = 360;

const PLANE_GAP = 26;

const PLANE_GROUP_PAD = 22;

const PLANE_GROUP_GAP = 74;

const PLANE_COLS = 3;

const PLANE_MIN = 0.1;

const PLANE_MAX = 1.6;

const PLANE_CARD_AT = 0.62;

const PLANE_PILL_AT = 0.3;

const PLANE_LINK_TTL = 12 * 60 * 60 * 1000;
const PLANE_KIN_ROWS = 6;

const PLANE_NUDGE = 4;

const NODE_MIN_W = 210;

const NODE_MIN_H = 110;

const AREA_MIN_W = 240;

const AREA_MIN_H = 180;

const AREA_BORN_W = 1240;

const AREA_BORN_H = 520;

const NOTE_MIN_W = 180;

const NOTE_MIN_H = 120;

const NOTE_BORN_W = 420;

const NOTE_BORN_H = 260;

const PLANE_TOOK_MS = 3 * 60 * 1000;

const FIELD_PANE_W = 640;

const FIELD_PANE_H = 470;

const PLANE_TINTS = ["", "amber", "blue"];

const PLANE_UNDO_CAP = 40;

const PLANE_SAID_MS = 7000;

const LINK_TAG = 42;

st.planeOn = false;

st.planeAt = { x: 0, y: 0, k: 1 };

st.planeAtKnown = false;

st.planeSpots = {};

st.planeLinks = [];

st.planeSizes = {};

st.planeAreas = [];

st.planeNotes = [];

st.planeDrag = null;

st.planeSize = null;

st.planeAreaDrag = null;

st.planeDraw = null;

st.planeArming = false;

st.planeWire = null;

st.planePan = null;

st.planeDragged = false;

let planeMenu = null;

st.planePicked = new Set();

st.planeUndo = [];

st.planeRedo = [];

let planeSeq = 0;

let planeSaidClock = null;

st.fieldPaneWas = null;

const planeNodes = new Map();

const planeGroupEls = new Map();

const planeAreaEls = new Map();

const planeNoteEls = new Map();

const planeTook = new Map();

const planeZoom = (k) => Math.max(PLANE_MIN, Math.min(PLANE_MAX, Number(k) || 1));

const planeBackKey = () => keyLabel(IS_MAC ? { meta: true, code: "KeyZ" } : { ctrl: true, code: "KeyZ" });

const planeWriting = () => {
  const now = document.activeElement;
  return !!now && (now.isContentEditable || now.tagName === "INPUT" || now.tagName === "TEXTAREA");
};

const planeShown = () => st.planeOn && !st.open && !st.mirrorDev;

const paneOnField = (name) => !!name && st.fieldPane === name && planeShown();

const paneShownFor = (name) => st.open === name || paneOnField(name);

const planeDensity = (k) => (k >= PLANE_CARD_AT ? "full" : k >= PLANE_PILL_AT ? "card" : "pill");

const planeSeatKeys = () => {
  const held = st.blocks.flatMap((b) => b.keys).filter((key) => itemOf(key));
  const inBlocks = new Set(held);
  const born = (st.data?.sessions || [])
    .filter((seat) => seat.by && !inBlocks.has(seat.name) && itemOf(seat.name))
    .map((seat) => seat.name);
  const gone = (st.data?.gone || [])
    .filter((seat) => itemOf(`gone:${seat.name}`))
    .map((seat) => `gone:${seat.name}`);
  return [...held, ...born, ...gone];
};

const parentOnPlane = (key) => {
  const of = itemOf(key)?.by || "";
  if (!of) return "";
  if (itemOf(of)) return of;
  return itemOf(`gone:${of}`) ? `gone:${of}` : "";
};

const planeKin = () => planeSeatKeys()
  .map((key) => ({ from: parentOnPlane(key), to: key }))
  .filter((one) => one.from && one.from !== one.to && st.planeSpots[one.from] && st.planeSpots[one.to]);

const planeErrandOf = (key) => itemOf(key)?.errand || "";

const savePlaneSpots = () => { try { localStorage.setItem(PLANE_SPOTS_KEY, JSON.stringify(st.planeSpots)); } catch {} };

const savePlaneAt = () => { try { localStorage.setItem(PLANE_AT_KEY, JSON.stringify(st.planeAt)); } catch {} };

const savePlaneLinks = () => { try { localStorage.setItem(PLANE_LINKS_KEY, JSON.stringify(st.planeLinks)); } catch {} };

const savePlaneSizes = () => { try { localStorage.setItem(PLANE_SIZES_KEY, JSON.stringify(st.planeSizes)); } catch {} };

const savePlaneAreas = () => { try { localStorage.setItem(PLANE_AREAS_KEY, JSON.stringify(st.planeAreas)); } catch {} };

const savePlaneNotes = () => { try { localStorage.setItem(PLANE_NOTES_KEY, JSON.stringify(st.planeNotes)); } catch {} };

const planeThingOf = (id) => st.planeAreas.find((one) => one.id === id) || st.planeNotes.find((one) => one.id === id) || null;

const planeIsArea = (id) => st.planeAreas.some((one) => one.id === id);

const savePlaneThing = (id) => (planeIsArea(id) ? savePlaneAreas() : savePlaneNotes());

const planeId = (kind) => `${kind}${Date.now().toString(36)}${(planeSeq++).toString(36)}`;

const planeTint = (tint) => (PLANE_TINTS.includes(tint) ? tint : "");

const planeSnap = () => JSON.stringify({ spots: st.planeSpots, sizes: st.planeSizes, areas: st.planeAreas, notes: st.planeNotes });

const canUndoPlane = () => st.planeUndo.length > 0;

function rememberPlaneWas(snap) {
  st.planeUndo.push(snap);
  if (st.planeUndo.length > PLANE_UNDO_CAP) st.planeUndo.shift();
  st.planeRedo = [];
}

const rememberPlane = () => rememberPlaneWas(planeSnap());

function wearPlane(snap) {
  const was = JSON.parse(snap);
  st.planeSpots = was.spots;
  st.planeSizes = was.sizes;
  st.planeAreas = was.areas;
  st.planeNotes = was.notes;
  savePlaneSpots();
  savePlaneSizes();
  savePlaneAreas();
  savePlaneNotes();
  for (const id of [...st.planePicked]) if (!planeThingOf(id)) st.planePicked.delete(id);
}

function undoPlane() {
  if (!st.planeUndo.length) return false;
  st.planeRedo.push(planeSnap());
  wearPlane(st.planeUndo.pop());
  return true;
}

function redoPlane() {
  if (!st.planeRedo.length) return false;
  st.planeUndo.push(planeSnap());
  wearPlane(st.planeRedo.pop());
  return true;
}

function pickPlane(id, add) {
  if (!id) {
    if (!st.planePicked.size) return false;
    st.planePicked.clear();
    return true;
  }
  if (!add) st.planePicked = new Set([id]);
  else if (st.planePicked.has(id)) st.planePicked.delete(id);
  else st.planePicked.add(id);
  return true;
}

function dropPlaneThings(ids) {
  const doomed = [...ids].filter((id) => planeThingOf(id));
  if (!doomed.length) return 0;
  rememberPlane();
  st.planeAreas = st.planeAreas.filter((one) => !doomed.includes(one.id));
  st.planeNotes = st.planeNotes.filter((one) => !doomed.includes(one.id));
  savePlaneAreas();
  savePlaneNotes();
  for (const id of doomed) st.planePicked.delete(id);
  return doomed.length;
}

function copyPlaneThing(id) {
  const one = planeThingOf(id);
  if (!one) return null;
  const area = planeIsArea(id);
  rememberPlane();
  const twin = { ...one, id: planeId(area ? "pa" : "pn"), x: one.x + PLANE_GAP, y: one.y + PLANE_GAP };
  if (area) {
    st.planeAreas.push(twin);
    savePlaneAreas();
  } else {
    st.planeNotes.push(twin);
    savePlaneNotes();
  }
  st.planePicked = new Set([twin.id]);
  return twin;
}

function tintPlaneNote(id, tint) {
  const note = st.planeNotes.find((one) => one.id === id);
  if (!note) return false;
  const want = planeTint(tint);
  if ((note.tint || "") === want) return false;
  rememberPlane();
  note.tint = want;
  savePlaneNotes();
  return true;
}

function readPlaneNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANE_NOTES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((one) => one && typeof one.id === "string" && Number.isFinite(one.x) && Number.isFinite(one.y) && Number.isFinite(one.w) && Number.isFinite(one.h))
      .map((one) => ({ id: one.id, text: String(one.text || ""), tint: planeTint(one.tint), x: one.x, y: one.y, w: Math.max(NOTE_MIN_W, one.w), h: Math.max(NOTE_MIN_H, one.h) }));
  } catch { return []; }
}

const planeSizeOf = (key) => st.planeSizes[key] || { w: NODE_W, h: NODE_H };

const planeBoxOf = (key) => ({ ...planeSpotOf(key), ...planeSizeOf(key) });

function readPlaneSizes() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANE_SIZES_KEY) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const [key, size] of Object.entries(raw)) {
      if (size && Number.isFinite(size.w) && Number.isFinite(size.h)) {
        out[key] = { w: Math.max(NODE_MIN_W, size.w), h: Math.max(NODE_MIN_H, size.h) };
      }
    }
    return out;
  } catch { return {}; }
}

function readPlaneAreas() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANE_AREAS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => a && typeof a.id === "string" && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.w) && Number.isFinite(a.h))
      .map((a) => ({ id: a.id, name: String(a.name || ""), x: a.x, y: a.y, w: Math.max(AREA_MIN_W, a.w), h: Math.max(AREA_MIN_H, a.h) }));
  } catch { return []; }
}

function seatsInArea(area) {
  return planeSeatKeys().filter((key) => {
    const box = planeBoxOf(key);
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2;
    return x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
  });
}

function bornPlaneArea(at) {
  rememberPlane();
  const area = {
    id: planeId("pa"),
    name: "",
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.max(AREA_MIN_W, Math.round(at.w)),
    h: Math.max(AREA_MIN_H, Math.round(at.h))
  };
  st.planeAreas.push(area);
  savePlaneAreas();
  paintPlane();
  const box = planeAreaEls.get(area.id);
  const name = box?.querySelector(".pa-name");
  if (name) { name.contentEditable = "plaintext-only"; name.focus(); }
  return area;
}

function armPlane(kind) {
  st.planeArming = kind || "";
  $("plane").classList.toggle("drawing", !!st.planeArming);
  $("plane-area").classList.toggle("armed", st.planeArming === "area");
  $("plane-note").classList.toggle("armed", st.planeArming === "note");
}

function bornPlaneNote(at) {
  rememberPlane();
  const note = {
    id: planeId("pn"),
    text: "",
    tint: "",
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.max(NOTE_MIN_W, Math.round(at.w)),
    h: Math.max(NOTE_MIN_H, Math.round(at.h))
  };
  st.planeNotes.push(note);
  savePlaneNotes();
  paintPlane();
  const body = planeNoteEls.get(note.id)?.querySelector(".pn-body");
  if (body) { body.contentEditable = "plaintext-only"; body.focus(); }
  return note;
}

function dropPlanePicked(ids) {
  const gone = dropPlaneThings(ids);
  if (!gone) return 0;
  paintPlane();
  sayOnPlane(gone > 1
    ? phrase("{n} things off the field", { n: gone })
    : phrase("Off the field"), true);
  return gone;
}

function writePlaneThing(id) {
  const box = planeAreaEls.get(id) || planeNoteEls.get(id);
  const field = box?.querySelector(".pa-name") || box?.querySelector(".pn-body");
  if (!field) return;
  field.contentEditable = "plaintext-only";
  field.focus();
  if (field.classList.contains("pa-name")) getSelection()?.selectAllChildren(field);
}

function planeThingRows(id) {
  const area = planeIsArea(id);
  return [
    { label: area ? phrase("rename…") : phrase("write in it"), note: phrase("double-click"), go: () => writePlaneThing(id) },
    { label: phrase("duplicate"), go: () => { if (copyPlaneThing(id)) paintPlane(); } },
    { sep: true },
    {
      label: st.planePicked.size > 1 && st.planePicked.has(id)
        ? phrase("remove these {n}", { n: st.planePicked.size })
        : (area ? phrase("remove the area — the seats stay") : phrase("remove the note")),
      danger: true,
      go: () => dropPlanePicked(st.planePicked.has(id) ? st.planePicked : new Set([id]))
    }
  ];
}

function planeFieldRows(at) {
  return [
    { label: phrase("+ note"), go: () => bornPlaneNote({ x: at.x, y: at.y, w: NOTE_BORN_W, h: NOTE_BORN_H }) },
    { label: phrase("+ area"), go: () => bornPlaneArea({ x: at.x, y: at.y, w: AREA_BORN_W, h: AREA_BORN_H }) },
    { sep: true },
    { label: phrase("undo"), off: !canUndoPlane(), go: () => stepPlaneBack(false) },
    { label: phrase("tidy"), go: () => { tidyPlane(); render(); fitPlane(); } },
    { label: phrase("fit"), go: () => fitPlane() }
  ];
}

function stepPlaneBack(forward) {
  if (!(forward ? redoPlane() : undoPlane())) return false;
  paintPlane();
  sayOnPlane(forward ? phrase("Back again") : phrase("Undone"), false);
  return true;
}

function sayOnPlane(text, undoable) {
  const said = $("plane-said");
  if (!said) return;
  clearTimeout(planeSaidClock);
  said.innerHTML = `<b></b>${undoable ? "<button></button>" : ""}`;
  said.querySelector("b").textContent = text;
  const back = said.querySelector("button");
  if (back) {
    back.textContent = phrase("undo {n}", { n: planeBackKey() });
    back.addEventListener("click", () => { hushPlane(); stepPlaneBack(false); });
  }
  said.hidden = false;
  planeSaidClock = setTimeout(hushPlane, PLANE_SAID_MS);
}

function hushPlane() {
  clearTimeout(planeSaidClock);
  const said = $("plane-said");
  if (said) said.hidden = true;
}

function markPlanePicked() {
  for (const [id, box] of planeAreaEls) box.classList.toggle("picked", st.planePicked.has(id));
  for (const [id, box] of planeNoteEls) box.classList.toggle("picked", st.planePicked.has(id));
  paintPlaneBar();
}

function paintPlaneBar() {
  const bar = $("plane-bar");
  if (!bar) return;
  const id = st.planePicked.size === 1 ? [...st.planePicked][0] : "";
  const one = id ? planeThingOf(id) : null;
  if (!one) {
    bar.hidden = true;
    st.planeBarFor = "";
    planeBarSolid.show(PLANE_BAR_SHUT);
    return;
  }
  st.planeBarFor = id;
  if (raycastOn()) planeBarSolid.show(raycastPlaneBar(id, one));
  else planeBarSolid.show(planeBarViewModel(id, one));
  bar.hidden = false;
  const host = $("plane");
  const left = one.x * st.planeAt.k + st.planeAt.x;
  const top = one.y * st.planeAt.k + st.planeAt.y - bar.offsetHeight - 8;
  bar.style.left = `${Math.max(8, Math.min(left, (host?.clientWidth || 0) - bar.offsetWidth - 8))}px`;
  bar.style.top = `${Math.max(8, top)}px`;
}

let planeBarSolid = null;

st.planeBarFor = "";

const PLANE_BAR_SHUT = { on: false, area: false, tints: [], tintLabel: "", rename: "", duplicate: "", remove: "" };

function planeBarViewModel(id, one) {
  return {
    on: true,
    area: planeIsArea(id),
    rename: phrase("rename"),
    duplicate: phrase("duplicate"),
    remove: phrase("remove {n}", { n: keyLabel({ code: "Backspace" }) }),
    tintLabel: phrase("colour of this note"),
    tints: PLANE_TINTS.map((tint) => ({ key: tint || "plain", value: tint, cls: tint || "plain", on: (one.tint || "") === tint }))
  };
}

solidMounts.push((hive) => {
  const bar = $("plane-bar");
  if (!bar) return;
  planeBarSolid = hive.mountPlaneBar(bar, {
    tint: (ev, tint) => {
      ev.stopPropagation();
      if (tintPlaneNote(st.planeBarFor, tint)) paintPlane();
    },
    write: (ev) => { ev.stopPropagation(); writePlaneThing(st.planeBarFor); },
    copy: (ev) => { ev.stopPropagation(); if (copyPlaneThing(st.planeBarFor)) paintPlane(); },
    drop: (ev) => { ev.stopPropagation(); dropPlanePicked(new Set([st.planeBarFor])); }
  });
});

function raycastPlaneBar(id, one) {
  return {
    ...planeBarViewModel(id, one),
    raycast: true,
    remove: planeIsArea(id) ? phrase("remove the area") : phrase("remove"),
    removeKey: keyLabel({ code: "Backspace" })
  };
}

function paintPlaneNotes() {
  const world = $("plane-world");
  for (const note of st.planeNotes) {
    let box = planeNoteEls.get(note.id);
    if (!box) {
      box = document.createElement("div");
      box.className = "pnote";
      box.dataset.thing = note.id;
      box.innerHTML = `<div class="pn-body" spellcheck="false" data-empty="${phrase("write it down here")}"></div>` +
        `<span class="pa-grip" title="${phrase("pull to resize")}"></span>`;
      const body = box.querySelector(".pn-body");
      body.addEventListener("blur", () => {
        const one = st.planeNotes.find((x) => x.id === note.id);
        body.contentEditable = "false";
        if (!one || one.text === body.innerText.slice(0, 2000)) return;
        rememberPlane();
        one.text = body.innerText.slice(0, 2000);
        savePlaneNotes();
      });
      body.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        body.contentEditable = "plaintext-only";
        body.focus();
      });
      body.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Escape") { ev.preventDefault(); body.blur(); }
      });
      planeNoteEls.set(note.id, box);
      world.appendChild(box);
    }
    box.style.left = `${note.x}px`;
    box.style.top = `${note.y}px`;
    box.style.width = `${note.w}px`;
    box.style.height = `${note.h}px`;
    box.dataset.tint = note.tint || "";
    const body = box.querySelector(".pn-body");
    if (document.activeElement !== body && body.innerText !== note.text) body.innerText = note.text;
  }
  for (const [id, box] of planeNoteEls) {
    if (st.planeNotes.some((one) => one.id === id)) continue;
    box.remove();
    planeNoteEls.delete(id);
  }
}

function paintPlaneMap() {
  const map = $("plane-map");
  const in_ = map.querySelector(".in");
  const said = planeMapViewModel(in_);
  map.dataset.field = JSON.stringify(said.field);
  planeMapSolid.show({ dots: said.dots, seen: said.seen });
}

let planeMapSolid = null;

function planeMapViewModel(in_) {
  const field = planeBounds();
  const seen = planeSeen();
  const x1 = Math.min(field.x, seen.x);
  const y1 = Math.min(field.y, seen.y);
  const x2 = Math.max(field.x + field.w, seen.x + seen.w);
  const y2 = Math.max(field.y + field.h, seen.y + seen.h);
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const k = Math.min(in_.clientWidth / w, in_.clientHeight / h) || 0.01;
  const at = (box) => ({
    left: `${(box.x - x1) * k + (in_.clientWidth - w * k) / 2}px`,
    top: `${(box.y - y1) * k + (in_.clientHeight - h * k) / 2}px`,
    width: `${Math.max(2, box.w * k)}px`,
    height: `${Math.max(2, box.h * k)}px`
  });
  const dots = [];
  for (const area of st.planeAreas) dots.push({ key: `area:${area.id}`, cls: "area", at: at(area) });
  for (const note of st.planeNotes) dots.push({ key: `note:${note.id}`, cls: "note", at: at(note) });
  const here = new Set(st.blocks[st.block]?.keys || []);
  for (const key of planeNodes.keys()) {
    dots.push({ key: `seat:${key}`, cls: itemOf(key)?.state === "needs" ? "needs" : here.has(key) ? "live" : "", at: at(planeBoxOf(key)) });
  }
  return { field: { x1, y1, w, h, k }, dots, seen: at(seen) };
}

solidMounts.push((hive) => {
  const in_ = $("plane-map")?.querySelector(".in");
  if (in_) planeMapSolid = hive.mountPlaneMap(in_);
});

function lookFromMap(ev) {
  const map = $("plane-map");
  const in_ = map.querySelector(".in");
  let field = null;
  try { field = JSON.parse(map.dataset.field || "null"); } catch {}
  if (!field) return;
  const box = in_.getBoundingClientRect();
  const at = {
    x: field.x1 + (ev.clientX - box.left - (in_.clientWidth - field.w * field.k) / 2) / field.k,
    y: field.y1 + (ev.clientY - box.top - (in_.clientHeight - field.h * field.k) / 2) / field.k
  };
  const host = $("plane");
  st.planeAt = { ...st.planeAt, x: host.clientWidth / 2 - at.x * st.planeAt.k, y: host.clientHeight / 2 - at.y * st.planeAt.k };
  st.planeAtKnown = true;
  savePlaneAt();
  glidePlane();
  applyPlane();
  paintPlaneMap();
}

function newPlaneArea() {
  const seen = planeSeen();
  const w = Math.min(AREA_BORN_W, seen.w * 0.7);
  const h = Math.min(AREA_BORN_H, seen.h * 0.7);
  bornPlaneArea({ x: seen.x + (seen.w - w) / 2, y: seen.y + (seen.h - h) / 2, w, h });
}

function newPlaneNote() {
  const seen = planeSeen();
  bornPlaneNote({ x: seen.x + (seen.w - NOTE_BORN_W) / 2, y: seen.y + (seen.h - NOTE_BORN_H) / 2, w: NOTE_BORN_W, h: NOTE_BORN_H });
}

function paintPlaneAreas() {
  const world = $("plane-world");
  for (const area of st.planeAreas) {
    let box = planeAreaEls.get(area.id);
    if (!box) {
      box = document.createElement("div");
      box.className = "parea";
      box.dataset.thing = area.id;
      box.innerHTML = `<div class="pa-name" spellcheck="false" data-empty="${phrase("name this area")}" title="${phrase("double-click to write the name — drag the area to move it with what is inside")}"></div>` +
        `<span class="pa-grip" title="${phrase("pull to resize")}"></span>`;
      const name = box.querySelector(".pa-name");
      name.addEventListener("blur", () => {
        const one = st.planeAreas.find((a) => a.id === area.id);
        name.contentEditable = "false";
        if (!one || one.name === name.textContent.trim().slice(0, 60)) return;
        rememberPlane();
        one.name = name.textContent.trim().slice(0, 60);
        name.textContent = one.name;
        savePlaneAreas();
      });
      name.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        name.contentEditable = "plaintext-only";
        name.focus();
        getSelection()?.selectAllChildren(name);
      });
      name.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); name.blur(); }
        if (ev.key === "Escape") { name.textContent = area.name; name.blur(); }
        ev.stopPropagation();
      });
      planeAreaEls.set(area.id, box);
      world.insertBefore(box, world.firstChild);
    }
    box.style.left = `${area.x}px`;
    box.style.top = `${area.y}px`;
    box.style.width = `${area.w}px`;
    box.style.height = `${area.h}px`;
    const name = box.querySelector(".pa-name");
    if (document.activeElement !== name && name.textContent !== area.name) name.textContent = area.name;
  }
  for (const [id, box] of planeAreaEls) {
    if (st.planeAreas.some((a) => a.id === id)) continue;
    box.remove();
    planeAreaEls.delete(id);
  }
}

function readPlaneSpots() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANE_SPOTS_KEY) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const [key, at] of Object.entries(raw)) {
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) out[key] = { x: at.x, y: at.y };
    }
    return out;
  } catch { return {}; }
}

function readPlaneLinks() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANE_LINKS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw.filter((l) => l && typeof l.from === "string" && typeof l.to === "string" && now - Number(l.at || 0) < PLANE_LINK_TTL)
      .map((l) => ({ from: l.from, to: l.to, at: Number(l.at), task: String(l.task || "") }));
  } catch { return []; }
}

function bootPlane() {
  try { st.planeOn = localStorage.getItem(PLANE_KEY) === "on"; } catch {}
  st.planeSpots = readPlaneSpots();
  st.planeLinks = readPlaneLinks();
  st.planeSizes = readPlaneSizes();
  st.planeAreas = readPlaneAreas();
  st.planeNotes = readPlaneNotes();
  try {
    const at = JSON.parse(localStorage.getItem(PLANE_AT_KEY) || "null");
    if (at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.k)) {
      st.planeAt = { x: at.x, y: at.y, k: planeZoom(at.k) };
      st.planeAtKnown = true;
    }
  } catch {}
  wirePlane();
}

function togglePlane() {
  st.planeOn = !st.planeOn;
  if (!st.planeOn) dropFieldPane();
  try { localStorage.setItem(PLANE_KEY, st.planeOn ? "on" : "off"); } catch {}
  if (st.planeOn && !Object.keys(st.planeSpots).length) tidyPlane();
  for (const el of tiles.values()) {
    const head = el.querySelector(".t-head");
    if (head) head.draggable = !st.planeOn;
  }
  closeLinkMenu();
  render();
  if (st.planeOn && !st.planeAtKnown) requestAnimationFrame(() => fitPlane(true));
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
}

function takeFieldPane(name) {
  if (!planeShown()) return false;
  const i = st.blocks.findIndex((b) => b.keys.includes(name));
  if (i < 0) return false;
  st.block = i;
  st.focus = Math.max(0, st.blocks[i].keys.indexOf(name));
  st.fieldPane = name;
  growFieldPane(name);
  return true;
}

function growFieldPane(name) {
  const was = st.planeSizes[name] ? { ...st.planeSizes[name] } : null;
  st.fieldPaneWas = { key: name, size: was };
  const now = planeSizeOf(name);
  if (now.w >= FIELD_PANE_W && now.h >= FIELD_PANE_H) return;
  st.planeSizes[name] = { w: Math.max(now.w, FIELD_PANE_W), h: Math.max(now.h, FIELD_PANE_H) };
  savePlaneSizes();
}

function dropFieldPane() {
  if (!st.fieldPane) return false;
  st.fieldPane = "";
  const was = st.fieldPaneWas;
  st.fieldPaneWas = null;
  if (!was) return true;
  if (was.size) st.planeSizes[was.key] = was.size;
  else delete st.planeSizes[was.key];
  savePlaneSizes();
  return true;
}

function planeSeen() {
  const host = $("plane");
  const w = (host?.clientWidth || 1280) / st.planeAt.k;
  const h = (host?.clientHeight || 820) / st.planeAt.k;
  return { x: -st.planeAt.x / st.planeAt.k, y: -st.planeAt.y / st.planeAt.k, w, h };
}

function planeClashes(x, y, w, h, taken) {
  return taken.some((one) => x < one.x + one.w && x + w > one.x && y < one.y + one.h && y + h > one.y);
}

function planeFreeSpot() {
  const taken = Object.entries(st.planeSpots).map(([key, at]) => ({ ...at, ...planeSizeOf(key) }));
  if (!taken.length) return { x: 0, y: 0 };
  const seen = planeSeen();
  const stepX = NODE_W + PLANE_GAP;
  const stepY = NODE_H + PLANE_GAP;
  for (let y = Math.round(seen.y) + PLANE_GAP; y + NODE_H <= seen.y + seen.h; y += stepY) {
    for (let x = Math.round(seen.x) + PLANE_GAP; x + NODE_W <= seen.x + seen.w; x += stepX) {
      if (!planeClashes(x, y, NODE_W, NODE_H, taken)) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  const bottom = Math.max(...taken.map((one) => one.y + one.h));
  return { x: Math.min(...taken.map((one) => one.x)), y: bottom + PLANE_GAP };
}

function planeSpotOf(key) {
  if (!st.planeSpots[key]) { st.planeSpots[key] = besideParent(key) || planeFreeSpot(); savePlaneSpots(); }
  return st.planeSpots[key];
}

function besideParent(key) {
  const of = parentOnPlane(key);
  const at = of && st.planeSpots[of];
  if (!at) return null;
  const taken = Object.entries(st.planeSpots).map(([one, spot]) => ({ ...spot, ...planeSizeOf(one) }));
  const size = planeSizeOf(key);
  const x = at.x + planeSizeOf(of).w + PLANE_GAP * 2;
  for (let row = 0; row < PLANE_KIN_ROWS; row++) {
    const y = at.y + row * (NODE_H + PLANE_GAP);
    if (!planeClashes(x, y, size.w, size.h, taken)) return { x, y };
  }
  return null;
}

function planeFlocks(keys) {
  const by = new Map();
  for (const key of keys) {
    const of = planeErrandOf(key);
    if (!by.has(of)) by.set(of, []);
    by.get(of).push(key);
  }
  return [...by.entries()].sort((a, b) =>
    (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
}

function tidyPlane() {
  rememberPlane();
  const held = new Set(st.planeAreas.flatMap((area) => seatsInArea(area)));
  const spots = {};
  for (const key of held) spots[key] = planeSpotOf(key);
  let y = 0;
  for (const [, all] of planeFlocks(planeSeatKeys().filter((key) => !held.has(key)))) {
    const members = all;
    const cols = Math.max(1, Math.min(PLANE_COLS, members.length));
    members.forEach((key, i) => {
      spots[key] = { x: (i % cols) * (NODE_W + PLANE_GAP), y: y + Math.floor(i / cols) * (NODE_H + PLANE_GAP) };
    });
    y += Math.ceil(members.length / cols) * (NODE_H + PLANE_GAP) + PLANE_GROUP_GAP;
  }
  st.planeSpots = spots;
  savePlaneSpots();
}

function planeBounds() {
  const all = [...planeNodes.keys()].filter((key) => st.planeSpots[key]).map(planeBoxOf)
    .concat(st.planeAreas.map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h })))
    .concat(st.planeNotes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })));
  if (!all.length) return { x: 0, y: 0, w: NODE_W, h: NODE_H };
  const x1 = Math.min(...all.map((at) => at.x));
  const y1 = Math.min(...all.map((at) => at.y));
  const x2 = Math.max(...all.map((at) => at.x + at.w));
  const y2 = Math.max(...all.map((at) => at.y + at.h));
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

function planeCamera(box, width, height, pad) {
  const k = planeZoom(Math.min((width - pad * 2) / box.w, (height - pad * 2) / box.h));
  return { k, x: (width - box.w * k) / 2 - box.x * k, y: (height - box.h * k) / 2 - box.y * k };
}

function glidePlane() {
  const world = $("plane-world");
  world.classList.add("glide");
  clearTimeout(world._glide);
  world._glide = setTimeout(() => world.classList.remove("glide"), 420);
}

function fitPlane(quiet) {
  const host = $("plane");
  const width = host.clientWidth || 1200;
  const height = host.clientHeight || 700;
  st.planeAt = planeCamera(planeBounds(), width, height, 56);
  st.planeAtKnown = true;
  savePlaneAt();
  if (!quiet) glidePlane();
  applyPlane();
}

function zoomPlaneAt(clientX, clientY, by) {
  const box = $("plane").getBoundingClientRect();
  const k = planeZoom(st.planeAt.k * by);
  const x = clientX - box.left;
  const y = clientY - box.top;
  st.planeAt = { k, x: x - (x - st.planeAt.x) * (k / st.planeAt.k), y: y - (y - st.planeAt.y) * (k / st.planeAt.k) };
  st.planeAtKnown = true;
  savePlaneAt();
  applyPlane();
}

function zoomPlaneBy(by) {
  const host = $("plane");
  const box = host.getBoundingClientRect();
  glidePlane();
  zoomPlaneAt(box.left + host.clientWidth / 2, box.top + host.clientHeight / 2, by);
}

function applyPlane() {
  const world = $("plane-world");
  world.style.transform = `translate(${st.planeAt.x}px, ${st.planeAt.y}px) scale(${st.planeAt.k})`;
  world.style.setProperty("--pk", String(Math.max(1, Math.min(6, PLANE_CARD_AT / st.planeAt.k))));
  const dense = planeDensity(st.planeAt.k);
  world.classList.toggle("dense-full", dense === "full");
  world.classList.toggle("dense-card", dense === "card");
  world.classList.toggle("dense-pill", dense === "pill");
  $("plane-k").textContent = `${Math.round(st.planeAt.k * 100)}%`;
  paintPlaneBar();
}

function planeSlot(key) {
  let node = planeNodes.get(key);
  if (!node) {
    node = document.createElement("div");
    node.className = "pnode";
    node.dataset.key = key;
    node.style.width = `${NODE_W}px`;
    node.style.height = `${NODE_H}px`;
    node.innerHTML = `<span class="plug" title="${phrase("pull a line to another seat")}"></span>` +
      `<span class="grip" title="${phrase("pull to resize")}"></span>`;
    planeNodes.set(key, node);
    $("plane-world").appendChild(node);
  }
  const box = planeBoxOf(key);
  node.style.left = `${box.x}px`;
  node.style.top = `${box.y}px`;
  node.style.width = `${box.w}px`;
  node.style.height = `${box.h}px`;
  return node;
}

function paintPlaneCard(node, it) {
  for (const [was, kept] of planeCardSolids) {
    if (was.isConnected) continue;
    kept.view.dispose();
    planeCardSolids.delete(was);
  }
  let card = node.querySelector(".pcard");
  let held = planeCardSolids.get(node);
  if (held && held.card !== card) {
    held.view.dispose();
    planeCardSolids.delete(node);
    held = null;
  }
  if (!card) {
    card = document.createElement("article");
    card.className = "pcard";
    node.appendChild(card);
  }
  if (!held) {
    held = { card, view: planeCardMount(card) };
    planeCardSolids.set(node, held);
  }
  card.dataset.state = it.state || "idle";
  if (raycastOn()) held.view.show({ ...planeCardViewModel(it), raycast: true });
  else held.view.show(planeCardViewModel(it));
}

let planeCardMount = null;

const planeCardSolids = new Map();

function planeCardViewModel(it) {
  const chips = [];
  const pr = it.name ? prsOfChat(it.name).find((one) => !prIsGone(one)) : null;
  if (pr) chips.push(`#${pr.number}`);
  if (it.model) chips.push(it.model);
  return {
    glyph: GLYPH[it.state] || "g-idle",
    name: it.title || it.name || it.key,
    when: it.when || "",
    of: it.errand ? `${it.errand} · ${it.name}` : (it.where === "cloud" ? phrase("on the server") : ""),
    said: phrase(LABEL[it.state] || ""),
    sum: it.summary || it.description || phrase("no status written yet — only the terminal speaks for it"),
    chips: chips.map((text, at) => ({ key: at, text }))
  };
}

solidMounts.push((hive) => {
  planeCardMount = hive.mountPlaneCard;
});

function paintPlaneGroups() {
  const world = $("plane-world");
  const seen = new Set();
  for (const [of, members] of planeFlocks([...planeNodes.keys()])) {
    if (!of) continue;
    seen.add(of);
    let box = planeGroupEls.get(of);
    if (!box) {
      box = document.createElement("div");
      box.className = "pgroup";
      box.innerHTML = "<b></b><i></i>";
      planeGroupEls.set(of, box);
      world.insertBefore(box, world.firstChild);
    }
    const spots = members.filter((key) => st.planeSpots[key]).map(planeBoxOf);
    if (!spots.length) continue;
    const x1 = Math.min(...spots.map((at) => at.x)) - PLANE_GROUP_PAD;
    const y1 = Math.min(...spots.map((at) => at.y)) - PLANE_GROUP_PAD;
    const x2 = Math.max(...spots.map((at) => at.x + at.w)) + PLANE_GROUP_PAD;
    const y2 = Math.max(...spots.map((at) => at.y + at.h)) + PLANE_GROUP_PAD;
    box.style.left = `${x1}px`;
    box.style.top = `${y1}px`;
    box.style.width = `${x2 - x1}px`;
    box.style.height = `${y2 - y1}px`;
    const waiting = members.filter((key) => itemOf(key)?.state === "needs").length;
    box.classList.toggle("needs", waiting > 0);
    box.querySelector("b").textContent = of;
    box.querySelector("i").textContent = waiting
      ? phrase("{n} of {total} waiting on you", { n: waiting, total: members.length })
      : String(members.length);
  }
  for (const [of, box] of planeGroupEls) {
    if (seen.has(of)) continue;
    box.remove();
    planeGroupEls.delete(of);
  }
}

function planeWirePath(x1, y1, x2, y2) {
  const bend = Math.max(50, Math.abs(x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
}

function paintPlaneWires() {
  const skin = document.querySelector("#plane-wires g");
  if (!skin) return;
  const now = Date.now();
  const alive = st.planeLinks.filter((l) => now - l.at < PLANE_LINK_TTL && st.planeSpots[l.from] && st.planeSpots[l.to]);
  if (alive.length !== st.planeLinks.length) { st.planeLinks = alive; savePlaneLinks(); }
  const kept = new Set();
  for (const l of alive) {
    const a = planeBoxOf(l.from);
    const b = planeBoxOf(l.to);
    wireOn(skin, `${l.from}>${l.to}`, a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, "#6E3826", "1.6");
    kept.add(`${l.from}>${l.to}`);
  }
  for (const one of planeKin()) {
    const a = planeBoxOf(one.from);
    const b = planeBoxOf(one.to);
    const id = `kin:${one.from}>${one.to}`;
    kinOn(skin, id, a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2);
    kept.add(id);
  }
  if (st.planeWire) {
    wireOn(skin, "wiring", st.planeWire.x1, st.planeWire.y1, st.planeWire.x2, st.planeWire.y2, "#CD694A", "1.8");
    kept.add("wiring");
  }
  for (const [id, wire] of planeWireEls) {
    if (kept.has(id)) continue;
    wire.path.remove();
    wire.dot.remove();
    planeWireEls.delete(id);
  }
  paintPlaneMarks(alive);
}

const SVG_NS = "http://www.w3.org/2000/svg";

const planeWireEls = new Map();

function wireOn(skin, id, x1, y1, x2, y2, colour, width) {
  let wire = planeWireEls.get(id);
  if (!wire) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", colour);
    path.setAttribute("stroke-width", width);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("fill", colour);
    skin.append(path, dot);
    wire = { path, dot, d: "", x2: NaN, y2: NaN };
    planeWireEls.set(id, wire);
  }
  const d = planeWirePath(x1, y1, x2, y2);
  if (d !== wire.d) { wire.path.setAttribute("d", d); wire.d = d; }
  if (x2 !== wire.x2) { wire.dot.setAttribute("cx", x2); wire.x2 = x2; }
  if (y2 !== wire.y2) { wire.dot.setAttribute("cy", y2); wire.y2 = y2; }
}

function kinOn(skin, id, x1, y1, x2, y2) {
  let wire = planeWireEls.get(id);
  if (!wire) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#6E3826");
    path.setAttribute("stroke-width", "1.4");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    const dot = document.createElementNS(SVG_NS, "polygon");
    dot.setAttribute("fill", "#6E3826");
    skin.append(path, dot);
    wire = { path, dot, d: "", x2: NaN, y2: NaN };
    planeWireEls.set(id, wire);
  }
  const d = planeWirePath(x1, y1, x2, y2);
  if (d !== wire.d) { wire.path.setAttribute("d", d); wire.d = d; }
  if (x2 !== wire.x2 || y2 !== wire.y2) {
    wire.dot.setAttribute("points", `${x2 - 9},${y2 - 5} ${x2},${y2} ${x2 - 9},${y2 + 5}`);
    wire.x2 = x2;
    wire.y2 = y2;
  }
}

function paintPlaneMarks(alive) {
  const world = $("plane-world");
  let marks = world.querySelector(".pmarks");
  if (!marks) {
    marks = document.createElement("div");
    marks.className = "pmarks";
    world.appendChild(marks);
  }
  const kept = new Set();
  for (const link of alive) {
    const id = `${link.from}>${link.to}`;
    kept.add(id);
    let tag = planeMarkEls.get(id);
    if (!tag) {
      tag = document.createElement("button");
      tag.className = "wlabel";
      tag.addEventListener("click", (ev) => {
        ev.stopPropagation();
        st.planeLinks = st.planeLinks.filter((one) => !(one.from === link.from && one.to === link.to));
        savePlaneLinks();
        paintPlaneWires();
      });
      marks.appendChild(tag);
      planeMarkEls.set(id, tag);
    }
    const a = planeBoxOf(link.from);
    const b = planeBoxOf(link.to);
    const left = `${(a.x + a.w + b.x) / 2}px`;
    const top = `${(a.y + a.h / 2 + b.y + b.h / 2) / 2}px`;
    if (tag.style.left !== left) tag.style.left = left;
    if (tag.style.top !== top) tag.style.top = top;
    const says = link.task ? shortTask(link.task) : phrase("together");
    if (tag.textContent !== says) tag.textContent = says;
    const title = phrase("{a} and {b} are on this together — click to remove the line", { a: link.from, b: link.to }) +
      (link.task ? `\n\n${link.task}` : "");
    if (tag.title !== title) tag.title = title;
  }
  for (const [id, tag] of planeMarkEls) {
    if (kept.has(id)) continue;
    tag.remove();
    planeMarkEls.delete(id);
  }
}

const planeMarkEls = new Map();

function paintPlaneTook() {
  const now = Date.now();
  for (const [key, node] of planeNodes) {
    const took = planeTook.get(key);
    let chip = node.querySelector(".took");
    if (took && now - took.at < PLANE_TOOK_MS) {
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "took";
        node.appendChild(chip);
      }
      chip.textContent = phrase("with {a}", { a: took.with });
      continue;
    }
    if (took) planeTook.delete(key);
    chip?.remove();
  }
}

function paintPlane() {
  const alive = new Set(planeSeatKeys());
  let dropped = false;
  for (const [key, node] of planeNodes) {
    if (alive.has(key)) continue;
    node.remove();
    planeNodes.delete(key);
    delete st.planeSpots[key];
    dropped = true;
  }
  if (dropped) savePlaneSpots();
  const here = new Set(st.blocks[st.block]?.keys || []);
  for (const key of alive) {
    const node = planeSlot(key);
    const it = itemOf(key);
    const live = here.has(key) && tiles.get(key)?.parentElement === node;
    node.classList.toggle("live", live);
    if (live) node.querySelector(".pcard")?.remove();
    else if (it) paintPlaneCard(node, it);
  }
  paintPlaneAreas();
  paintPlaneNotes();
  markPlanePicked();
  const back = $("plane-undo");
  if (back) back.disabled = !canUndoPlane();
  paintPlaneGroups();
  paintPlaneWires();
  paintPlaneTook();
  applyPlane();
  paintPlaneMap();
  paintPlaneTop(alive.size);
  const empty = $("plane-empty");
  empty.hidden = alive.size > 0;
  if (!empty.hidden && planeEmptyLook !== raycastOn()) empty.textContent = "";
  if (!empty.hidden && !empty.childElementCount) {
    planeEmptyLook = raycastOn();
    if (planeEmptyLook) paintPlaneEmpty(empty);
    else empty.innerHTML = `<b>${phrase("No worker alive")}</b><span>${phrase("{n} opens a new chat", { n: keyLabel(st.keys.new) })}</span>`;
  }
}

let planeEmptyLook = false;

function paintPlaneEmpty(empty) {
  empty.innerHTML = `<span class="pe-icon"><svg aria-hidden="true"><use href="#i-grid"/></svg></span>`
    + `<b>${phrase("No seat on the field")}</b>`
    + `<span>${phrase("Open a chat and it shows up here. Drag to arrange, or pull an area around several.")}</span>`
    + `<span class="pe-acts"><button type="button" class="pe-new">${phrase("New chat")}<span class="rc-key">${esc(keyLabel(st.keys.new))}</span></button>`
    + `<button type="button" class="pe-back">${phrase("Back to the wall")}<span class="rc-key">esc</span></button></span>`;
  empty.querySelector(".pe-new").addEventListener("click", () => openDraft());
  empty.querySelector(".pe-back").addEventListener("click", () => togglePlane());
}

function paintPlaneTop(seats) {
  let top = $("plane-top");
  const undo = $("plane-undo");
  if (!raycastOn()) {
    if (!top) return;
    top.remove();
    if (undo) undo.textContent = phrase("undo");
    return;
  }
  if (!top) {
    const host = $("plane");
    if (!host) return;
    host.querySelector("#plane-world")?.insertAdjacentHTML("afterend", `<div id="plane-top" data-no-t><span class="pt-name"><svg aria-hidden="true"><use href="#i-grid"/></svg><b id="plane-title"></b><span id="plane-count"></span></span><button id="plane-back" type="button"></button></div>`);
    top = $("plane-top");
    $("plane-back")?.addEventListener("click", () => togglePlane());
  }
  if (!top) return;
  $("plane-title").textContent = phrase("Plane");
  const areas = st.planeAreas.length;
  $("plane-count").textContent = seats
    ? (areas ? phrase("{n} seats in {m} areas", { n: seats, m: areas }) : phrase("{n} seats", { n: seats }))
    : "";
  const back = $("plane-back");
  const html = `<span class="rc-key">esc</span>${phrase("back to the wall")}<span class="rc-key">${esc(keyLabel(st.keys.plane))}</span>`;
  if (back.innerHTML !== html) back.innerHTML = html;
  const undoHtml = `${phrase("undo")}<span class="rc-key">${esc(planeBackKey())}</span>`;
  if (undo && undo.innerHTML !== undoHtml) undo.innerHTML = undoHtml;
}

st.planeFrame = null;

function planePoint(ev) {
  if (!st.planeFrame) st.planeFrame = $("plane").getBoundingClientRect();
  const box = st.planeFrame;
  return { x: (ev.clientX - box.left - st.planeAt.x) / st.planeAt.k, y: (ev.clientY - box.top - st.planeAt.y) / st.planeAt.k };
}

function planeNodeAt(clientX, clientY) {
  const under = document.elementFromPoint(clientX, clientY);
  return under?.closest?.(".pnode") || null;
}

function startNodeDrag(node, ev) {
  const key = node.dataset.key;
  const at = planeSpotOf(key);
  st.planeDrag = { key, node, from: planePoint(ev), was: { x: at.x, y: at.y }, snap: planeSnap(), moved: false, card: !!ev.target.closest(".pcard") };
  node.classList.add("dragging");
}

function moveNodeDrag(ev) {
  const now = planePoint(ev);
  const x = Math.round(st.planeDrag.was.x + (now.x - st.planeDrag.from.x));
  const y = Math.round(st.planeDrag.was.y + (now.y - st.planeDrag.from.y));
  if (Math.hypot(x - st.planeDrag.was.x, y - st.planeDrag.was.y) * st.planeAt.k > PLANE_NUDGE) st.planeDrag.moved = true;
  st.planeSpots[st.planeDrag.key] = { x, y };
  st.planeDrag.node.style.left = `${x}px`;
  st.planeDrag.node.style.top = `${y}px`;
  paintPlaneGroups();
  paintPlaneWires();
}

function endNodeDrag() {
  const { key, node, moved, card, was, snap } = st.planeDrag;
  st.planeDrag = null;
  node.classList.remove("dragging");
  if (moved) {
    st.planeDragged = true;
    rememberPlaneWas(snap);
    savePlaneSpots();
    return;
  }
  st.planeSpots[key] = was;
  node.style.left = `${was.x}px`;
  node.style.top = `${was.y}px`;
  if (card) goTo(key);
}

function startNodeSize(node, ev) {
  const key = node.dataset.key;
  st.planeSize = { key, node, from: planePoint(ev), was: { ...planeSizeOf(key) }, snap: planeSnap() };
  node.classList.add("sizing");
}

function moveNodeSize(ev) {
  const now = planePoint(ev);
  const w = Math.max(NODE_MIN_W, Math.round(st.planeSize.was.w + (now.x - st.planeSize.from.x)));
  const h = Math.max(NODE_MIN_H, Math.round(st.planeSize.was.h + (now.y - st.planeSize.from.y)));
  st.planeSizes[st.planeSize.key] = { w, h };
  st.planeSize.node.style.width = `${w}px`;
  st.planeSize.node.style.height = `${h}px`;
  paintPlaneGroups();
  paintPlaneWires();
}

function endNodeSize() {
  const { key, node, snap } = st.planeSize;
  st.planeSize = null;
  node.classList.remove("sizing");
  st.planeDragged = true;
  rememberPlaneWas(snap);
  savePlaneSizes();
  const e = pool.get(key);
  if (e) requestAnimationFrame(() => refit(e));
}

function startAreaDrag(box, ev, sizing) {
  const thing = planeThingOf(box?.dataset.thing);
  if (!thing) return;
  const carries = !sizing && st.planeAreas.includes(thing);
  st.planeAreaDrag = {
    area: thing, box, sizing: !!sizing, moved: false, snap: planeSnap(),
    from: planePoint(ev),
    was: { x: thing.x, y: thing.y, w: thing.w, h: thing.h },
    riders: carries ? seatsInArea(thing).map((key) => ({ key, was: { ...planeSpotOf(key) } })) : []
  };
  box.classList.add("holding");
}

function moveAreaDrag(ev) {
  const { area, box, was, sizing } = st.planeAreaDrag;
  const now = planePoint(ev);
  const dx = Math.round(now.x - st.planeAreaDrag.from.x);
  const dy = Math.round(now.y - st.planeAreaDrag.from.y);
  if (Math.hypot(dx, dy) * st.planeAt.k > PLANE_NUDGE) st.planeAreaDrag.moved = true;
  if (sizing) {
    const wide = st.planeAreas.includes(area);
    area.w = Math.max(wide ? AREA_MIN_W : NOTE_MIN_W, was.w + dx);
    area.h = Math.max(wide ? AREA_MIN_H : NOTE_MIN_H, was.h + dy);
    box.style.width = `${area.w}px`;
    box.style.height = `${area.h}px`;
  } else {
    area.x = was.x + dx;
    area.y = was.y + dy;
    box.style.left = `${area.x}px`;
    box.style.top = `${area.y}px`;
    for (const rider of st.planeAreaDrag.riders) {
      st.planeSpots[rider.key] = { x: rider.was.x + dx, y: rider.was.y + dy };
      const node = planeNodes.get(rider.key);
      if (!node) continue;
      node.style.left = `${st.planeSpots[rider.key].x}px`;
      node.style.top = `${st.planeSpots[rider.key].y}px`;
    }
  }
  paintPlaneGroups();
  paintPlaneWires();
}

function endAreaDrag() {
  const { area, box, moved, riders, snap } = st.planeAreaDrag;
  st.planeAreaDrag = null;
  box.classList.remove("holding");
  if (!moved) return;
  st.planeDragged = true;
  rememberPlaneWas(snap);
  savePlaneThing(area.id);
  if (riders.length) savePlaneSpots();
}

function startPlaneDraw(ev) {
  const at = planePoint(ev);
  const el = document.createElement("div");
  el.className = "pdraw";
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  el.style.width = "0px";
  el.style.height = "0px";
  $("plane-world").appendChild(el);
  st.planeDraw = { from: at, el };
}

function movePlaneDraw(ev) {
  const now = planePoint(ev);
  const { from, el } = st.planeDraw;
  el.style.left = `${Math.min(now.x, from.x)}px`;
  el.style.top = `${Math.min(now.y, from.y)}px`;
  el.style.width = `${Math.abs(now.x - from.x)}px`;
  el.style.height = `${Math.abs(now.y - from.y)}px`;
}

function endPlaneDraw() {
  const { el } = st.planeDraw;
  const at = {
    x: parseFloat(el.style.left) || 0,
    y: parseFloat(el.style.top) || 0,
    w: parseFloat(el.style.width) || 0,
    h: parseFloat(el.style.height) || 0
  };
  el.remove();
  st.planeDraw = null;
  const kind = st.planeArming;
  armPlane("");
  st.planeDragged = true;
  const scrawl = at.w < NOTE_MIN_W / 2 || at.h < NOTE_MIN_H / 2;
  if (kind === "note") return scrawl ? newPlaneNote() : bornPlaneNote(at);
  if (at.w < AREA_MIN_W / 2 || at.h < AREA_MIN_H / 2) return newPlaneArea();
  bornPlaneArea(at);
}

function startWire(node, ev) {
  const key = node.dataset.key;
  if (itemOf(key)?.kind !== "session") return;
  const at = planeSpotOf(key);
  st.planeWire = { from: key, x1: at.x + NODE_W, y1: at.y + NODE_H / 2, x2: at.x + NODE_W, y2: at.y + NODE_H / 2 };
  node.classList.add("wiring");
  paintPlaneWires();
}

function moveWire(ev) {
  const now = planePoint(ev);
  st.planeWire.x2 = now.x;
  st.planeWire.y2 = now.y;
  const over = planeNodeAt(ev.clientX, ev.clientY);
  for (const node of planeNodes.values()) {
    node.classList.toggle("target", node === over && node.dataset.key !== st.planeWire.from);
  }
  paintPlaneWires();
}

function endWire(ev) {
  const from = st.planeWire.from;
  const over = planeNodeAt(ev.clientX, ev.clientY);
  st.planeWire = null;
  for (const node of planeNodes.values()) node.classList.remove("target", "wiring");
  paintPlaneWires();
  const to = over?.dataset.key;
  if (!to || to === from) return;
  if (itemOf(to)?.kind !== "session") return;
  openLinkMenu(from, to, ev.clientX, ev.clientY);
}

function closeLinkMenu() {
  planeMenu?.remove();
  planeMenu = null;
}

function openLinkMenu(from, to, clientX, clientY) {
  closeLinkMenu();
  const box = $("plane").getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "plink-menu";
  if (raycastOn()) {
    menu.innerHTML = `<b>${esc(from)} ↔ ${esc(to)}</b>` +
      `<textarea rows="3" spellcheck="false" placeholder="${phrase("what are the two of them doing together?")}"></textarea>` +
      `<span class="note">${phrase("what you write reaches both, in the other's name — empty draws the line and says nothing")}</span>` +
      `<div class="row"><button type="button" class="pl-cancel">${phrase("cancel")}<span class="rc-key">esc</span></button>` +
      `<button type="button" class="pl-go">${phrase("put them together")}<span class="rc-key">↵</span></button></div>`;
  } else {
    menu.innerHTML = `<b>${esc(from)} ↔ ${esc(to)}</b>` +
      `<textarea rows="3" spellcheck="false" placeholder="${phrase("what are the two of them doing together?")}"></textarea>` +
      `<div class="row"><span class="note">${phrase("what you write reaches both, in the other's name — empty draws the line and says nothing")}</span>` +
      `<button type="button">${phrase("put them together")}</button></div>`;
  }
  menu.style.left = `${Math.max(8, Math.min(clientX - box.left, box.width - 352))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY - box.top, box.height - 160))}px`;
  const say = menu.querySelector("textarea");
  const go = () => {
    const task = say.value;
    closeLinkMenu();
    planeLink(from, to, task);
  };
  (menu.querySelector(".pl-go") || menu.querySelector("button")).addEventListener("click", go);
  menu.querySelector(".pl-cancel")?.addEventListener("click", () => closeLinkMenu());
  say.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); return go(); }
    if (ev.key === "Escape") { ev.preventDefault(); closeLinkMenu(); }
  });
  $("plane").appendChild(menu);
  planeMenu = menu;
  say.focus();
}

const shortTask = (task) => {
  const one = String(task).replace(/\s+/g, " ").trim();
  return one.length > 42 ? `${one.slice(0, 41)}…` : one;
};

function planeSay(seat, from, text) {
  return fetch("/api/say", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: seat.name, where: seat.where, from, text })
  }).then((x) => x.json()).catch(() => ({ error: "the hive did not answer" }));
}

function planeLink(from, to, task = "") {
  const a = itemOf(from);
  const b = itemOf(to);
  if (!a || !b) return;
  const text = String(task || "").trim();
  if (text) Promise.all([planeSay(b, a.name, text), planeSay(a, b.name, text)]).then(() => pull());
  st.planeLinks = st.planeLinks.filter((l) => !(l.from === from && l.to === to) && !(l.from === to && l.to === from));
  st.planeLinks.push({ from, to, at: Date.now(), task: String(task || "").trim() });
  savePlaneLinks();
  planeTook.set(to, { with: a.name, at: Date.now() });
  planeTook.set(from, { with: b.name, at: Date.now() });
  paintPlaneWires();
  paintPlaneTook();
}

function wirePlane() {
  const host = $("plane");
  if (!host || host.dataset.wired) return;
  host.dataset.wired = "1";

  host.addEventListener("wheel", (ev) => {
    if (ev.target.closest(".well")) return;
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) return zoomPlaneAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0055));
    st.planeAt = { ...st.planeAt, x: st.planeAt.x - ev.deltaX, y: st.planeAt.y - ev.deltaY };
    st.planeAtKnown = true;
    savePlaneAt();
    applyPlane();
  }, { passive: false });

  host.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    if (ev.target.closest(".plink-menu") || ev.target.closest("#plane-hud") || ev.target.closest("#plane-map")) return;
    if (ev.target.closest(".pbar") || ev.target.closest("#plane-said")) return;
    closeLinkMenu();
    hushPlane();
    st.planeFrame = null;
    const writing = document.activeElement;
    const editable = writing?.classList?.contains("pa-name") || writing?.classList?.contains("pn-body");
    if (editable && !ev.target.closest(".pa-name, .pn-body")) writing.blur();
    const node = ev.target.closest(".pnode");
    if (st.planeArming && !node) {
      ev.preventDefault();
      host.setPointerCapture?.(ev.pointerId);
      return startPlaneDraw(ev);
    }
    if (!node) {
      const thingGrip = ev.target.closest(".pa-grip");
      if (thingGrip) {
        ev.preventDefault();
        const held = thingGrip.closest(".parea, .pnote");
        pickPlane(held?.dataset.thing, false);
        markPlanePicked();
        host.setPointerCapture?.(ev.pointerId);
        return startAreaDrag(held, ev, true);
      }
      const held = ev.target.closest(".pa-name, .pn-body");
      if (held && document.activeElement === held) return;
      const thing = ev.target.closest(".parea, .pnote");
      if (thing) {
        ev.preventDefault();
        pickPlane(thing.dataset.thing, ev.shiftKey);
        markPlanePicked();
        host.setPointerCapture?.(ev.pointerId);
        return startAreaDrag(thing, ev, false);
      }
      if (pickPlane("")) markPlanePicked();
      ev.preventDefault();
      st.planePan = { x: ev.clientX, y: ev.clientY };
      host.classList.add("dragging");
      host.setPointerCapture?.(ev.pointerId);
      return;
    }
    if (pickPlane("")) markPlanePicked();
    if (ev.target.closest(".plug")) {
      ev.preventDefault();
      host.setPointerCapture?.(ev.pointerId);
      return startWire(node, ev);
    }
    if (ev.target.closest(".grip")) {
      ev.preventDefault();
      host.setPointerCapture?.(ev.pointerId);
      return startNodeSize(node, ev);
    }
    if (ev.target.closest("button") || ev.target.closest("input") || ev.target.closest(".t-rename")) return;
    if (!ev.target.closest(".t-head") && !ev.target.closest(".pcard")) return;
    ev.preventDefault();
    host.setPointerCapture?.(ev.pointerId);
    startNodeDrag(node, ev);
  });

  let planeMoveQueued = 0;
  let planeMoveLast = null;

  const planeMove = () => {
    planeMoveQueued = 0;
    const ev = planeMoveLast;
    if (st.planeDraw) return movePlaneDraw(ev);
    if (st.planeWire) return moveWire(ev);
    if (st.planeSize) return moveNodeSize(ev);
    if (st.planeAreaDrag) return moveAreaDrag(ev);
    if (st.planeDrag) return moveNodeDrag(ev);
    if (!st.planePan) return;
    st.planeAt = { ...st.planeAt, x: st.planeAt.x + (ev.clientX - st.planePan.x), y: st.planeAt.y + (ev.clientY - st.planePan.y) };
    st.planePan = { x: ev.clientX, y: ev.clientY };
    st.planeAtKnown = true;
    applyPlane();
  };

  host.addEventListener("pointermove", (ev) => {
    planeMoveLast = ev;
    if (!planeMoveQueued) planeMoveQueued = requestAnimationFrame(planeMove);
  });

  const letGo = (ev) => {
    if (planeMoveQueued) {
      cancelAnimationFrame(planeMoveQueued);
      planeMove();
    }
    st.planeFrame = null;
    if (st.planeDraw) return endPlaneDraw();
    if (st.planeWire) return endWire(ev);
    if (st.planeSize) return endNodeSize();
    if (st.planeAreaDrag) return endAreaDrag();
    if (st.planeDrag) return endNodeDrag();
    if (!st.planePan) return;
    st.planePan = null;
    host.classList.remove("dragging");
    savePlaneAt();
  };
  host.addEventListener("pointerup", letGo);
  host.addEventListener("pointercancel", letGo);

  host.addEventListener("dblclick", (ev) => { if (!ev.target.closest(".pnode")) fitPlane(); });
  $("plane-fit").textContent = phrase("fit");
  $("plane-tidy").textContent = phrase("tidy");
  $("plane-area").textContent = phrase("+ area");
  $("plane-note").textContent = phrase("+ note");
  $("plane-map").title = phrase("the whole field — click to look somewhere else");
  $("plane-in").addEventListener("click", () => zoomPlaneBy(1.25));
  $("plane-out").addEventListener("click", () => zoomPlaneBy(0.8));
  $("plane-fit").addEventListener("click", () => fitPlane());
  $("plane-tidy").addEventListener("click", () => { tidyPlane(); render(); fitPlane(); });
  $("plane-undo").textContent = phrase("undo");
  $("plane-undo").addEventListener("click", () => stepPlaneBack(false));
  $("plane-area").addEventListener("click", () => armPlane(st.planeArming === "area" ? "" : "area"));
  $("plane-note").addEventListener("click", () => armPlane(st.planeArming === "note" ? "" : "note"));
  $("plane-map").addEventListener("pointerdown", (ev) => { ev.stopPropagation(); lookFromMap(ev); });
  host.addEventListener("contextmenu", (ev) => {
    if (ev.target.closest(".pnode") || ev.target.closest("#plane-hud") || ev.target.closest("#plane-map")) return;
    ev.preventDefault();
    closeLinkMenu();
    hushPlane();
    const thing = ev.target.closest(".parea, .pnote");
    if (thing) {
      const id = thing.dataset.thing;
      if (!st.planePicked.has(id)) {
        pickPlane(id, false);
        markPlanePicked();
      }
      return paintMenu(planeIsArea(id) ? phrase("this area") : phrase("this note"), planeThingRows(id), ev.clientX, ev.clientY);
    }
    if (pickPlane("")) markPlanePicked();
    paintMenu(phrase("the field"), planeFieldRows(planePoint(ev)), ev.clientX, ev.clientY);
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && st.planeArming) return armPlane("");
    if (!planeShown() || st.typing || planeWriting()) return;
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.code === "KeyZ") {
      ev.preventDefault();
      return void stepPlaneBack(ev.shiftKey);
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape") {
      if (pickPlane("")) return markPlanePicked();
      if (!raycastOn() || planeMenu || st.open || st.fieldPane || $("confirm")?.classList.contains("on")) return;
      ev.preventDefault();
      ev.stopPropagation();
      return togglePlane();
    }
    if (raycastOn() && ev.key === "Enter" && st.planePicked.size === 1 && !ev.shiftKey && !ev.target.closest?.("textarea, input, [contenteditable]")) {
      ev.preventDefault();
      ev.stopPropagation();
      return void writePlaneThing([...st.planePicked][0]);
    }
    if (ev.key !== "Backspace" && ev.key !== "Delete") return;
    if (!st.planePicked.size) return;
    ev.preventDefault();
    dropPlanePicked(st.planePicked);
  }, true);
  $("btn-plane").addEventListener("click", () => togglePlane());
  $("btn-plane-top").addEventListener("click", () => togglePlane());

  window.addEventListener("click", (ev) => {
    if (!st.planeDragged) return;
    st.planeDragged = false;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);
}

export { AREA_BORN_H, AREA_BORN_W, AREA_MIN_H, AREA_MIN_W, FIELD_PANE_H, FIELD_PANE_W, LINK_TAG, NODE_H, NODE_MIN_H, NODE_MIN_W, NODE_W, NOTE_BORN_H, NOTE_BORN_W, NOTE_MIN_H, NOTE_MIN_W, PLANE_AREAS_KEY, PLANE_AT_KEY, PLANE_BAR_SHUT, PLANE_CARD_AT, PLANE_COLS, PLANE_GAP, PLANE_GROUP_GAP, PLANE_GROUP_PAD, PLANE_KEY, PLANE_LINKS_KEY, PLANE_LINK_TTL, PLANE_MAX, PLANE_MIN, PLANE_NOTES_KEY, PLANE_NUDGE, PLANE_PILL_AT, PLANE_SAID_MS, PLANE_SIZES_KEY, PLANE_SPOTS_KEY, PLANE_TINTS, PLANE_TOOK_MS, PLANE_UNDO_CAP, SVG_NS, applyPlane, armPlane, bootPlane, bornPlaneArea, bornPlaneNote, canUndoPlane, closeLinkMenu, copyPlaneThing, dropFieldPane, dropPlanePicked, dropPlaneThings, endAreaDrag, endNodeDrag, endNodeSize, endPlaneDraw, endWire, fitPlane, glidePlane, growFieldPane, hushPlane, lookFromMap, markPlanePicked, moveAreaDrag, moveNodeDrag, moveNodeSize, movePlaneDraw, moveWire, newPlaneArea, newPlaneNote, openLinkMenu, paintPlane, paintPlaneAreas, paintPlaneBar, paintPlaneCard, paintPlaneGroups, paintPlaneMap, paintPlaneMarks, paintPlaneNotes, paintPlaneTook, paintPlaneWires, paneOnField, paneShownFor, pickPlane, planeAreaEls, planeBackKey, planeBarSolid, planeBarViewModel, planeBounds, planeBoxOf, planeCamera, planeCardMount, planeCardSolids, planeCardViewModel, planeClashes, planeDensity, planeErrandOf, planeFieldRows, planeFlocks, planeFreeSpot, planeGroupEls, planeId, planeIsArea, planeKin, planeLink, planeMapSolid, planeMapViewModel, planeMarkEls, planeMenu, planeNodeAt, planeNodes, planeNoteEls, planePoint, planeSaidClock, planeSay, planeSeatKeys, planeSeen, planeSeq, planeShown, planeSizeOf, planeSlot, planeSnap, planeSpotOf, planeThingOf, planeThingRows, planeTint, planeTook, planeWireEls, planeWirePath, planeWriting, planeZoom, readPlaneAreas, readPlaneLinks, readPlaneNotes, readPlaneSizes, readPlaneSpots, redoPlane, rememberPlane, rememberPlaneWas, savePlaneAreas, savePlaneAt, savePlaneLinks, savePlaneNotes, savePlaneSizes, savePlaneSpots, savePlaneThing, sayOnPlane, seatsInArea, shortTask, startAreaDrag, startNodeDrag, startNodeSize, startPlaneDraw, startWire, stepPlaneBack, takeFieldPane, tidyPlane, tintPlaneNote, togglePlane, undoPlane, wearPlane, wireOn, wirePlane, writePlaneThing, zoomPlaneAt, zoomPlaneBy };

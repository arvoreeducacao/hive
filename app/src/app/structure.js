import { STRUCTURES, STRUCTURE_DEFAULT, STRUCTURE_IDS, structureOf } from "../structures/index.js";
import { render } from "./arrange.js";
import { activeItems, itemOf, soloSeat } from "./blocks.js";
import { saveConfig } from "./brand-face.js";
import { $, IS_MAC, LABEL, ORDER, esc, phrase, raycastOn, st, stateColor, svgIcon } from "./core.js";
import { closeTile, goTo, openTile } from "./focus-navigation.js";
import { hudUndo } from "./hud.js";
import { keyHint, pool, tiles } from "./leader-key.js";
import { planeShown } from "./plane.js";
import { refit } from "./terminal-history.js";

const STRUCTURE_KEY = "hive.structure";

const NO_CLAIMS = new Map();

const UNRANKED = Object.keys(ORDER).length;

st.structure = STRUCTURE_DEFAULT;

let worn = null;

let ctx = null;

let painting = null;

let listening = [];

const broken = new Set();

const suspended = () => !!soloSeat || !!st.mirrorDev;

const effective = () => (raycastOn() ? st.structure : STRUCTURE_DEFAULT);

const STRUCTURE_KEY_SAID = IS_MAC ? "⌥⌘S" : "ctrl+alt+S";

function fromHtml(html) {
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  return holder.content.firstElementChild;
}

function mountStructureDom() {
  if (!raycastOn()) {
    for (const id of ["structure-root", "structure-note", "btn-structure", "structure-pick"]) $(id)?.remove();
    return;
  }
  const canvas = $("canvas");
  if (!$("structure-root") && canvas) canvas.after(fromHtml('<div id="structure-root" data-no-t hidden></div>'));
  const plane = $("btn-plane-top");
  if (!$("structure-note") && plane) plane.before(fromHtml('<span id="structure-note" role="status" data-no-t hidden></span>'));
  const help = $("btn-help");
  if (!$("btn-structure") && help) {
    const button = fromHtml(`<button type="button" class="ghost" id="btn-structure" data-no-t title="${esc(phrase("the next structure — the shape of the whole screen"))}">${esc(phrase("structure"))}<b id="structure-now"></b> <kbd id="k-structure">${esc(STRUCTURE_KEY_SAID)}</kbd></button>`);
    button.addEventListener("click", () => stepStructure(1));
    help.before(button);
  }
  const look = $("f-look")?.closest("div");
  if (!$("structure-pick") && look) {
    const pick = fromHtml(`<div id="structure-pick" data-no-t><label>${esc(phrase("structure"))}</label><p class="hint">${esc(phrase("The shape of the whole screen. The chats, the focus and what you were typing stay where they are when it changes."))}</p><div id="f-structure" class="sx-list" role="radiogroup" aria-label="${esc(phrase("structure"))}"></div></div>`);
    pick.querySelector("#f-structure").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-structure]");
      if (choice) setStructure(choice.dataset.structure);
    });
    look.after(pick);
  }
}

const fieldHasFocus = () => {
  const el = document.activeElement;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

const rankOf = (seat) => ORDER[seat.state] ?? UNRANKED;

function structureSeats() {
  const seats = [];
  st.blocks.forEach((b, block) => b.keys.forEach((key, at) => {
    const it = itemOf(key);
    if (it) seats.push({ ...it, key, block, at, space: b.ws || st.space, here: block === st.block });
  }));
  return seats.sort((a, b) => rankOf(a) - rankOf(b) || a.block - b.block || a.at - b.at);
}

const focusedKey = () => st.open || activeItems()[st.focus]?.key || null;

function contextFor(def) {
  return {
    id: def.id,
    root: $("structure-root"),
    seats: structureSeats,
    focused: focusedKey,
    focusSeat: (name) => goTo(name),
    openSeat: (name) => openTile(name),
    closeSeat: () => closeTile(),
    place: (key, host) => { if (painting && key && host) painting.set(key, host); },
    tile: (key) => tiles.get(key) || null,
    render: () => render({ animate: false }),
    listen: (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      listening.push(() => target.removeEventListener(type, fn, options));
    },
    onPlane: () => planeShown(),
    inField: () => fieldHasFocus() || !!st.typing,
    label: (state) => phrase(LABEL[state] || state),
    color: (state) => stateColor(state) || "var(--txt-3)",
    keyHint: (action) => keyHint(action),
    phrase,
    esc,
    svgIcon
  };
}

function wantedStructure() {
  const def = structureOf(effective());
  return def.module?.ready && !broken.has(def.id) && !suspended() ? def : null;
}

function giveUp(def, err) {
  console.warn(`the ${def.id} structure failed — the classic stands in`, err);
  broken.add(def.id);
  leaveWorn();
}

function enterStructure(def) {
  worn = def;
  ctx = contextFor(def);
  mountStructureDom();
  const root = $("structure-root");
  root.replaceChildren();
  root.hidden = false;
  try { def.module.enter?.(ctx); }
  catch (err) { giveUp(def, err); }
}

function leaveWorn() {
  const was = worn;
  if (!was) return;
  worn = null;
  try { was.module.leave?.(ctx); }
  catch (err) { console.warn(`the ${was.id} structure could not leave cleanly`, err); }
  for (const off of listening.splice(0)) off();
  ctx = null;
  const root = $("structure-root");
  if (!root) return;
  root.replaceChildren();
  root.className = "";
  root.removeAttribute("style");
  root.hidden = true;
}

function paintStructureFrame() {
  if (!raycastOn()) {
    delete document.body.dataset.structure;
    return;
  }
  const def = structureOf(st.structure);
  document.body.dataset.structure = worn ? worn.id : STRUCTURE_DEFAULT;
  const root = $("structure-root");
  if (root) root.hidden = !worn;
  const note = $("structure-note");
  if (!note) return;
  const waiting = def.id !== STRUCTURE_DEFAULT && !worn && !suspended();
  note.hidden = !waiting;
  if (!waiting) return;
  const name = phrase(def.name);
  note.textContent = phrase(broken.has(def.id) ? "{name} · could not start" : "{name} · being built", { name });
  note.title = broken.has(def.id)
    ? phrase("{name} could not start — the classic stands in", { name })
    : phrase("{name} is still being built — the classic stands in meanwhile", { name });
}

function settleStructure() {
  const next = wantedStructure();
  if (next !== worn) {
    leaveWorn();
    if (next) enterStructure(next);
  }
  paintStructureFrame();
}

function paintStructure() {
  if (!worn && effective() === STRUCTURE_DEFAULT) return NO_CLAIMS;
  settleStructure();
  if (!worn) return NO_CLAIMS;
  const def = worn;
  painting = new Map();
  try { def.module.paint?.(ctx); }
  catch (err) {
    painting = null;
    giveUp(def, err);
    paintStructureFrame();
    return NO_CLAIMS;
  }
  const placed = painting;
  painting = null;
  return placed;
}

function setStructure(id, { quiet = false, said = true } = {}) {
  const was = st.structure;
  const next = STRUCTURE_IDS.includes(id) ? id : STRUCTURE_DEFAULT;
  const held = document.activeElement;
  st.structure = next;
  try { localStorage.setItem(STRUCTURE_KEY, next); } catch {}
  if (!raycastOn()) return;
  settleStructure();
  paintStructureChoices();
  if (st.seatsKnown) render({ animate: false });
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
  if (held && held !== document.body && held.isConnected && document.activeElement !== held) held.focus({ preventScroll: true });
  if (quiet) return;
  saveConfig({ structure: next }).catch(() => {});
  if (!said || next === was) return;
  hudUndo({
    icon: "i-grid",
    text: phrase("Structure: {name}", { name: phrase(structureOf(next).name) }),
    run: () => setStructure(was, { said: false })
  });
}

function stepStructure(d) {
  const n = STRUCTURE_IDS.length;
  const at = Math.max(0, STRUCTURE_IDS.indexOf(st.structure));
  setStructure(STRUCTURE_IDS[(at + d + n) % n]);
}

function bootStructure() {
  let saved = "";
  try { saved = localStorage.getItem(STRUCTURE_KEY) || ""; } catch {}
  setStructure(saved, { quiet: true });
}

function adoptStructure(r) {
  if (!r.has?.structure) return;
  const wanted = r.config.structure || STRUCTURE_DEFAULT;
  if (wanted !== st.structure) setStructure(wanted, { quiet: true });
}

function structureChoicesHtml() {
  if (!raycastOn()) return "";
  return STRUCTURES.map((def) => {
    const on = def.id === st.structure;
    const soon = def.module && !def.module.ready;
    return `<button type="button" class="sx-opt" role="radio" aria-checked="${on}" data-structure="${esc(def.id)}">
      <span class="sx-name">${esc(phrase(def.name))}${soon ? `<em>${esc(phrase("being built"))}</em>` : ""}</span>
      <span class="sx-says">${esc(phrase(def.says))}</span></button>`;
  }).join("");
}

function paintStructureChoices() {
  const list = $("f-structure");
  if (list) {
    const html = structureChoicesHtml();
    if (list.dataset.h !== html) { list.innerHTML = html; list.dataset.h = html; }
  }
  const now = $("structure-now");
  if (now) now.textContent = phrase(structureOf(st.structure).name);
}

function structurePaletteRows() {
  if (!raycastOn()) return [];
  return STRUCTURES.map((def) => ({
    id: `structure:${def.id}`,
    icon: "i-grid",
    name: phrase("Structure: {name}", { name: phrase(def.name) }),
    on: def.id === st.structure,
    ctx: phrase(def.says),
    search: `structure estrutura layout ${def.id}`,
    go: () => setStructure(def.id)
  }));
}

window.addEventListener("keydown", (event) => {
  if (!worn?.module.keydown) return;
  let took = false;
  try { took = worn.module.keydown(event, ctx) === true; }
  catch (err) { console.warn(`the ${worn.id} structure stumbled on a key`, err); }
  if (!took) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

window.addEventListener("keydown", (event) => {
  if (!raycastOn() || event.code !== "KeyS" || !event.altKey) return;
  const held = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!held) return;
  event.preventDefault();
  event.stopPropagation();
  stepStructure(event.shiftKey ? -1 : 1);
}, true);

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  if (raycastOn()) mountStructureDom();
  settleStructure();
  if (!raycastOn()) mountStructureDom();
  paintStructureChoices();
  if (st.seatsKnown) render({ animate: false });
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
});

mountStructureDom();

const structureWorn = () => worn?.id || STRUCTURE_DEFAULT;

export { NO_CLAIMS, STRUCTURE_KEY, adoptStructure, bootStructure, paintStructure, paintStructureChoices, setStructure, stepStructure, structurePaletteRows, structureSeats, structureWorn };

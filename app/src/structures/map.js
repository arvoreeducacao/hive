import { keyLabel, whichAction } from "../app/brand-face.js";
import { $, IS_MAC, st } from "../app/core.js";
import { tiles } from "../app/leader-key.js";
import {
  NODE_H, NODE_W, PLANE_CARD_AT, PLANE_GAP, PLANE_GROUP_PAD, PLANE_KEY, applyPlane, closeLinkMenu, dropFieldPane, fitPlane,
  glidePlane, paintPlaneCard, paintPlaneMap, planeBoxOf, planeKin, planeMenu, planeNodes, planeSizeOf, rememberPlane, savePlaneAt,
  savePlaneSpots
} from "../app/plane.js";

const MAP_WAS_KEY = "hive.map.was";

const MAP_BLOCK_COLS = 2;

const MAP_BLOCKS_PER_ROW = 3;

const MAP_BLOCK_GAP = 96;

const MAP_READ_PAD = 64;

const MAP_READ_MAX = 1;

const MAP_TOUCH_MS = 900;

let was = null;

let live = null;

let followed;

let touched = 0;

let ring = null;

let settled = false;

let closeIn = false;

const areaEls = new Map();

const callKey = () => (IS_MAC ? { meta: true, code: "KeyJ" } : { ctrl: true, code: "KeyJ" });

const isCallKey = (event) => event.code === "KeyJ" && !event.altKey && !event.shiftKey && (IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

function blockLayout(groups, sizeOf = () => ({ w: NODE_W, h: NODE_H })) {
  const spots = {};
  let x = 0;
  let y = 0;
  let tallest = 0;
  let inRow = 0;
  for (const keys of groups) {
    if (!keys.length) continue;
    const cols = Math.min(MAP_BLOCK_COLS, keys.length);
    const cellW = Math.max(...keys.map((key) => sizeOf(key).w));
    const cellH = Math.max(...keys.map((key) => sizeOf(key).h));
    keys.forEach((key, i) => {
      spots[key] = { x: x + (i % cols) * (cellW + PLANE_GAP), y: y + Math.floor(i / cols) * (cellH + PLANE_GAP) };
    });
    const w = cols * (cellW + PLANE_GAP) - PLANE_GAP;
    tallest = Math.max(tallest, Math.ceil(keys.length / cols) * (cellH + PLANE_GAP) - PLANE_GAP);
    inRow += 1;
    if (inRow < MAP_BLOCKS_PER_ROW) { x += w + MAP_BLOCK_GAP; continue; }
    x = 0;
    y += tallest + MAP_BLOCK_GAP;
    tallest = 0;
    inRow = 0;
  }
  return spots;
}

function boxAround(boxes, pad = 0) {
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y1 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y2 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function blocksTangled(groups, spots, sizeOf = () => ({ w: NODE_W, h: NODE_H })) {
  const boxes = [];
  for (const keys of groups) {
    if (!keys.length) continue;
    if (keys.some((key) => !spots[key])) return true;
    boxes.push(boxAround(keys.map((key) => ({ ...spots[key], ...sizeOf(key) }))));
  }
  return boxes.some((a, i) => boxes.slice(i + 1).some((b) => overlaps(a, b)));
}

function cameraOn(box, width, height) {
  const fit = Math.min((width - MAP_READ_PAD * 2) / box.w, (height - MAP_READ_PAD * 2) / box.h);
  const k = Math.max(PLANE_CARD_AT, Math.min(MAP_READ_MAX, fit));
  return { k, x: Math.round((width - box.w * k) / 2 - box.x * k), y: Math.round((height - box.h * k) / 2 - box.y * k) };
}

function seenWhole(box, at, width, height) {
  if (at.k < PLANE_CARD_AT) return false;
  const x = box.x * at.k + at.x;
  const y = box.y * at.k + at.y;
  return x >= 0 && y >= 0 && x + box.w * at.k <= width && y + box.h * at.k <= height;
}

function neighboursOf(key, pairs, seated) {
  const out = [];
  for (const one of pairs) {
    const other = one.from === key ? one.to : one.to === key ? one.from : "";
    if (other && other !== key && seated.has(other) && !out.includes(other)) out.push(other);
  }
  return out;
}

function stepRing(held, key, neighbours, d) {
  const list = held && held.includes(key) ? held : [key, ...neighbours];
  if (list.length < 2) return { list, next: "" };
  const at = list.indexOf(key);
  return { list, next: list[(at + d + list.length) % list.length] };
}

function blockGroups(seats) {
  const by = new Map();
  for (const seat of seats) {
    if (!by.has(seat.block)) by.set(seat.block, []);
    by.get(seat.block).push(seat);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0])
    .map(([block, all]) => ({ block, keys: all.sort((a, b) => a.at - b.at).map((seat) => seat.key), seats: all }));
}

function mapCallViewModel(seats, focused, phrase) {
  const calling = seats.filter((seat) => seat.state === "needs");
  if (!calling.length) return { on: false, key: "", name: "", more: "", here: false };
  const first = calling.find((seat) => seat.key !== focused) || calling[0];
  return {
    on: true,
    key: first.key,
    name: first.title || first.name || first.key,
    more: calling.length > 1 ? `+${calling.length - 1}` : "",
    here: first.key === focused && calling.length === 1,
    says: phrase("needs you")
  };
}

function mapAreaViewModel(group, label, phrase) {
  const waiting = group.seats.filter((seat) => seat.state === "needs").length;
  const total = group.seats.length;
  return {
    label,
    sub: waiting ? phrase("{n} of {total} waiting on you", { n: waiting, total }) : total === 1 ? phrase("1 seat") : phrase("{n} seats", { n: total }),
    needs: waiting > 0
  };
}

function blockLabel(block, phrase) {
  const b = st.blocks[block];
  if (b?.label) return b.label;
  const mine = st.blocks.filter((one) => one.ws === b?.ws);
  return phrase("block {n}", { n: mine.indexOf(b) + 1 });
}

function readWas() {
  try {
    const held = JSON.parse(localStorage.getItem(MAP_WAS_KEY) || "null");
    return held && typeof held === "object" ? held : null;
  } catch { return null; }
}

function keepWas() { try { localStorage.setItem(MAP_WAS_KEY, JSON.stringify(was)); } catch {} }

function forgetWas() { try { localStorage.removeItem(MAP_WAS_KEY); } catch {} }

function storedPlane() { try { return localStorage.getItem(PLANE_KEY); } catch { return null; } }

function restorePlaneKey(value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PLANE_KEY);
    else localStorage.setItem(PLANE_KEY, value);
  } catch {}
}

function holdHeads() {
  for (const el of tiles.values()) {
    const head = el.querySelector(".t-head");
    if (head) head.draggable = !st.planeOn;
  }
}

function holdPlane() {
  if (st.planeOn) return false;
  st.planeOn = true;
  restorePlaneKey(was?.stored);
  holdHeads();
  return true;
}

function arrangeByBlock(ctx) {
  const groups = blockGroups(ctx.seats()).map((one) => one.keys);
  if (!blocksTangled(groups, st.planeSpots || {}, planeSizeOf)) return false;
  if (!was.spots) was.spots = { ...(st.planeSpots || {}) };
  rememberPlane();
  st.planeSpots = blockLayout(groups, planeSizeOf);
  savePlaneSpots();
  return true;
}

function planeSize() {
  const host = $("plane");
  return { width: host?.clientWidth || 0, height: host?.clientHeight || 0 };
}

function fly(key, { force = false } = {}) {
  const { width, height } = planeSize();
  if (!key || !width || !height) return false;
  const box = planeBoxOf(key);
  if (!force && seenWhole(box, st.planeAt, width, height)) return false;
  st.planeAt = cameraOn(box, width, height);
  st.planeAtKnown = true;
  savePlaneAt();
  glidePlane();
  applyPlane();
  live?.root.classList.add("reading");
  return true;
}

function fleet() {
  live?.root.classList.remove("reading");
  closeLinkMenu();
  fitPlane();
  paintPlaneMap();
}

function speakTo(ctx, key) {
  ring = null;
  touched = Date.now();
  closeIn = true;
  if (ctx.focused() === key) {
    closeIn = false;
    fly(key, { force: true });
    paintPlaneMap();
  } else ctx.focusSeat(key);
  requestAnimationFrame(() => ctx.tile(key)?.querySelector(".sv-well textarea")?.focus({ preventScroll: true }));
}

function callNext(ctx) {
  const said = mapCallViewModel(ctx.seats(), ctx.focused(), ctx.phrase);
  if (!said.on) return false;
  speakTo(ctx, said.key);
  return true;
}

function planeBusy() {
  return !!(st.planePicked?.size || planeMenu || st.open || st.fieldPane || st.planeArming || $("confirm")?.classList.contains("on"));
}

function stepNeighbour(ctx, d) {
  const key = ctx.focused();
  if (!key) return false;
  const seated = new Set(ctx.seats().map((seat) => seat.key));
  const pairs = [...(st.planeLinks || []), ...planeKin()];
  const step = stepRing(ring, key, neighboursOf(key, pairs, seated), d);
  if (!step.next) return false;
  ring = step.list;
  touched = Date.now();
  ctx.focusSeat(step.next);
  return true;
}

function paintCall(ctx) {
  const box = live?.call;
  if (!box) return;
  paintWords(ctx);
  const said = mapCallViewModel(ctx.seats(), ctx.focused(), ctx.phrase);
  box.hidden = !said.on || !ctx.onPlane();
  if (box.hidden) return;
  box.classList.toggle("here", said.here);
  box.dataset.key = said.key;
  const name = box.querySelector(".mp-name");
  if (name.textContent !== said.name) name.textContent = said.name;
  const says = box.querySelector(".mp-says");
  if (says.textContent !== said.says) says.textContent = said.says;
  const more = box.querySelector(".mp-more");
  more.hidden = !said.more;
  if (more.textContent !== said.more) more.textContent = said.more;
}

function paintAreas(ctx) {
  const world = $("plane-world");
  if (!world) return;
  const kept = new Set();
  for (const group of blockGroups(ctx.seats())) {
    const placed = group.keys.filter((key) => st.planeSpots?.[key]);
    const box = boxAround(placed.map((key) => planeBoxOf(key)), PLANE_GROUP_PAD);
    if (!box) continue;
    const id = st.blocks[group.block]?.id || String(group.block);
    kept.add(id);
    let el = areaEls.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "mp-area";
      el.innerHTML = "<b></b><i></i>";
      areaEls.set(id, el);
      world.insertBefore(el, world.firstChild);
    }
    const said = mapAreaViewModel(group, blockLabel(group.block, ctx.phrase), ctx.phrase);
    const style = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    if (el.dataset.at !== style) { el.style.cssText = style; el.dataset.at = style; }
    el.classList.toggle("needs", said.needs);
    el.classList.toggle("here", group.block === st.block);
    const [b, i] = el.children;
    if (b.textContent !== said.label) b.textContent = said.label;
    if (i.textContent !== said.sub) i.textContent = said.sub;
  }
  for (const [id, el] of areaEls) {
    if (kept.has(id)) continue;
    el.remove();
    areaEls.delete(id);
  }
}

function dropAreas() {
  for (const el of areaEls.values()) el.remove();
  areaEls.clear();
}

function buildRoot(ctx) {
  ctx.root.innerHTML = `<button type="button" class="mp-call" hidden><span class="mp-dot" aria-hidden="true"></span>`
    + `<b class="mp-name"></b><span class="mp-says"></span><span class="mp-more" hidden></span><span class="mp-go"></span></button>`
    + `<div class="mp-hint" aria-hidden="true"></div>`;
  const call = ctx.root.querySelector(".mp-call");
  call.addEventListener("click", () => { if (call.dataset.key) speakTo(ctx, call.dataset.key); });
  return { root: ctx.root, call, hint: ctx.root.querySelector(".mp-hint"), words: "", unwatch: watchZoom() };
}

function watchZoom() {
  const world = $("plane-world");
  const plane = $("plane");
  if (!world || !plane) return () => {};
  const keep = () => plane.style.setProperty("--mp-inv", String(1 / (st.planeAt?.k || 1)));
  keep();
  const seen = new MutationObserver(keep);
  seen.observe(world, { attributes: true, attributeFilter: ["style"] });
  return () => {
    seen.disconnect();
    plane.style.removeProperty("--mp-inv");
  };
}

function faceLiveNodes(ctx) {
  if (!live || !ctx.onPlane()) return;
  const byKey = new Map(ctx.seats().map((seat) => [seat.key, seat]));
  for (const [key, node] of planeNodes) {
    const it = node.classList.contains("live") && byKey.get(key);
    if (it) paintPlaneCard(node, it);
  }
}

function paintWords(ctx) {
  const { phrase, esc } = ctx;
  const words = [phrase("go"), phrase("next neighbour"), phrase("back to the fleet"), keyLabel(callKey())].join("|");
  if (live.words === words) return;
  live.words = words;
  live.call.title = phrase("fly to the seat that needs you");
  live.call.querySelector(".mp-go").innerHTML = `${esc(phrase("go"))}<span class="rc-key">${esc(keyLabel(callKey()))}</span>`;
  live.hint.innerHTML = `<span class="rc-key">Tab</span>${esc(phrase("next neighbour"))}<span class="rc-key">esc</span>${esc(phrase("back to the fleet"))}`;
}

function wire(ctx) {
  const mark = () => { touched = Date.now(); };
  ctx.listen(window, "pointerdown", mark, true);
  ctx.listen(window, "keydown", mark, true);
  ctx.listen(window, "click", (event) => {
    if (!event.target.closest?.("#btn-plane, #btn-plane-top, #plane-back, #plane-tidy")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.target.closest("#plane-tidy")) {
      if (was) was.spots = was.spots || { ...(st.planeSpots || {}) };
      keepWas();
      rememberPlane();
      st.planeSpots = blockLayout(blockGroups(ctx.seats()).map((one) => one.keys), planeSizeOf);
      savePlaneSpots();
      ctx.render();
    }
    fleet();
  }, true);
  const plane = $("plane");
  if (!plane) return;
  ctx.listen(plane, "dblclick", (event) => {
    const node = event.target.closest(".pnode");
    if (!node || event.target.closest(".well, textarea, input, button")) return;
    speakTo(ctx, node.dataset.key);
  });
  ctx.listen(plane, "pointermove", () => { if (st.planeDrag || st.planeSize) paintAreas(ctx); });
  ctx.listen(plane, "pointerup", () => requestAnimationFrame(() => { if (live) paintAreas(ctx); }));
}

const map = {
  id: "map",
  ready: true,
  enter(ctx) {
    was = readWas() || { on: !!st.planeOn, stored: storedPlane(), at: st.planeAt ? { ...st.planeAt } : null, known: !!st.planeAtKnown, spots: null };
    keepWas();
    live = buildRoot(ctx);
    followed = undefined;
    ring = null;
    settled = false;
    wire(ctx);
    const turned = holdPlane();
    requestAnimationFrame(() => {
      if (!live) return;
      if (turned) ctx.render();
      fitPlane(true);
      paintPlaneMap();
    });
  },
  leave() {
    live?.unwatch();
    dropAreas();
    live = null;
    settled = false;
    ring = null;
    followed = undefined;
    const held = was;
    was = null;
    forgetWas();
    if (!held) return;
    if (held.spots) { st.planeSpots = held.spots; savePlaneSpots(); }
    if (held.at) { st.planeAt = held.at; st.planeAtKnown = held.known; savePlaneAt(); }
    if (!held.on) {
      st.planeOn = false;
      dropFieldPane();
      closeLinkMenu();
      holdHeads();
    }
    restorePlaneKey(held.stored);
  },
  paint(ctx) {
    if (!live) return;
    if (holdPlane()) requestAnimationFrame(() => { if (live) { ctx.render(); fleet(); } });
    if (!settled && ctx.seats().length) {
      settled = true;
      arrangeByBlock(ctx);
      keepWas();
      requestAnimationFrame(() => { if (live) fleet(); });
    }
    const now = ctx.focused();
    if (now !== followed) {
      const before = followed;
      followed = now;
      if (ring && !ring.includes(now)) ring = null;
      if (before !== undefined && now && ctx.onPlane() && Date.now() - touched < MAP_TOUCH_MS) fly(now, { force: closeIn });
    }
    closeIn = false;
    paintCall(ctx);
    if (!ctx.onPlane()) return;
    paintAreas(ctx);
    queueMicrotask(() => faceLiveNodes(ctx));
  },
  keydown(event, ctx) {
    if (!live || !ctx.onPlane()) return false;
    if (isCallKey(event)) return callNext(ctx);
    const hit = whichAction(event);
    if (hit?.action === "plane") { fleet(); return true; }
    if (hit?.action === "calls") return callNext(ctx);
    if (ctx.inField() || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === "Escape") {
      if (planeBusy()) return false;
      fleet();
      return true;
    }
    if (event.key === "Tab") return stepNeighbour(ctx, event.shiftKey ? -1 : 1);
    return false;
  }
};

export { MAP_WAS_KEY, blockGroups, blockLayout, blocksTangled, boxAround, cameraOn, map, mapAreaViewModel, mapCallViewModel, neighboursOf, seenWhole, stepRing };

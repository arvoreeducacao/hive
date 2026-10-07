import { $, phrase } from "./core.js";
import { behaviorOn } from "./experience.js";
import { releaseKeyboard } from "./focus-navigation.js";

const peekCache = new Map();

function peekSrc(path, where, name) {
  const key = `${where}|${name}|${path}`;
  if (!peekCache.has(key)) {
    peekCache.set(key, fetch(`/api/image?${new URLSearchParams({ path, where, name: name || "" })}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null));
  }
  return peekCache.get(key);
}

let peekSeq = 0;

function placePeek(box, x, y) {
  const r = box.getBoundingClientRect();
  const left = Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8));
  let top = y - r.height - 16;
  if (top < 8) top = Math.min(y + 24, innerHeight - r.height - 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

function showPeek(ev, path, where, name) {
  const tag = ++peekSeq;
  const x = ev.clientX;
  const y = ev.clientY;
  peekSrc(path, where, name).then((src) => {
    if (tag !== peekSeq || !src) return;
    const box = $("peek");
    const img = box.querySelector("img");
    img.onload = () => { if (tag === peekSeq) placePeek(box, x, y); };
    img.src = src;
    box.classList.add("on");
    placePeek(box, x, y);
  });
}

function hidePeek() {
  peekSeq++;
  $("peek").classList.remove("on");
}

let shotUrl = "";
let shotSeq = 0;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;
const ZOOM_CLOSE_UP = ZOOM_STEP ** 3;
const ZOOM_WHEEL = 1.1;
const ZOOM_GUTTER = 32;
let zoom = 1;
let fitting = true;

const zoomButton = (kind) => $("shot-tools").querySelector(`[data-zoom="${kind}"]`);

function shotZooms() { return $("shot-floor").classList.contains("zoomable"); }

function fittedZoom() {
  const floor = $("shot-floor");
  const img = $("shot-img");
  return Math.max(Number.EPSILON, Math.min(1, (floor.clientWidth - ZOOM_GUTTER) / img.naturalWidth, (floor.clientHeight - ZOOM_GUTTER) / img.naturalHeight));
}

function applyZoom(value) {
  const img = $("shot-img");
  const minimum = Math.min(ZOOM_MIN, fittedZoom());
  zoom = Math.max(minimum, Math.min(ZOOM_MAX, value));
  img.style.width = `${img.naturalWidth * zoom}px`;
  img.style.height = `${img.naturalHeight * zoom}px`;
  img.dataset.enlarged = String(zoom > 1);
  $("shot-pct").textContent = `${Math.round(zoom * 100)}%`;
  zoomButton("out").disabled = zoom <= minimum;
  zoomButton("in").disabled = zoom >= ZOOM_MAX;
}

function fitShot() {
  const floor = $("shot-floor");
  const img = $("shot-img");
  if (!img.naturalWidth) return;
  fitting = true;
  applyZoom(fittedZoom());
  floor.scrollTo(0, 0);
}

function zoomShot(value, x, y) {
  const floor = $("shot-floor");
  const img = $("shot-img");
  if (!img.naturalWidth) return;
  const across = x ?? (floor.scrollLeft + floor.clientWidth / 2 - img.offsetLeft) / (img.offsetWidth || 1);
  const down = y ?? (floor.scrollTop + floor.clientHeight / 2 - img.offsetTop) / (img.offsetHeight || 1);
  fitting = false;
  applyZoom(value);
  floor.scrollTo(img.offsetLeft + across * img.offsetWidth - floor.clientWidth / 2, img.offsetTop + down * img.offsetHeight - floor.clientHeight / 2);
}

function toggleShotZoom(x = 0.5, y = 0.5) {
  if (!shotZooms()) return $("shot-floor").classList.toggle("full");
  if (zoom > 1) return fitShot();
  return zoomShot(ZOOM_CLOSE_UP, x, y);
}

function stepShotZoom(direction) {
  if (!shotZooms()) return false;
  zoomShot(direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
  return true;
}

function shotOnScreen() { return $("shot").classList.contains("on"); }

function closeShot() {
  shotSeq++;
  $("shot-img").onload = null;
  $("shot").classList.remove("on");
  $("shot-img").removeAttribute("src");
  $("shot-img").style.removeProperty("width");
  $("shot-img").style.removeProperty("height");
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  shotUrl = "";
}

async function openShot(path, where, name) {
  const tag = ++shotSeq;
  const img = $("shot-img");
  const note = $("shot-note");
  const say = $("shot-say");
  const machine = where === "cloud" ? "on the server" : "on this machine";
  releaseKeyboard();
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  shotUrl = "";
  $("shot-name").textContent = path;
  say.textContent = machine;
  $("shot-floor").classList.remove("full");
  $("shot-floor").classList.toggle("zoomable", behaviorOn("imageZoom"));
  img.style.removeProperty("width");
  img.style.removeProperty("height");
  img.onload = null;
  img.hidden = true;
  img.removeAttribute("src");
  note.textContent = phrase("opening…");
  $("shot").classList.add("on");
  const query = new URLSearchParams({ path, where, name: name || "" });
  try {
    const r = await fetch(`/api/image?${query}`);
    if (tag !== shotSeq) return;
    if (!r.ok) {
      const said = await r.json().catch(() => ({}));
      if (tag !== shotSeq) return;
      note.textContent = said.error || phrase("could not read that file");
      return;
    }
    const blob = await r.blob();
    if (tag !== shotSeq || !shotOnScreen()) return;
    shotUrl = URL.createObjectURL(blob);
    img.onload = () => {
      if (tag !== shotSeq) return;
      say.textContent = `${img.naturalWidth} × ${img.naturalHeight} · ${machine} · ${phrase(shotZooms() ? "click the image to zoom in" : "click the image for actual size")}`;
      if (shotZooms()) fitShot();
    };
    img.src = shotUrl;
    img.hidden = false;
    note.textContent = "";
  } catch {
    if (tag !== shotSeq) return;
    note.textContent = phrase("the app could not reach its own server");
  }
}

function wireMdShots(e, root) {
  for (const a of root.querySelectorAll("a.md-shot")) {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      openShot(a.dataset.path, e.where, e.name);
    });
  }
  wireShelfLinks(e.name, root);
}

function wireShelfLinks(name, root) {
  if (!root) return;
  for (const a of root.querySelectorAll("a.md-shelf")) {
    if (a.dataset.here) continue;
    a.dataset.here = "1";
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.hiveOpenPage?.({ slug: a.dataset.slug, tab: a.dataset.tab || "", version: Number(a.dataset.v) || 0, at: a.dataset.at || "", from: name || "" });
    });
  }
}

$("shot-close").addEventListener("click", closeShot);

const onFloorScrollbar = (ev, floor) => ev.offsetX >= floor.clientWidth || ev.offsetY >= floor.clientHeight;
$("shot").addEventListener("mousedown", (ev) => {
  const floor = $("shot-floor");
  if (ev.target === $("shot")) return closeShot();
  if (ev.target !== floor || document.body.classList.contains("experience-next") || onFloorScrollbar(ev, floor)) return;
  closeShot();
});

$("shot-img").addEventListener("click", (ev) => {
  const box = ev.currentTarget.getBoundingClientRect();
  toggleShotZoom((ev.clientX - box.left) / (box.width || 1), (ev.clientY - box.top) / (box.height || 1));
});

$("shot-tools").addEventListener("click", (ev) => {
  const kind = ev.target.closest("[data-zoom]")?.dataset.zoom;
  if (kind === "in" || kind === "out") stepShotZoom(kind === "in" ? 1 : -1);
  if (kind === "actual") zoomShot(1);
  if (kind === "fit") fitShot();
});

$("shot-floor").addEventListener("wheel", (ev) => {
  if (!shotZooms() || !(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
  const img = $("shot-img");
  const box = img.getBoundingClientRect();
  const floor = ev.currentTarget.getBoundingClientRect();
  const across = (ev.clientX - box.left) / (box.width || 1);
  const down = (ev.clientY - box.top) / (box.height || 1);
  const before = { x: ev.clientX - floor.left, y: ev.clientY - floor.top };
  fitting = false;
  applyZoom(ev.deltaY < 0 ? zoom * ZOOM_WHEEL : zoom / ZOOM_WHEEL);
  ev.currentTarget.scrollTo(img.offsetLeft + across * img.offsetWidth - before.x, img.offsetTop + down * img.offsetHeight - before.y);
}, { passive: false });

new ResizeObserver(() => { if (shotOnScreen() && shotZooms() && fitting) fitShot(); }).observe($("shot-floor"));

export { closeShot, hidePeek, openShot, stepShotZoom, toggleShotZoom, peekCache, peekSeq, peekSrc, placePeek, shotOnScreen, shotUrl, showPeek, wireMdShots, wireShelfLinks };

import { $, phrase } from "./core.js";
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
function toggleShotZoom() {
  $("shot-floor").classList.toggle("full");
}

function shotOnScreen() { return $("shot").classList.contains("on"); }

let gallery = null;

const MESSAGE = ".sv-msg, .sv-user, .sv-tool";
const PICTURES = "a.md-shot[data-path], .ctx-chip[data-kind=image][data-path], img[data-path], .uatt[data-path]";

function picturesAround(el) {
  const message = el?.closest?.(MESSAGE);
  if (!message) return [];
  return [...new Set([...message.querySelectorAll(PICTURES)].map((one) => one.dataset.path).filter(Boolean))];
}

function paintGallery() {
  const walks = !!gallery;
  $("shot-prev").hidden = !walks;
  $("shot-next").hidden = !walks;
  $("shot-at").textContent = walks ? `(${gallery.at + 1}/${gallery.list.length})` : "";
}

function closeShot() {
  shotSeq++;
  gallery = null;
  paintGallery();
  $("shot-img").onload = null;
  $("shot").classList.remove("on");
  $("shot-img").removeAttribute("src");
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  shotUrl = "";
}

function stageShot(name, say) {
  const img = $("shot-img");
  releaseKeyboard();
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  shotUrl = "";
  $("shot-name").textContent = name;
  $("shot-say").textContent = say;
  $("shot-floor").classList.remove("full");
  img.onload = null;
  img.hidden = true;
  img.removeAttribute("src");
  paintGallery();
  $("shot").classList.add("on");
  return ++shotSeq;
}

function landShot(tag, url, where) {
  const img = $("shot-img");
  shotUrl = url;
  img.onload = () => {
    if (tag !== shotSeq) return;
    $("shot-say").textContent = [`${img.naturalWidth} × ${img.naturalHeight}`, where, phrase("click the image for actual size")].filter(Boolean).join(" · ");
  };
  img.src = url;
  img.hidden = false;
  $("shot-note").textContent = "";
}

async function showShot(path, where, name) {
  const note = $("shot-note");
  const machine = phrase(where === "cloud" ? "on the server" : "on this machine");
  const tag = stageShot(path, machine);
  note.textContent = phrase("opening…");
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
    landShot(tag, URL.createObjectURL(blob), machine);
  } catch {
    if (tag !== shotSeq) return;
    note.textContent = phrase("the app could not reach its own server");
  }
}

function openShot(path, where, name, list = null) {
  const pictures = Array.isArray(list) ? [...new Set(list.filter(Boolean))] : [];
  const at = pictures.indexOf(path);
  gallery = pictures.length > 1 && at >= 0 ? { list: pictures, at, where, name } : null;
  return showShot(path, where, name);
}

function openShotFrom(el, path, where, name) {
  return openShot(path, where, name, picturesAround(el));
}

function stepShot(direction) {
  if (!gallery || !shotOnScreen()) return false;
  const n = gallery.list.length;
  gallery.at = (((gallery.at + direction) % n) + n) % n;
  showShot(gallery.list[gallery.at], gallery.where, gallery.name);
  return true;
}

function arrowShot(key) {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return false;
  const direction = key === "ArrowLeft" ? -1 : 1;
  const floor = $("shot-floor");
  if (floor.scrollWidth > floor.clientWidth + 1) {
    floor.scrollBy({ left: direction * Math.round(floor.clientWidth / 5) });
    return true;
  }
  return stepShot(direction);
}

const DIAGRAM = ".md-codebox[data-view=diagram] > .md-mermaid";
const DIAGRAM_MARGIN = 16;
const CLEAR = /^(?:transparent|rgba\([^)]*,\s*0\))$/;

function surfaceOf(el) {
  for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
    const color = getComputedStyle(at).backgroundColor;
    if (color && !CLEAR.test(color.trim())) return color;
  }
  return getComputedStyle(document.body).backgroundColor || "";
}

function diagramPicture(svg, background) {
  const copy = svg.cloneNode(true);
  const box = String(copy.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const rect = svg.getBoundingClientRect?.() || { width: 0, height: 0 };
  const [x, y, w, h] = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? box : [0, 0, rect.width || 300, rect.height || 150];
  const width = Math.ceil(w + DIAGRAM_MARGIN * 2);
  const height = Math.ceil(h + DIAGRAM_MARGIN * 2);
  copy.setAttribute("viewBox", `${x - DIAGRAM_MARGIN} ${y - DIAGRAM_MARGIN} ${width} ${height}`);
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.style.maxWidth = "none";
  if (background) copy.style.backgroundColor = background;
  let markup = new XMLSerializer().serializeToString(copy);
  if (!/^<svg[^>]*\sxmlns=/.test(markup)) markup = markup.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return markup;
}

function openDiagram(stage) {
  const svg = stage?.querySelector?.("svg");
  if (!svg) return false;
  gallery = null;
  const markup = diagramPicture(svg, surfaceOf(stage));
  const tag = stageShot(phrase("Mermaid diagram"), "");
  landShot(tag, URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" })), "");
  return true;
}

function wireMdShots(e, root) {
  for (const a of root.querySelectorAll("a.md-shot")) {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      openShotFrom(a, a.dataset.path, e.where, e.name);
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
$("shot-prev").addEventListener("click", () => stepShot(-1));
$("shot-next").addEventListener("click", () => stepShot(1));

document.addEventListener("click", (ev) => {
  const stage = ev.target?.closest?.(DIAGRAM);
  if (!stage || ev.defaultPrevented) return;
  if (openDiagram(stage)) ev.preventDefault();
}, true);

window.addEventListener("keydown", (ev) => {
  if ((ev.key !== "Enter" && ev.key !== " ") || ev.altKey || ev.ctrlKey || ev.metaKey || !ev.target?.matches?.(DIAGRAM)) return;
  if (!openDiagram(ev.target)) return;
  ev.preventDefault();
  ev.stopPropagation();
}, true);

const onFloorScrollbar = (ev, floor) => ev.offsetX >= floor.clientWidth || ev.offsetY >= floor.clientHeight;
$("shot").addEventListener("mousedown", (ev) => {
  const floor = $("shot-floor");
  if (ev.target === $("shot")) return closeShot();
  if (ev.target !== floor || onFloorScrollbar(ev, floor)) return;
  closeShot();
});

$("shot-img").addEventListener("click", toggleShotZoom);

export { arrowShot, closeShot, hidePeek, openDiagram, openShot, openShotFrom, picturesAround, stepShot, toggleShotZoom, peekCache, peekSeq, peekSrc, placePeek, shotOnScreen, shotUrl, showPeek, wireMdShots, wireShelfLinks };

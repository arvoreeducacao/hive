import { esc, phrase, st } from "./core.js";
import { toast } from "./composer-toast.js";

const SAVE_URL_KEPT_MS = 30_000;

const COPY_MAX_PIXELS = 64_000_000;

const MEDIA_AREAS = ".sv-scroll, #shot, .cp-preview .cp-pv-body";

const MEDIA_SKIPPED = ".sv-attach, .sv-composer, .ctx-chip";

let menu = null;

function mediaReference(el, { origin = location.origin, sessions = st.data?.sessions || [] } = {}) {
  const raw = el.currentSrc || el.getAttribute("src") || "";
  const kind = el.tagName === "VIDEO" ? "video" : "image";
  let url = null;
  try { url = new URL(raw, origin); } catch {}
  const reference = { kind, src: raw, url: "", path: "", relative: "", name: "" };
  if (url && url.origin === origin && /^\/api\/(image|attachment)$/.test(url.pathname)) {
    reference.path = url.searchParams.get("path") || "";
    const seat = sessions.find((one) => one.name === url.searchParams.get("name"));
    const cwd = String(seat?.cwd || "").replace(/\/+$/, "");
    if (cwd && reference.path.startsWith(`${cwd}/`)) reference.relative = reference.path.slice(cwd.length + 1);
  } else if (url && /^https?:$/.test(url.protocol) && url.origin !== origin) reference.url = raw.startsWith("//") ? raw : url.href;
  if (!reference.path && el.id === "shot-img") reference.path = document.getElementById("shot-name")?.textContent?.trim() || "";
  const fromPath = reference.path.split(/[\\/]/).pop();
  let fromUrl = "";
  try { fromUrl = decodeURIComponent((reference.url ? new URL(reference.url, origin).pathname : "").split("/").pop() || ""); } catch {}
  reference.name = fromPath || fromUrl || el.getAttribute("alt") || kind;
  return reference;
}

function mediaItems(reference, { canCopyImage = typeof ClipboardItem === "function" && !!navigator.clipboard?.write } = {}) {
  const items = [];
  if (reference.path) items.push({ act: "copy-path", label: phrase("Copy full path") });
  if (reference.relative) items.push({ act: "copy-relative", label: phrase("Copy relative path") });
  if (reference.url) items.push({ act: "copy-url", label: phrase("Copy URL") });
  items.push({ act: "save", label: reference.kind === "video" ? phrase("Save video") : phrase("Save image"), disabled: !reference.src });
  if (reference.kind === "image") items.push({ act: "copy-image", label: phrase("Copy image"), disabled: !reference.src || !canCopyImage });
  return items;
}

async function mediaBlob(reference) {
  const r = await fetch(reference.src).catch(() => null);
  if (!r) throw new Error(phrase("The file could not be fetched. Check the connection and try again."));
  if (!r.ok) throw new Error(phrase("The file could not be fetched (HTTP {status}).", { status: r.status }));
  const blob = await r.blob();
  if (/^text\/html/i.test(blob.type)) throw new Error(phrase("This link returned a web page instead of media. Open the original URL."));
  return blob;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), SAVE_URL_KEPT_MS);
}

async function asPng(reference) {
  const blob = await mediaBlob(reference);
  if (blob.type === "image/png") return blob;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") throw new Error(phrase("Image copying is unavailable in this browser."));
  let bitmap = null;
  try { bitmap = await createImageBitmap(blob); } catch { throw new Error(phrase("The browser could not decode this image for copying. Try saving it instead.")); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > COPY_MAX_PIXELS) throw new Error(phrase("This image is too large or has no usable dimensions. Try saving it instead."));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const png = await canvas.convertToBlob({ type: "image/png" });
    if (!png) throw new Error(phrase("The image could not be converted to PNG."));
    return png;
  } finally {
    bitmap.close?.();
  }
}

async function copyText(text, failed) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast({ title: failed, description: phrase("The media action failed.") });
  }
}

async function runMediaAction(act, reference) {
  if (act === "copy-path") return copyText(reference.path, phrase("Could not copy full path"));
  if (act === "copy-relative") return copyText(reference.relative, phrase("Could not copy relative path"));
  if (act === "copy-url") return copyText(reference.url, phrase("Could not copy url"));
  const video = reference.kind === "video";
  if (act === "save") {
    const note = toast({ title: video ? phrase("Preparing video download…") : phrase("Preparing image download…"), tone: "info", stays: 0 });
    try {
      download(await mediaBlob(reference), reference.name);
      note.close();
    } catch (wrong) {
      note.update({ tone: "error", title: video ? phrase("Could not save video") : phrase("Could not save image"), description: wrong?.message || phrase("The media action failed.") });
    }
    return;
  }
  if (act === "copy-image") {
    const note = toast({ title: phrase("Copying image…"), tone: "info", stays: 0 });
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": asPng(reference) })]);
      note.close();
    } catch (wrong) {
      note.update({ tone: "error", title: phrase("Could not copy image"), description: wrong?.message || phrase("The media action failed.") });
    }
  }
}

function closeMediaMenu() {
  if (!menu) return;
  menu.el.remove();
  document.removeEventListener("mousedown", menu.outside, true);
  window.removeEventListener("blur", closeMediaMenu);
  const back = menu.returnTo;
  menu = null;
  back?.focus?.({ preventScroll: true });
}

function placeMenu(el, x, y) {
  const box = el.getBoundingClientRect();
  el.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
}

function openMediaMenu(target, x, y) {
  closeMediaMenu();
  const reference = mediaReference(target);
  const items = mediaItems(reference);
  const el = document.createElement("div");
  el.className = "cp-media-menu";
  el.setAttribute("role", "menu");
  el.innerHTML = items.map((item) => `<button type="button" role="menuitem" data-act="${item.act}"${item.disabled ? " disabled" : ""}>${esc(item.label)}</button>`).join("");
  document.body.appendChild(el);
  placeMenu(el, x, y);
  menu = { el, returnTo: document.activeElement, outside: (ev) => { if (!el.contains(ev.target)) closeMediaMenu(); } };
  document.addEventListener("mousedown", menu.outside, true);
  window.addEventListener("blur", closeMediaMenu);
  const buttons = () => [...el.querySelectorAll("button:not([disabled])")];
  el.addEventListener("click", (ev) => {
    const hit = ev.target.closest("button[data-act]");
    if (!hit || hit.disabled) return;
    closeMediaMenu();
    runMediaAction(hit.dataset.act, reference);
  });
  el.addEventListener("keydown", (ev) => {
    const list = buttons();
    const at = list.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); return closeMediaMenu(); }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      list[(at + (ev.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    }
  });
  buttons()[0]?.focus({ preventScroll: true });
  return { el, reference, items };
}

const mediaTarget = (node) => {
  const el = node?.closest?.("img, video");
  if (!el || !el.closest(MEDIA_AREAS) || el.closest(MEDIA_SKIPPED)) return null;
  return el;
};

function onContextMenu(ev) {
  const el = mediaTarget(ev.target);
  if (!el) return;
  ev.preventDefault();
  ev.stopPropagation();
  openMediaMenu(el, ev.clientX, ev.clientY);
}

function onMediaKey(ev) {
  if (ev.key !== "ContextMenu" && !(ev.key === "F10" && ev.shiftKey)) return;
  const el = mediaTarget(document.activeElement);
  if (!el) return;
  ev.preventDefault();
  const box = el.getBoundingClientRect();
  openMediaMenu(el, box.left, box.bottom);
}

if (typeof document !== "undefined") {
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("keydown", onMediaKey, true);
}

export { closeMediaMenu, mediaItems, mediaReference, openMediaMenu };

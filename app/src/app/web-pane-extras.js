import { IS_MAC, esc, phrase } from "./core.js";
import { lucide } from "./lucide.js";

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const ICON_CAP = 2048;

const RECENT_KEY = "hive.browser.recent";
const RECENT_KEPT = 8;

const zoomOf = new Map();

function recentPages() {
  try {
    const kept = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(kept) ? kept.filter((one) => one && typeof one.url === "string" && /^https?:/i.test(one.url)).slice(0, RECENT_KEPT) : [];
  } catch { return []; }
}

function noteRecent(url, title) {
  if (!/^https?:/i.test(String(url || ""))) return;
  const kept = [{ url, title: String(title || "").slice(0, 80) }, ...recentPages().filter((one) => one.url !== url)].slice(0, RECENT_KEPT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(kept)); } catch {}
}
const finding = new Map();

const modOf = (event) => (IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

const PRIVATE_HOST = /^(?:localhost|.*\.(?:local|localhost|internal|lan|home|test))$/i;

function safeIcon(url) {
  const text = String(url || "");
  if (!text || text.length > ICON_CAP) return "";
  if (/^data:image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp);/i.test(text)) return text;
  let parsed = null;
  try { parsed = new URL(text); } catch { return ""; }
  const host = parsed.hostname;
  if (parsed.protocol !== "https:" || !host.includes(".") || PRIVATE_HOST.test(host) || /^[\d.]+$/.test(host) || host.includes(":")) return "";
  return parsed.href;
}

function watchFrame(frame, tab, repaint) {
  frame.addEventListener("did-start-loading", () => { tab.loading = true; repaint(); });
  frame.addEventListener("did-stop-loading", () => {
    tab.loading = false;
    if (tab.kind !== "artifact") noteRecent(tab.url, tab.title);
    repaint();
  });
  frame.addEventListener("page-favicon-updated", (event) => {
    const icon = safeIcon((event.favicons || [])[0]);
    if (icon !== tab.icon) { tab.icon = icon; repaint(); }
  });
  frame.addEventListener("found-in-page", (event) => {
    const said = event.result || {};
    const find = finding.get(tab.id);
    if (!find) return;
    if (typeof said.matches === "number") find.matches = said.matches;
    if (typeof said.activeMatchOrdinal === "number") find.at = said.activeMatchOrdinal;
    repaint();
  });
  frame.addEventListener("dom-ready", () => {
    const zoom = zoomOf.get(tab.id);
    if (zoom && zoom !== 1) { try { frame.setZoomFactor(zoom); } catch {} }
  });
}

function zoomTo(frame, tab, factor) {
  if (!frame || !tab) return;
  zoomOf.set(tab.id, factor);
  try { frame.setZoomFactor(factor); } catch {}
}

function stepZoom(frame, tab, way) {
  const now = zoomOf.get(tab?.id) || 1;
  const at = ZOOM_STEPS.findIndex((one) => one >= now - 0.001);
  const next = way === 0 ? 1 : ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (at < 0 ? 5 : at) + way))];
  zoomTo(frame, tab, next);
}

function dressWebPane(pane, { frameNow, tabNow, repaint, newTab }) {
  const form = pane.querySelector(".web-url");
  const field = form?.querySelector("input");
  if (!form || !field || pane.querySelector(".web-more")) return;
  const review = form.querySelector(".web-review");
  if (review) {
    review.setAttribute("aria-label", review.title);
    review.innerHTML = lucide("sparkles");
  }
  const pick = form.querySelector(".web-pick");
  if (pick) pick.setAttribute("aria-label", pick.title);
  const more = document.createElement("span");
  more.className = "web-more";
  more.innerHTML = `<button type="button" class="web-step web-menu" aria-haspopup="menu" aria-expanded="false" title="${esc(phrase("More"))}" aria-label="${esc(phrase("More"))}">${lucide("ellipsis")}</button><div class="web-menu-list" role="menu" hidden></div>`;
  form.appendChild(more);
  const find = document.createElement("div");
  find.className = "web-find";
  find.hidden = true;
  find.innerHTML = `<input type="text" spellcheck="false" placeholder="${esc(phrase("Find in page"))}" aria-label="${esc(phrase("Find in page"))}"><span class="web-find-count" aria-live="polite"></span><button type="button" class="web-step" data-find="prev" title="${esc(phrase("Previous match"))}" aria-label="${esc(phrase("Previous match"))}">${lucide("chevron", "web-up")}</button><button type="button" class="web-step" data-find="next" title="${esc(phrase("Next match"))}" aria-label="${esc(phrase("Next match"))}">${lucide("chevron", "web-down")}</button><button type="button" class="web-step" data-find="close" title="${esc(phrase("Close"))}" aria-label="${esc(phrase("Close"))}">${lucide("x")}</button>`;
  pane.querySelector(".art-stage")?.before(find);
  const list = more.querySelector(".web-menu-list");
  const menuButton = more.querySelector(".web-menu");
  const closeMenu = () => { list.hidden = true; menuButton.setAttribute("aria-expanded", "false"); };
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const tab = tabNow();
    const zoom = Math.round((zoomOf.get(tab?.id) || 1) * 100);
    list.innerHTML = [
      ["new-tab", phrase("New browser tab"), ""],
      ["zoom-in", phrase("Zoom in"), IS_MAC ? "⌘+" : "Ctrl++"],
      ["zoom-out", phrase("Zoom out"), IS_MAC ? "⌘−" : "Ctrl+−"],
      ["zoom-reset", phrase("Actual size ({n}%)", { n: zoom }), IS_MAC ? "⌘0" : "Ctrl+0"],
      ["hard-reload", phrase("Reload without cache"), IS_MAC ? "⇧⌘R" : "Ctrl+Shift+R"],
      ["find", phrase("Find in page"), IS_MAC ? "⌘F" : "Ctrl+F"]
    ].map(([act, label, keys]) => `<button type="button" role="menuitem" class="web-menu-i" data-web="${act}"><span>${esc(label)}</span>${keys ? `<kbd>${esc(keys)}</kbd>` : ""}</button>`).join("");
    list.hidden = !list.hidden;
    menuButton.setAttribute("aria-expanded", String(!list.hidden));
    if (!list.hidden) list.querySelector("button")?.focus();
  });
  list.addEventListener("click", (event) => {
    event.stopPropagation();
    const hit = event.target.closest("[data-web]");
    if (!hit) return;
    closeMenu();
    webAct(hit.dataset.web, { pane, frameNow, tabNow, repaint, newTab });
  });
  more.menuKeys = (event) => {
    if (list.hidden) return false;
    const all = [...list.querySelectorAll("button")];
    const at = all.indexOf(document.activeElement);
    if (event.key === "Escape") { closeMenu(); menuButton.focus(); }
    else if (event.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
    else if (event.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
    else return event.key !== "Enter" && event.key !== " " ? false : "native";
    return true;
  };
  document.addEventListener("pointerdown", (event) => { if (!more.contains(event.target)) closeMenu(); }, true);
  const findField = find.querySelector("input");
  findField.addEventListener("input", () => runFind(frameNow(), tabNow(), findField.value, true));
  find.findKeys = (event) => {
    if (event.key === "Escape") { closeFind(pane, frameNow(), tabNow(), repaint); return true; }
    if (event.key === "Enter" && document.activeElement === findField) { runFind(frameNow(), tabNow(), findField.value, !event.shiftKey, true); return true; }
    return false;
  };
  find.addEventListener("click", (event) => {
    event.stopPropagation();
    const hit = event.target.closest("[data-find]");
    if (!hit) return;
    if (hit.dataset.find === "close") return closeFind(pane, frameNow(), tabNow(), repaint);
    runFind(frameNow(), tabNow(), findField.value, hit.dataset.find === "next", true);
  });
}

function runFind(frame, tab, text, forward, again = false) {
  if (!frame || !tab) return;
  const find = finding.get(tab.id) || { text: "", matches: 0, at: 0 };
  finding.set(tab.id, find);
  if (!text) {
    find.text = "";
    find.matches = 0;
    find.at = 0;
    try { frame.stopFindInPage("clearSelection"); } catch {}
    return;
  }
  const next = again && find.text === text;
  find.text = text;
  try { frame.findInPage(text, { forward, findNext: !next }); } catch {}
}

function openFind(pane, tab) {
  const find = pane.querySelector(".web-find");
  if (!find) return;
  find.hidden = false;
  pane.classList.add("finding");
  finding.set(tab?.id, finding.get(tab?.id) || { text: "", matches: 0, at: 0 });
  const field = find.querySelector("input");
  field.focus();
  field.select();
}

function closeFind(pane, frame, tab, repaint) {
  const find = pane.querySelector(".web-find");
  if (!find) return;
  find.hidden = true;
  pane.classList.remove("finding");
  if (tab) finding.delete(tab.id);
  try { frame?.stopFindInPage("clearSelection"); } catch {}
  repaint();
}

function webAct(act, { pane, frameNow, tabNow, repaint, newTab }) {
  if (act === "new-tab") return newTab?.();
  const frame = frameNow();
  const tab = tabNow();
  if (act === "zoom-in") stepZoom(frame, tab, 1);
  else if (act === "zoom-out") stepZoom(frame, tab, -1);
  else if (act === "zoom-reset") stepZoom(frame, tab, 0);
  else if (act === "hard-reload") { try { frame?.reloadIgnoringCache(); } catch {} }
  else if (act === "reload") { try { frame?.reload(); } catch {} }
  else if (act === "find") return openFind(pane, tab);
  else if (act === "stop") { try { frame?.stop(); } catch {} }
  else if (act === "address") {
    const field = pane.querySelector(".web-url input");
    field?.focus();
    field?.select();
    return;
  } else return;
  repaint();
}

function paintWebExtras(pane, tab) {
  const again = pane.querySelector(".web-again");
  if (again) {
    const loading = !!tab?.loading;
    if (again.dataset.loading !== String(loading)) {
      again.dataset.loading = String(loading);
      again.innerHTML = loading ? lucide("x") : '<svg aria-hidden="true"><use href="#i-reload"/></svg>';
      const said = loading ? phrase("Stop loading") : phrase("reload this page");
      again.title = said;
      again.setAttribute("aria-label", said);
    }
  }
  const count = pane.querySelector(".web-find-count");
  const find = finding.get(tab?.id);
  if (count) count.textContent = find?.text ? (find.matches ? `${find.at}/${find.matches}` : phrase("No matches")) : "";
}

function webChord(event, { pane, frameNow, tabNow, repaint }) {
  if (!modOf(event) || event.altKey) return false;
  const code = event.code;
  if (!event.shiftKey && code === "KeyF") { webAct("find", { pane, frameNow, tabNow, repaint }); return true; }
  if (!event.shiftKey && code === "KeyL") { webAct("address", { pane, frameNow, tabNow, repaint }); return true; }
  if (code === "KeyR") { webAct(event.shiftKey ? "hard-reload" : "reload", { pane, frameNow, tabNow, repaint }); return true; }
  if (!event.shiftKey && code === "Period") { webAct("stop", { pane, frameNow, tabNow, repaint }); return true; }
  if (code === "Equal" || code === "NumpadAdd") { webAct("zoom-in", { pane, frameNow, tabNow, repaint }); return true; }
  if (code === "Minus" || code === "NumpadSubtract") { webAct("zoom-out", { pane, frameNow, tabNow, repaint }); return true; }
  if (!event.shiftKey && (code === "Digit0" || code === "Numpad0")) { webAct("zoom-reset", { pane, frameNow, tabNow, repaint }); return true; }
  return false;
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const el = document.activeElement;
  const more = el?.closest?.(".web-more");
  const find = el?.closest?.(".web-find");
  const said = more?.menuKeys?.(event) || find?.findKeys?.(event);
  if (!said) return;
  if (said !== "native") event.preventDefault();
  event.stopPropagation();
}, true);

const tabIconHtml = (tab) => (tab?.icon ? `<img class="web-fav" src="${esc(tab.icon)}" alt="" referrerpolicy="no-referrer">` : "");

export { dressWebPane, noteRecent, paintWebExtras, recentPages, safeIcon, tabIconHtml, watchFrame, webAct, webChord };

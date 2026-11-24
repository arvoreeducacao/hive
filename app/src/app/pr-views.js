import { esc, phrase, st } from "./core.js";
import { PR_VIEW_NAME_MAX, addPrView, dropPrView, prViewMatches, prViewNameTrouble, prViewOf, renamePrView, updatePrView } from "/assets/pr-views.mjs";

const icon = (paths) => `<svg class="pv-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const BOOKMARK = icon('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>');
const CHECK = icon('<path d="M20 6 9 17l-5-5"/>');
const PLUS = icon('<path d="M5 12h14"/><path d="M12 5v14"/>');
const CHEVRON = icon('<path d="m6 9 6 6 6-6"/>');
const BLANK = '<span class="pv-i" aria-hidden="true"></span>';

const NAME_TROUBLE = {
  empty: () => phrase("Enter a name for this view."),
  long: () => phrase("Use {n} characters or fewer.", { n: PR_VIEW_NAME_MAX }),
  taken: () => phrase("A view with this name already exists.")
};

let chosen = "";
let menu = null;
const listeners = new Set();

const viewsNow = () => (Array.isArray(st.prViews) ? st.prViews : []);

const prListNow = () => prViewOf({ filter: st.prFilter || "all", query: st.prQuery || "" });

const newViewId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function prViewsNow(current = prListNow()) {
  const views = viewsNow();
  const picked = views.find((view) => view.id === chosen) || views.find((view) => prViewMatches(view, current)) || null;
  chosen = picked ? picked.id : "";
  return { views, picked, modified: !!picked && !prViewMatches(picked, current) };
}

function triggerParts() {
  const { picked, modified } = prViewsNow();
  const name = picked ? picked.name : phrase("Views");
  const label = `${phrase("Saved PR views")}: ${name}${modified ? ` (${phrase("Modified view")})` : ""}`;
  const inner = `${BOOKMARK}<span class="pv-name">${esc(name)}</span>${modified ? '<span class="pv-mod" aria-hidden="true">*</span>' : ""}${CHEVRON}`;
  return { inner, label, title: picked ? picked.name : phrase("Saved PR views") };
}

function prViewsTriggerHtml(cls = "") {
  const { inner, label, title } = triggerParts();
  return `<button type="button" class="pv-trigger${cls ? ` ${cls}` : ""}" data-pr-views data-act="pr-views" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}" title="${esc(title)}">${inner}</button>`;
}

function paintPrViewsTrigger(el) {
  if (!el) return;
  const { inner, label, title } = triggerParts();
  if (el.dataset.painted !== inner) {
    el.innerHTML = inner;
    el.dataset.painted = inner;
  }
  el.setAttribute("aria-label", label);
  el.title = title;
  el.setAttribute("aria-expanded", menu && menu.host.trigger() === el ? "true" : "false");
}

function onPrViews(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function adoptPrViews(said) {
  st.prViews = Array.isArray(said?.config?.prViews) ? said.config.prViews : [];
  if (menu?.mode === "menu") paintMenu();
  for (const listener of listeners) listener();
}

async function persist(views) {
  let said = null;
  try {
    const answer = await fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config: { prViews: views } }) });
    said = await answer.json();
  } catch {}
  if (!said || said.refused || said.error || !Array.isArray(said.config?.prViews)) return false;
  adoptPrViews(said);
  return true;
}

function itemHtml(attrs, glyph, label, cls = "") {
  return `<button type="button" class="pv-item${cls}" data-pv-item tabindex="-1" ${attrs}>${glyph}<span class="pv-label">${esc(label)}</span></button>`;
}

function paintMenu() {
  const { views, picked, modified } = prViewsNow();
  const box = menu.box;
  box.setAttribute("role", "menu");
  box.setAttribute("aria-label", phrase("Saved PR views"));
  const rows = views.map((view) => {
    const on = picked?.id === view.id && !modified;
    return itemHtml(`role="menuitemradio" aria-checked="${on}" data-pv-view="${esc(view.id)}" title="${esc(view.name)}"`, on ? CHECK : BOOKMARK, view.name);
  });
  const acts = [itemHtml('role="menuitem" data-pv-act="save"', PLUS, phrase("Save current view…"))];
  if (picked) {
    if (modified) acts.push(itemHtml('role="menuitem" data-pv-act="update"', BLANK, phrase("Update saved view")));
    acts.push(itemHtml('role="menuitem" data-pv-act="rename"', BLANK, phrase("Rename view…")));
    acts.push(itemHtml('role="menuitem" data-pv-act="delete"', BLANK, phrase("Delete view"), " danger"));
  }
  const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.pvView || document.activeElement.dataset.pvAct || "" : "";
  box.innerHTML = [...rows, rows.length ? '<div class="pv-sep" role="separator"></div>' : "", ...acts, menu.trouble ? `<p class="pv-err" role="alert">${esc(menu.trouble)}</p>` : ""].join("");
  if (focused) box.querySelector(`[data-pv-view="${CSS.escape(focused)}"], [data-pv-act="${CSS.escape(focused)}"]`)?.focus();
}

function place() {
  const at = menu.host.trigger()?.getBoundingClientRect?.();
  if (!at) return;
  const width = menu.box.offsetWidth || 240;
  const room = window.innerWidth || 0;
  const left = room && at.left + width > room - 8 ? Math.max(8, at.right - width) : Math.max(8, at.left);
  menu.box.style.left = `${Math.round(left)}px`;
  menu.box.style.top = `${Math.round(at.bottom + 4)}px`;
}

function focusTrigger(host) {
  const go = () => {
    const el = host.trigger();
    if (el?.isConnected) el.focus({ preventScroll: true });
  };
  go();
  setTimeout(() => {
    if (!menu && (!document.activeElement || document.activeElement === document.body)) go();
  }, 0);
}

function closePrViews(refocus = true) {
  if (!menu) return;
  const { box, host } = menu;
  menu = null;
  box.remove();
  host.trigger()?.setAttribute("aria-expanded", "false");
  host.closed?.();
  if (refocus) focusTrigger(host);
}

const prViewsOpen = () => !!menu;

function openMenu(host) {
  const box = document.createElement("div");
  box.className = "md-menu pv-menu";
  box.addEventListener("click", onClick);
  box.addEventListener("submit", (event) => {
    event.preventDefault();
    confirmName();
  });
  box.addEventListener("input", () => checkName());
  document.body.append(box);
  menu = { box, host, mode: "menu", editing: "", trouble: "", busy: false };
  host.trigger()?.setAttribute("aria-expanded", "true");
  paintMenu();
  place();
  box.querySelector("[data-pv-item]")?.focus();
}

function togglePrViews(host) {
  if (menu && menu.host.key === host.key) return closePrViews(true);
  if (menu) closePrViews(false);
  openMenu(host);
}

function choose(id) {
  const view = viewsNow().find((one) => one.id === id);
  if (!view) return;
  chosen = view.id;
  const host = menu.host;
  closePrViews(false);
  host.apply(prViewOf(view));
  if (!document.activeElement || document.activeElement === document.body) focusTrigger(host);
}

async function saveAndClose(views, after = () => {}) {
  if (menu.busy) return;
  menu.busy = true;
  const saved = await persist(views);
  if (!menu) return;
  menu.busy = false;
  if (!saved) {
    menu.trouble = phrase("Could not save the PR views. Try again.");
    if (menu.mode === "menu") paintMenu();
    else checkName();
    return;
  }
  after();
  closePrViews(true);
}

function onClick(event) {
  const hit = event.target.closest?.("[data-pv-view], [data-pv-act]");
  if (!hit || !menu) return;
  event.preventDefault();
  event.stopPropagation();
  if (hit.dataset.pvView) return choose(hit.dataset.pvView);
  const act = hit.dataset.pvAct;
  const { picked } = prViewsNow();
  if (act === "save") return openName("", menu.host.suggest?.() || "");
  if (act === "cancel") return closePrViews(true);
  if (act === "confirm") return confirmName();
  if (!picked) return;
  if (act === "rename") return openName(picked.id, picked.name);
  if (act === "update") return saveAndClose(updatePrView(viewsNow(), picked.id, prListNow()));
  if (act === "delete") return saveAndClose(dropPrView(viewsNow(), picked.id), () => { chosen = ""; });
}

function openName(editing, draft) {
  menu.mode = "name";
  menu.editing = editing;
  menu.trouble = "";
  const box = menu.box;
  const title = editing ? phrase("Rename PR view") : phrase("Save PR view");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", title);
  box.innerHTML = `<form class="pv-form" novalidate>
      <p class="pv-title">${esc(title)}</p>
      <p class="pv-desc">${esc(phrase("Saves the search and the filter of the PR list. Every window of the Hive on this machine sees it."))}</p>
      <label class="pv-field"><span>${esc(phrase("View name"))}</span><input class="pv-input" type="text" maxlength="${PR_VIEW_NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="${esc(phrase("PRs that need me"))}" aria-describedby="pv-err"></label>
      <p class="pv-err" id="pv-err" role="alert"></p>
      <div class="pv-row"><button type="button" class="pv-btn" data-pv-act="cancel">${esc(phrase("Cancel"))}</button><button type="submit" class="pv-btn primary" data-pv-act="confirm">${esc(phrase("Save"))}</button></div>
    </form>`;
  const input = box.querySelector(".pv-input");
  input.value = draft;
  checkName();
  place();
  input.focus();
  input.select?.();
}

function checkName() {
  if (!menu || menu.mode !== "name") return;
  const input = menu.box.querySelector(".pv-input");
  const trouble = prViewNameTrouble(input.value, viewsNow(), menu.editing);
  const typed = !!input.value.trim();
  input.setAttribute("aria-invalid", typed && trouble ? "true" : "false");
  menu.box.querySelector(".pv-err").textContent = typed && trouble ? NAME_TROUBLE[trouble]() : menu.trouble;
  menu.box.querySelector('[data-pv-act="confirm"]').disabled = !!trouble || menu.busy;
}

function confirmName() {
  if (!menu || menu.mode !== "name" || menu.busy) return;
  const name = menu.box.querySelector(".pv-input").value.trim();
  const views = viewsNow();
  if (prViewNameTrouble(name, views, menu.editing)) return checkName();
  if (menu.editing && !views.some((one) => one.id === menu.editing)) {
    menu.editing = "";
    menu.trouble = phrase("This saved view was removed. Save the name as a new view or cancel.");
    menu.box.querySelector(".pv-title").textContent = phrase("Save PR view");
    menu.box.setAttribute("aria-label", phrase("Save PR view"));
    return checkName();
  }
  const id = menu.editing || newViewId();
  const next = menu.editing ? renamePrView(views, id, name) : addPrView(views, { id, name, state: prListNow() });
  menu.trouble = "";
  saveAndClose(next, () => { chosen = id; });
}

function stepItems(event) {
  const items = [...menu.box.querySelectorAll("[data-pv-item]")];
  if (!items.length) return false;
  const at = items.indexOf(document.activeElement);
  const go = (n) => items[(n + items.length) % items.length].focus();
  if (event.key === "ArrowDown") go(at + 1);
  else if (event.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
  else if (event.key === "Home") go(0);
  else if (event.key === "End") go(items.length - 1);
  else return false;
  return true;
}

function trapTab(event) {
  const stops = [...menu.box.querySelectorAll("input, button:not([disabled])")];
  if (!stops.length) return;
  const at = stops.indexOf(document.activeElement);
  const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
  stops[next].focus();
}

function onKey(event) {
  if (!menu) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    return closePrViews(true);
  }
  if (!menu.box.contains(document.activeElement)) return;
  event.stopPropagation();
  if (menu.mode === "name") {
    if (event.key === "Tab") {
      event.preventDefault();
      trapTab(event);
    } else if (event.key === "Enter" && !event.isComposing && document.activeElement?.classList.contains("pv-input")) {
      event.preventDefault();
      confirmName();
    }
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    return closePrViews(true);
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    document.activeElement?.click();
    return;
  }
  if (stepItems(event)) event.preventDefault();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", (event) => {
    if (!menu || menu.box.contains(event.target) || event.target?.closest?.("[data-pr-views]")) return;
    closePrViews(false);
  }, true);
  window.addEventListener("resize", () => closePrViews(false));
}

export { adoptPrViews, closePrViews, onPrViews, paintPrViewsTrigger, prViewsNow, prViewsOpen, prViewsTriggerHtml, togglePrViews };

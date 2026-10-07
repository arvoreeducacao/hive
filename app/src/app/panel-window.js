import { $, IS_MAC, esc, phrase, raycastOn, svgIcon } from "./core.js";

const CODE_CAP = { Enter: "↵", Backspace: "⌫", Escape: "esc", Tab: "⇥", Comma: ",", Period: ".", Slash: "/", ArrowUp: "↑", ArrowDown: "↓", BracketLeft: "[", BracketRight: "]" };

const ENTER = { code: "Enter" };

const ACTIONS_KEY = { meta: true, code: "KeyK" };

const panels = new Map();

let pop = null;

function capOf(code) {
  if (CODE_CAP[code]) return CODE_CAP[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function capsOf(combo) {
  if (!combo) return [];
  const caps = [];
  if (combo.meta) caps.push(IS_MAC ? "⌘" : "Ctrl");
  if (combo.ctrl) caps.push(IS_MAC ? "⌃" : "Ctrl");
  if (combo.alt) caps.push(IS_MAC ? "⌥" : "Alt");
  if (combo.shift) caps.push(IS_MAC ? "⇧" : "Shift");
  caps.push(capOf(combo.code));
  return caps;
}

const codeOfKey = (e) => (e.code === "NumpadEnter" ? "Enter" : e.code);

function comboHits(combo, e) {
  if (!combo || codeOfKey(e) !== combo.code) return false;
  const meta = IS_MAC ? e.metaKey : e.ctrlKey;
  const ctrl = IS_MAC ? e.ctrlKey : false;
  return !!combo.meta === meta && !!combo.alt === e.altKey && !!combo.shift === e.shiftKey && !!combo.ctrl === ctrl && (IS_MAC || !e.metaKey);
}

const bare = (combo) => !combo.meta && !combo.alt && !combo.ctrl;

const keysHtml = (combo) => `<span class="pw-keys">${capsOf(combo).map((cap) => `<kbd class="rc-key">${esc(cap)}</kbd>`).join("")}</span>`;

function registerPanel(id, spec) {
  panels.set(id, spec);
}

const panelOf = (id) => panels.get(id);

function actionsOf(spec) {
  return (spec.actions?.() || []).filter(Boolean);
}

function footModel(spec, { icon, title, trail = [], gauge = null } = {}) {
  const list = actionsOf(spec);
  const primary = list.find((one) => one.primary);
  return {
    key: "foot", icon, title, trail: trail.filter(Boolean), gauge,
    acts: list.filter((one) => one.foot).map((one) => ({ key: one.key, say: one.say, keys: capsOf(one.combo), off: !!one.off })),
    go: primary ? { key: primary.key, say: primary.say, keys: capsOf(primary.combo || ENTER), off: !!primary.off } : null,
    more: list.length ? { say: phrase("Actions"), keys: capsOf(ACTIONS_KEY) } : null
  };
}

function runAction(spec, key) {
  const one = actionsOf(spec).find((a) => a.key === key);
  if (!one || one.off) return;
  closeActions();
  one.go();
}

const inField = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || !!document.activeElement?.isContentEditable;

function panelKeys(e, id) {
  const spec = panels.get(id);
  if (!spec) return false;
  if (pop && pop.spec === spec) return actionKeys(e);
  const search = spec.search?.();
  const inSearch = !!search && document.activeElement === search;
  const inList = !!spec.list?.()?.contains(document.activeElement);
  const free = inSearch || inList || !inField();
  if (comboHits(ACTIONS_KEY, e)) {
    e.preventDefault();
    e.stopPropagation();
    openActions(spec);
    return true;
  }
  for (const one of actionsOf(spec)) {
    const combo = one.combo || (one.primary ? ENTER : null);
    if (!combo || !comboHits(combo, e)) continue;
    if (bare(combo) && !free) continue;
    if (one.primary && !one.combo && !(inSearch || inList)) continue;
    e.preventDefault();
    e.stopPropagation();
    if (!one.off) one.go();
    return true;
  }
  if ((inSearch || inList) && !e.altKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    e.stopPropagation();
    spec.step?.(e.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && codeOfKey(e) === "Enter" && spec.detail) {
    e.preventDefault();
    e.stopPropagation();
    spec.detail();
    return true;
  }
  return false;
}

function popItems() {
  const q = pop.input.value.trim().toLowerCase();
  return pop.items.filter((one) => !q || one.say.toLowerCase().includes(q));
}

function paintActions() {
  const shown = popItems();
  pop.at = Math.min(pop.at, Math.max(0, shown.length - 1));
  const groups = [];
  for (const one of shown) {
    const last = groups[groups.length - 1];
    if (last && last.cap === (one.group || "")) last.items.push(one);
    else groups.push({ cap: one.group || "", items: [one] });
  }
  let n = 0;
  pop.list.innerHTML = groups.map((group) => `${group.cap ? `<div class="pw-sec">${esc(group.cap)}</div>` : ""}${group.items.map((one) => {
    const at = n++;
    return `<button type="button" class="pw-pi" role="menuitem" data-pi="${at}" aria-selected="${at === pop.at}" ${one.off ? "disabled" : ""}>${svgIcon(one.icon || "i-bolt")}<span>${esc(one.say)}</span>${keysHtml(one.combo || (one.primary ? ENTER : null))}</button>`;
  }).join("")}`).join("") || `<div class="pw-sec">${esc(phrase("no action by that name"))}</div>`;
  pop.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function openActions(spec) {
  closeActions();
  const host = spec.el?.();
  const items = actionsOf(spec);
  if (!host || !items.length) return;
  const box = document.createElement("div");
  box.className = "pw-pop";
  box.setAttribute("role", "menu");
  box.innerHTML = `<div class="pw-sec">${esc(spec.subject?.() || phrase("Actions"))}</div><div class="pw-plist"></div>
    <label class="pw-psearch">${svgIcon("i-mag")}<input spellcheck="false" autocomplete="off" placeholder="${esc(phrase("Search actions…"))}" aria-label="${esc(phrase("Search actions…"))}"></label>`;
  host.appendChild(box);
  pop = { spec, box, items, at: 0, list: box.querySelector(".pw-plist"), input: box.querySelector("input"), back: document.activeElement };
  pop.list.addEventListener("focusin", (ev) => {
    const row = ev.target.closest("[data-pi]");
    if (!row) return;
    pop.at = Number(row.dataset.pi);
    for (const one of pop.list.querySelectorAll("[data-pi]")) {
      one.setAttribute("aria-selected", String(Number(one.dataset.pi) === pop.at));
    }
  });
  pop.list.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-pi]");
    if (!row) return;
    const one = popItems()[Number(row.dataset.pi)];
    if (one) runAction(spec, one.key);
  });
  pop.input.addEventListener("input", () => { pop.at = 0; paintActions(); });
  host.querySelector("[data-pw-more]")?.setAttribute("aria-expanded", "true");
  paintActions();
  pop.input.focus();
}

function closeActions() {
  if (!pop) return;
  const { box, back, spec } = pop;
  pop = null;
  spec.el?.()?.querySelector("[data-pw-more]")?.setAttribute("aria-expanded", "false");
  box.remove();
  if (back?.isConnected) back.focus();
}

const actionsOpen = () => !!pop;

function leavePanel(el) {
  closeActions();
  if (el?.contains(document.activeElement)) document.activeElement.blur();
}

function actionKeys(e) {
  const { spec } = pop;
  if (e.key === "Escape" || comboHits(ACTIONS_KEY, e)) {
    e.preventDefault();
    e.stopPropagation();
    closeActions();
    return true;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    const focusedRow = pop.list.contains(document.activeElement);
    const n = popItems().length;
    if (n) pop.at = (pop.at + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    paintActions();
    if (focusedRow) {
      const selected = pop.list.querySelector('[aria-selected="true"]');
      (selected && !selected.disabled ? selected : pop.input).focus();
    }
    return true;
  }
  if (codeOfKey(e) === "Enter" && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const one = popItems()[pop.at];
    if (one) runAction(spec, one.key);
    return true;
  }
  const hit = actionsOf(spec).find((one) => one.combo && !bare(one.combo) && comboHits(one.combo, e));
  if (hit) {
    e.preventDefault();
    e.stopPropagation();
    runAction(spec, hit.key);
    return true;
  }
  return false;
}

document.addEventListener("pointerdown", (ev) => {
  if (pop && !pop.box.contains(ev.target) && !ev.target.closest?.("[data-pw-more]")) closeActions();
}, true);

async function copyWithWord(button, text) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {}
  if (!ok || !button?.isConnected) return ok;
  const word = document.createElement("span");
  word.className = "pw-copied";
  word.setAttribute("role", "status");
  word.textContent = phrase("copied");
  button.after(word);
  setTimeout(() => word.remove(), 1400);
  return ok;
}

function placePanels() {
  if (!raycastOn()) return;
  const bar = $("top")?.getBoundingClientRect();
  const strip = $("status-strip");
  const stripEdge = strip && strip.textContent.trim() ? strip.getBoundingClientRect().bottom : 0;
  const edge = Math.max(bar?.bottom || 0, stripEdge);
  document.body.style.setProperty("--pw-top", `${Math.round(edge + 12)}px`);
}

if (typeof ResizeObserver === "function") {
  const watch = new ResizeObserver(placePanels);
  for (const id of ["top", "status-strip"]) if ($(id)) watch.observe($(id));
}

addEventListener("resize", placePanels);

function followRaycast(fn) {
  fn(raycastOn());
  document.addEventListener("hive:experience", (event) => {
    const { experience, was } = event.detail || {};
    if (experience === "raycast" || was === "raycast") fn(raycastOn());
  });
}

const worn = new Map();

function dressHost(host, html, { on, off } = {}) {
  if (!host || worn.has(host)) return;
  const box = document.createElement("div");
  box.innerHTML = html.trim();
  const kept = [];
  for (const slot of box.querySelectorAll("[data-pw-keep]")) {
    const node = document.getElementById(slot.dataset.pwKeep);
    if (!node) { slot.remove(); continue; }
    const mark = document.createComment(slot.dataset.pwKeep);
    node.before(mark);
    const wear = [...slot.attributes].filter((attr) => attr.name !== "data-pw-keep").map((attr) => [attr.name, attr.value]);
    kept.push({ node, mark, slot, wear, was: wear.map(([name]) => [name, node.getAttribute(name)]), inner: null });
  }
  const bare = [...host.childNodes];
  for (const one of kept) if (one.slot.hasChildNodes()) one.inner = [...one.node.childNodes];
  for (const one of [...kept].reverse()) {
    for (const [name, value] of one.wear) one.node.setAttribute(name, value);
    if (one.inner) one.node.replaceChildren(...one.slot.childNodes);
    one.slot.replaceWith(one.node);
  }
  host.replaceChildren(...box.childNodes);
  worn.set(host, { bare, kept, off });
  host.classList.add("pw");
  on?.(host);
}

function undressHost(host) {
  const was = host && worn.get(host);
  if (!was) return;
  worn.delete(host);
  host.classList.remove("pw");
  was.off?.(host);
  host.replaceChildren(...was.bare);
  for (const one of was.kept) {
    for (const [name, value] of one.was) {
      if (value === null) one.node.removeAttribute(name);
      else one.node.setAttribute(name, value);
    }
    if (one.inner) one.node.replaceChildren(...one.inner);
  }
  for (const one of was.kept) if (one.mark.parentNode) one.mark.replaceWith(one.node);
}

const dressed = (host) => worn.has(host);

followRaycast((on) => {
  if (on) placePanels();
  else document.body.style.removeProperty("--pw-top");
});

export { ACTIONS_KEY, ENTER, actionKeys, actionsOpen, capsOf, closeActions, comboHits, copyWithWord, dressHost, dressed, followRaycast, footModel, keysHtml, leavePanel, openActions, panelKeys, panelOf, placePanels, registerPanel, runAction, undressHost };

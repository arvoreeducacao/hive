import { esc, phrase, svgIcon } from "./core.js";

const fold = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const looksLikeAPath = (text) => /^[/~]/.test(String(text || "").trim());

function folderSaid(path, home = "") {
  const at = String(path || "");
  if (!at) return "";
  const base = String(home || "").replace(/\/+$/, "");
  if (base && at === base) return "~";
  if (base && at.startsWith(`${base}/`)) return `~/${at.slice(base.length + 1)}`;
  return at;
}

function folderRows(seen, query = "") {
  if (!seen) return [];
  const asked = fold(query.trim());
  const starts = (one) => (asked && fold(one.name).startsWith(asked) ? 0 : 1);
  const folders = (seen.folders || [])
    .filter((one) => !asked || fold(one.name).includes(asked))
    .sort((a, b) => starts(a) - starts(b))
    .map((one) => ({ kind: "go", path: `${seen.path === "/" ? "" : seen.path}/${one.name}`, label: one.name, icon: "i-folder", note: one.git ? "git" : "" }));
  if (asked) return folders;
  return [
    { kind: "use", path: seen.path, label: phrase("open the chat here"), icon: "i-check", note: folderSaid(seen.path, seen.home) },
    ...(seen.parent ? [{ kind: "go", path: seen.parent, label: "..", icon: "i-arrow-up", note: phrase("up one folder") }] : []),
    ...folders
  ];
}

async function pullFolders(host, path) {
  return fetch(`/api/hosts/folders?id=${encodeURIComponent(host)}&path=${encodeURIComponent(path || "")}`)
    .then((answer) => answer.json())
    .catch((wrong) => ({ error: wrong.message }));
}

let menu = null;

function closeFolderMenu({ refocus = false } = {}) {
  if (!menu) return;
  const was = menu;
  menu = null;
  document.removeEventListener("pointerdown", was.away, true);
  was.el.remove();
  was.anchor.setAttribute("aria-expanded", "false");
  was.anchor.classList.remove("open");
  if (refocus) was.refocus?.();
}

function openFolderMenu(anchor, { host, start = "", onPick, refocus, pull = pullFolders }) {
  closeFolderMenu();
  const el = document.createElement("div");
  el.className = "sv-place-menu sv-folder-menu";
  el.dataset.kind = "folder";
  el.innerHTML = `<label class="q">${svgIcon("i-mag")}<input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${esc(phrase("filter, or type a path"))}" placeholder="${esc(phrase("filter, or type a path"))}" /></label><div class="list" role="listbox"></div>`;
  anchor.parentElement.appendChild(el);
  const around = anchor.getBoundingClientRect();
  const below = window.innerHeight - around.bottom - 18;
  const above = around.top - 18;
  const up = below < 220 && above > below;
  el.classList.toggle("up", up);
  el.style.maxHeight = `${Math.max(150, Math.min(300, up ? above : below))}px`;
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("open");
  const input = el.querySelector("input");
  const list = el.querySelector(".list");
  const state = { el, anchor, refocus, host, seen: null, error: "", loading: true, at: 0, shown: [], away: null, asked: 0 };

  const paint = () => {
    state.shown = folderRows(state.seen, looksLikeAPath(input.value) ? "" : input.value);
    if (state.at >= state.shown.length) state.at = Math.max(0, state.shown.length - 1);
    const rows = state.shown.map((one, at) => `<button type="button" role="option" data-at="${at}" aria-selected="${at === state.at}" class="${at === state.at ? "at" : ""}${one.kind === "use" ? " use" : ""}">${svgIcon(one.icon)}<span class="l">${esc(one.label)}</span>${one.note ? `<small>${esc(one.note)}</small>` : ""}</button>`).join("");
    const more = state.seen?.more ? `<div class="none">${esc(phrase("and {n} more — type the path to reach them", { n: state.seen.more }))}</div>` : "";
    const said = state.error ? `<div class="none bad">${esc(state.error)}</div>`
      : state.loading && !state.seen ? `<div class="none">${esc(phrase("loading…"))}</div>`
      : !rows ? `<div class="none">${esc(phrase("nothing with that name"))}</div>` : "";
    list.innerHTML = `${said}${rows}${more}`;
    el.classList.toggle("busy", state.loading);
    list.querySelector("button.at")?.scrollIntoView?.({ block: "nearest" });
  };

  const go = async (path) => {
    const asked = (state.asked += 1);
    state.loading = true;
    state.error = "";
    paint();
    const said = await pull(host, path);
    if (menu !== state || asked !== state.asked) return;
    state.loading = false;
    if ((said?.error || !Array.isArray(said?.folders)) && !state.seen && path) return void go("");
    if (said?.error || !Array.isArray(said?.folders)) state.error = said?.error || phrase("the host would not list that folder");
    else {
      state.seen = said;
      state.at = 0;
      input.value = "";
    }
    paint();
  };

  const take = (one) => {
    if (!one) return;
    if (one.kind === "go") return void go(one.path);
    closeFolderMenu();
    onPick(one.path, state.seen?.home || "");
  };

  state.away = (ev) => { if (!el.contains(ev.target) && !anchor.contains(ev.target)) closeFolderMenu(); };
  document.addEventListener("pointerdown", state.away, true);
  input.addEventListener("input", () => { state.at = 0; state.error = ""; paint(); });
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const n = state.shown.length;
      if (n) state.at = (state.at + (ev.key === "ArrowDown" ? 1 : -1) + n) % n;
      return paint();
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (looksLikeAPath(input.value)) return void go(input.value.trim());
      return take(state.shown[state.at]);
    }
    if (ev.key === "Backspace" && !input.value && state.seen?.parent) {
      ev.preventDefault();
      return void go(state.seen.parent);
    }
    if (ev.key === "Escape" || ev.key === "Tab") {
      ev.preventDefault();
      closeFolderMenu({ refocus: true });
    }
  });
  list.addEventListener("pointerdown", (ev) => ev.preventDefault());
  list.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const hit = ev.target.closest("button[data-at]");
    if (hit) take(state.shown[Number(hit.dataset.at)]);
  });
  el.addEventListener("click", (ev) => ev.stopPropagation());
  menu = state;
  paint();
  input.focus();
  go(start);
  return state;
}

function closeFolderMenuIn(host, more) {
  if (menu && host?.contains(menu.anchor)) closeFolderMenu(more);
}

export { closeFolderMenu, closeFolderMenuIn, folderRows, folderSaid, openFolderMenu };

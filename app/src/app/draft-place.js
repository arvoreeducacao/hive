import { IS_MAC, esc, phrase, svgIcon } from "./core.js";

const PROJECTS_FRESH = 60000;

const BRANCHES_FRESH = 30000;

const NO_PROJECT = "";

const projects = { at: 0, hub: "", list: [], pulling: null };

const branches = new Map();

const fold = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const BEHIND_KEY = IS_MAC ? "⌥⌘↵" : "Ctrl+Alt+↵";

const isBehindKey = (ev) => ev.key === "Enter" && ev.altKey && !ev.shiftKey && (IS_MAC ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey && !ev.metaKey);

const hubName = () => projects.hub || "hub";

function pullProjects(force = false) {
  if (!force && projects.at && Date.now() - projects.at < PROJECTS_FRESH) return Promise.resolve(projects);
  if (projects.pulling) return projects.pulling;
  projects.pulling = fetch("/api/projects")
    .then((r) => r.json())
    .then((said) => {
      if (!Array.isArray(said?.projects)) return projects;
      projects.hub = String(said.hub || "");
      projects.list = said.projects.filter((one) => one && typeof one.name === "string");
      projects.at = Date.now();
      return projects;
    })
    .catch(() => projects)
    .finally(() => { projects.pulling = null; });
  return projects.pulling;
}

const projectsKnown = () => !!projects.at;

const projectNamed = (name) => projects.list.find((one) => one.name === name) || null;

function projectOfRepo(repo) {
  const name = String(repo || "");
  if (!name || name === projects.hub) return NO_PROJECT;
  if (!projectsKnown()) return name;
  return projectNamed(name) ? name : NO_PROJECT;
}

function projectOfSeat(seat) {
  if (!seat || seat.where === "cloud") return NO_PROJECT;
  const tree = (seat.trees || [])[0];
  return projectOfRepo(tree?.repo || String(seat.cwd || "").split("/").filter(Boolean).pop() || "");
}

function branchPlaceOf(seat) {
  if (!seat || seat.where === "cloud" || seat.anon) return null;
  const tree = (seat.trees || []).find((one) => one?.path && one.branch);
  const repo = projectOfRepo(tree?.repo);
  if (!tree || !repo) return null;
  return { repo, branch: tree.branch, tree: tree.path, main: !!tree.main };
}

function pullBranches(project) {
  const kept = branches.get(project);
  if (kept && (kept.pulling || Date.now() - kept.at < BRANCHES_FRESH)) return kept.pulling || Promise.resolve(kept);
  const fresh = { at: 0, list: kept?.list || [], base: kept?.base || "", pulling: null };
  branches.set(project, fresh);
  fresh.pulling = fetch(`/api/projects/branches?project=${encodeURIComponent(project)}`)
    .then((r) => r.json())
    .then((said) => {
      fresh.list = Array.isArray(said?.branches) ? said.branches.map(String) : [];
      fresh.base = String(said?.base || "");
      fresh.at = Date.now();
      return fresh;
    })
    .catch(() => fresh)
    .finally(() => { fresh.pulling = null; });
  return fresh.pulling;
}

const baseOf = (project) => branches.get(project)?.base || projectNamed(project)?.base || "";

function placeMarkup() {
  return `<div class="sv-place">
    <div class="sv-place-line">
      <span class="sv-place-in">${esc(phrase("New chat in"))}</span>
      <button type="button" class="sv-place-pick" data-place="project" aria-haspopup="listbox" aria-expanded="false">${svgIcon("i-folder")}<span class="v"></span>${svgIcon("i-chev")}</button>
      <button type="button" class="sv-place-pick sv-place-mode" data-place="mode" aria-pressed="false"><span class="ic"></span><span class="v"></span>${svgIcon("i-swap")}</button>
      <span class="sv-place-from"></span>
      <button type="button" class="sv-place-pick" data-place="base" aria-haspopup="listbox" aria-expanded="false">${svgIcon("i-fork")}<span class="v"></span>${svgIcon("i-chev")}</button>
    </div>
  </div>`;
}

function placeSaid(place) {
  const project = place.project || "";
  const checkout = !!project && !place.tree && !place.worktree;
  const base = place.tree ? place.treeBranch : checkout ? projectNamed(project)?.branch || "" : place.base || baseOf(project);
  return {
    project: project || hubName(),
    mode: checkout ? phrase("in its checkout") : phrase("in a new worktree"),
    from: place.tree ? phrase("in the same folder, on") : checkout ? phrase("on the branch") : phrase("starting from"),
    base: base || phrase("its default branch"),
    showsMode: !!project && !place.tree,
    showsBase: !!project,
    fixedBase: !!place.tree || checkout
  };
}

function paintPlace(host, place) {
  const box = host.querySelector(".sv-place");
  if (!box) return;
  const said = placeSaid(place);
  const project = box.querySelector('[data-place="project"]');
  const base = box.querySelector('[data-place="base"]');
  const mode = box.querySelector('[data-place="mode"]');
  project.querySelector(".v").textContent = said.project;
  project.classList.toggle("none", !place.project);
  project.title = place.project ? phrase("the project this chat starts in — click to change") : phrase("the chat runs in the hub folder — click to pick a project");
  mode.hidden = !said.showsMode;
  mode.disabled = !!place.sending;
  mode.setAttribute("aria-pressed", String(!!place.worktree));
  mode.querySelector(".ic").innerHTML = svgIcon(place.worktree ? "i-fork" : "i-folder");
  mode.querySelector(".v").textContent = said.mode;
  mode.title = place.worktree ? phrase("a folder and a branch of its own — click to use the project's checkout") : phrase("the project's own folder — click to open a new worktree instead");
  box.querySelector(".sv-place-from").textContent = said.from;
  box.querySelector(".sv-place-from").hidden = !said.showsBase;
  base.hidden = !said.showsBase;
  project.disabled = !!place.sending;
  base.disabled = said.fixedBase || !!place.sending;
  base.querySelector(".v").textContent = said.base;
  base.title = place.tree ? phrase("it shares the folder of the chat it came from") : said.fixedBase ? phrase("the branch the project's checkout is on") : phrase("the branch the new worktree starts from");
  box.classList.toggle("same-folder", said.fixedBase);
}

function projectItems(place, recent) {
  const first = recent && projectNamed(recent) ? [recent] : [];
  const rest = projects.list.map((one) => one.name).filter((name) => !first.includes(name));
  return [
    { value: NO_PROJECT, label: hubName(), icon: "i-folder", note: phrase("default"), on: !place.project },
    { sep: true },
    ...[...first, ...rest].map((name) => ({ value: name, label: name, icon: "i-folder", note: name === recent ? phrase("last used") : "", on: name === place.project }))
  ];
}

function baseItems(place) {
  const kept = branches.get(place.project);
  const base = baseOf(place.project);
  const chosen = place.base || base;
  return (kept?.list.length ? kept.list : [base].filter(Boolean)).map((name) => ({
    value: name, label: name, icon: "i-fork", note: name === base ? phrase("default") : "", on: name === chosen
  }));
}

let menu = null;

function closePlaceMenu({ refocus = false } = {}) {
  if (!menu) return;
  const was = menu;
  menu = null;
  document.removeEventListener("pointerdown", was.away, true);
  was.el.remove();
  was.anchor.setAttribute("aria-expanded", "false");
  was.anchor.classList.remove("open");
  if (refocus) was.refocus?.();
}

function openPlaceMenu(anchor, { kind, items, onPick, refocus, loading = false }) {
  closePlaceMenu();
  const el = document.createElement("div");
  el.className = "sv-place-menu";
  el.dataset.kind = kind;
  el.innerHTML = `<label class="q">${svgIcon("i-mag")}<input spellcheck="false" autocomplete="off" aria-label="${esc(kind === "project" ? phrase("search a project") : phrase("search a branch"))}" placeholder="${esc(kind === "project" ? phrase("search a project") : phrase("search a branch"))}" /></label><div class="list" role="listbox"></div>`;
  const box = anchor.closest(".sv-place");
  box.appendChild(el);
  el.style.left = `${Math.max(0, Math.min(anchor.offsetLeft, box.clientWidth - el.offsetWidth))}px`;
  el.style.top = `${anchor.offsetTop + anchor.offsetHeight + 6}px`;
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("open");
  const input = el.querySelector("input");
  const list = el.querySelector(".list");
  const state = { el, anchor, refocus, items: () => items(), at: 0, shown: [], loading, away: null };
  const pick = (one) => {
    closePlaceMenu();
    onPick(one.value);
  };
  const paint = () => {
    const query = fold(input.value.trim());
    const all = state.items();
    state.shown = all.filter((one) => !one.sep && (!query || fold(one.label).includes(query) || fold(one.note).includes(query)));
    if (state.at >= state.shown.length) state.at = Math.max(0, state.shown.length - 1);
    const rows = query ? state.shown : all;
    list.innerHTML = rows.length ? rows.map((one) => one.sep ? '<div class="sep" role="separator"></div>' : (() => {
      const at = state.shown.indexOf(one);
      return `<button type="button" role="option" data-at="${at}" aria-selected="${at === state.at}" class="${at === state.at ? "at" : ""}${one.on ? " on" : ""}">${svgIcon(one.icon)}<span class="l">${esc(one.label)}</span>${one.note ? `<small>${esc(one.note)}</small>` : ""}${one.on ? `<span class="ck">${svgIcon("i-check")}</span>` : ""}</button>`;
    })()).join("") : `<div class="none">${esc(state.loading ? phrase("loading…") : phrase("nothing with that name"))}</div>`;
    list.querySelector("button.at")?.scrollIntoView?.({ block: "nearest" });
  };
  state.repaint = (more = {}) => { Object.assign(state, more); paint(); };
  state.away = (ev) => { if (!el.contains(ev.target) && !anchor.contains(ev.target)) closePlaceMenu(); };
  document.addEventListener("pointerdown", state.away, true);
  input.addEventListener("input", () => { state.at = 0; paint(); });
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
      const one = state.shown[state.at];
      if (one) pick(one);
      return;
    }
    if (ev.key === "Escape" || ev.key === "Tab") {
      ev.preventDefault();
      closePlaceMenu({ refocus: true });
    }
  });
  list.addEventListener("pointerdown", (ev) => ev.preventDefault());
  list.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const hit = ev.target.closest("button[data-at]");
    const one = hit && state.shown[Number(hit.dataset.at)];
    if (one) pick(one);
  });
  el.addEventListener("click", (ev) => ev.stopPropagation());
  const on = state.items().filter((one) => !one.sep).findIndex((one) => one.on);
  state.at = Math.max(0, on);
  menu = state;
  paint();
  input.focus();
  return state;
}

function repaintPlaceMenu(kind, more) {
  if (menu?.el.dataset.kind !== kind) return;
  const on = menu.items().filter((one) => !one.sep).findIndex((one) => one.on);
  menu.repaint({ ...more, at: Math.max(0, on) });
}

export {
  BEHIND_KEY, NO_PROJECT, baseItems, isBehindKey, baseOf, branchPlaceOf, closePlaceMenu, openPlaceMenu, paintPlace, placeMarkup,
  projectItems, projectNamed, projectOfRepo, projectOfSeat, projectsKnown, pullBranches, pullProjects, repaintPlaceMenu
};

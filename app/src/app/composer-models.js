import { catalogRow, paintPills, seatAgent } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { esc, phrase, st } from "./core.js";
import {
  checkCustomModel, customModelErrorText, customModelPlaceholder, customModelsOf, offersFastMode, pinProject, projectPinOf, rememberPick,
  removeCustomModel, samePick, saveCustomModel, unpinProject, withCustomModels
} from "./model-memory.js";
import { onSeatEvent } from "./seat-events.js";
import { svLine } from "./structured-seats.js";

const LUCIDE = {
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};

const lucide = (name, cls = "") => `<svg class="cp-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name] || ""}</svg>`;

function projectOfSession(session) {
  const tree = Array.isArray(session?.trees) ? session.trees.find((one) => one?.repo) : null;
  return tree?.repo || String(session?.cwd || "").split("/").filter(Boolean).pop() || "";
}

function seatProject(e) {
  if (!e) return "";
  if (e.draft) return String(e.project || "");
  const where = e.where || "local";
  const found = (st.data?.sessions || []).find((one) => one.name === e.name && (one.where || "local") === where);
  return projectOfSession(found);
}

function dressCatalog(e, models) {
  const raw = Array.isArray(models) ? models.filter((row) => !row.custom) : [];
  e.catalogRaw = raw;
  return withCustomModels(raw, customModelsOf(seatAgent(e)));
}

function redressCatalog(e) {
  if (!e.catalogRaw && !e.catalog) return;
  e.catalog = withCustomModels(e.catalogRaw || (e.catalog || []).filter((row) => !row.custom), customModelsOf(seatAgent(e)));
  paintPills(e);
}

const seatPick = (e) => ({ agent: seatAgent(e), model: e.model || "" });

function rememberSeatPick(e, traits = {}) {
  if (!e || e.mirror) return;
  rememberPick({ ...seatPick(e), ...traits });
}

function seatFastOffered(e) {
  if (!e || e.mirror || seatAgent(e) !== "claude") return false;
  if (e.draft && e.draftKind === "terminal") return false;
  return offersFastMode(catalogRow(e));
}

function setSeatFast(e, on) {
  const wanted = on === true;
  if (!!e.fast === wanted) return;
  const was = !!e.fast;
  e.fast = wanted;
  rememberSeatPick(e, { fast: wanted });
  paintPills(e);
  e.menu?.repaint?.();
  if (e.draft) return;
  svLine(e, "sv-meta", `fast mode → ${wanted ? "on" : "off"}`);
  svCmd(e, { type: "control", op: "setFast", on: wanted }).then((r) => {
    if (r?.ok) {
      e.fast = r.data?.fast === true;
      paintPills(e);
      return;
    }
    if (r?.silent) return;
    e.fast = was;
    paintPills(e);
    e.menu?.repaint?.();
    svLine(e, "sv-meta warn", r?.error || phrase("the session did not take it"));
  });
}

function paintFastMark(e, pill) {
  if (!pill) return;
  const on = !!e.fast && seatFastOffered(e);
  pill.classList.toggle("fast", on);
  pill.querySelector(":scope > .cp-fast")?.remove();
  if (!on) return;
  const mark = document.createElement("span");
  mark.className = "cp-fast";
  mark.innerHTML = `${lucide("zap")}<span class="cp-sr"></span>`;
  mark.querySelector(".cp-sr").textContent = phrase("Fast mode on");
  const name = pill.querySelector(":scope > .txt");
  if (name) name.after(mark);
  else pill.append(mark);
}

function speedHtml(e) {
  const fast = !!e.fast;
  const segment = (value, label) => `<button type="button" role="radio" class="cp-seg${value === fast ? " on" : ""}" data-fast="${value ? "1" : "0"}" aria-checked="${value === fast}">${esc(label)}</button>`;
  return `<div class="cp-speed" role="radiogroup" aria-label="${esc(phrase("Fast Mode"))}">${segment(false, phrase("Standard"))}${segment(true, phrase("Fast"))}</div>`;
}

function pinHtml(e, project) {
  const pin = projectPinOf(project);
  const on = samePick(pin, seatPick(e));
  const said = phrase("New chats in {project}", { project });
  return `<button type="button" class="cp-pin${on ? " on" : ""}" aria-pressed="${on}" aria-label="${esc(said)}" title="${esc(`${said} · ${phrase("Model for new chats in this project.")}`)}">${lucide("pin")}</button>`;
}

function customHtml(e, form) {
  const row = catalogRow(e);
  const mine = customModelsOf(seatAgent(e)).some((one) => one.slug === row?.value);
  if (form.open) {
    return `<div class="cp-custom-form"><input class="cp-custom-slug" spellcheck="false" autocomplete="off" aria-label="${esc(phrase("Model slug"))}" placeholder="${esc(customModelPlaceholder(seatAgent(e)))}" value="${esc(form.slug)}">`
      + `<input class="cp-custom-name" spellcheck="false" autocomplete="off" aria-label="${esc(phrase("Display name"))}" placeholder="${esc(phrase("Display name"))}" value="${esc(form.name)}">`
      + `<button type="button" class="cp-custom-go">${esc(phrase("Add"))}</button><button type="button" class="cp-custom-cancel">${esc(phrase("Cancel"))}</button>`
      + `${form.error ? `<span class="cp-custom-error" role="alert">${esc(phrase(customModelErrorText(form.error)))}</span>` : ""}</div>`;
  }
  const remove = mine ? `<button type="button" class="cp-custom-drop" title="${esc(phrase("Remove custom model"))}" aria-label="${esc(phrase("Remove custom model"))}">${lucide("trash")}</button>` : "";
  return `${remove}<button type="button" class="cp-custom-add" aria-label="${esc(phrase("Add custom model"))}" title="${esc(phrase("Add custom model"))}">${lucide("plus")}</button>`;
}

function paintModelFoot(e, menu, { kind, ownAgent = true } = {}) {
  const panel = menu?.querySelector(".panel");
  if (!panel) return;
  let foot = panel.querySelector(":scope > .cp-pick-foot");
  if (kind !== "model" || !ownAgent || !e.catalog || e.mirror) {
    foot?.remove();
    return;
  }
  if (!foot) {
    foot = document.createElement("div");
    foot.className = "cp-pick-foot";
    foot.addEventListener("mousedown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
    foot.addEventListener("click", (ev) => footClick(e, menu, foot, ev));
    foot.addEventListener("input", (ev) => {
      if (ev.target.matches?.(".cp-custom-slug")) foot.form.slug = ev.target.value;
      if (ev.target.matches?.(".cp-custom-name")) foot.form.name = ev.target.value;
    });
    foot.addEventListener("keydown", (ev) => {
      if (!ev.target.matches?.("input")) return;
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        return void addCustomFrom(e, menu, foot);
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        foot.form = { open: false, slug: "", name: "", error: "" };
        paintModelFoot(e, menu, { kind, ownAgent });
        menu.querySelector(".q input")?.focus();
      }
    });
    foot.form = { open: false, slug: "", name: "", error: "" };
    panel.append(foot);
  }
  const project = seatProject(e);
  const parts = [
    seatFastOffered(e) ? speedHtml(e) : "",
    `<span class="cp-foot-fill"></span>`,
    project ? pinHtml(e, project) : "",
    customHtml(e, foot.form)
  ];
  foot.innerHTML = parts.join("");
  foot.dataset.kind = kind;
  if (foot.form.open) {
    const slug = foot.querySelector(".cp-custom-slug");
    if (slug && !foot.contains(document.activeElement)) slug.focus();
  }
}

function footClick(e, menu, foot, ev) {
  const button = ev.target.closest("button");
  if (!button || !foot.contains(button)) return;
  ev.stopPropagation();
  const repaint = () => paintModelFoot(e, menu, { kind: foot.dataset.kind || "model" });
  if (button.matches(".cp-custom-go")) return addCustomFrom(e, menu, foot);
  if (button.matches(".cp-seg")) return setSeatFast(e, button.dataset.fast === "1");
  if (button.matches(".cp-pin")) {
    const project = seatProject(e);
    if (samePick(projectPinOf(project), seatPick(e))) unpinProject(project);
    else pinProject(project, { ...seatPick(e), ...(e.effort ? { effort: e.effort } : {}), fast: !!e.fast });
    return repaint();
  }
  if (button.matches(".cp-custom-add")) {
    foot.form = { open: true, slug: "", name: "", error: "" };
    return repaint();
  }
  if (button.matches(".cp-custom-cancel")) {
    foot.form = { open: false, slug: "", name: "", error: "" };
    repaint();
    return void menu.querySelector(".q input")?.focus();
  }
  if (button.matches(".cp-custom-drop")) {
    const row = catalogRow(e);
    if (row && removeCustomModel(seatAgent(e), row.value)) {
      redressCatalog(e);
      e.menu?.repaint?.();
    }
  }
}

function addCustomFrom(e, menu, foot) {
  const slug = foot.querySelector(".cp-custom-slug")?.value || "";
  const name = foot.querySelector(".cp-custom-name")?.value || "";
  const agent = seatAgent(e);
  const said = checkCustomModel({ slug, name, rows: e.catalogRaw || (e.catalog || []).filter((row) => !row.custom), customs: customModelsOf(agent) });
  if (said.error) {
    foot.form = { open: true, slug, name, error: said.error };
    return paintModelFoot(e, menu, { kind: foot.dataset.kind || "model" });
  }
  saveCustomModel(agent, said.entry);
  foot.form = { open: false, slug: "", name: "", error: "" };
  redressCatalog(e);
  e.menu?.repaint?.();
  menu.querySelector(".q input")?.focus();
}

onSeatEvent((e, ev) => {
  if (ev?.type !== "driver" || ev.subtype !== "fast_changed") return;
  e.fast = ev.on === true;
  paintPills(e);
  e.menu?.repaint?.();
});

export { dressCatalog, lucide, paintFastMark, paintModelFoot, projectOfSession, redressCatalog, rememberSeatPick, seatFastOffered, seatProject, setSeatFast };

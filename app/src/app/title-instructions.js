import { saveConfig } from "./brand-face.js";
import { $, phrase, st } from "./core.js";
import { noTitleInstructions, projectOfChat } from "/assets/title-instructions.mjs";

const EVERY_PROJECT = "";

st.titleInstructions = noTitleInstructions();

let scope = EVERY_PROJECT;

const ownOf = (project) => (project ? st.titleInstructions.projects[project] || "" : st.titleInstructions.all);

function knownProjects() {
  const seen = new Set(Object.keys(st.titleInstructions.projects));
  for (const one of st.data?.sessions || []) {
    const project = projectOfChat(one);
    if (project) seen.add(project);
  }
  if (scope) seen.add(scope);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function scopeOptions() {
  return [
    { value: EVERY_PROJECT, label: phrase("All projects") },
    ...knownProjects().map((project) => ({ value: project, label: ownOf(project) ? phrase("{project} · own instructions", { project }) : project }))
  ];
}

function noteOf() {
  if (scope) return ownOf(scope) ? phrase("Only for {project}. Empty, it uses the instructions for all projects.", { project: scope }) : phrase("{project} uses the instructions for all projects until you write its own.", { project: scope });
  const owners = Object.keys(st.titleInstructions.projects).sort((a, b) => a.localeCompare(b));
  if (!owners.length) return phrase("The default for every project.");
  const list = owners.join(", ");
  return owners.length === 1 ? phrase("The default. {list} has its own instructions.", { list }) : phrase("The default. {list} have their own instructions.", { list });
}

function titleInstructionsViewModel() {
  return {
    options: scopeOptions(),
    scope,
    text: ownOf(scope),
    placeholder: scope ? phrase("Empty uses the instructions for all projects.") : phrase("Keep titles to a few words. Lead with the main subject."),
    note: noteOf(),
    canReset: !!ownOf(scope)
  };
}

function paintTitleInstructions() {
  const pick = $("f-title-scope");
  const field = $("f-title-rules");
  if (!pick || !field) return;
  const view = titleInstructionsViewModel();
  pick.replaceChildren(...view.options.map((one) => {
    const option = document.createElement("option");
    option.value = one.value;
    option.textContent = one.label;
    return option;
  }));
  pick.value = view.scope;
  if (field !== document.activeElement) field.value = view.text;
  field.placeholder = view.placeholder;
  $("f-title-note").textContent = view.note;
  $("f-title-reset").disabled = !view.canReset;
}

function adoptTitleInstructions(r) {
  const held = r?.config?.titleInstructions;
  st.titleInstructions = held ? { all: String(held.all || ""), projects: { ...(held.projects || {}) } } : noTitleInstructions();
  paintTitleInstructions();
}

function keepTitleInstructions(text) {
  const said = String(text ?? "").trim();
  if (said === ownOf(scope)) return paintTitleInstructions();
  const next = { all: st.titleInstructions.all, projects: { ...st.titleInstructions.projects } };
  if (!scope) next.all = said;
  else if (said) next.projects[scope] = said;
  else delete next.projects[scope];
  st.titleInstructions = next;
  paintTitleInstructions();
  return saveConfig({ titleInstructions: next }).then((r) => { if (!r?.refused && !r?.error) adoptTitleInstructions(r); }).catch(() => {});
}

function pickTitleScope(project) {
  scope = String(project || EVERY_PROJECT);
  const field = $("f-title-rules");
  if (field) field.value = ownOf(scope);
  paintTitleInstructions();
}

function resetTitleInstructions() {
  const field = $("f-title-rules");
  if (field) field.value = "";
  return keepTitleInstructions("");
}

if (typeof document !== "undefined" && $("f-title-rules")) {
  $("f-title-rules").addEventListener("change", (ev) => keepTitleInstructions(ev.target.value));
  $("f-title-scope").addEventListener("change", (ev) => pickTitleScope(ev.target.value));
  $("f-title-scope").addEventListener("focus", () => paintTitleInstructions());
  $("f-title-reset").addEventListener("click", () => resetTitleInstructions());
  $("pref-nav")?.addEventListener("click", (ev) => { if (ev.target.closest?.('[data-pane="conversation"]')) paintTitleInstructions(); });
}

export { adoptTitleInstructions, keepTitleInstructions, paintTitleInstructions, pickTitleScope, resetTitleInstructions, titleInstructionsViewModel };

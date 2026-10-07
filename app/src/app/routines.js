import { $, esc, every, phrase, raycastOn, solidMounts, st, stopBeat } from "./core.js";
import { goTo, pull, releaseKeyboard } from "./focus-navigation.js";
import { followRaycast, footModel, leavePanel, openActions, panelOf, registerPanel, runAction } from "./panel-window.js";
import { ask, closePortaria, portariaOnScreen } from "./pod.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";
import { providerName, readyAgents } from "./providers.js";

const RT_BEAT = 30000;

const TRIGGER_SAY = {
  hourly: () => phrase("every hour, on the hour"),
  daily: (r) => phrase("every day at {time}", { time: r.time }),
  weekdays: (r) => phrase("weekdays at {time}", { time: r.time }),
  weekly: (r) => phrase("every {day} at {time}", { day: weekdaySay(r.weekday ?? 1), time: r.time }),
  cron: (r) => `cron ${r.cron}`
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const weekdaySay = (n) => phrase(WEEKDAYS[n] || "monday");

st.routines = null;

st.routinesNow = 0;

st.routineEdit = null;

st.routineTrouble = "";

st.routinePick = "";

st.routineQuery = "";

const routinesOnScreen = () => !$("routines").hidden;

function inSay(ms) {
  if (ms <= 0) return phrase("now");
  const min = Math.round(ms / 60000);
  if (min < 60) return phrase("in {n} min", { n: Math.max(1, min) });
  const h = Math.floor(min / 60);
  if (h < 48) return phrase("in {h}h {m}", { h, m: String(min % 60).padStart(2, "0") });
  return phrase("in {n} days", { n: Math.round(h / 24) });
}

function lastRunModel(r) {
  const run = (r.runs || [])[0];
  if (!run) return null;
  const clock = new Date(run.at).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (run.outcome === "ran") return { cls: "ran", seat: run.seat || "", say: phrase("{when} · opened", { when: clock }), hint: phrase("open that chat") };
  if (run.outcome === "skipped") return { cls: "skipped", seat: "", say: phrase("{when} · skipped — {why}", { when: clock, why: run.why || phrase("the check said no") }), hint: phrase("the precheck returned non-zero, so no chat was opened") };
  if (run.outcome === "missed") return { cls: "missed", seat: "", say: phrase("{when} · missed — the app was not up", { when: clock }), hint: phrase("a run more than 30 minutes late is not run at all") };
  return { cls: "failed", seat: "", say: phrase("{when} · failed — {why}", { when: clock, why: run.why || "" }), hint: "" };
}

function routineRowModel(r, now) {
  return {
    key: r.id, id: r.id, name: r.name, on: !!r.enabled, editing: st.routineEdit?.id === r.id,
    state: r.enabled ? phrase("on") : phrase("off"),
    where: r.where === "cloud" ? phrase("cloud") : "",
    schedule: (TRIGGER_SAY[r.trigger] || (() => ""))(r),
    next: r.enabled && r.nextAt ? phrase("next {when}", { when: inSay(r.nextAt - now) }) : "",
    precheck: r.precheck || "", precheckHint: phrase("runs first — a non-zero exit skips the round"),
    last: lastRunModel(r),
    runSay: phrase("run now"), toggleSay: r.enabled ? phrase("turn off") : phrase("turn on"), editSay: phrase("edit"), removeSay: phrase("remove")
  };
}

function routinesViewModel() {
  const title = phrase("Routines");
  if (st.routineTrouble) return { trouble: true, title, note: st.routineTrouble };
  const list = st.routines || [];
  const now = st.routinesNow || Date.now();
  return {
    title,
    top: { title, read: list.length ? (list.length === 1 ? phrase("1 routine") : phrase("{n} routines", { n: list.length })) : "", create: phrase("new routine") },
    sub: phrase("A routine is a chat that opens itself on a schedule, with the same mission every time. A shell line can run first: when it exits non-zero, the round is skipped and nothing opens."),
    rows: list.map((r) => routineRowModel(r, now)),
    none: st.routines ? phrase("No routine yet. The first one is a mission you keep typing by hand — weekday triage, a nightly summary, a check on the inbox.") : phrase("reading the routines…"),
    foot: `<b>${phrase("Where it runs")}</b> ${phrase("is this app: a routine fires only while the Hive is open on this machine. A run more than 30 minutes late is marked missed, not run. Every chat a routine opens carries the routine's name as its request, so the day view groups them.")}`
  };
}

const NEW_ROUTINE_KEY = { alt: true, code: "KeyN" };

const RUN_ROUTINE_KEY = { meta: true, code: "Enter" };

const routineShown = () => (st.routines || []).filter((r) => {
  const q = st.routineQuery.trim().toLowerCase();
  return !q || `${r.name} ${r.prompt || ""} ${r.repo || ""}`.toLowerCase().includes(q);
});

const routineWindowRow = (r, now) => ({ ...routineRowModel(r, now), here: r.id === st.routinePick, agent: providerName(r.agent || "claude"), prompt: r.prompt || "" });

function routineChrome(title, rows) {
  if (!rows.some((row) => row.id === st.routinePick)) st.routinePick = rows[0]?.id || "";
  const picked = rows.find((row) => row.id === st.routinePick) || null;
  return {
    raycast: true,
    head: {
      icon: "i-clock", title, closeId: "rt-close", closeSay: phrase("close"),
      count: (st.routines || []).length === 1 ? phrase("1 routine") : phrase("{n} routines", { n: (st.routines || []).length }),
      search: { placeholder: phrase("Search a routine or its mission"), value: st.routineQuery }, hints: []
    },
    rows: rows.map((row) => ({ ...row, here: row.id === st.routinePick })),
    picked, editing: !!st.routineEdit, loaded: !!st.routines,
    labels: { where: phrase("Where it runs"), local: phrase("local · your machine"), agent: phrase("Agent"), precheck: phrase("Precheck"), last: phrase("Last round"), never: phrase("never ran"), mission: phrase("The mission") },
    bar: footModel(panelOf("routines"), { icon: "i-clock", title, trail: [picked?.name || ""] })
  };
}

function routinesWindowModel() {
  const title = phrase("Routines");
  if (st.routineTrouble) {
    return {
      ...routineChrome(title, []), loaded: true, trouble: true, title, note: st.routineTrouble, sub: "", none: "", foot: "",
      blank: { icon: "i-warn", warn: true, head: phrase("The routines did not load"), say: phrase("The server did not answer when asked for the routines."), detail: st.routineTrouble, copySay: phrase("copy") }
    };
  }
  const list = st.routines || [];
  const now = st.routinesNow || Date.now();
  const rows = routineShown().map((r) => routineWindowRow(r, now));
  return {
    ...routinesViewModel(),
    ...routineChrome(title, rows),
    blank: list.length
      ? { icon: "i-clock", head: phrase("Nothing matches"), say: phrase("No routine by that name.") }
      : { icon: "i-clock", head: phrase("No routine yet"), say: phrase("The first one is a mission you keep typing by hand — weekday triage, a nightly summary, a check on the inbox.") }
  };
}

let routinesSolid = null;

function paintRoutines() {
  if (raycastOn()) routinesSolid.show(routinesWindowModel());
  else routinesSolid.show(routinesViewModel());
  paintRoutineForm();
}

async function pullRoutines() {
  try {
    const r = await fetch("/api/routines");
    const d = await r.json();
    st.routines = d.routines || [];
    st.routinesNow = d.now || Date.now();
    st.routineTrouble = "";
  } catch {
    st.routineTrouble = phrase("could not reach the server");
  }
  if (routinesOnScreen()) paintRoutines();
}

const ROUTINE_AGENTS = ["claude", "codex", "kimi", "kiro", "cursor", "opencode"];

const FIELD = (id, label, control) => `<label class="rt-field" for="${id}"><span>${label}</span>${control}</label>`;

function routineFormHtml(edit) {
  const r = edit.draft;
  const option = (value, say, on) => `<option value="${esc(value)}" ${on ? "selected" : ""}>${say}</option>`;
  return `<form class="rt-editor" id="rt-editor">
    <div class="rt-grid">
      ${FIELD("rt-name", phrase("name — also the name of the chat"), `<input id="rt-name" maxlength="60" value="${esc(r.name)}" placeholder="${phrase("weekday triage")}">`)}
      ${FIELD("rt-trigger", phrase("when"), `<select id="rt-trigger">${["hourly", "daily", "weekdays", "weekly", "cron"].map((t) => option(t, phrase(t), r.trigger === t)).join("")}</select>`)}
      ${FIELD("rt-time", phrase("time"), `<input id="rt-time" value="${esc(r.time)}" placeholder="09:00" ${r.trigger === "hourly" || r.trigger === "cron" ? "disabled" : ""}>`)}
      ${FIELD("rt-weekday", phrase("day of the week"), `<select id="rt-weekday" ${r.trigger === "weekly" ? "" : "disabled"}>${WEEKDAYS.map((d, i) => option(String(i), weekdaySay(i), Number(r.weekday) === i)).join("")}</select>`)}
      ${FIELD("rt-cron", phrase("cron line"), `<input id="rt-cron" value="${esc(r.cron)}" placeholder="0 18 * * 1-5" ${r.trigger === "cron" ? "" : "disabled"}>`)}
      ${FIELD("rt-where", phrase("where it runs"), `<select id="rt-where">${option("local", phrase("local · your machine"), r.where !== "cloud")}${option("cloud", phrase("cloud · server"), r.where === "cloud")}</select>`)}
      ${FIELD("rt-agent", phrase("agent"), `<select id="rt-agent">${ROUTINE_AGENTS.filter((a) => readyAgents(r.agent).includes(a)).map((a) => option(a, providerName(a), r.agent === a)).join("")}</select>`)}
      ${FIELD("rt-repo", phrase("repo (cloud)"), `<input id="rt-repo" value="${esc(r.repo)}" placeholder="${phrase("the repo the cloud chat clones")}" ${r.where === "cloud" ? "" : "disabled"}>`)}
    </div>
    ${FIELD("rt-prompt", phrase("the mission, the same every time"), `<textarea id="rt-prompt" rows="4" spellcheck="false" placeholder="${phrase("what it solves, with a definition of done and the status protocol")}">${esc(r.prompt)}</textarea>`)}
    ${FIELD("rt-precheck", phrase("precheck — a shell line; exit non-zero and the round is skipped"), `<input id="rt-precheck" value="${esc(r.precheck)}" placeholder="gh pr list --search 'review-requested:@me' --json number -q '.[0].number'" spellcheck="false">`)}
    <div class="pr-actions">
      <button class="btn" type="submit" id="rt-save">${edit.id ? phrase("save the routine") : phrase("create the routine")}</button>
      <button class="btn" type="button" id="rt-cancel">${phrase("cancel")} <kbd>esc</kbd></button>
      <span class="notice ${edit.error ? "armed" : ""}" id="rt-error">${esc(edit.error || "")}</span>
    </div>
  </form>`;
}

function readRoutineForm() {
  return {
    name: $("rt-name").value, prompt: $("rt-prompt").value, trigger: $("rt-trigger").value, time: $("rt-time").value,
    weekday: Number($("rt-weekday").value), cron: $("rt-cron").value, where: $("rt-where").value, agent: $("rt-agent").value,
    repo: $("rt-repo").value, precheck: $("rt-precheck").value
  };
}

function paintRoutineForm() {
  const host = $("rt-form");
  if (!host) return;
  if (!st.routineEdit) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = routineFormHtml(st.routineEdit);
  const form = $("rt-editor");
  const remember = () => { st.routineEdit.draft = { ...st.routineEdit.draft, ...readRoutineForm() }; };
  form.addEventListener("input", remember);
  form.addEventListener("change", (ev) => {
    remember();
    if (ev.target.id === "rt-trigger" || ev.target.id === "rt-where") paintRoutineForm();
  });
  form.addEventListener("submit", (ev) => { ev.preventDefault(); saveRoutine(); });
  form.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Escape") { ev.preventDefault(); closeRoutineForm(); }
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); saveRoutine(); }
  });
  $("rt-cancel").addEventListener("click", closeRoutineForm);
  (st.routineEdit.id ? $("rt-prompt") : $("rt-name")).focus();
}

const BLANK = { name: "", prompt: "", trigger: "weekdays", time: "09:00", weekday: 1, cron: "", where: "local", agent: "claude", repo: "", precheck: "" };

function openRoutineForm(routine) {
  st.routineEdit = { id: routine?.id || "", error: "", draft: { ...BLANK, ...(routine || {}) } };
  paintRoutines();
  $("rt-form")?.scrollIntoView({ block: "nearest" });
}

function closeRoutineForm() {
  st.routineEdit = null;
  paintRoutines();
}

async function saveRoutine() {
  if (!st.routineEdit) return;
  const body = { ...readRoutineForm(), id: st.routineEdit.id || undefined };
  const d = await fetch("/api/routines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch((e) => ({ error: e.message }));
  if (!d.ok) { st.routineEdit.error = d.error || phrase("the server did not take it"); st.routineEdit.draft = { ...st.routineEdit.draft, ...body }; return paintRoutines(); }
  st.routineEdit = null;
  await pullRoutines();
}

async function tellRoutines(path, body) {
  const d = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({}));
  await pullRoutines();
  return d;
}

async function removeRoutine(id) {
  const r = (st.routines || []).find((one) => one.id === id);
  if (!r) return;
  const yes = await ask(phrase("remove {name}?", { name: r.name }), esc(phrase("the routine stops for good — the chats it already opened stay where they are")), phrase("remove"));
  if (!yes) return;
  await tellRoutines("/api/routines/remove", { id });
}

async function runRoutineNow(id) {
  const r = (st.routines || []).find((one) => one.id === id);
  if (!r) return;
  const d = await tellRoutines("/api/routines/run", { id, force: !r.precheck });
  if (d.run?.outcome === "ran") await pull();
}

function pickRoutine(id) {
  st.routinePick = id;
  if (st.routineEdit && st.routineEdit.id !== id) st.routineEdit = null;
  paintRoutines();
  $("routines").querySelector(`[data-routine="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepRoutine(step) {
  const shown = routineShown();
  if (!shown.length) return;
  const at = shown.findIndex((r) => r.id === st.routinePick);
  pickRoutine(shown[(at + step + shown.length) % shown.length].id);
}

function routineActions() {
  const r = (st.routines || []).find((one) => one.id === st.routinePick);
  const create = { key: "new", say: phrase("New routine"), icon: "i-plus", combo: NEW_ROUTINE_KEY, foot: true, go: () => openRoutineForm(null) };
  if (!r || st.routineEdit) return [create];
  return [
    { key: "run", say: phrase("Run now"), icon: "i-play", primary: true, combo: RUN_ROUTINE_KEY, go: () => runRoutineNow(r.id) },
    create,
    { key: "toggle", say: r.enabled ? phrase("Turn off") : phrase("Turn on"), icon: "i-bolt", go: () => tellRoutines("/api/routines/toggle", { id: r.id, enabled: !r.enabled }) },
    { key: "edit", say: phrase("Edit"), icon: "i-pen", go: () => openRoutineForm(r) },
    { key: "remove", say: phrase("Remove"), icon: "i-close", group: phrase("Routine"), go: () => removeRoutine(r.id) }
  ];
}

registerPanel("routines", {
  el: () => $("routines"),
  search: () => $("routines").querySelector("[data-pw-search]"),
  list: () => $("routines").querySelector(".pw-list"),
  actions: routineActions,
  step: stepRoutine,
  subject: () => (st.routines || []).find((one) => one.id === st.routinePick)?.name || phrase("Routines")
});

function openRoutines() {
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  $("routines").hidden = false;
  paintRoutines();
  if (raycastOn()) $("routines").querySelector("[data-pw-search]")?.focus();
  pullRoutines();
  every("routines", RT_BEAT, pullRoutines);
}

function closeRoutines() {
  if (raycastOn()) leavePanel($("routines"));
  $("routines").hidden = true;
  stopBeat("routines");
}

solidMounts.push((hive) => {
  routinesSolid = hive.mountRoutines($("routines"), {
    actions: {
      create: () => openRoutineForm(null),
      edit: (id) => openRoutineForm((st.routines || []).find((one) => one.id === id)),
      toggle: (id, enabled) => tellRoutines("/api/routines/toggle", { id, enabled }),
      remove: (id) => removeRoutine(id),
      run: (id) => runRoutineNow(id),
      goto: (name) => { closeRoutines(); goTo(name); },
      close: () => closeRoutines(),
      pick: (id) => { pickRoutine(id); $("routines").querySelector("[data-pw-search]")?.focus(); },
      search: (text) => { st.routineQuery = text; paintRoutines(); },
      act: (key) => runAction(panelOf("routines"), key),
      more: () => openActions(panelOf("routines"))
    }
  });
});

followRaycast((on) => {
  $("routines").classList.toggle("pw", on);
  if (routinesSolid && routinesOnScreen()) paintRoutines();
});

$("btn-routines")?.addEventListener("click", () => (routinesOnScreen() ? closeRoutines() : openRoutines()));

export { pickRoutine, routineActions, routinesWindowModel, stepRoutine, RT_BEAT, closeRoutines, inSay, lastRunModel, openRoutineForm, openRoutines, paintRoutines, pullRoutines, routineFormHtml, routineRowModel, routinesOnScreen, routinesViewModel, saveRoutine };

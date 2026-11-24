import { svCmd } from "./chat-stretches.js";
import { svConvLine, svConvShow } from "./conversation-model.js";
import { esc, phrase } from "./core.js";
import { liveFor } from "./timeline-rows.js";

const TASK_DONE = /^(completed|failed|cancell?ed|killed|stopped|error|timed_out)$/i;

const BG_STALE = 6 * 60 * 60 * 1000;

const STARTS_KEPT = 200;

const STOP_PATIENCE = 15000;

const DETAIL_STEPS = 40;

const KINDS = {
  subagent: { order: 0, running: "Running a subagent", waiting: "Waiting on a subagent", one: "1 subagent", many: "{n} subagents", noun: "subagent" },
  command: { order: 1, running: "Running a command", waiting: "Waiting on a command", one: "1 command", many: "{n} commands", noun: "command" },
  monitor: { order: 2, running: "Running a monitor", waiting: "Waiting on a monitor", one: "1 monitor", many: "{n} monitors", noun: "monitor" },
  background_task: { order: 3, running: "Running a background task", waiting: "Waiting on a background task", one: "1 background task", many: "{n} background tasks", noun: "background task" }
};

const oneLine = (text) => String(text || "").replace(/\s+/g, " ").trim();

function taskKind(type) {
  const t = String(type || "");
  if (/^(local_agent|remote_agent|in_process_teammate)$/.test(t)) return "subagent";
  if (t === "local_bash") return "command";
  if (/monitor/.test(t)) return "monitor";
  return "background_task";
}

const holdsTheTurn = (kind) => kind === "subagent" || kind === "background_task";

function noteBackgroundTask(e, ev) {
  const id = ev.task_id ? String(ev.task_id) : "";
  if (ev.subtype === "task_started") {
    if (!id || ev.skip_transcript) return false;
    const starts = (e.bgStarts ||= new Map());
    starts.set(id, { toolUseId: String(ev.tool_use_id || ""), t0: e.at || Date.now() });
    while (starts.size > STARTS_KEPT) starts.delete(starts.keys().next().value);
    return false;
  }
  const ended = ev.subtype === "task_notification" ? TASK_DONE.test(String(ev.status || "completed")) : ev.subtype === "task_updated" && TASK_DONE.test(String(ev.patch?.status || ""));
  if (ended) {
    e.bgStarts?.delete(id);
    return !!e.bgTasks?.delete(id);
  }
  if (ev.subtype !== "background_tasks_changed") return false;
  const next = new Map();
  for (const task of ev.tasks || []) {
    if (task.ambient || !task.task_id) continue;
    const taskId = String(task.task_id);
    const known = e.bgTasks?.get(taskId);
    const start = e.bgStarts?.get(taskId);
    const t0 = known?.t0 || start?.t0 || e.at || Date.now();
    if (Date.now() - t0 > BG_STALE) continue;
    next.set(taskId, { id: taskId, kind: taskKind(task.task_type), label: oneLine(task.description).slice(0, 300), toolUseId: known?.toolUseId || start?.toolUseId || "", t0 });
  }
  e.bgTasks = next;
  return true;
}

function forgetBackgroundTasks(e) {
  const had = !!e.bgTasks?.size;
  e.bgTasks?.clear();
  e.bgStarts?.clear();
  return had;
}

function backgroundWorkItems(e) {
  const items = [];
  const pinned = new Set();
  for (const sub of e.conv?.subs || []) {
    if (sub.dataset.task) pinned.add(sub.dataset.task);
    const now = sub.steps.findLast((step) => step.now) || sub.steps.at(-1);
    items.push({ key: sub.key, task: sub.dataset.task || "", kind: "subagent", label: oneLine(sub.arg) || oneLine(sub.name), name: sub.name, t0: Number(sub.dataset.t0) || 0, activity: now ? oneLine(now.text) : "", stepAt: sub.stepAt || 0, command: "", steps: sub.steps });
  }
  for (const task of e.bgTasks?.values() || []) {
    if (pinned.has(task.id) || (task.toolUseId && e.subs?.has(task.toolUseId))) continue;
    items.push({ key: `bg:${task.id}`, task: task.id, kind: task.kind, label: task.label, name: "", t0: task.t0, activity: "", stepAt: 0, command: e.tools?.get(task.toolUseId)?.cmd || "", steps: [] });
  }
  return items.sort((a, b) => KINDS[a.kind].order - KINDS[b.kind].order);
}

function joinWithAnd(parts) {
  if (parts.length < 2) return parts[0] || "";
  return phrase("{list} and {last}", { list: parts.slice(0, -1).join(", "), last: parts.at(-1) });
}

function itemLabel(item) {
  return item.label || oneLine(item.command) || phrase(KINDS[item.kind].noun);
}

function backgroundWorkTitle(items) {
  const waiting = items.some((one) => holdsTheTurn(one.kind));
  if (items.length === 1) {
    const [only] = items;
    if (!only.label && !only.command) return phrase(waiting ? KINDS[only.kind].waiting : KINDS[only.kind].running);
    return phrase(waiting ? "Waiting · {label}" : "Running · {label}", { label: itemLabel(only) });
  }
  const counts = new Map();
  for (const one of items) counts.set(one.kind, (counts.get(one.kind) || 0) + 1);
  const groups = joinWithAnd([...counts].map(([kind, n]) => (n === 1 ? phrase(KINDS[kind].one) : phrase(KINDS[kind].many, { n }))));
  return phrase(waiting ? "Waiting on {groups}" : "Running {groups}", { groups });
}

function backgroundWorkDetail(items) {
  if (items.length === 1) return items[0].activity;
  const newest = items.filter((one) => one.activity).sort((a, b) => b.stepAt - a.stepAt)[0];
  if (newest) return `${itemLabel(newest)}: ${newest.activity}`;
  return items.map(itemLabel).join(", ");
}

function backgroundWorkLine(e) {
  const items = backgroundWorkItems(e);
  if (!items.length) {
    e.bgStopping = 0;
    return null;
  }
  const stopping = !!e.bgStopping && Date.now() - e.bgStopping < STOP_PATIENCE;
  const stoppable = items.some((one) => one.task);
  return {
    id: "bg",
    icon: items.every((one) => one.kind !== "subagent") ? "terminal" : "working",
    label: backgroundWorkTitle(items),
    detail: backgroundWorkDetail(items),
    t0: items.length === 1 ? items[0].t0 || 0 : 0,
    open: "bg-details",
    tip: phrase("Details"),
    actions: [
      { key: "stop", act: "bg-stop", icon: stopping ? "working" : "stop", label: stopping ? phrase("Stopping…") : phrase("Stop background work"), disabled: stopping || !!e.turnOpen || !!e.mirror || !stoppable }
    ]
  };
}

function backgroundWorkAct(e, act) {
  if (act === "bg-details") return openBackgroundWork(e);
  if (act === "bg-stop") return stopBackgroundWork(e);
}

async function stopBackgroundWork(e) {
  const ids = [...new Set(backgroundWorkItems(e).map((one) => one.task).filter(Boolean))];
  if (!ids.length || e.turnOpen || e.mirror) return;
  if (e.bgStopping && Date.now() - e.bgStopping < STOP_PATIENCE) return;
  e.bgStopping = Date.now();
  svConvShow(e);
  setTimeout(() => svConvShow(e), STOP_PATIENCE + 50);
  const reply = await svCmd(e, { type: "stop_task", task_ids: ids });
  if (reply?.ok) return;
  e.bgStopping = 0;
  svConvShow(e);
  if (!reply?.silent) svConvLine(e, "sv-meta warn", reply?.error || phrase("the background work could not be stopped"));
}

function detailTitle(item) {
  if (item.kind === "command" && item.command && (!item.label || item.label === oneLine(item.command))) return phrase("Command");
  return itemLabel(item);
}

function detailState(item, now = Date.now()) {
  const state = holdsTheTurn(item.kind) ? phrase("Waiting") : phrase("Running");
  return item.t0 ? `${state} · ${phrase("running for {d}", { d: liveFor(now - item.t0) })}` : state;
}

function stepRow(step, tag = "li") {
  const row = document.createElement(tag);
  row.className = "bgw-step";
  row.classList.toggle("now", !!step.now);
  row.classList.toggle("bad", !!step.bad);
  row.dataset.kind = step.face || "";
  const glyph = step.face === "say" ? "" : `<svg class="bgw-glyph" aria-hidden="true"><use href="#${esc(step.glyph || "i-agent")}"/></svg>`;
  row.innerHTML = `${glyph}<span class="bgw-text"></span>`;
  row.querySelector(".bgw-text").textContent = step.text;
  if (step.hint) row.title = step.hint;
  return row;
}

function stepsBlock(e, item) {
  const steps = item.steps.slice(-DETAIL_STEPS);
  if (!steps.length) return null;
  const current = steps.at(-1);
  if (steps.length === 1) {
    const only = stepRow(current, "div");
    only.classList.add("bgw-current");
    return only;
  }
  const run = document.createElement("details");
  run.className = "bgw-run";
  run.open = !!e.bgOpenRuns?.has(item.key);
  const summary = document.createElement("summary");
  summary.title = phrase("show the earlier steps");
  const head = stepRow(current, "span");
  head.classList.add("bgw-current");
  summary.append(head);
  summary.insertAdjacentHTML("beforeend", `<svg class="bgw-chev" aria-hidden="true"><use href="#i-chev"/></svg>`);
  const log = document.createElement("ol");
  log.className = "bgw-steps";
  for (const step of steps.slice(0, -1)) log.append(stepRow(step));
  run.append(summary, log);
  run.addEventListener("toggle", () => {
    const open = (e.bgOpenRuns ||= new Set());
    if (run.open) open.add(item.key);
    else open.delete(item.key);
  });
  return run;
}

function detailSection(e, item) {
  const section = document.createElement("section");
  section.className = "bgw-item";
  section.dataset.kind = item.kind;
  const state = detailState(item);
  const glyph = item.kind === "subagent" ? "i-agent" : "i-term";
  section.innerHTML = `<div class="bgw-row"><svg class="bgw-kind" aria-hidden="true"><use href="#${glyph}"/></svg>`
    + `<h3 class="bgw-name"></h3><span class="bgw-state" role="img" aria-label="${esc(state)}" title="${esc(state)}"></span></div>`;
  const name = section.querySelector(".bgw-name");
  name.textContent = detailTitle(item);
  if (item.kind === "subagent" && item.name) name.title = item.name;
  if (item.command) {
    const pre = document.createElement("pre");
    pre.className = "bgw-cmd";
    pre.textContent = item.command;
    section.append(pre);
  }
  const steps = stepsBlock(e, item);
  if (steps) section.append(steps);
  return section;
}

function paintBackgroundWork(e) {
  const dialog = e.bgDialog;
  if (!dialog?.isConnected) return;
  const items = backgroundWorkItems(e);
  if (!items.length) return void dialog.close();
  const body = dialog.querySelector(".bgw-body");
  const top = body.scrollTop;
  body.replaceChildren(...items.map((item) => detailSection(e, item)));
  body.scrollTop = top;
}

function openBackgroundWork(e) {
  if (!backgroundWorkItems(e).length) return;
  let dialog = e.bgDialog;
  if (!dialog?.isConnected) {
    dialog = document.createElement("dialog");
    dialog.className = "bgw";
    const titleId = `bgw-title-${e.tag || "seat"}`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.innerHTML = `<header class="bgw-head"><h2 class="bgw-title" id="${esc(titleId)}">${esc(phrase("Background work"))}</h2>`
      + `<button type="button" class="bgw-close" aria-label="${esc(phrase("Close"))}"><svg aria-hidden="true"><use href="#i-x"/></svg></button></header><div class="bgw-body"></div>`;
    dialog.querySelector(".bgw-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => {
      if (e.bgDialog === dialog) e.bgDialog = null;
      dialog.remove();
    });
    document.body.append(dialog);
    e.bgDialog = dialog;
  }
  paintBackgroundWork(e);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector(".bgw-close").focus();
}

export { BG_STALE, TASK_DONE, backgroundWorkAct, backgroundWorkItems, backgroundWorkLine, forgetBackgroundTasks, noteBackgroundTask, openBackgroundWork, paintBackgroundWork, stopBackgroundWork, taskKind };

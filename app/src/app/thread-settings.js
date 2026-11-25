import { IDLE_DAYS_CHOICES, SNOOZE_DAYS, SNOOZE_OPTIONS_MAX, cleanSnoozeOption, snoozeUntil } from "/assets/thread-rules.mjs";
import { saveConfig } from "./brand-face.js";
import { $, esc, phrase, st } from "./core.js";
import { adoptThreads, snoozeChoicesNow, wakeSaid } from "./seat-marks.js";

const KIND_SAYS = { in: "In", today: "Today", tomorrow: "Tomorrow", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const UNIT_SAYS = { minutes: "minutes", hours: "hours", days: "days" };

let commandRows = null;

const rules = () => st.threadRules;

function save(patch) {
  saveConfig({ threads: patch }).then((r) => adoptThreadSettings(r)).catch(() => {});
}

function paintFlip(id, on, yes, no) {
  const flip = $(`t-${id}`);
  if (!flip) return;
  flip.textContent = phrase(on ? "on" : "off");
  flip.classList.toggle("on", on);
  flip.setAttribute("aria-pressed", on ? "true" : "false");
  $(`s-${id}-say`).textContent = phrase(on ? yes : no);
}

function paintListClick() {
  const field = $("f-list-click");
  if (!field || field === document.activeElement) return;
  field.innerHTML = `<option value="main">${esc(phrase("in the main view"))}</option><option value="beside">${esc(phrase("beside the chat in focus"))}</option>`;
  field.value = rules().listClick;
}

function paintIdle() {
  const field = $("f-settle-idle");
  if (!field || field === document.activeElement) return;
  field.innerHTML = IDLE_DAYS_CHOICES.map((days) => `<option value="${days}">${esc(days ? phrase(days === 1 ? "{n} day" : "{n} days", { n: days }) : phrase("never"))}</option>`).join("");
  field.value = String(rules().autoSettleIdleDays);
}

function optionRowHtml(option, at) {
  const kind = option.in !== undefined ? "in" : option.day;
  const kinds = Object.keys(KIND_SAYS).map((one) => `<option value="${one}"${one === kind ? " selected" : ""}>${esc(phrase(KIND_SAYS[one]))}</option>`).join("");
  const when = kind === "in"
    ? `<input type="number" data-f="in" min="1" max="999" step="1" value="${option.in}" aria-label="${esc(phrase("how many"))}"><select data-f="unit" aria-label="${esc(phrase("unit"))}">${Object.keys(UNIT_SAYS).map((unit) => `<option value="${unit}"${unit === option.unit ? " selected" : ""}>${esc(phrase(UNIT_SAYS[unit]))}</option>`).join("")}</select>`
    : `<span class="snz-at">${esc(phrase("at"))}</span><input type="time" data-f="at" value="${esc(option.at)}" aria-label="${esc(phrase("time"))}">`;
  const preview = cleanSnoozeOption(option) ? wakeSaid(snoozeUntil(option)) : "";
  return `<div class="snz-opt" data-i="${at}"><select data-f="kind" aria-label="${esc(phrase("when"))}">${kinds}</select>${when}<span class="snz-pv">${esc(preview)}</span><button type="button" class="ghost snz-drop" data-f="drop" aria-label="${esc(phrase("remove this option"))}" title="${esc(phrase("remove this option"))}">×</button></div>`;
}

function paintOptions() {
  const host = $("snooze-options");
  if (!host || host.contains(document.activeElement)) return;
  const options = rules().snoozeOptions;
  host.innerHTML = options.map(optionRowHtml).join("");
  $("snooze-option-add").disabled = options.length >= SNOOZE_OPTIONS_MAX;
  const menu = snoozeChoicesNow().map((one) => one.says);
  $("snooze-options-say").textContent = phrase("In the menu: {list}", { list: [...menu, phrase("Custom…")].join(" · ") });
}

function optionOf(row) {
  const field = (name) => row.querySelector(`[data-f="${name}"]`)?.value;
  const kind = field("kind");
  if (kind === "in") return { in: Math.max(1, Math.round(Number(field("in")) || 1)), unit: field("unit") || "hours" };
  return { day: SNOOZE_DAYS.includes(kind) ? kind : "tomorrow", at: field("at") || "09:00" };
}

function switchKind(row) {
  const kind = row.querySelector('[data-f="kind"]').value;
  const was = optionOf(row);
  if (kind === "in" && was.in === undefined) return { in: 1, unit: "hours" };
  if (kind !== "in" && was.in !== undefined) return { day: kind, at: "09:00" };
  return was;
}

function saveOptions(options) {
  st.threadRules = { ...rules(), snoozeOptions: options };
  save({ snoozeOptions: options });
}

function commandsOf() {
  return commandRows || Object.entries(rules().settleCommands).map(([repo, command]) => ({ repo, command }));
}

function repoChoices() {
  const repos = new Set();
  for (const s of st.data?.sessions || []) for (const tree of s.trees || []) if (tree?.repo) repos.add(tree.repo);
  return [...repos].sort();
}

function paintCommands() {
  const host = $("settle-commands");
  if (!host || host.contains(document.activeElement)) return;
  const list = `<datalist id="settle-repos">${repoChoices().map((repo) => `<option value="${esc(repo)}"></option>`).join("")}</datalist>`;
  host.innerHTML = list + commandsOf().map((one, at) => `<div class="settle-cmd" data-i="${at}"><input type="text" data-f="repo" list="settle-repos" spellcheck="false" autocomplete="off" value="${esc(one.repo)}" placeholder="${esc(phrase("repository"))}" aria-label="${esc(phrase("repository"))}"><input type="text" data-f="command" spellcheck="false" autocomplete="off" value="${esc(one.command)}" placeholder="${esc(phrase("command, like rm -rf .next"))}" aria-label="${esc(phrase("command"))}"><button type="button" class="ghost snz-drop" data-f="drop" aria-label="${esc(phrase("remove this command"))}" title="${esc(phrase("remove this command"))}">×</button></div>`).join("");
}

function saveCommands(rows) {
  commandRows = rows.some((one) => !one.repo.trim() || !one.command.trim()) ? rows : null;
  const kept = Object.fromEntries(rows.map((one) => [one.repo.trim(), one.command.trim()]).filter(([repo, command]) => repo && command));
  st.threadRules = { ...rules(), settleCommands: kept };
  save({ settleCommands: kept });
}

function paintThreadSettings() {
  if (!$("t-settle-merged")) return;
  const now = rules();
  paintIdle();
  paintListClick();
  paintFlip("settle-merged", now.autoSettleMerged, "a merged PR settles the chat", "a merged PR leaves the chat where it is");
  paintFlip("keep-open-pr", now.keepWithOpenPr, "an open PR keeps the chat active", "an open PR does not hold the chat");
  paintFlip("wake-early", now.wakeEarly, "a snoozed chat comes back when it needs you", "a snoozed chat waits for its time");
  paintFlip("working-section", now.workingSection, "working chats show in Working", "working chats stay in the list");
  paintFlip("group-by-project", now.groupByProject, "one folder per project", "the list follows the blocks");
  paintFlip("stop-on-settle", now.stopServersOnSettle, "what the chat left running stops", "what the chat left running goes on");
  paintOptions();
  paintCommands();
}

function adoptThreadSettings(r) {
  adoptThreads(r);
  paintThreadSettings();
}

$("pref-nav")?.addEventListener("click", (event) => {
  if (event.target.closest("button[data-pane]")?.dataset.pane === "threads") paintThreadSettings();
});

$("f-list-click")?.addEventListener("change", (event) => save({ listClick: event.target.value === "beside" ? "beside" : "main" }));

$("f-settle-idle")?.addEventListener("change", (event) => save({ autoSettleIdleDays: Number(event.target.value) }));
$("t-settle-merged")?.addEventListener("click", () => save({ autoSettleMerged: !rules().autoSettleMerged }));
$("t-keep-open-pr")?.addEventListener("click", () => save({ keepWithOpenPr: !rules().keepWithOpenPr }));
$("t-wake-early")?.addEventListener("click", () => save({ wakeEarly: !rules().wakeEarly }));
$("t-working-section")?.addEventListener("click", () => save({ workingSection: !rules().workingSection }));
$("t-group-by-project")?.addEventListener("click", () => save({ groupByProject: !rules().groupByProject }));
$("t-stop-on-settle")?.addEventListener("click", () => save({ stopServersOnSettle: !rules().stopServersOnSettle }));

$("snooze-option-add")?.addEventListener("click", () => {
  const options = rules().snoozeOptions;
  if (options.length >= SNOOZE_OPTIONS_MAX) return;
  saveOptions([...options, { in: 2, unit: "hours" }]);
  paintOptions();
});

$("snooze-options")?.addEventListener("change", (event) => {
  const row = event.target.closest(".snz-opt");
  if (!row) return;
  const options = [...rules().snoozeOptions];
  options[Number(row.dataset.i)] = event.target.dataset.f === "kind" ? switchKind(row) : optionOf(row);
  saveOptions(options);
  if (event.target.dataset.f === "kind") {
    event.target.blur();
    paintOptions();
  }
});

$("snooze-options")?.addEventListener("click", (event) => {
  const drop = event.target.closest('[data-f="drop"]');
  if (!drop) return;
  const at = Number(drop.closest(".snz-opt").dataset.i);
  saveOptions(rules().snoozeOptions.filter((_, i) => i !== at));
  drop.blur();
  paintOptions();
});

$("snooze-options")?.addEventListener("focusout", (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) setTimeout(paintOptions);
});

$("settle-command-add")?.addEventListener("click", () => {
  commandRows = [...commandsOf(), { repo: "", command: "" }];
  paintCommands();
  $("settle-commands").querySelector(".settle-cmd:last-child [data-f='repo']")?.focus();
});

$("settle-commands")?.addEventListener("change", () => {
  const rows = [...$("settle-commands").querySelectorAll(".settle-cmd")].map((row) => ({ repo: row.querySelector('[data-f="repo"]').value, command: row.querySelector('[data-f="command"]').value }));
  saveCommands(rows);
});

$("settle-commands")?.addEventListener("click", (event) => {
  const drop = event.target.closest('[data-f="drop"]');
  if (!drop) return;
  const at = Number(drop.closest(".settle-cmd").dataset.i);
  drop.blur();
  saveCommands(commandsOf().filter((_, i) => i !== at));
  paintCommands();
});

$("settle-commands")?.addEventListener("focusout", (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) setTimeout(paintCommands);
});

export { adoptThreadSettings, paintThreadSettings };

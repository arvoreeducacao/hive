import { $, esc, phrase } from "./core.js";
import { hostOf, nameSlug } from "./pure-helpers.js";
import { W_SERVER_STEPS, facePicker, myFaceSvg, wAct, wDone, wFetch, wb } from "./welcome.js";

const START = "start";
const START_BARE = "start-bare";
const SKIP = "skip-setup";
const PAGE_ACTIONS = [START, START_BARE, SKIP];

const AGENT_LABELS = { claude: "Claude", codex: "Codex", kimi: "Kimi", kiro: "Kiro", cursor: "Cursor", gemini: "Gemini", antigravity: "Antigravity", opencode: "OpenCode" };
const AGENT_INSTALLS = { claude: "npm install -g @anthropic-ai/claude-code", codex: "npm install -g @openai/codex" };
const ALWAYS_LISTED = ["claude", "codex"];
const SERVER_LABELS = { server: "your server", authorize: "key on it", login: "claude on it" };

let starting = false;
let showAround = true;

const onePage = () => wb.step === "hello";
const isPageAction = (action) => PAGE_ACTIONS.includes(action);

function agentRows(machine) {
  const found = machine?.agents || {};
  const claudeDep = machine?.deps?.find((one) => one.name === "claude");
  const claude = machine?.claude || {};
  const rows = [];
  for (const agent of [...ALWAYS_LISTED, ...Object.keys(AGENT_LABELS).filter((one) => !ALWAYS_LISTED.includes(one) && found[one])]) {
    if (agent === "claude") {
      const installed = !!claudeDep?.ok || !!claude.loggedIn;
      if (claude.loggedIn) rows.push({ agent, ready: true, says: claude.email ? phrase("Signed in as {who}", { who: claude.email }) : phrase("Signed in") });
      else if (installed) rows.push({ agent, ready: false, says: phrase("Not signed in. Run it once in a terminal and sign in."), command: "claude" });
      else rows.push({ agent, ready: false, says: phrase("Not installed"), command: AGENT_INSTALLS.claude });
      continue;
    }
    if (found[agent]) rows.push({ agent, ready: true, says: phrase("Installed") });
    else rows.push({ agent, ready: false, says: phrase("Not installed"), command: AGENT_INSTALLS[agent] || "" });
  }
  return rows;
}

const agentReady = (machine) => agentRows(machine).some((row) => row.ready);

function toolRows(machine) {
  if (!machine) return [];
  const rows = (machine.deps || [])
    .filter((one) => !one.ok && one.needed !== false && one.name !== "claude" && one.name !== "gh")
    .map((one) => ({ name: one.name, ready: false, says: phrase(one.why || ""), command: one.install }));
  if (machine.wantsCluster && machine.aws?.needed !== false && !machine.aws?.ok) rows.push({ name: "aws", ready: false, says: machine.aws?.detail || "", command: machine.aws?.profile ? `aws sso login --profile ${machine.aws.profile}` : "" });
  if (machine.wantsCluster && machine.cluster?.needed !== false && !machine.cluster?.ok) rows.push({ name: phrase("cluster"), ready: false, says: machine.cluster?.detail || "" });
  rows.push(machine.gh?.ok
    ? { name: "GitHub", ready: true, says: phrase("Signed in as {who}", { who: machine.gh.detail }) }
    : { name: "GitHub", ready: false, says: phrase("Not signed in"), command: "gh auth login" });
  return rows;
}

const needsSetup = (s) => !s?.setup?.ok || (!!s.configHub && !!s.hub && s.hub !== s.configHub);

const serverWanted = (s) => !!s && s.wantsServer !== false;

const serverStepLeft = (s) => (serverWanted(s) ? W_SERVER_STEPS.find((id) => !wDone(id, s)) || "" : "");

const dot = (ready) => `<span class="wp-dot" data-ready="${ready ? "true" : "false"}" aria-hidden="true"></span>`;

function rowHtml(name, row) {
  const copy = row.command ? `<code class="wp-cmd">${esc(row.command)}</code><button type="button" class="wp-copy" data-copy="${esc(row.command)}" aria-label="${esc(phrase("Copy {command}", { command: row.command }))}">${esc(phrase("Copy"))}</button>` : "";
  const state = row.ready ? phrase("ready") : phrase("missing");
  return `<li class="wp-row">${dot(row.ready)}<span class="wp-name">${esc(name)}<span class="wp-sr"> · ${esc(state)}</span></span><span class="wp-says">${esc(row.says)}</span>${copy}</li>`;
}

const sectionHtml = (id, title, body) => `<section class="wp-sec" aria-labelledby="wp-${id}"><h2 class="wp-label" id="wp-${id}">${esc(title)}</h2><div class="wp-body">${body}</div></section>`;

function youHtml(s) {
  const look = s?.hubLooks || {};
  const hubSays = !s ? phrase("checking…") : look.ok ? phrase("Chats open here, next to your repositories.") : look.why || "";
  const nameSays = wb.nameWrong ? phrase("the name needs 2 to 30 characters: lowercase letters, digits and hyphens") : phrase("The prefix of every branch you open.");
  const setupError = wb.setupError ? `<p class="wp-error" role="alert">${esc(wb.setupError)}</p>` : "";
  return `<div class="wp-you">
      <div class="wp-face">
        <button type="button" class="mug av-alive" id="w-mug" data-w="face-open" title="${esc(phrase("your face in the hive — click to change"))}" aria-label="${esc(phrase("your face in the hive — click to change"))}" aria-expanded="${wb.facePicker ? "true" : "false"}">${myFaceSvg("hello")}</button>
        <button type="button" class="wp-ghost" data-w="face-roll">${esc(phrase("another"))}</button>
      </div>
      <div class="wp-fields">
        <div class="wp-field">
          <label for="w-dev">${esc(phrase("your name in the hive"))}</label>
          <input id="w-dev" value="${esc(wb.dev)}" spellcheck="false" autocomplete="off" placeholder="${esc(phrase("short, lowercase"))}" aria-describedby="w-dev-note"${wb.nameWrong ? ' aria-invalid="true"' : ""} />
          <p class="wp-note${wb.nameWrong ? " bad" : ""}" id="w-dev-note">${esc(nameSays)}</p>
        </div>
        <div class="wp-field">
          <label for="w-hub">${esc(phrase("where your workspace lives on this machine"))}</label>
          <input id="w-hub" value="${esc(wb.hub)}" spellcheck="false" autocomplete="off" placeholder="${esc(phrase("/Users/you/workspace"))}" aria-describedby="w-hub-note"${s && !look.ok ? ' aria-invalid="true"' : ""} />
          <p class="wp-note${s && !look.ok ? " bad" : ""}" id="w-hub-note">${esc(hubSays)}</p>
        </div>
      </div>
    </div>
    <div class="w-picker facepick${wb.facePicker ? " on" : ""}" id="w-picker">${wb.facePicker ? facePicker() : ""}</div>${setupError}`;
}

function serverHtml(s) {
  const rows = W_SERVER_STEPS.map((id) => ({ name: phrase(SERVER_LABELS[id]), ready: wDone(id, s), says: wDone(id, s) ? phrase("ready") : phrase("after Start, one step at a time") }));
  const host = hostOf(s?.server?.url);
  const where = host ? `<p class="wp-note">${esc(host)}</p>` : "";
  return `<ul class="wp-rows">${rows.map((row) => rowHtml(row.name, row)).join("")}</ul>${where}`;
}

function footHtml(s) {
  const ready = agentReady(s?.machine);
  const busy = !!wb.busy || starting;
  const skip = wb.setupError ? `<button type="button" class="wp-ghost" data-w="${SKIP}"${busy ? " disabled" : ""}>${esc(phrase("Skip setup for now"))}</button>` : "";
  const bare = ready ? skip : `${skip}<button type="button" class="wp-ghost" data-w="${START_BARE}"${busy ? " disabled" : ""}>${esc(phrase("Start without an agent"))}</button>`;
  const hint = ready ? "" : `<span class="wp-hint" id="wp-hint">${esc(phrase("Set up one agent to start."))}</span>`;
  const around = `<label class="wp-around"><input type="checkbox" id="wp-around"${showAround ? " checked" : ""} /> ${esc(phrase("Show me around after"))}</label>`;
  return `<div class="wp-foot"><div class="wp-alt">${bare}</div><div class="wp-go">${around}${hint}<button type="button" class="wp-primary" data-w="${START}"${!ready || busy ? " disabled" : ""}${ready ? "" : ' aria-describedby="wp-hint"'}>${esc(busy ? phrase("Starting…") : phrase("Start"))}</button></div></div>`;
}

function welcomePageHtml() {
  const s = wb.s;
  const machine = s?.machine;
  const agents = machine ? `<ul class="wp-rows">${agentRows(machine).map((row) => rowHtml(AGENT_LABELS[row.agent], row)).join("")}</ul>` : `<p class="wp-note">${esc(phrase("checking…"))}</p>`;
  const tools = machine ? `<ul class="wp-rows">${toolRows(machine).map((row) => rowHtml(row.name, row)).join("")}</ul>` : "";
  return `<div class="wp-page">
    <h1 class="wp-title">${esc(phrase("Welcome to the hive."))}</h1>
    <p class="wp-sub">${esc(phrase("Setting up this computer."))}</p>
    <div class="wp-secs">
      ${sectionHtml("you", phrase("You"), youHtml(s))}
      ${sectionHtml("agents", phrase("Agents"), agents)}
      ${machine ? sectionHtml("tools", phrase("Tools"), tools) : ""}
      ${serverWanted(s) ? sectionHtml("server", phrase("Server"), serverHtml(s)) : ""}
    </div>
    ${footHtml(s)}
  </div>`;
}

const MARKS = ["w", "copy"];

function markOf(el) {
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return { id: el.id };
  const mark = MARKS.find((one) => el.dataset?.[one]);
  return mark ? { mark, value: el.dataset[mark] } : null;
}

function findMark(found) {
  if (found.id) return $(found.id);
  return [...$("w-stage").querySelectorAll(`[data-${found.mark}]`)].find((el) => el.dataset[found.mark] === found.value) || null;
}

const typed = new Set();
let painted = "";

function paintWelcomePage() {
  const box = $("welcome");
  box.classList.add("one-page");
  const first = !painted;
  const held = document.activeElement;
  const found = markOf(held);
  const value = found?.id && typed.has(found.id) ? held.value : null;
  const caret = found?.id && "selectionStart" in held ? [held.selectionStart, held.selectionEnd, held.selectionDirection] : null;
  const html = welcomePageHtml();
  if (html === painted && $("w-stage").firstElementChild) return;
  painted = html;
  $("w-stage").innerHTML = html;
  const back = found ? findMark(found) : null;
  if (back && back !== held) {
    if (value !== null) back.value = value;
    if (!back.disabled) back.focus({ preventScroll: true });
    if (caret && caret[0] !== null) try { back.setSelectionRange(caret[0], caret[1] ?? caret[0], caret[2] || "none"); } catch {}
  } else if (first && !found) $("w-dev")?.focus({ preventScroll: true });
}

function leaveWelcomePage() {
  $("welcome").classList.remove("one-page");
  painted = "";
}

function forgetWelcomePage() {
  painted = "";
  typed.clear();
  starting = false;
  showAround = true;
}

$("welcome").addEventListener("input", (event) => {
  if (event.target.id === "w-dev" || event.target.id === "w-hub") typed.add(event.target.id);
});

$("welcome").addEventListener("change", (event) => {
  if (event.target.id === "wp-around") showAround = event.target.checked;
});

async function pageAct(action, ctx) {
  if (action === SKIP) return ctx.close();
  if (wb.busy || starting) return;
  const dev = nameSlug($("w-dev")?.value);
  wb.hub = ($("w-hub")?.value || "").trim();
  if (!/^[a-z][a-z0-9-]{1,29}$/.test(dev)) {
    wb.nameWrong = true;
    paintWelcomePage();
    return $("w-dev")?.focus();
  }
  wb.dev = dev;
  wb.nameWrong = false;
  wb.setupError = "";
  starting = true;
  try {
    await startWith(action === START_BARE, ctx);
  } finally {
    starting = false;
    if (onePage() && !$("welcome").hidden) paintWelcomePage();
  }
}

async function startWith(bare, ctx) {
  paintWelcomePage();
  try {
    wb.s = await wFetch(true);
  } catch {}
  if (!wb.s?.hubLooks?.ok) return focusAfter("w-hub");
  if (!bare && !agentReady(wb.s.machine)) return;
  await ctx.saveFace();
  if (needsSetup(wb.s)) {
    const done = await wAct("setup", { name: wb.dev, hub: wb.hub });
    if (!done?.ok) {
      wb.setupError = done?.error || phrase("the app did not answer — try again in a moment");
      return focusAfter("w-dev");
    }
    document.dispatchEvent(new Event("hive:machine-changed"));
  }
  wb.ready = true;
  const left = serverStepLeft(wb.s);
  if (left) {
    starting = false;
    return ctx.go(left);
  }
  await ctx.finish(showAround);
}

function focusAfter(id) {
  starting = false;
  paintWelcomePage();
  $(id)?.focus();
}

function welcomePageKeys(event, run) {
  if (event.key === "Escape") {
    event.preventDefault();
    return true;
  }
  if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const id = document.activeElement?.id;
  if (id !== "w-dev" && id !== "w-hub") return false;
  event.preventDefault();
  const go = $("w-stage").querySelector(`[data-w="${START}"]:not([disabled])`) || $("w-stage").querySelector(`[data-w="${START_BARE}"]:not([disabled])`);
  if (go) run(go.dataset.w);
  return true;
}

export { SKIP, START, START_BARE, agentReady, agentRows, forgetWelcomePage, isPageAction, leaveWelcomePage, needsSetup, onePage, pageAct, paintWelcomePage, serverStepLeft, toolRows, welcomePageHtml, welcomePageKeys };

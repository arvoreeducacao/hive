import { $, esc, every, phrase, raycastOn, st } from "./core.js";
import { closeMore } from "./new-chat.js";
import { agentsBehind, pullProviders, updateAgentNow } from "./providers.js";

const LATER_KEY = "hive-agent-updates-later";
const AGENT_CHECK_BEAT = 3600000;

function readLater() {
  try { return JSON.parse(localStorage.getItem(LATER_KEY) || "{}") || {}; } catch { return {}; }
}

function keepLater(later) {
  try { localStorage.setItem(LATER_KEY, JSON.stringify(later)); } catch {}
}

function waiting() {
  const later = readLater();
  return agentsBehind().filter((one) => later[one.id] !== one.latest || one.updating || st.agentUpdateSaid[one.id]);
}

function rowHtml(one) {
  const said = st.agentUpdateSaid[one.id] || "";
  const act = one.canUpdate
    ? `<button type="button" class="ap-go" data-ap-update="${esc(one.id)}" ${one.updating ? "disabled" : ""}>${esc(one.updating ? phrase("updating…") : phrase("update"))}</button>`
    : "";
  const how = one.canUpdate ? "" : `<span class="ap-said">${esc(phrase("the hive cannot run this one for you — in a terminal:"))} <code>${esc(one.updateCommand)}</code></span>`;
  return `<li><span><span class="ap-name">${esc(one.name)}</span><span class="ap-ver">${esc(one.version)} → ${esc(one.latest)}</span>${how}${said ? `<span class="ap-said">${esc(said)}</span>` : ""}</span>${act}</li>`;
}

function paintAgentUpdates() {
  const list = waiting();
  const button = $("btn-agents");
  button.hidden = !list.length;
  $("agents-say").textContent = list.length === 1
    ? phrase("{name} {version} is out", { name: list[0].name, version: list[0].latest })
    : phrase("{n} agents have a newer version", { n: list.length });
  if (!list.length) return closeAgentUpdates();
  $("ap-count").textContent = String(list.length);
  $("ap-list").innerHTML = list.map(rowHtml).join("");
  $("ap-all").hidden = list.filter((one) => one.canUpdate).length < 2;
}

function openAgentUpdates() {
  paintAgentUpdates();
  $("agentpop").hidden = false;
  $("btn-agents").setAttribute("aria-expanded", "true");
}

function closeAgentUpdates() {
  $("agentpop").hidden = true;
  $("btn-agents").setAttribute("aria-expanded", "false");
}

function notNow() {
  const later = readLater();
  for (const one of agentsBehind()) later[one.id] = one.latest;
  keepLater(later);
  closeAgentUpdates();
  paintAgentUpdates();
}

async function updateAll() {
  for (const one of waiting().filter((each) => each.canUpdate && !each.updating)) await updateAgentNow(one.id);
}

document.addEventListener("hive:providers", paintAgentUpdates);

$("btn-agents").addEventListener("click", (e) => {
  e.stopPropagation();
  if (raycastOn()) closeMore();
  if ($("agentpop").hidden) openAgentUpdates(); else closeAgentUpdates();
});

$("agentpop").addEventListener("click", (e) => {
  e.stopPropagation();
  const go = e.target.closest("[data-ap-update]");
  if (go) updateAgentNow(go.dataset.apUpdate);
});

$("ap-all").addEventListener("click", updateAll);

$("ap-later").addEventListener("click", notNow);

document.addEventListener("click", () => { if (!$("agentpop").hidden) closeAgentUpdates(); });

every("agent-updates", AGENT_CHECK_BEAT, () => pullProviders(), { background: true });

export { closeAgentUpdates, openAgentUpdates, paintAgentUpdates };

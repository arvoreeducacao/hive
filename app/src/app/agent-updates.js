import { $, esc, every, phrase, raycastOn, st } from "./core.js";
import { closeMore } from "./new-chat.js";
import { agentsBehind, openProviders, pullProviders, updateAgentNow } from "./providers.js";

const LATER_KEY = "hive-agent-updates-later";
const AGENT_CHECK_BEAT = 3600000;

function readLater() {
  try { return JSON.parse(localStorage.getItem(LATER_KEY) || "{}") || {}; } catch { return {}; }
}

function keepLater(later) {
  try { localStorage.setItem(LATER_KEY, JSON.stringify(later)); } catch {}
}

function leftToTheHive(one) {
  return st.autoUpdateAgents !== false && one.canUpdate && !one.autoSaid && !st.agentUpdateSaid[one.id];
}

function waiting() {
  const later = readLater();
  return agentsBehind().filter((one) => !leftToTheHive(one) && (later[one.id] !== one.latest || one.updating || st.agentUpdateSaid[one.id]));
}

function rowHtml(one) {
  const said = st.agentUpdateSaid[one.id] || (one.autoSaid ? phrase("the hive tried on its own and it failed: {error}", { error: one.autoSaid }) : "");
  const act = one.canUpdate
    ? `<button type="button" class="ap-go" data-ap-update="${esc(one.id)}" ${one.updating ? "disabled" : ""}>${esc(one.updating ? phrase("updating…") : phrase("update"))}</button>`
    : "";
  const how = one.canUpdate ? "" : `<span class="ap-said">${esc(phrase("the hive cannot run this one for you — in a terminal:"))} <code>${esc(one.updateCommand)}</code></span>`;
  return `<li><span><span class="ap-name">${esc(one.name)}</span><span class="ap-ver">${esc(one.version)} → ${esc(one.latest)}</span>${how}${said ? `<span class="ap-said">${esc(said)}</span>` : ""}</span>${act}</li>`;
}

function agentPillModel() {
  const list = waiting();
  if (!list.length) return null;
  const first = list[0];
  return {
    id: first.id,
    say: list.length === 1 ? phrase("{name} {version} available", { name: first.name, version: first.latest }) : phrase("{n} agent updates available", { n: list.length }),
    dismissSay: phrase("Not now")
  };
}

function agentPillHtml(model = agentPillModel(), cls = "agent-pill") {
  if (!model) return "";
  return `<div class="${cls}"><button type="button" class="ap-open" data-agent-pill="${esc(model.id)}">${esc(model.say)}</button><button type="button" class="ap-x" data-agent-pill-later aria-label="${esc(model.dismissSay)}" title="${esc(model.dismissSay)}">×</button></div>`;
}

function paintRailPill() {
  const rail = $("rail");
  if (!rail) return;
  let host = document.getElementById("rail-agents");
  const html = raycastOn() ? agentPillHtml() : "";
  if (!html) return host?.remove();
  if (!host) {
    host = document.createElement("div");
    host.id = "rail-agents";
    host.dataset.noT = "";
    rail.append(host);
  }
  if (host.dataset.h !== html) {
    host.dataset.h = html;
    host.innerHTML = html;
  }
}

function paintAgentUpdates() {
  paintRailPill();
  const list = waiting();
  const button = $("btn-agents");
  button.hidden = !list.length;
  $("agents-say").textContent = list.length === 1
    ? phrase("{name} {version} is out", { name: list[0].name, version: list[0].latest })
    : phrase("{n} agents have a newer version", { n: list.length });
  if (!list.length) return closeAgentUpdates();
  $("ap-count").textContent = String(list.length);
  $("ap-sub").textContent = st.autoUpdateAgents === false
    ? phrase("A newer version is out. Update now, or keep the one you have: nothing changes until you say so.")
    : phrase("A newer version is out, and the hive could not install it on its own.");
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

document.addEventListener("click", (e) => {
  const open = e.target.closest?.("[data-agent-pill]");
  if (open) return void openProviders(open.dataset.agentPill);
  if (e.target.closest?.("[data-agent-pill-later]")) return notNow();
  if (!$("agentpop").hidden) closeAgentUpdates();
});

every("agent-updates", AGENT_CHECK_BEAT, () => pullProviders(), { background: true });

export { agentPillHtml, paintRailPill, closeAgentUpdates, openAgentUpdates, paintAgentUpdates };

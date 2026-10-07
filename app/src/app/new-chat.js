import { render } from "./arrange.js";
import { activeItems, labelOf, saveBlocks } from "./blocks.js";
import { saveAvatar } from "./avatars.js";
import { pickFace, stripWear } from "./brand-face.js";
import { paintNewChatAccounts, providerReady, providerWhyNot, pullProviders } from "./providers.js";
import { askDeviceFrame, stopDeviceFrames } from "./chat-and-panes.js";
import { $, IS_MAC, esc, nearestFree, phrase, raycastOn, solidMounts, st } from "./core.js";
import { faceSheetOpen, toggleFaceSheet } from "./face-door.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { setBrandFace, setGaze, setLook } from "./preferences.js";
import { answerNudge, nudge, takenSlots } from "./team.js";
import { openHelp } from "./themes.js";
import { paintAvatar, rollAvatar, toggleSettingsFace } from "./welcome.js";

function newChatPayload(name, prompt, images = []) {
  const kind = $("n-kind").value;
  const agent = agentOfKind(kind);
  return {
    name, prompt, images, where: $("n-where").value,
    model: $("n-model").value,
    repo: $("n-repo").value.trim(), branch: $("n-branch").value.trim(),
    account: $("n-where").value === "cloud" ? "" : $("n-account").value,
    structured: agent === "claude" ? kind === "structured" : !kind.endsWith("-tui"),
    agent,
    count: Number($("n-count")?.value) || 1
  };
}

const seatKindSays = () => ($("n-kind").selectedOptions[0]?.textContent || "").replace(/\s*·\s*/, " · ");

$("f-label").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("f-label").blur(); }
  if (e.key === "Escape") { e.preventDefault(); $("f-label").value = ""; $("f-label").blur(); }
  e.stopPropagation();
});

$("f-label").addEventListener("blur", () => {
  const b = st.blocks[st.block];
  if (!b) return;
  const written = $("f-label").value.trim();
  const auto = labelOf({ ...b, manual: false, label: "" }, activeItems()).txt;
  b.manual = !!written && written !== auto;
  b.label = b.manual ? written : "";
  saveBlocks();
  render();
});

const NEW_CHAT_AGENTS = ["claude", "codex", "kimi", "kiro", "cursor", "opencode"];

const kindOf = (agent, terminal) => (agent === "claude" ? (terminal ? "terminal" : "structured") : terminal ? `${agent}-tui` : agent);

const isTerminalKind = (kind) => kind === "terminal" || /-tui$/.test(kind);

function segmentOf(select, label = (opt) => opt.dataset.short || opt.textContent) {
  return [...select.options].filter((opt) => !opt.hidden).map((opt) => ({
    value: opt.value, label: label(opt), on: opt.value === select.value, off: opt.disabled
  }));
}

function paintSegment(host, rows) {
  host.innerHTML = rows.map((row) => `<button type="button" data-v="${esc(row.value)}" aria-pressed="${row.on}"${row.off ? " disabled" : ""}>${esc(row.label)}</button>`).join("");
}

function faceRows() {
  const kind = $("n-kind").value;
  const agent = agentOfKind(kind);
  const option = (terminal) => [...$("n-kind").options].find((opt) => opt.value === kindOf(agent, terminal));
  return [false, true].map((terminal) => ({
    value: terminal ? "terminal" : "chat",
    label: terminal ? phrase("terminal") : phrase("chat"),
    on: isTerminalKind(kind) === terminal,
    off: !!option(terminal)?.disabled
  }));
}

function paintNewChatForm() {
  const agents = $("n-agent");
  if (!raycastOn() || !agents) return;
  const kind = $("n-kind");
  const usable = (agent) => [...kind.options].some((opt) => agentOfKind(opt.value) === agent && !opt.disabled);
  const said = NEW_CHAT_AGENTS.map((agent) => `${agent}|${usable(agent)}`).join(",");
  if (agents.dataset.said !== said) {
    agents.dataset.said = said;
    agents.innerHTML = NEW_CHAT_AGENTS.map((agent) => `<option value="${agent}"${usable(agent) ? "" : " disabled"}>${agent}</option>`).join("");
  }
  agents.value = agentOfKind(kind.value);
  for (const host of $("cmp-controls").querySelectorAll("[data-seg]")) {
    paintSegment(host, host.dataset.seg === "n-face" ? faceRows() : segmentOf($(host.dataset.seg)));
  }
}

$("cmp-controls").addEventListener("change", (e) => {
  if (!raycastOn() || e.target.id !== "n-agent") return;
  const next = kindOf($("n-agent").value, isTerminalKind($("n-kind").value));
  const fallback = kindOf($("n-agent").value, false);
  const usable = (value) => [...$("n-kind").options].some((opt) => opt.value === value && !opt.disabled);
  $("n-kind").value = usable(next) ? next : fallback;
  $("n-kind").dispatchEvent(new Event("change"));
});

$("cmp-controls").addEventListener("click", (e) => {
  if (!raycastOn()) return;
  if (e.target.closest("#mission-cancel")) return $("mission-esc").click();
  const hit = e.target.closest("[data-seg] button[data-v]");
  if (!hit || hit.disabled) return;
  const seg = hit.closest("[data-seg]").dataset.seg;
  if (seg === "n-face") {
    $("n-kind").value = kindOf(agentOfKind($("n-kind").value), hit.dataset.v === "terminal");
    $("n-kind").dispatchEvent(new Event("change"));
    return;
  }
  $(seg).value = hit.dataset.v;
  $(seg).dispatchEvent(new Event("change"));
  paintNewChatForm();
});

$("n-count").addEventListener("change", paintNewChatForm);

$("n-where").addEventListener("change", paintNewChatForm);

$("n-where").addEventListener("change", () => {
  const cloud = $("n-where").value === "cloud";
  $("n-account").disabled = cloud;
  $("n-account").title = cloud ? phrase("accounts live on your machine — a cloud chat uses the server's own login") : phrase("which account it logs in with");
  $("n-cloud-account").hidden = !cloud;
  $("n-repo").hidden = !cloud;
  $("n-branch").hidden = !cloud;
  $("cmp-controls").classList.toggle("cloud", cloud);
});

const NEW_CHAT_MODELS = new Map();

function agentOfKind(kind) {
  return /^opencode/.test(kind) ? "opencode" : /^codex/.test(kind) ? "codex" : /^kimi/.test(kind) ? "kimi" : /^kiro/.test(kind) ? "kiro" : /^cursor/.test(kind) ? "cursor" : "claude";
}

const NEW_CHAT_ASKING = new Set();

async function syncKindModel() {
  const box = $("n-model");
  const agent = agentOfKind($("n-kind").value);
  paintNewChatForm();
  paintNewChatAccounts();
  if (!providerReady(agent)) {
    box.dataset.agent = agent;
    box.textContent = "";
    box.appendChild(new Option(providerWhyNot(agent), ""));
    box.disabled = true;
    box.title = providerWhyNot(agent);
    return;
  }
  box.disabled = false;
  box.title = phrase("the model the chat starts on");
  const wanted = NEW_CHAT_MODELS.get(agent);
  if (box.dataset.agent === agent && (wanted || NEW_CHAT_ASKING.has(agent))) return;
  box.dataset.agent = agent;
  if (wanted) return void paintNewChatModels(agent, wanted);
  if (NEW_CHAT_ASKING.has(agent)) return;
  NEW_CHAT_ASKING.add(agent);
  box.textContent = "";
  box.appendChild(new Option(phrase("asking {agent} what it can run…", { agent }), ""));
  const answer = await fetch(`/api/catalog?agent=${encodeURIComponent(agent)}`).then((r) => r.json()).catch(() => null);
  NEW_CHAT_ASKING.delete(agent);
  if (box.dataset.agent !== agent) return;
  const models = answer?.models || [];
  if (models.length) NEW_CHAT_MODELS.set(agent, models);
  paintNewChatModels(agent, models, answer?.error);
}

function paintNewChatModels(agent, models, wrong) {
  const box = $("n-model");
  const keep = box.value;
  box.textContent = "";
  box.appendChild(new Option(phrase("the account default"), ""));
  const groups = new Map();
  for (const m of models) {
    const key = m.group || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  for (const [name, items] of groups) {
    const into = name ? document.createElement("optgroup") : box;
    if (name) { into.label = name; box.appendChild(into); }
    for (const m of items) {
      const opt = new Option(m.label || m.value, m.value);
      opt.title = [m.value, m.description].filter(Boolean).join(" · ");
      into.appendChild(opt);
    }
  }
  if (wrong) box.title = wrong;
  if ([...box.options].some((o) => o.value === keep)) box.value = keep;
}

$("n-kind").addEventListener("change", syncKindModel);

try {
  const kept = localStorage.getItem("hive.seatKind");
  if (kept && [...$("n-kind").options].some((o) => o.value === kept)) $("n-kind").value = kept;
} catch {}

syncKindModel();
pullProviders();

const RAIL_MIN_KEY = "hive-rail-min";

function paintRailToggle() {
  railToggleSolid.show(railToggleViewModel());
}

let railToggleSolid = null;

function railToggleViewModel() {
  const min = $("shell").classList.contains("rail-min");
  return { key: "railtoggle", out: min, say: min ? phrase("expand the sidebar") : phrase("collapse the sidebar") };
}

solidMounts.push((hive) => {
  railToggleSolid = hive.mountRailToggle($("rail-toggle"));
  paintRailToggle();
});

$("knock-dock").addEventListener("click", () => {
  if ($("shell").classList.contains("rail-min")) $("rail-toggle").click();
});

$("nudge-yes").addEventListener("click", () => answerNudge(true));

$("nudge-no").addEventListener("click", () => answerNudge(false));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopDeviceFrames();
  else if (st.deviceChat) askDeviceFrame(st.deviceChat);
  if (document.hidden || !st.nudgeHeld) return;
  st.nudgeHeld = false;
  nudge([]);
});

$("rail-toggle").addEventListener("click", () => {
  const min = $("shell").classList.toggle("rail-min");
  try { localStorage.setItem(RAIL_MIN_KEY, min ? "1" : ""); } catch {}
  paintRailToggle();
});

try { if (localStorage.getItem(RAIL_MIN_KEY) === "1") $("shell").classList.add("rail-min"); } catch {}

document.addEventListener("hive:screen", () => closeMore());

function closeMore() {
  $("more").classList.remove("on");
  $("btn-more").setAttribute("aria-expanded", "false");
}

$("btn-more").addEventListener("click", (e) => {
  e.stopPropagation();
  const on = $("more").classList.toggle("on");
  $("btn-more").setAttribute("aria-expanded", String(on));
});

$("more").addEventListener("click", (e) => { if (e.target.closest("button")) closeMore(); });

document.addEventListener("click", (e) => {
  if ($("more").classList.contains("on") && !e.target.closest("#more") && !e.target.closest("#btn-more")) closeMore();
  if (faceSheetOpen() && !e.target.closest("#face-sheet") && !e.target.closest("#brand-mug")) toggleFaceSheet(false);
});

$("brand-mug").addEventListener("click", (e) => { e.stopPropagation(); toggleFaceSheet(); });

$("face-sheet").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fs], [data-w]");
  if (!b) return;
  e.stopPropagation();
  if (b.dataset.w === "face-set") return pickFace(b.dataset.part, b.dataset.value);
  if (b.dataset.fs === "roll") { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); return paintAvatar(); }
  if (b.dataset.fs === "strip") return stripWear();
  if (b.dataset.fs === "done") toggleFaceSheet(false);
});

$("cfg-face").addEventListener("click", (e) => {
  const b = e.target.closest("[data-w]");
  if (b && b.dataset.w === "face-set") pickFace(b.dataset.part, b.dataset.value);
});

$("cfg-open").addEventListener("click", () => toggleSettingsFace());

$("cfg-roll").addEventListener("click", () => { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); paintAvatar(); saveAvatar(); });

$("cfg-strip").addEventListener("click", () => stripWear());

$("f-brand").addEventListener("change", (e) => setBrandFace(e.target.value));

$("f-gaze").addEventListener("change", (e) => setGaze(e.target.value));
$("f-look").addEventListener("change", (e) => setLook(e.target.value));
if (window.hiveWindow && !IS_MAC) {
  $("win-btns").hidden = false;
  for (const b of $("win-btns").querySelectorAll(".wb")) b.addEventListener("click", () => window.hiveWindow.act(b.dataset.act));
}

$("btn-help").addEventListener("click", () => { releaseKeyboard(); openHelp(); });

export { NEW_CHAT_AGENTS, faceRows, isTerminalKind, kindOf, paintNewChatForm, segmentOf, NEW_CHAT_ASKING, NEW_CHAT_MODELS, RAIL_MIN_KEY, agentOfKind, closeMore, newChatPayload, paintNewChatModels, paintRailToggle, railToggleSolid, railToggleViewModel, seatKindSays, syncKindModel };

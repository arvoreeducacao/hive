import { BACKGROUND_DEFAULT, BACKGROUND_MODES, CONFIRM_ACTIONS, EFFORT_STYLE_DEFAULT, EFFORT_STYLES, PROVIDER_CHECK_DEFAULT, PROVIDER_CHECKS, TEXT_WRITER_DEFAULT, TEXT_WRITERS, pacedMs, providerBeatMs } from "/assets/behavior-defaults.mjs";
import { setPace } from "/assets/pollers.mjs";
import { saveConfig } from "./brand-face.js";
import { paintPills } from "./chat-and-panes.js";
import { adoptConfirm, confirmBefore } from "./confirmations.js";
import { $, esc, phrase, solidMounts, st, svgIcon } from "./core.js";
import { macPermissionsHere, openMacPermissions } from "./mac-permissions.js";
import { structPool } from "./structured-seats.js";

st.effortStyle = EFFORT_STYLE_DEFAULT;
st.slashSkills = true;
st.devicesOn = true;
st.deviceAgents = true;
st.background = BACKGROUND_DEFAULT;
st.providerCheck = PROVIDER_CHECK_DEFAULT;
st.textWriter = TEXT_WRITER_DEFAULT;

const EFFORT_STYLE_NAMES = { word: "Word", bars: "Bars" };
const BACKGROUND_NAMES = { economy: "Economy", balanced: "Balanced", performance: "Performance" };
const BACKGROUND_SAYS = {
  economy: "Economy checks a third as often and waits for the charger while the Mac is on battery.",
  balanced: "Balanced checks at the pace the hive always did.",
  performance: "Performance checks twice as often, for a busy machine plugged into the wall."
};
const PROVIDER_CHECK_NAMES = { auto: "With the mode above", "30s": "Every 30 s", "1m": "Every minute", "5m": "Every 5 min", "15m": "Every 15 min", off: "Off" };
const CONFIRM_ROWS = { unpin: "t-confirm-unpin", archive: "t-confirm-archive", closeChat: "t-confirm-close-chat", closeTerminal: "t-confirm-close-terminal" };
const FLIPS = { slashSkills: "t-slash-skills", devicesOn: "t-devices", deviceAgents: "t-device-agents" };
const FLIP_KEYS = { slashSkills: "slashSkills", devicesOn: "devices", deviceAgents: "deviceAgents" };

let onBattery = false;

const WRITER_NAMES = { claude: "Claude · Haiku", codex: "Codex · GPT-5.6 Luna", gemini: "Gemini · Flash", kiro: "Kiro · Claude Haiku 4.5", kimi: "Kimi", cursor: "Cursor", antigravity: "Antigravity" };

const writerSaid = (id) => (id ? WRITER_NAMES[id] || id : phrase("The chat's own agent, on its cheapest model"));

const writersOffered = () => TEXT_WRITERS.filter((id) => !id || id === st.textWriter || (st.providers || []).some((one) => one.id === id && one.installed && one.enabled !== false));

function applyPace() {
  setPace((name, ms) => (name === "providers" ? providerBeatMs(st.providerCheck, st.background) : pacedMs(st.background, name, ms, { onBattery })));
}

function watchBattery() {
  navigator.getBattery?.().then((battery) => {
    const heard = () => {
      const now = !battery.charging;
      if (now === onBattery) return;
      onBattery = now;
      applyPace();
    };
    battery.addEventListener("chargingchange", heard);
    heard();
  }).catch(() => {});
}

function fillSelect(el, values, names) {
  if (!el) return;
  const wanted = values.map((value) => `${value}\u0000${names(value)}`).join("\u0001");
  if (el.dataset.filled !== wanted) {
    el.innerHTML = values.map((value) => `<option value="${esc(value)}">${esc(names(value))}</option>`).join("");
    el.dataset.filled = wanted;
  }
}

function paintFlip(id, on) {
  const flip = $(id);
  if (!flip) return;
  flip.textContent = phrase(on ? "on" : "off");
  flip.classList.toggle("on", on);
  flip.setAttribute(flip.getAttribute("role") === "switch" ? "aria-checked" : "aria-pressed", on ? "true" : "false");
}

function paintSegments(host, values, worn, names) {
  if (!host) return;
  if (host.dataset.filled !== values.join(",")) {
    host.innerHTML = values.map((value) => `<button type="button" role="radio" data-value="${esc(value)}"></button>`).join("");
    host.dataset.filled = values.join(",");
  }
  for (const button of host.querySelectorAll("button[data-value]")) {
    const on = button.dataset.value === worn;
    button.textContent = names(button.dataset.value);
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.tabIndex = on ? 0 : -1;
    button.classList.toggle("on", on);
  }
}

function paintBehavior() {
  paintSegments($("f-effort-style"), EFFORT_STYLES, st.effortStyle, (value) => phrase(EFFORT_STYLE_NAMES[value]));
  paintSegments($("f-background"), BACKGROUND_MODES, st.background, (value) => phrase(BACKGROUND_NAMES[value]));
  for (const button of $("f-background")?.querySelectorAll("button[data-value]") || []) button.title = phrase(BACKGROUND_SAYS[button.dataset.value]);
  fillSelect($("f-provider-check"), PROVIDER_CHECKS, (value) => phrase(PROVIDER_CHECK_NAMES[value]));
  if ($("f-provider-check")) $("f-provider-check").value = st.providerCheck;
  fillSelect($("f-text-writer"), writersOffered(), writerSaid);
  if ($("f-text-writer")) $("f-text-writer").value = st.textWriter;
  for (const [field, id] of Object.entries(FLIPS)) paintFlip(id, st[field] !== false);
  for (const [action, id] of Object.entries(CONFIRM_ROWS)) paintFlip(id, confirmBefore(action));
  const agents = $("t-device-agents");
  if (agents) agents.disabled = st.devicesOn === false;
}

const DEVICE_ROWS = [
  { key: "android", name: "Android", icon: "i-phone" },
  { key: "ios", name: "iOS", icon: "i-phone" }
];

async function paintDevicesHere() {
  const list = $("devices-here");
  if (!list) return;
  const perm = $("perm-row");
  if (perm) perm.hidden = !macPermissionsHere();
  const said = await fetch("/api/device/list").then((r) => r.json()).catch(() => null);
  const found = {
    android: said && !said.android ? phrase("SDK found · {n} phones", { n: (said.avds || []).length }) : "",
    ios: said && !said.ios ? phrase("Xcode found · {n} simulators", { n: (said.sims || []).length }) : ""
  };
  const missing = { android: phrase("no Android SDK on this Mac"), ios: phrase("no Xcode on this Mac") };
  list.innerHTML = DEVICE_ROWS.map((row) => {
    const ready = !!found[row.key];
    const why = ready ? found[row.key] : missing[row.key];
    const state = phrase(ready ? "ready" : "not found");
    return `<li title="${esc(why)}"><span class="dh-ico" aria-hidden="true">${svgIcon(row.icon)}</span><b>${esc(row.name)}</b><span class="dh-state${ready ? " ready" : ""}" role="img" aria-label="${esc(`${state} · ${why}`)}">${svgIcon(ready ? "i-check" : "i-minus")}</span></li>`;
  }).join("");
}

function repaintPills() {
  for (const e of structPool.values()) if (e.host) paintPills(e);
}

function adoptBehavior(r) {
  const config = r?.config || {};
  const effortWas = st.effortStyle;
  const paceWas = `${st.background}:${st.providerCheck}`;
  st.effortStyle = EFFORT_STYLES.includes(config.effortStyle) ? config.effortStyle : EFFORT_STYLE_DEFAULT;
  st.slashSkills = config.slashSkills !== false;
  st.devicesOn = config.devices !== false;
  st.deviceAgents = config.deviceAgents !== false;
  st.background = BACKGROUND_MODES.includes(config.background) ? config.background : BACKGROUND_DEFAULT;
  st.providerCheck = PROVIDER_CHECKS.includes(config.providerCheck) ? config.providerCheck : PROVIDER_CHECK_DEFAULT;
  st.textWriter = TEXT_WRITERS.includes(config.textWriter) ? config.textWriter : TEXT_WRITER_DEFAULT;
  adoptConfirm(r);
  if (effortWas !== st.effortStyle) repaintPills();
  if (paceWas !== `${st.background}:${st.providerCheck}`) applyPace();
  paintBehavior();
}

function saveBehavior(patch) {
  return saveConfig(patch).then((r) => { if (r?.config) adoptBehavior(r); return r; }).catch(() => null);
}

function setBehavior(field, value) {
  st[field] = value;
  if (field === "effortStyle") repaintPills();
  if (field === "background" || field === "providerCheck") applyPace();
  paintBehavior();
  return saveBehavior({ [FLIP_KEYS[field] || field]: value });
}

function setConfirm(action, on) {
  if (!CONFIRM_ACTIONS.includes(action)) return null;
  st.confirm = { ...st.confirm, [action]: on };
  paintBehavior();
  return saveBehavior({ confirm: { ...st.confirm } });
}

function stepSegment(host, event, pick) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" };
  if (!(event.key in keys)) return;
  const buttons = [...host.querySelectorAll("button[data-value]")];
  const at = buttons.findIndex((one) => one.getAttribute("aria-checked") === "true");
  const step = keys[event.key];
  const next = step === "first" ? 0 : step === "last" ? buttons.length - 1 : (at + step + buttons.length) % buttons.length;
  event.preventDefault();
  pick(buttons[next].dataset.value);
  host.querySelector(`button[data-value="${CSS.escape(buttons[next].dataset.value)}"]`)?.focus();
}

function wireSegments(id, field) {
  const host = $(id);
  if (!host) return;
  host.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button) setBehavior(field, button.dataset.value);
  });
  host.addEventListener("keydown", (event) => stepSegment(host, event, (value) => setBehavior(field, value)));
}

function wireBehavior() {
  wireSegments("f-effort-style", "effortStyle");
  wireSegments("f-background", "background");
  $("f-provider-check")?.addEventListener("change", (event) => setBehavior("providerCheck", event.target.value));
  $("f-text-writer")?.addEventListener("change", (event) => setBehavior("textWriter", event.target.value));
  for (const [field, id] of Object.entries(FLIPS)) $(id)?.addEventListener("click", () => setBehavior(field, st[field] === false));
  for (const [action, id] of Object.entries(CONFIRM_ROWS)) $(id)?.addEventListener("click", () => setConfirm(action, !confirmBefore(action)));
  document.addEventListener("hive:providers", paintBehavior);
  document.addEventListener("hive:pref-pane", (event) => { if (event.detail === "devices") paintDevicesHere(); });
  $("perm-open")?.addEventListener("click", () => openMacPermissions());
  applyPace();
  watchBattery();
  paintBehavior();
}

solidMounts.push(() => wireBehavior());

export { paintDevicesHere, BACKGROUND_NAMES, BACKGROUND_SAYS, CONFIRM_ROWS, EFFORT_STYLE_NAMES, PROVIDER_CHECK_NAMES, adoptBehavior, applyPace, paintBehavior, setBehavior, setConfirm };

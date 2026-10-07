import { apiGet, apiPost } from "/assets/api.mjs";
import { saveConfig } from "./brand-face.js";
import { $, esc, phrase } from "./core.js";

let held = null;

export async function microphones() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((one) => one.kind === "audioinput" && one.deviceId && one.deviceId !== "default" && one.deviceId !== "communications");
  } catch { return []; }
}

export function microphoneChoices(devices, chosen) {
  const choices = [["", phrase("the system default")]];
  devices.forEach((one, index) => choices.push([one.deviceId, one.label || phrase("microphone {n}", { n: index + 1 })]));
  if (chosen && !choices.some(([id]) => id === chosen)) choices.push([chosen, phrase("the one you picked — not plugged in right now")]);
  return choices;
}

export function outputChoices(outputs, chosen) {
  const usual = outputs.find((one) => one.default);
  const choices = [["", usual ? phrase("the system default — {name}", { name: usual.name }) : phrase("the system default")]];
  for (const one of outputs) choices.push([one.id, one.name]);
  if (chosen && !choices.some(([id]) => id === chosen)) choices.push([chosen, phrase("the one you picked — not plugged in right now")]);
  return choices;
}

const options = (choices) => choices.map(([value, said]) => `<option value="${esc(value)}">${esc(said)}</option>`).join("");

function paint() {
  if (!held) return;
  const { settings, models, mics, outs } = held;
  $("mt-output-row").hidden = !outs.supported || !settings.systemAudio;
  $("f-mt-output").innerHTML = options(outputChoices(outs.outputs, settings.output));
  $("f-mt-output").value = settings.output || "";
  $("f-mt-model").innerHTML = options(models.map((one) => [one.id, one.name]));
  $("f-mt-model").value = settings.model;
  $("f-mt-who").innerHTML = options([["team", phrase("the whole team")], ["me", phrase("only me")]]);
  $("f-mt-who").value = settings.who;
  $("f-mt-mic").innerHTML = options(microphoneChoices(mics, settings.mic));
  $("f-mt-mic").value = settings.mic;
  const flip = $("t-mt-system");
  flip.textContent = settings.systemAudio ? phrase("on") : phrase("off");
  flip.classList.toggle("on", settings.systemAudio);
  $("mt-system-say").textContent = settings.systemAudio
    ? phrase("the other side of the call is written down too")
    : phrase("only your microphone is written down");
  if (document.activeElement !== $("f-mt-ask")) $("f-mt-ask").value = settings.instructions;
}

export function extensionSaid(ext) {
  if (ext.on) return { text: phrase("connected — the captions of the call are arriving"), worry: false };
  if (ext.connected) return { text: phrase("connected — captions are off in the call, the hive turns them on when it records"), worry: false };
  const ready = ext.chrome?.ready || ext.firefox?.ready;
  if (ready) return { text: phrase("set up on this machine — open a Meet call with the extension loaded and it connects by itself"), worry: false };
  return { text: phrase("not set up yet"), worry: false };
}

function paintExtension() {
  const ext = held?.ext;
  $("mt-ext-row").hidden = !ext?.supported;
  if (!ext?.supported) return;
  const said = extensionSaid(ext);
  $("mt-ext-state").textContent = said.text;
  const ready = ext.chrome?.ready || ext.firefox?.ready;
  $("mt-ext-install").textContent = ready ? phrase("set it up again") : phrase("set up the browser extension");
  $("mt-ext-steps").hidden = !ready;
  const boxed = (ext.sandboxed || []).filter((one) => one.ok).map((one) => one.app);
  $("mt-ext-sandbox").hidden = !boxed.length;
  $("mt-ext-sandbox").textContent = boxed.length ? phrase("{apps} runs in a sandbox: it was let in to reach the hive. Close it completely and open it again before loading the extension.", { apps: boxed.join(", ") }) : "";
  $("mt-ext-chrome").textContent = ext.chromeDir || "";
  $("mt-ext-firefox").textContent = ext.firefoxDir || "";
}

async function look() {
  const [said, mics, outs] = await Promise.all([apiGet("/api/meetings").catch(() => null), microphones(), apiGet("/api/meetings/outputs").catch(() => ({ supported: false, outputs: [] }))]);
  if (!said?.settings) return;
  const ext = await apiGet("/api/meetings/extension").catch(() => ({ supported: false }));
  held = { settings: said.settings, models: said.models || [], mics, outs, ext };
  paint();
  paintExtension();
}

async function keep(change) {
  if (!held) return;
  held.settings = { ...held.settings, ...change };
  paint();
  await saveConfig({ meetings: held.settings }).catch(() => {});
}

export function bootMeetingPrefs() {
  if (!$("f-mt-model")) return;
  $("pref-nav").addEventListener("click", (e) => {
    if (e.target.closest("button[data-pane]")?.dataset.pane === "meetings") look();
  });
  $("f-mt-model").addEventListener("change", (e) => keep({ model: e.target.value }));
  $("f-mt-who").addEventListener("change", (e) => keep({ who: e.target.value }));
  $("f-mt-mic").addEventListener("change", (e) => keep({ mic: e.target.value }));
  $("f-mt-output").addEventListener("change", (e) => keep({ output: e.target.value }));
  $("t-mt-system").addEventListener("click", () => keep({ systemAudio: !held?.settings.systemAudio }));
  $("f-mt-ask").addEventListener("change", (e) => keep({ instructions: e.target.value.trim() }));
  $("f-mt-ask").addEventListener("keydown", (e) => e.stopPropagation());
  $("mt-ext-install").addEventListener("click", async () => {
    const done = await apiPost("/api/meetings/extension/install", {}).catch(() => null);
    if (done && held) { held.ext = { ...held.ext, ...done }; paintExtension(); }
  });
  $("mt-ext-chrome-open").addEventListener("click", () => apiPost("/api/meetings/extension/open", { which: "chrome" }).catch(() => {}));
  $("mt-ext-firefox-open").addEventListener("click", () => apiPost("/api/meetings/extension/open", { which: "firefox" }).catch(() => {}));
  $("mt-ext-chrome-copy").addEventListener("click", () => navigator.clipboard.writeText($("mt-ext-chrome").textContent).catch(() => {}));
  $("mt-ext-firefox-copy").addEventListener("click", () => navigator.clipboard.writeText($("mt-ext-firefox").textContent).catch(() => {}));
  navigator.mediaDevices?.addEventListener?.("devicechange", () => { if (held) look(); });
}

bootMeetingPrefs();

import { apiPost } from "/assets/api.mjs";
import { saveConfig } from "./brand-face.js";
import { $, esc, phrase, st } from "./core.js";
import { microphoneChoices, microphones } from "./meetings-prefs.js";
import { ask } from "./pod.js";
import { onDictation, pullDictation } from "./stt.js";

const BUSY_BEAT = 700;

export const STT_LANGUAGES = [
  ["", "work it out from what I say"],
  ["pt", "português"],
  ["en", "english"],
  ["es", "español"],
  ["fr", "français"],
  ["de", "deutsch"],
  ["it", "italiano"]
];

let quickening = null;
let mics = [];

export function sizeSaid(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1 << 20);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function downloadSaid(step) {
  if (!step) return "";
  const what = step.what === "model" ? (step.name || phrase("the model")) : phrase("the engine");
  if (!step.total) return `${phrase("downloading")} ${what}…`;
  const done = Math.min(100, Math.round((step.downloaded / step.total) * 100));
  return `${phrase("downloading")} ${what} — ${done}% ${phrase("of")} ${sizeSaid(step.total)}`;
}

export function downloadPart(step) {
  if (!step?.total) return 0;
  return Math.min(1, step.downloaded / step.total);
}

export function modelIsHere(sound) {
  return sound.model?.state === "ready" || sound.model?.state === "handy";
}

export function sttStateSaid(sound) {
  if (sound.unsupported) return { text: esc(sound.unsupported), worry: true };
  if (sound.download) return { text: esc(downloadSaid(sound.download)), worry: false };
  if (sound.trouble) return { text: esc(sound.trouble), worry: true };
  const model = sound.model || {};
  const named = `<b>${esc(model.name || "")} ${esc(model.quant || "")}</b>, ${sizeSaid(model.bytes)}`;
  if (sound.ready) {
    const on = sound.backend ? ` · ${esc(sound.backend)}` : "";
    return { text: `${named}${on}`, worry: false };
  }
  if (model.state === "partial") return { text: phrase("the download stopped halfway — download it again to finish"), worry: true };
  if (modelIsHere(sound)) return { text: `${phrase("the model is already on this machine")} — ${named} · ${phrase("dictation still needs setting up")}`, worry: false };
  return { text: `${phrase("the model is not on this machine yet")} — ${named} ${phrase("to download")}`, worry: false };
}

export function modelStateSaid(state) {
  if (state === "ready" || state === "handy") return phrase("on this machine");
  if (state === "partial") return phrase("half downloaded");
  return phrase("not downloaded");
}

export function modelOptionSaid(model) {
  return `${model.name} ${model.quant} · ${sizeSaid(model.bytes)} · ${modelStateSaid(model.state)}`;
}

function paintModels(pick, models) {
  pick.innerHTML = models.map((one) => `<option value="${esc(one.id)}">${esc(modelOptionSaid(one))}</option>`).join("");
  const active = models.find((one) => one.active);
  if (active) pick.value = active.id;
  pick.disabled = models.length < 2;
}

export function sttActionSaid(sound) {
  return modelIsHere(sound) ? phrase("set dictation up") : phrase("download the model");
}

export function languageChoices(detects = true) {
  return STT_LANGUAGES.map(([code, said]) => [code, code ? said : phrase(detects ? said : "the same language as the hive")]);
}

function paintLanguages(pick, chosen, detects) {
  const choices = languageChoices(detects);
  if (pick.options[0]?.textContent !== choices[0][1] || pick.options.length !== choices.length) {
    pick.innerHTML = choices.map(([code, said]) => `<option value="${esc(code)}">${esc(said)}</option>`).join("");
  }
  pick.value = STT_LANGUAGES.some(([code]) => code === chosen) ? chosen : "";
}

function paintMics(pick, chosen) {
  if (!pick) return;
  if (document.activeElement === pick) return;
  pick.innerHTML = microphoneChoices(mics, chosen).map(([id, said]) => `<option value="${esc(id)}">${esc(said)}</option>`).join("");
  pick.value = chosen || "";
}

async function lookForMics() {
  mics = await microphones();
  paintMics($("f-stt-mic"), st.stt.mic || "");
}

export function paintStt(sound = st.stt) {
  const flip = $("t-stt");
  if (!flip) return;
  const on = !!sound.enabled && !sound.unsupported;
  flip.textContent = on ? phrase("on") : phrase("off");
  flip.classList.toggle("on", on);
  flip.disabled = !!sound.unsupported;
  $("stt-say").textContent = sound.unsupported
    ? phrase("not on this machine")
    : on ? phrase("the microphone button is in every composer") : phrase("no microphone button, nothing downloaded");

  const box = $("stt-box");
  box.hidden = !on;
  if (!on) return;

  const said = sttStateSaid(sound);
  const state = $("stt-state");
  state.innerHTML = said.text;
  state.classList.toggle("worry", said.worry);

  const bar = $("stt-bar");
  bar.hidden = !sound.download;
  bar.firstElementChild.style.width = `${Math.round(downloadPart(sound.download) * 100)}%`;

  const get = $("stt-get");
  get.hidden = !!sound.download || sound.ready;
  get.textContent = sttActionSaid(sound);
  $("stt-stop").hidden = !sound.download;
  $("stt-drop").hidden = !!sound.download || sound.model?.state !== "ready";
  paintModels($("f-stt-model"), sound.models || []);
  paintLanguages($("f-stt-lang"), sound.language || "", sound.model?.detectsLanguage !== false);
  paintMics($("f-stt-mic"), sound.mic || "");
}

function quicken(sound) {
  const busy = !!sound.download;
  if (busy && !quickening) quickening = setInterval(pullDictation, BUSY_BEAT);
  if (!busy && quickening) { clearInterval(quickening); quickening = null; }
}

export function bootSttPrefs() {
  if (!$("t-stt")) return;
  onDictation((sound) => { paintStt(sound); quicken(sound); });
  paintStt();

  $("t-stt").addEventListener("click", async () => {
    const on = !st.stt.enabled;
    st.stt = { ...st.stt, enabled: on };
    paintStt();
    await saveConfig({ stt: on }).catch(() => {});
    await pullDictation();
  });

  $("stt-get").addEventListener("click", async () => {
    await apiPost("/api/stt/install", { model: st.stt.model?.id }).catch(() => {});
    await pullDictation();
  });

  $("stt-stop").addEventListener("click", async () => {
    await apiPost("/api/stt/cancel", {}).catch(() => {});
    await pullDictation();
  });

  $("stt-drop").addEventListener("click", async () => {
    const sure = await ask(
      phrase("delete the dictation model?"),
      phrase("it leaves this machine and dictation stops working until you download it again."),
      phrase("delete it")
    );
    if (!sure) return;
    await apiPost("/api/stt/remove", { model: st.stt.model?.id }).catch(() => {});
    await pullDictation();
  });

  $("f-stt-model").addEventListener("change", async (event) => {
    const chosen = event.target.value;
    await saveConfig({ sttModel: chosen }).catch(() => {});
    await pullDictation();
  });

  $("f-stt-mic").addEventListener("change", async (event) => {
    const chosen = event.target.value;
    st.stt = { ...st.stt, mic: chosen };
    await saveConfig({ sttMic: chosen }).catch(() => {});
  });

  $("pref-nav")?.addEventListener("click", (event) => {
    if (event.target.closest("button[data-pane]")?.dataset.pane === "dictation") lookForMics();
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", lookForMics);
  lookForMics();

  $("f-stt-lang").addEventListener("change", async (event) => {
    const chosen = event.target.value;
    st.stt = { ...st.stt, language: chosen };
    await saveConfig({ sttLanguage: chosen }).catch(() => {});
    await pullDictation();
  });
}

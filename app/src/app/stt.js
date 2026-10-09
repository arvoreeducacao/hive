import { apiBinary, apiGet } from "/assets/api.mjs";
import { STT_SAMPLE_RATE, joinSound, wasAnythingSaid, whereTheWordsGo } from "/assets/stt-sound.mjs";
import { activeItems } from "./blocks.js";
import { showNotice } from "./chimes-and-notices.js";
import { $, experienceNext, phrase, st } from "./core.js";
import { drafts } from "./draft-seat.js";
import { structPool } from "./structured-seats.js";

const SETTLE_MS = 2000;

export const DICTATION_BEAT = 20000;

export const TALK_TAP_MS = 400;

st.stt = { enabled: false, ready: false, unsupported: null, state: "idle", said: "", seconds: 0, trouble: "", owner: null };

let tap = null;
let opening = false;
let heard = [];
let caught = null;
let settling = null;
let painters = new Set();

export function onDictation(paint) {
  painters.add(paint);
  return () => painters.delete(paint);
}

function tell(state, said = "", seconds = 0) {
  st.stt = { ...st.stt, state, said, seconds, owner: state === "idle" ? null : st.stt.owner };
  for (const paint of painters) {
    try { paint(st.stt); } catch {}
  }
}

const listening = () => !!tap || opening;

function settle(said) {
  clearTimeout(settling);
  if (listening()) return;
  tell("idle", said);
  settling = setTimeout(() => { if (!listening()) tell("idle", ""); }, SETTLE_MS);
}

function refuse(title, body) {
  settle(title);
  showNotice(title, body);
  return false;
}

export function composerInFocus() {
  const item = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  if (item?.kind === "session") {
    const box = structPool.get(item.name)?.host.querySelector(".sv-composer textarea");
    if (box) return box;
  }
  if (item?.kind === "draft") {
    const box = drafts.get(item.name)?.e?.host?.querySelector(".sv-composer textarea");
    if (box) return box;
  }
  return $("cmp-in");
}

export function talkButtonFor(box) {
  if (!box) return null;
  return box.closest?.(".sv-composer")?.querySelector(".sv-talk") || (box.id === "cmp-in" ? $("cmp-talk") : null);
}

export function putWords(text, box = composerInFocus()) {
  if (!box || !String(text || "").trim()) return false;
  const { text: whole, cursor } = whereTheWordsGo(text, box.value, box.selectionStart);
  box.value = whole;
  box.selectionStart = cursor;
  box.selectionEnd = cursor;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.focus();
  return true;
}

export async function pullDictation() {
  try {
    const said = await apiGet("/api/stt/status");
    st.stt = {
      ...st.stt,
      enabled: !!said.enabled && !said.unsupported,
      ready: said.engine === "ready" && ["ready", "handy"].includes(said.model?.state),
      unsupported: said.unsupported || null,
      trouble: said.trouble || "",
      download: said.download || null,
      backend: said.backend || null,
      model: said.model || null,
      models: said.models || [],
      language: said.language || "",
      mic: said.mic || ""
    };
    for (const paint of painters) {
      try { paint(st.stt); } catch {}
    }
    return st.stt;
  } catch {
    return st.stt;
  }
}

async function openTap() {
  const machine = await window.hiveMicrophone?.ask?.().catch(() => null);
  if (machine && !machine.allowed) throw Object.assign(new Error(phrase("this machine has not let the hive listen")), { name: "NotAllowedError" });
  const stream = await openMic(st.stt.mic);
  const room = new AudioContext({ sampleRate: STT_SAMPLE_RATE });
  if (room.state === "suspended") await room.resume();
  await room.audioWorklet.addModule("/assets/stt-worklet.mjs");
  const from = room.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(room, "dictation-tap", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: { sampleRate: STT_SAMPLE_RATE }
  });
  node.port.onmessage = (note) => heard.push(note.data);
  from.connect(node);
  return { stream, room, from, node };
}

async function openMic(deviceId) {
  const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: deviceId } } }); } catch {}
  }
  return navigator.mediaDevices.getUserMedia({ audio });
}

function closeTap() {
  if (!tap) return;
  try { tap.node.port.postMessage("flush"); } catch {}
  try { tap.from.disconnect(); } catch {}
  try { tap.node.disconnect(); } catch {}
  for (const track of tap.stream.getTracks()) { try { track.stop(); } catch {} }
  const room = tap.room;
  tap = null;
  setTimeout(() => { try { room.close(); } catch {} }, 0);
}

export async function startTalking({ into, owner = null } = {}) {
  if (tap || st.stt.state === "hearing") return false;
  if (st.stt.unsupported) return refuse(phrase("dictation does not run on this machine"), st.stt.unsupported);
  if (!st.stt.enabled) return refuse(phrase("dictation is off"), phrase("turn it on in preferences, under Dictation."));
  if (!st.stt.ready) return refuse(phrase("dictation is not set up on this machine yet"), phrase("preferences has the button that finishes it, under Dictation."));
  clearTimeout(settling);
  heard = [];
  caught = into || composerInFocus();
  st.stt = { ...st.stt, owner: owner || talkButtonFor(caught) };
  tell("hearing");
  opening = true;
  try {
    tap = await openTap();
    opening = false;
  } catch (wrong) {
    tap = null;
    opening = false;
    const denied = wrong?.name === "NotAllowedError" || wrong?.name === "SecurityError";
    const title = denied ? phrase("this machine did not let the hive listen") : phrase("the microphone did not open");
    const body = denied
      ? phrase("let the hive use the microphone in your system settings, then try again. Nothing was recorded.")
      : String(wrong?.message || wrong);
    settle(title);
    showNotice(title, body);
    return false;
  }
  return true;
}

export async function stopTalking({ cancel = false } = {}) {
  if (!tap) { if (cancel) tell("idle"); return ""; }
  closeTap();
  await new Promise((done) => setTimeout(done, 30));
  const pcm = joinSound(heard);
  heard = [];
  const box = caught;
  caught = null;
  if (cancel) { tell("idle"); return ""; }

  const { said, why } = wasAnythingSaid(pcm);
  if (!said) {
    settle(why === "too short" ? phrase("that was too quick — click, talk, then click again") : phrase("I heard nothing"));
    return "";
  }

  const seconds = pcm.length / STT_SAMPLE_RATE;
  if (!listening()) tell("writing", "", seconds);
  try {
    const out = await apiBinary("/api/stt/transcribe", pcm);
    if (!out.text) { settle(phrase("could not make out any words")); return ""; }
    putWords(out.text, box);
    settle("");
    return out.text;
  } catch (wrong) {
    settle(String(wrong?.message || wrong));
    return "";
  }
}

export function talking() {
  return !!tap;
}

export function toggleTalking({ into, owner } = {}) {
  if (talking()) return stopTalking();
  return startTalking({ into, owner });
}

export function talkSaid(sound, mine = true) {
  if (sound.unsupported) return sound.unsupported;
  if (!sound.ready) return phrase("dictation is not set up on this machine yet — set it up in preferences");
  if (!mine) return phrase("another composer is listening right now");
  if (sound.state === "hearing") return phrase("listening — click to stop and write what you said");
  if (sound.state === "writing") return phrase("turning what you said into words…");
  return phrase("click and talk — click again and the words land here");
}

export function wireTalkButton(button, into) {
  if (!button) return () => {};
  button.addEventListener("click", (event) => {
    event.preventDefault();
    toggleTalking({ into: into?.() || undefined, owner: button });
  });
  const paint = (sound) => {
    const busy = sound.state !== "idle";
    const mine = !busy || sound.owner === button;
    button.hidden = !sound.enabled;
    button.classList.toggle("hot", mine && sound.state === "hearing");
    button.classList.toggle("think", mine && sound.state === "writing");
    button.classList.toggle("dead", !sound.ready || !mine);
    button.closest(".sv-composer")?.classList.toggle("talking", experienceNext() && busy && sound.owner === button);
    button.disabled = !mine || sound.state === "writing";
    button.title = talkSaid(sound, mine);
    button.setAttribute("aria-pressed", mine && sound.state === "hearing" ? "true" : "false");
  };
  paint(st.stt);
  return onDictation(paint);
}

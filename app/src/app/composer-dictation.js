import { phrase, st } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { onComposerMode, onComposerSend, paintComposer } from "./composer-modes.js";
import { structPool } from "./structured-seats.js";
import { onDictation, onMicLevel, stopTalking } from "./stt.js";

const WAVE_BARS = 24;

const WAVE_REST = 0.2;

const CLOCK_MS = 250;

const BUSY = new Set(["hearing", "writing"]);

const talkOf = (e) => e?.host?.querySelector(".sv-composer .sv-talk") || null;

const dictatingHere = (e) => BUSY.has(st.stt.state) && !!st.stt.owner && st.stt.owner === talkOf(e);

function voiceClock(ms) {
  const whole = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function waveLook(level) {
  const heard = Math.max(0, Math.min(1, Number(level) || 0));
  return { opacity: 0.3 + heard * 0.55, scale: Math.max(WAVE_REST, heard) };
}

function pillOf(e, form) {
  const btns = form.querySelector(".sv-btns");
  if (!btns) return null;
  let pill = btns.querySelector(":scope > .cp-voice");
  if (pill) return pill;
  pill = document.createElement("span");
  pill.className = "cp-voice";
  pill.innerHTML = `<button type="button" class="cp-voice-x" data-act="voice-cancel">${composerIcon("x")}</button>`
    + `<span class="cp-voice-mid"><i class="cp-voice-dot" aria-hidden="true"></i><time class="cp-voice-clock">0:00</time><span class="cp-voice-wave" aria-hidden="true">${"<i></i>".repeat(WAVE_BARS)}</span></span>`
    + `<span class="cp-voice-busy"><span class="cp-spin" aria-hidden="true"></span><span class="cp-voice-said"></span></span>`
    + `<button type="button" class="cp-voice-ok" data-act="voice-finish">${composerIcon("check")}</button>`;
  pill.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
  pill.querySelector(".cp-voice-x").addEventListener("click", () => cancelDictation(e));
  pill.querySelector(".cp-voice-ok").addEventListener("click", () => finishDictation());
  const anchor = btns.querySelector(".sv-talk") || btns.querySelector(".sv-send");
  if (anchor?.classList.contains("sv-talk")) anchor.after(pill);
  else if (anchor) anchor.before(pill);
  else btns.append(pill);
  return pill;
}

function paintVoice(e, form, mode) {
  const here = dictatingHere(e);
  form.classList.toggle("cp-dictating", here);
  const pill = here ? pillOf(e, form) : form.querySelector(".sv-btns > .cp-voice");
  if (pill) pill.hidden = !here;
  if (!here || !pill) return;
  const writing = st.stt.state === "writing";
  pill.classList.toggle("writing", writing);
  const cancel = pill.querySelector(".cp-voice-x");
  cancel.setAttribute("aria-label", phrase("Cancel voice input"));
  cancel.title = phrase("Cancel voice input (Esc)");
  const finish = pill.querySelector(".cp-voice-ok");
  finish.setAttribute("aria-label", phrase("Finish voice input"));
  finish.title = phrase("Finish voice input");
  finish.hidden = writing;
  pill.querySelector(".cp-voice-mid").hidden = writing;
  pill.querySelector(".cp-voice-busy").hidden = !writing;
  const said = pill.querySelector(".cp-voice-said");
  said.textContent = writing ? phrase("Transcribing…") : "";
  pill.setAttribute("role", "status");
  pill.setAttribute("aria-live", writing ? "polite" : "off");
  pill.setAttribute("aria-label", writing ? phrase("Transcribing…") : phrase("Recording"));
  tickVoiceClock(pill);
  if (mode !== "steer" && mode !== "queue" && mode !== "idle") return;
  const send = form.querySelector(".sv-send");
  if (send) {
    send.hidden = false;
    send.disabled = !!e.sending;
  }
  const stop = form.querySelector(".sv-stop");
  if (stop && e.stopPhase !== "pending" && e.stopPhase !== "timedOut") stop.hidden = true;
}

function tickVoiceClock(pill) {
  const clock = pill?.querySelector(".cp-voice-clock");
  if (!clock) return;
  const said = voiceClock(Date.now() - (st.stt.since || Date.now()));
  if (clock.textContent !== said) clock.textContent = said;
}

function voiceSeat() {
  for (const e of structPool.values()) if (dictatingHere(e)) return e;
  return null;
}

function cancelDictation(e) {
  if (e) e.sendAfterDictation = null;
  for (const one of structPool.values()) one.sendAfterDictation = null;
  stopTalking({ cancel: true });
}

function finishDictation() {
  if (st.stt.state === "hearing") stopTalking();
}

let lastState = st.stt.state;

let clockTimer = 0;

function keepClock() {
  if (st.stt.state === "hearing" && !clockTimer) {
    clockTimer = setInterval(() => {
      const e = voiceSeat();
      if (!e) return;
      tickVoiceClock(e.host.querySelector(".sv-btns > .cp-voice"));
    }, CLOCK_MS);
  }
  if (st.stt.state !== "hearing" && clockTimer) {
    clearInterval(clockTimer);
    clockTimer = 0;
  }
}

function sendWhatWasSaid(said) {
  for (const e of structPool.values()) {
    const wanted = e.sendAfterDictation;
    if (!wanted) continue;
    e.sendAfterDictation = null;
    if (said || !e.box) continue;
    e.box.say(wanted.alternate);
  }
}

function dictationMoved(sound) {
  const was = lastState;
  lastState = sound.state;
  keepClock();
  for (const e of structPool.values()) {
    const here = dictatingHere(e);
    if (!here && !e.dictating && !e.sendAfterDictation) continue;
    e.dictating = here;
    if (here && sound.state === "hearing" && was !== "hearing") e.voiceWave = Array(WAVE_BARS).fill(0);
    paintComposer(e);
  }
  if (sound.state === "idle" && was !== "idle") sendWhatWasSaid(sound.said);
}

function heardLevel(level) {
  const e = voiceSeat();
  if (!e) return;
  const wave = (e.voiceWave ||= Array(WAVE_BARS).fill(0));
  wave.shift();
  wave.push(level);
  const pill = e.host.querySelector(".sv-btns > .cp-voice");
  if (!pill) return;
  pill.querySelector(".cp-voice-dot")?.classList.add("live");
  const bars = pill.querySelectorAll(".cp-voice-wave > i");
  wave.forEach((one, at) => {
    const bar = bars[at];
    if (!bar) return;
    const look = waveLook(one);
    bar.style.opacity = String(look.opacity);
    bar.style.transform = `scaleY(${look.scale})`;
  });
}

onComposerSend({
  order: 10,
  take(e, asked) {
    if (!dictatingHere(e)) return false;
    if (!e.sendAfterDictation) e.sendAfterDictation = { alternate: !!asked.alternate };
    finishDictation();
    return true;
  }
});

onComposerMode({ paint: paintVoice });

onDictation(dictationMoved);

onMicLevel(heardLevel);

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || ev.isComposing || !BUSY.has(st.stt.state)) return;
    const e = voiceSeat();
    if (!e) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelDictation(e);
  }, true);
}

export { WAVE_BARS, cancelDictation, dictatingHere, dictationMoved, finishDictation, voiceClock, waveLook };

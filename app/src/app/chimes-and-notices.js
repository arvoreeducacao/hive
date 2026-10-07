import { render } from "./arrange.js";
import { mugPlay } from "./avatars.js";
import { saveConfig } from "./brand-face.js";
import { frameUrlOf, openCockpit, tabsSaid } from "./chat-and-panes.js";
import { blockNumber } from "./blocks.js";
import { $, LABEL, esc, phrase, raycastOn, st } from "./core.js";
import { focusSeat, goTo } from "./focus-navigation.js";
import { keyCaps, keyHint, previousState } from "./leader-key.js";
import { agentIcon } from "./palette.js";

const SOUNDS = [
  { id: "chime", say: "chime — the rising one, the hive default", steps: [{ wave: "triangle", from: 660, to: 988, at: 0, dur: 0.16, peak: 1 }] },
  { id: "settle", say: "settle — the same one falling, softer", steps: [{ wave: "sine", from: 988, to: 587, at: 0, dur: 0.24, peak: 0.8 }] },
  { id: "coin", say: "coin — the arcade pickup", steps: [
    { wave: "square", from: 988, to: 988, at: 0, dur: 0.07, peak: 0.62 },
    { wave: "square", from: 1319, to: 1319, at: 0.06, dur: 0.22, peak: 0.62 }
  ] },
  { id: "power-up", say: "power-up — three steps up the ladder", steps: [
    { wave: "square", from: 523, to: 523, at: 0, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 784, to: 784, at: 0.06, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 1047, to: 1047, at: 0.12, dur: 0.16, peak: 0.6 }
  ] },
  { id: "ladder", say: "ladder — three steps down", steps: [
    { wave: "square", from: 1047, to: 1047, at: 0, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 784, to: 784, at: 0.06, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 523, to: 523, at: 0.12, dur: 0.18, peak: 0.6 }
  ] },
  { id: "blip", say: "blip — one short square, and done", steps: [{ wave: "square", from: 880, to: 880, at: 0, dur: 0.07, peak: 0.68 }] },
  { id: "bubble", say: "bubble — a pop coming up from below", steps: [{ wave: "sine", from: 220, to: 1200, at: 0, dur: 0.16, peak: 0.9 }] },
  { id: "marimba", say: "marimba — two wooden notes", steps: [
    { wave: "sine", from: 784, to: 784, at: 0, dur: 0.2, peak: 0.9 },
    { wave: "sine", from: 1175, to: 1175, at: 0.11, dur: 0.3, peak: 0.75 }
  ] },
  { id: "doorbell", say: "doorbell — ding, then dong", steps: [
    { wave: "sine", from: 784, to: 784, at: 0, dur: 0.3, peak: 0.95 },
    { wave: "sine", from: 587, to: 587, at: 0.2, dur: 0.45, peak: 0.95 }
  ] },
  { id: "pulse", say: "pulse — three quick knocks on the same note", steps: [
    { wave: "triangle", from: 740, to: 740, at: 0, dur: 0.06, peak: 0.7 },
    { wave: "triangle", from: 740, to: 740, at: 0.1, dur: 0.06, peak: 0.7 },
    { wave: "triangle", from: 740, to: 740, at: 0.2, dur: 0.09, peak: 0.7 }
  ] },
  { id: "nudge", say: "nudge — the one from MSN, and the window shakes with it", src: "/assets/nudge.mp3" }
];

const SOUND_IDS = SOUNDS.map((s) => s.id);

const DEFAULT_SOUNDS = { needs: "chime", answered: "settle", asked: "nudge" };

const NOTICE_KINDS = Object.keys(DEFAULT_SOUNDS);

const SWITCHED = NOTICE_KINDS.filter((kind) => kind !== "asked");

const VOLUME_DEFAULT = 70;

const LOUDEST = 0.34;

const NOTICES_AT_ONCE = 3;

function soundOf(id) {
  return SOUNDS.find((s) => s.id === id) || SOUNDS[0];
}

function pickedSounds(wanted) {
  const picked = { ...DEFAULT_SOUNDS };
  const bad = [];
  for (const kind of SWITCHED) {
    const name = wanted?.[kind];
    if (name === undefined) continue;
    if (SOUND_IDS.includes(name)) picked[kind] = name;
    else bad.push(phrase("sounds.{kind}: no sound called “{name}”", { kind: kind, name: name }));
  }
  return { picked, bad };
}

function levelOf(loudness, step) {
  return Math.max(0.0002, (loudness / 100) * LOUDEST * step.peak);
}

function turnedInto(sessions, seen, state) {
  const turned = [];
  for (const s of sessions) {
    const before = seen.get(s.name);
    if (before && before !== state && s.state === state) turned.push(s);
  }
  return turned;
}

function noticeOfAnswer(s) {
  return {
    title: `${s.title || s.name} answered`,
    body: s.summary || s.now || phrase("it finished its turn and is waiting for you")
  };
}

function ensureAudio() {
  if (!st.audio) st.audio = new (window.AudioContext || window.webkitAudioContext)();
  if (st.audio.state === "suspended") st.audio.resume();
  return st.audio;
}

const samples = new Map();

function sampleOf(voice) {
  if (!samples.has(voice.id)) {
    samples.set(voice.id, fetch(voice.src)
      .then((r) => r.arrayBuffer())
      .then((raw) => ensureAudio().decodeAudioData(raw)));
  }
  return samples.get(voice.id);
}

function playSample(voice) {
  mugPlay("play");
  const a = ensureAudio();
  const loud = Math.min(1, st.volume / 100);
  sampleOf(voice).then((buffer) => {
    const clip = a.createBufferSource(), g = a.createGain();
    clip.buffer = buffer;
    g.gain.setValueAtTime(loud, a.currentTime);
    clip.connect(g); g.connect(a.destination);
    clip.start();
  }).catch(() => {});
}

function playSound(id) {
  if (!st.volume) return;
  const voice = soundOf(id);
  if (voice.src) return playSample(voice);
  const a = ensureAudio(), start = a.currentTime + 0.01;
  for (const step of voice.steps) {
    const t = start + step.at, g = a.createGain(), o = a.createOscillator();
    o.type = step.wave;
    o.frequency.setValueAtTime(step.from, t);
    if (step.to !== step.from) o.frequency.exponentialRampToValueAtTime(step.to, t + step.dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(levelOf(st.volume, step), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step.dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + step.dur + 0.02);
  }
}

function earcon(which) {
  playSound(st.sounds[which] || DEFAULT_SOUNDS[which]);
}

function noticesAllowed() {
  return typeof Notification === "function" && Notification.permission === "granted";
}

async function askForNotices() {
  if (typeof Notification !== "function") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try { return (await Notification.requestPermission()) === "granted"; } catch { return false; }
}

function showNotice(title, body, seat, go) {
  if (!noticesAllowed()) return;
  const notice = new Notification(title, { body, tag: `hive-${seat || "fleet"}`, silent: true });
  notice.onclick = () => {
    window.focus();
    if (go) go();
    else if (seat) focusSeat(seat);
    render();
  };
}

const ACTION_OF_NOTICE = { needs: "sound", answered: "answered" };

const noticeIsOn = (kind) => (kind === "needs" ? st.sound : st.answeredAlert);

const flipNotice = (kind) => (kind === "needs" ? setSound(!st.sound) : setAnswered(!st.answeredAlert));

function paintNotices() {
  $("s-asked-say").textContent = phrase(soundOf(DEFAULT_SOUNDS.asked).say);
  paintKnocksSwitch();
  for (const kind of SWITCHED) {
    const pick = $(`s-${kind}`);
    if (pick.options.length !== SOUNDS.length) pick.innerHTML = SOUNDS.map((s) => `<option value="${s.id}">${esc(phrase(s.say))}</option>`).join("");
    if (pick !== document.activeElement) pick.value = st.sounds[kind];
    const on = noticeIsOn(kind);
    const key = st.keys[ACTION_OF_NOTICE[kind]] || st.chords[ACTION_OF_NOTICE[kind]] ? ` — ${keyHint(ACTION_OF_NOTICE[kind])}` : "";
    const flip = $(`t-${kind}`);
    flip.textContent = on ? "on" : "off";
    flip.classList.toggle("on", on);
    flip.title = on ? `it plays${key ? `${key} silences it` : ""}` : `it is silent${key ? `${key} turns it on` : ""}`;
  }
  const bar = $("s-volume");
  if (bar !== document.activeElement) bar.value = String(st.volume);
  $("s-volume-n").textContent = st.volume ? `${st.volume}%` : phrase("mute");
}

function setSounds(picked, quiet) {
  st.sounds = { ...DEFAULT_SOUNDS, ...picked };
  paintNotices();
  if (quiet) return;
  saveConfig({ sounds: st.sounds }).catch(() => {});
}

function setVolume(v, quiet) {
  st.volume = v;
  paintNotices();
  if (quiet) return;
  saveConfig({ volume: v }).catch(() => {});
}

function adoptNotices(r) {
  const { picked } = pickedSounds(r.config.sounds);
  setSounds(picked, true);
  setVolume(r.config.volume === undefined ? VOLUME_DEFAULT : r.config.volume, true);
}

function setSound(v, quiet) {
  st.sound = v;
  paintNotices();
  if (quiet) return;
  saveConfig({ sound: v }).catch(() => {});
  if (!v) return;
  ensureAudio();
  earcon("needs");
}

function paintKnocksSwitch() {
  const on = st.teamKnocks;
  $("s-knocks-say").textContent = on ? phrase("keyboard asks, pokes and questions reach you") : phrase("nothing from the team reaches you");
  const flip = $("t-knocks");
  flip.textContent = on ? "on" : "off";
  flip.classList.toggle("on", on);
  flip.title = on ? phrase("the team can knock") : phrase("the door is closed to the team");
}

function setKnocks(v, quiet) {
  st.teamKnocks = v;
  paintNotices();
  if (quiet) return;
  saveConfig({ knocks: v }).catch(() => {});
}

function setAnswered(v, quiet) {
  st.answeredAlert = v;
  paintNotices();
  if (quiet) return;
  saveConfig({ answered: v }).catch(() => {});
  if (!v) return;
  ensureAudio();
  earcon("answered");
  askForNotices();
}

function announceChange() {
  const asking = turnedInto(st.data.sessions, previousState, "needs");
  const answered = turnedInto(st.data.sessions, previousState, "answered");
  for (const s of st.data.sessions) previousState.set(s.name, s.state);
  if (raycastOn()) {
    settleSeatNotices();
    for (const s of asking) if (st.typing !== s.name) pinSeatNotice(s);
  }
  if (asking.length && st.sound) earcon("needs");
  if (!answered.length || !st.answeredAlert) return;
  if (raycastOn()) for (const s of answered.slice(0, NOTICES_AT_ONCE)) if (st.typing !== s.name) pinSeatNotice(s);
  earcon("answered");
  if (answered.length > NOTICES_AT_ONCE) return showNotice(`${answered.length} seats answered`, answered.map((s) => s.title || s.name).join(", "));
  for (const s of answered) {
    const said = noticeOfAnswer(s);
    showNotice(said.title, said.body, s.name);
  }
}

const SEAT_NOTICE_STAYS = 14000;

function seatNoticeModel(s) {
  const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
  const needs = s.state === "needs";
  return {
    seat: s.name,
    state: s.state,
    icon: agentIcon(s),
    name: s.title || s.name,
    title: needs ? s.title || s.name : phrase("{name} answered", { name: s.title || s.name }),
    at: [bi >= 0 ? `b${blockNumber(bi)}` : "", phrase("now")].filter(Boolean).join(" · "),
    say: String(s.now || s.summary || (needs ? phrase("it stopped and asks you something") : phrase("it finished its turn and is waiting for you"))).slice(0, 220),
    go: needs ? phrase("Answer") : phrase("Open"),
    keys: keyHint("calls"),
    stays: !needs
  };
}

function seatNoticeOf(s) {
  const said = seatNoticeModel(s);
  const card = document.createElement("div");
  card.className = `cn cn-seat-card${said.state === "needs" ? " needs" : ""}`;
  card.dataset.seat = said.seat;
  card.dataset.state = said.state;
  card.setAttribute("role", "status");
  card.innerHTML = `
    <span class="cn-ic"><svg aria-hidden="true"><use href="#${esc(said.icon)}"/></svg><i class="rc-dot ${esc(said.state)}" aria-hidden="true"></i></span>
    <div class="cn-body">
      <div class="cn-head"><span class="cn-name">${esc(said.title)}</span><span class="cn-at">${esc(said.at)}</span></div>
      <div class="cn-say">${esc(said.say)}</div>
      <div class="cn-acts"><button type="button" class="cn-go">${esc(said.go)}${keyCaps(said.keys)}</button><button type="button" class="cn-later">${esc(phrase("Later"))}</button></div>
    </div>`;
  card.title = phrase(LABEL[said.state] || "idle");
  const go = (ev) => { ev.stopPropagation(); goTo(said.seat); dropCanopyNotice(card); };
  card.addEventListener("click", go);
  card.querySelector(".cn-go").addEventListener("click", go);
  card.querySelector(".cn-later").addEventListener("click", (ev) => { ev.stopPropagation(); dropCanopyNotice(card); });
  if (said.stays) card._t = setTimeout(() => dropCanopyNotice(card), SEAT_NOTICE_STAYS);
  return card;
}

function pinSeatNotice(s) {
  const stack = $("canopyNotices");
  for (const old of stack.querySelectorAll(`.cn-seat-card[data-seat="${CSS.escape(s.name)}"]`)) old.remove();
  stack.appendChild(seatNoticeOf(s));
  while (stack.children.length > CANOPY_NOTICES_AT_ONCE) stack.firstElementChild.remove();
}

function openNewestSeatNotice() {
  const card = [...$("canopyNotices").querySelectorAll(".cn-seat-card:not(.going)")].pop();
  if (!card) return false;
  goTo(card.dataset.seat);
  dropCanopyNotice(card);
  return true;
}

function settleSeatNotices() {
  const now = new Map(st.data.sessions.map((s) => [s.name, s.state]));
  for (const card of $("canopyNotices").querySelectorAll(".cn-seat-card")) {
    if (now.get(card.dataset.seat) !== card.dataset.state) dropCanopyNotice(card);
  }
}

const previousTabs = new Map();

const CANOPY_NOTICES_AT_ONCE = 3;

const CANOPY_NOTICE_STAYS = 14000;

function openedTabs(sessions, seen) {
  const opened = [];
  for (const s of sessions) {
    const now = s.canopy?.tabs || 0;
    if (seen.has(s.name) && !seen.get(s.name) && now > 0) opened.push(s);
  }
  return opened;
}

function dropCanopyNotice(card) {
  if (!card.isConnected || card.classList.contains("going")) return;
  clearTimeout(card._t);
  card.classList.add("going");
  setTimeout(() => card.remove(), 200);
}

function canopyNoticeOf(s) {
  const card = document.createElement("div");
  card.className = "cn";
  card.setAttribute("role", "status");
  if (raycastOn()) card.innerHTML = `
    <div class="cn-shot"><img alt="" hidden><b><svg aria-hidden="true"><use href="#i-screen"/></svg></b></div>
    <div class="cn-body">
      <div class="cn-head"><span class="cn-seat"></span></div>
      <div class="cn-say"><span class="cn-line">${phrase("is testing in the browser")}</span> · <span class="cn-tab"></span></div>
      <div class="cn-acts"><button type="button" class="cn-go">${phrase("see it beside")}</button></div>
    </div>`;
  else card.innerHTML = `
    <div class="cn-shot"><img alt="" hidden><b><svg aria-hidden="true"><use href="#i-screen"/></svg></b></div>
    <div class="cn-body">
      <div class="cn-seat"></div>
      <div class="cn-line">${phrase("is testing in the browser")}</div>
      <div class="cn-tab"></div>
      <button class="cn-go">${phrase("see it beside")}</button>
    </div>`;
  card.querySelector(".cn-seat").textContent = raycastOn() ? s.title || s.name : s.name;
  card.querySelector(".cn-tab").textContent = s.canopy.title || s.canopy.url || tabsSaid(s.canopy.tabs);
  const img = card.querySelector("img");
  img.addEventListener("load", () => { img.hidden = false; card.querySelector(".cn-shot b").hidden = true; });
  img.src = frameUrlOf(s.name, "", Date.now());
  const go = (ev) => { ev.stopPropagation(); openCockpit(s.name); dropCanopyNotice(card); };
  card.addEventListener("click", go);
  card.querySelector(".cn-go").addEventListener("click", go);
  card._t = setTimeout(() => dropCanopyNotice(card), CANOPY_NOTICE_STAYS);
  return card;
}

function announceCanopy() {
  const opened = openedTabs(st.data.sessions, previousTabs);
  for (const s of st.data.sessions) previousTabs.set(s.name, s.canopy?.tabs || 0);
  for (const name of [...previousTabs.keys()]) if (!st.data.sessions.some((s) => s.name === name)) previousTabs.delete(name);
  if (!opened.length) return;
  const stack = $("canopyNotices");
  for (const s of opened) {
    stack.appendChild(canopyNoticeOf(s));
    while (stack.children.length > CANOPY_NOTICES_AT_ONCE) stack.firstElementChild.remove();
    showNotice(`${s.title || s.name} ${phrase("is testing in the browser")}`, s.canopy.title || s.canopy.url || tabsSaid(s.canopy.tabs), s.name, () => openCockpit(s.name));
  }
  if (st.answeredAlert) earcon("answered");
}

export { openNewestSeatNotice, pinSeatNotice, seatNoticeModel, seatNoticeOf, settleSeatNotices, ACTION_OF_NOTICE, CANOPY_NOTICES_AT_ONCE, CANOPY_NOTICE_STAYS, DEFAULT_SOUNDS, LOUDEST, NOTICES_AT_ONCE, NOTICE_KINDS, SOUNDS, SOUND_IDS, SWITCHED, VOLUME_DEFAULT, adoptNotices, announceCanopy, announceChange, askForNotices, canopyNoticeOf, dropCanopyNotice, earcon, ensureAudio, flipNotice, levelOf, noticeIsOn, noticeOfAnswer, noticesAllowed, openedTabs, paintNotices, pickedSounds, playSample, playSound, previousTabs, sampleOf, samples, setAnswered, setKnocks, setSound, setSounds, setVolume, showNotice, soundOf, turnedInto };

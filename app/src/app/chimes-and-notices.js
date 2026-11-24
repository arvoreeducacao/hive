import { render } from "./arrange.js";
import { mugPlay } from "./avatars.js";
import { saveConfig } from "./brand-face.js";
import { frameUrlOf, openCockpit, tabsSaid } from "./chat-and-panes.js";
import { activeItems, soloSeat } from "./blocks.js";
import { $, LABEL, esc, phrase, raycastOn, st } from "./core.js";
import { focusSeat, goTo } from "./focus-navigation.js";
import { keyHint, keyTip, markSeatRead, pool, previousState, readMark, seatMark } from "./leader-key.js";
import { ASKS_FOR_YOU, WORKING_EXIT_GRACE_MS, createNoticeGate, mutedBy, observationOf, titleOf, waitsForYou } from "./notice-gate.js";
import { agentIcon } from "./palette.js";
import { structPool } from "./structured-seats.js";

const SOUNDS = [
  { id: "chime", name: "Chime", steps: [{ wave: "triangle", from: 660, to: 988, at: 0, dur: 0.16, peak: 1 }] },
  { id: "settle", name: "Landing", steps: [{ wave: "sine", from: 988, to: 587, at: 0, dur: 0.24, peak: 0.8 }] },
  { id: "coin", name: "Coin", steps: [
    { wave: "square", from: 988, to: 988, at: 0, dur: 0.07, peak: 0.62 },
    { wave: "square", from: 1319, to: 1319, at: 0.06, dur: 0.22, peak: 0.62 }
  ] },
  { id: "power-up", name: "Power-up", steps: [
    { wave: "square", from: 523, to: 523, at: 0, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 784, to: 784, at: 0.06, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 1047, to: 1047, at: 0.12, dur: 0.16, peak: 0.6 }
  ] },
  { id: "ladder", name: "Ladder", steps: [
    { wave: "square", from: 1047, to: 1047, at: 0, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 784, to: 784, at: 0.06, dur: 0.07, peak: 0.6 },
    { wave: "square", from: 523, to: 523, at: 0.12, dur: 0.18, peak: 0.6 }
  ] },
  { id: "blip", name: "Blip", steps: [{ wave: "square", from: 880, to: 880, at: 0, dur: 0.07, peak: 0.68 }] },
  { id: "bubble", name: "Bubble", steps: [{ wave: "sine", from: 220, to: 1200, at: 0, dur: 0.16, peak: 0.9 }] },
  { id: "marimba", name: "Marimba", steps: [
    { wave: "sine", from: 784, to: 784, at: 0, dur: 0.2, peak: 0.9 },
    { wave: "sine", from: 1175, to: 1175, at: 0.11, dur: 0.3, peak: 0.75 }
  ] },
  { id: "doorbell", name: "Doorbell", steps: [
    { wave: "sine", from: 784, to: 784, at: 0, dur: 0.3, peak: 0.95 },
    { wave: "sine", from: 587, to: 587, at: 0.2, dur: 0.45, peak: 0.95 }
  ] },
  { id: "pulse", name: "Pulse", steps: [
    { wave: "triangle", from: 740, to: 740, at: 0, dur: 0.06, peak: 0.7 },
    { wave: "triangle", from: 740, to: 740, at: 0.1, dur: 0.06, peak: 0.7 },
    { wave: "triangle", from: 740, to: 740, at: 0.2, dur: 0.09, peak: 0.7 }
  ] },
  { id: "nudge", name: "Nudge", src: "/assets/nudge.mp3" }
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
  if (!noticesAllowed()) return null;
  const notice = new Notification(title, { body, tag: `hive-${seat || "fleet"}`, silent: true });
  notice.onclick = () => {
    notice.close();
    window.hiveDock?.reveal?.();
    window.focus();
    if (go) go();
    else if (seat) focusSeat(seat);
    render();
  };
  return notice;
}

const ACTION_OF_NOTICE = { needs: "sound", answered: "answered" };

const noticeIsOn = (kind) => (kind === "needs" ? st.sound : st.answeredAlert);

const flipNotice = (kind) => (kind === "needs" ? setSound(!st.sound) : setAnswered(!st.answeredAlert));

function paintNotices() {
  paintKnocksSwitch();
  for (const kind of SWITCHED) {
    const pick = $(`s-${kind}`);
    if (pick.options.length !== SOUNDS.length) pick.innerHTML = SOUNDS.map((s) => `<option value="${s.id}">${esc(phrase(s.name))}</option>`).join("");
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

const sessionNamed = (name) => (st.data?.sessions || []).find((s) => s.name === name) || null;

function noticeExtras(s) {
  return {
    secret: (st.secretAsks || []).find((one) => one.seat === s.name) || null,
    limitedUntil: structPool.get(s.name)?.limitedUntil || pool.get(s.name)?.limitedUntil || 0
  };
}

const lookOf = (s) => observationOf(s, noticeExtras(s));

const appFocused = () => document.visibilityState === "visible" && document.hasFocus();

const seatInView = () => st.open || activeItems()[st.focus]?.key || "";

function chatOnScreen(name) {
  const host = structPool.get(name)?.host;
  if (!host?.isConnected) return false;
  const box = host.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
}

function lookingAt(name) {
  if (st.typing === name || st.open === name) return true;
  return seatInView() === name && chatOnScreen(name);
}

const archivedNow = (name) => (st.data?.archived || []).some((one) => one.name === name);

const quietFor = (name, now) => archivedNow(name) || mutedBy(st.data?.marks?.[name], now);

const mainNotifies = (status) => !!window.hiveWindow && !window.hiveDock && (status === "input" || status === "approval");

function openChatFromNotice(name) {
  markSeatRead(name);
  goTo(name);
}

let heard = [];

const delivered = new Map();

let noticeGate = null;

const gateOf = () => (noticeGate ||= createNoticeGate((name, kind, look) => heard.push({ name, kind, look }), { seen: previousState }));

function presentNotice({ name, kind, look }, chimes) {
  const s = sessionNamed(name);
  if (!s) return;
  const completed = kind === "completion";
  if (completed && !st.answeredAlert) return;
  if (completed) chimes.add("answered");
  else if (st.sound) chimes.add("needs");
  const focused = appFocused();
  if (focused && lookingAt(name)) return;
  if (focused && raycastOn()) return pinSeatNotice(s, kind, look);
  if (mainNotifies(look.status)) return;
  const notice = showNotice(phrase(titleOf(kind, look.status)), s.title || s.name, name, () => openChatFromNotice(name));
  if (notice) delivered.set(name, notice);
}

function readWhatYouSee() {
  if (!appFocused()) return;
  const s = sessionNamed(seatInView());
  if (s?.state === "answered" && chatOnScreen(s.name)) markSeatRead(s.name);
}

function announceChange(now = Date.now()) {
  if (soloSeat) return;
  const sessions = st.data?.sessions || [];
  heard = [];
  const gate = gateOf();
  gate.retain(new Set(sessions.map((s) => s.name)));
  for (const s of sessions) gate.observe(s.name, lookOf(s), { muted: quietFor(s.name, now), now });
  if (raycastOn()) settleSeatNotices();
  const chimes = new Set();
  for (const one of heard) presentNotice(one, chimes);
  for (const kind of chimes) earcon(kind);
  readWhatYouSee();
  paintBadge(now);
}

const unreadSeat = (s) => s.state === "answered" || (s.state === "done" && readMark.has(s.name) && readMark.get(s.name) !== seatMark(s));

function waitingCount(now = Date.now()) {
  const marks = st.data?.marks || {};
  const focused = appFocused();
  return (st.data?.sessions || []).filter((s) => !archivedNow(s.name) && !(focused && lookingAt(s.name)) && waitsForYou(lookOf(s), marks[s.name], now, unreadSeat(s))).length;
}

let badgeSaid = -1;

function paintBadge(now = Date.now()) {
  if (soloSeat || !window.hiveDock?.badge) return;
  const count = waitingCount(now);
  if (count === badgeSaid) return;
  badgeSaid = count;
  window.hiveDock.badge(count);
}

function forgetDelivered() {
  for (const notice of delivered.values()) notice.close();
  delivered.clear();
}

window.addEventListener("focus", () => { forgetDelivered(); paintBadge(); });

window.addEventListener("blur", () => paintBadge());

const SEAT_NOTICE_STAYS = 14000;

function seatNoticeModel(s, kind = s.state === "needs" ? "attention" : "completion", look = lookOf(s)) {
  const attention = kind !== "completion";
  const go = phrase("Open thread");
  const keys = keyTip(keyHint("calls"));
  return {
    seat: s.name,
    state: s.state,
    kind: attention ? "attention" : "completion",
    status: attention ? look.status || "input" : "completion",
    watch: attention ? look.attention || "" : s.state,
    icon: agentIcon(s),
    name: s.title || s.name,
    title: phrase(titleOf(kind, look.status)),
    say: s.title || s.name,
    go,
    goTip: keys ? `${go} (${keys})` : go,
    later: phrase("Later"),
    stays: !(attention && ASKS_FOR_YOU.has(look.status || "input"))
  };
}

function seatNoticeOf(s, kind, look) {
  const said = seatNoticeModel(s, kind, look);
  const card = document.createElement("div");
  card.className = `cn cn-seat-card${said.kind === "attention" ? " needs" : ""}`;
  card.dataset.seat = said.seat;
  card.dataset.state = said.state;
  card.dataset.kind = said.kind;
  card.dataset.status = said.status;
  card.dataset.watch = said.watch;
  card.setAttribute("role", "status");
  card.innerHTML = `
    <span class="cn-ic"><svg aria-hidden="true"><use href="#${esc(said.icon)}"/></svg><i class="rc-dot ${esc(said.state)}" aria-hidden="true"></i></span>
    <div class="cn-body">
      <div class="cn-head"><span class="cn-name">${esc(said.title)}</span></div>
      <div class="cn-say">${esc(said.say)}</div>
      <div class="cn-acts"><button type="button" class="cn-go" title="${esc(said.goTip)}">${esc(said.go)}</button></div>
    </div>
    <button type="button" class="cn-later" aria-label="${esc(said.later)}" title="${esc(said.later)}"><svg aria-hidden="true"><use href="#i-x"/></svg></button>`;
  card.title = phrase(LABEL[said.state] || "idle");
  const go = (ev) => { ev.stopPropagation(); openChatFromNotice(said.seat); dropCanopyNotice(card); };
  card.addEventListener("click", go);
  card.querySelector(".cn-go").addEventListener("click", go);
  card.querySelector(".cn-later").addEventListener("click", (ev) => { ev.stopPropagation(); dropCanopyNotice(card); });
  if (said.stays) card._t = setTimeout(() => dropCanopyNotice(card), SEAT_NOTICE_STAYS);
  return card;
}

function pinSeatNotice(s, kind, look) {
  const stack = $("canopyNotices");
  for (const old of stack.querySelectorAll(`.cn-seat-card[data-seat="${CSS.escape(s.name)}"]`)) old.remove();
  stack.appendChild(seatNoticeOf(s, kind, look));
  while (stack.children.length > CANOPY_NOTICES_AT_ONCE) stack.firstElementChild.remove();
}

function openNewestSeatNotice() {
  const card = [...$("canopyNotices").querySelectorAll(".cn-seat-card:not(.going)")].pop();
  if (!card) return false;
  openChatFromNotice(card.dataset.seat);
  dropCanopyNotice(card);
  return true;
}

function settleSeatNotices() {
  for (const card of $("canopyNotices").querySelectorAll(".cn-seat-card")) {
    const s = sessionNamed(card.dataset.seat);
    const now = !s ? "" : card.dataset.kind === "attention" ? lookOf(s).attention || "" : s.state;
    if (now !== card.dataset.watch) dropCanopyNotice(card);
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

export { openNewestSeatNotice, pinSeatNotice, seatNoticeModel, seatNoticeOf, settleSeatNotices, ACTION_OF_NOTICE, WORKING_EXIT_GRACE_MS, lookingAt, openChatFromNotice, paintBadge, waitingCount, CANOPY_NOTICES_AT_ONCE, CANOPY_NOTICE_STAYS, DEFAULT_SOUNDS, LOUDEST, NOTICES_AT_ONCE, NOTICE_KINDS, SOUNDS, SOUND_IDS, SWITCHED, VOLUME_DEFAULT, adoptNotices, announceCanopy, announceChange, askForNotices, canopyNoticeOf, dropCanopyNotice, earcon, ensureAudio, flipNotice, levelOf, noticeIsOn, noticesAllowed, openedTabs, paintNotices, pickedSounds, playSample, playSound, previousTabs, sampleOf, samples, setAnswered, setKnocks, setSound, setSounds, setVolume, showNotice, soundOf };

import { apiBinary, apiGet, apiPost } from "/assets/api.mjs";
import { createChunker, MEETING_SAMPLE_RATE } from "/assets/meeting-chunks.mjs";
import { saveConfig } from "./brand-face.js";
import { showNotice } from "./chimes-and-notices.js";
import { $, esc, every, phrase, solidMounts, st, stopBeat } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { ask, closePortaria, portariaOnScreen } from "./pod.js";
import { closeRoutines, routinesOnScreen } from "./routines.js";
import { pullDictation } from "./stt.js";
import { downloadSaid } from "./stt-prefs.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

export const MEETINGS_BEAT = 5000;

const TICK = 1000;

st.meetings = {
  list: null, me: "", people: [], settings: null, models: [], listening: { ready: false, why: "" }, shelf: false,
  scope: "team", query: "", pick: "", open: null, mine: false, tab: "summary", menu: false, trouble: "",
  rec: null, nextWho: "", setting: false, outputs: null, rowMenu: null, live: "", captions: null
};

let rec = null;
let meetingsSolid = null;

export const meetingsOnScreen = () => !$("meetings").hidden;

export const recordingNow = () => !!rec;

export const clockSaid = (seconds) => {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const lengthSaid = (seconds) => phrase("{n} min", { n: Math.max(1, Math.round((seconds || 0) / 60)) });

export const initialsOf = (handle) => String(handle || "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";

const hourSaid = (at) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function daySaid(at, now = Date.now()) {
  const day = new Date(at);
  const today = new Date(now);
  const gap = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(day.getFullYear(), day.getMonth(), day.getDate())) / 86400000);
  if (gap === 0) return phrase("Today");
  if (gap === 1) return phrase("Yesterday");
  return day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export function whoSaid(meeting, me) {
  if (meeting.who === "me") return meeting.owner === me ? phrase("only you") : phrase("private");
  if (meeting.who === "people") return phrase("{n} people", { n: (meeting.people || []).length });
  return phrase("team");
}

const ownerSaid = (owner, me) => (owner === me ? phrase("you") : owner);

function rowModel(one, me, now, byPerson) {
  const live = one.state === "recording";
  const when = byPerson ? `${daySaid(one.startedAt, now)} · ${hourSaid(one.startedAt)}` : `${ownerSaid(one.owner, me)} · ${hourSaid(one.startedAt)}`;
  return {
    key: one.id, id: one.id, title: one.title, initials: initialsOf(one.owner), live, here: one.id === st.meetings.pick, mine: one.owner === me && !live,
    meta: live ? phrase("recording") : one.state === "summarizing" ? `${when} · ${phrase("writing the notes…")}` : `${when} · ${lengthSaid(one.seconds)}`,
    chip: live ? phrase("live") : whoSaid(one, me), hot: live || one.who === "me", indent: byPerson
  };
}

export function groupsOf(list, { scope, me, now = Date.now() }) {
  const shown = scope === "mine" ? list.filter((one) => one.owner === me) : list;
  const groups = [];
  const byKey = new Map();
  const into = (key, head) => {
    if (!byKey.has(key)) { byKey.set(key, { key, ...head, rows: [] }); groups.push(byKey.get(key)); }
    return byKey.get(key);
  };
  if (scope === "people") {
    const ordered = [...shown].sort((a, b) => (b.owner === me) - (a.owner === me) || a.owner.localeCompare(b.owner) || b.startedAt - a.startedAt);
    for (const one of ordered) into(`p:${one.owner}`, { title: ownerSaid(one.owner, me), initials: initialsOf(one.owner) }).rows.push(rowModel(one, me, now, true));
  } else {
    for (const one of shown) {
      if (one.state === "recording") into("live", { title: phrase("Now"), initials: "" }).rows.push(rowModel(one, me, now, false));
      else into(`d:${daySaid(one.startedAt, now)}`, { title: daySaid(one.startedAt, now), initials: "" }).rows.push(rowModel(one, me, now, false));
    }
  }
  return groups.map((group) => ({ ...group, count: String(group.rows.length) }));
}

function blankModel(m) {
  if (m.trouble) return { warn: true, head: phrase("The meetings did not load"), say: m.trouble, act: "", actSay: "" };
  if (m.listening.why === "pod") return { warn: false, head: phrase("From here you can read, not record"), say: phrase("Recording uses the microphone and the engine of your own machine. In the hive on the server the list and the team's notes stay open."), act: "", actSay: "" };
  if (!m.listening.ready && !st.stt?.unsupported) {
    const coming = st.stt?.download ? downloadSaid(st.stt.download) : "";
    return {
      warn: false, head: phrase("Transcription is not set up yet"),
      say: coming || phrase("The words are written on this machine, by the same engine dictation uses. It is one download of about 855 MB."),
      act: coming ? "" : "setup", actSay: phrase("Download and set up")
    };
  }
  if (st.stt?.unsupported) return { warn: true, head: phrase("This machine cannot record"), say: st.stt.unsupported, act: "", actSay: "" };
  return { warn: false, head: phrase("No meeting yet"), say: phrase("Record a conversation and the hive hands back the words and notes with what was decided. The team sees what you leave visible."), act: "record", actSay: phrase("Record a meeting") };
}

function detailModel(m) {
  const one = m.open;
  if (!one) return null;
  const live = one.state === "recording";
  const mine = m.mine;
  const summary = one.summary;
  const lines = (one.lines || []).map((line, index) => ({
    key: `${index}`, clock: clockSaid(line.at), mine: line.source === "mic", source: line.source === "caption" ? line.speaker || phrase("the call") : line.source === "mic" ? phrase("you") : phrase("the call"), text: line.text
  }));
  const recording = live && rec && rec.id === one.id;
  const remote = live && !recording && one.id === m.live;
  return {
    id: one.id, title: one.title, live, mine, initials: initialsOf(one.owner),
    by: one.owner === m.me ? phrase("recorded by you") : phrase("recorded by {name}", { name: one.owner }),
    when: `${daySaid(one.startedAt)}, ${hourSaid(one.startedAt)}`,
    length: live ? "" : lengthSaid(one.seconds),
    who: whoSaid(one, m.me), whoHot: one.who === "me", whoKey: one.who, people: one.people || [],
    timer: recording ? clockSaid((Date.now() - rec.startedAt) / 1000) : remote ? clockSaid((Date.now() - one.startedAt) / 1000) : "",
    local: !!recording,
    mic: recording ? Math.round(rec.level("mic") * 100) : 0,
    system: recording ? Math.round(rec.level("system") * 100) : 0,
    systemOn: recording ? rec.systemOn : false,
    systemDenied: recording ? rec.systemDenied : false,
    captions: recording ? !!rec.captions : remote ? !!m.captions?.on : false,
    tab: live ? "transcript" : m.tab,
    state: one.state, trouble: one.trouble || "",
    summary: summary ? { oneLine: summary.oneLine, decisions: summary.decisions || [], nextSteps: (summary.nextSteps || []).map((step) => ({ who: step.who, what: step.what })), open: summary.open || [] } : null,
    lines,
    model: one.model ? (m.models.find((model) => model.id === one.model)?.name || one.model) : "",
    menu: m.menu,
    team: m.people.filter((name) => name !== m.me).map((name) => ({ key: name, name, on: (one.people || []).includes(name) }))
  };
}

export function meetingsViewModel() {
  const m = st.meetings;
  const list = m.list || [];
  const groups = groupsOf(list, { scope: m.scope, me: m.me });
  return {
    title: phrase("meetings"),
    loaded: !!m.list || !!m.trouble,
    recording: !!rec || !!m.live,
    canRecord: !m.setting,
    scope: m.scope, query: m.query,
    groups,
    none: m.query ? phrase("Nothing matches") : m.scope === "mine" ? phrase("You have not recorded a meeting yet") : "",
    blank: !list.length && !m.query ? blankModel(m) : m.trouble ? blankModel(m) : null,
    detail: detailModel(m),
    rowMenu: m.rowMenu ? { x: m.rowMenu.x, y: m.rowMenu.y, say: phrase("Delete this meeting") } : null,
    say: {
      record: phrase("Record a meeting"), stop: phrase("Stop and write the notes"), mine: phrase("Mine"), team: phrase("The team's"), people: phrase("By person"),
      search: phrase("Search titles, notes and what was said"), summary: phrase("Notes"), transcript: phrase("Transcript"),
      copyNotes: phrase("Copy the notes"), copyWords: phrase("Copy the transcript"), oneLine: phrase("In one sentence"), decisions: phrase("What was decided"),
      nextSteps: phrase("Next steps"), open: phrase("Left open"), redo: phrase("Write the notes again"), retry: phrase("Try again"),
      discard: phrase("Discard"), mic: phrase("Microphone"), system: phrase("Computer sound"), onFinish: phrase("When it ends:"),
      fromCall: phrase("Written from the captions of the call. The microphone is not open."),
      privacy: phrase("The words are written on this machine, piece by piece. The sound is not kept and not sent anywhere."),
      sources: phrase("Written on this machine. Your microphone is marked as you, the computer's sound as the call."),
      hearing: phrase("listening… the next piece turns into words in a few seconds"),
      writing: phrase("Finishing the last piece and asking for the notes. You can close this — the meeting shows up in the list when it is ready."),
      writingHead: phrase("Writing the notes"),
      failedHead: phrase("The transcript is saved, the notes did not come out"),
      failed: phrase("The model did not answer. Nothing was lost: the words of the meeting are under Transcript."),
      noWords: phrase("Nothing was said in this meeting, so there are no notes."),
      noLines: phrase("No words yet."),
      madeBy: phrase("Notes by {model}, from the transcript made on this machine"),
      captions: phrase("Meet captions"), captionsSay: phrase("The captions of the call are coming from the browser, with who said what. The sound keeps being heard, and takes over if they stop."),
      micOnly: phrase("Recording only your microphone — the system did not hand over the computer's sound, so the other side of the call is not written down."),
      whoHead: phrase("Who sees this meeting"), whoTeam: phrase("The whole team"), whoTeamSay: phrase("notes and transcript show up in everyone's list"),
      whoMe: phrase("Only you"), whoMeSay: phrase("stays on this machine and goes to no one"),
      whoPeople: phrase("People I pick"), remove: phrase("Delete this meeting"), close: phrase("close")
    }
  };
}

export function paintMeetings() {
  if (!meetingsSolid || !meetingsOnScreen()) return;
  meetingsSolid.show(meetingsViewModel());
  $("btn-meetings")?.classList.toggle("rec", !!rec);
}

async function pullOne(id) {
  if (!id) { st.meetings.open = null; return; }
  try {
    const said = await apiGet(`/api/meetings/one?id=${encodeURIComponent(id)}`);
    if (st.meetings.pick !== id) return;
    st.meetings.open = said.meeting;
    st.meetings.mine = !!said.mine;
  } catch {
    if (st.meetings.pick === id) { st.meetings.open = null; st.meetings.pick = ""; }
  }
}

export async function pullMeetings({ fresh = false } = {}) {
  const m = st.meetings;
  try {
    const said = await apiGet(`/api/meetings?q=${encodeURIComponent(m.query)}${fresh ? "&fresh=1" : ""}`);
    m.list = said.meetings || [];
    m.me = said.me || "";
    m.people = said.people || [];
    m.settings = said.settings || null;
    m.models = said.models || [];
    m.listening = said.listening || { ready: false, why: "" };
    m.shelf = !!said.shelf;
    m.live = said.live || "";
    m.captions = said.captions || null;
    if (m.live && !rec) every("meetings-tick", TICK, tick);
    if (!m.live && !rec) stopBeat("meetings-tick");
    m.trouble = "";
    if (!m.nextWho) m.nextWho = m.settings?.who || "team";
    if (!m.outputs) m.outputs = await apiGet("/api/meetings/outputs").catch(() => ({ supported: false, outputs: [] }));
    if (!m.list.some((one) => one.id === m.pick)) m.pick = m.list[0]?.id || "";
    await pullOne(m.pick);
  } catch {
    m.trouble = phrase("could not reach the server");
  }
  paintMeetings();
}

export async function pickMeeting(id) {
  st.meetings.pick = id;
  st.meetings.menu = false;
  st.meetings.tab = "summary";
  await pullOne(id);
  paintMeetings();
}

async function openMic(deviceId) {
  const machine = await window.hiveMicrophone?.ask?.().catch(() => null);
  if (machine && !machine.allowed) throw Object.assign(new Error(phrase("this machine has not let the hive listen")), { name: "NotAllowedError" });
  const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: deviceId } } }); } catch {}
  }
  return navigator.mediaDevices.getUserMedia({ audio });
}

async function openSystemSound() {
  const armed = await window.hiveSystemSound?.arm?.().catch(() => null);
  if (!armed?.allowed) return null;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    for (const track of stream.getVideoTracks()) track.stop();
    return stream.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null;
  } catch { return null; }
}

function tapOf(room, stream, source, id) {
  const chunker = createChunker();
  const from = room.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(room, "dictation-tap", { numberOfInputs: 1, numberOfOutputs: 0, processorOptions: { sampleRate: MEETING_SAMPLE_RATE } });
  const tap = { source, stream, from, node, chunker, queue: Promise.resolve() };
  tap.send = (chunk) => {
    if (!chunk || !chunk.said) return;
    tap.queue = tap.queue
      .then(() => apiBinary(`/api/meetings/chunk?id=${encodeURIComponent(id)}&source=${source}&at=${Math.round(chunk.at)}`, chunk.pcm))
      .then(() => { if (st.meetings.pick === id) return pullOne(id).then(paintMeetings); })
      .catch(() => {});
  };
  node.port.onmessage = (note) => tap.send(chunker.push(note.data));
  from.connect(node);
  return tap;
}

function closeTap(tap) {
  try { tap.from.disconnect(); } catch {}
  try { tap.node.disconnect(); } catch {}
  for (const track of tap.stream.getTracks()) { try { track.stop(); } catch {} }
}

export async function startRecording() {
  const m = st.meetings;
  if (rec || m.setting) return false;
  if (!m.listening.ready) {
    if (m.listening.why === "pod") { showNotice(phrase("From here you can read, not record"), phrase("Recording uses the microphone and the engine of your own machine. In the hive on the server the list and the team's notes stay open.")); return false; }
    if (st.stt?.unsupported) { showNotice(phrase("This machine cannot record"), st.stt.unsupported); return false; }
    if (st.stt?.download) { showNotice(phrase("Transcription is not set up yet"), downloadSaid(st.stt.download)); return false; }
    const bring = await ask(phrase("Transcription is not set up yet"), esc(phrase("The words are written on this machine, by the same engine dictation uses. It is one download of about 855 MB.")), phrase("Download and set up"));
    if (bring) await setUpListening();
    return false;
  }
  const yes = await ask(
    phrase("Record this meeting?"),
    esc(phrase("Whoever is on the other side sees no sign that the hive is listening. Tell them before you start. With people from outside the company, keep the meeting only for you.")),
    phrase("I told them — record")
  );
  if (!yes) return false;
  const browser = await apiGet("/api/meetings/extension").catch(() => null);
  if (browser?.call) {
    try {
      const made = await apiPost("/api/meetings/start", { captionsOnly: true });
      if (made.system === "captions") {
        m.pick = made.meeting.id;
        m.menu = false;
        m.tab = "summary";
        await pullMeetings();
        return true;
      }
    } catch {}
  }
  m.setting = true;
  let micStream = null;
  try {
    micStream = await openMic(m.settings?.mic || "");
  } catch (wrong) {
    m.setting = false;
    const denied = wrong?.name === "NotAllowedError" || wrong?.name === "SecurityError";
    showNotice(denied ? phrase("this machine did not let the hive listen") : phrase("the microphone did not open"),
      denied ? phrase("let the hive use the microphone in your system settings, then try again. Nothing was recorded.") : String(wrong?.message || wrong));
    return false;
  }
  const wanted = m.settings?.systemAudio !== false;
  const byServer = wanted && !!m.outputs?.supported;
  let systemStream = wanted && !byServer ? await openSystemSound() : null;
  let made;
  try {
    made = await apiPost("/api/meetings/start", { who: m.nextWho || m.settings?.who || "team", systemByServer: byServer });
  } catch (wrong) {
    m.setting = false;
    for (const track of [...micStream.getTracks(), ...(systemStream?.getTracks() || [])]) track.stop();
    showNotice(phrase("the meeting did not start"), String(wrong?.message || wrong));
    return false;
  }
  const id = made.meeting.id;
  const served = made.system === "server";
  if (wanted && !served && !systemStream) systemStream = await openSystemSound();
  const room = new AudioContext({ sampleRate: MEETING_SAMPLE_RATE });
  if (room.state === "suspended") await room.resume();
  await room.audioWorklet.addModule("/assets/stt-worklet.mjs");
  const taps = [tapOf(room, micStream, "mic", id)];
  if (systemStream) taps.push(tapOf(room, systemStream, "system", id));
  rec = {
    id, room, taps, startedAt: Date.now(), systemOn: served || !!systemStream, systemDenied: wanted && !served && !systemStream, served, serverLevel: 0,
    level: (source) => (source === "system" && served ? rec?.serverLevel || 0 : taps.find((tap) => tap.source === source)?.chunker.level() || 0)
  };
  m.setting = false;
  m.scope = m.scope === "people" ? "mine" : m.scope;
  m.pick = id;
  m.menu = false;
  every("meetings-tick", TICK, tick);
  await pullMeetings();
  return true;
}

async function tick() {
  if (rec) {
    const said = await apiGet("/api/meetings/level").catch(() => null);
    if (rec && said?.id === rec.id) rec.serverLevel = said.system || 0;
    if (rec) rec.captions = !!said?.captions?.on;
    if (rec && st.meetings.pick === rec.id) await pullOne(rec.id);
    if (rec && st.meetings.open?.id === rec.id && st.meetings.open.state !== "recording") return leaveRecording();
  } else if (st.meetings.live && meetingsOnScreen()) {
    if (st.meetings.pick === st.meetings.live) await pullOne(st.meetings.live);
    if (st.meetings.open?.id === st.meetings.live && st.meetings.open.state !== "recording") return pullMeetings();
  }
  paintMeetings();
}

async function endTaps() {
  const held = rec;
  rec = null;
  stopBeat("meetings-tick");
  for (const tap of held.taps) { try { tap.node.port.postMessage("flush"); } catch {} }
  await new Promise((done) => setTimeout(done, 60));
  return held;
}

async function leaveRecording() {
  const held = await endTaps();
  for (const tap of held.taps) closeTap(tap);
  setTimeout(() => { try { held.room.close(); } catch {} }, 0);
  await pullMeetings();
}

export async function stopRecording() {
  if (!rec && st.meetings.live) {
    await apiPost("/api/meetings/stop", { id: st.meetings.live }).catch(() => {});
    return pullMeetings();
  }
  if (!rec) return;
  const held = await endTaps();
  for (const tap of held.taps) { tap.send(tap.chunker.flush()); closeTap(tap); }
  setTimeout(() => { try { held.room.close(); } catch {} }, 0);
  paintMeetings();
  await Promise.all(held.taps.map((tap) => tap.queue));
  await apiPost("/api/meetings/stop", { id: held.id, seconds: Math.round((Date.now() - held.startedAt) / 1000) }).catch(() => {});
  await pullMeetings();
}

export async function discardRecording() {
  if (!rec && !st.meetings.live) return;
  const yes = await ask(phrase("Discard this recording?"), esc(phrase("the words written so far are thrown away")), phrase("discard"));
  if (!yes) return;
  if (!rec) {
    if (st.meetings.live) await apiPost("/api/meetings/stop", { id: st.meetings.live, discard: true }).catch(() => {});
    st.meetings.pick = "";
    return pullMeetings();
  }
  const held = await endTaps();
  for (const tap of held.taps) closeTap(tap);
  setTimeout(() => { try { held.room.close(); } catch {} }, 0);
  await apiPost("/api/meetings/stop", { id: held.id, discard: true }).catch(() => {});
  st.meetings.pick = "";
  await pullMeetings();
}

async function setUpListening() {
  await saveConfig({ stt: true });
  await apiPost("/api/stt/install", {}).catch((wrong) => showNotice(phrase("the download did not start"), String(wrong?.message || wrong)));
  await pullDictation();
  paintMeetings();
}

async function changeWho(who, people) {
  const m = st.meetings;
  const one = m.open;
  if (!one) return;
  if (one.state === "recording") m.nextWho = who === "people" ? "team" : who;
  try {
    const said = await apiPost("/api/meetings/edit", { id: one.id, who, ...(people ? { people } : {}) });
    if (said.warning) showNotice(phrase("saved here, not sent to the team yet"), said.warning);
  } catch (wrong) {
    showNotice(phrase("that did not save"), String(wrong?.message || wrong));
  }
  await pullMeetings();
}

async function togglePerson(name) {
  const one = st.meetings.open;
  if (!one) return;
  const now = new Set(one.who === "people" ? one.people || [] : []);
  if (now.has(name)) now.delete(name); else now.add(name);
  if (!now.size) return changeWho("me");
  return changeWho("people", [...now]);
}

async function removeMeeting(id) {
  const one = id ? (st.meetings.list || []).find((row) => row.id === id) : st.meetings.open;
  if (!one) return;
  const shared = one.who !== "me";
  const yes = await ask(
    phrase("delete {name}?", { name: one.title }),
    esc(shared ? phrase("it leaves everyone's list. The team's repo keeps its history, so whoever has the repo can still find the old text.") : phrase("the notes and the transcript leave this machine for good")),
    phrase("delete")
  );
  if (!yes) return;
  await apiPost("/api/meetings/remove", { id: one.id }).catch((wrong) => showNotice(phrase("that did not delete"), String(wrong?.message || wrong)));
  st.meetings.menu = false;
  if (st.meetings.pick === one.id) st.meetings.pick = "";
  await pullMeetings();
}

async function renameMeeting(title) {
  const one = st.meetings.open;
  if (!one || !title.trim() || title.trim() === one.title) return;
  await apiPost("/api/meetings/edit", { id: one.id, title }).catch(() => {});
  await pullMeetings();
}

async function redoNotes() {
  const one = st.meetings.open;
  if (!one) return;
  await apiPost("/api/meetings/summarize", { id: one.id }).catch((wrong) => showNotice(phrase("the notes were not asked for"), String(wrong?.message || wrong)));
  await pullMeetings();
}

export function notesText(one, say) {
  const summary = one.summary;
  if (!summary) return `# ${one.title}\n`;
  const parts = [`# ${one.title}`, summary.oneLine];
  if (summary.decisions?.length) parts.push(`## ${say.decisions}\n${summary.decisions.map((line) => `- ${line}`).join("\n")}`);
  if (summary.nextSteps?.length) parts.push(`## ${say.nextSteps}\n${summary.nextSteps.map((step) => `- ${step.who ? `${step.who}: ` : ""}${step.what}`).join("\n")}`);
  if (summary.open?.length) parts.push(`## ${say.open}\n${summary.open.map((line) => `- ${line}`).join("\n")}`);
  return parts.filter(Boolean).join("\n\n") + "\n";
}

export function wordsText(one, say) {
  return (one.lines || []).map((line) => `[${clockSaid(line.at)}] ${line.source === "caption" ? line.speaker || say.call : line.source === "mic" ? say.you : say.call}: ${line.text}`).join("\n") + "\n";
}

async function copyOpen() {
  const one = st.meetings.open;
  if (!one) return;
  const text = st.meetings.tab === "transcript" || !one.summary
    ? wordsText(one, { you: phrase("you"), call: phrase("the call") })
    : notesText(one, { decisions: phrase("What was decided"), nextSteps: phrase("Next steps"), open: phrase("Left open") });
  await navigator.clipboard.writeText(text).catch(() => {});
  showNotice(phrase("copied"), "");
}

export function openMeetings() {
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (routinesOnScreen()) closeRoutines();
  if (portariaOnScreen()) closePortaria();
  $("meetings").hidden = false;
  paintMeetings();
  pullDictation().then(paintMeetings);
  pullMeetings({ fresh: true });
  every("meetings", MEETINGS_BEAT, () => pullMeetings());
}

export function closeMeetings() {
  $("meetings").hidden = true;
  st.meetings.menu = false;
  st.meetings.rowMenu = null;
  stopBeat("meetings");
}

solidMounts.push((hive) => {
  meetingsSolid = hive.mountMeetings($("meetings"), {
    actions: {
      close: () => closeMeetings(),
      record: () => startRecording(),
      stop: () => stopRecording(),
      discard: () => discardRecording(),
      setup: () => setUpListening(),
      blank: (act) => (act === "setup" ? setUpListening() : startRecording()),
      scope: (scope) => { st.meetings.scope = scope; paintMeetings(); },
      search: (text) => { st.meetings.query = text; pullMeetings(); },
      pick: (id) => pickMeeting(id),
      tab: (tab) => { st.meetings.tab = tab; paintMeetings(); },
      menu: () => { st.meetings.menu = !st.meetings.menu; paintMeetings(); },
      who: (who) => changeWho(who),
      person: (name) => togglePerson(name),
      remove: () => removeMeeting(),
      rowMenu: (id, x, y) => { st.meetings.rowMenu = { id, x, y }; paintMeetings(); },
      closeRowMenu: () => { if (st.meetings.rowMenu) { st.meetings.rowMenu = null; paintMeetings(); } },
      removeRow: () => { const id = st.meetings.rowMenu?.id; st.meetings.rowMenu = null; paintMeetings(); if (id) removeMeeting(id); },
      rename: (title) => renameMeeting(title),
      redo: () => redoNotes(),
      copy: () => copyOpen()
    }
  });
});

$("btn-meetings")?.addEventListener("click", () => (meetingsOnScreen() ? closeMeetings() : openMeetings()));

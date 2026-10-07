import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MEETING_SHELF_DIR = "m";
export const MEETING_WHO = ["team", "me", "people"];
export const MEETING_SOURCES = ["mic", "system"];
export const MEETING_STATES = ["recording", "summarizing", "ready", "summary-failed"];
export const MEETING_TITLE_MAX = 120;
export const MEETING_LINE_MAX = 4000;
export const MEETING_INSTRUCTIONS_MAX = 600;
export const MEETING_DEFAULT_MODEL = "claude-sonnet-5-5";
export const MEETING_MODELS = [
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
  { id: "claude-opus-5-5", name: "Opus 5.5" },
  { id: "claude-fable-5-1", name: "Fable 5.1" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5" }
];
export const MEETING_DEFAULTS = { model: MEETING_DEFAULT_MODEL, who: "team", mic: "", output: "", systemAudio: true, instructions: "" };

const MEETING_ID = /^m[0-9a-z]{6,40}$/;
const HANDLE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export const isMeetingId = (id) => MEETING_ID.test(String(id || ""));

export const meetingModelName = (id) => MEETING_MODELS.find((one) => one.id === id)?.name || String(id || "");

const oneLine = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

const cleanPeople = (people) => [...new Set((Array.isArray(people) ? people : []).map((one) => String(one || "").trim().toLowerCase()).filter((one) => HANDLE.test(one)))].slice(0, 40);

export function cleanMeetingSettings(raw, where = "meetings", problems = []) {
  const said = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (raw !== undefined && said !== raw) problems.push(`${where}: meetings should be an object with model, who, mic, systemAudio and instructions`);
  const clean = { ...MEETING_DEFAULTS };
  if (said.model !== undefined) {
    if (MEETING_MODELS.some((one) => one.id === said.model)) clean.model = said.model;
    else problems.push(`${where}: meetings.model should be one of ${MEETING_MODELS.map((one) => one.id).join(", ")}`);
  }
  if (said.who !== undefined) {
    if (said.who === "team" || said.who === "me") clean.who = said.who;
    else problems.push(`${where}: meetings.who should be team or me`);
  }
  if (said.mic !== undefined) {
    if (typeof said.mic === "string" && said.mic.length <= 200) clean.mic = said.mic;
    else problems.push(`${where}: meetings.mic should be the id of a microphone, or empty for the system default`);
  }
  if (said.output !== undefined) {
    if (typeof said.output === "string" && /^[\w.:@+-]{0,200}$/.test(said.output)) clean.output = said.output;
    else problems.push(`${where}: meetings.output should be the name of a sound output, or empty for the system default`);
  }
  if (said.systemAudio !== undefined) {
    if (typeof said.systemAudio === "boolean") clean.systemAudio = said.systemAudio;
    else problems.push(`${where}: meetings.systemAudio should be true or false`);
  }
  if (said.instructions !== undefined) {
    if (typeof said.instructions === "string") clean.instructions = said.instructions.trim().slice(0, MEETING_INSTRUCTIONS_MAX);
    else problems.push(`${where}: meetings.instructions should be text`);
  }
  return clean;
}

export const meetingsDir = (home) => join(home, "meetings");
export const localMeetingFile = (home, id) => join(meetingsDir(home), `${id}.json`);
export const sharedMeetingDir = (shelf) => join(shelf, MEETING_SHELF_DIR);
export const sharedMeetingFile = (shelf, id) => join(sharedMeetingDir(shelf), `${id}.json`);

function readDir(dir) {
  if (!dir || !existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || !isMeetingId(name.slice(0, -5))) continue;
    try {
      const one = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (one && one.id === name.slice(0, -5)) found.push(one);
    } catch {}
  }
  return found;
}

export const readLocalMeetings = (home) => readDir(meetingsDir(home));

export const readSharedMeetings = (shelf) => (shelf ? readDir(sharedMeetingDir(shelf)) : []);

export function readLocalMeeting(home, id) {
  if (!isMeetingId(id)) return null;
  try { return JSON.parse(readFileSync(localMeetingFile(home, id), "utf8")); } catch { return null; }
}

export function writeLocalMeeting(home, meeting) {
  mkdirSync(meetingsDir(home), { recursive: true });
  writeFileSync(localMeetingFile(home, meeting.id), JSON.stringify(meeting, null, 2));
}

export function dropLocalMeeting(home, id) {
  if (isMeetingId(id)) rmSync(localMeetingFile(home, id), { force: true });
}

export function writeSharedMeeting(shelf, meeting) {
  mkdirSync(sharedMeetingDir(shelf), { recursive: true });
  writeFileSync(sharedMeetingFile(shelf, meeting.id), JSON.stringify(meeting, null, 2) + "\n");
}

export function dropSharedMeeting(shelf, id) {
  if (isMeetingId(id)) rmSync(sharedMeetingFile(shelf, id), { force: true });
}

export function defaultMeetingTitle(at, language = "en") {
  const when = new Date(at);
  const clock = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  const day = when.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "long" });
  return language === "pt" ? `Reunião de ${day}, ${clock}` : `Meeting of ${day}, ${clock}`;
}

export function newMeeting({ id, owner, title = "", who = "team", people = [], at = Date.now(), language = "en" }) {
  if (!isMeetingId(id)) return { error: "that is not a meeting id" };
  if (!HANDLE.test(String(owner || ""))) return { error: "a meeting needs someone who recorded it" };
  const picked = MEETING_WHO.includes(who) ? who : "team";
  return {
    meeting: {
      id, owner, title: oneLine(title, MEETING_TITLE_MAX) || defaultMeetingTitle(at, language), titled: !!oneLine(title, MEETING_TITLE_MAX),
      who: picked, people: picked === "people" ? cleanPeople(people) : [],
      state: "recording", startedAt: at, endedAt: 0, seconds: 0, lines: [], summary: null, model: "", trouble: ""
    }
  };
}

export function addLine(meeting, { at = 0, source = "mic", text = "" }) {
  const said = String(text || "").replace(/\s+/g, " ").trim().slice(0, MEETING_LINE_MAX);
  if (!said) return meeting;
  const line = { at: Math.max(0, Math.round(Number(at) || 0)), source: MEETING_SOURCES.includes(source) ? source : "mic", text: said };
  const lines = [...meeting.lines, line].sort((a, b) => a.at - b.at || (a.source === b.source ? 0 : a.source === "system" ? -1 : 1));
  return { ...meeting, lines };
}

const NOT_LATIN = /[\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/;
const LATIN_SPOKEN = new Set(["", "pt", "en", "es", "fr", "de", "it"]);

export function heardText(text, language = "") {
  const said = String(text || "").replace(/\s+/g, " ").trim();
  if (!said) return "";
  if (LATIN_SPOKEN.has(language) && NOT_LATIN.test(said)) return "";
  const parts = said.split(/(?<=[.!?…])\s+/);
  const kept = [];
  let run = 0;
  for (const part of parts) {
    run = kept.length && part.toLowerCase() === kept[kept.length - 1].toLowerCase() ? run + 1 : 0;
    if (run === 0) kept.push(part);
    else if (run >= 2) return kept.slice(0, -1).join(" ");
  }
  return kept.join(" ");
}

export const isSharedMeeting = (meeting) => meeting?.who === "team" || meeting?.who === "people";

export const ownsMeeting = (meeting, me) => !!meeting && meeting.owner === me;

export const seesMeeting = (meeting, me) =>
  !!meeting && (meeting.owner === me || meeting.who === "team" || (meeting.who === "people" && (meeting.people || []).includes(me)));

export function editMeeting(meeting, change, { me }) {
  if (!ownsMeeting(meeting, me)) return { error: "only who recorded a meeting changes it" };
  const next = { ...meeting };
  if (change.title !== undefined) {
    const title = oneLine(change.title, MEETING_TITLE_MAX);
    if (!title) return { error: "a meeting needs a title" };
    next.title = title;
    next.titled = true;
  }
  if (change.who !== undefined) {
    if (!MEETING_WHO.includes(change.who)) return { error: "who sees it should be team, me or people" };
    next.who = change.who;
    next.people = change.who === "people" ? cleanPeople(change.people ?? meeting.people) : [];
    if (next.who === "people" && !next.people.length) return { error: "pick at least one person" };
  } else if (change.people !== undefined && next.who === "people") {
    next.people = cleanPeople(change.people);
    if (!next.people.length) return { error: "pick at least one person" };
  }
  return { meeting: next };
}

export function meetingRow(meeting) {
  return {
    id: meeting.id, owner: meeting.owner, title: meeting.title, who: meeting.who, people: meeting.people || [],
    state: meeting.state, startedAt: meeting.startedAt, endedAt: meeting.endedAt || 0, seconds: meeting.seconds || 0,
    oneLine: meeting.summary?.oneLine || "", lines: (meeting.lines || []).length
  };
}

export function meetingsOf({ local = [], shared = [], me }) {
  const byId = new Map();
  for (const one of shared) if (seesMeeting(one, me)) byId.set(one.id, one);
  for (const one of local) if (one.owner === me) byId.set(one.id, one);
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function matchesMeeting(meeting, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const summary = meeting.summary || {};
  const hay = [meeting.title, meeting.owner, summary.oneLine, ...(summary.decisions || []), ...(summary.open || []),
    ...(summary.nextSteps || []).map((step) => `${step.who} ${step.what}`), ...(meeting.lines || []).map((line) => line.text)];
  return hay.join("\n").toLowerCase().includes(q);
}

export const clockOf = (seconds) => {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function transcriptText(meeting, { mic = "me", system = "the call" } = {}) {
  const who = (line) => (line.source === "caption" ? line.speaker || system : line.source === "system" ? system : mic);
  return (meeting.lines || []).map((line) => `[${clockOf(line.at)}] ${who(line)}: ${line.text}`).join("\n");
}

export const SUMMARY_PROMPT = `You are writing the notes of a meeting from its transcript, which arrives on standard input.
The transcript was made by a speech model, so names and technical words may be misheard: fix what is obviously a mishearing, never invent what was not said.
Lines marked "{owner}" came from the microphone of {owner}, the person who recorded; lines marked "the call" came from the computer's sound, which is everyone else. Lines marked with a person's name came from the captions of the call and say who spoke: use those names. When {owner} takes a task, the person in nextSteps is {owner}.
Write in the language the meeting was spoken in.
Answer with one JSON object and nothing else, no code fence, in exactly this shape:
{"title": "a short title naming the subject, at most 8 words", "oneLine": "the meeting in one sentence", "decisions": ["one decision per item"], "nextSteps": [{"who": "the person, or empty when nobody was named", "what": "what they will do, with the date when one was said"}], "open": ["what was left undecided"]}
Leave a list empty when the meeting had nothing for it. Never include anything that is not in the transcript.`;

export function summaryPrompt({ instructions = "", owner = "me" } = {}) {
  const asked = oneLine(instructions, MEETING_INSTRUCTIONS_MAX);
  const prompt = SUMMARY_PROMPT.replaceAll("{owner}", owner);
  return asked ? `${prompt}\nThe person who recorded also asked: ${asked}` : prompt;
}

export function summarizerCommand({ claude, model, prompt }) {
  return { exe: claude, args: ["-p", prompt, "--model", model, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'] };
}

const textList = (list, max = 30) => (Array.isArray(list) ? list : []).map((one) => oneLine(one, 400)).filter(Boolean).slice(0, max);

export function summaryFromAnswer(out) {
  const text = String(out || "");
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  let said;
  try { said = JSON.parse(text.slice(from, to + 1)); } catch { return null; }
  if (!said || typeof said !== "object") return null;
  const summary = {
    title: oneLine(said.title, MEETING_TITLE_MAX),
    oneLine: oneLine(said.oneLine, 400),
    decisions: textList(said.decisions),
    nextSteps: (Array.isArray(said.nextSteps) ? said.nextSteps : [])
      .map((step) => ({ who: oneLine(step?.who, 60), what: oneLine(step?.what, 400) })).filter((step) => step.what).slice(0, 30),
    open: textList(said.open)
  };
  if (!summary.oneLine && !summary.decisions.length && !summary.nextSteps.length && !summary.open.length) return null;
  return summary;
}

export function summaryMarkdown(meeting, labels = {}) {
  const say = { decisions: "Decisions", nextSteps: "Next steps", open: "Left open", ...labels };
  const summary = meeting.summary;
  if (!summary) return `# ${meeting.title}\n`;
  const parts = [`# ${meeting.title}`, summary.oneLine];
  if (summary.decisions.length) parts.push(`## ${say.decisions}\n${summary.decisions.map((one) => `- ${one}`).join("\n")}`);
  if (summary.nextSteps.length) parts.push(`## ${say.nextSteps}\n${summary.nextSteps.map((step) => `- ${step.who ? `${step.who}: ` : ""}${step.what}`).join("\n")}`);
  if (summary.open.length) parts.push(`## ${say.open}\n${summary.open.map((one) => `- ${one}`).join("\n")}`);
  return parts.filter(Boolean).join("\n\n") + "\n";
}

export const meetingCommitLine = (meeting, what) => `reunioes: ${meeting.id} · ${what} · ${oneLine(meeting.title, 80)}`;

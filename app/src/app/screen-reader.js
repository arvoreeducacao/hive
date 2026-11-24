import { activeItems, soloSeat } from "./blocks.js";
import { phrase, st } from "./core.js";
import { seatLabel } from "./pure-helpers.js";
import { programOf } from "./timeline-rows.js";
import { structPool } from "./structured-seats.js";

const APP_TITLE = "Hive";

const SCREEN_READER_LEVELS = ["status", "messages", "everything"];

const SCREEN_READER_DEFAULT = "status";

const STATUS_SAYS = { working: "Working", approval: "Needs approval", input: "Needs your input", finished: "Finished", failed: "Failed" };

const TITLE_STATUSES = new Set(["working", "approval", "input"]);

const STEP_GAP_MS = 2000;

const HOLD_PER_CHARACTER_MS = 50;

const HOLD_MAX_MS = 15000;

const MESSAGE_MAX = 2000;

const STEP_MAX = 120;

const REQUESTS = new Set(["ask", "plan"]);

const NO_DETAIL = { step: null, messages: [], tail: null };

const DETAIL_REGION = "sr-chat-detail";

const STATUS_REGION = "sr-chat-status";

function chatStatusOf(seat, e = null) {
  if (!seat) return "idle";
  const raw = seat.raw ?? seat.state;
  if (raw === "needs") return Array.isArray(seat.asks) && seat.asks.length ? "input" : "approval";
  if (e?.ws?.readyState === 1) return e.turnOpen ? "working" : "idle";
  return raw === "working" ? "working" : "idle";
}

const requestOf = (seat) => (Array.isArray(seat?.asks) ? seat.asks.map((ask) => ask?.id ?? "").join(",") : "");

const failedOf = (seat, e = null) => (e?.ws?.readyState === 1 ? !!e.turnFailed : !!seat?.finish?.error);

function projectOf(seat) {
  const tree = Array.isArray(seat?.trees) ? seat.trees.find((one) => one?.repo) : null;
  return tree?.repo || String(seat?.cwd || "").split("/").filter(Boolean).pop() || "";
}

function windowTitle({ on = false, base = APP_TITLE, chat = "", project = "", status = "idle", say = phrase } = {}) {
  if (!on || !chat) return base;
  const context = project && project !== chat ? `${chat} - ${project}` : chat;
  return TITLE_STATUSES.has(status) ? `${say(STATUS_SAYS[status])}: ${context}` : context;
}

const cut = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

function stepOf(block, say = phrase) {
  if (block.kind === "think") return say("Thinking…");
  if (block.stat === "bad") return null;
  const arg = String(block.arg || "").replace(/\s+/g, " ").trim();
  const name = String(block.tool || "").toLowerCase();
  let said = "";
  if (block.face === "run") said = say("Running {program}", { program: programOf(block.cmd || block.arg) || arg || say("command") });
  else if (block.face === "write" && arg) said = say("Editing {file}", { file: arg });
  else if (/^(grep|glob)$/.test(name) && arg) said = say("Searching for {query}", { query: arg });
  else if (name === "websearch" && arg) said = say("Searching the web for {query}", { query: arg });
  else said = [block.name, arg].filter(Boolean).join(" ");
  return said ? cut(said, STEP_MAX) : null;
}

function turnDetailOf(blocks, knownTail = null, say = phrase) {
  const messages = [];
  let step;
  let fresh = true;
  let workAfter = false;
  let at = blocks.length - 1;
  for (; at >= 0; at--) {
    const block = blocks[at];
    if (block.kind === "bubble") break;
    if (block.key === knownTail) fresh = false;
    if (block.kind === "tool" || block.kind === "think") {
      workAfter = true;
      if (step === undefined && !REQUESTS.has(block.face)) step = stepOf(block, say);
      continue;
    }
    if (block.kind !== "said") continue;
    if (step === undefined) step = null;
    messages.push({ key: block.key, block, finished: !block.streaming && workAfter, fresh });
    workAfter = true;
  }
  let tailKnown = !fresh;
  if (knownTail !== null) for (; !tailKnown && at >= 0; at--) tailKnown = blocks[at].key === knownTail;
  return {
    step: step ?? null,
    messages: (tailKnown ? messages : messages.map((one) => ({ ...one, fresh: false }))).reverse(),
    tail: blocks.at(-1)?.key ?? null
  };
}

function plainOf(block) {
  if (typeof block?.text === "string") return block.text.replace(/\s+/g, " ").trim();
  const hold = document.createElement("template");
  hold.innerHTML = (block?.parts || []).join("\n");
  for (const one of hold.content.querySelectorAll("button, svg, .md-codehead, .md-tablebar")) one.remove();
  for (const one of hold.content.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr")) one.after(" ");
  return hold.content.textContent.replace(/\s+/g, " ").trim();
}

function spokenMessage(block, say = phrase) {
  const text = plainOf(block);
  return text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX)}… ${say("More in the chat.")}` : text;
}

function nextChatAnnouncement(previous, next, say = phrase) {
  const detail = next.detail || NO_DETAIL;
  const memory = {
    chat: next.chat,
    level: next.level,
    status: next.status,
    request: next.request || "",
    turn: next.status !== "idle",
    step: next.status === "working" ? detail.step : null,
    messages: new Map(detail.messages.map((one) => [one.key, one.finished])),
    tail: detail.tail
  };
  if (!previous || previous.chat !== next.chat) return { memory, baseline: true, status: null, messages: [], step: null };
  let status = null;
  if (next.status === "approval" || next.status === "input") {
    if (previous.status !== next.status || previous.request !== memory.request) status = say(STATUS_SAYS[next.status]);
  } else if (next.status === "working") {
    if (!previous.turn) status = say(STATUS_SAYS.working);
  } else if (previous.turn) {
    status = say(next.failed ? STATUS_SAYS.failed : STATUS_SAYS.finished);
  }
  const quiet = next.level === "status" || next.status === "idle" || previous.level !== next.level;
  const messages = quiet ? [] : detail.messages
    .filter((one) => one.finished && previous.messages.get(one.key) !== true && (one.fresh || previous.messages.has(one.key)))
    .map((one) => spokenMessage(one.block, say))
    .filter(Boolean);
  const step = !quiet && next.level === "everything" && memory.step !== previous.step ? memory.step : null;
  return { memory, baseline: false, status, messages, step };
}

function oneAnnouncement(texts) {
  return texts.map((text, at) => (at === texts.length - 1 || /[.!?:…]$/.test(text) ? text : `${text}.`)).join(" ");
}

const holdAfter = (text) => Math.min(HOLD_MAX_MS, Math.max(STEP_GAP_MS, text.length * HOLD_PER_CHARACTER_MS));

const voice = { memory: null, quietUntil: 0, waiting: null };

let titleWorn = false;

function speakInto(id, text) {
  const region = document.getElementById(id);
  if (!region) return;
  region.textContent = text && region.textContent === text ? `${text} ` : text;
}

function dropWaitingStep() {
  if (voice.waiting) clearTimeout(voice.waiting.timer);
  voice.waiting = null;
}

function focusedChat() {
  const name = soloSeat || st.open || activeItems()[st.focus]?.key || "";
  const seat = name ? (st.data?.sessions || []).find((one) => one.name === name) || null : null;
  return { name: seat ? name : "", seat, e: seat ? structPool.get(name) || null : null };
}

function paintWindowTitle(chat = focusedChat()) {
  const on = !!st.screenReaderWindowTitle;
  if (!on && !titleWorn) return;
  titleWorn = on;
  const title = windowTitle({ on, base: soloSeat || APP_TITLE, chat: chat.seat ? seatLabel(chat.seat) : "", project: projectOf(chat.seat), status: chatStatusOf(chat.seat, chat.e) });
  if (document.title !== title) document.title = title;
}

function sayStep(label, now) {
  dropWaitingStep();
  const speak = () => {
    voice.waiting = null;
    speakInto(DETAIL_REGION, label);
    voice.quietUntil = Date.now() + STEP_GAP_MS;
  };
  const wait = voice.quietUntil - now;
  if (wait <= 0) return void speak();
  voice.waiting = { label, timer: setTimeout(speak, wait) };
}

function listenToFocusedChat(chat = focusedChat(), now = Date.now()) {
  if (!chat.name) {
    if (voice.memory) {
      voice.memory = null;
      dropWaitingStep();
      speakInto(STATUS_REGION, "");
      speakInto(DETAIL_REGION, "");
    }
    return;
  }
  const level = SCREEN_READER_LEVELS.includes(st.screenReaderAnnouncements) ? st.screenReaderAnnouncements : SCREEN_READER_DEFAULT;
  const known = voice.memory?.chat === chat.name && voice.memory.level === level ? voice.memory.tail : null;
  const detail = level !== "status" && chat.e?.conv ? turnDetailOf(chat.e.conv.blocks, known) : NO_DETAIL;
  const said = nextChatAnnouncement(voice.memory, { chat: chat.name, level, status: chatStatusOf(chat.seat, chat.e), request: requestOf(chat.seat), failed: failedOf(chat.seat, chat.e), detail });
  voice.memory = said.memory;
  if (said.baseline) {
    dropWaitingStep();
    voice.quietUntil = 0;
    speakInto(STATUS_REGION, "");
    speakInto(DETAIL_REGION, "");
    return;
  }
  if (said.messages.length) {
    const text = oneAnnouncement(said.status ? [...said.messages, said.status] : said.messages);
    speakInto(DETAIL_REGION, text);
    voice.quietUntil = now + holdAfter(text);
  } else if (said.status) {
    speakInto(STATUS_REGION, said.status);
    voice.quietUntil = Math.max(voice.quietUntil, now + STEP_GAP_MS);
  }
  if (level !== "everything" || said.memory.step === null) return void dropWaitingStep();
  if (said.step) sayStep(said.step, now);
}

function followFocusedChat(chat = focusedChat()) {
  paintWindowTitle(chat);
  listenToFocusedChat(chat);
}

function screenReaderHeard(e) {
  const chat = focusedChat();
  if (e?.name && e.name === chat.name) followFocusedChat(chat);
}

export { APP_TITLE, SCREEN_READER_DEFAULT, SCREEN_READER_LEVELS, STATUS_SAYS, chatStatusOf, followFocusedChat, nextChatAnnouncement, oneAnnouncement, projectOf, screenReaderHeard, spokenMessage, stepOf, turnDetailOf, windowTitle };

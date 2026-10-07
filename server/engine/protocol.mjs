import { createReadStream } from "node:fs";
import { join } from "node:path";

export function parseCommand(line) {
  let cmd;
  try { cmd = JSON.parse(line); } catch { return null; }
  if (!cmd || typeof cmd !== "object" || Array.isArray(cmd) || typeof cmd.type !== "string") return null;
  return cmd;
}

export function answerInput(input, answers) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  if (!questions.length) return { error: "tool_use has no questions" };
  const inOrder = answers && typeof answers === "object" && !Array.isArray(answers) ? Object.values(answers) : [];
  const filled = {};
  for (let at = 0; at < questions.length; at++) {
    const q = questions[at];
    const given = answers?.[q.question] ?? inOrder[at];
    const value = Array.isArray(given) ? given.filter((v) => typeof v === "string").join(", ") : given;
    if (typeof value !== "string" || !value.trim()) return { error: `missing answer for: ${q.question}` };
    filled[q.question] = value;
  }
  return { input: { ...input, answers: filled } };
}

export function dismissNote(text) {
  return `The dev did not pick any of the options — they sent this message instead. Take it as the answer, drop the question and follow what it says:\n\n${text}`;
}

export function sayEvent(text, images = [], cid = null, from = null, consumed = false) {
  const event = {
    type: "user",
    subtype: "say",
    cid: cid || null,
    images,
    message: { role: "user", content: [{ type: "text", text }] },
    parent_tool_use_id: null,
  };
  if (from) event.from = from;
  if (consumed) event.consumed = true;
  return event;
}

export const ANSWER_WAIT_MS = 600_000;
export const ANSWER_PICKUP_MS = 30_000;

export function answerHold({ deliver, pickupMs = ANSWER_PICKUP_MS, later = setTimeout, cancel = clearTimeout }) {
  const armed = new Map();
  const held = new Map();

  const disarm = (from) => {
    const timer = armed.get(from);
    if (timer !== undefined) cancel(timer);
    armed.delete(from);
  };
  const release = (from) => {
    const answer = held.get(from);
    if (!answer) return;
    cancel(answer.timer);
    held.delete(from);
    deliver({ from, text: answer.text, images: answer.images, side: answer.side });
  };

  return {
    expect(from, waitMs = ANSWER_WAIT_MS) {
      disarm(from);
      armed.set(from, later(() => armed.delete(from), Math.max(1, Number(waitMs) || ANSWER_WAIT_MS)));
    },
    take(from, { text, images = [], side = "" }) {
      if (!from || !armed.has(from)) return false;
      disarm(from);
      release(from);
      held.set(from, { text, images, side, timer: later(() => release(from), pickupMs) });
      return true;
    },
    collect(from) {
      const answer = held.get(from);
      if (!answer) return null;
      cancel(answer.timer);
      held.delete(from);
      return { text: answer.text, images: answer.images };
    },
    unexpect(from) {
      disarm(from);
      release(from);
    },
    waitingOn() {
      return [...new Set([...armed.keys(), ...held.keys()])];
    },
  };
}

export const BIRTHS_MAX = 3;

export const PLAN_MODES = new Set(["plan", "normal"]);

export const PLAN_INSTRUCTIONS = [
  "Você está num chat do Hive, e o plano que você escrever vira um cartão que a pessoa aprova de uma vez.",
  "Descreva as FRENTES do trabalho, uma por chat que vai nascer, não as etapas de uma mudança de código.",
  "Cada frente é trabalho que não depende das outras: se duas só fazem sentido em ordem, elas são uma frente só.",
  "Termine o plano com um bloco de frentes, uma linha por chat, exatamente neste formato:",
  "",
  "```frentes",
  "nome-do-chat · agente/modelo · aqui|servidor · repo · o que ele faz, em uma linha",
  "```",
  "",
  "O nome é minúsculo com hífen e diz o assunto, não o verbo. O agente e o modelo são os que a pessoa tem conectados;",
  "sem certeza, escreva `padrão`. Nada roda até ela aprovar, então não abra chat nenhum antes disso.",
].join("\n");

/* the model wrote a table of fronts; the person edited it on the card before approving. What she
   chose is the truth, and it cannot reach the model through the approval — a tool that is allowed
   says nothing back. So it waits here, and every spawn of that turn is opened as she asked. */
export function frontWishes() {
  let rows = [];
  return {
    keep(list) {
      rows = (Array.isArray(list) ? list : []).map((one) => ({
        name: String(one?.name || "").trim().toLowerCase(),
        agent: String(one?.agent || "").trim().toLowerCase(),
        model: String(one?.model || "").trim(),
        where: one?.where === "cloud" || one?.where === "local" ? one.where : "",
        taken: false,
      })).filter((one) => one.name);
      return rows.length;
    },
    clear() { rows = []; },
    rows() { return rows.map(({ taken, ...one }) => one); },
    /* the name is what ties a spawn to a row, and it ties it for good: a spawn that was refused and
       tried again is the same front, so its row is never spent — only a spawn that gave no name at
       all takes the next row in order, and never across turns. */
    pick(input) {
      if (!rows.length) return input;
      const asked = String(input?.name || "").trim().toLowerCase();
      const named = asked
        ? rows.find((one) => one.name === asked) || rows.find((one) => one.name.startsWith(asked) || asked.startsWith(one.name))
        : null;
      const wish = named || (asked ? null : rows.find((one) => !one.taken));
      if (!wish) return input;
      wish.taken = true;
      const said = {
        ...input,
        ...(wish.agent ? { agent: wish.agent } : {}),
        ...(wish.model ? { model: wish.model } : {}),
        ...(wish.where ? { where: wish.where } : {}),
      };
      /* a login belongs to the program it was written for: carrying it into another agent points
         that agent at a folder with no login of its own, and the seat opens signed out. */
      if (said.agent && said.agent !== input?.agent && input?.account) delete said.account;
      return said;
    },
  };
}

export function birthsLeft(held) {
  const n = Number(held);
  return Number.isFinite(n) ? Math.max(0, Math.min(BIRTHS_MAX, Math.trunc(n))) : BIRTHS_MAX;
}

export const SEAT_TITLE_CEILING = 60;

export function seatTitle(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, SEAT_TITLE_CEILING);
}

export function seatPreamble(name, side) {
  return `You are seat \`${name}\` in the hive (${side}), one of several chats the person runs side by side. Other seats can message you, and you answer them by name with the hive tools — peers, message, ask, peek. Talk to a peer when it owns the thing you are about to guess at; report to the person otherwise. The chat gets its name on its own as it opens, so start on the work at once — do not spend your first move naming it. Use rename only when the subject turns, so that the line the person reads on the rail keeps saying what this chat is about now.`;
}

export function peerSayText(from, text, side = "") {
  const where = side ? ` (${side})` : "";
  return `[hive] message from seat ${from}${where}. Answer it by name with the hive tools — or say nothing to it if it does not need an answer.\n\n${String(text || "")}`;
}

const IMAGE_MARK = /\[Image #(\d+)\]/g;

export function weaveImageMarks(text = "", images = []) {
  const t = String(text);
  const woven = [];
  const marked = new Set();
  let last = 0;
  IMAGE_MARK.lastIndex = 0;
  for (let m; (m = IMAGE_MARK.exec(t)); ) {
    const i = Number(m[1]) - 1;
    if (i < 0 || i >= images.length) continue;
    const before = t.slice(last, m.index);
    if (before.trim()) woven.push({ text: before });
    woven.push({ image: images[i] });
    marked.add(i);
    last = m.index + m[0].length;
  }
  const tail = t.slice(last);
  if (tail.trim()) woven.push({ text: tail });
  const loose = images.filter((_, i) => !marked.has(i)).map((image) => ({ image }));
  return [...loose, ...woven];
}

export const IMAGE_EDGE_CEILING = 2000;

const PNG_MAGIC = "\x89PNG\r\n\x1a\n";
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function imageEdge(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length >= 24 && buffer.subarray(0, 8).toString("binary") === PNG_MAGIC) {
    return Math.max(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buffer.length) {
      if (buffer[at] !== 0xff) { at += 1; continue; }
      const marker = buffer[at + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      if (marker === 0xd9) break;
      if (JPEG_FRAMES.has(marker)) return Math.max(buffer.readUInt16BE(at + 5), buffer.readUInt16BE(at + 7));
      at += 2 + buffer.readUInt16BE(at + 2);
    }
  }
  return 0;
}

export function missionImagesFile(promptFile = "") {
  return String(promptFile).replace(/\.md$/, "") + ".images.json";
}

export function inlineImageMarks(text = "", images = []) {
  IMAGE_MARK.lastIndex = 0;
  return String(text).replace(IMAGE_MARK, (mark, n) => images[Number(n) - 1] || mark);
}

export const GONE_MEMORY = 64;

export function saidTrail() {
  const gone = [];
  return {
    left(cid) {
      if (!cid || gone.includes(cid)) return;
      gone.push(cid);
      if (gone.length > GONE_MEMORY) gone.shift();
    },
    alreadyLeft(cid) {
      return !!cid && gone.includes(cid);
    },
  };
}

export function sayGate() {
  const queue = [];
  const trail = saidTrail();
  let busy = false;
  return {
    push(item) {
      if (busy) {
        queue.push(item);
        return null;
      }
      busy = true;
      return item;
    },
    turnEnded() {
      if (queue.length) return queue.shift();
      busy = false;
      return null;
    },
    unsay(cid) {
      const i = queue.findIndex((item) => cid && item.cid === cid);
      if (i < 0) return null;
      return queue.splice(i, 1)[0];
    },
    left(cid) {
      trail.left(cid);
    },
    alreadyLeft(cid) {
      return trail.alreadyLeft(cid);
    },
    get queued() {
      return queue.length;
    },
    get busy() {
      return busy;
    },
  };
}

export const QUEUE_MISS = "not in the queue — already dispatched or unknown";
export const ALREADY_IN_THE_TURN = "it had already gone into the turn — it is in the conversation now, and cannot be taken back";

export function queueMiss(gate, cid) {
  if (gate.alreadyLeft(cid)) return { ok: false, gone: true, error: ALREADY_IN_THE_TURN };
  return { ok: false, error: QUEUE_MISS };
}

export const INTERRUPT_MAX_WAIT_MS = 60000;

export function staleInterrupt(cmd, now = Date.now(), maxWaitMs = INTERRUPT_MAX_WAIT_MS) {
  return cmd.type === "interrupt" && Number.isFinite(cmd.sent) && now - cmd.sent > maxWaitMs;
}

const SHOT_EXTENSIONS = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif",
  "image/webp": "webp", "image/bmp": "bmp", "image/avif": "avif"
};

export function shotFile(id, index, mediaType) {
  const kind = SHOT_EXTENSIONS[String(mediaType || "").toLowerCase()] || "png";
  const stem = String(id || "shot").replace(/[^\w.-]/g, "_").slice(0, 64);
  return `${stem}-${index}.${kind}`;
}

const shotSource = (piece) => {
  const source = piece?.type === "image" ? piece.source : null;
  return source && source.type === "base64" && typeof source.data === "string" && source.data ? source : null;
};

function unpackBlocks(blocks, id, keep) {
  if (!Array.isArray(blocks)) return blocks;
  let landed = false;
  const out = blocks.map((piece, index) => {
    const source = shotSource(piece);
    if (!source) return piece;
    landed = true;
    return keep(id, index, source);
  });
  return landed ? out : blocks;
}

export function unpackShots(event, dir, seq = 0) {
  const shots = [];
  const kept = new Set();
  const keep = (id, index, source) => {
    const media = source.media_type || "image/png";
    const path = join(dir, shotFile(id || `seq${seq}`, index, media));
    if (!kept.has(path)) {
      kept.add(path);
      shots.push({ path, data: source.data });
    }
    return { type: "image", media_type: media, path };
  };

  const content = event?.message?.content;
  let calls = 0;
  let onlyId = "";
  const blocks = Array.isArray(content)
    ? content.map((block) => {
        if (block?.type !== "tool_result") return block;
        calls += 1;
        onlyId = block.tool_use_id || "";
        const inside = unpackBlocks(block.content, block.tool_use_id, keep);
        return inside === block.content ? block : { ...block, content: inside };
      })
    : content;
  const echo = calls === 1 ? unpackBlocks(event.tool_use_result, onlyId, keep) : event?.tool_use_result;

  if (!shots.length) return { event, shots: [] };
  const lean = { ...event };
  if (Array.isArray(content) && blocks.some((block, i) => block !== content[i])) {
    lean.message = { ...event.message, content: blocks };
  }
  if (echo !== event?.tool_use_result) lean.tool_use_result = echo;
  return { event: lean, shots };
}

export function shotsToForget(files, keep) {
  return [...files]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(Math.max(0, keep))
    .map((f) => f.name);
}

export function eventLine(seq, event, ts = new Date().toISOString()) {
  return JSON.stringify({ seq, ts, ...event });
}

export function lastSeq(tail) {
  const lines = String(tail || "").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const n = JSON.parse(lines[i]).seq;
      if (Number.isFinite(n)) return n;
    } catch {}
  }
  return 0;
}

const clip = (s, n = 110) => {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
};

export function compactLine(event) {
  if (event.type === "stream_event") return null;
  if (event.type === "system") {
    if (event.subtype === "init") return `init model=${event.model} session=${event.session_id}`;
    if (event.subtype === "status" && event.status === "compacting") return "compacting the conversation…";
    if (event.subtype === "status" && event.compact_result && event.compact_result !== "success") return `compact ${event.compact_result}: ${clip(event.compact_error || "", 80)}`;
    if (event.subtype === "compact_boundary") {
      const m = event.compact_metadata || {};
      const pre = m.pre_tokens != null ? `${Math.round(m.pre_tokens / 1000)}k` : "?";
      const post = m.post_tokens != null ? `${Math.round(m.post_tokens / 1000)}k` : "?";
      return `compact boundary (${m.trigger || "manual"}) ${pre} → ${post}`;
    }
    return null;
  }
  if (event.type === "driver") {
    if (event.subtype === "question") return `QUESTION ${event.id} ${clip(event.questions?.map((q) => q.question).join(" | "))}`;
    if (event.subtype === "replayed") return `replayed ${event.count} of ${event.total} past messages`;
    if (event.subtype === "question_answered") return `answered ${event.id}`;
    if (event.subtype === "question_dismissed") return `dropped ${event.id} — said in the chat instead`;
    if (event.subtype === "interrupted") return `interrupted in ${event.ms}ms`;
    if (event.subtype === "compact_asked") return event.queued ? "compact asked — queued behind the turn" : "compact asked";
    return `driver ${event.subtype}`;
  }
  if (event.type === "assistant") {
    const parts = [];
    for (const b of event.message?.content || []) {
      if (b.type === "text") parts.push(clip(b.text));
      if (b.type === "thinking") parts.push(`(thinking ${clip(b.thinking, 60)})`);
      if (b.type === "tool_use") parts.push(`>${b.name} ${clip(JSON.stringify(b.input), 80)}`);
    }
    return parts.length ? parts.join("  ") : null;
  }
  if (event.type === "user") {
    const parts = [];
    for (const b of Array.isArray(event.message?.content) ? event.message.content : []) {
      if (b.type === "tool_result") parts.push(`<result ${clip(typeof b.content === "string" ? b.content : JSON.stringify(b.content), 80)}`);
      if (b.type === "text") parts.push(`user: ${clip(b.text)}`);
    }
    if (typeof event.message?.content === "string") parts.push(`user: ${clip(event.message.content)}`);
    return parts.length ? parts.join("  ") : null;
  }
  if (event.type === "memory") return `memory ${event.kind}${event.state ? " " + event.state : ""}${event.items ? ` items=${event.items.length}` : ""}`;
  if (event.type === "result") return `result ${event.subtype} cost=$${(event.total_cost_usd ?? 0).toFixed(4)} turns=${event.num_turns ?? "?"}`;
  return `${event.type}${event.subtype ? "/" + event.subtype : ""}`;
}

export function noConversationToResume(trouble) {
  return /No conversation found with session ID/i.test(String(trouble || ""));
}

export function endedOnApiError(result) {
  if (!result || result.type !== "result") return false;
  if (result.terminal_reason === "api_error") return true;
  return result.is_error === true && Number.isFinite(result.api_error_status);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function offsetOf(zone, epoch) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(epoch);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Date.UTC(+at.year, +at.month - 1, +at.day, +at.hour % 24, +at.minute, +at.second) - epoch;
}

function wallClockIn(zone, y, month, day, hour, minute) {
  const naive = Date.UTC(y, month, day, hour, minute);
  let epoch = naive - offsetOf(zone, naive);
  epoch = naive - offsetOf(zone, epoch);
  return epoch;
}

function dateThereNow(zone, now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: +at.year, month: +at.month - 1, day: +at.day };
}

const RESETS = /resets\s+(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i;

export function resetsAtFrom(text, now = Date.now()) {
  const m = RESETS.exec(String(text || ""));
  if (!m) return 0;
  const [, monthWord, dayWord, hourWord, minuteWord, half, zone] = m;
  let hour = +hourWord % 12;
  if (half.toLowerCase() === "pm") hour += 12;
  const minute = minuteWord ? +minuteWord : 0;
  try {
    const today = dateThereNow(zone, now);
    if (monthWord) {
      const month = MONTHS.indexOf(monthWord.toLowerCase());
      if (month < 0) return 0;
      const day = +dayWord;
      let when = wallClockIn(zone, today.year, month, day, hour, minute);
      if (when <= now) when = wallClockIn(zone, today.year + 1, month, day, hour, minute);
      return when;
    }
    let when = wallClockIn(zone, today.year, today.month, today.day, hour, minute);
    if (when <= now) when = wallClockIn(zone, today.year, today.month, today.day + 1, hour, minute);
    return when;
  } catch {
    return 0;
  }
}

const OUT_OF_ROOM = /you'?ve hit your (?:org'?s |individual )?(?:monthly |weekly |session )?(?:spend )?limit|usage limit reached|credit balance is too low/i;
const LOGIN_IS_GONE = /failed to authenticate|oauth session expired|please run \/login|invalid api key/i;

export function accountRanDry(result, now = Date.now()) {
  if (!endedOnApiError(result)) return null;
  const says = String(result.result || "").trim();
  if (LOGIN_IS_GONE.test(says)) return { why: "login", says, until: 0 };
  if (!OUT_OF_ROOM.test(says)) return null;
  return { why: "spent", says, until: resetsAtFrom(says, now) };
}

const HOOK_NOTES = new Set(["hook_started", "hook_progress", "hook_response"]);
const HOOKS_ALWAYS_SHOWN = new Set(["SessionStart", "Setup"]);
const MEMORY_MARK = "hive-memory:";
const MEMORY_LINE_CEILING = 16384;
const MEMORY_ITEMS_MAX = 6;
const MEMORY_SOURCES = new Set(["shared", "curated", "conversation"]);
const MEMORY_USED_STATES = new Set(["on", "limited"]);
const MEMORY_STATES = new Set(["login", "incognito"]);

export const isHookNote = (message) => message?.type === "system" && HOOK_NOTES.has(message.subtype);

export const hookNoteShown = (message) => HOOKS_ALWAYS_SHOWN.has(String(message?.hook_event || ""));

const memoryText = (value, room) => String(typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, room);

function memoryItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = memoryText(raw.title, 120);
  if (!title) return null;
  const relevance = Number(raw.relevance);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(String(raw.date || ""));
  return {
    id: memoryText(raw.id, 120),
    title,
    source: MEMORY_SOURCES.has(raw.source) ? raw.source : "conversation",
    relevance: typeof raw.relevance === "number" && Number.isFinite(relevance) ? Math.min(1, Math.max(0, relevance)) : null,
    author: memoryText(raw.author, 60),
    date: date ? date[0] : ""
  };
}

export function memoryNote(stderr) {
  const line = String(stderr || "").split("\n").find((one) => one.startsWith(MEMORY_MARK));
  if (!line || line.length > MEMORY_LINE_CEILING) return null;
  let said = null;
  try { said = JSON.parse(line.slice(MEMORY_MARK.length)); } catch { return null; }
  if (!said || typeof said !== "object" || said.v !== 1) return null;
  if (said.kind === "used") {
    const items = (Array.isArray(said.items) ? said.items : []).map(memoryItem).filter(Boolean).slice(0, MEMORY_ITEMS_MAX);
    return { type: "memory", kind: "used", state: MEMORY_USED_STATES.has(said.state) ? said.state : "on", items };
  }
  if (said.kind === "state") return MEMORY_STATES.has(said.state) ? { type: "memory", kind: "state", state: said.state } : null;
  if (said.kind === "sent") {
    const at = Number(said.at);
    return { type: "memory", kind: "sent", at: Number.isFinite(at) && at > 0 ? at : Date.now() };
  }
  return null;
}

export function hookFate(message) {
  if (!isHookNote(message)) return { shown: true, memory: null };
  return { shown: hookNoteShown(message), memory: message.subtype === "hook_response" ? memoryNote(message.stderr) : null };
}

export async function* fileLines(path) {
  let pending = [];
  for await (const chunk of createReadStream(path)) {
    let start = 0;
    let at;
    while ((at = chunk.indexOf(0x0a, start)) !== -1) {
      pending.push(chunk.subarray(start, at));
      yield Buffer.concat(pending).toString("utf8");
      pending = [];
      start = at + 1;
    }
    if (start < chunk.length) pending.push(chunk.subarray(start));
  }
  if (pending.length) yield Buffer.concat(pending).toString("utf8");
}

export const REPLAY_TAIL = 400;

export async function transcriptTail(file, keep = REPLAY_TAIL) {
  const picked = [];
  let total = 0;
  for await (const line of fileLines(file)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.isSidechain || entry.isMeta) continue;
    if ((entry.type !== "user" && entry.type !== "assistant") || !entry.message) continue;
    total += 1;
    picked.push({ type: entry.type, message: entry.message, parent_tool_use_id: null, replayed: true });
    if (picked.length > keep) picked.shift();
  }
  return { tail: picked, total };
}

import { BASE, avatarFor, isFaceKey, parseWear, wearKey } from "../assets/avatar/avatar.mjs";


export const PANEL_FILE = "/workspace/hive/panel.json";
export const PANEL_VERSION = 1;
export const PANEL_FRESH = 150000;

const SEAT_NAME = /^[A-Za-z0-9._-]{1,80}$/;
const DEV_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
const STATES = new Set(["needs", "working", "done", "idle", "ready", "answered", "stalled"]);
const SEAT_LIMIT = 40;
const PAGES_KEPT = 8;
const SLUG_NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;
export const PAGE_FRESH = 75000;

const cut = (text, max) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);


const LIVE_KEPT = 6;

const liveTasksOf = (seat) => (Array.isArray(seat?.live) ? seat.live : [])
  .slice(0, LIVE_KEPT)
  .map((one) => ({ id: cut(one?.id, 40), kind: cut(one?.kind, 24), said: cut(one?.said, 140) }))
  .filter((one) => one.id);

function seatOf(seat) {
  return {
    name: seat.name,
    title: cut(seat.title || seat.name, 120),
    where: seat.where === "cloud" ? "cloud" : "local",
    state: STATES.has(seat.state) ? seat.state : "idle",
    when: cut(seat.when, 24),
    model: cut(seat.model, 40),
    summary: cut(seat.summary, 400),
    description: cut(seat.description, 140),
    now: cut(seat.now, 240),
    live: liveTasksOf(seat),
    liveSince: cut(seat.liveSince, 40)
  };
}

export const MACHINE_CHARS = 32;

export function machineName(raw) {
  return String(raw ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MACHINE_CHARS);
}

export function machineOf(panel, key) {
  return machineName(panel?.machine) || `·${String(key || "").slice(7, 13)}`;
}

export function pagesOf(pages) {
  return (Array.isArray(pages) ? pages : [])
    .filter((one) => one && SLUG_NAME.test(String(one.slug || "")))
    .slice(0, PAGES_KEPT)
    .map((one) => ({
      slug: String(one.slug),
      ...(one.tab ? { tab: cut(one.tab, 24) } : {}),
      ...(one.el ? { el: cut(one.el, 120) } : {})
    }));
}

/* the colour of a person is the colour of their own little face, so the same person is the same
   colour on the page, in the rail and in the team screen — never a palette of its own. */
export const colourOfDev = (dev) => BASE[avatarFor(String(dev || "")).colour] || BASE.blue;

export function watchersOf(board, me, slug, now = Date.now(), fresh = PAGE_FRESH) {
  const seen = new Map();
  for (const one of board || []) {
    const dev = String(one?.dev || "");
    if (!dev || !DEV_NAME.test(dev)) continue;
    const at = Number(one?.at) || 0;
    if (!at || now - at > fresh) continue;
    const here = (Array.isArray(one?.pages) ? one.pages : []).find((page) => page && page.slug === slug);
    if (!here) continue;
    const known = seen.get(dev);
    if (known && known.at >= at) continue;
    seen.set(dev, { dev, at, el: here.el || "", tab: here.tab || "", colour: colourOfDev(dev), mine: dev === me });
  }
  return [...seen.values()].sort((a, b) => (a.mine === b.mine ? a.dev.localeCompare(b.dev) : a.mine ? 1 : -1));
}

export function panelOf(sessions, dev, at, keyboards = new Map(), avatar = "", wear = "", machine = "", knocks = true, pages = []) {
  const worn = wearKey(wear);
  const named = machineName(machine);
  return {
    v: PANEL_VERSION,
    dev,
    at,
    ...(named ? { machine: named } : {}),
    ...(isFaceKey(avatar) ? { avatar } : {}),
    /* the clothes ride next to the face, under a key of their own: a hive from before the
       wardrobe reads the face it knows and leaves this one on the floor, which is the right
       face without a hat — never the wrong face. */
    ...(worn ? { wear: worn } : {}),
    ...(knocks === false ? { knocks: false } : {}),
    ...(pagesOf(pages).length ? { pages: pagesOf(pages) } : {}),
    seats: (sessions || [])
      .filter((seat) => seat && SEAT_NAME.test(String(seat.name || "")) && seat.kind !== "shell")
      .slice(0, SEAT_LIMIT)
      .map((seat) => {
        const card = seatOf(seat);
        const lent = keyboards.get(seat.name);
        if (grantLive(lent, at)) card.keyboard = { with: lent.with, until: lent.until, turns: lent.turns || [] };
        return card;
      })
  };
}

export function readPanel(text, now = Date.now(), fresh = PANEL_FRESH) {
  let raw;
  try { raw = JSON.parse(String(text || "")); } catch { return null; }
  if (!raw || typeof raw !== "object" || raw.v !== PANEL_VERSION) return null;
  if (!DEV_NAME.test(String(raw.dev || ""))) return null;
  const at = Number(raw.at) || 0;
  const seats = Array.isArray(raw.seats) ? raw.seats : [];
  return {
    dev: raw.dev,
    machine: machineName(raw.machine),
    at,
    avatar: isFaceKey(raw.avatar) ? raw.avatar : "",
    wear: wearKey(raw.wear),
    knocks: raw.knocks !== false,
    pages: pagesOf(raw.pages),
    stale: !at || now - at > fresh,
    seats: seats.filter((seat) => seat && SEAT_NAME.test(String(seat.name || ""))).slice(0, SEAT_LIMIT).map((seat) => {
      const card = seatOf(seat);
      const lent = seat.keyboard;
      if (lent && DEV_NAME.test(String(lent.with || "")) && Number(lent.until) > 0) {
        card.keyboard = {
          with: lent.with,
          until: Number(lent.until),
          turns: (Array.isArray(lent.turns) ? lent.turns : []).slice(-TURNS).map((t) => ({
            who: t?.who === "you" ? "you" : "seat",
            text: cut(t?.text, TURN_CHARS)
          }))
        };
      }
      return card;
    })
  };
}



export const machineTag = (key) => String(key || "").slice(7).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);

export function teamSeatKey(dev, name, key = "") {
  const tag = machineTag(key);
  return tag ? `team:${dev}.${tag}/${name}` : `team:${dev}/${name}`;
}

export function readTeamSeatKey(key) {
  const found = /^team:([a-z0-9][a-z0-9-]{0,30})(?:\.([A-Za-z0-9]{1,10}))?\/([A-Za-z0-9._-]{1,80})$/.exec(String(key || ""));
  return found ? { dev: found[1], machine: found[2] || "", name: found[3] } : null;
}


export const KNOCK_DIR = "/workspace/hive/knocks";
export const SAY_DIR = "/workspace/hive/says";
export const GRANT_MS = 1800000;
export const KNOCK_FRESH = 300000;
export const TURNS = 12;
export const TURN_CHARS = 420;

const KNOCK_KINDS = ["knock", "bye", "yes"];

export function knockOf(from, seat, at, kind = "knock") {
  return { v: PANEL_VERSION, kind: KNOCK_KINDS.includes(kind) ? kind : "knock", from, seat, at };
}

export function sayOf(from, seat, text, at, id) {
  return { v: PANEL_VERSION, kind: "say", from, seat, at, id, text: String(text).slice(0, 4000) };
}

function readNote(text, kinds) {
  let raw;
  try { raw = JSON.parse(String(text || "")); } catch { return null; }
  if (!raw || typeof raw !== "object" || raw.v !== PANEL_VERSION || !kinds.includes(raw.kind)) return null;
  if (!DEV_NAME.test(String(raw.from || "")) || !SEAT_NAME.test(String(raw.seat || ""))) return null;
  return raw;
}

export function readKnock(text, now = Date.now(), fresh = KNOCK_FRESH) {
  const raw = readNote(text, KNOCK_KINDS);
  if (!raw) return null;
  const at = Number(raw.at) || 0;
  if (!at || now - at > fresh) return null;
  return { from: raw.from, seat: raw.seat, at, kind: raw.kind };
}

export function readSay(text) {
  const raw = readNote(text, ["say"]);
  if (!raw) return null;
  const said = String(raw.text || "").trim();
  if (!said) return null;
  return { from: raw.from, seat: raw.seat, at: Number(raw.at) || 0, id: String(raw.id || ""), text: said.slice(0, 4000) };
}

export function sayLine(from, text) {
  return `${from}: ${String(text).trim()}`;
}

export const grantLive = (grant, now = Date.now()) => !!grant && !!grant.with && Number(grant.until) > now;


export const POKE_DIR = "/workspace/hive/pokes";
export const POKE_FRESH = 120000;
export const canPoke = (dev, allowed = []) => allowed.includes(String(dev || ""));

/* a hello rides the poke: same road, same allowlist, one more word. what it carries is still
   who and when — the face that shows up at the other end is the one their rail already knows,
   and how it moves is decided there. */
export function pokeOf(from, at, hello = false) {
  const poke = { v: PANEL_VERSION, kind: "poke", from, at, id: `${from}:${at}` };
  return hello ? { ...poke, hello: true } : poke;
}

export function readPoke(text, now = Date.now(), fresh = POKE_FRESH) {
  let raw;
  try { raw = JSON.parse(String(text || "")); } catch { return null; }
  if (!raw || typeof raw !== "object" || raw.v !== PANEL_VERSION || raw.kind !== "poke") return null;
  if (!DEV_NAME.test(String(raw.from || ""))) return null;
  const at = Number(raw.at) || 0;
  if (!at || now - at > fresh) return null;
  const poke = { from: raw.from, at, id: String(raw.id || `${raw.from}:${at}`) };
  return raw.hello === true ? { ...poke, hello: true } : poke;
}

export function turnsOfTail(tail, max = TURNS, chars = TURN_CHARS) {
  const turns = [];
  for (const line of String(tail || "").split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.replayed || e.parent_tool_use_id) continue;
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
    const said = blocks.filter((b) => b?.type === "text" && String(b.text || "").trim())
      .map((b) => String(b.text).trim()).join("\n").trim();
    if (!said) continue;
    if (e.type === "user" && e.subtype === "say") turns.push({ who: "you", text: said.slice(0, chars) });
    else if (e.type === "assistant") turns.push({ who: "seat", text: said.slice(0, chars) });
  }
  return turns.slice(-max);
}

/* ── the conversation, mirrored ─────────────────────
   the card says what a seat is doing; it cannot say what it said. So while a keyboard is out, its
   owner also publishes that seat's whole conversation — in a file of its own, because the deck of
   cards is read by every hive on the team on a timer and has to stay small, and this is the one
   thing that grows all day. What crosses is the talking and one line per step: never what a tool
   answered, never the thinking behind it, never an image. The peeling happens here, on the machine
   that owns the seat, so the things that stay home never enter a file in the first place. */

export const LIVE_DIR = "/workspace/hive/live";
export const LIVE_WINDOW = 262144;
/* past this the file is rewritten instead of appended: a borrowed keyboard is a sitting, not an
   archive, and whoever is reading notices the rewrite by the size having gone backwards */
export const LIVE_MAX = 1048576;
export const LIVE_TEXT = 24576;
export const LIVE_ARG = 240;

const HOME_DIR = /\/(?:Users|home)\/[^/\s]+\//g;
const CD_FIRST = /^\s*cd\s+(?:'[^']*'|"[^"]*"|[^\s;&|]+)\s*&&\s*/;
const PATH_TOOLS = /^(read|write|edit|multiedit|notebook)/;
const AGENT_TOOLS = /^(task|agent|explore|plan)$/;
const ARG_KEYS = ["description", "path", "file_path", "query", "url", "command", "prompt"];

function shortPath(path) {
  const home = String(path ?? "").replace(HOME_DIR, "~/");
  const segs = home.split("/");
  return segs.length <= 3 ? home : "…/" + segs.slice(-3).join("/");
}

function argOf(tool, inp) {
  if (/^bash(output)?$/.test(tool)) return String(inp.command ?? "").replace(CD_FIRST, "");
  if (PATH_TOOLS.test(tool)) return shortPath(inp.file_path || inp.notebook_path || inp.path);
  if (tool === "grep") {
    if (!inp.pattern) return "";
    return inp.path ? `${inp.pattern} in ${shortPath(inp.path)}` : String(inp.pattern);
  }
  if (tool === "glob" || tool === "ls") return inp.pattern || inp.path || "";
  if (tool === "websearch") return inp.query || "";
  if (tool === "webfetch") return inp.url || "";
  if (AGENT_TOOLS.test(tool)) return inp.description || inp.subagent_type || "";
  if (tool === "todowrite") {
    const todos = Array.isArray(inp.todos) ? inp.todos : [];
    const done = todos.filter((t) => t?.status === "completed").length;
    const now = todos.find((t) => t?.status === "in_progress");
    return `${done}/${todos.length}${now ? ` · ${cut(now.activeForm || now.content, LIVE_ARG)}` : ""}`;
  }
  if (tool === "skill" || tool === "slashcommand") return inp.skill || inp.command || "";
  if (tool === "askuserquestion") return (Array.isArray(inp.questions) && inp.questions[0]?.question) || "";
  for (const key of ARG_KEYS) if (typeof inp[key] === "string" && inp[key].trim()) return inp[key];
  return "";
}

export function toolLine(name, input) {
  const tool = String(name || "").toLowerCase();
  return cut(argOf(tool, input && typeof input === "object" ? input : {}), LIVE_ARG);
}

const LIVE_DRIVER = new Set(["interrupted", "exit", "warning", "error",
  "question", "question_answered", "question_dismissed", "question_failed"]);

export const LIVE_ASKS = 4;
export const LIVE_OPTIONS = 8;
export const LIVE_ASK = 1200;
const LIVE_ASK_HEAD = 60;
const LIVE_OPTION = 160;
const LIVE_WHY = 400;

const whole = (text, max) => String(text ?? "").slice(0, max).trim();

function liveQuestions(list) {
  const kept = [];
  for (const one of Array.isArray(list) ? list : []) {
    if (!one || typeof one !== "object") continue;
    const question = whole(one.question, LIVE_ASK);
    if (!question) continue;
    kept.push({
      question,
      header: cut(one.header, LIVE_ASK_HEAD),
      multiSelect: !!one.multiSelect,
      options: (Array.isArray(one.options) ? one.options : []).slice(0, LIVE_OPTIONS).flatMap((option) => {
        const label = cut(option?.label, LIVE_OPTION);
        return label ? [{ label, description: cut(option?.description, LIVE_WHY) }] : [];
      })
    });
    if (kept.length === LIVE_ASKS) break;
  }
  return kept;
}

/* the blocks are kept by name, never dropped by name: a block nobody here knows about is a block
   nobody here can promise is safe to send.

   `said` is what separates a person talking from the harness talking through the same door. An event
   of type `user` is not only what somebody typed: a skill puts the whole SKILL.md in one, a subagent
   gets its system prompt in one, `<local-command-stdout>` arrives in one. None of that is conversation
   and none of it was ever meant to leave the machine — the old path published only `subtype: "say"`
   for exactly this reason, and this one holds the same line. */
function liveBlocks(blocks, who, said) {
  const kept = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text") {
      if (who === "user" && !said) continue;
      const text = String(b.text ?? "").slice(0, LIVE_TEXT);
      if (text.trim()) kept.push({ type: "text", text });
    } else if (who === "assistant" && b.type === "tool_use") {
      kept.push({
        type: "tool_use",
        id: String(b.id || ""),
        name: String(b.name || ""),
        /* a line that already came peeled is kept, or reading a file back would erase it */
        line: typeof b.line === "string" ? cut(b.line, LIVE_ARG) : toolLine(b.name, b.input),
        input: {}
      });
    } else if (who === "user" && b.type === "tool_result") {
      kept.push({ type: "tool_result", tool_use_id: String(b.tool_use_id || ""), is_error: !!b.is_error, content: "" });
    }
  }
  return kept;
}

export function liveOf(event) {
  const e = event && typeof event === "object" ? event : null;
  if (!e || e.hive_ping || e.type === "stream_event") return null;
  const head = { seq: Number(e.seq) || 0, ts: String(e.ts || "") };
  const mark = e.replayed ? { replayed: true } : {};
  if (e.type === "system") {
    return { ...head, type: "system", subtype: String(e.subtype || ""), model: cut(e.model, 80), ...mark };
  }
  if (e.type === "driver") {
    if (!LIVE_DRIVER.has(e.subtype)) return null;
    return {
      ...head,
      type: "driver",
      subtype: e.subtype,
      ...(e.id ? { id: cut(e.id, 80) } : {}),
      ...(e.subtype === "question" ? { questions: liveQuestions(e.questions) } : {}),
      ...(Number.isFinite(e.ms) ? { ms: e.ms } : {}),
      ...(e.message ? { message: cut(e.message, 400) } : {}),
      ...(e.error ? { error: cut(e.error, 400) } : {}),
      ...mark
    };
  }
  if (e.type === "assistant") {
    const content = liveBlocks(e.message?.content, "assistant", true);
    if (!content.length) return null;
    return { ...head, type: "assistant", parent_tool_use_id: e.parent_tool_use_id ?? null, message: { content }, ...mark };
  }
  if (e.type === "user") {
    /* the harness sometimes writes a plain string where the blocks go; it is still what was said */
    const raw = typeof e.message?.content === "string" ? [{ type: "text", text: e.message.content }] : e.message?.content;
    const content = liveBlocks(raw, "user", e.subtype === "say");
    if (!content.length) return null;
    return {
      ...head,
      type: "user",
      subtype: String(e.subtype || ""),
      cid: e.cid ?? null,
      from: e.from ? cut(e.from, 40) : "",
      images: [],
      message: { content },
      ...mark
    };
  }
  if (e.type === "result") {
    return {
      ...head,
      type: "result",
      total_cost_usd: Number(e.total_cost_usd) || 0,
      duration_ms: Number(e.duration_ms) || 0,
      num_turns: Number(e.num_turns) || 0,
      is_error: !!e.is_error,
      stop_reason: cut(e.stop_reason, 40),
      ...mark
    };
  }
  return null;
}

export function liveOfTail(tail, from = 0) {
  const since = Number(from) || 0;
  const events = [];
  for (const line of String(tail || "").split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== "object" || !(Number(e.seq) > since)) continue;
    const live = liveOf(e);
    if (live) events.push(live);
  }
  return events;
}

/* the visitor's side: the same sieve, run again on the way in. A file that arrives from another
   machine is somebody else's word — if it grew a tool's output, a thought or a filled-in input over
   there, it arrives here without them anyway. */
export function readLive(text) {
  const events = [];
  for (const line of String(text || "").split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const live = liveOf(e);
    if (live) events.push(live);
  }
  return events;
}

/* the name becomes a path inside a bash -c on somebody's server: what is not a seat name is not a file */
export const liveFileOf = (seat) => (SEAT_NAME.test(String(seat ?? "")) ? `${LIVE_DIR}/${seat}.ndjson` : "");

export const OUT_DIR = "/workspace/hive/outbox";
export const ASK_CHARS = 1200;
export const OWED_LIFE = 600000;

export function askOf(from, agent, text, at, id) {
  return { v: PANEL_VERSION, kind: "ask", from, agent, at, id: String(id || ""), text: String(text).slice(0, ASK_CHARS) };
}

export function outboxOf(to, agent, text, at, id) {
  return { v: PANEL_VERSION, kind: "out", to, agent, at, id: String(id || ""), text: String(text).slice(0, ASK_CHARS) };
}

export function answerOf(from, seat, text, at, id) {
  return { v: PANEL_VERSION, kind: "answer", from, seat, at, id: String(id || ""), text: String(text).slice(0, ASK_CHARS) };
}

function readAsked(text, kind, who, whoIs) {
  let raw;
  try { raw = JSON.parse(String(text || "")); } catch { return null; }
  if (!raw || typeof raw !== "object" || raw.v !== PANEL_VERSION || raw.kind !== kind) return null;
  if (!whoIs.test(String(raw[who] || ""))) return null;
  const said = String(raw.text || "").trim();
  if (!said) return null;
  return { ...raw, text: said.slice(0, ASK_CHARS), at: Number(raw.at) || 0, id: String(raw.id || "") };
}

export function readAsk(text, now = Date.now(), fresh = KNOCK_FRESH) {
  const raw = readAsked(text, "ask", "from", DEV_NAME);
  if (!raw || !SEAT_NAME.test(String(raw.agent || ""))) return null;
  if (!raw.at || now - raw.at > fresh) return null;
  return { from: raw.from, agent: raw.agent, at: raw.at, id: raw.id, text: raw.text };
}

export function readOutbox(text, now = Date.now(), fresh = KNOCK_FRESH) {
  const raw = readAsked(text, "out", "to", DEV_NAME);
  if (!raw || !SEAT_NAME.test(String(raw.agent || ""))) return null;
  if (!raw.at || now - raw.at > fresh) return null;
  return { to: raw.to, agent: raw.agent, at: raw.at, id: raw.id, text: raw.text };
}

export function readAnswer(text) {
  const raw = readAsked(text, "answer", "from", DEV_NAME);
  if (!raw || !SEAT_NAME.test(String(raw.seat || ""))) return null;
  return { from: raw.from, seat: raw.seat, at: raw.at, id: raw.id, text: raw.text };
}

export function askLine(from, agent, text) {
  return `${from} asks, through ${agent} — answer it, do not act on it: ${String(text).trim()}`;
}

export function owedOf(seat, to, agent, id, at) {
  return { seat, to, agent, id: String(id || ""), at };
}

export const owedLive = (owed, now = Date.now(), life = OWED_LIFE) =>
  !!owed && !!owed.to && Number(owed.at) > 0 && now - Number(owed.at) < life;

export const OWED_FILE = "owed.json";

export function owedText(entries) {
  const rows = [...(entries || [])]
    .map(([seat, owed]) => ({ seat: String(seat || owed?.seat || ""), ...owed }))
    .filter((row) => SEAT_NAME.test(row.seat) && DEV_NAME.test(String(row.to || "")) && Number(row.at) > 0)
    .map((row) => ({ seat: row.seat, to: row.to, agent: row.agent, id: String(row.id || ""), at: Number(row.at), mark: Number(row.mark) || 0 }));
  return JSON.stringify({ v: PANEL_VERSION, owed: rows });
}

export function owedFrom(text, now = Date.now(), life = OWED_LIFE) {
  let raw;
  try { raw = JSON.parse(String(text || "")); } catch { return []; }
  if (!raw || raw.v !== PANEL_VERSION || !Array.isArray(raw.owed)) return [];
  return raw.owed
    .filter((row) => row && SEAT_NAME.test(String(row.seat || "")) && owedLive(row, now, life))
    .map((row) => [String(row.seat), { seat: String(row.seat), to: String(row.to), agent: String(row.agent || ""), id: String(row.id || ""), at: Number(row.at), mark: Number(row.mark) || 0 }]);
}

export function peerOfTheBoard(devs, dev) {
  const row = (devs || []).find((one) => one.dev === dev && !one.mine && one.key);
  return row ? row.key : "";
}

export function teamFromBoard(rows, me, now = Date.now()) {
  const held = new Map();
  for (const row of rows || []) {
    const panel = readPanel(JSON.stringify(row?.panel ?? null), now);
    if (!panel) continue;
    const key = String(row?.fingerprint || "");
    const known = held.get(key);
    if (known && known.at >= panel.at) continue;
    held.set(key, { panel, row, key });
  }
  return [...held.values()]
    .map(({ panel, row, key }) => {
      const live = panel.stale ? null : panel;
      const seats = live ? live.seats : [];
      return {
        dev: panel.dev,
        key,
        machine: machineOf(panel, key),
        mine: panel.dev === me,
        up: !panel.stale,
        at: panel.at || 0,
        avatar: live?.avatar || "",
        wear: live?.wear || "",
        sharing: !!live,
        knocks: !live || live.knocks !== false,
        peer: !!row?.peer,
        seats,
        needs: seats.filter((seat) => seat.state === "needs").length
      };
    })
    .sort((a, b) => (b.mine - a.mine)
      || b.seats.length - a.seats.length
      || a.dev.localeCompare(b.dev)
      || a.machine.localeCompare(b.machine));
}

export function machinesOfDev(rows, dev) {
  return (rows || []).filter((row) => row.dev === dev);
}

export function liveliestOfDev(rows, dev) {
  const his = machinesOfDev(rows, dev).filter((row) => row.up);
  if (!his.length) return machinesOfDev(rows, dev)[0] || null;
  return his.reduce((best, row) => (row.at > best.at ? row : best), his[0]);
}

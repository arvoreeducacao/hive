export const NOTICE_SETTLE_MS = 3000;
export const NOTICE_REPLY_CHARS = 12000;
export const OPENER_TICK_MS = 5000;

const MESSAGE_TOOL = /(?:^|[^a-z])message$/i;

export function freshTalk() {
  return { heard: {}, wrote: {}, reply: "", stopped: false, final: null };
}

function textOf(blocks) {
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function hearEvent(talk, e) {
  if (!talk || !e || e.replayed) return talk;
  if (e.type === "user" && e.subtype === "say" && typeof e.from === "string" && e.from.trim()) {
    if (!e.consumed) talk.heard[e.from.trim().toLowerCase()] = e.seq;
    return talk;
  }
  if (e.type === "driver" && e.subtype === "interrupted") {
    talk.stopped = true;
    return talk;
  }
  if (e.type === "result") {
    if (!e.idle_compact) {
      const said = String(e.result || "").trim() || talk.reply;
      talk.final = { seq: e.seq, reply: said.slice(0, NOTICE_REPLY_CHARS), clipped: said.length > NOTICE_REPLY_CHARS, stopped: talk.stopped || e.subtype === "interrupted" };
    }
    talk.reply = "";
    talk.stopped = false;
    return talk;
  }
  if (e.type !== "assistant" || e.parent_tool_use_id) return talk;
  const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
  const said = textOf(blocks);
  if (said) talk.reply = said;
  for (const block of blocks) {
    if (block?.type !== "tool_use" || !MESSAGE_TOOL.test(String(block.name || ""))) continue;
    const seat = typeof block.input?.seat === "string" ? block.input.seat.trim().toLowerCase() : "";
    if (seat && typeof block.input?.text === "string") talk.wrote[seat] = e.seq;
  }
  return talk;
}

export function childrenWaited(errands) {
  return new Set(Object.entries(errands || {}).filter(([, one]) => !!one?.by && Number.isFinite(one.told) && !one.endedAt).map(([seat]) => seat));
}

export function someoneWaits(errands) {
  return childrenWaited(errands).size > 0;
}

export function talkOfTail(tail) {
  const talk = freshTalk();
  for (const line of String(tail || "").split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    hearEvent(talk, e);
  }
  return talk;
}

function wroteTo(talk, opener, after) {
  return Object.entries(talk?.wrote || {}).some(([seat, seq]) => opener.startsWith(seat) && seq > after);
}

export function noticeText(seat, final, error = false) {
  const reply = String(final?.reply || "").trim();
  const ended = final?.stopped ? "its turn was stopped before the end" : error ? "its turn ended in an error" : "it finished the turn you were waiting on";
  if (!reply) return `(the hive, for ${seat}: ${ended} without a written reply — peek it to see what it did)`;
  const cut = final.clipped ? `\n\n(cut at ${NOTICE_REPLY_CHARS} characters — ask ${seat} for the rest)` : "";
  return `(the hive, for ${seat}: ${ended} and sent you nothing itself, so here is its last reply)\n\n${reply}${cut}`;
}

export function openerNotice({ seat, record, state, finish, talk, now = Date.now(), settleMs = NOTICE_SETTLE_MS }) {
  const opener = String(record?.by || "").trim().toLowerCase();
  if (!opener || opener === seat || !finish || !talk?.final) return null;
  if (state === "working" || state === "needs") return null;
  if (talk.final.seq !== finish.seq) return null;
  const at = Date.parse(finish.at);
  if (Number.isFinite(at) && now - at < settleMs) return null;
  if (!Number.isFinite(record.told)) return null;
  const told = record.told;
  if (finish.seq <= told) return null;
  const owedSince = told < 0 ? 0 : talk.heard[opener] ?? -1;
  if (owedSince < 0 || (told >= 0 && owedSince <= told)) return null;
  if (wroteTo(talk, opener, owedSince)) return { opener, told: finish.seq, text: "" };
  return { opener, told: finish.seq, text: noticeText(seat, talk.final, !!finish.error) };
}

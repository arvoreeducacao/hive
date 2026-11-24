const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rowsOf(text) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let event = null;
    try { event = JSON.parse(line); } catch { continue; }
    if (event && typeof event === "object" && !Array.isArray(event)) rows.push({ line, event });
  }
  return rows;
}

export const rowsText = (rows) => (rows.length ? `${rows.map((row) => row.line).join("\n")}\n` : "");

export function chainUuidOf(event) {
  if (!event || event.parent_tool_use_id) return "";
  if (event.type !== "assistant" && !(event.type === "user" && event.subtype !== "say")) return "";
  return typeof event.uuid === "string" && UUID.test(event.uuid) ? event.uuid : "";
}

const isSay = (event) => event?.type === "user" && event.subtype === "say";

const wordsOf = (event) => (Array.isArray(event?.message?.content) ? event.message.content : [])
  .filter((block) => block?.type === "text" && typeof block.text === "string")
  .map((block) => block.text)
  .join("\n")
  .trim();

function lastChainBefore(rows, end) {
  for (let at = end - 1; at >= 0; at--) {
    const id = chainUuidOf(rows[at].event);
    if (id) return id;
  }
  return "";
}

const tiedTo = (event, cids) => !!event.cid && cids.has(event.cid) && (isSay(event) || event.type === "driver");

function turnOpenAt(rows, end) {
  for (let at = end - 1; at >= 0; at--) {
    const event = rows[at].event;
    if (event.type === "result") return false;
    if (chainUuidOf(event)) return true;
  }
  return false;
}

export function rewindCut(rows, seq) {
  const at = rows.findIndex((row) => row.event.seq === seq);
  const said = rows[at]?.event;
  if (!isSay(said) || said.from) return { error: "that message is not one this chat can go back to" };
  const entered = said.cid
    ? Math.max(at, rows.findIndex((row, i) => i > at && row.event.type === "driver" && row.event.subtype === "dispatched" && row.event.cid === said.cid))
    : at;
  if (turnOpenAt(rows, entered)) return { error: "that message went into a turn that was still running — go back to the message that started it" };
  const dropped = new Set(rows.slice(at).filter((row) => isSay(row.event) && row.event.cid).map((row) => row.event.cid));
  const keep = rows.slice(0, entered).filter((row, i) => row.event.type !== "stream_event" && (i < at || (!isSay(row.event) && !tiedTo(row.event, dropped))));
  const words = wordsOf(said);
  const images = (Array.isArray(said.images) ? said.images : []).filter((one) => typeof one === "string");
  return {
    keep,
    upTo: lastChainBefore(rows, entered),
    text: words === "(image)" && images.length ? "" : words,
    images,
    at: Date.parse(rows[entered].event.ts || said.ts || "") || 0
  };
}

export function forkCut(rows, seq) {
  const at = rows.findIndex((row) => row.event.seq === seq);
  if (at < 0) return { error: "that answer is not in this chat any more" };
  const end = rows.findIndex((row, i) => i >= at && row.event.type === "result");
  if (end < 0) return { error: "that answer is still being written — fork it when the turn ends" };
  const upTo = lastChainBefore(rows, end + 1);
  if (!upTo) return { error: "there is nothing in that answer to fork from" };
  const later = new Set(rows.slice(end + 1).filter((row) => row.event.type === "driver" && row.event.subtype === "dispatched" && row.event.cid).map((row) => row.event.cid));
  const keep = rows.slice(0, end + 1).filter((row) => row.event.type !== "stream_event" && !tiedTo(row.event, later));
  return { keep, upTo, last: Math.max(0, ...keep.map((row) => Number(row.event.seq) || 0)) };
}

export function forkAliases(transcript) {
  const aliases = new Map();
  for (const line of String(transcript || "").split("\n")) {
    if (!line.includes("forkedFrom")) continue;
    let entry = null;
    try { entry = JSON.parse(line); } catch { continue; }
    const was = entry?.forkedFrom?.messageUuid;
    if (typeof was === "string" && typeof entry.uuid === "string") aliases.set(was, entry.uuid);
  }
  return aliases;
}

export function withUuids(rows, aliases) {
  if (!aliases?.size) return rows;
  return rows.map((row) => {
    const next = chainUuidOf(row.event) && aliases.get(row.event.uuid);
    if (!next) return row;
    const event = { ...row.event, uuid: next };
    return { line: JSON.stringify(event), event };
  });
}

export async function forkSessionAt({ fork, sessionId, dir = "", upTo, title = "", read = async () => "" }) {
  if (!sessionId) throw new Error("this chat has no conversation on record to go back in");
  const asked = { upToMessageId: upTo, ...(title ? { title } : {}) };
  let forked = null;
  try {
    forked = await fork(sessionId, dir ? { ...asked, dir } : asked);
  } catch (wrong) {
    if (!dir || !/not found/i.test(String(wrong?.message || wrong))) throw wrong;
    forked = await fork(sessionId, asked);
  }
  const id = String(forked?.sessionId || "");
  if (!id) throw new Error("the conversation was copied but came back with no session");
  let transcript = "";
  try { transcript = await read(id); } catch {}
  return { sessionId: id, aliases: forkAliases(transcript) };
}

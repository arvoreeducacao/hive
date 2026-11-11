import { phrase } from "./core.js";
import { svConvKey, svConvPush, svConvShow } from "./conversation-model.js";

const MEMORY_PATH = /[\\/]\.claude[\\/]projects[\\/]([^\\/]+)[\\/]memory[\\/]([^\\/]+\.md)$/;
const CREATED = /^\s*File created successfully/i;
const FENCE = "---";
const SCOPES = ["team", "personal"];

function frontOf(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== FENCE) return new Map();
  const closing = lines.indexOf(FENCE, 1);
  const fields = new Map();
  let parent = null;
  for (const line of lines.slice(1, closing < 0 ? 0 : closing)) {
    const nested = /^\s+([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (nested) { if (parent) fields.set(`${parent}.${nested[1]}`, unquote(nested[2])); continue; }
    const top = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (!top) continue;
    parent = top[2].trim() === "" ? top[1] : null;
    fields.set(top[1], unquote(top[2]));
  }
  return fields;
}

function unquote(value) {
  const text = String(value).trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) { try { return JSON.parse(text); } catch { return text.slice(1, -1); } }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1);
  return text;
}

function memoryWriteOf(name, input) {
  if (name !== "Write" || !input || typeof input !== "object") return null;
  const found = MEMORY_PATH.exec(String(input.file_path || ""));
  if (!found || found[2] === "MEMORY.md" || found[2].startsWith(".")) return null;
  const fields = frontOf(input.content);
  const scope = fields.get("metadata.scope") ?? fields.get("scope") ?? "";
  return {
    id: `${found[1]}/${found[2]}`,
    file: found[2],
    name: String(fields.get("name") || found[2].replace(/\.md$/, "")).slice(0, 200),
    description: String(fields.get("description") || "").replace(/\s+/g, " ").slice(0, 300),
    scope: SCOPES.includes(scope) ? scope : ""
  };
}

const createdByWrite = (text, result) => result?.type === "create" || CREATED.test(String(text || ""));

const freshTurn = () => ({ pending: new Map(), created: [] });

function sawToolUse(turn, block) {
  if (block?.type !== "tool_use") return;
  const memory = memoryWriteOf(block.name, block.input);
  if (memory) turn.pending.set(block.id, memory);
}

function resultText(content) {
  if (typeof content === "string") return content;
  return (Array.isArray(content) ? content : []).filter((one) => one?.type === "text").map((one) => one.text).join("\n");
}

function sawToolResult(turn, block, result) {
  if (block?.type !== "tool_result" || !turn.pending.has(block.tool_use_id)) return;
  const memory = turn.pending.get(block.tool_use_id);
  turn.pending.delete(block.tool_use_id);
  if (block.is_error || !createdByWrite(resultText(block.content), result)) return;
  const at = turn.created.findIndex((one) => one.id === memory.id);
  if (at >= 0) turn.created[at] = memory;
  else turn.created.push(memory);
}

function endTurn(turn) {
  const created = turn.created;
  turn.pending.clear();
  turn.created = [];
  return created;
}

const scopeSay = (scope) => (scope === "team" ? phrase("Team") : scope === "personal" ? phrase("Personal") : phrase("no scope"));

function itemModel(memory) {
  return { key: memory.id, ...memory, gone: false, busy: false, entry: "", error: "", scopeSay: scopeSay(memory.scope) };
}

function memoryTurnBlock(e, memories) {
  return {
    key: svConvKey(e),
    kind: "memturn",
    head: memories.length === 1 ? phrase("1 new memory in this turn") : phrase("{n} new memories in this turn", { n: memories.length }),
    foot: phrase("Left alone, they stay as they are."),
    scopeHint: phrase("click to switch between team and personal"),
    dropSay: phrase("Delete"),
    undoSay: phrase("Undo"),
    goneSay: phrase("deleted"),
    openSay: phrase("open in the memories panel"),
    items: memories.map(itemModel)
  };
}

function memoryTurnSaw(e, ev) {
  if (ev.parent_tool_use_id) return;
  const turn = (e.memTurn ||= freshTurn());
  const content = Array.isArray(ev.message?.content) ? ev.message.content : [];
  if (ev.type === "assistant") for (const block of content) sawToolUse(turn, block);
  if (ev.type === "user") for (const block of content) sawToolResult(turn, block, ev.tool_use_result);
}

async function post(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let said = {};
    try { said = await r.json(); } catch {}
    return { ok: r.ok, body: said || {} };
  } catch {
    return { ok: false, body: {} };
  }
}

async function refreshTurnBlock(e, block) {
  const said = await post("/api/memories/mine/status", { ids: block.items.map((one) => one.id) });
  if (!said.ok || !said.body?.memories) return;
  block.items = block.items.filter((one) => !said.body.memories[one.id]?.gone);
  for (const one of block.items) {
    const seen = said.body.memories[one.id];
    if (seen && typeof seen.scope === "string") { one.scope = seen.scope; one.scopeSay = scopeSay(one.scope); }
  }
  if (!block.items.length) {
    const at = e.conv.blocks.indexOf(block);
    if (at >= 0) e.conv.blocks.splice(at, 1);
  }
  svConvShow(e);
}

function memoryTurnEnded(e) {
  const created = endTurn(e.memTurn ||= freshTurn());
  if (!created.length || !e.conv || (e.where && e.where !== "local")) return null;
  const block = svConvPush(e, memoryTurnBlock(e, created));
  setTimeout(() => { if (e.conv.blocks.includes(block)) void refreshTurnBlock(e, block); }, 0);
  return block;
}

function heldItem(e, shown, item) {
  const block = e.conv?.blocks.find((one) => one.key === shown.key && one.kind === "memturn");
  return block ? block.items.find((one) => one.id === item.id) || null : null;
}

const failedSay = () => phrase("did not save — try again in the memories panel");

async function memoryTurnScope(e, shown, item) {
  const one = heldItem(e, shown, item);
  if (!one || one.busy) return;
  const scope = one.scope === "team" ? "personal" : "team";
  one.busy = true;
  one.error = "";
  svConvShow(e);
  const said = await post("/api/memories/mine/scope", { id: one.id, scope });
  one.busy = false;
  if (said.ok) { one.scope = scope; one.scopeSay = scopeSay(scope); } else one.error = failedSay();
  svConvShow(e);
}

async function memoryTurnDrop(e, shown, item) {
  const one = heldItem(e, shown, item);
  if (!one || one.busy) return;
  one.busy = true;
  one.error = "";
  svConvShow(e);
  const said = await post("/api/memories/mine/delete", { id: one.id });
  one.busy = false;
  if (said.ok) { one.gone = true; one.entry = said.body?.entry || ""; } else one.error = failedSay();
  svConvShow(e);
}

async function memoryTurnUndo(e, shown, item) {
  const one = heldItem(e, shown, item);
  if (!one || one.busy || !one.entry) return;
  one.busy = true;
  svConvShow(e);
  const said = await post("/api/memories/mine/undo", { entry: one.entry });
  one.busy = false;
  if (said.ok) { one.gone = false; one.entry = ""; one.error = ""; } else one.error = failedSay();
  svConvShow(e);
}

export { createdByWrite, endTurn, freshTurn, memoryTurnBlock, memoryTurnDrop, memoryTurnEnded, memoryTurnSaw, memoryTurnScope, memoryTurnUndo, memoryWriteOf, sawToolResult, sawToolUse };

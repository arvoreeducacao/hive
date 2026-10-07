import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOOL_NAMES = {
  bash: "shell",
  shell: "shell",
  read: "read",
  write: "edit",
  edit: "edit",
  multiedit: "edit",
  grep: "search",
  glob: "search",
  websearch: "search",
  webfetch: "web_fetch",
  todowrite: "plan",
};

const PROMPT_HEAD = 120;
const POLL_MS = 700;
const CHUNK_BYTES = 128 * 1024;
const HEADER_LINES = 24;

export function kimiHome(env = process.env) {
  return env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
}

export function subagentToolName(name) {
  const said = String(name || "").trim();
  if (/^mcp__/.test(said)) return said;
  return TOOL_NAMES[said.toLowerCase()] || said.toLowerCase() || "tool";
}

export function subagentToolInput(name, args) {
  if (!args || typeof args !== "object") return { description: String(name || "tool") };
  if (name === "shell" && typeof args.command === "string") return { command: args.command };
  const path = args.path || args.file_path || args.file;
  if ((name === "read" || name === "edit") && typeof path === "string") return { file_path: path };
  return args;
}

export function launchedSubagent(block) {
  const input = block?.input;
  if (!input || typeof input !== "object") return null;
  const resume = typeof input.resume === "string" ? input.resume.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!resume && !prompt) return null;
  if (!resume && !input.subagent_type && !input.description) return null;
  return { parentId: block.id, prompt, resume };
}

export function sessionDirOf(indexText, sessionId) {
  if (!sessionId) return "";
  let found = "";
  for (const line of String(indexText || "").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.sessionId === sessionId && row?.sessionDir) found = row.sessionDir;
  }
  return found;
}

export function promptOfWire(text) {
  for (const line of String(text || "").split("\n")) {
    if (!line.includes("turn.prompt")) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.type !== "turn.prompt") continue;
    return (row.input || []).map((piece) => (piece?.type === "text" ? piece.text || "" : "")).join("");
  }
  return "";
}

export function promptCarries(bornWith, prompt) {
  const said = String(prompt || "").trim();
  if (!said || !bornWith) return false;
  return String(bornWith).includes(said.slice(0, PROMPT_HEAD));
}

export function wireMatchesPrompt(wireText, prompt) {
  return promptCarries(promptOfWire(wireText), prompt);
}

export function subagentEvents(parentId, agentId, row) {
  const event = row?.event;
  if (row?.type !== "context.append_loop_event" || !event) return [];
  const idOf = (callId) => `${agentId}:${callId}`;
  if (event.type === "tool.call" && event.toolCallId) {
    const name = subagentToolName(event.name);
    return [{
      type: "assistant",
      message: { role: "assistant", content: [{ type: "tool_use", id: idOf(event.toolCallId), name, input: subagentToolInput(name, event.args) }] },
      parent_tool_use_id: parentId,
    }];
  }
  if (event.type === "tool.result" && event.toolCallId) {
    const output = event.result?.output;
    return [{
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: idOf(event.toolCallId), content: typeof output === "string" ? output : JSON.stringify(output ?? ""), is_error: !!event.result?.isError }] },
      parent_tool_use_id: parentId,
    }];
  }
  if (event.type === "content.part" && event.part?.type === "text") {
    const text = String(event.part.text || "").trim();
    if (!text) return [];
    return [{ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] }, parent_tool_use_id: parentId }];
  }
  return [];
}

export function wireIsOver(row) {
  return row?.type === "turn.ended" || row?.type === "prompt.completed";
}

export async function promptOfFile(path, { lines = HEADER_LINES, chunk = CHUNK_BYTES } = {}) {
  const handle = await open(path, "r");
  try {
    const size = (await handle.stat()).size;
    const buffer = Buffer.alloc(chunk);
    let at = 0;
    let rest = "";
    let read = 0;
    while (at < size && read < lines) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunk, size - at), at);
      if (!bytesRead) break;
      at += bytesRead;
      const whole = (rest + buffer.toString("utf8", 0, bytesRead)).split("\n");
      rest = whole.pop() || "";
      for (const line of whole) {
        read += 1;
        if (!line.includes("turn.prompt")) continue;
        const said = promptOfWire(line);
        if (said) return said;
      }
    }
    return "";
  } finally {
    await handle.close();
  }
}

async function readFrom(path, offset) {
  const handle = await open(path, "r");
  try {
    const size = (await handle.stat()).size;
    if (size <= offset) return { text: "", offset };
    const length = size - offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    return { text: buffer.toString("utf8"), offset: size };
  } finally {
    await handle.close();
  }
}

const asked = (value, fallback) => {
  const said = typeof value === "function" ? value() : value;
  return said === undefined || said === null ? fallback : said;
};

export function subagentWatcher({ sessionId, env = process.env, emit, onTrouble = () => {}, pollMs = POLL_MS } = {}) {
  const waiting = [];
  const bound = new Map();
  const claimed = new Set();
  const born = new Map();
  let dir = "";
  let dirFor = "";
  let timer = null;
  let stopped = false;
  let complained = false;

  const trouble = (message) => {
    if (complained) return;
    complained = true;
    onTrouble(message);
  };

  async function findDir() {
    const now = String(asked(sessionId, "") || "");
    if (!now) return "";
    if (dir && dirFor === now) return dir;
    const index = await readFile(join(kimiHome(asked(env, process.env)), "session_index.jsonl"), "utf8");
    dir = sessionDirOf(index, now);
    dirFor = now;
    return dir;
  }

  async function adopt(agentId, parentId, offset) {
    const path = join(dir, "agents", agentId, "wire.jsonl");
    bound.set(agentId, { parentId, path, offset, rest: "" });
    claimed.add(agentId);
  }

  async function bornWith(agentId) {
    if (born.has(agentId)) return born.get(agentId);
    const said = await promptOfFile(join(dir, "agents", agentId, "wire.jsonl"));
    if (said) born.set(agentId, said);
    return said;
  }

  async function bindWaiting() {
    if (!waiting.length) return;
    let names = [];
    try {
      names = (await readdir(join(dir, "agents"))).filter((one) => one !== "main" && !claimed.has(one));
    } catch { return; }
    for (const agentId of names.sort()) {
      let said = "";
      try { said = await bornWith(agentId); } catch { continue; }
      if (!said) continue;
      const i = waiting.findIndex((one) => promptCarries(said, one.prompt));
      if (i < 0) continue;
      const [pending] = waiting.splice(i, 1);
      await adopt(agentId, pending.parentId, 0);
    }
  }

  async function drain(agentId, held) {
    const { text, offset } = await readFrom(held.path, held.offset);
    held.offset = offset;
    if (!text) return;
    const lines = (held.rest + text).split("\n");
    held.rest = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      for (const event of subagentEvents(held.parentId, agentId, row)) emit(event);
      if (wireIsOver(row)) bound.delete(agentId);
    }
  }

  async function tick() {
    if (stopped) return;
    try {
      if (!waiting.length && !bound.size) return;
      if (!(await findDir())) return;
      await bindWaiting();
      for (const [agentId, held] of [...bound]) {
        try { await drain(agentId, held); } catch { bound.delete(agentId); }
      }
    } catch (e) {
      trouble(`kimi subagent progress is off for this seat: ${String(e?.message || e)}`);
    } finally {
      if (!stopped) timer = setTimeout(tick, pollMs);
    }
  }

  function start() {
    if (timer || stopped) return;
    timer = setTimeout(tick, pollMs);
  }

  return {
    launched(block) {
      const found = launchedSubagent(block);
      if (!found) return false;
      if (found.resume) {
        findDir()
          .then(async (where) => {
            if (!where) return;
            const path = join(where, "agents", found.resume, "wire.jsonl");
            const size = await stat(path).then((s) => s.size).catch(() => 0);
            bound.set(found.resume, { parentId: found.parentId, path, offset: size, rest: "" });
          })
          .catch(() => {});
      } else {
        waiting.push({ parentId: found.parentId, prompt: found.prompt });
      }
      start();
      return true;
    },
    turnEnded() {
      waiting.length = 0;
      bound.clear();
      claimed.clear();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    get watching() {
      return bound.size;
    },
  };
}

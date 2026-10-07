import { loadTransferContext } from "./transfer-context.mjs";
import { writeFile, open, stat, rm } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { missionImagesFile, parseCommand } from "./protocol.mjs";

export function aFullPaneMustNeverWedgeTheSeat() {
  for (const stream of [process.stdout, process.stderr]) {
    try { stream._handle?.setBlocking?.(false); } catch {}
  }
}

export function arg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export async function tailOfFile(file, bytes = 65536) {
  try {
    const { size } = await stat(file);
    const fh = await open(file, "r");
    try {
      const start = Math.max(0, size - bytes);
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      return buf.toString("utf8");
    } finally {
      await fh.close();
    }
  } catch {
    return "";
  }
}

export function makeWarnOnce(deliver) {
  const said = new Set();
  return (message) => {
    if (said.has(message)) return false;
    said.add(message);
    deliver(message);
    return true;
  };
}

export function makeEventsTrouble(eventsFile, speak = (line) => console.error(line)) {
  const once = makeWarnOnce(speak);
  let broken = false;
  return {
    get broken() { return broken; },
    note(error) {
      broken = true;
      once(`the events file stopped taking writes — the transcript is no longer being recorded (${eventsFile}): ${String(error?.message || error)}`);
    },
  };
}

export function makeSessionStore(sessionFile, initial = {}, tell = () => {}, write = writeFile) {
  let meta = initial;
  /* two writes racing on one file let the loser land last: a persist carrying
     the old model would overwrite the one that carried the new pick, and the
     seat came back on the model it had just left. Same chain the event append
     uses, for the same reason. */
  let writeChain = Promise.resolve();
  return {
    get meta() { return meta; },
    flush() { return writeChain; },
    persist(patch) {
      meta = { ...meta, ...patch, updated: new Date().toISOString() };
      const line = JSON.stringify(meta, null, 2);
      writeChain = writeChain.then(() => write(sessionFile, line)).catch((e) => tell(e));
      return writeChain;
    },
  };
}

export function createSeatServer({ sockFile, handleCommand, emit, leave, store, flush = async () => {} }) {
  let transferring = !!store?.meta.provider_switching;
  const receive = (cmd, reply) => {
    if (cmd.type === "control" && cmd.op === "releaseTransfer") {
      transferring = false;
      if (cmd.provider) {
        emit({ type: "driver", subtype: "provider_changed", agent: cmd.provider, model: cmd.model || "" });
        emit({ type: "result", subtype: "provider_ready", is_error: false, num_turns: 0 });
      }
      Promise.resolve(store?.persist({ provider_switching: false })).then(() => reply({ ok: true }));
      return;
    }
    if (cmd.type === "control" && cmd.op === "prepareTransfer") {
      return handleCommand({ type: "state" }, (state) => {
        const waiting = !!state.working || !!state.queued || !!state.questions?.length || !!state.expecting?.length;
        if (state.events_write_failed) return reply({ ok: false, error: "the conversation is not being saved; fix the recording before changing providers" });
        if (!waiting) transferring = true;
        Promise.resolve(flush()).then(() => reply({ ok: true, data: { waiting } }), (error) => reply({ ok: false, error: String(error) }));
      });
    }
    if (cmd.type === "control" && cmd.op === "transferStop" && leave) {
      reply({ ok: true });
      void leave("provider transfer", 0);
      return;
    }
    if (transferring && cmd.type !== "state" && !(cmd.type === "control" && cmd.op === "catalog")) return reply({ ok: false, error: "this chat is changing providers; send the message when it finishes" });
    if (cmd.type === "record") {
      const note = cmd.event;
      if (!note || typeof note !== "object" || Array.isArray(note) || note.type !== "driver" || typeof note.subtype !== "string" || !note.subtype) return reply({ ok: false, error: "a record carries one driver event" });
      return reply({ ok: true, seq: emit(note) });
    }
    if (cmd.type === "say") {
      try { loadTransferContext(store); }
      catch { return reply({ ok: false, error: "the transferred context cannot be read; restore it before continuing this chat" }); }
    }
    return handleCommand(cmd, reply);
  };
  const server = createServer((conn) => {
    let buf = "";
    conn.on("data", (data) => {
      buf += data;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const reply = (obj) => { try { conn.write(JSON.stringify(obj) + "\n"); } catch {} };
        const cmd = parseCommand(line);
        if (!cmd) { reply({ ok: false, error: "unparseable command" }); continue; }
        try { receive(cmd, reply); } catch (e) { reply({ ok: false, error: String(e?.message || e) }); }
      }
    });
    conn.on("error", () => {});
  });
  server.on("error", (e) => {
    emit({ type: "driver", subtype: "error", error: `socket ${sockFile}: ${String(e?.message || e)}` });
    process.exit(1);
  });
  server.listen(sockFile);
  return server;
}

export function aBirthCarriesAMission({ promptFile, resumeId } = {}) {
  return !!promptFile && !resumeId;
}

export function missionShots(promptFile = "") {
  const beside = promptFile ? missionImagesFile(promptFile) : "";
  if (!beside || !existsSync(beside)) return [];
  try {
    const held = JSON.parse(readFileSync(beside, "utf8"));
    return Array.isArray(held) ? held.filter((one) => typeof one === "string") : [];
  } catch { return []; }
}

export async function forgetWhatTheNameHeld({ sessionFile, eventsFile, shotsDir } = {}, forget = rm) {
  let held = false;
  for (const path of [sessionFile, eventsFile]) {
    if (!path) continue;
    try {
      await stat(path);
      held = true;
    } catch { continue; }
    await forget(path, { force: true });
  }
  if (shotsDir) await forget(shotsDir, { force: true, recursive: true }).catch(() => {});
  return held;
}

export const DIRS_KEPT = 32;

export function workedIn(dirs, dir, kept = DIRS_KEPT) {
  if (typeof dir !== "string" || !dir.startsWith("/")) return dirs;
  if (dirs[dirs.length - 1] === dir) return dirs;
  return [...dirs.filter((one) => one !== dir), dir].slice(-kept);
}

export function makeDirsTrail(initial, persist) {
  let dirs = Array.isArray(initial) ? initial.filter((one) => typeof one === "string") : [];
  return {
    get dirs() { return dirs; },
    note(...found) {
      const next = found.reduce((so, dir) => workedIn(so, dir), dirs);
      if (next === dirs) return;
      dirs = next;
      persist({ dirs });
    },
  };
}

const TOOL_DIR_FIELDS = ["cwd", "workdir", "directory"];
const TOOL_FILE_FIELDS = ["file_path", "filePath", "notebook_path"];
const TOOL_EITHER_FIELDS = ["path"];

function placeIn(cwd, value) {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\r\n]/.test(value)) return "";
  if (!value.startsWith("/") && !cwd?.startsWith("/")) return "";
  return resolve(cwd || "/", value);
}

function folderOf(path, endsWithSlash) {
  if (endsWithSlash) return path;
  try { return statSync(path).isDirectory() ? path : dirname(path); } catch { return dirname(path); }
}

export function inputDirs(input, cwd) {
  if (!input || typeof input !== "object") return [];
  const found = [];
  for (const field of TOOL_DIR_FIELDS) {
    const at = placeIn(cwd, input[field]);
    if (at) found.push(at);
  }
  for (const field of TOOL_FILE_FIELDS) {
    const at = placeIn(cwd, input[field]);
    if (at) found.push(dirname(at));
  }
  for (const field of TOOL_EITHER_FIELDS) {
    const at = placeIn(cwd, input[field]);
    if (at) found.push(folderOf(at, String(input[field]).endsWith("/")));
  }
  return found;
}

export function toolDirs(event, cwd) {
  if (event?.type !== "assistant" || !Array.isArray(event.message?.content)) return [];
  return event.message.content.flatMap((block) => (block?.type === "tool_use" ? inputDirs(block.input, cwd) : []));
}

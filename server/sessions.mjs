import { providerCatalog } from "./provider-catalog.mjs";
import { createProviderTransfers, providerTransferWaiting, unsupportedTransferControl } from "./provider-transfer.mjs";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { followEvents, oneshot, slimEvent, tailWindow, trimForPhone, humanWindow } from "./bridge.mjs";
import { readHistory } from "./events-tail.mjs";
import { sideOf, tmuxSession, seatSockPath, isSeatNamedPipe } from "./engine/paths.mjs";
import { reapSeat } from "./engine/leftovers.mjs";
import { runShellLine } from "./shell-line.mjs";

export const SEAT_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const HOLD_THE_SESSION = "sleep 2147483647";
export const COMMAND_TIMEOUT = 30000;
export const WINDOW_TIMEOUT = 15000;
export const IDLE_TAIL = 3;
export const ALIVE_TIMEOUT = 1500;
export const GLANCE_BYTES = 128 * 1024;
export const GLANCE_CEILING = 4 * 1024 * 1024;
export const PHONE_TAIL = { turns: 3, floor: 200, ceiling: 400000 };
export const DESK_TAIL_TURNS = 5;
export const EARLIER_TURNS = 5;

const historyTotals = new Map();

export const isSeatName = (name) => SEAT_NAME.test(String(name || ""));

export function seatsToReconnect(names, readMeta, except = "") {
  const sent = [];
  const skipped = [];
  for (const name of names) {
    if (name === except) continue;
    if (readMeta(name)?.asleep) { skipped.push(name); continue; }
    sent.push(name);
  }
  return { sent, skipped };
}

export function readSessionMeta(text) {
  try {
    const held = JSON.parse(String(text || ""));
    return held && typeof held === "object" ? held : {};
  } catch {
    return {};
  }
}

const AMBIENT_EVENTS = new Set(["stream_event", "system", "rate_limit_event", "memory"]);
const TURNLESS_DRIVER_NOTES = new Set(["provider_changed", "shell", "started", "presence", "mcp_gateway", "mcp_peer", "mcp_routed"]);
const RECONNECT_TIMEOUT = 20000;

export const marksTurn = (event) => !AMBIENT_EVENTS.has(event.type) && !(event.type === "driver" && TURNLESS_DRIVER_NOTES.has(event.subtype));

export function glanceAt(chunk, { whole = true } = {}) {
  const lines = String(chunk ?? "").split("\n");
  if (!whole) lines.shift();
  let seq = 0;
  let last = null;
  let sawAny = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    let event = null;
    try { event = JSON.parse(line); } catch { continue; }
    sawAny = true;
    if (Number.isFinite(event.seq)) seq = Math.max(seq, event.seq);
    if (marksTurn(event)) last = event;
  }
  return { seq, last: last || (sawAny ? { type: "stream_event" } : null) };
}

export function glanceFile(file, ceiling = GLANCE_BYTES) {
  let fd = 0;
  try {
    fd = openSync(file, "r");
    const { size } = fstatSync(fd);
    for (const reach of ceiling >= size ? [size] : [ceiling, GLANCE_CEILING, size]) {
      const from = Math.max(0, size - reach);
      const buf = Buffer.alloc(size - from);
      if (buf.length) readSync(fd, buf, 0, buf.length, from);
      const seen = glanceAt(buf.toString("utf8"), { whole: from === 0 });
      if (from === 0 || seen.last?.type !== "stream_event") return seen;
    }
    return { seq: 0, last: null };
  } catch {
    return { seq: 0, last: null };
  } finally {
    if (fd) {
      try { closeSync(fd); } catch {}
    }
  }
}

export function stateOfSeat({ alive, lastEvent }) {
  if (!alive) return "closed";
  if (!lastEvent) return "starting";
  if (lastEvent.type === "result") return "idle";
  /* only a plan that is being held has an id: it is the one the person has to answer. */
  if (lastEvent.subtype === "question" || (lastEvent.subtype === "plan" && lastEvent.id)) return "asking";
  if (lastEvent.type === "driver" && lastEvent.subtype === "slept") return "idle";
  return "working";
}

export const AGENTS = new Set(["claude", "opencode", "codex", "kimi", "kiro", "cursor"]);

export function agentOf(asked) {
  const one = String(asked || "claude").trim().toLowerCase();
  return AGENTS.has(one) ? one : "";
}

export function driverFileFor(agent) {
  if (agent === "codex") return "codex-driver.mjs";
  if (agent === "kimi") return "kimi-driver.mjs";
  if (agent === "kiro") return "kiro-driver.mjs";
  if (agent === "cursor") return "cursor-driver.mjs";
  if (agent === "opencode") return "opencode-driver.mjs";
  if (agent && agent !== "claude") return "turn-driver.mjs";
  return "driver.mjs";
}

export function driverFor(driver, agent) {
  return driver.replace(/driver\.mjs$/, driverFileFor(agent));
}

export function driverArgs({ name, cwd, model, promptFile, resumeId, sessionId, agent = "claude" }) {
  const args = agent && agent !== "claude" ? ["--agent", agent, "--name", name] : ["--name", name];
  if (cwd) args.push("--cwd", cwd);
  if (model) args.push("--model", model);
  if (promptFile) args.push("--prompt-file", promptFile);
  if (resumeId) args.push("--resume-id", resumeId);
  else if (sessionId) args.push("--session-id", sessionId);
  return args;
}

export const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,.\/-]+$/;

export function quoteForShell(word) {
  const one = String(word);
  return SHELL_SAFE.test(one) ? one : `'${one.replace(/'/g, "'\\''")}'`;
}

export function windowCommand({ node, driver, args, cwd }) {
  const line = [node, driver, ...args].map(quoteForShell).join(" ");
  return cwd ? `cd ${quoteForShell(cwd)} && exec ${line}` : `exec ${line}`;
}

export function seatWindowsWanted(env = process.env) {
  const asked = env.HIVE_SEAT_WINDOWS;
  return asked === "1" || asked === "true";
}

export function seatWindowSession(base, env = process.env) {
  return env.HIVE_TMUX_SESSION || tmuxSession(sideOf(base));
}

function settled(child, within) {
  return new Promise((done) => {
    const timer = setTimeout(() => done(null), within);
    timer.unref?.();
    child.on("exit", (code) => { clearTimeout(timer); done(code ?? 0); });
    child.on("error", () => { clearTimeout(timer); done(1); });
  });
}

export function nameFromArgs(args) {
  const at = args.indexOf("--name");
  return at < 0 ? "" : String(args[at + 1] || "");
}

export function createSessions({
  base,
  driver,
  onEvent = () => {},
  transferStart = null,
  transferStop = null,
  transferSignal = null,
  transferValidate = null,
  transferChanged = () => {},
  launch = null,
  windows = seatWindowsWanted(),
  windowSession = null,
  now = () => Date.now(),
  log = () => {}
} = {}) {
  const running = new Map();
  const follows = new Map();

  for (const dir of ["events", "sock", "sessions", "shots"]) mkdirSync(join(base, dir), { recursive: true });

  const eventsFileOf = (name) => join(base, "events", `${name}.ndjson`);
  const sockFileOf = (name) => seatSockPath(base, name);
  /* a named pipe never shows up in the filesystem, so existsSync cannot rule it
     out the way it rules out a dead unix-socket file — the connect itself is
     the only real test on win32 */
  const sockMightAnswer = (name) => isSeatNamedPipe(sockFileOf(name)) || existsSync(sockFileOf(name));
  const metaFileOf = (name) => join(base, "sessions", `${name}.json`);

  const session = windowSession || seatWindowSession(base);

  const bare = (args, options) => {
    const engine = args[0] === "--agent" ? args[1] : "claude";
    return spawn(process.execPath, [driverFor(driver, engine), ...args], options);
  };

  const windowed = (args, options) => {
    const engine = args[0] === "--agent" ? args[1] : "claude";
    const name = nameFromArgs(args);
    const command = windowCommand({ node: process.execPath, driver: driverFor(driver, engine), args, cwd: options.cwd });
    spawnSync("tmux", ["new-session", "-d", "-s", session, "-n", "hub", HOLD_THE_SESSION], { stdio: "ignore" });
    return spawn("tmux", ["new-window", "-d", "-t", session, "-n", name, command], { ...options, cwd: undefined, stdio: ["ignore", "pipe", "pipe"] });
  };

  const start = launch || (windows ? windowed : bare);

  function watch(name) {
    if (follows.has(name)) return;
    const held = { seq: 0, last: null };
    const tail = followEvents(eventsFileOf(name), 0, (line) => {
      let event = null;
      try { event = JSON.parse(line); } catch { return; }
      if (Number.isFinite(event.seq)) held.seq = Math.max(held.seq, event.seq);
      if (marksTurn(event)) held.last = event;
      onEvent(name, event);
    }, { window: "all", start: "end" });
    follows.set(name, { tail, held });
  }

  function forget(name) {
    const held = follows.get(name);
    if (!held) return;
    try { held.tail.stop(); } catch {}
    follows.delete(name);
  }

  function known() {
    let files = [];
    try { files = readdirSync(join(base, "sessions")); } catch {}
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter(isSeatName);
  }

  async function alive(name) {
    if (running.has(name)) return true;
    if (!sockMightAnswer(name)) return false;
    const said = await oneshot(sockFileOf(name), { type: "state" }, { timeoutMs: ALIVE_TIMEOUT });
    return !!said?.ok;
  }

  async function describe(name) {
    const meta = readSessionMeta(existsSync(metaFileOf(name)) ? readFileSync(metaFileOf(name), "utf8") : "");
    const live = await alive(name);
    const followed = follows.get(name)?.held;
    const seen = followed?.last ? followed : live ? glanceFile(eventsFileOf(name)) : { seq: 0, last: null };
    const held = { seq: Math.max(seen.seq, followed?.seq || 0), last: seen.last };
    return {
      name,
      cwd: meta.cwd || "",
      model: meta.model_id || meta.model || "",
      errand: meta.errand || "",
      mode: meta.mode === "plan" ? "plan" : "",
      title: meta.title || "",
      seq: held.seq,
      alive: live,
      state: stateOfSeat({ alive: live, lastEvent: held.last })
    };
  }

  const rawCommand = (name, cmd, timeoutMs = COMMAND_TIMEOUT) => oneshot(sockFileOf(name), { ...cmd, sent: now() }, { timeoutMs });
  const transfers = createProviderTransfers({
    base,
    command: rawCommand,
    validate: async (agent, model, name) => {
      if (transferValidate) return transferValidate(agent, model);
      const meta = readSessionMeta(readFileSync(metaFileOf(name), "utf8"));
      const models = await providerCatalog(agent, meta.cwd);
      if (!models.some((row) => row.value === model)) throw new Error("choose an available model from the picker");
    },
    changed: transferChanged,
    start: async (name, meta) => {
      if (transferStart) return transferStart(name, meta);
      const opened = await api.open({ name, agent: meta.agent, model: meta.model, cwd: meta.cwd, resumeId: meta.session_id });
      if (opened.error) throw new Error(opened.error);
    },
    stop: async (name) => {
      const state = await rawCommand(name, { type: "state" }, 1500);
      if (state?.ok) {
        const stopped = await rawCommand(name, { type: "control", op: "transferStop" }, 5000);
        if (!stopped?.ok) {
          try {
            if (!unsupportedTransferControl(stopped, "transferStop")) throw new Error(stopped?.error || "the old driver could not stop");
            if (providerTransferWaiting(await rawCommand(name, { type: "state" }, 1500))) throw new Error("the chat started working before the provider could change; finish this turn and select the model again");
            if (transferSignal) await transferSignal(name);
            else if (running.has(name)) {
              if (!running.get(name).kill("SIGTERM")) throw new Error("the old driver could not receive the shutdown signal");
            } else if (windows) {
              const signalled = spawnSync("tmux", ["send-keys", "-t", `${session}:=${name}`, "C-c"], { timeout: 5000, encoding: "utf8" });
              if (signalled.status !== 0) throw new Error("the old driver's window could not receive the shutdown signal");
            } else throw new Error("the old driver is not managed by this Hive; reopen this chat before changing providers");
          } catch (error) {
            error.sourceRunning = true;
            throw error;
          }
        }
        const deadline = now() + 15000;
        while ((await rawCommand(name, { type: "state" }, 500))?.ok) {
          if (now() > deadline) throw new Error("the old driver did not stop in time");
          await new Promise((done) => setTimeout(done, 100));
        }
      }
      if (transferStop) await transferStop(name);
      else await api.close(name);
    }
  });

  function startShell(name, cmd) {
    const command = String(cmd.command || "").trim();
    if (!command) return { ok: false, error: "nothing to run after the !" };
    if (!existsSync(metaFileOf(name))) return { ok: false, error: "no session by that name" };
    const meta = readSessionMeta(readFileSync(metaFileOf(name), "utf8"));
    const cid = typeof cmd.cid === "string" ? cmd.cid.slice(0, 80) : "";
    const quiet = !!cmd.quiet;
    watch(name);
    runShellLine({ command, cwd: meta.cwd, env: { ...process.env, HIVE_SEAT: name } }).then(async ({ ok, error, ...ran }) => {
      const event = ok
        ? { type: "driver", subtype: "shell", cid, ...ran, ...(error ? { error } : {}) }
        : { type: "driver", subtype: "shell", cid, command, cwd: meta.cwd || "", output: "", code: null, ms: 0, error };
      if (quiet) return onEvent(name, { ...event, quiet: true });
      const recorded = sockMightAnswer(name) ? await oneshot(sockFileOf(name), { type: "record", event, sent: now() }, { timeoutMs: 5000 }).catch(() => null) : null;
      if (!recorded?.ok) onEvent(name, { ...event, unrecorded: true });
    });
    return { ok: true, cid, quiet, started: true };
  }

  const api = {
    get watching() { return [...follows.keys()]; },
    alive,

    async list() {
      const all = await Promise.all(known().map(describe));
      for (const one of all) if (one.alive) watch(one.name);
      return all;
    },

    async one(name) {
      if (!isSeatName(name)) return { error: "that is not a name a seat can have" };
      if (!existsSync(metaFileOf(name)) && !existsSync(eventsFileOf(name))) return { error: "no session by that name" };
      watch(name);
      return describe(name);
    },

    async open({ name, cwd, model, promptFile, resumeId, sessionId, agent }) {
      if (!isSeatName(name)) return { error: "that is not a name a seat can have" };
      const engine = agentOf(agent);
      if (!engine) return { error: `"${agent}" is not an engine this server knows how to start` };
      if (await alive(name)) return { error: "that session is already running" };

      let child = null;
      try {
        child = start(driverArgs({ name, cwd, model, promptFile, resumeId, sessionId, agent: engine }), {
          cwd: cwd || undefined,
          env: { ...process.env, HIVE_STATE_DIR: base },
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (wrong) {
        return { error: `could not start that session: ${wrong.message}` };
      }
      if (!child) return { error: "could not start that session" };

      let noise = "";
      child.stderr?.on("data", (chunk) => { noise = (noise + chunk).slice(-500); });
      if (windows && !launch) {
        const code = await settled(child, WINDOW_TIMEOUT);
        if (code !== 0) {
          const said = noise.trim() || (code === null ? `tmux did not answer in ${Math.round(WINDOW_TIMEOUT / 1000)}s` : `tmux exited ${code}`);
          log(`session ${name} never got a window: ${said}`);
          return { error: `that session got no window: ${said}` };
        }
      } else {
        running.set(name, child);
        child.on("exit", (code) => {
          if (running.get(name) === child) running.delete(name);
          log(`session ${name} closed (code ${code}) ${noise.trim()}`.trim());
        });
      }

      watch(name);
      return { name, started: true };
    },

    async reconnectMcp(server, { except = "", timeoutMs = RECONNECT_TIMEOUT } = {}) {
      const metaOf = (name) => readSessionMeta(existsSync(metaFileOf(name)) ? readFileSync(metaFileOf(name), "utf8") : "");
      const plan = seatsToReconnect(known().filter(sockMightAnswer), metaOf, except);
      const answers = await Promise.allSettled(plan.sent.map((name) =>
        rawCommand(name, { type: "control", op: "mcpReconnect", server }, timeoutMs).then((said) => {
          if (!said?.ok) throw new Error(said?.error || "no answer");
          return name;
        })
      ));
      const reconnected = answers.filter((a) => a.status === "fulfilled").map((a) => a.value);
      const failed = plan.sent.filter((name) => !reconnected.includes(name));
      log(`mcp ${server}: reconnected ${reconnected.length} seat(s)${failed.length ? `, ${failed.length} did not answer (${failed.join(", ")})` : ""}, ${plan.skipped.length} asleep left alone`);
      return { reconnected, failed, asleep: plan.skipped };
    },

    async command(name, cmd, { timeoutMs = COMMAND_TIMEOUT } = {}) {
      if (!isSeatName(name)) return { ok: false, error: "that is not a name a seat can have" };
      if (cmd.type === "shell") return startShell(name, cmd);
      if (cmd.type === "control" && cmd.op === "providerCatalog") {
        const agent = agentOf(cmd.agent);
        if (!agent) return { ok: false, error: "unknown provider" };
        try {
          const meta = readSessionMeta(readFileSync(metaFileOf(name), "utf8"));
          return { ok: true, data: { models: await providerCatalog(agent, meta.cwd) } };
        } catch (error) { return { ok: false, error: String(error?.message || error) }; }
      }
      if (cmd.type === "control" && cmd.op === "transferStatus") return { ok: true, data: await transfers.restore(name) };
      if (cmd.type === "control" && cmd.op === "cancelTransfer") return transfers.cancel(name);
      if (cmd.type === "control" && cmd.op === "switchProvider") {
        const agent = agentOf(cmd.agent);
        if (!agent || typeof cmd.model !== "string" || !cmd.model || cmd.model.length > 200 || /[\x00-\x1f]/.test(cmd.model)) return { ok: false, error: "choose a provider and model from the picker" };
        watch(name);
        await transfers.restore(name);
        try { return await transfers.begin(name, agent, cmd.model); }
        catch (error) { return { ok: false, error: String(error?.message || error) }; }
      }
      if (transfers.busy(name) && transfers.status(name)?.phase !== "waiting" && !["state", "answer", "interrupt"].includes(cmd.type)) return { ok: false, error: "this chat is changing providers; send the message when it finishes" };
      if (!sockMightAnswer(name)) return { ok: false, error: "that session is not listening" };
      watch(name);
      return oneshot(sockFileOf(name), { ...cmd, sent: now() }, { timeoutMs });
    },

    async close(name) {
      if (!isSeatName(name)) return { ok: false, error: "that is not a name a seat can have" };
      const said = await this.command(name, { type: "control", action: "leave" }, { timeoutMs: 5000 });
      const child = running.get(name);
      if (child) {
        running.delete(name);
        try { child.kill(); } catch {}
      }
      if (windows && !launch) spawn("tmux", ["kill-window", "-t", `${session}:${name}`], { stdio: "ignore" });
      forget(name);
      try { rmSync(sockFileOf(name), { force: true }); } catch {}
      const swept = await reapSeat(name).catch(() => ({ asked: [], forced: [] }));
      const leftovers = { stopped: swept.asked.length, forced: swept.forced.length };
      return said?.ok ? { ok: true, leftovers } : { ok: true, forced: true, leftovers };
    },

    history(name, from = 0, { window = "all", turns = 0, before = 0 } = {}) {
      if (!isSeatName(name)) return { error: "that is not a name a seat can have" };
      watch(name);
      const file = eventsFileOf(name);
      if (!existsSync(file)) return { events: [], seq: 0 };
      const want = before > 0 ? { humanTurns: (turns || EARLIER_TURNS) + 1 }
        : !from && window === "tail" ? { results: PHONE_TAIL.turns + 1, floor: PHONE_TAIL.floor, weight: PHONE_TAIL.ceiling }
        : !from && window === "turns" ? { humanTurns: (turns || DESK_TAIL_TURNS) + 1 }
        : null;
      const read = readHistory(file, { from, before, want, cache: historyTotals });
      const seq = read.seq;
      const rows = read.rows.map(({ line, event }) => {
        const slim = slimEvent(event);
        return { line, event, slim: window === "tail" ? trimForPhone(slim) : slim };
      });
      const cut = before > 0 ? humanWindow(rows, turns || EARLIER_TURNS)
        : !from && window === "tail" ? tailWindow(rows, PHONE_TAIL)
        : !from && window === "turns" ? humanWindow(rows, turns || DESK_TAIL_TURNS)
        : { start: 0 };
      if (cut.total !== undefined && !read.whole) cut.total = window === "tail" && !before ? read.totals.results : read.totals.humans;
      const more = cut.start > 0 && (cut.total === 0 || cut.shown < cut.total);
      const events = [];
      if (more && !before) {
        events.push({
          type: "driver", subtype: "windowed",
          turns: cut.shown, turnsTotal: cut.total,
          events: rows.length - cut.start, eventsTotal: read.totals.rows
        });
      }
      for (let at = cut.start; at < rows.length; at++) events.push(rows[at].slim ?? rows[at].event);
      return { events, seq, earlier: more, first: rows[cut.start]?.event?.seq ?? 0 };
    },

    stop() {
      for (const name of [...follows.keys()]) forget(name);
      for (const child of running.values()) { try { child.kill(); } catch {} }
      running.clear();
    }
  };
  return api;
}

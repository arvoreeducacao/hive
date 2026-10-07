import { execFile } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { quoteForShell, seatCommand } from "./engine/seat-command.mjs";
import { writeHiveShellRc } from "./engine/hive-shell.mjs";
import { hiveRoot, hubDir, sideOf, stateDir as stateDirOf, workspaceRoot } from "./engine/paths.mjs";
import { prepareWorktree } from "./worktree.mjs";
import { driverFileFor } from "./sessions.mjs";
import { inlineImageMarks, missionImagesFile } from "./engine/protocol.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "engine");

export const HUB_WINDOW = "hub";
export const SETTLE_MS = 3000;
export const TMUX_TIMEOUT = 15000;
export const WINDOW_COLS = 200;
export const WINDOW_ROWS = 50;
export const HISTORY_LIMIT = 20000;
export const SCREEN_LINES = 4000;
export const WALL_LINES = 400;
export const DRIVER_HEAD = 6144;
export const DRIVER_TAIL = 16384;
export const KEPT_ACROSS_BINDS = ["title", "errand", "cwd", "model", "model_id", "mode"];
export const HOLD_THE_SESSION = "sleep 2147483647";

export const SEAT_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const MODEL_NAME = /^[A-Za-z0-9._/:[\]-]{1,120}$/;
export const TRANSCRIPT_ID = /^[0-9a-f-]{8,64}$/i;
/* codex and kiro name a session with a uuid, kimi with `session_<uuid>` — one shell word either way */
export const OWN_SESSION_ID = /^[A-Za-z0-9._-]{8,80}$/;

export const otherAgentOf = (seat) => (seat?.agent && seat.agent !== "claude" ? String(seat.agent) : "");
export const NO_SESSION = /no server running|no such file or directory|can't find session|session not found/i;

export const BLIND_TO_ITS_OWN_SEATS = (why) =>
  `this server could not read which seats it already runs, and bringing one back could open a second window under its name — ${why}`;

export const isSeatName = (name) => SEAT_NAME.test(String(name || ""));

export function sessionAfterBind(held, id) {
  const kept = {};
  for (const key of KEPT_ACROSS_BINDS) if (held?.[key]) kept[key] = held[key];
  return { ...kept, session_id: id };
}

export const SHELL_COMMANDS = new Set(["bash", "zsh", "sh", "fish"]);

export const KINDS = new Set(["chat", "classic", "structured", "shell"]);

export const ENDED_ON_ITS_OWN = "its shell ended on its own, so the seat closed";

export function kindOf(command, was = "") {
  if (SHELL_COMMANDS.has(String(command || ""))) return "shell";
  if (String(command || "") === "node") return was === "structured" ? "structured" : "classic";
  return "classic";
}

export function projectSlug(cwd) {
  return String(cwd || "").replace(/\//g, "-");
}

export function readNames(text) {
  const names = [];
  for (const line of String(text || "").split("\n")) {
    const name = line.trim();
    if (!name || name === HUB_WINDOW) continue;
    names.push(name);
  }
  return names;
}

export function whyItDied(screen) {
  const lines = String(screen || "").split("\n").map((one) => one.replace(/\s+$/, "")).filter(Boolean);
  return lines.slice(-3).join(" · ").slice(0, 300);
}

export function readFleet(text) {
  try {
    const held = JSON.parse(String(text || ""));
    return Array.isArray(held?.seats) ? held.seats : [];
  } catch {
    return [];
  }
}

export function bringsBack(seat) {
  if (!seat || !isSeatName(seat.name)) return false;
  if (seat.where && seat.where !== "cloud") return false;
  if (seat.kind === "shell") return true;
  if (seat.agent && !/^[a-z][a-z0-9-]*$/.test(String(seat.agent))) return false;
  const other = otherAgentOf(seat);
  if (other && seat.kind !== "structured") return !seat.model || MODEL_NAME.test(String(seat.model));
  if (!(other ? OWN_SESSION_ID : TRANSCRIPT_ID).test(String(seat.id || ""))) return false;
  if (seat.model && !MODEL_NAME.test(String(seat.model))) return false;
  return true;
}

export function mergeCheckpoint({ live, written, transcriptFor, sessionIdFor = () => "" }) {
  const kept = [];
  const known = new Map();
  for (const seat of written) {
    if (!seat?.name) continue;
    if (seat.where && seat.where !== "cloud") { kept.push(seat); continue; }
    known.set(seat.name, seat);
  }
  const seats = [...kept];
  const seen = new Set();
  for (const row of live) {
    const was = known.get(row.name) || {};
    const kind = kindOf(row.command, was.kind);
    seen.add(row.name);
    seats.push({
      ...was,
      name: row.name,
      where: "cloud",
      kind,
      id: (kind === "structured" ? sessionIdFor(row.name) : transcriptFor(row.cwd, was.id)) || was.id || "",
      cwd: row.cwd || "",
      model: was.model || "",
      agent: was.agent || ""
    });
  }
  for (const [name, seat] of known) if (!seen.has(name)) seats.push({ ...seat, name, where: "cloud" });
  return seats;
}

export function endsOfFile(file, head, tail, { open = openSync, close = closeSync, read = readSync, sizeOf = statSync } = {}) {
  let fd = 0;
  try {
    fd = open(file, "r");
    const { size } = sizeOf(file);
    const grab = (from, bytes) => {
      const buf = Buffer.alloc(Math.max(0, Math.min(bytes, size - from)));
      if (buf.length) read(fd, buf, 0, buf.length, from);
      return buf.toString("utf8");
    };
    if (size <= head + tail) return grab(0, size);
    return `${grab(0, head)}\n${grab(size - tail, tail)}`;
  } catch {
    return "";
  } finally {
    if (fd) {
      try { close(fd); } catch {}
    }
  }
}

const ran = (run, args, timeout) => new Promise((done) => {
  run("tmux", args, { timeout }, (wrong, out, err) => done({
    ok: !wrong,
    out: String(out || ""),
    error: wrong ? String(err || wrong.message || wrong).trim() : ""
  }));
});

export function createSeats({
  session,
  base = stateDirOf(),
  workspace = workspaceRoot(),
  hub = hubDir(),
  home = process.env.HOME || "",
  env = process.env,
  owner = "",
  run = execFile,
  settleMs = SETTLE_MS,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = () => Date.now(),
  log = () => {}
} = {}) {
  const fleetFile = join(base, "fleet.json");
  const projects = join(home, ".claude", "projects");
  const tmux = (args, timeout = TMUX_TIMEOUT) => ran(run, args, timeout);

  /* tmux resolves a window target by name loosely: with no exact match it falls back to
     a prefix, so `hive:conserta-o-login` aimed at a seat that is gone lands on
     `conserta-o-login-2` — the seat born from the same first words. Every target that
     names a seat is written `session:=name`, which only ever matches that seat, and
     answers "can't find window" when it is gone instead of hitting the neighbour. */
  const at = (name) => `${session}:=${name}`;
  try { writeHiveShellRc(base); } catch {}

  const readOrNothing = (file) => {
    try { return readFileSync(file, "utf8"); } catch { return ""; }
  };

  function bindTranscript(name, id, { structured = false, agent = "claude", fresh = false } = {}) {
    if (structured) {
      if (fresh) {
        try { rmSync(join(base, "events", `${name}.ndjson`), { force: true }); } catch {}
      }
      return "";
    }
    if (agent !== "claude" || !TRANSCRIPT_ID.test(String(id || ""))) return "";
    const file = join(base, "sessions", `${name}.json`);
    let held = {};
    try { held = JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
    const leaving = String(held.session_id || "");
    try {
      mkdirSync(join(base, "sessions"), { recursive: true });
      writeFileSync(file, `${JSON.stringify(sessionAfterBind(held, id), null, 2)}\n`);
    } catch {}
    return leaving && leaving !== id ? leaving : "";
  }

  const inABox = base === hiveRoot(env);

  const carry = () => {
    const held = {};
    if (env.HOME) held.HOME = env.HOME;
    if (env.PATH) held.PATH = env.PATH;
    if (inABox || env.IS_SANDBOX) held.IS_SANDBOX = "1";
    return held;
  };

  function trustFolder(folder) {
    const file = join(home, ".claude.json");
    let held = {};
    try { held = JSON.parse(readFileSync(file, "utf8")); } catch { return; }
    held.projects = held.projects || {};
    held.projects[folder] = { ...(held.projects[folder] || {}), hasTrustDialogAccepted: true };
    try { writeFileSync(file, JSON.stringify(held, null, 2)); } catch {}
  }

  function shareTheMemory(cwd) {
    const canonical = join(projects, projectSlug(hub), "memory");
    const mine = join(projects, projectSlug(cwd));
    if (!existsSync(canonical) || existsSync(join(mine, "memory"))) return;
    try {
      mkdirSync(mine, { recursive: true });
      symlinkSync(canonical, join(mine, "memory"));
    } catch {}
  }

  function newestTranscript(cwd, kept) {
    const dir = join(projects, projectSlug(cwd));
    if (kept && existsSync(join(dir, `${kept}.jsonl`))) return kept;
    try {
      const found = readdirSync(dir)
        .filter((one) => one.endsWith(".jsonl"))
        .map((one) => ({ one, at: statSync(join(dir, one)).mtimeMs }))
        .sort((a, b) => b.at - a.at)[0];
      return found ? found.one.replace(/\.jsonl$/, "") : "";
    } catch {
      return "";
    }
  }

  async function openSession() {
    const made = await tmux(["new-session", "-d", "-s", session, "-n", HUB_WINDOW, HOLD_THE_SESSION]);
    if (made.ok) await tmux(["set-option", "-t", session, "history-limit", String(HISTORY_LIMIT)]);
    await tmux(["set-option", "-t", session, "default-size", `${WINDOW_COLS}x${WINDOW_ROWS}`]);
  }

  async function shapeWindow(name) {
    await tmux(["set-window-option", "-t", at(name), "window-size", "manual"]);
    await tmux(["resize-window", "-t", at(name), "-x", String(WINDOW_COLS), "-y", String(WINDOW_ROWS)]);
  }

  const askOf = async (name, field) => {
    const said = await tmux(["display-message", "-p", "-t", at(name), field]);
    return said.ok ? said.out.trim().split("\n").pop()?.trim() || "" : "";
  };

  async function paneOf(name) {
    const [cwd, command, dead] = await Promise.all([
      askOf(name, "#{pane_current_path}"),
      askOf(name, "#{pane_current_command}"),
      askOf(name, "#{pane_dead}")
    ]);
    return { name, cwd, command, dead: dead === "1" };
  }

  async function rows() {
    const said = await tmux(["list-windows", "-t", session, "-F", "#{window_name}"]);
    if (!said.ok) return { rows: [], blind: !NO_SESSION.test(said.error), why: said.error };
    return { rows: await Promise.all(readNames(said.out).map(paneOf)), blind: false, why: "" };
  }

  async function windowExists(name) {
    const seen = await rows();
    return seen.rows.some((row) => row.name === name && !row.dead);
  }

  /* two windows under one name answer no target at all — tmux calls it ambiguous and
     refuses, so the seat cannot be closed, typed into or read. Their ids still address
     them one by one, and that is how a seat in that state is taken off the screen. */
  async function windowIds(name) {
    const said = await tmux(["list-windows", "-t", session, "-F", "#{window_id} #{window_name}"]);
    if (!said.ok) return [];
    return String(said.out).split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter(([id, named]) => id?.startsWith("@") && named === name)
      .map(([id]) => id);
  }

  /* a closed seat that stays written in fleet.json comes back on the next boot's
     restore — closing has to reach the file, not just the window. */
  function dropFromFleet(name) {
    const written = readFleet(existsSync(fleetFile) ? readFileSync(fleetFile, "utf8") : "");
    const kept = written.filter((seat) => seat?.name !== name || (seat?.where && seat.where !== "cloud"));
    if (kept.length === written.length) return;
    const scratch = `${fleetFile}.tmp`;
    try {
      mkdirSync(dirname(fleetFile), { recursive: true });
      writeFileSync(scratch, `${JSON.stringify({ seats: kept }, null, 2)}\n`);
      renameSync(scratch, fleetFile);
    } catch {}
  }

  const holdDeadWindow = (name, on) =>
    tmux(["set-window-option", "-t", at(name), "remain-on-exit", on ? "on" : "off"]);

  const endedSeats = new Set();

  async function liveRows() {
    const seen = await rows();
    if (seen.blind) return seen;
    const ended = seen.rows.filter((row) => row.dead);
    for (const row of ended) {
      await tmux(["kill-window", "-t", at(row.name)]);
      dropFromFleet(row.name);
      endedSeats.add(row.name);
      log(`seat ${row.name} ended on its own — closed`);
    }
    return { ...seen, rows: seen.rows.filter((row) => !row.dead) };
  }

  async function whatTheWindowSaid(name, { agent, cwd }) {
    const painted = await tmux(["capture-pane", "-t", at(name), "-p", "-S", "-40"]);
    const said = painted.ok ? whyItDied(painted.out) : "";
    if (said) return said;
    const held = carry();
    const found = await new Promise((done) => {
      run("/bin/sh", ["-c", `command -v ${quoteForShell(agent)}`], { timeout: 8000, env: { ...env, ...held, PATH: held.PATH || env.PATH || "" } },
        (wrong, out) => done(wrong ? "" : String(out || "").trim()));
    });
    if (!found) return `${agent} is not on this server's path`;
    return existsSync(cwd) ? "" : `${cwd} is not a folder on this server`;
  }

  function sessionIdOf(name) {
    try {
      const id = String(JSON.parse(readFileSync(join(base, "sessions", `${name}.json`), "utf8")).session_id || "");
      return OWN_SESSION_ID.test(id) ? id : "";
    } catch {
      return "";
    }
  }

  async function place({ name, kind, cwd, model, effort, agent, structured, sessionId, resumeId, promptFile, accountDir, compactAt, remoteControl, continueLast = false }) {
    const command = seatCommand({
      hub: cwd,
      fallback: (resumeId || kind === "shell") ? hub : "",
      name,
      kind,
      agent: agent || "claude",
      model,
      effort,
      sessionId,
      resumeId,
      structured,
      compactAt,
      promptFile,
      driver: structured ? join(ENGINE, driverFileFor(agent)) : "",
      stateDir: base,
      accountDir,
      remoteControl,
      continueLast,
      side: sideOf(base, env),
      carry: carry(),
      addDir: base
    });
    const made = await tmux([
      "new-window", "-d", "-t", `${session}:`, "-n", name, command, ";",
      "set-window-option", "-t", at(name), "remain-on-exit", "on"
    ]);
    if (!made.ok) return { error: made.error.split("\n").filter(Boolean).pop() || "tmux would not open the window" };
    await shapeWindow(name);
    return { ok: true };
  }

  return {
    get session() { return session; },
    get fleetFile() { return fleetFile; },

    async list() {
      const seen = await liveRows();
      if (seen.blind) return { error: `this server cannot read its own seats — ${seen.why}` };
      return { seats: seen.rows.map(({ dead, ...one }) => one), ended: [...endedSeats] };
    },

    async open(asked) {
      const name = String(asked?.name || "");
      if (!isSeatName(name)) return { error: "that is not a name a seat can have" };
      if (name === HUB_WINDOW) return { error: `"${HUB_WINDOW}" is a window this server already keeps — pick another name` };
      const kind = KINDS.has(String(asked?.kind || "")) ? String(asked.kind) : "chat";
      const model = String(asked?.model || "");
      if (model && !MODEL_NAME.test(model)) return { error: "that is not a model this server will start" };

      await openSession();
      const here = await rows();
      if (here.blind) return { error: `this server cannot read which seats it already runs — ${here.why}` };
      const taken = here.rows.filter((row) => row.name === name);
      if (taken.some((row) => !row.dead)) {
        return { error: `"${name}" is already a seat here — a second window with that name would share its mailbox` };
      }
      for (const id of taken.length ? await windowIds(name) : []) await tmux(["kill-window", "-t", id]);
      endedSeats.delete(name);

      let cwd = String(asked?.cwd || "");
      if (!cwd && asked?.repo) {
        const made = await prepareWorktree({
          root: workspace,
          repo: String(asked.repo),
          branch: String(asked.branch || ""),
          name,
          owner: String(asked.owner || owner || "")
        });
        if (made.error) return made;
        cwd = made.cwd;
        if (made.made) log(`seat ${name} got a worktree at ${cwd} on ${made.branch}`);
      }
      if (!cwd) cwd = hub;
      const resumeId = String(asked?.resumeId || "");
      if (!existsSync(cwd)) {
        if (!resumeId) return { error: `${cwd} is not a folder on this server` };
        log(`seat ${name} asked for ${cwd}, which is not here — it opens in ${hub}`);
        cwd = hub;
      }

      trustFolder(cwd);
      trustFolder(base);
      shareTheMemory(cwd);

      const structured = !!asked?.structured;
      let promptFile = "";
      const asking = String(asked?.prompt || "");
      const carried = Array.isArray(asked?.images) ? asked.images.filter((one) => typeof one === "string") : [];
      const shots = structured ? carried : [];
      const prompt = structured ? asking : inlineImageMarks(asking, carried);
      if (prompt || shots.length) {
        promptFile = join(base, "prompts", `${name}.md`);
        try {
          mkdirSync(dirname(promptFile), { recursive: true });
          writeFileSync(promptFile, prompt);
          if (shots.length) writeFileSync(missionImagesFile(promptFile), JSON.stringify(shots));
          else rmSync(missionImagesFile(promptFile), { force: true });
        } catch (wrong) {
          return { error: `could not write the first message: ${String(wrong?.message || wrong).slice(0, 140)}` };
        }
      }

      const sessionId = String(asked?.sessionId || "");
      const agent = String(asked?.agent || "claude");
      const replaced = bindTranscript(name, resumeId || sessionId, { structured, agent, fresh: true });

      const placed = await place({
        name,
        kind,
        cwd,
        model,
        effort: String(asked?.effort || ""),
        agent,
        structured,
        sessionId,
        resumeId,
        promptFile,
        accountDir: String(asked?.accountDir || ""),
        compactAt: String(asked?.compactAt || ""),
        remoteControl: asked?.remoteControl !== false
      });
      if (placed.error) return placed;

      await wait(settleMs);
      if (!(await windowExists(name))) {
        const said = await whatTheWindowSaid(name, { agent, cwd });
        await tmux(["kill-window", "-t", at(name)]);
        return { error: `${agent} closed the window as soon as it opened — the agent did not start${said ? `: ${said}` : ""}` };
      }
      if (kind !== "shell") await holdDeadWindow(name, false);
      log(`seat ${name} opened in ${cwd}`);
      return { name, cwd, started: true, replaced };
    },

    async close(name) {
      if (!isSeatName(name)) return { ok: false, error: "that is not a name a seat can have" };
      const said = await tmux(["kill-window", "-t", at(name)]);
      if (!said.ok) {
        for (const id of await windowIds(name)) await tmux(["kill-window", "-t", id]);
        if (await windowExists(name)) {
          return { ok: false, name, error: `the window would not close${said.error ? ` — ${said.error}` : ""}` };
        }
      }
      dropFromFleet(name);
      return { ok: true, name };
    },

    async screen(name, { lines = SCREEN_LINES } = {}) {
      if (!isSeatName(name)) return { error: "that is not a name a seat can have" };
      const asked = Math.min(SCREEN_LINES, Math.max(1, Math.round(Number(lines) || SCREEN_LINES)));
      const said = await tmux(["capture-pane", "-t", at(name), "-p", "-e", "-S", `-${asked}`]);
      if (!said.ok) return { error: `there is no seat called ${name} on this server` };
      const where = await tmux(["display-message", "-p", "-t", at(name), "#{pane_current_path}"]);
      return { name, screen: said.out, cwd: where.ok ? where.out.trim().split("\n").pop() || "" : "" };
    },

    async wall({ lines = WALL_LINES } = {}) {
      const seen = await liveRows();
      if (seen.blind) return { error: `this server cannot read its own seats — ${seen.why}` };
      const asked = Math.min(SCREEN_LINES, Math.max(1, Math.round(Number(lines) || WALL_LINES)));
      const held = {};
      for (const row of seen.rows) {
        const painted = await tmux(["capture-pane", "-t", at(row.name), "-p", "-e", "-S", `-${asked}`]);
        held[row.name] = {
          cwd: row.cwd,
          screen: painted.ok ? painted.out : "",
          status: readOrNothing(join(base, "status", `${row.name}.md`)),
          mission: readOrNothing(join(base, "prompts", `${row.name}.md`)),
          driver: endsOfFile(join(base, "events", `${row.name}.ndjson`), DRIVER_HEAD, DRIVER_TAIL),
          session: readOrNothing(join(base, "sessions", `${row.name}.json`))
        };
      }
      return { seats: held };
    },

    async type(name, text, { submit = false } = {}) {
      if (!isSeatName(name)) return { ok: false, error: "that is not a name a seat can have" };
      const said = await tmux(["send-keys", "-t", at(name), "-l", `${String(text ?? "")} `]);
      if (!said.ok) return { ok: false, error: `there is no seat called ${name} on this server` };
      if (submit) {
        await wait(150);
        await tmux(["send-keys", "-t", at(name), "Enter"]);
      }
      return { ok: true, name };
    },

    async restore(asked = null, { compactAt = "" } = {}) {
      await openSession();
      const wanted = Array.isArray(asked) ? asked : readFleet(existsSync(fleetFile) ? readFileSync(fleetFile, "utf8") : "");
      const seen = await rows();
      /* a window list this server could not read used to look like an empty one, and every
         seat already running was opened a second time under its own name — the pair then
         answered no target at all. Nothing comes back until the list can be read. */
      if (seen.blind) {
        return { restored: [], skipped: wanted.filter((seat) => seat?.name).map((seat) => ({ name: seat.name, why: BLIND_TO_ITS_OWN_SEATS(seen.why) })) };
      }
      const live = new Set(seen.rows.map((row) => row.name));
      const back = [];
      const skipped = [];
      for (const seat of wanted) {
        if (!bringsBack(seat) || live.has(seat.name)) continue;
        if (endedSeats.has(seat.name)) {
          skipped.push({ name: seat.name, why: ENDED_ON_ITS_OWN });
          continue;
        }
        const cwd = String(seat.cwd || "") || hub;
        const other = otherAgentOf(seat);
        if (seat.kind !== "shell" && !other && !existsSync(join(projects, projectSlug(cwd), `${seat.id}.jsonl`))) {
          skipped.push({ name: seat.name, why: `its transcript (${seat.id || "none"}) is no longer on disk` });
          continue;
        }
        const terminalOnAnother = !!other && seat.kind !== "structured";
        const placed = await place({
          name: seat.name,
          kind: seat.kind === "shell" ? "shell" : "chat",
          cwd,
          model: MODEL_NAME.test(String(seat.model || "")) ? String(seat.model) : "",
          agent: seat.agent || "claude",
          structured: seat.kind === "structured",
          resumeId: seat.kind === "shell" || terminalOnAnother ? "" : String(seat.id),
          continueLast: terminalOnAnother,
          compactAt: String(compactAt || ""),
          remoteControl: env.HIVE_REMOTE_CONTROL !== "0"
        });
        if (placed.error) { skipped.push({ name: seat.name, why: placed.error }); continue; }
        if (seat.kind !== "shell") await holdDeadWindow(seat.name, false);
        if (seat.kind !== "shell") bindTranscript(seat.name, String(seat.id), { structured: seat.kind === "structured", agent: seat.agent || "claude" });
        live.add(seat.name);
        back.push(seat.name);
      }
      if (back.length) log(`seats: brought ${back.length} back — ${back.join(", ")}`);
      for (const one of skipped) log(`seats: leaving ${one.name} behind — ${one.why}`);
      return { restored: back, skipped };
    },

    async checkpoint({ fleet = null } = {}) {
      const seen = await rows();
      if (seen.blind) return { error: `this server cannot read its own seats — ${seen.why}` };
      const seats = mergeCheckpoint({
        live: seen.rows,
        written: Array.isArray(fleet) ? fleet : readFleet(existsSync(fleetFile) ? readFileSync(fleetFile, "utf8") : ""),
        transcriptFor: (cwd, kept) => newestTranscript(cwd, kept),
        sessionIdFor: sessionIdOf
      });
      const scratch = `${fleetFile}.tmp`;
      try {
        mkdirSync(dirname(fleetFile), { recursive: true });
        writeFileSync(scratch, `${JSON.stringify({ seats }, null, 2)}\n`);
        renameSync(scratch, fleetFile);
      } catch (wrong) {
        return { error: `could not write ${fleetFile}: ${String(wrong?.message || wrong).slice(0, 140)}` };
      }
      return { seats: seats.length, live: seen.rows.length, file: fleetFile };
    }
  };
}

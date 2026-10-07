import { execFile as runProcess, spawn as spawnProcess } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const INPUT_CEILING = 64 * 1024;
export const COLS = { least: 20, most: 500, fallback: 200 };
export const ROWS = { least: 5, most: 200, fallback: 50 };
export const SEAT_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const SESSION_NAME = /^[A-Za-z0-9._-]{1,120}$/;

export const isSeatName = (name) => SEAT_NAME.test(String(name || ""));

export function windowTarget(session, seat) {
  if (!isSeatName(seat)) throw new Error("that is not a seat name");
  if (!SESSION_NAME.test(String(session || ""))) throw new Error("that is not a tmux session name");
  return `${session}:${seat}`;
}

export function sizeAsked(asked) {
  const between = (value, bounds) => {
    if (value === null || value === undefined || value === "") return bounds.fallback;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return bounds.fallback;
    return Math.min(bounds.most, Math.max(bounds.least, n));
  };
  return { cols: between(asked?.cols, COLS), rows: between(asked?.rows, ROWS) };
}

export function hexOf(text) {
  return [...Buffer.from(String(text), "utf8")].map((byte) => byte.toString(16).padStart(2, "0"));
}

export const VIEW_NAME = /^[A-Za-z0-9._-]{1,120}$/;

export function viewArgv(view, session, seat) {
  if (!VIEW_NAME.test(String(view || ""))) throw new Error("that is not a view name");
  windowTarget(session, seat);
  return ["new-session", "-d", "-s", view, "-t", session, ";",
    "set-option", "-t", view, "status", "off", ";",
    "set-option", "-t", view, "mouse", "off", ";",
    "set-option", "-t", view, "history-limit", "20000", ";",
    "set-window-option", "-t", `${view}:${seat}`, "aggressive-resize", "on", ";",
    "set-window-option", "-t", `${view}:${seat}`, "window-size", "latest", ";",
    "select-window", "-t", `${view}:${seat}`];
}

export const dropViewArgv = (view) => ["kill-session", "-t", view];

export const paintArgv = (target) => ["capture-pane", "-p", "-e", "-J", "-t", target];
export const deadArgv = (target) => ["display-message", "-p", "-t", target, "#{pane_dead}"];
export const streamArgv = (target, fifo) => ["pipe-pane", "-o", "-t", target, `cat > ${JSON.stringify(fifo)}`];
export const hushArgv = (target) => ["pipe-pane", "-t", target];
export const typeArgv = (target, text) => ["send-keys", "-t", target, "-H", ...hexOf(text)];
export const resizeArgv = (target, cols, rows) => ["resize-window", "-t", target, "-x", String(cols), "-y", String(rows)];

export function readFrame(raw) {
  let said = null;
  try { said = JSON.parse(String(raw)); } catch { return null; }
  if (!said || typeof said !== "object") return null;
  if (said.t === "i") {
    const text = String(said.d ?? "");
    return text.length > INPUT_CEILING ? null : { kind: "input", text };
  }
  if (said.t === "r") return { kind: "resize", ...sizeAsked(said) };
  return null;
}

export function createTerminals({
  run = runProcess,
  spawn = spawnProcess,
  makeFifoDir = () => mkdtempSync(join(tmpdir(), "hive-term-")),
  openStream = createReadStream,
  clean = rmSync,
  log = () => {}
} = {}) {
  const live = new Set();

  const tmux = (args) => new Promise((done) => {
    run("tmux", args, { timeout: 8000 }, (wrong, out) =>
      done({ ok: !wrong, out: String(out || ""), error: wrong ? String(wrong.message || wrong) : "" }));
  });

  async function open(session, seat, { onOutput, onClose, readOnly = false, cols, rows, view = "" }) {
    let target;
    try { target = windowTarget(session, seat); }
    catch (wrong) { return { error: String(wrong.message) }; }

    const painted = await tmux(paintArgv(target));
    if (!painted.ok) return { error: `there is no seat called ${seat} on this server` };
    const dead = await tmux(deadArgv(target));
    if (dead.ok && dead.out.trim() === "1") return { error: `${seat} has ended — its shell is gone` };

    const size = sizeAsked({ cols, rows });
    let mirror = "";
    if (view) {
      try {
        const made = await tmux(viewArgv(view, session, seat));
        if (made.ok) mirror = view;
      } catch {}
    }
    await tmux(resizeArgv(mirror ? `${mirror}:${seat}` : target, size.cols, size.rows));

    let dir = "";
    let fifo = "";
    try {
      dir = makeFifoDir();
      fifo = join(dir, "out");
      await new Promise((done, fail) => {
        const made = spawn("mkfifo", [fifo], { stdio: "ignore" });
        made.on("exit", (code) => (code === 0 ? done() : fail(new Error(`mkfifo answered ${code}`))));
        made.on("error", fail);
      });
    } catch (wrong) {
      if (dir) try { clean(dir, { recursive: true, force: true }); } catch {}
      return { error: `this server could not open a channel for the terminal: ${String(wrong?.message || wrong).slice(0, 140)}` };
    }

    const reader = openStream(fifo);
    reader.on("data", onOutput);
    reader.on("error", () => {});

    let shut = false;
    const handle = {
      seat,
      readOnly,
      async write(text) {
        if (readOnly || shut || !text) return false;
        const said = await tmux(typeArgv(target, text));
        return said.ok;
      },
      async resize(asked) {
        const next = sizeAsked(asked);
        if (!shut) await tmux(resizeArgv(mirror ? `${mirror}:${seat}` : target, next.cols, next.rows));
        return next;
      },
      async close(why = "") {
        if (shut) return;
        shut = true;
        live.delete(handle);
        await tmux(hushArgv(target));
        if (mirror) await tmux(dropViewArgv(mirror));
        try { reader.destroy(); } catch {}
        try { clean(dir, { recursive: true, force: true }); } catch {}
        onClose(why);
      }
    };

    const piped = await tmux(streamArgv(target, fifo));
    if (!piped.ok) {
      log(`terminal: ${seat} would not pipe — ${piped.error}`);
      await handle.close("");
      return { error: "this server could not follow that seat's screen" };
    }

    live.add(handle);
    return { handle, size, painted: painted.out };
  }

  return {
    open,
    get count() { return live.size; },
    async closeAll() {
      for (const handle of [...live]) await handle.close("");
    }
  };
}

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { win32 } from "node:path";

const { basename, dirname, join } = win32;

import { SHELL_PROGRAM } from "../../server/engine/seat-command.mjs";

const require = createRequire(import.meta.url);

export const ROOM_COLS = 200;
export const ROOM_ROWS = 50;
export const ROOM_SCROLLBACK = 20000;
export const DEAD_GRACE_MS = 60000;
export const ENTER_AFTER_MS = 150;

/* the keys the sign-in screen takes, named the way tmux names them, as the bytes a pty reads */
export const KEY_BYTES = {
  Enter: "\r",
  Escape: "\x1b",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Left: "\x1b[D",
  Right: "\x1b[C",
  Tab: "\t",
  Space: " ",
  BSpace: "\x7f",
  "C-c": "\x03"
};

const RUNNABLE = /\.exe$/i;
const SCRIPT_SHIM = /\.(?:cmd|bat)$/i;
const SHIM_TARGET = /%~dp0[\\/]?["']?([^"'\s%]+\.[cm]?js)/i;

export function shimTarget(text) {
  const found = SHIM_TARGET.exec(String(text || ""));
  return found ? found[1].replace(/^[\\/]+/, "") : "";
}

export function pickWhere(lines) {
  const found = (Array.isArray(lines) ? lines : String(lines || "").split(/\r?\n/)).map((one) => String(one).trim()).filter(Boolean);
  return found.find((one) => RUNNABLE.test(one)) || found.find((one) => SCRIPT_SHIM.test(one)) || "";
}

export function shellArgsFor(file) {
  if (/bash\.exe$/i.test(file)) return ["-l"];
  if (/(?:pwsh|powershell)\.exe$/i.test(file)) return ["-NoLogo"];
  return [];
}

function systemRoot(env) {
  return env.SystemRoot || env.windir || "C:\\Windows";
}

export function whereExe(env = process.env) {
  const where = join(systemRoot(env), "System32", "where.exe");
  return (program) => new Promise((done) => {
    execFile(where, [program], { env, timeout: 8000, windowsHide: true }, (wrong, out) => done(wrong ? [] : String(out || "").split(/\r?\n/)));
  });
}

export async function shellOnWindows({ where, env = process.env, exists = existsSync } = {}) {
  const asked = String(env.HIVE_SHELL || "");
  if (asked && exists(asked)) return { file: asked, args: shellArgsFor(asked) };
  const pwsh = pickWhere(await where("pwsh"));
  if (pwsh) return { file: pwsh, args: shellArgsFor(pwsh) };
  const legacy = join(systemRoot(env), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return { file: legacy, args: shellArgsFor(legacy) };
}

export async function programOnWindows(program, { where, env = process.env, exists = existsSync, read = readFileSync, node = process.execPath, claude = "" } = {}) {
  if (program === "node") return { file: node, args: [] };
  if (program === SHELL_PROGRAM) return shellOnWindows({ where, env, exists });
  if (program === "claude" && claude && exists(claude)) return { file: claude, args: [] };
  const found = pickWhere(await where(program));
  if (!found) return null;
  if (RUNNABLE.test(found)) return { file: found, args: [] };
  let shim = "";
  try { shim = shimTarget(read(found, "utf8")); } catch { shim = ""; }
  if (shim) {
    const script = join(dirname(found), shim);
    if (exists(script)) return { file: node, args: [script] };
  }
  return { file: join(systemRoot(env), "System32", "cmd.exe"), args: ["/d", "/s", "/c", found] };
}

export function headlessScreen({ cols = ROOM_COLS, rows = ROOM_ROWS, scrollback = ROOM_SCROLLBACK } = {}) {
  const { Terminal } = require("@xterm/headless");
  const { SerializeAddon } = require("@xterm/addon-serialize");
  const term = new Terminal({ cols, rows, scrollback, allowProposedApi: true });
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);
  return {
    write: (data, done) => term.write(data, done),
    resize: (c, r) => term.resize(c, r),
    tail(lines) {
      const buffer = term.buffer.active;
      const text = (at) => (buffer.getLine(at)?.translateToString(true) ?? "").replace(/\s+$/, "");
      let end = Math.min(buffer.length - 1, buffer.baseY + buffer.cursorY);
      while (end > 0 && !text(end)) end -= 1;
      const out = [];
      for (let at = Math.max(0, end + 1 - lines); at <= end; at++) out.push(text(at));
      while (out.length && !out[out.length - 1]) out.pop();
      return out.join("\n");
    },
    serialize: () => serializer.serialize(),
    dispose: () => term.dispose()
  };
}

const accountOf = (env) => {
  const dir = String(env?.CLAUDE_CONFIG_DIR || "").replace(/[\\/]+$/, "");
  return dir ? basename(dir) : "";
};

export function createNativeRoom({
  spawn = (file, args, options) => require("node-pty").spawn(file, args, options),
  screenOf = headlessScreen,
  resolve = null,
  env = process.env,
  hub = "",
  claude = () => "",
  exists = existsSync,
  cols = ROOM_COLS,
  rows = ROOM_ROWS,
  scrollback = ROOM_SCROLLBACK,
  graceMs = DEAD_GRACE_MS,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)),
  log = () => {}
} = {}) {
  const windows = new Map();
  const where = whereExe(env);
  const program = resolve || ((name) => programOnWindows(name, { where, env, exists, claude: claude() }));

  const alive = (name) => {
    const held = windows.get(name);
    return held && !held.dead ? held : null;
  };

  function forget(held) {
    if (windows.get(held.name) !== held) return;
    windows.delete(held.name);
    try { held.screen.dispose?.(); } catch {}
  }

  return {
    program,

    has: (name) => !!alive(name),

    knows: (name) => windows.has(name),

    list({ dead = false } = {}) {
      return [...windows.values()].filter((held) => dead || !held.dead)
        .map((held) => ({ name: held.name, dead: held.dead, command: held.program, cwd: held.cwd, account: accountOf(held.env) }));
    },

    cwdOf: (name) => windows.get(name)?.cwd || "",

    capture: (name, lines = scrollback) => windows.get(name)?.screen.tail(Math.max(1, lines)) || "",

    async open({ name, program: wanted, args = [], env: extra = {}, cwd = "", fallback = hub, kind = "" }) {
      if (alive(name)) return { error: `"${name}" is already a seat here — a second window with that name would share its mailbox` };
      const gone = windows.get(name);
      if (gone) forget(gone);
      const asked = kind === "shell" ? SHELL_PROGRAM : wanted;
      const found = await program(asked);
      if (!found) return { error: `${wanted} is not installed on this machine` };
      const dir = cwd && exists(cwd) ? cwd : fallback;
      const screen = screenOf({ cols, rows, scrollback });
      let child;
      try {
        child = spawn(found.file, [...found.args, ...args], {
          name: "xterm-256color",
          cols,
          rows,
          cwd: dir,
          env: { ...env, ...extra, TERM: "xterm-256color" },
          useConpty: true
        });
      } catch (wrong) {
        try { screen.dispose?.(); } catch {}
        return { error: `could not start ${wanted}: ${String(wrong?.message || wrong).slice(0, 160)}` };
      }
      const held = { name, program: asked, cwd: dir, env: extra, child, screen, viewers: new Set(), dead: false, exit: null };
      child.onData((data) => {
        screen.write(data);
        for (const viewer of held.viewers) viewer.onData?.(data);
      });
      child.onExit(({ exitCode }) => {
        held.dead = true;
        held.exit = exitCode;
        for (const viewer of held.viewers) viewer.onExit?.(exitCode);
        held.viewers.clear();
        log(`${name} closed (code ${exitCode})`);
        const timer = setTimeout(() => forget(held), graceMs);
        timer.unref?.();
      });
      windows.set(name, held);
      log(`${name} opened ${found.file} in ${dir}`);
      return { ok: true, cwd: dir };
    },

    async type(name, text, { enter = false } = {}) {
      const held = alive(name);
      if (!held) return false;
      if (text) held.child.write(text);
      if (enter) {
        await wait(ENTER_AFTER_MS);
        held.child.write("\r");
      }
      return true;
    },

    kill(name) {
      const held = windows.get(name);
      if (!held) return false;
      if (!held.dead) { try { held.child.kill(); } catch {} }
      forget(held);
      return true;
    },

    attach(name, { cols: wantCols = 0, rows: wantRows = 0, onData = () => {}, onExit = () => {} } = {}) {
      const held = alive(name);
      if (!held) return null;
      const size = (c, r) => {
        if (!(c > 0 && r > 0)) return;
        try { held.child.resize(c, r); } catch {}
        try { held.screen.resize(c, r); } catch {}
      };
      size(wantCols, wantRows);
      const viewer = { onData, onExit };
      held.viewers.add(viewer);
      onData(held.screen.serialize());
      return {
        write: (text) => { if (!held.dead && text) held.child.write(text); },
        resize: size,
        detach: () => { held.viewers.delete(viewer); }
      };
    },

    closeAll() {
      for (const held of [...windows.values()]) {
        if (!held.dead) { try { held.child.kill(); } catch {} }
        forget(held);
      }
    }
  };
}

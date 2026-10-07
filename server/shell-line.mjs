import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export const SHELL_LINE_MAX = 4000;
export const SHELL_TIMEOUT = 120000;
export const SHELL_OUTPUT_CEILING = 64 * 1024;
export const SHELL_GRACE = 1500;

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export const withoutAnsi = (text) => String(text ?? "").replace(ANSI, "");

export function shellLineOf(text) {
  const line = String(text ?? "");
  if (!line.startsWith("!")) return null;
  const quiet = line.startsWith("!!");
  const command = line.slice(quiet ? 2 : 1).trim();
  return command ? { command, quiet } : null;
}

export function clipOutput(text, ceiling = SHELL_OUTPUT_CEILING) {
  const whole = String(text ?? "");
  if (Buffer.byteLength(whole) <= ceiling) return { output: whole, truncated: false };
  const half = Math.floor(ceiling / 2);
  const head = Buffer.from(whole).subarray(0, half).toString("utf8").replace(/�$/, "");
  const tail = Buffer.from(whole).subarray(-half).toString("utf8").replace(/^�/, "");
  return { output: `${head}\n…\n${tail}`, truncated: true };
}

export function shellProgram({ platform = process.platform, env = process.env } = {}) {
  if (platform === "win32") return { shell: true, program: "", args: [] };
  const shell = env.SHELL && existsSync(env.SHELL) ? env.SHELL : "/bin/sh";
  return { shell: false, program: shell, args: ["-lc"] };
}

export function placeToRun(cwd, fallback = homedir()) {
  return cwd && existsSync(cwd) ? cwd : fallback;
}

export function runShellLine({ command, cwd, env = process.env, timeoutMs = SHELL_TIMEOUT, ceiling = SHELL_OUTPUT_CEILING, now = () => Date.now(), start = spawn, platform = process.platform } = {}) {
  const line = String(command || "").trim();
  if (!line) return Promise.resolve({ ok: false, error: "nothing to run after the !" });
  if (line.length > SHELL_LINE_MAX) return Promise.resolve({ ok: false, error: "that line is too long to run" });
  const where = placeToRun(cwd);
  const program = shellProgram({ platform, env });
  const began = now();
  return new Promise((done) => {
    let child;
    try {
      child = program.shell
        ? start(line, [], { cwd: where, env: { ...env, TERM: "dumb", NO_COLOR: "1" }, shell: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
        : start(program.program, [...program.args, line], { cwd: where, env: { ...env, TERM: "dumb", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    } catch (wrong) {
      return done({ ok: false, error: `could not start the shell: ${wrong.message}` });
    }
    const chunks = [];
    let held = 0;
    const take = (chunk) => {
      if (held > ceiling * 4) return;
      chunks.push(chunk);
      held += chunk.length;
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    let timedOut = false;
    let finished = false;
    const signalTree = (signal) => {
      try { if (program.shell || !child.pid) child.kill(signal); else process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signalTree("SIGTERM");
      setTimeout(() => { if (!finished) signalTree("SIGKILL"); }, SHELL_GRACE).unref?.();
    }, timeoutMs);
    timer.unref?.();
    const settle = (code, signal, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const clipped = clipOutput(withoutAnsi(Buffer.concat(chunks).toString("utf8")), ceiling);
      done({
        ok: true,
        command: line,
        cwd: where,
        output: clipped.output,
        truncated: clipped.truncated,
        code: typeof code === "number" ? code : null,
        signal: signal || "",
        timedOut,
        ms: now() - began,
        ...(error ? { error } : {})
      });
    };
    child.on("error", (wrong) => settle(null, "", `could not start the shell: ${wrong.message}`));
    child.on("close", (code, signal) => settle(code, signal));
  });
}

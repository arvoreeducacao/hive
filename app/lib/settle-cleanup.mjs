import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const SETTLE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_KEPT = 20000;

const handlers = new Set();

export function whenSeatSettles(handler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function settleCommandsFor(seat, commands = {}) {
  if (!seat || seat.where !== "local") return [];
  return (seat.trees || [])
    .filter((tree) => tree && !tree.main && tree.path && commands[tree.repo])
    .map((tree) => ({ dir: tree.path, repo: tree.repo, command: commands[tree.repo] }));
}

export function runInTree({ dir, command }, { timeout = SETTLE_COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((done) => {
    let out = "";
    const child = spawn(process.env.SHELL || "/bin/sh", ["-lc", command], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    const keep = (chunk) => { out = (out + chunk).slice(-OUTPUT_KEPT); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.on("error", (wrong) => { clearTimeout(timer); done({ ok: false, code: -1, out: String(wrong?.message || wrong) }); });
    child.on("close", (code) => { clearTimeout(timer); done({ ok: code === 0, code, out }); });
  });
}

export async function seatSettled(seat, { commands = {}, home = "", run = runInTree, now = () => new Date() } = {}) {
  const said = [];
  for (const handler of handlers) {
    try { await handler(seat); } catch (wrong) { said.push(`a settle step failed: ${wrong?.message || wrong}`); }
  }
  for (const job of settleCommandsFor(seat, commands)) {
    const ran = await run(job);
    said.push(`$ ${job.command}   (${job.dir})`, ran.out.trim(), ran.ok ? "finished" : `failed with code ${ran.code}`);
  }
  if (home && said.length) {
    const dir = join(home, "settle-cleanup");
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeFile(join(dir, `${seat.name}.log`), `${now().toISOString()}\n${said.filter(Boolean).join("\n")}\n`).catch(() => {});
  }
  return said;
}

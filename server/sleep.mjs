import { execFile } from "node:child_process";

export const SLEEP_AFTER_MS = 30 * 60 * 1000;
export const SLEEP_UNWATCHED_MS = 15 * 60 * 1000;
export const REBIRTH_CHILD_GRACE_MS = 10000;

const ARGS_A_REBIRTH_DROPS = new Set(["--prompt-file", "--session-id", "--resume-id"]);

export function rebornArgs(argv, sessionId) {
  const kept = [];
  for (let i = 0; i < argv.length; i++) {
    const one = argv[i];
    if (one === "--asleep") continue;
    if (ARGS_A_REBIRTH_DROPS.has(one)) { i += 1; continue; }
    kept.push(one);
  }
  return [...kept, "--resume-id", sessionId, "--asleep"];
}

export function canBeReborn({ execve, platform } = {}, env = {}, sessionId = "") {
  if (env.HIVE_SLEEP_REBIRTH === "0") return false;
  if (typeof execve !== "function" || platform === "win32") return false;
  return !!sessionId;
}

export async function childrenGone({ pid, graceMs, list = childrenOf, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, everyMs = 250 }) {
  const until = now() + graceMs;
  while ((await list(pid)).length) {
    if (now() >= until) return false;
    await wait(everyMs);
  }
  return true;
}

function childrenOf(pid) {
  return new Promise((answer) => {
    execFile("pgrep", ["-P", String(pid)], (wrong, out) => answer(wrong ? [] : String(out).split("\n").filter(Boolean)));
  });
}

function millisOr(raw, fallback) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function sleepAfterMs(env = process.env, { watched = true } = {}) {
  if (watched) return millisOr(env.HIVE_SLEEP_AFTER_MS, SLEEP_AFTER_MS);
  return millisOr(env.HIVE_SLEEP_UNWATCHED_MS, millisOr(env.HIVE_SLEEP_AFTER_MS, SLEEP_UNWATCHED_MS));
}

export function sleepVerdict({
  now,
  lastActivity,
  afterMs,
  sleeping = false,
  leaving = false,
  sessionId = "",
  busy = false,
  queued = 0,
  questions = 0,
  tasks = 0,
}) {
  if (!afterMs) return { sleep: false, why: "desligado" };
  if (leaving) return { sleep: false, why: "saindo" };
  if (sleeping) return { sleep: false, why: "ja dorme" };
  if (!sessionId) return { sleep: false, why: "sem sessao para retomar" };
  if (busy) return { sleep: false, why: "turno em andamento", retry: true };
  if (queued > 0) return { sleep: false, why: "fila pendente", retry: true };
  if (questions > 0) return { sleep: false, why: "pergunta aberta", retry: true };
  if (tasks > 0) return { sleep: false, why: "tarefa em segundo plano", retry: true };
  const idle = now - lastActivity;
  if (idle < afterMs) return { sleep: false, why: "ainda recente", retry: true, inMs: afterMs - idle };
  return { sleep: true, why: "parado", idle };
}

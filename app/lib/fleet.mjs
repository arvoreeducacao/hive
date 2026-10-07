import { join } from "node:path";
import { REPO_FOLDER } from "./env.mjs";
import { hiveShellExec } from "../../server/engine/hive-shell.mjs";
import { carriedEnv } from "../../server/engine/seat-command.mjs";
import { providerEnv } from "../../server/engine/providers.mjs";
import { accountDir } from "../../server/engine/accounts.mjs";
import { driverFileFor } from "../../server/sessions.mjs";
const SAFE_PATH = /^[\w./~-]+$/;
/* a Windows folder never reaches the restore script: on that side the seat is
   spawned straight from argv, so a space or a colon in it is not a shell problem. */
const WINDOWS_PATH = /^[A-Za-z]:[\\/][\w.\\/~ ()-]*$/;
const isSafePath = (path) => SAFE_PATH.test(path) || WINDOWS_PATH.test(path);
const SAFE_WORD = /^[\w.-]+$/;
/* keep this in step with MODEL_ARG_PATTERN in spawn-args.mjs: a model the
   hive agrees to spawn has to be a model it also agrees to bring back. */
const SAFE_MODEL = /^[A-Za-z0-9._/:[\]-]+$/;
const SAFE_ID = /^[0-9a-f-]{8,64}$/i;
/* the other agents name their own sessions — codex and kiro with a uuid, kimi
   with `session_<uuid>` — so the id a seat carries is whatever the driver wrote
   down, kept to one shell word. */
const SAFE_SESSION = /^[A-Za-z0-9._-]{8,80}$/;

/* a terminal on another agent never tells the hive which session it opened, so
   the only way back is the CLI's own "continue the last conversation here". */
export const TUI_CONTINUES = {
  codex: "codex resume --last --dangerously-bypass-approvals-and-sandbox",
  kimi: "kimi -c --yolo",
  kiro: "kiro-cli chat --resume --trust-all-tools",
  cursor: "cursor-agent --continue --force --trust",
  opencode: "opencode -c --agent build"
};

export function seatKey(where, name) {
  return `${where}:${name}`;
}

export function seatIsRestorable(seat) {
  if (!seat || typeof seat !== "object") return false;
  if (!SAFE_WORD.test(String(seat.name || ""))) return false;
  if (seat.where !== "local" && seat.where !== "cloud") return false;
  if (seat.kind === "shell") return true;
  if (seat.agent && !SAFE_WORD.test(String(seat.agent))) return false;
  const agent = otherAgent(seat);
  if (agent && seat.kind !== "structured") {
    if (!TUI_CONTINUES[agent]) return false;
  } else if (!(agent ? SAFE_SESSION : SAFE_ID).test(String(seat.id || ""))) return false;
  if (seat.cwd && !isSafePath(String(seat.cwd))) return false;
  if (seat.account && !SAFE_WORD.test(String(seat.account))) return false;
  if (seat.model && !SAFE_MODEL.test(String(seat.model))) return false;
  return true;
}

function otherAgent(seat) {
  return seat.agent && seat.agent !== "claude" ? seat.agent : "";
}

function structuredDriverCmd(seat, dir, autocompact = "") {
  const agent = otherAgent(seat);
  /* the model reaches a shell through tmux, and that shell may be zsh, which
     aborts on a glob that matches nothing — `opus[1m]` is exactly that. The
     charset in seatIsRestorable has no quote in it, so single quotes are safe. */
  const model = seat.model ? ` --model '${seat.model}'` : "";
  const compactAt = autocompact ? ` --autocompact ${autocompact}` : "";
  const asAgent = agent ? ` --agent ${agent}` : "";
  return `node ${dir}/${driverFileFor(agent || "claude")}${asAgent} --name ${seat.name} --cwd \\$PWD --resume-id ${seat.id}${model}${compactAt}`;
}

const posixOf = (path) => String(path).replace(/\\/g, "/");

/* the script runs in a POSIX shell wherever it was built, so the account folder it
   names is spelled with / even when the machine writing it is a Windows runner */
function accountPrefix(seat, hiveHome) {
  if (!seat.account) return "";
  const agent = otherAgent(seat) || "claude";
  const env = providerEnv(agent, accountDir(hiveHome, agent, seat.account));
  return carriedEnv(Object.fromEntries(Object.entries(env).map(([key, value]) => [key, posixOf(value)])));
}

function tuiContinueCmd(seat) {
  const model = seat.model ? ` --model '${seat.model}'` : "";
  return `${TUI_CONTINUES[otherAgent(seat)]}${model}`;
}

export function ownsFleet({ owns = "", sandbox = false } = {}) {
  return owns !== "0" && !sandbox;
}

export const REVIVE_WINDOW = 600000;

/* a seat we stop trying to bring back says why, because the fleet no longer
   forgets it: it goes to the archive, and the reason is all anybody has to
   tell "I closed it" apart from "the pod took it". */
export const GAVE_UP_DIED_AGAIN = "it came back and died again within ten minutes";
export const GAVE_UP_NOTHING_TO_RESUME = "nothing here can resume it — no transcript id, or a name, path or model this hive will not run";

export const HELD_STILL_ANSWERS = "its driver still answers on the seat's socket, so no second window is opened for it";

export const JOB_LINGERS_MS = 15000;
export const JOB_ABANDONED_MS = 300000;

export function settleSpawnJobs(jobs, alive, now = Date.now()) {
  for (const [id, job] of jobs) {
    const up = job.settled && job.name && alive.has(job.name);
    if (up && !job.landed) job.landed = now;
    else if (up ? now - job.landed > JOB_LINGERS_MS : job.landed || now - job.at > JOB_ABANDONED_MS) jobs.delete(id);
  }
}

export function forgetSpawnJobsOf(jobs, name, where) {
  for (const [id, job] of jobs) if (job.name === name && job.where === where) jobs.delete(id);
}

export function withoutTheLiving(restore, answering) {
  const held = restore.filter((seat) => answering.has(seat.name));
  return { restore: restore.filter((seat) => !answering.has(seat.name)), held };
}

export function fleetPlan(seats, sessionAlive, liveNames, now = Date.now()) {
  const restorable = seats.filter(seatIsRestorable);
  if (!sessionAlive) return { restore: restorable, prune: [] };
  const live = new Set(liveNames);
  const restore = [];
  const prune = [];
  for (const seat of seats) {
    if (live.has(seat.name)) continue;
    const diedAgain = seat.revivedAt && now - seat.revivedAt < REVIVE_WINDOW;
    if (!diedAgain && seatIsRestorable(seat)) restore.push(seat);
    else prune.push({ seat, why: diedAgain ? GAVE_UP_DIED_AGAIN : GAVE_UP_NOTHING_TO_RESUME });
  }
  return { restore, prune };
}

function claudeFlags(seat, remoteControl, autocompact = "") {
  const flags = ["--dangerously-skip-permissions"];
  if (remoteControl) flags.push(`--remote-control ${seat.name}`);
  if (seat.model) flags.push(`--model ${seat.model}`);
  if (autocompact) flags.push(`--autocompact ${autocompact}`);
  return flags.join(" ");
}

const WINDOW_SHAPE = (session, name) =>
  `tmux set-window-option -t "${session}:=${name}" window-size manual 2>/dev/null || true\n` +
  `tmux resize-window -t "${session}:=${name}" -x 200 -y 50 2>/dev/null || true`;

/* a tmux that is busy waking the machine answers "no server running" for a moment, and the
   tick reads that as every seat dead: the window is opened only when none carries the name,
   so a misread costs nothing instead of a second chat with the same conversation. */
const WINDOW_MISSING = (session, name) =>
  `! tmux list-windows -t ${session} -F '#W' 2>/dev/null | grep -qxF -- '${name}'`;

export function localRestoreScript(seats, { hub, hiveHome, shell = "bash", remoteControl = true, engineDir = "", autocompact = "" }) {
  const lines = [
    `tmux has-session -t hive-local 2>/dev/null || { tmux new-session -d -s hive-local -n hub "sleep 999999"; tmux set-option -t hive-local history-limit 20000; }`,
    `tmux set-option -t hive-local default-size 200x50 2>/dev/null || true`
  ];
  for (const seat of seats) {
    let cmd;
    const account = accountPrefix(seat, hiveHome);
    if (seat.kind === "shell") {
      cmd = `cd ${seat.cwd || hub} 2>/dev/null || cd ${hub}; ${hiveShellExec(shell, hiveHome)}`;
    } else if (seat.kind === "structured") {
      cmd = `cd ${seat.cwd || hub} 2>/dev/null || cd ${hub}; ` +
        `${account}HIVE_STATE_DIR=${hiveHome} ${structuredDriverCmd(seat, engineDir || `${hub}/${REPO_FOLDER}/server/engine`, autocompact)}`;
    } else if (otherAgent(seat)) {
      cmd = `cd ${seat.cwd || hub} 2>/dev/null || cd ${hub}; ` +
        `${account}HIVE_SEAT=${seat.name} HIVE_SIDE=local HIVE_STATE_DIR=${hiveHome} ${tuiContinueCmd(seat)}`;
    } else {
      cmd = `cd ${seat.cwd || hub} 2>/dev/null || cd ${hub}; ` +
        `${account}FORCE_HYPERLINK=1 claude --resume ${seat.id} ${claudeFlags(seat, remoteControl, autocompact)}`;
    }
    lines.push(`${WINDOW_MISSING("hive-local", seat.name)} && tmux new-window -d -t hive-local -n ${seat.name} "${cmd}"`);
    if (seat.kind === "shell") lines.push(`tmux set-window-option -t "hive-local:=${seat.name}" remain-on-exit on`);
    lines.push(WINDOW_SHAPE("hive-local", seat.name));
  }
  lines.push("true");
  return lines.join("\n");
}

export function archiveEntry(seat, at, why = "") {
  return { ...withoutRunState(seat), archivedAt: at, ...(why ? { why } : {}) };
}

export function seatFromArchive(entry) {
  const seat = withoutRunState(entry);
  delete seat.archivedAt;
  delete seat.why;
  return seat;
}

function withoutRunState(seat) {
  const copy = { ...seat };
  delete copy.revivedAt;
  delete copy.openedAt;
  return copy;
}

export function archiveOrder(entries) {
  return [...entries].sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
}

/* the restore script, spelled as programs and argv for the side that opens ptys itself:
   the same seats, the same flags, no shell to quote for */
export function localRestorePlan(seats, { hub, hiveHome, remoteControl = true, engineDir = "", autocompact = "" }) {
  return seats.map((seat) => {
    const cwd = seat.cwd || hub;
    const agent = otherAgent(seat);
    const account = seat.account ? providerEnv(agent || "claude", accountDir(hiveHome, agent || "claude", seat.account)) : {};
    const withModel = seat.model ? ["--model", seat.model] : [];
    if (seat.kind === "shell") return { name: seat.name, kind: "shell", cwd, fallback: hub, program: "shell", args: [], env: account };
    if (seat.kind === "structured") {
      const dir = engineDir || join(hub, REPO_FOLDER, "server", "engine");
      const args = [join(dir, driverFileFor(agent || "claude")), ...(agent ? ["--agent", agent] : []), "--name", seat.name, "--cwd", cwd, "--resume-id", seat.id, ...withModel];
      if (autocompact) args.push("--autocompact", autocompact);
      return { name: seat.name, kind: "structured", cwd, fallback: hub, program: "node", args, env: { ...account, HIVE_STATE_DIR: hiveHome } };
    }
    if (agent) {
      const [program, ...args] = TUI_CONTINUES[agent].split(" ");
      return { name: seat.name, kind: "chat", cwd, fallback: hub, program, args: [...args, ...withModel], env: { ...account, HIVE_SEAT: seat.name, HIVE_SIDE: "local", HIVE_STATE_DIR: hiveHome } };
    }
    const args = ["--resume", seat.id, "--dangerously-skip-permissions"];
    if (remoteControl) args.push("--remote-control", seat.name);
    args.push(...withModel);
    if (autocompact) args.push("--autocompact", autocompact);
    return { name: seat.name, kind: "chat", cwd, fallback: hub, program: "claude", args, env: { ...account, FORCE_HYPERLINK: "1" } };
  });
}

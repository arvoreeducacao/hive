const singleQuoted = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

export function tiedShellWindow({ session, seat, home, exec }) {
  return `tmux new-window -d -t ${session} -n ${singleQuoted(seat)} -c ${singleQuoted(home)} "${exec}"`;
}

const CONTROL = /[\u0000-\u001f\u007f]/;

const SHELL_PROGRAMS = /^-?(?:zsh|bash|sh|dash|ksh|mksh|tcsh|csh|fish|nu|elvish|xonsh|pwsh|login)$/;

export function foregroundProgram(command) {
  const name = String(command || "").trim().split("/").pop();
  return !name || SHELL_PROGRAMS.test(name) || CONTROL.test(name) ? "" : name.slice(0, 40);
}

export function shellHome({ cwd, ownerCwd, hub, isAbsolute, isDir }) {
  const usable = (path) => typeof path === "string" && path !== "" && isAbsolute(path) && !CONTROL.test(path) && isDir(path);
  return [cwd, ownerCwd].find(usable) || hub;
}

export const stillToRestore = (seat, inFleet) => inFleet(seat.where, seat.name) && (!seat.of || inFleet(seat.where, seat.of));

export const shellFolderUsable = (path) => typeof path === "string" && (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) && !CONTROL.test(path);

export function restoredShellWindow({ session, seat, home, hub, exec }) {
  const folder = home || hub;
  return `if [ -d ${singleQuoted(folder)} ]; then hive_dir=${singleQuoted(folder)}; else hive_dir=${singleQuoted(hub)}; fi; tmux new-window -d -t ${session} -n ${singleQuoted(seat)} -c "$hive_dir" "${exec}"`;
}

export function dropQueue({ kill, forget, setTimer, retryMs = 30000 }) {
  const pending = new Map();
  let timer = null;
  let running = false;
  const keyOf = (seat) => `${seat.where}:${seat.name}`;
  async function drain() {
    if (running) return;
    running = true;
    try {
      const tried = new Set();
      for (;;) {
        const next = [...pending].find(([key]) => !tried.has(key));
        if (!next) break;
        const [key, seat] = next;
        tried.add(key);
        const said = await Promise.resolve().then(() => kill(seat)).catch(() => ({ ok: false }));
        if (said?.ok === false) continue;
        pending.delete(key);
        forget(seat);
      }
    } finally {
      running = false;
    }
    if (pending.size && !timer) timer = setTimer(() => { timer = null; return drain(); }, retryMs);
  }
  return {
    retire(seat) {
      pending.set(keyOf(seat), { name: seat.name, where: seat.where });
      return drain();
    },
    drain,
    has: (seat) => pending.has(keyOf(seat)),
    get size() { return pending.size; }
  };
}

export function runnableFile(path, { stat, access, executable }) {
  try {
    if (!stat(path).isFile()) return false;
    access(path, executable);
    return true;
  } catch {
    return false;
  }
}

export function pickTerminalShell(chosen, { login, paths, runnable }) {
  const wanted = String(chosen || "").trim();
  if (!wanted) return login;
  if (wanted.includes("/")) return wanted.startsWith("/") && runnable(wanted) ? wanted : login;
  return paths.filter(Boolean).map((dir) => `${dir.replace(/\/+$/, "")}/${wanted}`).find(runnable) || login;
}

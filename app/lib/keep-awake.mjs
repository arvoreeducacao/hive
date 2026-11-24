export const KEEP_AWAKE_GRACE_MS = 60000;
export const KEEP_AWAKE_TICK_MS = 15000;
export const KEEP_AWAKE_RETRY_MS = 5000;
export const KEEP_AWAKE_RETRY_CEILING_MS = 10 * 60000;

export function inhibitorCommand(platform, serverPid) {
  if (platform === "darwin") return { command: "caffeinate", args: ["-i", "-w", String(serverPid)] };
  if (platform === "linux") {
    return {
      command: "systemd-inhibit",
      args: ["--what=idle:sleep", "--who=Hive", "--why=Agents are working", "--mode=block", "tail", `--pid=${serverPid}`, "-f", "/dev/null"]
    };
  }
  return null;
}

export const keepAwakeRunsHere = (env = process.env) => !env.HIVE_SANDBOX && !env.KUBERNETES_SERVICE_HOST && !env.NODE_TEST_CONTEXT;

export const agentsWorkHere = (sessions) => (sessions || []).some((one) => one?.where === "local" && one?.state === "working");

export function createKeepAwakeTick({ keepAwake, readSetting, readSessions }) {
  let latest = 0;
  return async function keepAwakeTick() {
    const turn = ++latest;
    const enabled = await readSetting();
    if (turn !== latest) return;
    if (!enabled) return keepAwake.update({ enabled: false, working: false });
    const sessions = await readSessions();
    if (turn !== latest) return;
    keepAwake.update({ enabled: true, working: agentsWorkHere(sessions) });
  };
}

export function createKeepAwake({
  command,
  spawn,
  grace = KEEP_AWAKE_GRACE_MS,
  retry = KEEP_AWAKE_RETRY_MS,
  retryCeiling = KEEP_AWAKE_RETRY_CEILING_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  log = () => {}
}) {
  let child = null;
  let wanted = false;
  let releaseTimer = null;
  let retryTimer = null;
  let wait = retry;

  const drop = (timer) => {
    if (timer) clearTimer(timer);
    return null;
  };

  function tryAgain(why) {
    log(`hive: the sleep inhibitor stopped (${why}); trying again in ${Math.round(wait / 1000)} s`);
    retryTimer = setTimer(() => {
      retryTimer = null;
      if (wanted) hold();
    }, wait);
    wait = Math.min(wait * 2, retryCeiling);
  }

  function hold() {
    if (child || retryTimer || !command) return;
    let held;
    try {
      held = spawn(command.command, command.args);
    } catch (wrong) {
      tryAgain(String(wrong?.message || wrong));
      return;
    }
    child = held;
    log(`hive: keeping the computer awake while agents work (${command.command}, pid ${held.pid})`);
    const gone = (why) => {
      if (child !== held) return;
      child = null;
      if (wanted) tryAgain(why);
    };
    held.on("error", (wrong) => gone(String(wrong?.message || wrong)));
    held.on("exit", (code, signal) => gone(signal ? `signal ${signal}` : `exit ${code}`));
  }

  function release() {
    releaseTimer = drop(releaseTimer);
    retryTimer = drop(retryTimer);
    wait = retry;
    if (!child) return;
    const held = child;
    child = null;
    try { held.kill(); } catch {}
    log("hive: released the sleep inhibitor, the computer may sleep again");
  }

  function update({ enabled, working }) {
    if (!enabled || !command) {
      wanted = false;
      release();
      return;
    }
    if (working) {
      wanted = true;
      releaseTimer = drop(releaseTimer);
      hold();
      return;
    }
    if (!wanted || releaseTimer) return;
    releaseTimer = setTimer(() => {
      releaseTimer = null;
      wanted = false;
      release();
    }, grace);
  }

  function stop() {
    wanted = false;
    release();
  }

  return { update, stop, holding: () => !!child };
}

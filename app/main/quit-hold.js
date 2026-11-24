const QUIT_HOLD_MS = 1200;
const QUIT_TWICE_MS = 500;
const QUIT_RELEASE_GRACE_MS = 600;
const QUIT_REPEAT_FACTOR = 2;
const QUIT_MODES = ["hold", "twice", "direct"];
const QUIT_DEFAULT = "hold";

const quitModeOf = (raw) => (QUIT_MODES.includes(raw) ? raw : QUIT_DEFAULT);

function quitShortcut({ mac, mode, notify, conceal, quit, now = () => Date.now(), later = setTimeout, cancel = clearTimeout }) {
  const modifier = mac ? "meta" : "control";
  let watchdog = null;
  let holding = false;
  let shown = null;
  let armed = false;
  let quitOnRelease = false;
  let heldSince = 0;
  let lastPress = 0;
  let lastRepeat = 0;
  let cadence = 0;

  const stopWatchdog = () => {
    if (watchdog !== null) cancel(watchdog);
    watchdog = null;
  };

  const release = (keepTwiceHint = false) => {
    if (!holding && !shown) return;
    const keep = keepTwiceHint && shown === "twice";
    holding = false;
    armed = false;
    quitOnRelease = false;
    lastRepeat = 0;
    cadence = 0;
    if (keep) return;
    stopWatchdog();
    if (shown) {
      shown = null;
      notify({ state: "up" });
    }
  };

  const quitNow = () => {
    release();
    lastPress = 0;
    quit();
  };

  const quitAfterQuiet = () => {
    stopWatchdog();
    watchdog = later(quitNow, Math.max(QUIT_RELEASE_GRACE_MS, cadence * QUIT_REPEAT_FACTOR));
  };

  return (event, input) => {
    const key = String(input.key || "").toLowerCase();
    if (input.type === "keyUp") {
      if (key === "q") {
        const go = quitOnRelease;
        release(true);
        if (go) quit();
      } else if (key === modifier) {
        if (quitOnRelease) quitAfterQuiet();
        else release(true);
      }
      return;
    }
    if (input.type !== "keyDown") return;
    const held = mac ? !!input.meta : !!input.control;
    if (input.isAutoRepeat && held && key === "q") {
      const at = now();
      cadence = at - (lastRepeat === 0 ? heldSince : lastRepeat);
      lastRepeat = at;
    }
    if (quitOnRelease) {
      event.preventDefault();
      if (key === "q") quitAfterQuiet();
      return;
    }
    if (!held || input.alt || input.shift || key !== "q") {
      if (key === modifier && !input.alt && !input.shift) return;
      if (!input.isAutoRepeat) {
        lastPress = 0;
        release();
      }
      return;
    }
    const chosen = quitModeOf(mode());
    if (chosen === "direct") return;
    event.preventDefault();
    if (input.isAutoRepeat) {
      if (shown === "hold" && armed && now() - heldSince >= QUIT_HOLD_MS) {
        armed = false;
        quitOnRelease = true;
        conceal();
        quitAfterQuiet();
      }
      return;
    }
    const at = now();
    const before = lastPress;
    lastPress = at;
    if (holding || shown) release();
    if (before !== 0 && at - before <= QUIT_TWICE_MS) return quitNow();
    holding = true;
    heldSince = at;
    shown = chosen;
    notify({ state: "down", mode: chosen, holdMs: QUIT_HOLD_MS });
    if (chosen === "twice") {
      watchdog = later(() => release(), QUIT_TWICE_MS);
      return;
    }
    armed = true;
    watchdog = later(() => {
      watchdog = null;
      release();
    }, QUIT_HOLD_MS + QUIT_RELEASE_GRACE_MS);
  };
}

module.exports = { QUIT_DEFAULT, QUIT_HOLD_MS, QUIT_MODES, QUIT_TWICE_MS, quitModeOf, quitShortcut };

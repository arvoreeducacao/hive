const { closeSync, openSync } = require("node:fs");
const { join } = require("node:path");

const PERMISSIONS = {
  microphone: "Privacy_Microphone",
  screen: "Privacy_ScreenCapture",
  accessibility: "Privacy_Accessibility",
  disk: "Privacy_AllFiles"
};

const PERMISSION_KINDS = Object.keys(PERMISSIONS);

const WATCH_EVERY_MS = 1000;

const WATCH_FOR_MS = 180000;

const isPermission = (kind) => PERMISSION_KINDS.includes(kind);

const settingsUrlOf = (kind) => `x-apple.systempreferences:com.apple.preference.security?${PERMISSIONS[kind]}`;

function canOpen(file) {
  try {
    closeSync(openSync(file, "r"));
    return true;
  } catch {
    return false;
  }
}

const protectedFileOf = (home) => join(home, "Library", "Application Support", "com.apple.TCC", "TCC.db");

function mediaStatus(said) {
  if (said === "granted") return "granted";
  if (said === "not-determined") return "unasked";
  return "denied";
}

function permissionStatus(kind, { systemPreferences, home, readable = canOpen }) {
  if (kind === "microphone" || kind === "screen") return mediaStatus(systemPreferences.getMediaAccessStatus(kind));
  if (kind === "accessibility") return systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "denied";
  if (kind === "disk") return readable(protectedFileOf(home)) ? "granted" : "denied";
  return "denied";
}

function permissionsNow(deps) {
  return Object.fromEntries(PERMISSION_KINDS.map((kind) => [kind, permissionStatus(kind, deps)]));
}

function createPermissionWatch({ status, tell, every = WATCH_EVERY_MS, lasting = WATCH_FOR_MS, clock = { setInterval, clearInterval, now: Date.now } }) {
  const watching = new Map();
  const stop = (kind) => {
    const one = watching.get(kind);
    if (!one) return;
    clock.clearInterval(one.timer);
    watching.delete(kind);
  };
  const watch = (kind) => {
    stop(kind);
    const started = clock.now();
    let was = status(kind);
    const timer = clock.setInterval(() => {
      const now = status(kind);
      if (now !== was) {
        was = now;
        tell(kind, now);
      }
      if (now === "granted" || clock.now() - started >= lasting) stop(kind);
    }, every);
    watching.set(kind, { timer });
  };
  return { watch, stop, watching: () => [...watching.keys()] };
}

module.exports = { PERMISSIONS, PERMISSION_KINDS, WATCH_EVERY_MS, WATCH_FOR_MS, createPermissionWatch, isPermission, permissionStatus, permissionsNow, protectedFileOf, settingsUrlOf };

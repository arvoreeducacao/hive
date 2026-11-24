const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { PERMISSION_KINDS, createPermissionWatch, isPermission, permissionStatus, permissionsNow, protectedFileOf, settingsUrlOf } = require("../main/mac-permissions.js");

const main = readFileSync(join(__dirname, "..", "main.js"), "utf8");
const preload = readFileSync(join(__dirname, "..", "main", "preload.js"), "utf8");

const prefs = (media, trusted) => ({ getMediaAccessStatus: (kind) => media[kind], isTrustedAccessibilityClient: () => trusted });

test("the four permissions open their own pane of Privacy & Security", () => {
  assert.deepEqual(PERMISSION_KINDS, ["microphone", "screen", "accessibility", "disk"]);
  assert.equal(settingsUrlOf("screen"), "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  assert.equal(settingsUrlOf("disk"), "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
  assert.equal(isPermission("camera"), false);
});

test("each permission is read the way macOS exposes it", () => {
  const deps = { systemPreferences: prefs({ microphone: "not-determined", screen: "denied" }, true), home: "/Users/someone", readable: (file) => file === protectedFileOf("/Users/someone") };
  assert.deepEqual(permissionsNow(deps), { microphone: "unasked", screen: "denied", accessibility: "granted", disk: "granted" });
  assert.equal(permissionStatus("disk", { ...deps, readable: () => false }), "denied");
  assert.equal(permissionStatus("screen", { ...deps, systemPreferences: prefs({ screen: "granted" }, false) }), "granted");
  assert.equal(permissionStatus("accessibility", { ...deps, systemPreferences: prefs({}, false) }), "denied");
});

function fakeClock() {
  const timers = new Map();
  let id = 0;
  let now = 0;
  return {
    clock: { setInterval: (fn) => { timers.set(++id, fn); return id; }, clearInterval: (one) => timers.delete(one), now: () => now },
    tick(ms) { now += ms; for (const fn of [...timers.values()]) fn(); },
    count: () => timers.size
  };
}

test("watching tells each change, and stops once the permission is on", () => {
  const states = ["denied", "denied", "granted"];
  const told = [];
  const time = fakeClock();
  const watch = createPermissionWatch({ status: () => states.shift() ?? "granted", tell: (kind, status) => told.push([kind, status]), clock: time.clock });
  watch.watch("accessibility");
  time.tick(1000);
  assert.deepEqual(told, []);
  time.tick(1000);
  assert.deepEqual(told, [["accessibility", "granted"]]);
  assert.equal(time.count(), 0);
  assert.deepEqual(watch.watching(), []);
});

test("watching gives up after its time, and a second ask replaces the first", () => {
  const time = fakeClock();
  const watch = createPermissionWatch({ status: () => "denied", tell: () => {}, lasting: 3000, clock: time.clock });
  watch.watch("disk");
  watch.watch("disk");
  assert.equal(time.count(), 1);
  time.tick(1000);
  time.tick(2500);
  assert.equal(time.count(), 0);
});

test("main answers the page and the preload hands it the three calls", () => {
  assert.match(main, /require\("\.\/main\/mac-permissions\.js"\)/);
  assert.match(main, /const fromMainWindow = \(event\) => !!window_ && !window_\.isDestroyed\(\) && event\.sender === window_\.webContents;/);
  assert.match(main, /ipcMain\.handle\("hive:permissions", \(event\) => \{\n\s+if \(!fromMainWindow\(event\)\) return \{ error:/);
  assert.match(main, /ipcMain\.handle\("hive:permission-open", async \(event, kind\) => \{\n\s+if \(!fromMainWindow\(event\)\) return \{ error:[^\n]*\n\s+if \(!IS_MAC \|\| !macPermissions\.isPermission\(kind\)\) return/);
  assert.match(main, /window_\.webContents\.send\("hive:permission-changed", kind, status\)/);
  assert.match(preload, /exposeInMainWorld\("hiveMacPermissions", \{\n\s+now: \(\) => ipcRenderer\.invoke\("hive:permissions"\),\n\s+open: \(kind\) => ipcRenderer\.invoke\("hive:permission-open", String\(kind\)\),/);
});

import { execFile as execFileNode, spawn as spawnNode } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BOOT_TIMEOUT = 150000;
export const SHOT_TIMEOUT = 5000;
export const INPUT_TIMEOUT = 8000;
export const TREE_TIMEOUT = 15000;
export const FRAME_FRESH = 150;
export const RECORD_LIMIT = 180;
export const RECORD_BITRATE = 8000000;
export const RECORD_MIN_RUN = 1500;
export const RECORD_TRIES = 3;
export const LOG_LINES = 200;
export const LOG_LINES_MAX = 2000;
export const DEFAULT_AVD = "hive-pixel";
export const avdAbiOf = (arch = process.arch) => (arch === "arm64" ? "arm64-v8a" : "x86_64");
export const AVD_IMAGE = `system-images;android-35;google_apis_playstore;${avdAbiOf()}`;
export const AVD_RECIPE = `echo no | avdmanager create avd -n ${DEFAULT_AVD} -k "${AVD_IMAGE}" -d pixel_7 && ` +
  `sed -i.bak -e 's/^hw.ramSize=.*/hw.ramSize=2048/' -e 's/^vm.heapSize=.*/vm.heapSize=256/' -e 's/^hw.gpu.enabled=.*/hw.gpu.enabled=yes/' -e 's/^hw.keyboard=.*/hw.keyboard=yes/' -e 's/^disk.dataPartition.size=.*/disk.dataPartition.size=6442450944/' -e '/^disk.dataPartition.path=/d' ~/.android/avd/${DEFAULT_AVD}.avd/config.ini`;

export function appPackagesOf(told = process.env.HIVE_APP_PACKAGES || "") {
  const found = {};
  for (const pair of String(told).split(",")) {
    const [name, id] = pair.split("=").map((one) => one.trim());
    if (name && id) found[name.toLowerCase()] = id;
  }
  return found;
}

export const APP_PACKAGES = appPackagesOf();
export const KEYS = { HOME: "KEYCODE_HOME", BACK: "KEYCODE_BACK", ENTER: "KEYCODE_ENTER", TAB: "KEYCODE_TAB", DEL: "KEYCODE_DEL", DELETE: "KEYCODE_DEL", MENU: "KEYCODE_MENU", POWER: "KEYCODE_POWER", VOLUME_UP: "KEYCODE_VOLUME_UP", VOLUME_DOWN: "KEYCODE_VOLUME_DOWN", RECENTS: "KEYCODE_APP_SWITCH" };

export function sdkRootOf(env = process.env, home = homedir(), platform = process.platform) {
  const told = String(env.ANDROID_HOME || env.ANDROID_SDK_ROOT || "").trim();
  if (told) return told;
  if (!home) return "";
  return platform === "darwin" ? join(home, "Library/Android/sdk") : join(home, "Android/Sdk");
}

export function avdHomeOf(env = process.env, home = homedir()) {
  const told = String(env.ANDROID_AVD_HOME || "").trim();
  if (told) return told;
  return home ? join(home, ".android/avd") : "";
}

export function toolsOf(root, exe = process.platform === "win32" ? ".exe" : "") {
  if (!root) return null;
  return {
    root,
    adb: join(root, "platform-tools", `adb${exe}`),
    emulator: join(root, "emulator", `emulator${exe}`),
    avdmanager: join(root, "cmdline-tools/latest/bin/avdmanager")
  };
}

export function avdNamesIn(dir, list = readdirSync) {
  let names = [];
  try { names = list(dir); } catch { return []; }
  return names.filter((one) => one.endsWith(".ini")).map((one) => one.slice(0, -4)).sort();
}

export function chooseAvd(avds, asked) {
  const wanted = String(asked || "").trim();
  if (wanted) {
    if (avds.includes(wanted)) return { avd: wanted };
    return { error: avds.length ? `no AVD called "${wanted}" — the ones here are ${avds.join(", ")}` : `no AVD called "${wanted}", and none exists yet — create one with: ${AVD_RECIPE}` };
  }
  if (avds.length === 1) return { avd: avds[0] };
  if (avds.includes(DEFAULT_AVD)) return { avd: DEFAULT_AVD };
  if (!avds.length) return { error: `no Android AVD on this machine — create one with: ${AVD_RECIPE}` };
  return { error: `${avds.length} AVDs here (${avds.join(", ")}) and none is ${DEFAULT_AVD} — say which one with avd` };
}

export function parseDevices(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(device|offline|unauthorized|bootloader|recovery)$/);
    if (m) out.push({ serial: m[1], state: m[2] });
  }
  return out;
}

export const isEmulatorSerial = (serial) => /^emulator-\d+$/.test(String(serial || ""));

export function parseWmSize(text) {
  const raw = String(text || "");
  const m = raw.match(/Override size:\s*(\d+)x(\d+)/) || raw.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

export function parseAvdName(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = lines.find((l) => l !== "OK");
  return name || "";
}

const unescapeXml = (s) => String(s || "").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

export function parseUiTree(xml) {
  const nodes = [];
  for (const hit of String(xml || "").matchAll(/<node\b([^>]*)\/?>/g)) {
    const attrs = {};
    for (const a of hit[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = unescapeXml(a[2]);
    const text = attrs.text || "";
    const desc = attrs["content-desc"] || "";
    const id = attrs["resource-id"] || "";
    if (!text && !desc && !id) continue;
    const b = String(attrs.bounds || "").match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    nodes.push({
      text,
      desc,
      id,
      cls: attrs.class || "",
      bounds: b ? [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])] : null,
      clickable: attrs.clickable === "true"
    });
  }
  return nodes;
}

export function inputTextArg(text) {
  return String(text || "")
    .replace(/[\\&'"()<>|;$`*?\[\]{}~#!]/g, (c) => `\\${c}`)
    .replace(/ /g, "%s");
}

export function packageOf(app, known = APP_PACKAGES) {
  const said = String(app || "").trim();
  if (!said) return "";
  return known[said.toLowerCase()] || said;
}

export function keyCodeOf(key) {
  const said = String(key ?? "").trim();
  if (!said) return "";
  if (/^\d+$/.test(said)) return said;
  const upper = said.toUpperCase();
  if (KEYS[upper]) return KEYS[upper];
  if (/^KEYCODE_[A-Z0-9_]+$/.test(upper)) return upper;
  if (/^[A-Z0-9_]+$/.test(upper)) return `KEYCODE_${upper}`;
  return "";
}

export function androidKeyOf(key) {
  const code = keyCodeOf(key);
  if (!code) return { error: `unknown key "${key}" — use HOME, BACK, ENTER, TAB, a KEYCODE_* name or a number` };
  return { code };
}

export const hasGpuOf = (platform = process.platform, display = "") => platform === "darwin" || platform === "win32" || Boolean(display);

export function bootArgs({ avd, window = false, display = "", platform = process.platform } = {}) {
  const args = ["-avd", avd, "-no-audio", "-no-boot-anim", "-accel", "on"];
  if (!window) args.push("-no-window");
  args.push("-gpu", hasGpuOf(platform, display) ? "host" : "swiftshader_indirect");
  return args;
}

export function recordArgs(serial, { limit = RECORD_LIMIT, bitrate = RECORD_BITRATE } = {}) {
  return [
    ...(serial ? ["-s", serial] : []),
    "exec-out", "screenrecord", "--output-format=h264",
    "--time-limit", String(limit), "--bit-rate", String(bitrate), "-"
  ];
}

export function pointOnDevice(click, box, natural) {
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  if (!(scale > 0)) return null;
  const drawnW = natural.width * scale;
  const drawnH = natural.height * scale;
  const left = (box.width - drawnW) / 2;
  const top = (box.height - drawnH) / 2;
  const x = (click.x - left) / scale;
  const y = (click.y - top) / scale;
  if (x < 0 || y < 0 || x > natural.width || y > natural.height) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runFile(cmd, args, { timeout = INPUT_TIMEOUT, encoding = "utf8", maxBuffer = 16 << 20, env } = {}) {
  return new Promise((resolve) => {
    execFileNode(cmd, args, { timeout, encoding, maxBuffer, env: env || process.env }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout, err: err ? String(stderr || err.message || "").trim() : "" });
    });
  });
}

export function createDriver({ tools, exec = runFile, spawn = spawnNode, env = process.env, avdHome = avdHomeOf(env), now = Date.now } = {}) {
  if (!tools) throw new Error("the android driver needs the sdk tools");
  const adb = (serial, args, opts) => exec(tools.adb, serial ? ["-s", serial, ...args] : args, opts);

  async function devices() {
    const r = await adb("", ["devices"]);
    return parseDevices(r.out).filter((d) => d.state === "device" && isEmulatorSerial(d.serial)).map((d) => d.serial);
  }

  async function avdOf(serial) {
    const r = await adb(serial, ["emu", "avd", "name"], { timeout: 4000 });
    return r.ok ? parseAvdName(r.out) : "";
  }

  async function running() {
    const serials = await devices();
    const out = [];
    for (const serial of serials) out.push({ serial, avd: await avdOf(serial) });
    return out;
  }

  const avds = () => avdNamesIn(avdHome);

  async function booted(serial) {
    const r = await adb(serial, ["shell", "getprop", "sys.boot_completed"], { timeout: 4000 });
    return r.ok && r.out.trim() === "1";
  }

  async function size(serial) {
    const r = await adb(serial, ["shell", "wm", "size"], { timeout: 6000 });
    return parseWmSize(r.out) || { width: 0, height: 0 };
  }

  function launch(avd, { window = false } = {}) {
    const display = String(env.DISPLAY || "").trim();
    const child = spawn(tools.emulator, bootArgs({ avd, window, display }), { detached: true, stdio: "ignore", env });
    child.unref?.();
    return child;
  }

  async function findSerial(avd, deadline) {
    while (now() < deadline) {
      for (const one of await running()) if (one.avd === avd) return one.serial;
      await sleep(1500);
    }
    return "";
  }

  async function waitBoot(serial, deadline) {
    while (now() < deadline) {
      if (await booted(serial)) return true;
      await sleep(1500);
    }
    return false;
  }

  async function boot({ avd, window = false, timeout = BOOT_TIMEOUT } = {}) {
    const started = now();
    const deadline = started + timeout;
    const already = (await running()).find((one) => one.avd === avd);
    let serial = already?.serial || "";
    let fresh = false;
    if (!serial) {
      if (!existsSync(tools.emulator)) return { error: `no emulator binary at ${tools.emulator} — install it with: sdkmanager "emulator"` };
      launch(avd, { window });
      fresh = true;
      serial = await findSerial(avd, deadline);
      if (!serial) return { error: `the emulator for ${avd} never showed up in adb devices within ${Math.round(timeout / 1000)}s — run it by hand to see why: ${tools.emulator} ${bootArgs({ avd, window, display: env.DISPLAY || "" }).join(" ")}` };
    }
    if (!(await waitBoot(serial, deadline))) return { error: `${avd} (${serial}) did not finish booting within ${Math.round(timeout / 1000)}s` };
    const dims = await size(serial);
    return { serial, avd, fresh, bootMs: now() - started, ...dims };
  }

  async function openApp(serial, pkg) {
    const r = await adb(serial, ["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 15000 });
    if (!r.ok || /No activities found|monkey aborted/i.test(r.out + r.err)) {
      const listed = await adb(serial, ["shell", "pm", "list", "packages"], { timeout: 8000 });
      const near = listed.out.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter((p) => p && p.includes(pkg.split(".").pop()));
      return { error: `no app ${pkg} on ${serial}${near.length ? ` — did you mean ${near.join(", ")}?` : " — install it first (expo run:android --device <avd>)"}` };
    }
    return { ok: true, app: pkg };
  }

  async function shot(serial) {
    const r = await adb(serial, ["exec-out", "screencap", "-p"], { timeout: SHOT_TIMEOUT, encoding: "buffer", maxBuffer: 64 << 20 });
    if (!r.ok || !r.out || r.out.length < 8) return { error: `screencap on ${serial} gave nothing${r.err ? `: ${r.err}` : ""} — on android-36.1 images screencap is broken; use ${AVD_IMAGE}` };
    return { png: r.out };
  }

  const tap = (serial, x, y) => adb(serial, ["shell", "input", "tap", String(x), String(y)]);
  const swipe = (serial, x1, y1, x2, y2, ms) => adb(serial, ["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(ms)]);
  const type = (serial, text) => adb(serial, ["shell", "input", "text", inputTextArg(text)]);
  const key = (serial, resolved) => adb(serial, ["shell", "input", "keyevent", resolved.code]);

  function record(serial, { onChunk, onEnd, limit = RECORD_LIMIT, bitrate = RECORD_BITRATE } = {}) {
    let child = null;
    let stopped = false;
    let short = 0;
    const run = () => {
      const began = now();
      child = spawn(tools.adb, recordArgs(serial, { limit, bitrate }), { stdio: ["ignore", "pipe", "ignore"], env });
      child.stdout?.on("data", (chunk) => { short = 0; onChunk?.(chunk); });
      child.on("error", () => { stopped = true; onEnd?.("the recorder could not be started"); });
      child.on("close", () => {
        if (stopped) return;
        if (now() - began < RECORD_MIN_RUN && ++short >= RECORD_TRIES) {
          stopped = true;
          return onEnd?.("the device stopped sending video");
        }
        run();
      });
    };
    run();
    return { stop() { stopped = true; child?.kill?.(); } };
  }

  async function tree(serial) {
    const dumped = await adb(serial, ["shell", "uiautomator", "dump", "/sdcard/ui.xml"], { timeout: TREE_TIMEOUT });
    if (!dumped.ok) return { error: `uiautomator could not dump the screen: ${dumped.err || dumped.out.trim()}` };
    const xml = await adb(serial, ["exec-out", "cat", "/sdcard/ui.xml"], { timeout: TREE_TIMEOUT });
    const nodes = parseUiTree(xml.out);
    return { nodes, count: nodes.length };
  }

  async function logs(serial, { lines = LOG_LINES, pkg = "" } = {}) {
    const args = ["logcat", "-d", "-t", String(lines)];
    if (pkg) {
      const pid = await adb(serial, ["shell", "pidof", pkg], { timeout: 4000 });
      const found = pid.out.trim().split(/\s+/)[0];
      if (/^\d+$/.test(found)) args.push(`--pid=${found}`);
    }
    const r = await adb(serial, args, { timeout: 15000 });
    return { lines: r.out.split("\n").filter(Boolean) };
  }

  const keyOf = androidKeyOf;

  const kill = (serial) => adb(serial, ["emu", "kill"], { timeout: 8000 });

  return { devices, running, avds, avdOf, booted, size, boot, openApp, shot, record, tap, swipe, type, key, keyOf, tree, logs, kill, launch };
}

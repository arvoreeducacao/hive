import { execFile as execFileNode, spawn as spawnNode } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOG_LINES, RECORD_MIN_RUN, RECORD_TRIES, SHOT_TIMEOUT, INPUT_TIMEOUT } from "./device.mjs";

export const BOOT_TIMEOUT = 150000;
export const SETTLE_TIMEOUT = 15000;
export const HELPER_FPS = 30;
export const HELPER_BITRATE = 6000000;
export const LOG_WINDOW_MINUTES = 5;
export const XCRUN = "/usr/bin/xcrun";
export const CLANG = "/usr/bin/clang";
export const HELPER_FRAMEWORKS = ["Foundation", "CoreMedia", "CoreVideo", "VideoToolbox", "IOSurface"];

export const BAGUETTE_VERSION = "0.1.96";
export const BAGUETTE_SHA256 = "c4e3a1ebe75cc1017abab6daff252f0877316d73201aaa95c84181063d280f73";
export const BAGUETTE_URL = `https://github.com/tddworks/baguette/releases/download/v${BAGUETTE_VERSION}/baguette_v${BAGUETTE_VERSION}_macOS_arm64.tar.gz`;
export const BAGUETTE_ENTRY = `baguette-v${BAGUETTE_VERSION}-macOS-arm64/Baguette`;
export const BAGUETTE_NAME = `baguette-${BAGUETTE_VERSION}`;
export const BAGUETTE_ARCH = "arm64";
export const BAGUETTE_BREW = ["/opt/homebrew/bin/baguette", "/usr/local/bin/baguette"];
export const BAGUETTE_RECIPE =
  `download baguette ${BAGUETTE_VERSION} (Apache-2.0) from ${BAGUETTE_URL}, ` +
  "put the Baguette executable on PATH as baguette, or point HIVE_BAGUETTE at it";

export const BUTTONS = { HOME: "home", LOCK: "lock", POWER: "lock", SIRI: "siri", VOLUME_UP: "volume-up", VOLUME_DOWN: "volume-down" };
export const HID_KEYS = { ENTER: 40, RETURN: 40, ESC: 41, ESCAPE: 41, DEL: 42, DELETE: 42, BACKSPACE: 42, TAB: 43, SPACE: 44 };

export function baguettePathOf(env = process.env) {
  return String(env.HIVE_BAGUETTE || "").trim();
}

export function untarArgs(tarball, into, entry = BAGUETTE_ENTRY) {
  return ["-xzf", tarball, "-C", into, "--strip-components=1", entry];
}

export async function fetchBytes(url) {
  const said = await fetch(url, { redirect: "follow" });
  if (!said.ok) throw new Error(`${said.status} from ${url}`);
  return Buffer.from(await said.arrayBuffer());
}

export function iosToolsOf({ env = process.env, home = homedir(), here = dirname(fileURLToPath(import.meta.url)) } = {}) {
  return {
    xcrun: XCRUN,
    clang: CLANG,
    baguette: baguettePathOf(env),
    source: join(here, "..", "native", "simscreen.m"),
    cacheDir: join(String(env.HIVE_HOME || join(home, ".hive")), "native")
  };
}

export function helperNameOf(source, read = readFileSync) {
  const stamp = createHash("sha256").update(read(source)).digest("hex").slice(0, 12);
  return `simscreen-${stamp}`;
}

export function helperArgs(udid, { fps = HELPER_FPS, bitrate = HELPER_BITRATE } = {}) {
  return ["--udid", udid, "--fps", String(fps), "--bitrate", String(bitrate)];
}

export function buildArgs(source, out, frameworks = HELPER_FRAMEWORKS) {
  return ["-fobjc-arc", "-O2", "-o", out, source, ...frameworks.flatMap((one) => ["-framework", one])];
}

export function parseSimList(text) {
  let listing = null;
  try { listing = JSON.parse(String(text || "")); } catch { return []; }
  const found = [];
  for (const [runtime, devices] of Object.entries(listing?.devices || {})) {
    for (const one of devices || []) {
      if (one.isAvailable === false) continue;
      found.push({
        udid: String(one.udid || ""),
        name: String(one.name || ""),
        state: String(one.state || ""),
        runtime: String(runtime || "").replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, "").replace(/-/g, " ")
      });
    }
  }
  return found.filter((one) => one.udid);
}

export function chooseSim(sims, asked) {
  const wanted = String(asked || "").trim();
  if (!sims.length) return { error: "no iOS simulator on this machine — open Xcode once so it installs a runtime" };
  if (wanted) {
    const hit = sims.find((one) => one.udid.toLowerCase() === wanted.toLowerCase() || one.name === wanted);
    if (hit) return { sim: hit };
    return { error: `no simulator called "${wanted}" — the ones here are ${sims.map((one) => one.name).join(", ")}` };
  }
  const booted = sims.find((one) => one.state === "Booted");
  if (booted) return { sim: booted };
  const iphone = sims.filter((one) => /^iPhone/i.test(one.name));
  if (iphone.length) return { sim: iphone[0] };
  return { sim: sims[0] };
}

export function parsePngSize(png) {
  if (!png || png.length < 24) return null;
  if (png.readUInt32BE(12) !== 0x49484452) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export function tapArgs(udid, x, y, width, height) {
  return ["tap", "--udid", udid, "--x", String(x), "--y", String(y), "--width", String(width), "--height", String(height)];
}

export function swipeArgs(udid, x1, y1, x2, y2, ms, width, height) {
  return [
    "swipe", "--udid", udid,
    "--start-x", String(x1), "--start-y", String(y1),
    "--end-x", String(x2), "--end-y", String(y2),
    "--width", String(width), "--height", String(height),
    "--duration", String(Math.max(0.05, ms / 1000))
  ];
}

export function keyOf(key) {
  const said = String(key ?? "").trim();
  if (!said) return { error: "there is no key to press" };
  const upper = said.toUpperCase();
  if (BUTTONS[upper]) return { button: BUTTONS[upper] };
  if (HID_KEYS[upper]) return { code: HID_KEYS[upper] };
  if (/^\d+$/.test(said)) return { code: Number(said) };
  if (/^KEYCODE_/.test(upper)) {
    const bare = upper.replace(/^KEYCODE_/, "");
    if (BUTTONS[bare]) return { button: BUTTONS[bare] };
    if (HID_KEYS[bare]) return { code: HID_KEYS[bare] };
  }
  return { error: `unknown key "${said}" — on iOS use HOME, LOCK, SIRI, ENTER, TAB, DEL, ESC, SPACE or a HID usage number` };
}

export function keyArgs(udid, resolved) {
  if (resolved.button) return ["press", "--udid", udid, "--button", resolved.button];
  return ["key", "--udid", udid, "--code", String(resolved.code)];
}

export function lastLines(text, lines) {
  const all = String(text || "").split("\n").filter(Boolean);
  return all.slice(-Math.max(1, lines));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runFile(cmd, args, { timeout = INPUT_TIMEOUT, encoding = "utf8", maxBuffer = 16 << 20, env } = {}) {
  return new Promise((resolve) => {
    execFileNode(cmd, args, { timeout, encoding, maxBuffer, env: env || process.env }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout, err: err ? String(stderr || err.message || "").trim() : "" });
    });
  });
}

export function createIosDriver({
  tools,
  exec = runFile,
  spawn = spawnNode,
  env = process.env,
  now = Date.now,
  exists = existsSync,
  makeDir = mkdirSync,
  nameHelper = helperNameOf,
  grabBytes = fetchBytes,
  putFile = writeFile,
  moveFile = rename,
  dropFile = unlink,
  makeRunnable = chmod,
  arch = process.arch,
  wantSha = BAGUETTE_SHA256
} = {}) {
  if (!tools) throw new Error("the ios driver needs the simulator tools");
  const simctl = (args, opts) => exec(tools.xcrun, ["simctl", ...args], opts);
  let helper = "";
  let baguette = "";

  async function ensureHelper() {
    if (helper) return { bin: helper };
    if (!exists(tools.source)) return { error: `the screen helper source is missing at ${tools.source}` };
    const out = join(tools.cacheDir, nameHelper(tools.source));
    if (exists(out)) { helper = out; return { bin: out }; }
    try { makeDir(tools.cacheDir, { recursive: true }); } catch {}
    const built = await exec(tools.clang, buildArgs(tools.source, out), { timeout: 60000 });
    if (!built.ok || !exists(out)) return { error: `could not build the screen helper: ${built.err || "clang said nothing"}` };
    helper = out;
    return { bin: out };
  }

  async function sims() {
    const r = await simctl(["list", "devices", "available", "--json"], { timeout: 20000, maxBuffer: 32 << 20 });
    return r.ok ? parseSimList(r.out) : [];
  }

  async function devices() {
    return (await sims()).filter((one) => one.state === "Booted").map((one) => one.udid);
  }

  async function running() {
    return (await sims()).filter((one) => one.state === "Booted").map((one) => ({ serial: one.udid, avd: one.name }));
  }

  const avds = async () => (await sims()).map((one) => one.name);

  async function avdOf(udid) {
    const hit = (await sims()).find((one) => one.udid === udid);
    return hit ? hit.name : "";
  }

  async function booted(udid) {
    const hit = (await sims()).find((one) => one.udid === udid);
    return Boolean(hit && hit.state === "Booted");
  }

  async function shot(udid) {
    const r = await simctl(["io", udid, "screenshot", "--type=png", "-"], { timeout: SHOT_TIMEOUT * 3, encoding: "buffer", maxBuffer: 64 << 20 });
    if (!r.ok || !r.out || r.out.length < 24) return { error: `screenshot on ${udid} gave nothing${r.err ? `: ${r.err}` : ""}` };
    return { png: r.out };
  }

  async function size(udid) {
    const got = await shot(udid);
    if (got.error) return { width: 0, height: 0 };
    return parsePngSize(got.png) || { width: 0, height: 0 };
  }

  async function boot({ avd, timeout = BOOT_TIMEOUT } = {}) {
    const started = now();
    const all = await sims();
    const chosen = chooseSim(all, avd);
    if (chosen.error) return chosen;
    const fresh = chosen.sim.state !== "Booted";
    if (fresh) {
      const up = await simctl(["boot", chosen.sim.udid], { timeout });
      if (!up.ok && !/current state: Booted/i.test(`${up.err} ${up.out}`)) {
        return { error: `${chosen.sim.name} would not boot: ${up.err || up.out || "simctl said nothing"}` };
      }
      await simctl(["bootstatus", chosen.sim.udid, "-b"], { timeout });
    }
    const deadline = now() + SETTLE_TIMEOUT;
    let up = await booted(chosen.sim.udid);
    while (!up && now() < deadline) {
      await sleep(1000);
      up = await booted(chosen.sim.udid);
    }
    if (!up) return { error: `${chosen.sim.name} says it is not booted ${Math.round(SETTLE_TIMEOUT / 1000)}s after simctl said it was — shut it down and open it again` };
    const dims = await size(chosen.sim.udid);
    return { serial: chosen.sim.udid, avd: chosen.sim.name, fresh, bootMs: now() - started, ...dims };
  }

  async function openApp(udid, bundle) {
    const r = await simctl(["launch", udid, bundle], { timeout: 30000 });
    if (!r.ok) {
      const listed = await simctl(["listapps", udid], { timeout: 20000, maxBuffer: 32 << 20 });
      const near = [...String(listed.out || "").matchAll(/CFBundleIdentifier\s*=\s*"([^"]+)"/g)]
        .map((hit) => hit[1])
        .filter((id) => id.includes(String(bundle).split(".").pop()));
      return { error: `no app ${bundle} on ${udid}${near.length ? ` — did you mean ${near.join(", ")}?` : " — install it first (xcrun simctl install <udid> <App.app>)"}` };
    }
    return { ok: true, app: bundle };
  }

  async function ensureBaguette() {
    if (baguette) return { bin: baguette };
    if (tools.baguette) { baguette = tools.baguette; return { bin: baguette }; }
    const kept = join(tools.cacheDir, BAGUETTE_NAME);
    if (exists(kept)) { baguette = kept; return { bin: kept }; }
    const brewed = BAGUETTE_BREW.find((one) => exists(one));
    if (brewed) { baguette = brewed; return { bin: brewed } ; }
    if (arch !== BAGUETTE_ARCH) {
      return { error: `baguette only publishes an ${BAGUETTE_ARCH} build and this mac is ${arch} — build it from source, then ${BAGUETTE_RECIPE}` };
    }
    let bytes = null;
    try { bytes = await grabBytes(BAGUETTE_URL); } catch (why) {
      return { error: `could not download baguette, which is what taps an iOS simulator: ${String(why.message || why).slice(0, 120)} — ${BAGUETTE_RECIPE}` };
    }
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== wantSha) {
      return { error: `the baguette download does not match the checksum this hive pins (got ${sha.slice(0, 12)}) — nothing was installed` };
    }
    try { makeDir(tools.cacheDir, { recursive: true }); } catch {}
    const tarball = join(tools.cacheDir, `${BAGUETTE_NAME}.tar.gz`);
    const loose = join(tools.cacheDir, "Baguette");
    try {
      await putFile(tarball, bytes);
      const untarred = await exec("/usr/bin/tar", untarArgs(tarball, tools.cacheDir), { timeout: 60000 });
      if (!untarred.ok || !exists(loose)) throw new Error(untarred.err || "tar unpacked nothing");
      await moveFile(loose, kept);
      await makeRunnable(kept, 0o755);
    } catch (why) {
      return { error: `could not unpack baguette: ${String(why.message || why).slice(0, 120)} — ${BAGUETTE_RECIPE}` };
    } finally {
      try { await dropFile(tarball); } catch {}
    }
    baguette = kept;
    return { bin: kept };
  }

  async function gesture(args) {
    const ready = await ensureBaguette();
    if (ready.error) return { ok: false, err: ready.error };
    const r = await exec(ready.bin, args, { timeout: 20000 });
    if (!r.ok && /ENOENT|not found|no such file/i.test(`${r.err}`)) {
      return { ok: false, err: `baguette is not where it was (${ready.bin}) — iOS has no built-in way to tap a simulator; ${BAGUETTE_RECIPE}` };
    }
    return r;
  }

  const tap = (udid, x, y, width, height) => gesture(tapArgs(udid, x, y, width, height));
  const swipe = (udid, x1, y1, x2, y2, ms, width, height) => gesture(swipeArgs(udid, x1, y1, x2, y2, ms, width, height));
  const type = (udid, text) => gesture(["type", "--udid", udid, "--text", text]);
  const key = (udid, resolved) => gesture(keyArgs(udid, resolved));

  function record(udid, { onChunk, onEnd, fps = HELPER_FPS, bitrate = HELPER_BITRATE } = {}) {
    let child = null;
    let stopped = false;
    let short = 0;
    let why = "";
    const run = async () => {
      const ready = await ensureHelper();
      if (ready.error) { stopped = true; return onEnd?.(ready.error); }
      if (stopped) return;
      const began = now();
      child = spawn(ready.bin, helperArgs(udid, { fps, bitrate }), { stdio: ["ignore", "pipe", "pipe"], env });
      child.stdout?.on("data", (chunk) => { short = 0; onChunk?.(chunk); });
      child.stderr?.on("data", (chunk) => { why = String(chunk).trim().slice(0, 200); });
      child.on("error", () => { stopped = true; onEnd?.("the screen helper could not be started"); });
      child.on("close", () => {
        if (stopped) return;
        if (now() - began < RECORD_MIN_RUN && ++short >= RECORD_TRIES) {
          stopped = true;
          return onEnd?.(why || "the simulator stopped sending video");
        }
        run();
      });
    };
    run();
    return { stop() { stopped = true; child?.kill?.(); } };
  }

  async function tree() {
    return { error: "iOS has no uiautomator — read the screen with device_screenshot and tap by pixel" };
  }

  async function logs(udid, { lines = LOG_LINES } = {}) {
    const r = await simctl(
      ["spawn", udid, "log", "show", "--style", "compact", "--last", `${LOG_WINDOW_MINUTES}m`],
      { timeout: 30000, maxBuffer: 64 << 20 }
    );
    return { lines: lastLines(r.out, lines) };
  }

  const kill = (udid) => simctl(["shutdown", udid], { timeout: 30000 });

  return { devices, running, sims, avds, avdOf, booted, size, boot, openApp, shot, record, tap, swipe, type, key, keyOf, tree, logs, kill, ensureHelper, ensureBaguette };
}

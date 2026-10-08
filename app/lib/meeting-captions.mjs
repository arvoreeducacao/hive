import { execFileSync, spawn as spawnChild } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CAPTION_HOST = "dev.hive.captions";
export const CAPTION_CHROME_ID = "llbhndkljiicpopegdfeaihjklielcph";
export const CAPTION_CHROME_STORE_ID = "ocekllahcpdjidbemkbjalmeggjcodad";
export const CAPTION_FIREFOX_ID = "meet-captions@hive.dev";
export const CAPTION_BEAT_GAP = 12000;
export const CAPTION_ALIVE = 15000;
export const CAPTION_LINE_MAX = 4000;
export const CAPTION_KEY = /^[a-z0-9-]{4,60}$/;

const oneLine = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

export function mergeCaption(old, next) {
  const before = oneLine(old, CAPTION_LINE_MAX);
  const after = oneLine(next, CAPTION_LINE_MAX);
  if (!before || after.startsWith(before)) return after;
  if (!after || before.endsWith(after) || before.includes(after)) return before;
  const most = Math.min(before.length, after.length);
  for (let size = most; size >= 12; size--) {
    if (before.endsWith(after.slice(0, size))) return (before + after.slice(size)).slice(0, CAPTION_LINE_MAX);
  }
  return after.length >= before.length * 0.6 ? after : `${before} ${after}`.slice(0, CAPTION_LINE_MAX);
}

export function upsertCaption(meeting, { key, speaker = "", text = "", at = 0 }) {
  if (!CAPTION_KEY.test(String(key || ""))) return meeting;
  const said = oneLine(text, CAPTION_LINE_MAX);
  if (!said) return meeting;
  const who = oneLine(speaker, 80);
  const lines = meeting.lines || [];
  const held = lines.findIndex((line) => line.source === "caption" && line.key === key);
  if (held >= 0) {
    const was = lines[held];
    const merged = mergeCaption(was.text, said);
    if (merged === was.text && (!who || who === was.speaker)) return meeting;
    const next = [...lines];
    next[held] = { ...was, text: merged, speaker: who || was.speaker };
    return { ...meeting, lines: next };
  }
  const line = { at: Math.max(0, Math.round(Number(at) || 0)), source: "caption", key, speaker: who, text: said };
  return { ...meeting, lines: [...lines, line].sort((a, b) => a.at - b.at) };
}

export function createCaptionWatch({ now = Date.now, gap = CAPTION_BEAT_GAP, alive = CAPTION_ALIVE } = {}) {
  let beats = [];
  let words = [];
  let lastBeat = 0;
  let lastOn = false;
  let born = now();
  const trim = () => {
    const floor = now() - 10 * 60 * 1000;
    if (beats.length > 400) beats = beats.filter((at) => at >= floor);
    if (words.length > 2000) words = words.filter((at) => at >= floor);
  };
  return {
    beat(on) { lastBeat = now(); lastOn = !!on; if (on) beats.push(lastBeat); trim(); },
    wrote() { words.push(now()); },
    covered(from, to) {
      let at = from;
      for (const one of beats) {
        if (one < from - gap) continue;
        if (one - at > gap) return false;
        if (one > at) at = one;
        if (at >= to) return true;
      }
      return to - at <= gap && at > from - gap && beats.some((one) => one >= from - gap);
    },
    quietFor() { return lastBeat ? now() - lastBeat : now() - born; },
    wordsIn(from, to) { return words.some((at) => at >= from - 3000 && at <= to + 6000); },
    state() { const fresh = lastBeat > 0 && now() - lastBeat <= alive; return { connected: fresh, on: fresh && lastOn }; },
    reset() { beats = []; words = []; lastBeat = 0; lastOn = false; born = now(); }
  };
}

const CHROME_DIRS = {
  linux: [".config/google-chrome", ".config/google-chrome-beta", ".config/google-chrome-unstable", ".config/chromium", ".config/BraveSoftware/Brave-Browser", ".config/microsoft-edge", ".config/microsoft-edge-dev", ".config/vivaldi"],
  darwin: ["Library/Application Support/Google/Chrome", "Library/Application Support/Chromium", "Library/Application Support/BraveSoftware/Brave-Browser", "Library/Application Support/Microsoft Edge", "Library/Application Support/Arc/User Data"]
};
const FIREFOX_DIRS = { linux: [".mozilla"], darwin: ["Library/Application Support/Mozilla"] };
const FIREFOX_HOSTS = { linux: "native-messaging-hosts", darwin: "NativeMessagingHosts" };

export const captionHome = (home) => join(home, "meet-captions");

const FLATPAK_CHROME = {
  "com.google.Chrome": "google-chrome", "com.google.ChromeDev": "google-chrome-unstable", "org.chromium.Chromium": "chromium",
  "com.brave.Browser": "BraveSoftware/Brave-Browser", "com.microsoft.Edge": "microsoft-edge", "com.vivaldi.Vivaldi": "vivaldi"
};
const FLATPAK_FIREFOX = { "org.mozilla.firefox": [".mozilla"], "app.zen_browser.zen": [".zen", ".mozilla"], "io.gitlab.librewolf-community": [".librewolf", ".mozilla"] };

export const CAPTION_FOLDER = "hive-meet-captions";
export const CAPTION_FILES = ["aveia-connect.js", "aveia-origin.js", "background.js", "caption-language.js", "caption-parse.js", "content.js", "destinations.js", "popup.css", "popup.html", "popup.js"];

export const AVEIA_MARK = "__AVEIA_ORIGIN__";

export function aveiaOriginOf(address) {
  let parsed;
  try { parsed = new URL(String(address || "").trim()); } catch { return ""; }
  return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.origin : "";
}

function withoutAveia(value) {
  if (typeof value === "string") return value.includes(AVEIA_MARK) ? undefined : value;
  if (Array.isArray(value)) return value.map(withoutAveia).filter((one) => one !== undefined);
  if (!value || typeof value !== "object") return value;
  const kept = {};
  for (const [name, held] of Object.entries(value)) {
    const left = withoutAveia(held);
    if (left !== undefined) kept[name] = left;
  }
  return Array.isArray(value.matches) && !kept.matches.length ? undefined : kept;
}

export function pointAtAveia(text, address) {
  return String(text).split(AVEIA_MARK).join(aveiaOriginOf(address));
}

export const HIVE_ONLY_NAME = "Hive · Meet captions";
export const HIVE_ONLY_DESCRIPTION = "Records Google Meet calls from their captions, in the Hive on this computer.";

function asHiveOnly(manifest) {
  const named = { ...manifest, name: HIVE_ONLY_NAME, description: HIVE_ONLY_DESCRIPTION };
  for (const key of ["action", "browser_action"]) {
    if (named[key]) named[key] = { ...named[key], default_title: HIVE_ONLY_NAME };
  }
  return named;
}

export function manifestFor(text, address, shape = (manifest) => manifest) {
  const origin = aveiaOriginOf(address);
  const read = JSON.parse(origin ? pointAtAveia(text, origin) : text);
  return `${JSON.stringify(shape(origin ? read : asHiveOnly(withoutAveia(read))), null, 2)}\n`;
}

export function writeExtension({ from, into, manifest, aveia = "", shape }) {
  mkdirSync(into, { recursive: true });
  for (const file of CAPTION_FILES) writeFileSync(join(into, file), pointAtAveia(readFileSync(join(from, file), "utf8"), aveia));
  cpSync(join(from, "icons"), join(into, "icons"), { recursive: true });
  writeFileSync(join(into, "manifest.json"), manifestFor(readFileSync(join(from, manifest), "utf8"), aveia, shape));
}

export function captionPlan({ home, platform = process.platform, userHome = homedir(), exists = existsSync }) {
  const base = captionHome(home);
  const seen = join(userHome, CAPTION_FOLDER);
  const chrome = (CHROME_DIRS[platform] || []).map((dir) => join(userHome, dir)).filter((dir) => exists(dir)).map((dir) => join(dir, "NativeMessagingHosts", `${CAPTION_HOST}.json`));
  const firefox = (FIREFOX_DIRS[platform] || []).map((dir) => join(userHome, dir)).filter((dir) => exists(dir)).map((dir) => join(dir, FIREFOX_HOSTS[platform], `${CAPTION_HOST}.json`));
  const flatpaks = [];
  if (platform === "linux") {
    for (const [app, dir] of Object.entries(FLATPAK_CHROME)) {
      const root = join(userHome, ".var", "app", app);
      if (!exists(root)) continue;
      flatpaks.push(app);
      chrome.push(join(root, "config", dir, "NativeMessagingHosts", `${CAPTION_HOST}.json`));
    }
    for (const [app, dirs] of Object.entries(FLATPAK_FIREFOX)) {
      const root = join(userHome, ".var", "app", app);
      if (!exists(root)) continue;
      flatpaks.push(app);
      for (const dir of dirs) firefox.push(join(root, dir, "native-messaging-hosts", `${CAPTION_HOST}.json`));
    }
  }
  return {
    supported: platform === "linux" || platform === "darwin",
    base, folder: seen, chromeDir: join(seen, "chrome"), firefoxDir: join(seen, "firefox"), host: join(base, "host", "hive-captions-host.mjs"), launcher: join(base, "host", "hive-captions-host"),
    chrome, firefox, flatpaks
  };
}

export function captionStatus(asked) {
  const plan = captionPlan(asked);
  const exists = asked.exists || existsSync;
  const set = (files) => files.length > 0 && files.every((file) => exists(file));
  const there = (dir) => exists(join(dir, "manifest.json"));
  return {
    supported: plan.supported, folder: plan.folder, chromeDir: plan.chromeDir, firefoxDir: plan.firefoxDir, flatpaks: plan.flatpaks,
    chrome: { found: plan.chrome.length > 0, ready: set(plan.chrome) && exists(plan.launcher) && there(plan.chromeDir) },
    firefox: { found: plan.firefox.length > 0, ready: set(plan.firefox) && exists(plan.launcher) && there(plan.firefoxDir) }
  };
}

function runQuiet(cmd, args) {
  try { execFileSync(cmd, args, { stdio: "ignore", timeout: 15000 }); return true; } catch { return false; }
}

export function installCaptionBridge({ home, assets, sock, nodePath = process.execPath, asNode = !!process.versions.electron, platform = process.platform, userHome = homedir(), run = runQuiet, aveia = "" }) {
  const plan = captionPlan({ home, platform, userHome });
  if (!plan.supported) return { error: "the caption bridge is built for linux and mac only" };
  const from = join(assets, "extension");
  try { if (lstatSync(plan.folder).isSymbolicLink()) unlinkSync(plan.folder); } catch {}
  for (const [into, manifest] of [[plan.chromeDir, "manifest.chrome.json"], [plan.firefoxDir, "manifest.firefox.json"]]) writeExtension({ from, into, manifest, aveia });
  mkdirSync(dirname(plan.host), { recursive: true });
  cpSync(join(assets, "host", "hive-captions-host.mjs"), plan.host);
  const quote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;
  writeFileSync(plan.launcher, `#!/bin/sh\n${asNode ? "ELECTRON_RUN_AS_NODE=1 " : ""}HIVE_SOCK=${quote(sock)} exec ${quote(nodePath)} ${quote(plan.host)}\n`);
  chmodSync(plan.launcher, 0o755);
  const said = { name: CAPTION_HOST, description: "Hands Google Meet captions to the Hive on this machine", path: plan.launcher, type: "stdio" };
  for (const file of plan.chrome) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ ...said, allowed_origins: [`chrome-extension://${CAPTION_CHROME_ID}/`, `chrome-extension://${CAPTION_CHROME_STORE_ID}/`] }, null, 2)); }
  for (const file of plan.firefox) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ ...said, allowed_extensions: [CAPTION_FIREFOX_ID] }, null, 2)); }
  const opened = [];
  for (const app of plan.flatpaks) {
    const ok = run("flatpak", ["override", "--user", `--filesystem=${home}`, `--filesystem=${dirname(nodePath)}:ro`, `--filesystem=${plan.folder}:ro`, app]);
    opened.push({ app, ok });
  }
  return { ok: true, ...captionStatus({ home, platform, userHome }), sandboxed: opened };
}

export function openCaptionFolder({ home, which = "chrome", platform = process.platform, userHome = homedir(), spawn = spawnDetached }) {
  const plan = captionPlan({ home, platform, userHome });
  const dir = which === "firefox" ? plan.firefoxDir : plan.chromeDir;
  if (!existsSync(join(dir, "manifest.json"))) return { error: "set the extension up first" };
  spawn(platform === "darwin" ? "open" : "xdg-open", [dir]);
  return { ok: true, dir };
}

function spawnDetached(cmd, args) {
  try { const child = spawnChild(cmd, args, { stdio: "ignore", detached: true }); child.on("error", () => {}); child.unref(); } catch {}
}

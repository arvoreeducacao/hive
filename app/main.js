const { app, BrowserWindow, Menu, desktopCapturer, Notification, nativeImage, dialog, powerMonitor, screen, session, shell, ipcMain, systemPreferences, webContents } = require("electron");
const { spawn, execFile } = require("node:child_process");
const { readFileSync, writeFileSync, existsSync, readdirSync, accessSync, constants } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");
const boot = require("./main/boot.js");
const { bundleOf, swapScript, appImageOf, swapAppImage, rpmInstallOf, swapRpm, installedExeOf, installerArgs } = require("./main/update.js");
const { readCurrent, pickJsRoot } = require("./main/ota.js");
const { readDeath, REVIVALS } = require("./main/revive.js");
const relay = require("./main/relay.js");
const { linkOf, deliverLink, LINK_WAIT } = require("./main/deeplink.js");
const passkey = require("./main/passkey.js");
const zoom = require("./main/zoom.js");
const { watchAway } = require("./main/away.js");

const HIVE_HOME = process.env.HIVE_HOME || join(homedir(), ".hive");
const SOCK = process.env.HIVE_SOCK || relay.socketPathFor({ home: HIVE_HOME, hub: process.env.HIVE_HUB || "" });
const BASE = relay.HOME_PAGE;
const ANOTHER_HIVE_OWNS_THE_PORT = 75;
const HERE = __dirname;
const IS_MAC = process.platform === "darwin";
const IS_WINDOWS = process.platform === "win32";
const HOME = homedir();
const PATH_SEP = IS_WINDOWS ? ";" : ":";
const START_TIMEOUT = 12000;
const CANDIDATES = IS_WINDOWS
  ? String(process.env.PATH || "").split(";").filter(Boolean)
  : ["/opt/homebrew/bin", "/usr/local/bin", join(HOME, ".local/bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

const APP_CSS = `
  html { -webkit-app-region: no-drag; }
  #top { -webkit-app-region: drag; }
  #top button, #top select, #top input, #top .menu, #top .relpop { -webkit-app-region: no-drag !important; }
`;
const MAC_LIGHTS = { x: 16, y: 15 };

const SEAT_LIGHTS = { x: 14, y: 13 };

/* the room the three buttons need on the left of the bar. a look that moves them says how much
   it wants through --mac-lights; the classic bar, which leaves them where the window put them,
   never sets it and keeps the measure that was here before. */
const MAC_TOP_CSS = `
  #top { padding-left: var(--mac-lights, 82px) !important; }
  html.fullscreen #top { padding-left: 14px !important; }
`;
const OVERLAY_TOP_CSS = `
  #top { padding-right: calc(100vw - env(titlebar-area-width, 100vw) + 14px) !important; }
  html.fullscreen #top { padding-right: 14px !important; }
`;

let window_ = null;
let readingAlone = false;
let systemSoundUntil = 0;
let server = null;
let quitting = false;
let clock = null;
let path = CANDIDATES.join(PATH_SEP);
let githubToken = "";
let lastLines = "";
let firstRound = true;
let serverBroke = false;
let revivals = 0;
let bornAt = 0;
let bootState = boot.initial();
let jsRoot = "";
const before = new Map();

app.setName("Hive");

const CURRENT_JS = join(HIVE_HOME, "js", "current.json");

const shellPrint = () => {
  try { return String(JSON.parse(readFileSync(join(HERE, "build.json"), "utf8")).shell || ""); } catch { return ""; }
};

const shippedRelease = () => {
  try { return Number(JSON.parse(readFileSync(join(HERE, "build.json"), "utf8")).release) || 0; } catch { return 0; }
};

function jsRootNow() {
  const print = shellPrint();
  if (!print) return "";
  return pickJsRoot({ home: HIVE_HOME, print, current: readCurrent(CURRENT_JS, readFileSync), exists: existsSync, shipped: shippedRelease(), read: readFileSync });
}

function dropJsRoot(why) {
  const dropped = jsRoot;
  jsRoot = "";
  if (!dropped) return;
  console.log(`hive: the update in ${dropped} did not start (${why}) — going back to the one that shipped`);
  try { writeFileSync(CURRENT_JS, `${JSON.stringify({ rejected: dropped, why, at: new Date().toISOString() }, null, 2)}\n`); } catch {}
}

function stateFile() {
  return join(app.getPath("userData"), "window.json");
}

function readState() {
  try {
    const b = JSON.parse(readFileSync(stateFile(), "utf8"));
    if (b.width > 400 && b.height > 300) return b;
  } catch {}
  return { width: 1440, height: 900 };
}

function saveState() {
  if (!window_ || window_.isDestroyed() || window_.isFullScreen()) return;
  try { writeFileSync(stateFile(), JSON.stringify(window_.getBounds())); } catch {}
}

function looksLikePath(line) {
  return line.startsWith("/") || /^[A-Za-z]:[\\/]/.test(line);
}

function asTheSystemWritesIt(line) {
  if (!IS_WINDOWS) return line;
  const unix = line.match(/^\/([A-Za-z])\/(.*)$/);
  return unix ? `${unix[1].toUpperCase()}:\\${unix[2].replace(/\//g, "\\")}` : line;
}

function loginShell() {
  if (!IS_WINDOWS) return process.env.SHELL || "/bin/zsh";
  const candidates = [
    process.env.SHELL,
    "C:\\msys64\\usr\\bin\\bash.exe",
    join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")
  ];
  return candidates.find((s) => s && /bash\.exe$/i.test(s) && existsSync(s)) || "";
}

function shellSaid(flags, command, timeout = 20000) {
  return new Promise((done) => {
    const shell = loginShell();
    if (!shell) return done("");
    execFile(shell, [flags, command], { timeout }, (err, out) => {
      done(String(out || "").trim().split("\n").filter(Boolean).pop() || "");
    });
  });
}

async function inShell(flags, command, timeout = 20000) {
  const line = await shellSaid(flags, command, timeout);
  return looksLikePath(line) ? asTheSystemWritesIt(line) : "";
}

async function loginShellPath() {
  if (IS_WINDOWS) return "";
  return (await inShell("-ilc", 'printf %s "$PATH"')) || (await inShell("-lc", 'printf %s "$PATH"'));
}

async function loginShellGithubToken() {
  if (IS_WINDOWS) return "";
  const asked = 'printf %s "${GH_TOKEN:-$GITHUB_TOKEN}"';
  const said = (await shellSaid("-ilc", asked)) || (await shellSaid("-lc", asked));
  return /^[A-Za-z0-9_]{20,255}$/.test(said) ? said : "";
}

async function versionManagerNodes() {
  const roots = [
    join(HOME, ".local/share/mise/installs/node"),
    join(HOME, ".asdf/installs/nodejs"),
    join(HOME, ".nvm/versions/node")
  ];
  const found = [];
  for (const root of roots) {
    try {
      const versions = readdirSync(root).sort().reverse();
      const numbered = versions.filter((v) => /^\d/.test(v));
      for (const v of [...numbered, ...versions.filter((v) => !/^\d/.test(v))]) found.push(join(root, v, "bin", "node"));
    } catch {}
  }
  if (IS_WINDOWS) {
    for (const root of [process.env.NVM_SYMLINK, process.env.NVM_HOME, process.env.ProgramFiles && join(process.env.ProgramFiles, "nodejs")]) {
      if (root) found.push(join(root, "node.exe"));
    }
    return found;
  }
  found.push(join(HOME, ".volta/bin/node"), "/opt/homebrew/bin/node", "/usr/local/bin/node");
  return found;
}

function nodeFile() {
  return join(app.getPath("userData"), "node.json");
}

function runnable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch { return false; }
}

function savedNode() {
  try {
    const { path: saved } = JSON.parse(readFileSync(nodeFile(), "utf8"));
    return saved && runnable(saved) ? saved : "";
  } catch { return ""; }
}

function saveNode(found) {
  try { writeFileSync(nodeFile(), JSON.stringify({ path: found })); } catch {}
}

function configFile() {
  if (process.env.HIVE_CONFIG) return process.env.HIVE_CONFIG;
  return join(process.env.HIVE_HOME || join(app.getPath("home"), ".hive"), "config.jsonc");
}

function fontCss() {
  try {
    const { parse } = require("jsonc-parser");
    const font = (parse(readFileSync(configFile(), "utf8")) || {}).font || {};
    const tail = {
      sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
    };
    const generic = { sans: /system-ui|sans-serif/i, mono: /monospace/i };
    const rules = ["sans", "mono"]
      .filter((family) => typeof font[family] === "string" && font[family].trim())
      .map((family) => {
        const stack = font[family].trim().replace(/,\s*$/, "");
        return `--${family}: ${generic[family].test(stack) ? stack : `${stack}, ${tail[family]}`};`;
      });
    return rules.length ? `:root { ${rules.join(" ")} }` : "";
  } catch { return ""; }
}

const UTF8_LOCALE = process.platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";

function speakingUtf8(env) {
  const spoken = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  if (/utf-?8/i.test(spoken)) return env;
  return { ...env, LANG: UTF8_LOCALE, LC_ALL: UTF8_LOCALE };
}

function serverEnv() {
  const bundle = appImageOf(process.env) || bundleOf(process.execPath) || rpmInstallOf(process.execPath) || installedExeOf(process.execPath);
  const inherited = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const env = speakingUtf8({ ...process.env, HIVE_SOCK: SOCK, HIVE_APP_SHIPPED: HERE, ...(bundle ? { HIVE_APP_BUNDLE: bundle } : {}), ...(githubToken && !inherited ? { GH_TOKEN: githubToken } : {}) });
  if (!IS_WINDOWS) return { ...env, PATH: path };
  for (const key of Object.keys(env)) {
    if (/^path$/i.test(key)) delete env[key];
  }
  env.Path = path;
  return env;
}

function onPath(command) {
  return new Promise((done) => {
    const [exe, args] = IS_WINDOWS
      ? [join(process.env.SystemRoot || "C:\\Windows", "System32", "where.exe"), [command]]
      : ["/bin/sh", ["-c", `command -v ${command}`]];
    execFile(exe, args, { env: IS_WINDOWS ? { ...process.env, PATH: path } : { PATH: path }, timeout: 8000 }, (err, out) => {
      const lines = String(out || "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const line = IS_WINDOWS ? lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || lines[0] || "" : lines.pop() || "";
      done(looksLikePath(line) ? asTheSystemWritesIt(line) : "");
    });
  });
}

async function findNode() {
  const saved = savedNode();
  if (saved) return saved;

  const tries = [
    await onPath("node"),
    await inShell("-ilc", "command -v node"),
    await inShell("-lc", "command -v node"),
    ...(await versionManagerNodes())
  ];
  for (const t of tries) {
    if (t && runnable(t)) { saveNode(t); return t; }
  }
  return "";
}

function answering() {
  return new Promise((tell) => {
    const ask = require("node:http").request({ socketPath: SOCK, path: "/", method: "GET", timeout: 1200 }, (res) => {
      res.resume();
      tell(res.statusCode > 0 && res.statusCode < 500);
    });
    ask.on("error", () => tell(false));
    ask.on("timeout", () => { ask.destroy(); tell(false); });
    ask.end();
  });
}

async function waitForServer(tries = START_TIMEOUT / 400) {
  for (let i = 0; i < tries; i++) {
    if (await answering()) return true;
    if (serverBroke) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function swapBundle(from) {
  quitting = true;
  try { server?.kill(); } catch {}
  if (IS_WINDOWS) {
    try {
      spawn(from, installerArgs(), { detached: true, stdio: "ignore" }).unref();
    } catch {
      app.relaunch();
    }
    return app.exit(0);
  }
  const image = appImageOf(process.env);
  const rpm = rpmInstallOf(process.execPath);
  const to = image || bundleOf(process.execPath) || rpm;
  if (!to || from === to) {
    app.relaunch();
    return app.exit(0);
  }
  const script = image ? swapAppImage({ from, to, pid: process.pid })
    : rpm ? swapRpm({ from, exe: rpm, pid: process.pid })
    : swapScript({ from, to, pid: process.pid });
  try {
    spawn("/bin/bash", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  } catch {
    app.relaunch();
  }
  app.exit(0);
}

function keepOutput(chunk) {
  lastLines = (lastLines + chunk).slice(-3000);
  process.stdout.write(chunk);
  const staged = /hive: update staged (.+)/.exec(chunk);
  if (staged) return swapBundle(staged[1].trim());
  if (chunk.includes("hive: js update applied")) {
    try { server?.kill(); } catch {}
    return;
  }
  if (chunk.includes("hive: update applied")) {
    quitting = true;
    try { server?.kill(); } catch {}
    app.relaunch();
    app.exit(0);
  }
}

function serverIsGone(wrong) {
  serverBroke = true;
  const why = wrong.code || wrong.message || "unknown error";
  setBootStep({ type: "failed", reason: `the server could not start (${why})` });
  if (jsRoot) return;
  dialog.showErrorBox("Hive", `The server could not start.\n\n${wrong.message}\n\nLast lines:\n${lastLines.slice(-1200)}`);
}

function showBase() {
  if (!window_ || window_.isDestroyed()) return;
  window_.loadURL(BASE)
    .then(() => {
      if (!window_ || window_.isDestroyed()) return;
      window_.webContents.navigationHistory.clear();
    })
    .catch(() => {});
}

async function reviveServer(death) {
  revivals = death.revivals;
  serverBroke = false;
  console.log(`hive: the server was killed (${death.killedBy}) — starting it again (${death.revivals}/${death.of})`);
  if (!(await startServer())) return;
  setBootStep({ type: "ready" });
  showBase();
}

async function startServer() {
  if (await answering()) return true;
  if (await bootServer()) return true;
  if (!jsRoot) return false;
  dropJsRoot("it never answered");
  serverBroke = false;
  return bootServer();
}

async function bootServer() {
  const node = await findNode();
  if (!node) {
    dialog.showErrorBox("Hive", `Could not find node.\n\nLooked in the login shell PATH and in the mise, asdf, nvm and volta shims.\n\nPATH used:\n${path}`);
    return false;
  }

  setBootStep({ type: "step", step: "server" });
  jsRoot = jsRootNow();
  try {
    server = spawn(node, ["./server.mjs"], {
      cwd: jsRoot ? join(jsRoot, "app") : HERE,
      env: serverEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (wrong) {
    server = null;
    serverIsGone(wrong);
    return false;
  }
  bornAt = Date.now();
  server.stdout.on("data", (d) => keepOutput(String(d)));
  server.stderr.on("data", (d) => keepOutput(String(d)));
  server.on("error", (wrong) => {
    server = null;
    if (quitting) return;
    serverIsGone(wrong);
  });
  server.on("exit", (code, signal) => {
    server = null;
    if (quitting) return;
    if (code === ANOTHER_HIVE_OWNS_THE_PORT) return;
    const death = readDeath({ code, signal, revivals, aliveFor: Date.now() - bornAt });
    if (death.verdict === "revive") return reviveServer(death);
    if (jsRoot) {
      dropJsRoot(death.reason);
      return reviveServer({ revivals: 0, of: REVIVALS, killedBy: "a bad update" });
    }
    serverBroke = true;
    setBootStep({ type: "failed", reason: death.reason });
    dialog.showErrorBox("Hive", `${death.said}\n\nLast lines:\n${lastLines.slice(-1200)}`);
  });

  if (await waitForServer()) return true;
  if (serverBroke || jsRoot) return false;
  setBootStep({ type: "timeout", limit: START_TIMEOUT });
  dialog.showErrorBox("Hive", `The server did not answer at ${BASE}.\n\nLast lines:\n${lastLines.slice(-1200)}`);
  return false;
}

function setBootStep(event) {
  if (event) bootState = boot.reduce(bootState, event);
  if (!window_ || window_.isDestroyed()) return;
  const view = JSON.stringify(boot.screen(bootState));
  window_.webContents.executeJavaScript(`window.hiveBoot && window.hiveBoot(${view})`).catch(() => {});
}

function show(name) {
  const solo = name && seatWindows.get(name);
  if (solo && !solo.isDestroyed()) {
    if (!solo.isVisible()) solo.show();
    solo.focus();
    return;
  }
  if (!window_ || window_.isDestroyed()) return createWindow();
  if (!window_.isVisible()) window_.show();
  window_.focus();
  if (name) {
    const target = JSON.stringify(name);
    window_.webContents.executeJavaScript(`window.hiveGoTo && window.hiveGoTo(${target})`).catch(() => {});
  }
}

const seatWindows = new Map();

/* where each window keeps its buttons when no look asks for anything else. */
const homeLights = new WeakMap();

function seatStateFile() {
  return join(app.getPath("userData"), "seat-window.json");
}

function readSeatState() {
  try {
    const b = JSON.parse(readFileSync(seatStateFile(), "utf8"));
    if (b.width > 360 && b.height > 300) return { width: b.width, height: b.height };
  } catch {}
  return { width: 760, height: 880 };
}

function saveSeatState(win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  try { writeFileSync(seatStateFile(), JSON.stringify(win.getBounds())); } catch {}
}

function openSeatWindow(name) {
  const seat = String(name || "").trim();
  if (!seat) return;
  const already = seatWindows.get(seat);
  if (already && !already.isDestroyed()) {
    if (!already.isVisible()) already.show();
    already.focus();
    return;
  }
  const win = new BrowserWindow({
    ...readSeatState(),
    minWidth: 420,
    minHeight: 360,
    title: seat,
    backgroundColor: "#0C0C0C",
    ...(IS_MAC
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: SEAT_LIGHTS }
      : {
        icon: join(HERE, "assets/icon.png"),
        autoHideMenuBar: true,
        titleBarStyle: "hidden"
      }),
    webPreferences: {
      preload: join(HERE, "main", "preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: true
    }
  });
  homeLights.set(win, SEAT_LIGHTS);
  seatWindows.set(seat, win);
  win.loadURL(`${BASE}?seat=${encodeURIComponent(seat)}`);
  win.webContents.on("did-finish-load", () => {
    win.webContents.insertCSS(APP_CSS + (IS_MAC ? MAC_TOP_CSS : OVERLAY_TOP_CSS));
    const fonts = fontCss();
    if (fonts) win.webContents.insertCSS(fonts);
    tellAway(win);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("resize", () => saveSeatState(win));
  win.on("move", () => saveSeatState(win));
  win.on("closed", () => {
    seatWindows.delete(seat);
    if (!window_ || window_.isDestroyed()) return;
    window_.webContents.send("hive:seat-back", seat);
  });
}

function createWindow() {
  window_ = new BrowserWindow({
    ...readState(),
    minWidth: 960,
    minHeight: 620,
    title: "Hive",
    backgroundColor: "#0C0C0C",
    ...(IS_MAC
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: MAC_LIGHTS }
      : {
        icon: join(HERE, "assets/icon.png"),
        autoHideMenuBar: true,
        titleBarStyle: "hidden"
      }),
    webPreferences: {
      preload: join(HERE, "main", "preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: true
    }
  });

  homeLights.set(window_, MAC_LIGHTS);

  if (boot.shouldSwitchToBase(bootState)) window_.loadURL(BASE);
  else window_.loadFile(join(HERE, "boot.html"));
  const markFullscreen = (on) => {
    if (!window_ || window_.isDestroyed()) return;
    window_.webContents.executeJavaScript(`document.documentElement.classList.toggle("fullscreen", ${on})`).catch(() => {});
  };
  window_.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const can = params.editFlags || {};
    Menu.buildFromTemplate([
      { role: "cut", enabled: !!(params.isEditable && can.canCut) },
      { role: "copy", enabled: !!can.canCopy },
      { role: "paste", enabled: !!(params.isEditable && can.canPaste) },
      { type: "separator" },
      { role: "selectAll", enabled: !!can.canSelectAll }
    ]).popup({ window: window_ });
  });
  window_.webContents.on("did-finish-load", () => {
    window_.webContents.insertCSS(APP_CSS + (IS_MAC ? MAC_TOP_CSS : OVERLAY_TOP_CSS));
    const fonts = fontCss();
    if (fonts) window_.webContents.insertCSS(fonts);
    readingAlone = false;
    markFullscreen(window_.isFullScreen());
    setBootStep();
    tellAway(window_);
  });
  window_.on("enter-full-screen", () => markFullscreen(true));
  window_.on("leave-full-screen", () => markFullscreen(false));
  window_.webContents.on("before-input-event", (event, input) => {
    if (!readingAlone || input.type !== "keyDown" || input.key !== "Escape") return;
    event.preventDefault();
    window_.webContents.send("hive:leave-reading");
  });
  window_.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window_.webContents.session.setPermissionRequestHandler((wc, permission, grant) => {
    if (permission !== "media" && permission !== "display-capture") return grant(false);
    grant(wc === window_.webContents);
  });
  window_.webContents.session.setDisplayMediaRequestHandler(async (request, hand) => {
    const armed = Date.now() < systemSoundUntil;
    systemSoundUntil = 0;
    if (!armed || request.frame !== window_.webContents.mainFrame) { try { hand({}); } catch {} return; }
    try {
      const screens = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
      hand({ video: screens[0], audio: "loopback" });
    } catch { try { hand({}); } catch {} }
  });

  const seatBrowser = session.fromPartition("persist:seat-browser");
  seatBrowser.setPermissionRequestHandler((_wc, _permission, grant) => grant(false));
  relay.serveShelfPages(seatBrowser, SOCK);
  const shelfThumbs = session.fromPartition("shelf-thumbs");
  shelfThumbs.setPermissionRequestHandler((_wc, _permission, grant) => grant(false));
  relay.serveShelfPages(shelfThumbs, SOCK);
  const seatWc = new Set();
  const seatGuest = (wcId) => (seatWc.has(wcId) ? webContents.fromId(wcId) : null);
  const SEAT_PROFILES = { teacher: "DESIGN_REVIEW_TOKEN", principal: "DESIGN_REVIEW_TOKEN_PRINCIPAL", teacher2: "DESIGN_REVIEW_TOKEN_TEACHER2", student: "DESIGN_REVIEW_TOKEN_STUDENT" };
  const readHubToken = (profile) => {
    const key = SEAT_PROFILES[profile];
    if (!key) return { error: "unknown profile" };
    const hub = process.env.HIVE_HUB || "";
    if (!hub) return { error: "the hub path is not set, so there is no .env to read the token from" };
    let raw = "";
    try { raw = readFileSync(join(hub, ".env"), "utf8"); } catch { return { error: "could not read the hub .env" }; }
    const line = raw.split(/\r?\n/).find((l) => l.replace(/^\s*export\s+/, "").startsWith(key + "="));
    if (!line) return { error: `${key} is not in the hub .env` };
    let value = line.slice(line.indexOf("=") + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value ? { value } : { error: `${key} is empty in the hub .env` };
  };
  const maskCookie = (v) => { const s = String(v || ""); return s.length <= 10 ? "\u2022".repeat(s.length) : s.slice(0, 6) + "\u2026" + s.slice(-4); };
  /* the cursor, for the face at the foot of the rail. it is a poll because there is no event for
     "the mouse moved somewhere else entirely", and it is stopped the moment the window cannot be
     seen — a hidden window has nobody to look at, and this would otherwise wake the cpu all day.
     the point handed over is relative to the content, so the page reads it as a client point. */
  ipcMain.on("hive:reading-alone", (event, on) => {
    if (window_ && !window_.isDestroyed() && event.sender === window_.webContents) readingAlone = !!on;
  });
  ipcMain.on("hive:detach", (_event, name) => openSeatWindow(name));
  ipcMain.on("hive:seat-close", (_event, name) => {
    const win = seatWindows.get(String(name || "").trim());
    if (win && !win.isDestroyed()) win.close();
  });
  ipcMain.on("hive:seat-give-back", (_event, name) => {
    const seat = String(name || "").trim();
    const win = seatWindows.get(seat);
    if (!win || win.isDestroyed()) return;
    win.once("closed", () => show(seat));
    win.close();
  });

  ipcMain.on("hive:window", (event, act) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (act === "min") return win.minimize();
    if (act === "max") return win.isMaximized() ? win.unmaximize() : win.maximize();
    if (act === "full") return win.setFullScreen(true);
    if (act === "windowed") return win.setFullScreen(false);
    if (act === "close") win.close();
  });

  /* the page says where its own top bar wants the three buttons. nothing is what the classic
     look sends, and that is not the same as the system default: these windows are born with a
     spot of their own, so nothing means back to the one this window was opened with. */
  ipcMain.on("hive:window-buttons", (event, at) => {
    if (!IS_MAC) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const x = Number(at?.x);
    const y = Number(at?.y);
    const spot = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : homeLights.get(win);
    if (spot) win.setWindowButtonPosition(spot);
  });

  ipcMain.on("hive:gaze", (event, on) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (on) return watchCursor(win);
    stopCursor(win);
  });

  ipcMain.handle("seat-browser:profile", async (_e, arg) => {
    const profile = arg && arg.profile;
    const origin = String(arg && arg.origin || "");
    if (!SEAT_PROFILES[profile]) return { error: "unknown profile — use teacher, principal, teacher2 or student" };
    if (!/^https?:\/\//.test(origin)) return { error: "no page origin to set the cookie on" };
    const tok = readHubToken(profile);
    if (tok.error) return { error: tok.error };
    try {
      await seatBrowser.cookies.set({ url: origin, name: "access_token", value: tok.value, httpOnly: true, secure: origin.startsWith("https") });
      return { ok: true, profile };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("seat-browser:setcookie", async (_e, arg) => {
    const name = String(arg && arg.name || "");
    const value = String(arg && arg.value || "");
    const origin = String(arg && arg.origin || "");
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return { error: "cookie name must be letters, numbers, _ or -" };
    if (!/^https?:\/\//.test(origin)) return { error: "no page origin to set the cookie on" };
    try {
      await seatBrowser.cookies.set({ url: origin, name, value, secure: origin.startsWith("https") });
      return { ok: true, name };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  const passkeyChrome = passkey.bridge({ dir: join(HIVE_HOME, "passkey"), home: HOME });
  ipcMain.handle("seat-browser:passkey", async (event, ask) => {
    if (!IS_MAC) return { error: { name: "NotSupportedError", message: "the passkey bridge only runs on a Mac" } };
    if (!seatWc.has(event.sender.id)) return { error: { name: "NotAllowedError", message: "only a seat browser tab can ask for a passkey" } };
    const origin = passkey.originOf(event.senderFrame && event.senderFrame.url);
    if (!origin) return { error: { name: "SecurityError", message: "a passkey is only bridged for an https page" } };
    return passkeyChrome.sign({ kind: ask && ask.kind, origin, options: ask && ask.options });
  });
  ipcMain.handle("seat-browser:cookies", async (_e, arg) => {
    const origin = String(arg && arg.origin || "");
    if (!/^https?:\/\//.test(origin)) return { error: "no page origin to read cookies from" };
    try {
      const list = await seatBrowser.cookies.get({ url: origin });
      return { ok: true, cookies: list.map((c) => ({ name: c.name, hint: maskCookie(c.value), httpOnly: !!c.httpOnly, domain: c.domain || "" })) };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("seat-browser:emulate", async (_e, wcId, params) => {
    const wc = seatGuest(wcId);
    if (!wc) return { error: "not a seat browser tab" };
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      if (!params || !params.width) {
        await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
        await wc.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
      } else {
        await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: params.width, height: params.height, deviceScaleFactor: 0, mobile: !!params.mobile });
        await wc.debugger.sendCommand("Emulation.setTouchEmulationEnabled", params.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      }
      return { ok: true };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  const TYPED_KEYS = {
    Enter: { keyCode: "Enter", text: "\r" },
    Tab: { keyCode: "Tab" },
    Escape: { keyCode: "Escape" },
    Backspace: { keyCode: "Backspace" },
    Delete: { keyCode: "Delete" },
    ArrowUp: { keyCode: "Up" },
    ArrowDown: { keyCode: "Down" },
    ArrowLeft: { keyCode: "Left" },
    ArrowRight: { keyCode: "Right" },
    PageUp: { keyCode: "PageUp" },
    PageDown: { keyCode: "PageDown" },
    Home: { keyCode: "Home" },
    End: { keyCode: "End" }
  };
  const NET_KEEP = 300;
  const seatNet = new Map();
  const netOf = (wcId) => {
    let kept = seatNet.get(wcId);
    if (!kept) { kept = []; seatNet.set(wcId, kept); }
    return kept;
  };
  const watchNetwork = (guest) => {
    guest.debugger.on("message", (_event, method, params) => {
      if (method === "Network.requestWillBeSent") {
        const kept = netOf(guest.id);
        if (params.type === "Document" && !params.redirectResponse && params.frameId && params.loaderId === params.requestId) kept.length = 0;
        kept.push({ id: params.requestId, at: params.timestamp, method: params.request?.method || "", url: String(params.request?.url || "").slice(0, 400), kind: params.type || "", status: 0, size: 0, ms: 0, failed: "" });
        if (kept.length > NET_KEEP) kept.splice(0, kept.length - NET_KEEP);
      }
      if (method === "Network.responseReceived") {
        const call = netOf(guest.id).find((one) => one.id === params.requestId);
        if (call) { call.status = params.response?.status || 0; call.kind = params.type || call.kind; call.ms = Math.max(0, Math.round((params.timestamp - call.at) * 1000)); }
      }
      if (method === "Network.loadingFinished") {
        const call = netOf(guest.id).find((one) => one.id === params.requestId);
        if (call) { call.size = params.encodedDataLength || 0; call.ms = Math.max(call.ms, Math.round((params.timestamp - call.at) * 1000)); }
      }
      if (method === "Network.loadingFailed") {
        const call = netOf(guest.id).find((one) => one.id === params.requestId);
        if (call) call.failed = String(params.errorText || "failed").slice(0, 120);
      }
    });
    try { guest.debugger.sendCommand("Network.enable", { maxTotalBufferSize: 5 << 20, maxResourceBufferSize: 1 << 20 }); } catch {}
    guest.once("destroyed", () => seatNet.delete(guest.id));
  };
  ipcMain.handle("seat-browser:network", async (_e, wcId) => {
    if (!seatGuest(wcId)) return { error: "not a seat browser tab" };
    return { ok: true, calls: netOf(wcId).map(({ id, at, ...said }) => said) };
  });
  ipcMain.handle("seat-browser:upload", async (_e, wcId, files) => {
    const wc = seatGuest(wcId);
    if (!wc) return { error: "not a seat browser tab" };
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      const root = await wc.debugger.sendCommand("DOM.getDocument", { depth: 1 });
      const found = await wc.debugger.sendCommand("DOM.querySelector", { nodeId: root.root.nodeId, selector: "[data-hive-upload]" });
      if (!found.nodeId) return { error: "the field went away before the file could be handed to it" };
      await wc.debugger.sendCommand("DOM.setFileInputFiles", { nodeId: found.nodeId, files });
      return { ok: true };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("hive:system-sound", async () => {
    if (IS_MAC && systemPreferences.getMediaAccessStatus("screen") === "denied") return { allowed: false, state: "denied" };
    systemSoundUntil = Date.now() + 15000;
    return { allowed: true, state: "armed" };
  });
  ipcMain.handle("hive:microphone", async () => {
    if (!IS_MAC) return { allowed: true, state: "granted" };
    const state = systemPreferences.getMediaAccessStatus("microphone");
    if (state === "granted") return { allowed: true, state };
    if (state === "denied" || state === "restricted") return { allowed: false, state };
    const said = await systemPreferences.askForMediaAccess("microphone").catch(() => false);
    return { allowed: !!said, state: said ? "granted" : "denied" };
  });

  ipcMain.handle("seat-browser:external", (_e, url) => {
    if (/^https?:/.test(String(url || ""))) shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle("seat-browser:input", async (_e, wcId, act) => {
    const wc = seatGuest(wcId);
    if (!wc) return { error: "not a seat browser tab" };
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      if (act.kind === "click") {
        const at = { x: Math.round(act.x), y: Math.round(act.y), button: "left" };
        await wc.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, clickCount: 0 });
        await wc.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", ...at, clickCount: 1 });
        await wc.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, clickCount: 1 });
        return { ok: true };
      }
      if (act.kind === "text") {
        for (const letter of String(act.text || "")) wc.sendInputEvent({ type: "char", keyCode: letter });
        return { ok: true };
      }
      if (act.kind === "key") {
        const stroke = TYPED_KEYS[act.key];
        if (!stroke) return { error: `${act.key} is not a key this browser sends — ${Object.keys(TYPED_KEYS).join(", ")}` };
        wc.sendInputEvent({ type: "keyDown", keyCode: stroke.keyCode });
        if (stroke.text) wc.sendInputEvent({ type: "char", keyCode: stroke.text });
        wc.sendInputEvent({ type: "keyUp", keyCode: stroke.keyCode });
        return { ok: true };
      }
      return { error: "unknown input" };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  window_.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
    if (String(params.partition || "").includes("seat-browser")) webPreferences.preload = join(HERE, "main", "seat-preload.js");
  });
  window_.webContents.on("did-attach-webview", (_ev, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (guest.session === seatBrowser && /^https?:/.test(url)) {
        if (!window_.isDestroyed()) window_.webContents.send("seat-browser:popup", guest.id, url);
        return { action: "deny" };
      }
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    if (guest.session === seatBrowser) {
      seatWc.add(guest.id);
      guest.once("destroyed", () => seatWc.delete(guest.id));
      try { guest.debugger.attach("1.3"); watchNetwork(guest); } catch {}
    }
  });
  window_.on("resize", saveState);
  window_.on("move", saveState);
  window_.on("close", (e) => {
    saveState();
    if (quitting || !IS_MAC) return;
    e.preventDefault();
    window_.hide();
  });
}

function notify(session) {
  if (!Notification.isSupported()) return;
  console.log(`notice: ${session.name} needs you`);
  const notice = new Notification({
    title: `${session.title || session.name} needs you`,
    body: session.summary || "stopped at a dialog waiting for an answer",
    silent: false
  });
  notice.on("click", () => show(session.name));
  notice.show();
}

async function watch() {
  let data;
  try {
    const r = await fetch(`${BASE}/api/hive`);
    data = await r.json();
  } catch { return; }

  const sessions = data.sessions || [];
  let asking = 0;
  for (const s of sessions) {
    if (s.state === "needs") asking++;
    const previous = before.get(s.name);
    const turned = previous && previous !== "needs";
    const fresh = !previous && !firstRound;
    if (s.state === "needs" && (turned || fresh)) notify(s);
    before.set(s.name, s.state);
  }
  for (const name of [...before.keys()]) {
    if (!sessions.some((s) => s.name === name)) before.delete(name);
  }
  firstRound = false;
  if (app.dock) app.dock.setBadge(asking ? String(asking) : "");
}

const GAZE_MS = 40;
const cursorWatch = new Map();

function stopCursor(win) {
  const timer = cursorWatch.get(win);
  if (!timer) return;
  clearInterval(timer);
  cursorWatch.delete(win);
}

function watchCursor(win) {
  if (cursorWatch.has(win)) return;
  const tick = () => {
    if (!win || win.isDestroyed()) return stopCursor(win);
    if (!win.isVisible() || win.isMinimized()) return;
    const at = screen.getCursorScreenPoint();
    const box = win.getContentBounds();
    win.webContents.send("hive:gaze-at", { x: at.x - box.x, y: at.y - box.y });
  };
  cursorWatch.set(win, setInterval(tick, GAZE_MS));
  win.once("closed", () => stopCursor(win));
}

function zoomWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return window_ && !window_.isDestroyed() ? window_ : null;
}

function zoomTo(step) {
  const win = zoomWindow();
  if (!win) return;
  win.webContents.setZoomLevel(zoom.nextLevel(win.webContents.getZoomLevel(), step));
}

function buildMenu() {
  const hive = [
    { label: "Bring to front", click: () => show() },
    { type: "separator" },
    { label: "Open in the browser", click: () => shell.openExternal(BASE) },
    { label: "Config file", click: () => shell.openPath(configFile()) },
    { label: "Data folder", click: () => shell.openPath(app.getPath("userData")) }
  ];
  if (!IS_MAC) hive.push({ type: "separator" }, { role: "quit", label: "Quit" });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { label: "View", submenu: zoom.viewMenu(zoomTo) },
    { label: "Hive", submenu: hive },
    { role: "windowMenu" }
  ]));
}

const OPENER = { shelf: "hiveOpenPage", join: "hiveOpenJoin", seat: "hiveGoTo" };

let linkWaiting = null;

function offerLink(link) {
  if (!window_ || window_.isDestroyed()) return Promise.resolve(false);
  const open = OPENER[link.kind];
  const said = JSON.stringify(link.asked);
  return window_.webContents.executeJavaScript(
    `Boolean(window.${open}) && (window.${open}(${said}), true)`
  );
}

function handLink(link) {
  deliverLink({
    asked: link,
    offer: offerLink,
    again: (retry) => setTimeout(retry, LINK_WAIT)
  }).catch(() => {});
}

function openHiveLink(raw) {
  const link = linkOf(raw);
  if (!link) return false;
  if (!app.isReady()) {
    linkWaiting = link;
    return true;
  }
  const solo = link.kind === "seat" && seatWindows.get(link.asked);
  if (solo && !solo.isDestroyed()) {
    show(link.asked);
    return true;
  }
  show();
  handLink(link);
  return true;
}

function linkAmong(argv) {
  return (argv || []).find((one) => String(one).startsWith("hive://")) || "";
}

if (process.env.HIVE_USER_DATA) app.setPath("userData", process.env.HIVE_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_event, argv) => {
  const link = linkAmong(argv);
  if (!link || !openHiveLink(link)) show();
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  openHiveLink(url);
});

if (!process.env.HIVE_SANDBOX) app.setAsDefaultProtocolClient(relay.SCHEME);
relay.registerScheme();

let awayWatch = null;

function tellAway(win, away = awayWatch?.away() || false) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("hive:away", away);
}

app.whenReady().then(async () => {
  relay.serveOverSocket(SOCK);
  relay.wireTerminals({ ipcMain, socketPath: SOCK });
  const icon = nativeImage.createFromPath(join(HERE, "assets/icon.png"));
  if (app.dock && !icon.isEmpty()) app.dock.setIcon(icon);
  buildMenu();

  createWindow();
  awayWatch = watchAway({ power: powerMonitor, tell: (away) => BrowserWindow.getAllWindows().forEach((win) => tellAway(win, away)) });

  try {
    const [shellPath, shellGithubToken] = await Promise.all([loginShellPath(), loginShellGithubToken()]);
    path = (shellPath || CANDIDATES.join(PATH_SEP)) + PATH_SEP + CANDIDATES.join(PATH_SEP);
    githubToken = shellGithubToken;
    if (!(await startServer())) return setBootStep({ type: "failed" });

    setBootStep({ type: "step", step: "pod" });
    showBase();
    setBootStep({ type: "ready" });
    if (linkWaiting) {
      const link = linkWaiting;
      linkWaiting = null;
      handLink(link);
    }
    watch();
    clock = setInterval(watch, 3000);
  } catch (wrong) {
    setBootStep({ type: "failed", reason: `the boot broke (${wrong.code || wrong.message || "unknown error"})` });
    dialog.showErrorBox("Hive", `The boot broke.\n\n${wrong.stack || wrong.message}`);
  }
});

app.on("activate", () => show());

app.on("before-quit", () => {
  quitting = true;
  clearInterval(clock);
  awayWatch?.stop();
  if (server) { try { server.kill(); } catch {} }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

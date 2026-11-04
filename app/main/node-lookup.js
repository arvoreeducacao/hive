const { posix, win32 } = require("node:path");
const { readdirSync } = require("node:fs");
const { execFile } = require("node:child_process");

const WINDOWS_PATH_SCRIPT = [
  "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
  "[Environment]::GetEnvironmentVariable('Path', 'Machine')",
  "[Environment]::GetEnvironmentVariable('Path', 'User')"
].join("; ");

function versionOf(name) {
  const parts = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(name);
  return parts ? [Number(parts[1]), Number(parts[2] || 0), Number(parts[3] || 0)] : null;
}

function newestFirst(names) {
  const numbered = names.filter(versionOf).sort((a, b) => {
    const [x, y] = [versionOf(a), versionOf(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  });
  return [...numbered, ...names.filter((name) => !versionOf(name))];
}

function versionsIn(root, read) {
  try {
    return newestFirst(read(root).map(String));
  } catch {
    return [];
  }
}

function unixNodes({ home, read = readdirSync }) {
  const { join } = posix;
  const managed = [
    join(home, ".local/share/mise/installs/node"),
    join(home, ".asdf/installs/nodejs"),
    join(home, ".nvm/versions/node")
  ].flatMap((root) => versionsIn(root, read).map((version) => join(root, version, "bin", "node")));
  return [...managed, join(home, ".volta/bin/node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"];
}

function windowsNodes({ env, home, read = readdirSync }) {
  const { join } = win32;
  const roaming = env.APPDATA || join(home, "AppData", "Roaming");
  const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
  const inEachVersion = (root, ...inside) => versionsIn(root, read).map((version) => join(root, version, ...inside, "node.exe"));
  const fnmRoots = [env.FNM_DIR, join(roaming, "fnm"), join(local, "fnm"), join(home, ".fnm")].filter(Boolean);
  const scoop = env.SCOOP || join(home, "scoop");
  return [
    env.NVM_SYMLINK && join(env.NVM_SYMLINK, "node.exe"),
    env.ProgramFiles && join(env.ProgramFiles, "nodejs", "node.exe"),
    ...fnmRoots.flatMap((root) => [join(root, "aliases", "default", "node.exe"), ...inEachVersion(join(root, "node-versions"), "installation")]),
    ...inEachVersion(join(env.MISE_DATA_DIR || join(local, "mise"), "installs", "node")),
    ...inEachVersion(join(local, "Volta", "tools", "image", "node")),
    join(scoop, "apps", "nodejs-lts", "current", "node.exe"),
    join(scoop, "apps", "nodejs", "current", "node.exe"),
    ...(env.NVM_HOME ? inEachVersion(env.NVM_HOME) : [])
  ].filter(Boolean);
}

function versionManagerNodes({ platform = process.platform, env = process.env, home, read = readdirSync }) {
  return platform === "win32" ? windowsNodes({ env, home, read }) : unixNodes({ home, read });
}

function windowsSavedPath({ env = process.env, run = execFile } = {}) {
  const powershell = win32.join(env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((done) => {
    run(powershell, ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PATH_SCRIPT], { timeout: 15000, windowsHide: true }, (err, out) => {
      if (err) return done("");
      done(String(out || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(";"));
    });
  });
}

function uniquePath(parts, platform = process.platform) {
  const separator = platform === "win32" ? ";" : ":";
  const seen = new Set();
  const kept = [];
  for (const dir of parts.flatMap((part) => String(part || "").split(separator))) {
    const key = platform === "win32" ? dir.toLowerCase() : dir;
    if (!dir || seen.has(key)) continue;
    seen.add(key);
    kept.push(dir);
  }
  return kept.join(separator);
}

function withNodeDir(path, node, platform = process.platform) {
  const dir = (platform === "win32" ? win32 : posix).dirname(node);
  return uniquePath([path, dir], platform);
}

function nodeMissingMessage(path, platform = process.platform) {
  const looked = platform === "win32"
    ? "Looked in the PATH that Windows keeps for this user, in Program Files\\nodejs and in the folders of nvm-windows, fnm, mise, Volta and Scoop."
    : "Looked in the login shell PATH and in the folders of mise, asdf, nvm and Volta.";
  return `Could not find node.\n\n${looked}\n\nInstall Node.js 22 from nodejs.org, then open the Hive again.\n\nPATH used:\n${path}`;
}

module.exports = { newestFirst, versionManagerNodes, windowsSavedPath, uniquePath, withNodeDir, nodeMissingMessage, WINDOWS_PATH_SCRIPT };

const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { newestFirst, versionManagerNodes, windowsSavedPath, uniquePath, withNodeDir, nodeMissingMessage } = require("../main/node-lookup.js");

const HOME = "C:\\Users\\alguem";
const WINDOWS_ENV = {
  APPDATA: "C:\\Users\\alguem\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\alguem\\AppData\\Local",
  ProgramFiles: "C:\\Program Files",
  SystemRoot: "C:\\Windows"
};

function folders(tree) {
  return (root) => {
    if (!tree[root]) throw Object.assign(new Error(`ENOENT ${root}`), { code: "ENOENT" });
    return tree[root];
  };
}

function windowsLookup(tree, env = {}) {
  return versionManagerNodes({ platform: "win32", env: { ...WINDOWS_ENV, ...env }, home: HOME, read: folders(tree) });
}

test("node installed by fnm from winget is found by its default alias and by its versions", () => {
  const found = windowsLookup({ "C:\\Users\\alguem\\AppData\\Roaming\\fnm\\node-versions": ["v26.13.0", "v22.11.0"] });
  assert.ok(found.includes("C:\\Users\\alguem\\AppData\\Roaming\\fnm\\aliases\\default\\node.exe"));
  const versions = found.filter((file) => file.includes("node-versions"));
  assert.deepEqual(versions.slice(0, 2), [
    "C:\\Users\\alguem\\AppData\\Roaming\\fnm\\node-versions\\v26.13.0\\installation\\node.exe",
    "C:\\Users\\alguem\\AppData\\Roaming\\fnm\\node-versions\\v22.11.0\\installation\\node.exe"
  ]);
});

test("FNM_DIR moves the fnm folder the lookup reads", () => {
  const found = windowsLookup({ "D:\\fnm\\node-versions": ["v22.11.0"] }, { FNM_DIR: "D:\\fnm" });
  assert.ok(found.includes("D:\\fnm\\node-versions\\v22.11.0\\installation\\node.exe"));
});

test("node installed by mise on Windows sits in its local app data, with no bin folder", () => {
  const found = windowsLookup({ "C:\\Users\\alguem\\AppData\\Local\\mise\\installs\\node": ["9.11.2", "latest", "22.11.0"] });
  const mise = found.filter((file) => file.includes("\\mise\\"));
  assert.deepEqual(mise, [
    "C:\\Users\\alguem\\AppData\\Local\\mise\\installs\\node\\22.11.0\\node.exe",
    "C:\\Users\\alguem\\AppData\\Local\\mise\\installs\\node\\9.11.2\\node.exe",
    "C:\\Users\\alguem\\AppData\\Local\\mise\\installs\\node\\latest\\node.exe"
  ]);
});

test("nvm-windows is read from its active link and from each version it keeps", () => {
  const found = windowsLookup({ "C:\\nvm": ["v20.18.0", "v22.11.0", "nvm.exe"] }, { NVM_SYMLINK: "C:\\nodejs", NVM_HOME: "C:\\nvm" });
  assert.equal(found[0], "C:\\nodejs\\node.exe");
  assert.ok(found.indexOf("C:\\nvm\\v22.11.0\\node.exe") < found.indexOf("C:\\nvm\\v20.18.0\\node.exe"));
  assert.ok(!found.includes("C:\\nvm\\node.exe"), "nvm-windows never keeps node.exe at the top of its folder");
});

test("the official installer, Volta and Scoop are looked at too", () => {
  const found = windowsLookup({ "C:\\Users\\alguem\\AppData\\Local\\Volta\\tools\\image\\node": ["22.11.0"] });
  assert.ok(found.includes("C:\\Program Files\\nodejs\\node.exe"));
  assert.ok(found.includes("C:\\Users\\alguem\\AppData\\Local\\Volta\\tools\\image\\node\\22.11.0\\node.exe"));
  assert.ok(found.includes("C:\\Users\\alguem\\scoop\\apps\\nodejs-lts\\current\\node.exe"));
  assert.ok(found.includes("C:\\Users\\alguem\\scoop\\apps\\nodejs\\current\\node.exe"));
});

test("macOS and Linux keep their version manager folders", () => {
  const found = versionManagerNodes({
    platform: "darwin",
    home: "/Users/alguem",
    read: folders({ "/Users/alguem/.local/share/mise/installs/node": ["22.11.0"], "/Users/alguem/.nvm/versions/node": ["v20.18.0"] })
  });
  assert.deepEqual(found, [
    "/Users/alguem/.local/share/mise/installs/node/22.11.0/bin/node",
    "/Users/alguem/.nvm/versions/node/v20.18.0/bin/node",
    "/Users/alguem/.volta/bin/node",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node"
  ]);
});

test("versions sort by number, so 22 comes before 9", () => {
  assert.deepEqual(newestFirst(["9.11.2", "lts", "v22.1.0", "22.11.0", "20"]), ["22.11.0", "v22.1.0", "20", "9.11.2", "lts"]);
});

test("the PATH Windows keeps is read without the PowerShell profile, machine first and user second", async () => {
  let asked;
  const run = (file, args, options, done) => {
    asked = { file, args, options };
    done(null, "C:\\Windows\\system32;C:\\Program Files\\nodejs\\\r\nC:\\Users\\alguem\\AppData\\Local\\Microsoft\\WindowsApps\r\n");
  };
  const saved = await windowsSavedPath({ env: WINDOWS_ENV, run });
  assert.equal(saved, "C:\\Windows\\system32;C:\\Program Files\\nodejs\\;C:\\Users\\alguem\\AppData\\Local\\Microsoft\\WindowsApps");
  assert.equal(asked.file, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.ok(asked.args.includes("-NoProfile"));
  assert.match(asked.args.at(-1), /'Path', 'Machine'.*'Path', 'User'/);
  assert.match(asked.args.at(-1), /UTF8/, "a user folder with an accent must come back whole");
  assert.equal(asked.options.windowsHide, true);
});

test("a PowerShell that fails leaves the PATH the app was started with", async () => {
  const saved = await windowsSavedPath({ env: WINDOWS_ENV, run: (file, args, options, done) => done(new Error("blocked"), "") });
  assert.equal(saved, "");
});

test("the PATH keeps the first of each folder, without case on Windows", () => {
  assert.equal(uniquePath(["C:\\Windows;C:\\Tools", "c:\\windows;C:\\Other;"], "win32"), "C:\\Windows;C:\\Tools;C:\\Other");
  assert.equal(uniquePath(["", "/usr/bin:/bin"], "linux"), "/usr/bin:/bin");
  assert.equal(uniquePath(["/opt/A:/usr/bin", "/opt/a:/usr/bin"], "darwin"), "/opt/A:/usr/bin:/opt/a");
});

test("the folder of the node the app found joins the PATH of the server and the chats", () => {
  const node = "C:\\Users\\alguem\\AppData\\Roaming\\fnm\\aliases\\default\\node.exe";
  assert.equal(withNodeDir("C:\\Windows", node, "win32"), "C:\\Windows;C:\\Users\\alguem\\AppData\\Roaming\\fnm\\aliases\\default");
  assert.equal(withNodeDir("C:\\Program Files\\nodejs;C:\\Windows", "C:\\Program Files\\nodejs\\node.exe", "win32"), "C:\\Program Files\\nodejs;C:\\Windows");
  assert.equal(withNodeDir("/usr/bin", "/Users/alguem/.local/share/mise/installs/node/22.11.0/bin/node", "darwin"), "/usr/bin:/Users/alguem/.local/share/mise/installs/node/22.11.0/bin");
});

test("the missing node box says where it looked on each system", () => {
  assert.match(nodeMissingMessage("C:\\Windows", "win32"), /fnm, mise, Volta and Scoop/);
  assert.match(nodeMissingMessage("C:\\Windows", "win32"), /PATH used:\nC:\\Windows/);
  assert.match(nodeMissingMessage("/usr/bin", "darwin"), /login shell PATH/);
});

test("the app reads the Windows PATH at boot and hands the node folder to the server", () => {
  const main = readFileSync(join(__dirname, "..", "main.js"), "utf8");
  const shellPath = main.slice(main.indexOf("async function loginShellPath"), main.indexOf("async function loginShellGithubToken"));
  assert.match(shellPath, /if \(IS_WINDOWS\) return nodeLookup\.windowsSavedPath\(\);/);
  const bootServer = main.slice(main.indexOf("async function bootServer"), main.indexOf("server = spawn(node"));
  assert.match(bootServer, /path = nodeLookup\.withNodeDir\(path, node\);/);
  assert.match(main.slice(main.indexOf("async function findNode")), /nodeLookup\.versionManagerNodes\(\{ home: HOME \}\)/);
});

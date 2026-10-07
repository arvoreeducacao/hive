import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NO_BASH, asPosixPath, bashOnWindows, fixArgv, gitBashOf } from "../doctor/fix-shell.mjs";
import { normalizeItem } from "../doctor/doctor-core.mjs";
import { onPath, pathDirs } from "../doctor/doctor-runner.mjs";
import * as readings from "../doctor/doctor-readings.mjs";

const windows = { platform: "win32", repo: "C:\\Users\\leo\\dev\\dev-workspaces", home: "C:\\Users\\leo", packageManager: "winget install" };
const linux = { platform: "linux", repo: "/home/ada/dev-workspaces", home: "/home/ada", packageManager: "sudo apt-get install -y" };

const WINDOWS_ENV = {
  SystemRoot: "C:\\Windows",
  ProgramFiles: "C:\\Program Files",
  PATH: "C:\\Windows\\system32;C:\\Program Files\\Git\\cmd;C:\\Users\\leo\\AppData\\Local\\Microsoft\\WindowsApps"
};

const hasOnly = (...files) => (path) => files.includes(path);

test("PATH is cut by the separator of the machine it was read on, so a windows folder survives whole", () => {
  assert.deepEqual(pathDirs({ PATH: "C:\\Windows\\system32;C:\\Program Files\\Git\\cmd" }, "win32"),
    ["C:\\Windows\\system32", "C:\\Program Files\\Git\\cmd"]);
  assert.deepEqual(pathDirs({ Path: "C:\\one;C:\\two" }, "win32"), ["C:\\one", "C:\\two"]);
  assert.deepEqual(pathDirs({ PATH: "/usr/bin:/bin" }, "linux"), ["/usr/bin", "/bin"]);
  assert.deepEqual(pathDirs({}, "win32"), []);
});

test("a command is found on windows by the extension that makes it runnable there", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hive-path-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "gh.exe"), "");
  assert.equal(await onPath("gh", [dir], "win32"), true, "gh.exe is what the installer leaves behind, and the check must see it");
  assert.equal(await onPath("gh", [dir], "linux"), false, "on unix the bare name is the only one that counts");
  assert.equal(await onPath("nothing", [dir], "win32"), false);
});

test("a fix that is a shell script goes to the bash Git for Windows ships, never to the one that opens another system", () => {
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const how = fixArgv({ command: "setup.sh ada" }, { platform: "win32", env: WINDOWS_ENV, exists: hasOnly(bash) });
  assert.equal(how.exe, bash);
  assert.equal(how.args[0], "-c");
  assert.match(how.args[1], /^PATH="\/usr\/bin:\/bin:\$PATH"; setup\.sh ada$/,
    "a bash started with -c carries none of its own folders, so the fix puts them back");
  assert.equal(gitBashOf({ PATH: "C:\\Windows\\System32" }, hasOnly("C:\\Windows\\System32\\bash.exe")), "",
    "System32 holds the launcher of the linux on the side, and a fix sent there installs nothing on this machine");
  assert.equal(gitBashOf({ HIVE_BASH: "D:\\git\\bash.exe" }, hasOnly("D:\\git\\bash.exe")), "D:\\git\\bash.exe");
});

test("a Git installed for one user only is found where its installer put it, and MSYS2 only counts when there is no Git", () => {
  const perUser = "C:\\Users\\leo\\AppData\\Local\\Programs\\Git\\bin\\bash.exe";
  const env = { ...WINDOWS_ENV, LOCALAPPDATA: "C:\\Users\\leo\\AppData\\Local" };
  assert.equal(gitBashOf(env, hasOnly(perUser)), perUser, "the non-admin installer lands under LOCALAPPDATA, and a search that stops at Program Files never sees it");
  assert.equal(bashOnWindows(env, hasOnly(perUser)), perUser);
  const msys = "C:\\msys64\\usr\\bin\\bash.exe";
  assert.equal(bashOnWindows(env, hasOnly(msys)), msys, "an MSYS2 from before the port still runs a script when it is all there is");
  assert.equal(bashOnWindows(env, hasOnly(msys, perUser)), perUser, "Git's bash is the one the doctor fixes with, so it is the one the server runs with");
  assert.equal(bashOnWindows(env, () => false), "");
});

test("the server asks for bash the same way the doctor does, with no list of folders of its own", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /^import \{ bashOnWindows \} from "\.\/doctor\/fix-shell\.mjs";$/m);
  assert.match(server, /^const BASH = IS_WINDOWS \? bashOnWindows\(\) : "bash";$/m);
  assert.doesNotMatch(server, /function bashOfTheSystem|msys64/, "a second list of places to look for bash is how a machine ends up found by one half of the app and not the other");
});

test("a machine with no Git Bash is told so instead of failing at a command nobody can read", () => {
  const how = fixArgv({ command: "setup.sh ada" }, { platform: "win32", env: WINDOWS_ENV, exists: () => false });
  assert.equal(how.error, NO_BASH);
  assert.equal(how.exe, undefined);
});

test("a fix that installs a package runs in the machine's own shell, where winget exists", () => {
  const how = fixArgv({ command: "winget install --id GitHub.cli -e", shell: "native" }, { platform: "win32", env: WINDOWS_ENV, exists: () => false });
  assert.equal(how.exe, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(how.args, ["/d", "/s", "/c", "winget install --id GitHub.cli -e"]);
});

test("nothing changes for a mac or a linux: every fix is still one bash away", () => {
  assert.deepEqual(fixArgv({ command: "brew install gh" }, { platform: "darwin" }), { exe: "bash", args: ["-c", "brew install gh"] });
  assert.deepEqual(fixArgv({ command: "x", shell: "native" }, { platform: "linux" }), { exe: "bash", args: ["-c", "x"] });
});

test("the shell a fix needs survives the trip through the report's json", () => {
  const kept = normalizeItem({ id: "deps", title: "deps", state: "fail", fix: { label: "install", command: "winget install --id GitHub.cli -e", shell: "native" } });
  assert.equal(kept.fix.shell, "native");
  assert.equal(normalizeItem({ id: "config", title: "c", state: "fail", fix: { label: "setup", command: "setup.sh ada" } }).fix.shell, undefined);
});

test("the missing tool is named to winget by its id, and the agreements are answered before nobody is asked", () => {
  const fix = readings.fixes.installDeps(windows, ["gh"]);
  assert.equal(fix.shell, "native");
  assert.equal(fix.command, "winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements");
  assert.match(readings.fixes.installDeps(windows, ["gh", "awscli"]).command, / && winget install --id Amazon\.AWSCLI /);
  assert.equal(readings.wingetCommand(["tmux"]), "", "there is no tmux to install on windows any more");
  assert.equal(readings.fixes.installDeps(linux, ["gh"]).command, "sudo apt-get install -y gh");
  assert.equal(readings.fixes.installDeps(linux, ["gh"]).shell, undefined);
});

test("the setup a windows machine is told to run is a path its shell can read, and the label says which shell", () => {
  const fix = readings.fixes.runSetup(windows);
  assert.equal(fix.command, '"C:/Users/leo/dev/dev-workspaces/infra/scripts/setup.sh" <your-name>');
  assert.equal(fix.label, "prepare this machine, in Git Bash");
  assert.match(readings.fixes.pointHub({ ...windows, dev: "leo", hub: "C:\\Users\\leo\\dev" }).command,
    /^"C:\/Users\/leo\/dev\/dev-workspaces\/infra\/scripts\/setup\.sh" leo C:\\Users\\leo\\dev$/);
  assert.equal(readings.fixes.runSetup({ ...linux, dev: "ada" }).command, "/home/ada/dev-workspaces/infra/scripts/setup.sh ada");
  assert.equal(readings.fixes.runSetup({ ...linux, dev: "ada" }).label, "prepare this machine");
  assert.equal(asPosixPath("C:\\a\\b"), "C:/a/b");
});

test("a windows machine is not told to put a folder on PATH that the hive stopped using", () => {
  const data = { keyExists: true, path: "C:\\Users\\leo\\.hive\\key-leo", bin: "C:\\Users\\leo\\.local\\bin", onPath: false };
  const seen = readings.checkKey(data, { ...windows, dev: "leo" });
  assert.equal(seen.state, "ok");
  assert.equal(seen.fix, null);
  const unix = readings.checkKey({ ...data, path: "/home/ada/.hive/key-ada", bin: "/home/ada/.local/bin" }, { ...linux, dev: "ada" });
  assert.equal(unix.state, "warn", "on unix the warning is still the one that was there");
});

test("the setup script no longer sends a windows machine after tmux, which no seat there uses", () => {
  const script = readFileSync(new URL("../../infra/scripts/setup.sh", import.meta.url), "utf8");
  assert.doesNotMatch(script, /msys64|MSYS2\.MSYS2/, "the port left tmux behind, and the recipe went with it");
  assert.doesNotMatch(script, /HIVE_TMUX|HIVE_BASH/, "neither variable exists any more");
  assert.match(script, /winget install --id \$id -e --accept-source-agreements --accept-package-agreements/,
    "the hint it prints is a command winget answers, not the name of the missing command");
});

test("an app that was installed, not cloned, asks for the checkout instead of naming a folder with no setup in it", () => {
  const packaged = { ...windows, repo: "C:\\Users\\leo\\AppData\\Local\\Programs\\Hive\\resources\\app", repoHasSetup: false };
  const fix = readings.fixes.runSetup(packaged);
  assert.equal(fix.command, `${readings.CHECKOUT_UNKNOWN}/infra/scripts/setup.sh <your-name>`);
  assert.doesNotMatch(fix.command, /resources/, "the app folder holds no setup.sh, so it is not what the person should paste");
  assert.equal(readings.fixes.runSetup({ ...windows, repoHasSetup: true }).command,
    '"C:/Users/leo/dev/dev-workspaces/infra/scripts/setup.sh" <your-name>');
});

test("an installed app runs the setup its bundle carries, and only asks for a checkout when it carries none", () => {
  const packaged = { ...windows, repo: "C:\\Users\\leo\\AppData\\Local\\Programs\\Hive\\resources\\app", repoHasSetup: false };
  const carried = readings.fixes.runSetup({ ...packaged, bundledSetup: "C:\\Users\\leo\\AppData\\Local\\Programs\\Hive\\resources\\setup\\setup.sh" });
  assert.equal(carried.command, '"C:/Users/leo/AppData/Local/Programs/Hive/resources/setup/setup.sh" <your-name>');
  assert.equal(readings.fixes.runSetup(packaged).command, `${readings.CHECKOUT_UNKNOWN}/infra/scripts/setup.sh <your-name>`);
  const onAMac = readings.fixes.runSetup({ ...linux, platform: "darwin", repoHasSetup: false, bundledSetup: "/Applications/Hive.app/Contents/Resources/setup/setup.sh", dev: "ada" });
  assert.equal(onAMac.command, "/Applications/Hive.app/Contents/Resources/setup/setup.sh ada");
});

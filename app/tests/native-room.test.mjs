import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KEY_BYTES, createNativeRoom, headlessScreen, pickWhere, programOnWindows, shellArgsFor, shellOnWindows, shimTarget
} from "../lib/native-room.mjs";

function fakePty() {
  const listeners = { data: [], exit: [] };
  const child = {
    written: [],
    size: null,
    killed: false,
    onData: (fn) => { listeners.data.push(fn); return { dispose() {} }; },
    onExit: (fn) => { listeners.exit.push(fn); return { dispose() {} }; },
    write: (text) => child.written.push(text),
    resize: (c, r) => { child.size = [c, r]; },
    kill: () => { child.killed = true; },
    emit: (data) => listeners.data.forEach((fn) => fn(data)),
    exit: (code) => listeners.exit.forEach((fn) => fn({ exitCode: code }))
  };
  return child;
}

function roomWith(programs = {}) {
  const spawned = [];
  const room = createNativeRoom({
    spawn: (file, args, options) => {
      const child = fakePty();
      spawned.push({ file, args, options, child });
      return child;
    },
    resolve: async (name) => (name in programs ? programs[name] : { file: `C:\\bin\\${name}.exe`, args: [] }),
    exists: (path) => path !== "C:\\gone",
    env: { PATH: "C:\\bin" },
    hub: "C:\\hub",
    cols: 40,
    rows: 6,
    scrollback: 50,
    graceMs: 20,
    wait: async () => {}
  });
  return { room, spawned };
}

const settled = () => new Promise((done) => setTimeout(done, 15));

test("where.exe answers are read for a real executable first, then a script shim, and nothing else", () => {
  assert.equal(pickWhere("C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\nC:\\bin\\claude.exe\r\n"), "C:\\bin\\claude.exe");
  assert.equal(pickWhere(["C:\\npm\\claude", "C:\\npm\\claude.cmd"]), "C:\\npm\\claude.cmd");
  assert.equal(pickWhere(["C:\\npm\\claude"]), "");
  assert.equal(pickWhere([]), "");
});

test("an npm shim names the script it wraps, and that script runs under node instead of cmd", async () => {
  const cmd = '@ECHO off\r\nSETLOCAL\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n';
  assert.equal(shimTarget(cmd), "");
  const older = '@"%~dp0\\node.exe"  "%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n';
  assert.equal(shimTarget(older), "node_modules\\@anthropic-ai\\claude-code\\cli.js");
  const found = await programOnWindows("claude", {
    where: async () => ["C:\\npm\\claude", "C:\\npm\\claude.cmd"],
    read: () => older,
    exists: (path) => path === "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
    node: "C:\\node\\node.exe",
    env: {}
  });
  assert.deepEqual(found, { file: "C:\\node\\node.exe", args: ["C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"] });
});

test("a shim nobody can read through still runs, through cmd, and a missing program is nobody", async () => {
  const found = await programOnWindows("codex", {
    where: async () => ["C:\\npm\\codex.cmd"],
    read: () => "@echo off\r\nnode %*",
    exists: () => false,
    env: { SystemRoot: "D:\\Win" }
  });
  assert.deepEqual(found, { file: "D:\\Win\\System32\\cmd.exe", args: ["/d", "/s", "/c", "C:\\npm\\codex.cmd"] });
  assert.equal(await programOnWindows("nothing", { where: async () => [], env: {} }), null);
  assert.deepEqual(await programOnWindows("node", { where: async () => [], node: "C:\\n.exe", env: {} }), { file: "C:\\n.exe", args: [] });
});

test("claude is the copy the hive already keeps when there is one, and where.exe otherwise", async () => {
  const kept = await programOnWindows("claude", { where: async () => ["C:\\other\\claude.exe"], exists: (p) => p === "C:\\hive\\claude.exe", claude: "C:\\hive\\claude.exe", env: {} });
  assert.deepEqual(kept, { file: "C:\\hive\\claude.exe", args: [] });
  const found = await programOnWindows("claude", { where: async () => ["C:\\other\\claude.exe"], exists: () => false, claude: "C:\\hive\\claude.exe", env: {} });
  assert.deepEqual(found, { file: "C:\\other\\claude.exe", args: [] });
});

test("the shell is PowerShell 7 when it is there, the built-in one when not, and whatever HIVE_SHELL names first", async () => {
  assert.deepEqual(await shellOnWindows({ where: async () => ["C:\\PS\\pwsh.exe"], env: {} }), { file: "C:\\PS\\pwsh.exe", args: ["-NoLogo"] });
  assert.deepEqual(await shellOnWindows({ where: async () => [], env: { SystemRoot: "C:\\Windows" } }),
    { file: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", args: ["-NoLogo"] });
  assert.deepEqual(await shellOnWindows({ where: async () => ["C:\\PS\\pwsh.exe"], env: { HIVE_SHELL: "C:\\Git\\bin\\bash.exe" }, exists: () => true }),
    { file: "C:\\Git\\bin\\bash.exe", args: ["-l"] });
  assert.deepEqual(shellArgsFor("C:\\x\\nu.exe"), []);
});

test("the headless screen keeps what the program printed and hands the last lines back without the blank tail", async () => {
  const screen = headlessScreen({ cols: 20, rows: 4, scrollback: 10 });
  await new Promise((done) => screen.write("one\r\ntwo\r\n\x1b[32mthree\x1b[0m\r\n", done));
  assert.equal(screen.tail(10), "one\ntwo\nthree");
  assert.equal(screen.tail(2), "two\nthree");
  assert.match(screen.serialize(), /\x1b\[32mthree/);
  screen.dispose();
});

test("a seat opens as a pty in its folder with the hive's variables, and is listed while it lives", async () => {
  const { room, spawned } = roomWith();
  const opened = await room.open({ name: "orca", program: "claude", args: ["--resume", "abc"], env: { CLAUDE_CONFIG_DIR: "C:\\hive\\accounts\\extra\\" }, cwd: "C:\\work" });
  assert.deepEqual(opened, { ok: true, cwd: "C:\\work" });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].file, "C:\\bin\\claude.exe");
  assert.deepEqual(spawned[0].args, ["--resume", "abc"]);
  assert.equal(spawned[0].options.cwd, "C:\\work");
  assert.equal(spawned[0].options.env.CLAUDE_CONFIG_DIR, "C:\\hive\\accounts\\extra\\");
  assert.equal(spawned[0].options.env.TERM, "xterm-256color");
  assert.equal(spawned[0].options.env.PATH, "C:\\bin");
  assert.deepEqual(room.list(), [{ name: "orca", dead: false, command: "claude", cwd: "C:\\work", account: "extra" }]);
  assert.equal(room.has("orca"), true);
  assert.equal(room.cwdOf("orca"), "C:\\work");
  const again = await room.open({ name: "orca", program: "claude" });
  assert.match(again.error, /already a seat here/);
});

test("a folder that is gone falls back to the hub, and a program nobody has is refused before anything spawns", async () => {
  const { room, spawned } = roomWith({ nothing: null });
  const opened = await room.open({ name: "lua", program: "claude", cwd: "C:\\gone" });
  assert.equal(opened.cwd, "C:\\hub");
  assert.equal(spawned[0].options.cwd, "C:\\hub");
  const refused = await room.open({ name: "x", program: "nothing" });
  assert.match(refused.error, /nothing is not installed/);
  assert.equal(spawned.length, 1);
});

test("a shell seat runs the shell the machine has, not a program called shell", async () => {
  const { room, spawned } = roomWith({ shell: { file: "C:\\PS\\pwsh.exe", args: ["-NoLogo"] } });
  await room.open({ name: "term", kind: "shell", cwd: "C:\\hub" });
  assert.equal(spawned[0].file, "C:\\PS\\pwsh.exe");
  assert.deepEqual(spawned[0].args, ["-NoLogo"]);
  assert.equal(room.list()[0].command, "shell");
});

test("what the program prints is what capture reads back, and typing reaches its keyboard", async () => {
  const { room, spawned } = roomWith();
  await room.open({ name: "orca", program: "claude" });
  spawned[0].child.emit("hello\r\n> ");
  await settled();
  assert.equal(room.capture("orca", 10), "hello\n>");
  assert.equal(await room.type("orca", "ls", { enter: true }), true);
  assert.deepEqual(spawned[0].child.written, ["ls", "\r"]);
  assert.equal(await room.type("nobody", "x"), false);
});

test("a viewer gets the screen so far, then the live bytes, and leaving does not kill the seat", async () => {
  const { room, spawned } = roomWith();
  await room.open({ name: "orca", program: "claude" });
  spawned[0].child.emit("before\r\n");
  await settled();
  const seen = [];
  const view = room.attach("orca", { cols: 100, rows: 30, onData: (d) => seen.push(d) });
  assert.deepEqual(spawned[0].child.size, [100, 30]);
  assert.match(seen[0], /before/);
  spawned[0].child.emit("after");
  assert.equal(seen[1], "after");
  view.write("y");
  view.resize(80, 24);
  assert.deepEqual(spawned[0].child.written, ["y"]);
  assert.deepEqual(spawned[0].child.size, [80, 24]);
  view.detach();
  spawned[0].child.emit("unseen");
  assert.equal(seen.length, 2);
  assert.equal(spawned[0].child.killed, false);
  assert.equal(room.attach("nobody", {}), null);
});

test("a seat that dies leaves the list, keeps its last screen for a while, and tells whoever was watching", async () => {
  const { room, spawned } = roomWith();
  await room.open({ name: "orca", program: "claude" });
  let ended = null;
  room.attach("orca", { onExit: (code) => { ended = code; } });
  spawned[0].child.emit("bash: claude: command not found\r\n");
  await settled();
  spawned[0].child.exit(127);
  assert.equal(ended, 127);
  assert.equal(room.has("orca"), false);
  assert.deepEqual(room.list(), []);
  assert.equal(room.knows("orca"), true);
  assert.deepEqual(room.list({ dead: true }).map((one) => [one.name, one.dead]), [["orca", true]]);
  assert.match(room.capture("orca", 5), /command not found/);
  const reopened = await room.open({ name: "orca", program: "claude" });
  assert.equal(reopened.ok, true);
  assert.equal(spawned.length, 2);
});

test("kill takes the pty down and forgets the window, and closeAll does that for every seat", async () => {
  const { room, spawned } = roomWith();
  await room.open({ name: "a", program: "claude" });
  await room.open({ name: "b", program: "claude" });
  assert.equal(room.kill("a"), true);
  assert.equal(spawned[0].child.killed, true);
  assert.equal(room.kill("a"), false);
  assert.deepEqual(room.list().map((one) => one.name), ["b"]);
  room.closeAll();
  assert.equal(spawned[1].child.killed, true);
  assert.deepEqual(room.list(), []);
});

test("the keys the sign-in takes are the bytes a terminal sends for them", () => {
  assert.equal(KEY_BYTES.Enter, "\r");
  assert.equal(KEY_BYTES.Down, "\x1b[B");
  assert.equal(KEY_BYTES["C-c"], "\x03");
  assert.equal(KEY_BYTES.BSpace, "\x7f");
});

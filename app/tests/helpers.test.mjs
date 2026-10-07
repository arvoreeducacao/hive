import { test } from "node:test";
import assert from "node:assert";
import { strandedHelpers, strandedServers } from "../lib/helpers.mjs";

const HELPER = 'claude -p Read this --model haiku --strict-mcp-config --mcp-config {"mcpServers":{}}';
const ps = (rows) => rows.map(([pid, ppid, args]) => `  ${pid} ${ppid} ${args}`).join("\n") + "\n";

test("a helper of a live panel is left alone", () => {
  const out = ps([
    [500, 1, "/usr/bin/node ./server.mjs"],
    [600, 500, HELPER]
  ]);
  assert.deepEqual(strandedHelpers(out), []);
});

test("a helper whose panel is gone is swept", () => {
  const out = ps([
    [500, 1, "/usr/bin/node ./server.mjs"],
    [600, 500, HELPER],
    [700, 1, HELPER],
    [701, 1, HELPER]
  ]);
  assert.deepEqual(strandedHelpers(out), [700, 701]);
});

test("a neighbour's dev panel keeps its own helpers", () => {
  const out = ps([
    [500, 1, "/usr/bin/node ./server.mjs"],
    [800, 1, "/usr/bin/node /Users/joao/wt/hive/app/server.mjs"],
    [810, 800, HELPER],
    [820, 1, HELPER]
  ]);
  assert.deepEqual(strandedHelpers(out), [820]);
});

test("the claude of a seat is never swept, orphan or not", () => {
  const out = ps([
    [900, 1, "claude --model haiku --dangerously-skip-permissions"],
    [901, 1, "claude --model opus"],
    [902, 1, "tmux attach -t hive"]
  ]);
  assert.deepEqual(strandedHelpers(out), []);
});

test("a helper reparented to a panel that only looks like one is still swept", () => {
  const out = ps([
    [500, 1, "/usr/bin/node ./server.mjs"],
    [600, 499, HELPER]
  ]);
  assert.deepEqual(strandedHelpers(out), [600]);
});

const { execFile, spawn } = await import("node:child_process");
const psNow = () => new Promise((resolve) => execFile("ps", ["-eo", "pid=,ppid=,args="], { maxBuffer: 32 << 20 }, (err, stdout) => resolve(stdout || "")));
const stateOf = (pid) => new Promise((resolve) => execFile("ps", ["-o", "stat=", "-p", String(pid)], (err, stdout) => resolve(String(stdout || "").trim())));
const running = async (pid) => {
  const state = await stateOf(pid);
  return !!state && !state.startsWith("Z");
};

test("the real ps of this machine parses, and the mark is found in it", { skip: process.platform === "win32" }, async () => {
  const child = spawn("/bin/sh", ["-c", "sleep 20; :", "--strict-mcp-config"], { detached: true });
  try {
    assert.ok(strandedHelpers(await psNow()).includes(child.pid), "the mark of a helper was not found in real ps output");
  } finally {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  }
});

test("a helper of its own group takes its children down with it", { skip: process.platform === "win32" }, async () => {
  const child = spawn("/bin/sh", ["-c", "sleep 20; :", "--strict-mcp-config"], { detached: true });
  const grandchild = await new Promise((resolve) => {
    const look = async (left) => {
      const row = (await psNow()).split("\n").find((l) => new RegExp(`^\\s*(\\d+)\\s+${child.pid}\\s`).test(l));
      if (row) return resolve(Number(/^\s*(\d+)/.exec(row)[1]));
      if (left <= 0) return resolve(0);
      setTimeout(() => look(left - 1), 100);
    };
    look(20);
  });
  assert.ok(grandchild, "the sleep of the helper never appeared");
  process.kill(-child.pid, "SIGKILL");
  for (let left = 30; left > 0 && (await running(grandchild)); left--) await new Promise((r) => setTimeout(r, 100));
  assert.equal(await running(grandchild), false, "the group kill left the child of the helper behind");
});

test("every model the panel starts is owned, swept on the way out and swept on the way in", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const namer = await readFile(new URL("../lib/naming.mjs", import.meta.url), "utf8");
  assert.equal([...namer.matchAll(/--strict-mcp-config/g)].length, 1, "the claude namer runs with no mcp servers");
  const calls = [...source.matchAll(/namerCommand\(/g)];
  assert.equal(calls.length, 1, `the only helper left is the one that names a seat at spawn — found ${calls.length}`);
  for (const call of calls) {
    const rest = source.slice(call.index, call.index + 400);
    assert.match(rest, /own: true/, `a model is started without own: true near "${rest.slice(0, 60)}"`);
  }
  assert.match(source, /process\.on\("exit", killOwnHelpers\)/);
  assert.match(source, /sweepStrandedHelpers\(\)/);
});

test("lines that are not processes are ignored", () => {
  assert.deepEqual(strandedHelpers(""), []);
  assert.deepEqual(strandedHelpers(null), []);
  assert.deepEqual(strandedHelpers("PID PPID ARGS\n\n  not a row\n"), []);
});

test("a server nobody owns any more is swept, and one a shell still holds is not", () => {
  const ps = [
    "  501     1 /usr/bin/node /Applications/Hive.app/Contents/Resources/server/server.mjs",
    "  777     1 /usr/bin/node /Applications/Hive.app/Contents/Resources/server/server.mjs",
    "  888  4242 /usr/bin/node /repo/dev-workspaces/server/server.mjs",
    "  999     1 /usr/bin/node /Applications/Hive.app/Contents/Resources/app/server.mjs"
  ].join("\n");

  assert.deepEqual(strandedServers(ps), [501, 777], "either a live one was taken or an orphan was left behind");
});

test("the app's own panel is never mistaken for a server this machine no longer runs", () => {
  const ps = "  999     1 /usr/bin/node /Applications/Hive.app/Contents/Resources/app/server.mjs";
  assert.deepEqual(strandedServers(ps), []);
});

test("nothing in, nothing swept", () => {
  assert.deepEqual(strandedServers(""), []);
  assert.deepEqual(strandedServers(null), []);
});

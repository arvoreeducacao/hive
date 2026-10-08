import { test } from "node:test";
import assert from "node:assert/strict";
import { commandOf, headOf, isMachinery, leftoversOf, parseRows, reap, reapSeat, readTable, seatsWithADriver, strays, tagOf } from "../engine/leftovers.mjs";

const MAC_TABLE = [
  "  501 01-02:03:04 0:00.10 /usr/bin/node /hive/server/engine/driver.mjs --name alpha --cwd /repo HIVE_SEAT=alpha HIVE_SIDE=local PATH=/usr/bin",
  "  502    02:03:04 9:24.00 node tests/browser-navigate.test.mjs HOME=/Users/dev HIVE_SEAT=alpha HIVE_STATE_DIR=/Users/dev/.hive",
  "  503       10:00 0:01.00 next dev --port=3000 HIVE_SEAT=beta HOME=/Users/dev",
  "  504       00:05 0:00.01 node /hive/node_modules/.bin/mysql-mcp HIVE_SEAT=alpha",
  "  505    00:00:01 0:00.00 /bin/zsh -c echo HIVE_SEAT=impostor NOT_THE_TAG=1 TERM=xterm",
  "  600  12:00:00 0:00.02 /Applications/Slack.app/Contents/MacOS/Slack HOME=/Users/dev"
].join("\n");

test("the tag is read off the environment, on a space or a NUL boundary, never off the command", () => {
  assert.equal(tagOf("HOME=/x HIVE_SEAT=alpha PATH=/y"), "alpha");
  assert.equal(tagOf("HOME=/x\0HIVE_SEAT=beta\0PATH=/y"), "beta");
  assert.equal(tagOf("NOT_HIVE_SEAT=gamma"), "");
  assert.equal(tagOf(""), "");
});

test("the command stops where the environment starts, and a flag with an equals sign is still the command", () => {
  assert.equal(commandOf("next dev --port=3000 HIVE_SEAT=beta HOME=/Users/dev"), "next dev --port=3000");
  assert.equal(commandOf("node a.mjs"), "node a.mjs");
  assert.equal(commandOf("FOO=1 node a.mjs"), "FOO=1 node a.mjs");
});

test("a mac table turns into rows with pid, age, cpu, command and the seat that started them", () => {
  const rows = parseRows(MAC_TABLE);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[1], { pid: 502, etime: "02:03:04", cpu: "9:24.00", command: "node tests/browser-navigate.test.mjs", seat: "alpha", hive: "/Users/dev/.hive" });
  assert.equal(rows[2].seat, "beta");
  assert.equal(rows[4].seat, "impostor", "the tag inside a shell's own argument still counts: the shell was born of that seat");
  assert.equal(rows[5].seat, "");
});

test("the leftovers of a seat are the rows that carry its name, minus this process, with the seat's own machinery flagged", () => {
  const rows = leftoversOf("alpha", parseRows(MAC_TABLE), { self: 504 });
  assert.deepEqual(rows.map((row) => row.pid), [501, 502]);
  assert.equal(rows[0].machinery, true, "the driver is machinery");
  assert.equal(rows[1].machinery, false, "a test the chat launched is what the person has to see");
  assert.deepEqual(leftoversOf("", parseRows(MAC_TABLE)), []);
});

test("machinery is the driver, the agent binary and the mcp servers; a dev server or a test is not", () => {
  assert.equal(isMachinery("/usr/bin/node /hive/server/engine/codex-driver.mjs --agent codex"), true);
  assert.equal(isMachinery("/Applications/Hive.app/Contents/Resources/server/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude --output-format stream-json"), true);
  assert.equal(isMachinery("node /Users/dev/.claude/plugins/cache/acme/claude-memory/0.1.0/scripts/mcp-server.mjs"), true);
  assert.equal(isMachinery("node --test tests/codex-limits.test.mjs tests/npx-runner.test.mjs tests/mcp-server.test.mjs"), false, "a test suite is not machinery because of the files it names");
  assert.equal(isMachinery("codex app-server --listen"), true);
  assert.equal(isMachinery("/opt/homebrew/bin/npx -y @scope/some-mcp"), true);
  assert.equal(isMachinery("npm exec some-mcp"), true);
  assert.equal(headOf("node --experimental-strip-types /x/engine/driver.mjs --name a"), "node /x/engine/driver.mjs");
  assert.equal(isMachinery("npm exec mysql-mcp"), true);
  assert.equal(isMachinery("next dev --port=3000"), false);
  assert.equal(isMachinery("node tests/browser-navigate.test.mjs"), false);
  assert.equal(isMachinery("python3 -m http.server 8000"), false);
});

test("strays are the rows whose seat has neither a window nor a driver running", () => {
  const withDriver = strays(parseRows(MAC_TABLE), ["beta"], { self: 1 });
  assert.deepEqual(withDriver.map((row) => row.pid), [505], "alpha's driver is up, so alpha is alive whatever the windows say");
  const driverGone = strays(parseRows(MAC_TABLE).filter((row) => row.pid !== 501), ["beta"], { self: 1 });
  assert.deepEqual(driverGone.map((row) => row.pid), [502, 504, 505]);
});

test("reap asks politely first, waits the grace, and only then forces the ones that stayed", async () => {
  const signals = [];
  const stubborn = new Set([502]);
  const dead = new Set();
  let clock = 0;
  const kill = (pid, signal) => {
    if (signal === 0) { if (dead.has(pid)) { const wrong = new Error("gone"); wrong.code = "ESRCH"; throw wrong; } return true; }
    signals.push([pid, signal]);
    if (signal === "SIGKILL" || !stubborn.has(pid)) dead.add(pid);
    return true;
  };
  const said = await reap([501, 502, 502, "x", 1], { kill, grace: 1000, sleep: async () => { clock += 400; }, now: () => clock });
  assert.deepEqual(said.asked, [501, 502]);
  assert.deepEqual(said.forced, [502]);
  assert.deepEqual(signals, [[501, "SIGTERM"], [502, "SIGTERM"], [502, "SIGKILL"]]);
});

test("on linux the environment comes from /proc, on a mac from ps -E, and on windows nothing is read", async () => {
  const calls = [];
  const linux = await readTable({
    platform: "linux",
    run: async (cmd, args) => { calls.push([cmd, args]); return { ok: true, out: "  77 01:00 0:02.00 node serve.mjs\n" }; },
    environ: (pid) => (pid === 77 ? "HOME=/h\0HIVE_SEAT=gamma\0HIVE_STATE_DIR=/h/.hive\0" : "")
  });
  assert.deepEqual(linux, [{ pid: 77, etime: "01:00", cpu: "0:02.00", command: "node serve.mjs", seat: "gamma", hive: "/h/.hive" }]);
  assert.deepEqual(calls[0], ["ps", ["-ww", "-eo", "pid=,etime=,time=,args="]]);
  const mac = await readTable({ platform: "darwin", run: async (cmd, args) => { calls.push([cmd, args]); return { ok: true, out: MAC_TABLE }; } });
  assert.equal(mac.length, 6);
  assert.deepEqual(calls[1], ["ps", ["-Eww", "-axo", "pid=,etime=,time=,command="]]);
  assert.deepEqual(await readTable({ platform: "win32", run: async () => { throw new Error("must not run"); } }), []);
});

test("a chat whose driver is still running is alive whatever the tmux window is called, so a rename never turns its children into strays", () => {
  const rows = [
    { pid: 10, etime: "01:00", cpu: "0:01.00", command: "node /x/server/engine/driver.mjs --name alpha --cwd /w --model opus", seat: "" },
    { pid: 11, etime: "01:00", cpu: "0:01.00", command: "node dev-server", seat: "alpha" },
    { pid: 20, etime: "02:00", cpu: "0:02.00", command: "node /x/server/engine/codex-driver.mjs --agent codex --name beta", seat: "beta" },
    { pid: 21, etime: "02:00", cpu: "0:02.00", command: "node tests/x.test.mjs", seat: "beta" },
    { pid: 30, etime: "03:00", cpu: "0:03.00", command: "node tests/y.test.mjs", seat: "gone" }
  ];
  assert.deepEqual([...seatsWithADriver(rows)], ["alpha", "beta"]);
  assert.deepEqual(strays(rows, ["renamed-window"], { self: 1 }).map((row) => row.pid), [30]);
});

const TWO_HIVES = [
  "  701 01:00 0:00.10 node tests/a.test.mjs HIVE_SEAT=asker HIVE_STATE_DIR=/Users/dev/.hive",
  "  702 01:00 0:00.10 node tests/b.test.mjs HIVE_SEAT=asker HIVE_STATE_DIR=/tmp/trial/.hive",
  "  703 01:00 0:00.10 node /x/server/engine/driver.mjs --name first-flight HIVE_SEAT=first-flight HIVE_STATE_DIR=/tmp/trial/.hive",
  "  704 01:00 0:00.10 node dev-server HIVE_SEAT=first-flight HIVE_STATE_DIR=/Users/dev/.hive"
].join("\n");

test("a second hive on the same machine never sees the first one's chats as its own strays", () => {
  const rows = parseRows(TWO_HIVES);
  assert.deepEqual(strays(rows, [], { self: 1, hive: "/tmp/trial/.hive" }).map((row) => row.pid), [702]);
  assert.deepEqual(strays(rows, [], { self: 1, hive: "/Users/dev/.hive/" }).map((row) => row.pid), [701, 704], "a driver of the other hive keeps none of this one's chats alive");
});

test("closing a chat stops only the processes of that chat in this hive, not a chat of the same name in another one", async () => {
  const killed = [];
  const kill = (pid, signal) => {
    if (signal === 0) { const gone = new Error("gone"); gone.code = "ESRCH"; throw gone; }
    killed.push(pid);
    return true;
  };
  const run = async () => ({ ok: true, out: TWO_HIVES });
  const said = await reapSeat("first-flight", { platform: "darwin", run, kill, self: 1, hive: "/tmp/trial/.hive" });
  assert.deepEqual(said.asked, [703]);
  assert.deepEqual(killed, [703]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
  createTerminals, dropViewArgv, hexOf, hushArgv, isSeatName, paintArgv, readFrame, resizeArgv, sizeAsked,
  streamArgv, typeArgv, viewArgv, windowTarget, INPUT_CEILING
} from "../terminal.mjs";

const haveTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;

test("the window is named the way tmux names one", () => {
  assert.equal(windowTarget("hive-abc", "a-seat"), "hive-abc:a-seat");
});

test("only a seat name reaches tmux, and nothing else does", () => {
  assert.equal(isSeatName("front-end"), true);
  assert.equal(isSeatName("a seat"), false);
  assert.equal(isSeatName("../../etc"), false);
  assert.equal(isSeatName(""), false);
  assert.throws(() => windowTarget("s", 'x"; rm -rf /; echo "'), /not a seat name/);
  assert.throws(() => windowTarget('s"; rm -rf /', "seat"), /not a tmux session name/);
});

test("what is typed travels as hex, so no keystroke can ever become a command", () => {
  assert.deepEqual(hexOf("ls\r"), ["6c", "73", "0d"]);
  assert.deepEqual(hexOf("\x03"), ["03"], "control keys travel too");
  const args = typeArgv("s:seat", '"; rm -rf /; echo "');
  assert.deepEqual(args.slice(0, 4), ["send-keys", "-t", "s:seat", "-H"]);
  for (const one of args.slice(4)) assert.match(one, /^[0-9a-f]{2}$/, `${one} is not a byte`);
});

test("a size out of any sane range is pulled back into one", () => {
  assert.deepEqual(sizeAsked({ cols: 120, rows: 40 }), { cols: 120, rows: 40 });
  assert.deepEqual(sizeAsked({ cols: 0, rows: 0 }), { cols: 20, rows: 5 });
  assert.deepEqual(sizeAsked({ cols: 99999, rows: 99999 }), { cols: 500, rows: 200 });
  assert.deepEqual(sizeAsked({}), { cols: 200, rows: 50 });
  assert.deepEqual(sizeAsked({ cols: "nonsense", rows: null }), { cols: 200, rows: 50 });
});

test("the four things a terminal asks tmux for are the four it should", () => {
  assert.deepEqual(paintArgv("s:seat"), ["capture-pane", "-p", "-e", "-J", "-t", "s:seat"]);
  assert.deepEqual(hushArgv("s:seat"), ["pipe-pane", "-t", "s:seat"]);
  assert.deepEqual(resizeArgv("s:seat", 100, 30), ["resize-window", "-t", "s:seat", "-x", "100", "-y", "30"]);
  assert.deepEqual(streamArgv("s:seat", "/tmp/a b/out"), ["pipe-pane", "-o", "-t", "s:seat", 'cat > "/tmp/a b/out"']);
});

test("a frame is input, a resize, or nothing at all", () => {
  assert.deepEqual(readFrame(JSON.stringify({ t: "i", d: "ls\r" })), { kind: "input", text: "ls\r" });
  assert.deepEqual(readFrame(JSON.stringify({ t: "r", cols: 90, rows: 24 })), { kind: "resize", cols: 90, rows: 24 });
  assert.equal(readFrame("not json"), null);
  assert.equal(readFrame(JSON.stringify({ t: "something-else" })), null);
  assert.equal(readFrame(JSON.stringify({ t: "i", d: "x".repeat(INPUT_CEILING + 1) })), null, "a giant paste is not a keystroke");
});

test("asking for a seat that is not there says so, and leaves nothing behind", async () => {
  const made = [];
  const terminals = createTerminals({
    run: (_tool, args, _opts, done) => done(args[0] === "capture-pane" ? new Error("no such window") : null, ""),
    makeFifoDir: () => { made.push("a fifo"); return "/tmp/never"; }
  });
  const said = await terminals.open("s", "ghost", { onOutput() {}, onClose() {} });
  assert.match(said.error, /there is no seat called ghost/);
  assert.deepEqual(made, [], "a channel was opened for a seat that does not exist");
  assert.equal(terminals.count, 0);
});

test("a seat whose shell already ended is refused, so nobody types into a dead pane", async () => {
  const made = [];
  const terminals = createTerminals({
    run: (_tool, args, _opts, done) => done(null, args[0] === "display-message" ? "1\n" : ""),
    makeFifoDir: () => { made.push("a fifo"); return "/tmp/never"; }
  });
  const said = await terminals.open("s", "tty", { onOutput() {}, onClose() {} });
  assert.match(said.error, /tty has ended/);
  assert.deepEqual(made, [], "a channel was opened for a seat that already ended");
  assert.equal(terminals.count, 0);
});

test("a read-only terminal never types", async () => {
  const asked = [];
  const terminals = createTerminals({
    run: (_tool, args, _opts, done) => { asked.push(args[0]); done(null, "screen"); },
    spawn: () => ({ on: (name, fn) => name === "exit" && queueMicrotask(() => fn(0)) }),
    openStream: () => ({ on() {}, destroy() {} }),
    clean: () => {}
  });
  const { handle } = await terminals.open("s", "seat", { onOutput() {}, onClose() {}, readOnly: true });
  assert.equal(await handle.write("rm -rf /\r"), false);
  assert.equal(asked.includes("send-keys"), false, "a read-only terminal reached send-keys");
  await handle.close();
});

test("a seat that will not pipe is closed, not left half open", async () => {
  const cleaned = [];
  const terminals = createTerminals({
    run: (_tool, args, _opts, done) => done(args[0] === "pipe-pane" && args.length > 3 ? new Error("refused") : null, "screen"),
    spawn: () => ({ on: (name, fn) => name === "exit" && queueMicrotask(() => fn(0)) }),
    openStream: () => ({ on() {}, destroy() {} }),
    clean: (dir) => cleaned.push(dir)
  });
  const said = await terminals.open("s", "seat", { onOutput() {}, onClose() {} });
  assert.match(said.error, /could not follow that seat's screen/);
  assert.equal(terminals.count, 0);
  assert.equal(cleaned.length, 1, "the channel it opened was left on disk");
});

test("a viewer gets a session of its own, grouped with the seat, so two of them do not fight over the size", { skip: !haveTmux }, async () => {
  const session = `hive-test-${randomBytes(4).toString("hex")}`;
  const view = `${session}-view`;
  const seat = "a-seat";
  execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", seat, "sh"], { stdio: "ignore" });
  const terminals = createTerminals();
  try {
    const opened = await terminals.open(session, seat, { onOutput() {}, onClose() {}, cols: 90, rows: 30, view });
    assert.equal(opened.error, undefined);

    const listed = execFileSync("tmux", ["list-sessions", "-F", "#{session_name} #{session_grouped}"], { encoding: "utf8" });
    assert.match(listed, new RegExp(`${view} 1`), "the viewer's session was not grouped with the seat's");

    await opened.handle.close();
    const after = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf8" });
    assert.doesNotMatch(after, new RegExp(view), "the viewer's session outlived the terminal");
  } finally {
    for (const one of [view, session]) {
      try { execFileSync("tmux", ["kill-session", "-t", one], { stdio: "ignore" }); } catch {}
    }
  }
});

test("a view name that is not one is refused before it reaches tmux", () => {
  assert.throws(() => viewArgv("a view; rm -rf /", "s", "seat"), /not a view name/);
  assert.deepEqual(dropViewArgv("v"), ["kill-session", "-t", "v"]);
});

test("a real seat comes through: the screen is painted, what is typed arrives, and closing lets go", { skip: !haveTmux }, async () => {
  const session = `hive-test-${randomBytes(4).toString("hex")}`;
  const seat = "a-seat";
  execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", seat, "sh"], { stdio: "ignore" });
  const terminals = createTerminals();
  let closedWith = null;
  try {
    const seen = [];
    const opened = await terminals.open(session, seat, {
      onOutput: (chunk) => seen.push(chunk.toString("utf8")),
      onClose: (why) => { closedWith = why; },
      cols: 80,
      rows: 24
    });
    assert.equal(opened.error, undefined);
    assert.equal(typeof opened.painted, "string", "the screen as it stands was never painted");

    const token = `hive-${randomBytes(4).toString("hex")}`;
    assert.equal(await opened.handle.write(`echo ${token}\r`), true);

    const until = Date.now() + 8000;
    while (Date.now() < until && !seen.join("").includes(token)) await new Promise((r) => setTimeout(r, 100));
    assert.ok(seen.join("").includes(token), `what was typed never came back — saw ${JSON.stringify(seen.join("").slice(-300))}`);

    assert.deepEqual(await opened.handle.resize({ cols: 100, rows: 30 }), { cols: 100, rows: 30 });
    assert.equal(terminals.count, 1);

    await opened.handle.close();
    assert.equal(terminals.count, 0);
    assert.equal(closedWith, "");

    const still = execFileSync("tmux", ["list-panes", "-t", `${session}:${seat}`, "-F", "#{pane_pipe}"], { encoding: "utf8" }).trim();
    assert.equal(still, "0", "the pipe was left running on the pane after the terminal closed");
  } finally {
    execFileSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
  }
});

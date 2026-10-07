import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOLD_THE_SESSION, createSessions, nameFromArgs, quoteForShell, seatWindowSession, seatWindowsWanted, windowCommand } from "../sessions.mjs";

function seatThatStays(base) {
  const driver = join(base, "driver.mjs");
  writeFileSync(driver, "setInterval(() => {}, 60000);\n");
  return driver;
}

const hasTmux = (() => {
  try { execFileSync("tmux", ["-V"], { stdio: "ignore" }); return true; } catch { return false; }
})();

function isolatedTmux(t) {
  const root = existsSync("/tmp") ? "/tmp" : tmpdir();
  const dir = mkdtempSync(join(root, "hive-tmux-"));
  const socket = join(dir, `tmux-${typeof process.getuid === "function" ? process.getuid() : 0}`, "default");
  if (socket.length > 92) {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  const held = { TMUX_TMPDIR: process.env.TMUX_TMPDIR, TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE };
  process.env.TMUX_TMPDIR = dir;
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
  t.after(() => {
    try { execFileSync("tmux", ["-S", socket, "kill-server"], { stdio: "ignore" }); } catch {}
    for (const key of Object.keys(held)) {
      if (held[key] === undefined) delete process.env[key];
      else process.env[key] = held[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, socket };
}

test("a word a shell would mangle is quoted, and a plain one is left alone", () => {
  assert.equal(quoteForShell("--name"), "--name");
  assert.equal(quoteForShell("/tmp/a-b_c.1"), "/tmp/a-b_c.1");
  assert.equal(quoteForShell("opus[1m]"), "'opus[1m]'");
  assert.equal(quoteForShell("a b"), "'a b'");
  assert.equal(quoteForShell("it's"), "'it'\\''s'");
});

test("the model with brackets survives the trip through a shell", () => {
  const line = windowCommand({ node: "/n", driver: "/d.mjs", args: ["--name", "seat", "--model", "opus[1m]"], cwd: "/tmp/w" });
  assert.match(line, /--model 'opus\[1m\]'/, "zsh aborts on a glob that matches nothing, and this is exactly that");
  assert.match(line, /^cd \/tmp\/w && exec \/n \/d\.mjs /);
});

test("a seat with no working directory does not get a cd to nowhere", () => {
  assert.equal(windowCommand({ node: "/n", driver: "/d.mjs", args: ["--name", "s"] }), "exec /n /d.mjs --name s");
});

test("the window takes the seat's name, read from the arguments the driver gets", () => {
  assert.equal(nameFromArgs(["--name", "front"]), "front");
  assert.equal(nameFromArgs(["--agent", "codex", "--name", "back", "--cwd", "/tmp"]), "back");
  assert.equal(nameFromArgs(["--cwd", "/tmp"]), "");
});

test("windows are off unless a server asks for them", () => {
  assert.equal(seatWindowsWanted({}), false);
  assert.equal(seatWindowsWanted({ HIVE_SEAT_WINDOWS: "1" }), true);
  assert.equal(seatWindowsWanted({ HIVE_SEAT_WINDOWS: "true" }), true);
  assert.equal(seatWindowsWanted({ HIVE_SEAT_WINDOWS: "0" }), false);
});

test("a windowed seat is not called running just because tmux answered", async (t) => {
  if (!hasTmux) return t.skip("no tmux on this machine");
  const own = isolatedTmux(t);
  if (!own) return t.skip("a unix socket here is past what this platform binds");
  const base = mkdtempSync(join(tmpdir(), "hive-window-"));
  const session = `hive-test-${process.pid}`;
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const sessions = createSessions({ base, driver: seatThatStays(base), windows: true, windowSession: session });
  t.after(() => sessions.stop());
  assert.equal((await sessions.open({ name: "na-janela", cwd: base })).started, true);

  const windows = execFileSync("tmux", ["-S", own.socket, "list-windows", "-t", session, "-F", "#{window_name}"], { encoding: "utf8" });
  assert.match(windows, /na-janela/, "the seat got no window of its own");

  const again = await sessions.open({ name: "na-janela", cwd: base });
  assert.equal(again.started, true, "tmux exits as soon as the window exists — holding it as the running seat would lock the name forever");
  await sessions.close("na-janela");
});

test("a seat the server started itself is held as running, and a second open is refused", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "hive-bare-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const kept = [];
  const sessions = createSessions({
    base,
    driver: join(base, "driver.mjs"),
    launch: () => {
      const child = { stderr: null, on: () => {}, kill: () => {} };
      kept.push(child);
      return child;
    }
  });
  t.after(() => sessions.stop());
  assert.equal((await sessions.open({ name: "sem-janela", cwd: base })).started, true);
  const again = await sessions.open({ name: "sem-janela", cwd: base });
  assert.equal(again.error, "that session is already running");
  assert.equal(kept.length, 1, "the server started a second process for a seat it already had");
});

test("a server never borrows the tmux session of another one on the same machine", () => {
  assert.equal(seatWindowSession("/workspace/hive", {}), "hive");
  assert.equal(seatWindowSession("/home/me/.hive", {}), "hive-local");
  assert.equal(seatWindowSession("/home/me/.hive", { HIVE_TMUX_SESSION: "hive-dev" }), "hive-dev");
});

test("the first seat of a machine whose tmux server is not up yet still gets its window", async (t) => {
  if (!hasTmux) return t.skip("no tmux on this machine");
  const own = isolatedTmux(t);
  if (!own) return t.skip("a unix socket here is past what this platform binds");
  const session = `hive-cold-${process.pid}`;
  const base = mkdtempSync(join(tmpdir(), "hive-cold-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  assert.equal(existsSync(own.socket), false, "this test is only honest against a tmux that has no server yet");

  const sessions = createSessions({ base, driver: seatThatStays(base), windows: true, windowSession: session });
  t.after(() => sessions.stop());
  assert.equal((await sessions.open({ name: "primeira", cwd: base })).started, true);

  const windows = execFileSync("tmux", ["-S", own.socket, "list-windows", "-t", session, "-F", "#{window_name}"], { encoding: "utf8" });
  assert.match(windows, /primeira/,
    "the window was asked for before tmux finished booting its server, so the seat runs with nowhere to show");
  await sessions.close("primeira");
});

test("the command that holds the session open is one this platform's sleep really takes", () => {
  const said = spawnSync("sh", ["-c", `${HOLD_THE_SESSION} & held=$!; sleep 0.4; kill -0 $held 2>/dev/null && echo holding; kill $held 2>/dev/null`], { encoding: "utf8" });
  assert.match(said.stdout || "", /holding/,
    `"${HOLD_THE_SESSION}" exits at once here, so the hub window closes, the session goes with it and the tmux server leaves — bsd sleep takes a number of seconds, not the word infinity`);
});

function slowTmux(t, delay) {
  const dir = mkdtempSync(join(tmpdir(), "hive-slow-tmux-"));
  const mark = join(dir, "window-made");
  writeFileSync(join(dir, "tmux"), [
    "#!/usr/bin/env bash",
    'for one in "$@"; do',
    `  if [ "$one" = "new-window" ]; then sleep ${delay}; printf made > ${JSON.stringify(mark)}; fi`,
    "done",
    "exit 0"
  ].join("\n"));
  chmodSync(join(dir, "tmux"), 0o755);
  const held = process.env.PATH;
  process.env.PATH = `${dir}:${held}`;
  t.after(() => { process.env.PATH = held; rmSync(dir, { recursive: true, force: true }); });
  return mark;
}

test("a seat is only called started once tmux says the window is there", async (t) => {
  const mark = slowTmux(t, 0.4);
  const base = mkdtempSync(join(tmpdir(), "hive-slow-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const sessions = createSessions({ base, driver: join(base, "driver.mjs"), windows: true, windowSession: "hive-slow" });
  t.after(() => sessions.stop());

  const said = await sessions.open({ name: "devagar", cwd: base });
  assert.equal(said.started, true);
  assert.equal(existsSync(mark), true,
    "open() came back before tmux finished making the window — whatever addresses the seat by name next finds nothing there");
});

test("a tmux that refuses the window turns into an error, not a seat that is said to be up", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hive-no-tmux-"));
  writeFileSync(join(dir, "tmux"), ["#!/usr/bin/env bash", 'echo "no space left for a window" >&2', "exit 1"].join("\n"));
  chmodSync(join(dir, "tmux"), 0o755);
  const held = process.env.PATH;
  process.env.PATH = `${dir}:${held}`;
  const base = mkdtempSync(join(tmpdir(), "hive-no-window-"));
  t.after(() => { process.env.PATH = held; rmSync(dir, { recursive: true, force: true }); rmSync(base, { recursive: true, force: true }); });

  const sessions = createSessions({ base, driver: join(base, "driver.mjs"), windows: true, windowSession: "hive-none" });
  t.after(() => sessions.stop());

  const said = await sessions.open({ name: "sem-janela", cwd: base });
  assert.equal(said.started, undefined, "the seat was reported as started with no window behind it");
  assert.match(said.error, /got no window/);
  assert.match(said.error, /no space left for a window/, "the reason tmux gave was thrown away");
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ENDED_ON_ITS_OWN, bringsBack, createSeats, kindOf, mergeCheckpoint, readNames, sessionAfterBind, whyItDied } from "../seats.mjs";

test("a window is read by its name alone, so no separator can smuggle a field into another", () => {
  assert.deepEqual(readNames("hub\norca\n\n  lua  \n"), ["orca", "lua"]);
  assert.deepEqual(readNames(""), []);
  assert.deepEqual(readNames("a\tb"), ["a\tb"],
    "a name is whatever tmux printed on the line — nothing here may cut one line into fields");
});

test("a seat that died says what it printed on the way out, not just that it is gone", () => {
  assert.equal(whyItDied("bash: claude: command not found\n\n"), "bash: claude: command not found");
  assert.equal(whyItDied("one\ntwo\nthree\nfour   \n"), "two · three · four");
  assert.equal(whyItDied(""), "");
});

test("what a window runs tells a shell from a chat, and only what was already structured stays structured", () => {
  assert.equal(kindOf("bash"), "shell");
  assert.equal(kindOf("zsh"), "shell");
  assert.equal(kindOf("node"), "classic");
  assert.equal(kindOf("node", "structured"), "structured");
  assert.equal(kindOf("claude"), "classic");
});

test("a seat comes back only with a transcript this server will resume, and a shell needs none", () => {
  assert.equal(bringsBack({ name: "orca", id: "9f1c2ab3", cwd: "/w" }), true);
  assert.equal(bringsBack({ name: "orca", kind: "shell" }), true);
  assert.equal(bringsBack({ name: "orca" }), false);
  assert.equal(bringsBack({ name: "orca", id: "9f1c2ab3", where: "local" }), false);
  assert.equal(bringsBack({ name: "bad name", id: "9f1c2ab3" }), false);
  assert.equal(bringsBack({ name: "orca", id: "9f1c2ab3", model: "opus; rm -rf /" }), false);
});

test("a seat on another agent comes back with the id that agent named, and a terminal on one needs none", () => {
  assert.equal(bringsBack({ name: "k", kind: "structured", agent: "kimi", id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9" }), true);
  assert.equal(bringsBack({ name: "k", kind: "structured", agent: "kimi", id: "session_$(id)" }), false);
  assert.equal(bringsBack({ name: "k", kind: "structured", agent: "kimi", id: "" }), false);
  assert.equal(bringsBack({ name: "c", kind: "structured", agent: "codex", id: "01a06474-0e8d-7543-b968-07e2f1890395" }), true);
  assert.equal(bringsBack({ name: "c", kind: "classic", agent: "codex", id: "" }), true, "a codex terminal continues its last conversation");
  assert.equal(bringsBack({ name: "c", kind: "classic", agent: "codex", model: "x; rm" }), false);
  assert.equal(bringsBack({ name: "c", kind: "classic", agent: "codex; rm", id: "" }), false);
  assert.equal(bringsBack({ name: "c", kind: "structured", agent: "claude", id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9" }), false, "claude resumes only a transcript id");
});

test("a seat whose window died before the box did survives the checkpoint, and one on another side is left alone", () => {
  const seats = mergeCheckpoint({
    live: [{ name: "orca", cwd: "/w/orca", command: "node" }],
    written: {
      seats: [
        { name: "orca", where: "cloud", kind: "structured", id: "old", model: "opus" },
        { name: "lua", where: "cloud", kind: "classic", id: "keep-me" },
        { name: "bench", where: "local", kind: "classic", id: "not-mine" }
      ]
    }.seats,
    transcriptFor: (cwd, kept) => (kept === "old" ? "" : kept)
  });
  const byName = Object.fromEntries(seats.map((one) => [one.name, one]));
  assert.equal(byName.orca.kind, "structured", "a node window the fleet already knew as structured must not fall back to classic");
  assert.equal(byName.orca.model, "opus", "the checkpoint dropped what only the fleet knew");
  assert.equal(byName.lua.id, "keep-me", "a seat whose window died before the box did was erased");
  assert.equal(byName.bench.where, "local", "the checkpoint claimed a seat that lives on another side");
});

test("the checkpoint takes a structured seat's id from the record its driver keeps, not from a claude transcript nearby", () => {
  const seats = mergeCheckpoint({
    live: [{ name: "kimi-seat", cwd: "/w", command: "node" }, { name: "tui", cwd: "/w", command: "claude" }],
    written: [{ name: "kimi-seat", where: "cloud", kind: "structured", agent: "kimi", id: "minted-by-the-app" }],
    transcriptFor: () => "9f1c2ab3-claude-transcript",
    sessionIdFor: (name) => (name === "kimi-seat" ? "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9" : "")
  });
  const byName = Object.fromEntries(seats.map((one) => [one.name, one]));
  assert.equal(byName["kimi-seat"].id, "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9");
  assert.equal(byName["kimi-seat"].agent, "kimi");
  assert.equal(byName.tui.id, "9f1c2ab3-claude-transcript", "a terminal still takes the newest transcript of its folder");
});

test("a rebind keeps what the seat is and drops what a turn was doing", () => {
  const held = { session_id: "old", title: "o áudio mudo no CRM", errand: "olhar o CRM", cwd: "/w/crm", model: "opus", model_id: "claude-opus-5", pending: true };
  assert.deepEqual(sessionAfterBind(held, "new"), {
    title: "o áudio mudo no CRM",
    errand: "olhar o CRM",
    cwd: "/w/crm",
    model: "opus",
    model_id: "claude-opus-5",
    session_id: "new"
  });
  assert.deepEqual(sessionAfterBind({}, "new"), { session_id: "new" });
  assert.deepEqual(sessionAfterBind(null, "new"), { session_id: "new" });
  assert.deepEqual(sessionAfterBind({ title: "", errand: "olhar o CRM" }, "new"), { errand: "olhar o CRM", session_id: "new" });
});

const hasTmux = !spawnSync("tmux", ["-V"], { stdio: "ignore" }).error;
const hasGit = !spawnSync("git", ["--version"], { stdio: "ignore" }).error;

function ownTmux() {
  const under = existsSync("/tmp") ? "/tmp" : tmpdir();
  const dir = mkdtempSync(join(under, "hive-tmux-"));
  const socket = join(dir, `tmux-${typeof process.getuid === "function" ? process.getuid() : 0}`, "default");
  if (socket.length > 92) return null;
  process.env.TMUX_TMPDIR = dir;
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
  return { dir, socket };
}

let root = "";
let own = null;
let session = "";
let bin = "";
let home = "";
let base = "";
let hub = "";
let workspace = "";
let seats = null;

const seen = (name) => join(root, `${name}.argv`);
const carried = (name) => join(root, `${name}.env`);

function fakeAgent(name) {
  const file = join(bin, name);
  writeFileSync(file, [
    "#!/bin/sh",
    `for one in "$@"; do printf '%s\\n' "$one"; done > ${JSON.stringify(seen(name))}`,
    `/usr/bin/env > ${JSON.stringify(carried(name))}`,
    "exec /bin/sleep 30"
  ].join("\n"));
  execFileSync("chmod", ["0755", file]);
}

function until(file, ms = 8000) {
  const stop = Date.now() + ms;
  while (!existsSync(file) && Date.now() < stop) spawnSync("sleep", ["0.1"]);
  return existsSync(file);
}

before(() => {
  if (!hasTmux) return;
  own = ownTmux();
  root = realpathSync(mkdtempSync(join(tmpdir(), "hive-seats-")));
  session = `hive-seats-${process.pid}`;
  bin = join(root, "bin");
  home = join(root, "home");
  workspace = join(root, "work space");
  base = join(workspace, "hive");
  hub = join(workspace, "repos", "hub");
  for (const dir of [bin, home, base, hub, join(workspace, "repos")]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects: {} }));
  fakeAgent("claude");
  try { symlinkSync("/bin/bash", join(bin, "bash")); } catch {}
  seats = createSeats({
    session,
    base,
    workspace,
    hub,
    home,
    env: { HOME: home, PATH: bin, HIVE_WORKSPACE: workspace },
    owner: "tester",
    settleMs: 800,
    log: () => {}
  });
});

after(() => {
  if (own) spawnSync("tmux", ["-S", own.socket, "kill-server"], { stdio: "ignore" });
  else if (session) spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
});

test("opening a chat gives it a window, and the agent is handed the flags, the folder and the first message", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "orca", cwd: hub, model: "opus", prompt: "open the door" });
  assert.ok(!opened.error, opened.error);
  assert.equal(opened.name, "orca");

  assert.ok(until(seen("claude")), "the agent never started — the shell could not read the command tmux was handed");
  const argv = readFileSync(seen("claude"), "utf8").split("\n").filter(Boolean);
  assert.deepEqual(argv, [
    "--dangerously-skip-permissions", "--add-dir", base, "--remote-control", "orca", "--model", "opus", "open the door"
  ]);

  const env = Object.fromEntries(readFileSync(carried("claude"), "utf8").split("\n")
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  assert.equal(env.HIVE_SEAT, "orca");
  assert.equal(env.HIVE_SIDE, "cloud", "a seat opened inside a box thinks it is running on somebody's desk");
  assert.equal(env.IS_SANDBOX, "1", "without this claude refuses --dangerously-skip-permissions as root");
  assert.equal(env.HIVE_STATE_DIR, base, "a state dir with a space in it did not survive the trip through tmux");
  assert.equal(env.HOME, home, "the box's home was not carried into the window");
});

test("the seat this server just opened is one it can list, look at, talk to and close", { skip: !hasTmux }, async () => {
  const listed = await seats.list();
  assert.ok(!listed.error, listed.error);
  const mine = listed.seats.find((one) => one.name === "orca");
  assert.ok(mine, "the seat this server opened is not among the ones it lists");
  assert.equal(mine.cwd, hub);

  const looked = await seats.screen("orca", { lines: 50 });
  assert.ok(!looked.error, looked.error);
  assert.equal(looked.cwd, hub);
  assert.equal(typeof looked.screen, "string");

  assert.deepEqual(await seats.type("orca", "bom dia"), { ok: true, name: "orca" });
  assert.match((await seats.type("nobody", "oi")).error, /no seat called nobody/);

  assert.deepEqual(await seats.close("orca"), { ok: true, name: "orca" });
  const after_ = await seats.list();
  assert.ok(!after_.seats.some((one) => one.name === "orca"), "the window is still there after the seat was closed");
});

test("closing a seat erases it from the fleet file, so the next boot does not bring it back", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "gaia", cwd: hub });
  assert.ok(!opened.error, opened.error);
  writeFileSync(join(base, "fleet.json"), JSON.stringify({
    seats: [
      { name: "gaia", where: "cloud", kind: "classic", id: "9f1c2ab3-0000-4000-8000-000000000000", cwd: hub },
      { name: "gaia", where: "local", kind: "classic", id: "9f1c2ab3-0000-4000-8000-000000000000", cwd: hub },
      { name: "stays", where: "cloud", kind: "classic", id: "aaaabbbb-0000-4000-8000-000000000000", cwd: hub }
    ]
  }, null, 2));
  assert.deepEqual(await seats.close("gaia"), { ok: true, name: "gaia" });
  const left = JSON.parse(readFileSync(join(base, "fleet.json"), "utf8")).seats;
  assert.ok(!left.some((one) => one.name === "gaia" && one.where === "cloud"), "the fleet file still remembers the closed seat");
  assert.ok(left.some((one) => one.name === "gaia" && one.where === "local"), "a namesake on another side was swept away");
  assert.ok(left.some((one) => one.name === "stays"), "closing one seat erased another");
  assert.deepEqual(await seats.close("gaia"), { ok: true, name: "gaia" }, "a window already gone still counts as closed");
});

test("a name this server already keeps is refused instead of quietly sharing a mailbox", { skip: !hasTmux }, async () => {
  const first = await seats.open({ name: "lua", cwd: hub });
  assert.ok(!first.error, first.error);
  const again = await seats.open({ name: "lua", cwd: hub, prompt: "this should never be written" });
  assert.match(again.error, /already a seat here/);
  assert.ok(!existsSync(join(base, "prompts", "lua.md")), "the name was checked after the first message was already on disk");
  assert.match((await seats.open({ name: "hub", cwd: hub })).error, /window this server already keeps/);
  assert.match((await seats.open({ name: "not a name", cwd: hub })).error, /not a name a seat can have/);
  assert.match((await seats.open({ name: "zed", cwd: hub, model: "opus; rm -rf /" })).error, /not a model this server will start/);
  await seats.close("lua");
});

test("an agent that is not on the box closes its window, and the seat says so instead of reporting success", { skip: !hasTmux }, async () => {
  const nowhere = createSeats({ session, base, workspace, hub, home, env: { HOME: home, PATH: join(root, "empty"), HIVE_WORKSPACE: workspace }, settleMs: 800 });
  const opened = await nowhere.open({ name: "ghost", cwd: hub });
  assert.match(opened.error, /closed the window as soon as it opened/);
  assert.match(opened.error, /claude/i, "the window's dying words were thrown away, and a blind failure is what sent someone hunting");
  assert.match(opened.error, /not found|No such file/i, "the reason the shell gave never reached the person asking for the seat");
  assert.ok(!(await seats.list()).seats.some((one) => one.name === "ghost"), "the dead window was left standing in the fleet");
});

test("a revived seat whose folder is not on this box opens in the hub, and a new seat asked for a folder that is not here is refused", { skip: !hasTmux }, async () => {
  const elsewhere = join(root, "somebody", "desk", "arvore-hub");
  const revived = await seats.open({ name: "back", cwd: elsewhere, resumeId: "9f1c2ab3-0000-4000-8000-000000000001" });
  assert.ok(!revived.error, revived.error);
  assert.equal(revived.cwd, hub, "the seat was sent to a folder the box does not have, so the agent could not even start");
  const listed = (await seats.list()).seats.find((one) => one.name === "back");
  assert.equal(listed?.cwd, hub);
  await seats.close("back");
  const fresh = await seats.open({ name: "lost", cwd: elsewhere });
  assert.match(fresh.error, /not a folder on this server/);
  assert.ok(!(await seats.list()).seats.some((one) => one.name === "lost"), "a seat that could never start was left in the fleet");
});

test("a seat asked for by repository gets a worktree cut for it", { skip: !hasTmux || !hasGit }, async () => {
  const source = join(workspace, "repos", "starter");
  mkdirSync(source, { recursive: true });
  for (const args of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) {
    execFileSync("git", ["-C", source, ...args]);
  }
  writeFileSync(join(source, "README.md"), "hello\n");
  execFileSync("git", ["-C", source, "add", "-A"]);
  execFileSync("git", ["-C", source, "commit", "-q", "-m", "first"]);

  const opened = await seats.open({ name: "cut", repo: "starter" });
  assert.ok(!opened.error, opened.error);
  assert.equal(opened.cwd, join(workspace, "worktrees", "starter", "cut"));
  assert.ok(existsSync(join(opened.cwd, "README.md")), "the worktree the seat was given has no files in it");
  const branch = execFileSync("git", ["-C", opened.cwd, "branch", "--show-current"], { encoding: "utf8" }).trim();
  assert.equal(branch, "tester/-/cut");
  await seats.close("cut");
});

test("a plain chat is bound to its transcript, and a structured seat's own record is left alone", { skip: !hasTmux }, async () => {
  const meta = join(base, "sessions", "driven.json");
  mkdirSync(join(base, "sessions"), { recursive: true });
  writeFileSync(meta, JSON.stringify({ cwd: hub, model: "opus", title: "written by the driver" }));

  const plain = await seats.open({ name: "bound", cwd: hub, sessionId: "9f1c2ab3-0000-4000-8000-000000000000" });
  assert.ok(!plain.error, plain.error);
  assert.deepEqual(JSON.parse(readFileSync(join(base, "sessions", "bound.json"), "utf8")), { session_id: "9f1c2ab3-0000-4000-8000-000000000000" });
  assert.equal(plain.replaced, "", "a name nobody used before left a transcript behind");
  await seats.close("bound");

  const again = await seats.open({ name: "bound", cwd: hub, sessionId: "aaaabbbb-0000-4000-8000-000000000000" });
  assert.equal(again.replaced, "9f1c2ab3-0000-4000-8000-000000000000",
    "reusing a name lost the transcript it took over from, and nothing can put a title on it any more");
  await seats.close("bound");

  await seats.open({ name: "driven", cwd: hub, structured: true, sessionId: "aaaabbbb-0000-4000-8000-000000000000" });
  assert.equal(JSON.parse(readFileSync(meta, "utf8")).title, "written by the driver",
    "opening a structured seat overwrote the record its own driver keeps at that path");
  await seats.close("driven");
});

test("bringing the seats back opens what the fleet remembers and says what it had to leave behind", { skip: !hasTmux }, async () => {
  const projects = join(home, ".claude", "projects");
  const kept = join(projects, join(hub).replace(/\//g, "-"));
  mkdirSync(kept, { recursive: true });
  writeFileSync(join(kept, "9f1c2ab3-0000-4000-8000-000000000000.jsonl"), "{}\n");
  writeFileSync(join(base, "fleet.json"), JSON.stringify({
    seats: [
      { name: "back", where: "cloud", kind: "classic", id: "9f1c2ab3-0000-4000-8000-000000000000", cwd: hub, model: "opus" },
      { name: "lost", where: "cloud", kind: "classic", id: "aaaabbbb-0000-4000-8000-000000000000", cwd: hub },
      { name: "bench", where: "local", kind: "classic", id: "9f1c2ab3-0000-4000-8000-000000000000", cwd: hub }
    ]
  }, null, 2));

  const said = await seats.restore();
  assert.deepEqual(said.restored, ["back"]);
  assert.deepEqual(said.skipped.map((one) => one.name), ["lost"]);
  assert.match(said.skipped[0].why, /no longer on disk/);

  assert.ok(until(seen("claude")), "the seat that came back never reached the agent");
  const argv = readFileSync(seen("claude"), "utf8").split("\n").filter(Boolean);
  assert.deepEqual(argv.slice(0, 2), ["--resume", "9f1c2ab3-0000-4000-8000-000000000000"]);
  assert.ok(argv.includes("--model") && argv.includes("opus"));

  assert.deepEqual((await seats.restore()).restored, [], "a seat already standing was opened a second time");
  await seats.close("back");
});

test("a shell that ended on its own (ctrl+d) is closed for real, and the restore does not bring it back", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "tty", kind: "shell", cwd: hub });
  assert.ok(!opened.error, opened.error);
  const fleetBefore = readFileSync(join(base, "fleet.json"), "utf8");
  writeFileSync(join(base, "fleet.json"), JSON.stringify({
    seats: [{ name: "tty", where: "cloud", kind: "shell", cwd: hub }]
  }, null, 2));
  const held = execFileSync("tmux", ["show-window-option", "-v", "-t", `${session}:tty`, "remain-on-exit"], { encoding: "utf8" }).trim();
  assert.equal(held, "on", "a shell window that vanishes on exit cannot tell the server it ended");

  execFileSync("tmux", ["send-keys", "-t", `${session}:tty`, "exit", "Enter"], { stdio: "ignore" });
  const stop = Date.now() + 8000;
  let listed = await seats.list();
  while (Date.now() < stop && listed.seats.some((one) => one.name === "tty")) {
    spawnSync("sleep", ["0.2"]);
    listed = await seats.list();
  }
  assert.ok(!listed.seats.some((one) => one.name === "tty"), "the ended shell is still listed as a seat");
  assert.ok(listed.ended.includes("tty"), "the list does not say which seat ended on its own");
  const windows = execFileSync("tmux", ["list-windows", "-t", session, "-F", "#W"], { encoding: "utf8" });
  assert.ok(!windows.split("\n").includes("tty"), "the dead window was left in tmux");
  const left = JSON.parse(readFileSync(join(base, "fleet.json"), "utf8")).seats;
  assert.ok(!left.some((one) => one.name === "tty"), "the fleet file still remembers the ended shell");

  const back = await seats.restore([{ name: "tty", where: "cloud", kind: "shell", cwd: hub }]);
  assert.deepEqual(back.restored, []);
  assert.deepEqual(back.skipped, [{ name: "tty", why: ENDED_ON_ITS_OWN }]);

  const again = await seats.open({ name: "tty", kind: "shell", cwd: hub });
  assert.ok(!again.error, again.error);
  assert.ok(!(await seats.list()).ended.includes("tty"), "a shell opened anew under the same name still counts as ended");
  await seats.close("tty");
  writeFileSync(join(base, "fleet.json"), fleetBefore);
});

test("the checkpoint writes down what is live without erasing what only the fleet knew", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "kept", cwd: hub });
  assert.ok(!opened.error, opened.error);
  const wrote = await seats.checkpoint();
  assert.ok(!wrote.error, wrote.error);

  const written = JSON.parse(readFileSync(join(base, "fleet.json"), "utf8")).seats;
  const byName = Object.fromEntries(written.map((one) => [one.name, one]));
  assert.equal(byName.kept.cwd, hub);
  assert.equal(byName.kept.where, "cloud");
  assert.ok(byName.lost, "the checkpoint erased a seat whose window had already died");
  assert.equal(byName.bench.where, "local", "the checkpoint moved a seat that lives on another side");
  await seats.close("kept");
});

test("a command aimed at a seat that is gone never lands on the one named after it", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "conserta-o-login-2", cwd: hub });
  assert.ok(!opened.error, opened.error);

  assert.deepEqual(await seats.close("conserta-o-login"), { ok: true, name: "conserta-o-login" });
  assert.ok((await seats.list()).seats.some((one) => one.name === "conserta-o-login-2"),
    "closing a name nothing answers to killed the seat born from the same first words");

  assert.match((await seats.type("conserta-o-login", "oi")).error, /no seat called/);
  assert.ok((await seats.screen("conserta-o-login")).error, "the screen of a seat that is gone came back from its neighbour");
  await seats.close("conserta-o-login-2");
});

test("two windows under one name are still a seat that can be taken off the screen", { skip: !hasTmux }, async () => {
  const opened = await seats.open({ name: "gemea", cwd: hub });
  assert.ok(!opened.error, opened.error);
  execFileSync("tmux", ["new-window", "-d", "-t", `${session}:`, "-n", "gemea", "sleep 30"], { stdio: "ignore" });
  assert.equal(execFileSync("tmux", ["list-windows", "-t", session, "-F", "#W"], { encoding: "utf8" })
    .split("\n").filter((one) => one.trim() === "gemea").length, 2, "the second window was not opened");

  assert.deepEqual(await seats.close("gemea"), { ok: true, name: "gemea" });
  assert.ok(!execFileSync("tmux", ["list-windows", "-t", session, "-F", "#W"], { encoding: "utf8" })
    .split("\n").some((one) => one.trim() === "gemea"), "a name tmux calls ambiguous left a window nobody can close");
});

test("a server that cannot read its own windows opens none, so no name is taken twice", async () => {
  const ran = [];
  const blind = createSeats({
    session: "hive-blind",
    base, workspace, hub, home,
    env: { HOME: home, PATH: bin },
    log: () => {},
    run: (cmd, args, opts, done) => {
      ran.push(args[0]);
      if (args[0] === "list-windows") return done(new Error("lost connection to server"), "", "lost connection to server");
      done(null, "", "");
    }
  });
  const back = await blind.restore([{ name: "orca", where: "cloud", kind: "shell", cwd: hub }]);
  assert.deepEqual(back.restored, []);
  assert.match(back.skipped[0].why, /could not read which seats it already runs/);
  assert.match((await blind.open({ name: "orca", cwd: hub })).error, /cannot read which seats it already runs/);
  assert.ok(!ran.includes("new-window"), "a window was opened while the list of windows could not be read");
});

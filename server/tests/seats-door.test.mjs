import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker } from "../server.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";

const hasTmux = !spawnSync("tmux", ["-V"], { stdio: "ignore" }).error;
const idle = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["pipe", "pipe", "pipe"] });

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
let base = "";
let hub = "";
let broker = null;
let url = "";
let mac = null;
let peer = null;

const argvFile = () => join(root, "claude.argv");

async function paired(kind, name) {
  const code = broker.roster.open({ kind }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true, "pairing did not take");
  return createBrokerClient({ url, identity: me, audience: broker.identity.fingerprint });
}

before(async () => {
  if (!hasTmux) return;
  own = ownTmux();
  root = realpathSync(mkdtempSync(join(tmpdir(), "hive-door-")));
  session = `hive-door-${process.pid}`;
  const workspace = join(root, "workspace");
  base = join(workspace, "hive");
  hub = join(workspace, "repos", "hub");
  const bin = join(root, "bin");
  const home = join(root, "home");
  for (const dir of [base, hub, bin, home]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects: {} }));

  const fake = join(bin, "claude");
  writeFileSync(fake, [
    "#!/bin/sh",
    `for one in "$@"; do printf '%s\\n' "$one"; done > ${JSON.stringify(argvFile())}`,
    "exec /bin/sleep 30"
  ].join("\n"));
  execFileSync("chmod", ["0755", fake]);

  process.env.HIVE_TMUX_SESSION = session;
  process.env.HIVE_WORKSPACE = workspace;
  process.env.HIVE_HUB = hub;
  process.env.HOME = home;
  process.env.PATH = `${bin}:${process.env.PATH}`;

  const probe = createBroker({ home: join(root, "broker"), stateDir: base, name: "box", launch: idle });
  await new Promise((d) => probe.http.listen(0, "127.0.0.1", d));
  const port = probe.http.address().port;
  probe.http.close();
  probe.sessions.stop();
  url = `http://127.0.0.1:${port}`;

  broker = createBroker({ home: join(root, "broker"), stateDir: base, name: "box", publicUrl: url, launch: idle });
  await new Promise((d) => broker.http.listen(port, "127.0.0.1", d));

  mac = await paired("mac", "the desk");
  peer = await paired("peer", "someone else");
});

after(() => {
  if (broker) { broker.http.close(); broker.sessions.stop(); }
  if (own) spawnSync("tmux", ["-S", own.socket, "kill-server"], { stdio: "ignore" });
  else if (session) spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
});

function until(file, ms = 8000) {
  const stop = Date.now() + ms;
  while (!existsSync(file) && Date.now() < stop) spawnSync("sleep", ["0.1"]);
  return existsSync(file);
}

test("the door opens a seat, lists it, paints it, types into it and closes it", { skip: !hasTmux }, async () => {
  const opened = await mac.post("/api/seats", { name: "orca", cwd: hub, model: "opus", prompt: "bom dia" });
  assert.ok(opened.ok, opened.error);
  assert.equal(opened.body.name, "orca");
  assert.equal(opened.body.cwd, hub);

  assert.ok(until(argvFile()), "the agent never started behind the door");
  const argv = readFileSync(argvFile(), "utf8").split("\n").filter(Boolean);
  assert.deepEqual(argv, ["--dangerously-skip-permissions", "--add-dir", base, "--remote-control", "orca", "--model", "opus", "bom dia"]);

  const listed = await mac.get("/api/seats");
  assert.ok(listed.ok, listed.error);
  assert.deepEqual(listed.body.seats.map((one) => one.name), ["orca"]);

  const looked = await mac.get("/api/seats/orca/screen?lines=40");
  assert.ok(looked.ok, looked.error);
  assert.equal(looked.body.cwd, hub);
  assert.equal(typeof looked.body.screen, "string");

  const typed = await mac.post("/api/seats/orca/type", { text: "oi", submit: true });
  assert.ok(typed.ok, typed.error);

  const wall = await mac.get("/api/seats/wall");
  assert.ok(wall.ok, wall.error);
  assert.equal(wall.body.seats.orca.mission, "bom dia", "the wall does not carry the first message the seat was opened with");
  assert.equal(typeof wall.body.seats.orca.screen, "string");

  const closed = await mac.del("/api/seats/orca");
  assert.ok(closed.ok, closed.error);
  assert.deepEqual((await mac.get("/api/seats")).body.seats, []);
});

test("what the door refuses it refuses with a reason, and a seat name it cannot address never reaches tmux", { skip: !hasTmux }, async () => {
  const bad = await mac.post("/api/seats", { name: "not a name" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /not a name a seat can have/);

  const nowhere = await mac.get("/api/seats/orca/screen");
  assert.equal(nowhere.status, 404);

  const stranger = await mac.get("/api/seats/nope/nothing");
  assert.equal(stranger.status, 404);
  assert.match(stranger.body.error, /no such route/);
});

test("a server that came in by invite does not open, close or type on this box's seats", { skip: !hasTmux }, async () => {
  for (const said of [
    await peer.post("/api/seats", { name: "theirs", cwd: hub }),
    await peer.get("/api/seats"),
    await peer.post("/api/seats/orca/type", { text: "oi" })
  ]) {
    assert.equal(said.status, 403, `a peer got through: ${JSON.stringify(said.body)}`);
    assert.match(said.body.error, /invite/);
  }
});

test("the box brings its seats back over the door, and writes down what is standing", { skip: !hasTmux }, async () => {
  const projects = join(process.env.HOME, ".claude", "projects");
  const kept = join(projects, hub.replace(/\//g, "-"));
  mkdirSync(kept, { recursive: true });
  const id = "9f1c2ab3-0000-4000-8000-000000000000";
  writeFileSync(join(kept, `${id}.jsonl`), "{}\n");

  const back = await mac.post("/api/seats/restore", {
    seats: [{ name: "again", where: "cloud", kind: "classic", id, cwd: hub }]
  });
  assert.ok(back.ok, back.error);
  assert.deepEqual(back.body.restored, ["again"]);

  const wrote = await mac.post("/api/seats/checkpoint", {});
  assert.ok(wrote.ok, wrote.error);
  const written = JSON.parse(readFileSync(join(base, "fleet.json"), "utf8")).seats;
  assert.deepEqual(written.map((one) => one.name), ["again"]);
  assert.equal(written[0].cwd, hub);

  await mac.del("/api/seats/again");
});

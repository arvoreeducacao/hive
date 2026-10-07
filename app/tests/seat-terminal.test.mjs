import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bridgeTerminal, paintedForTerminal, resizeAsked, RESIZE_MARK } from "../lib/seat-terminal.mjs";
import { createBroker } from "../../server/server.mjs";
import { createBrokerClient } from "../../server/client.mjs";
import { newIdentity } from "../../server/identity.mjs";
import { seatWindowSession } from "../../server/sessions.mjs";

const haveTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeSeatSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; this.closed = false; }
  send(what) { this.sent.push(what); }
  close() { this.closed = true; this.readyState = 3; this.emit("close"); }
  said() { return this.sent.join(""); }
}

test("the screen as it stands is painted with the line endings a terminal wants", () => {
  assert.equal(paintedForTerminal("one\ntwo"), "one\r\ntwo\r\n");
  assert.equal(paintedForTerminal("already\r\nright"), "already\r\nright\r\n");
  assert.equal(paintedForTerminal(""), "\r\n");
});

test("a resize is the only thing the mark carries, and nonsense is not a resize", () => {
  assert.deepEqual(resizeAsked(`${RESIZE_MARK}{"c":90,"r":30}`), { cols: 90, rows: 30 });
  assert.equal(resizeAsked(`${RESIZE_MARK}not json`), null);
  assert.equal(resizeAsked(`${RESIZE_MARK}{"c":0,"r":0}`), null);
  assert.equal(resizeAsked("ls\r"), null);
});

test("a server that will not open is said out loud, not swallowed", () => {
  const seat = new FakeSeatSocket();
  const live = bridgeTerminal(seat, "wss://nowhere", { open: () => { throw new Error("no route"); } });
  assert.equal(live, null);
  assert.match(seat.said(), /could not reach the server: no route/);
  assert.equal(seat.closed, true);
});

test("what the person types goes out as input, and a resize goes out as a resize", () => {
  const seat = new FakeSeatSocket();
  const server = new EventEmitter();
  server.readyState = 1;
  server.sent = [];
  server.send = (what) => server.sent.push(what);
  server.close = () => {};

  bridgeTerminal(seat, "wss://somewhere", { open: () => server });
  seat.emit("message", Buffer.from("ls\r"));
  seat.emit("message", Buffer.from(`${RESIZE_MARK}{"c":100,"r":40}`));

  assert.deepEqual(server.sent.map((one) => JSON.parse(one)), [
    { t: "i", d: "ls\r" },
    { t: "r", cols: 100, rows: 40 }
  ]);
});

test("bytes from the server reach the terminal, and the end says why", () => {
  const seat = new FakeSeatSocket();
  const server = new EventEmitter();
  server.readyState = 1;
  server.send = () => {};
  server.close = () => {};

  bridgeTerminal(seat, "wss://somewhere", { open: () => server });
  server.emit("message", Buffer.from("hello from the pane"), true);
  server.emit("message", Buffer.from(JSON.stringify({ t: "open", painted: "the screen" })), false);
  assert.match(seat.said(), /hello from the pane/);
  assert.match(seat.said(), /the screen\r\n/);

  server.emit("message", Buffer.from(JSON.stringify({ t: "end", why: "there is no seat called ghost" })), false);
  assert.match(seat.said(), /there is no seat called ghost/);
  assert.equal(seat.closed, true);
});

let home;
let workspace;
let broker;
let url;
let owner;
let session;

before(async () => {
  workspace = mkdtempSync(join(tmpdir(), "hive-bridge-space-"));
  for (const one of ["repos", "worktrees", "hive", "home"]) mkdirSync(join(workspace, one), { recursive: true });
  process.env.HIVE_WORKSPACE = workspace;
  session = `hive-bridge-${randomBytes(4).toString("hex")}`;
  process.env.HIVE_TMUX_SESSION = session;

  home = mkdtempSync(join(tmpdir(), "hive-bridge-"));
  broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;

  const { fingerprint: audience } = await (await fetch(`${url}/api/broker`)).json();
  const code = broker.roster.open({ kind: "mac" }).code;
  const me = newIdentity("a mac");
  await fetch(`${url}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name: "a mac" })
  });
  owner = createBrokerClient({ url, identity: me, audience });
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
  delete process.env.HIVE_WORKSPACE;
  delete process.env.HIVE_TMUX_SESSION;
});

test("the whole way: the app's terminal reaches a real seat on a real server and types into it", { skip: !haveTmux }, async () => {
  assert.equal(seatWindowSession(broker.stateDir), session, "the test would have used the tmux session of a real hive");
  const seatName = "a-seat";
  execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", seatName, "sh"], { stdio: "ignore" });
  try {
    const seat = new FakeSeatSocket();
    bridgeTerminal(seat, owner.terminalUrl({ seat: seatName, cols: 90, rows: 30 }));

    const token = `hive-${randomBytes(4).toString("hex")}`;
    const opened = Date.now() + 6000;
    while (Date.now() < opened && !seat.said()) await wait(80);
    assert.ok(seat.said(), "the painted screen never arrived at the terminal");

    seat.emit("message", Buffer.from(`echo ${token}\r`));

    const answered = Date.now() + 8000;
    while (Date.now() < answered && !seat.said().includes(token)) await wait(100);
    assert.ok(seat.said().includes(token), `what was typed never came back — saw ${JSON.stringify(seat.said().slice(-200))}`);

    seat.close();
    await wait(800);
    const piping = execFileSync("tmux", ["list-panes", "-t", `${session}:${seatName}`, "-F", "#{pane_pipe}"], { encoding: "utf8" }).trim();
    assert.equal(piping, "0", "closing the tile left the server still piping the pane");
  } finally {
    try { execFileSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" }); } catch {}
  }
});

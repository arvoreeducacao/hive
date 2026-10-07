import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker } from "../server.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { seatWindowSession } from "../sessions.mjs";

const haveTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let home;
let workspace;
let broker;
let url;
let owner;
let session;

before(async () => {
  workspace = mkdtempSync(join(tmpdir(), "hive-reach-space-"));
  for (const one of ["repos", "worktrees", "hive", "home"]) mkdirSync(join(workspace, one), { recursive: true });
  process.env.HIVE_WORKSPACE = workspace;
  session = `hive-reach-${randomBytes(4).toString("hex")}`;
  process.env.HIVE_TMUX_SESSION = session;

  home = mkdtempSync(join(tmpdir(), "hive-reach-"));
  broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;

  owner = await pair("mac", "a mac");
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
  delete process.env.HIVE_WORKSPACE;
  delete process.env.HIVE_TMUX_SESSION;
});

async function pair(kind, name) {
  const { fingerprint: audience } = await (await fetch(`${url}/api/broker`)).json();
  const code = broker.roster.open({ kind }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true);
  return { me, client: createBrokerClient({ url, identity: me, audience }), audience };
}

test("a file written over the wire lands on disk, and comes back byte for byte", async () => {
  const at = join(workspace, "repos", "a-repo", "wrote.txt");
  const wrote = await owner.client.post("/api/file", { path: at, data: Buffer.from("over the wire").toString("base64") });
  assert.equal(wrote.ok, true, wrote.error);
  assert.equal(readFileSync(at, "utf8"), "over the wire");

  const read = await owner.client.get(`/api/file?path=${encodeURIComponent(at)}`);
  assert.equal(read.ok, true, read.error);
  assert.equal(Buffer.from(read.body.data, "base64").toString(), "over the wire");
});

test("a file outside the workspace is refused over the wire too", async () => {
  const outside = join(tmpdir(), `hive-not-yours-${randomBytes(3).toString("hex")}.txt`);
  const wrote = await owner.client.post("/api/file", { path: outside, data: Buffer.from("no").toString("base64") });
  assert.equal(wrote.ok, false);
  assert.equal(wrote.status, 403);

  writeFileSync(outside, "still not yours");
  const read = await owner.client.get(`/api/file?path=${encodeURIComponent(outside)}`);
  assert.equal(read.ok, false);
  assert.equal(read.status, 403);
  rmSync(outside, { force: true });
});

test("an unsigned request reaches neither the files nor the terminal", async () => {
  const bare = await fetch(`${url}/api/file?path=${encodeURIComponent(join(workspace, "hive", "x"))}`);
  assert.equal(bare.status, 401);

  const refused = await new Promise((done) => {
    const live = new WebSocket(`${url.replace(/^http/, "ws")}/terminal?seat=a-seat&cols=80&rows=24`);
    live.on("open", () => done("it opened"));
    live.on("unexpected-response", (_req, res) => done(res.statusCode));
    live.on("error", () => done("error"));
  });
  assert.equal(refused, 401, "a terminal opened for a request nobody signed");
});

test("a signature for one seat is not a signature for another", async () => {
  const good = owner.client.terminalUrl({ seat: "a-seat", cols: 80, rows: 24 });
  const swapped = good.replace("seat=a-seat", "seat=another-seat");
  const said = await new Promise((done) => {
    const live = new WebSocket(swapped);
    live.on("open", () => done("it opened"));
    live.on("unexpected-response", (_req, res) => done(res.statusCode));
    live.on("error", () => done("error"));
  });
  assert.equal(said, 401, "the seat travelled outside the signature, so it could be swapped in flight");
});

test("a terminal carries the screen, takes what is typed, and lets go when the socket closes", { skip: !haveTmux }, async () => {
  const seat = "a-seat";
  assert.equal(seatWindowSession(broker.stateDir), session, "the test would have used the tmux session of a real hive");
  execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", seat, "sh"], { stdio: "ignore" });
  try {
    const live = new WebSocket(owner.client.terminalUrl({ seat, cols: 90, rows: 30 }));
    const frames = [];
    const bytes = [];
    live.on("message", (data, isBinary) => (isBinary ? bytes.push(data.toString("utf8")) : frames.push(JSON.parse(data.toString()))));

    await new Promise((done, fail) => { live.on("open", done); live.on("error", fail); });

    const until = Date.now() + 5000;
    while (Date.now() < until && !frames.some((f) => f.t === "open")) await wait(80);
    const opened = frames.find((f) => f.t === "open");
    assert.ok(opened, `the terminal never said it was open — ${JSON.stringify(frames)}`);
    assert.equal(opened.seat, seat);
    assert.equal(opened.cols, 90);
    assert.equal(typeof opened.painted, "string");

    const token = `hive-${randomBytes(4).toString("hex")}`;
    live.send(JSON.stringify({ t: "i", d: `echo ${token}\r` }));

    const answered = Date.now() + 8000;
    while (Date.now() < answered && !bytes.join("").includes(token)) await wait(100);
    assert.ok(bytes.join("").includes(token), `what was typed never came back — saw ${JSON.stringify(bytes.join("").slice(-200))}`);

    live.close();
    await wait(900);
    const piping = execFileSync("tmux", ["list-panes", "-t", `${session}:${seat}`, "-F", "#{pane_pipe}"], { encoding: "utf8" }).trim();
    assert.equal(piping, "0", "closing the socket left the pane still piping");
  } finally {
    execFileSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
  }
});

test("a seat that is not there closes the terminal with a reason instead of hanging", async () => {
  const live = new WebSocket(owner.client.terminalUrl({ seat: "no-such-seat", cols: 80, rows: 24 }));
  const said = await new Promise((done, fail) => {
    live.on("message", (data, isBinary) => { if (!isBinary) { const f = JSON.parse(data.toString()); if (f.t === "end") done(f.why); } });
    live.on("error", fail);
    setTimeout(() => done("nothing came back"), 6000);
  });
  assert.match(said, /no seat called no-such-seat|could not follow/);
});

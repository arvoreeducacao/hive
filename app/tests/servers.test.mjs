import { test, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createServers } from "../lib/servers.mjs";
import { createDesk } from "../lib/seat-desk.mjs";
import { attachSeat, commandRoute, replyLine } from "../lib/seat-link.mjs";
import { loadIdentity } from "../lib/hive-identity.mjs";
import { createSessions } from "../../server/sessions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(HERE, "../../server/engine/driver.mjs");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-app-")); junk.push(d); return d; };

after(() => { for (const d of junk) rmSync(d, { recursive: true, force: true }); });

function seatOnDisk(home, name) {
  for (const dir of ["events", "sock", "sessions"]) mkdirSync(join(home, dir), { recursive: true });
  writeFileSync(join(home, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo", title: "teste" }));
  const events = join(home, "events", `${name}.ndjson`);
  writeFileSync(events, "");
  let seq = 0;
  return (text) => {
    seq += 1;
    appendFileSync(events, JSON.stringify({ seq, type: "assistant", message: { content: [{ type: "text", text }] } }) + "\n");
  };
}

function seatSocket(home, name, heard, answer = { ok: true }) {
  const listening = createServer((live) => {
    live.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        heard.push(JSON.parse(line));
        live.write(JSON.stringify(answer) + "\n");
      }
    });
  });
  return {
    up: () => new Promise((done) => listening.listen(join(home, "sock", `${name}.sock`), done)),
    down: () => new Promise((done) => listening.close(done))
  };
}

test("the identity is born once and comes back the same", () => {
  const home = scratch();
  const first = loadIdentity(home);
  assert.match(first.publicSsh, /^ssh-ed25519 /);
  assert.match(first.fingerprint, /^SHA256:/);
  const again = loadIdentity(home);
  assert.equal(again.fingerprint, first.fingerprint);
  assert.equal(again.secret, first.secret);
});

test("this machine does not listen: there is no server to start here", () => {
  const home = scratch();
  const servers = createServers({ home });
  assert.equal(typeof servers.local, "undefined", "a server can still be started on this machine");
  assert.equal(typeof servers.remote, "function");
  assert.equal(existsSync(join(home, "server.sock")), false, "somebody opened a door on the machine at home");
});

test("any command with a type goes to the driver, and only a typeless one is refused", () => {
  assert.deepEqual(commandRoute({ type: "say", text: "oi", cid: 3 }), { path: "/command", body: { type: "say", text: "oi", cid: 3 } });
  assert.equal(commandRoute({ type: "control", op: "context" }).path, "/command");
  assert.equal(commandRoute({}), null);
  assert.equal(commandRoute(null), null);
  assert.match(replyLine({ ok: false, error: "x" }, 7), /"cid":7/);
});

test("a seat of this machine crosses with no server: history, a live event, and say", async () => {
  const home = scratch();
  const name = "assento-de-teste";
  const emit = seatOnDisk(home, name);
  const heard = [];
  const socket = seatSocket(home, name, heard);
  await socket.up();

  let sessions = null;
  let seat = null;
  try {
    const desk = createDesk({ history: (...args) => sessions.history(...args), command: (...args) => sessions.command(...args) });
    sessions = createSessions({ base: home, driver: DRIVER, onEvent: (who, event) => desk.deliver(who, event) });

    emit("antes de abrir");

    const sent = [];
    seat = attachSeat({ client: desk.client, stream: desk.stream, name, from: 0, send: (line) => sent.push(line) });
    for (let round = 0; round < 60 && !sent.length; round += 1) await wait(50);
    assert.ok(sent.length, "the history never arrived");
    assert.equal(JSON.parse(sent[0]).message.content[0].text, "antes de abrir");

    emit("depois de abrir");
    for (let round = 0; round < 120 && sent.length < 2; round += 1) await wait(25);
    const texts = sent.map((line) => JSON.parse(line).message?.content?.[0]?.text).filter(Boolean);
    assert.deepEqual(texts, ["antes de abrir", "depois de abrir"], `what arrived was ${JSON.stringify(texts)}`);

    await seat.command(JSON.stringify({ type: "say", text: "bom dia", cid: 9 }));
    assert.ok(heard.some((one) => one.type === "say" && one.text === "bom dia"), `the socket heard ${JSON.stringify(heard)}`);
    const answered = sent.map((line) => JSON.parse(line)).find((one) => one.cid === 9);
    assert.ok(answered, "the answer to the say did not come back with the cid");
  } finally {
    try { seat?.stop(); } catch {}
    try { sessions?.stop(); } catch {}
    await socket.down();
  }
});

test("a queued seat comes back marked, or the window tray never draws itself", async () => {
  const home = scratch();
  const name = "assento-com-fila";
  seatOnDisk(home, name);
  const heard = [];
  const socket = seatSocket(home, name, heard, { ok: true, queued: true });
  await socket.up();

  let sessions = null;
  let seat = null;
  try {
    const desk = createDesk({ history: (...args) => sessions.history(...args), command: (...args) => sessions.command(...args) });
    sessions = createSessions({ base: home, driver: DRIVER, onEvent: (who, event) => desk.deliver(who, event) });

    const back = [];
    seat = attachSeat({ client: desk.client, stream: desk.stream, name, from: 0, send: (line) => back.push(line) });
    await seat.command(JSON.stringify({ type: "say", text: "vai pra fila", cid: 77 }));

    const said = heard.find((one) => one.type === "say");
    assert.ok(said, `the driver heard ${JSON.stringify(heard)}`);
    assert.equal(said.cid, 77, "without the cid the timeline bubble and the queue item never recognise each other");

    const reply = back.map((line) => JSON.parse(line)).find((one) => one.cid === 77);
    assert.ok(reply, "the answer did not come back with the cid");
    assert.equal(reply.bridge_reply.queued, true, "the app has to know it was queued");
  } finally {
    try { seat?.stop(); } catch {}
    try { sessions?.stop(); } catch {}
    await socket.down();
  }
});

test("every command type the window sends reaches the driver socket", async () => {
  const src = join(HERE, "../src/app");
  const app = readdirSync(src).filter((one) => one.endsWith(".js")).map((one) => readFileSync(join(src, one), "utf8")).join("\n");
  const wanted = [...new Set([...app.matchAll(/type: "([a-z_]+)"/g)].map((hit) => hit[1]))];
  assert.ok(wanted.length >= 5, `the window sends ${wanted.length} types — this test lost its subject`);

  const home = scratch();
  const name = "assento-comandado";
  seatOnDisk(home, name);
  const heard = [];
  const socket = seatSocket(home, name, heard);
  await socket.up();

  let sessions = null;
  let seat = null;
  try {
    const desk = createDesk({ history: (...args) => sessions.history(...args), command: (...args) => sessions.command(...args) });
    sessions = createSessions({ base: home, driver: DRIVER, onEvent: (who, event) => desk.deliver(who, event) });
    seat = attachSeat({ client: desk.client, stream: desk.stream, name, from: 0, send: () => {} });

    const answeredByTheBroker = { shell: { body: { command: "true" }, heardAs: "record" } };
    for (const type of wanted) await seat.command(JSON.stringify({ type, cid: 1, ...(answeredByTheBroker[type]?.body || {}) }));
    for (const deadline = Date.now() + 5000; Date.now() < deadline && !heard.some((one) => one.type === "record");) await new Promise((r) => setTimeout(r, 25));

    const arrived = new Set(heard.map((one) => one.type));
    const missing = wanted.filter((type) => !arrived.has(answeredByTheBroker[type]?.heardAs || type));
    assert.deepEqual(missing, [], `these commands never reached the driver: ${missing.join(", ")}`);
  } finally {
    try { seat?.stop(); } catch {}
    try { sessions?.stop(); } catch {}
    await socket.down();
  }
});

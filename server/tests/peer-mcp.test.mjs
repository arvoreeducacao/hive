import { test } from "node:test";
import { createServer as createHttpServer } from "node:http";
import { socketPathFor } from "../door.mjs";
import { seatSockPath } from "../engine/paths.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));

/* a state dir with two structured seats in it, one of them holding a socket that answers like the
   driver does. PATH is emptied for the child so the tmux on this machine never joins the test. */

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-peer-"));
  for (const dir of ["sessions", "sock", "status", "events"]) await mkdir(join(base, dir), { recursive: true });
  await writeFile(join(base, "sessions", "asker.json"), JSON.stringify({ session_id: "s1", cwd: "/w/worktrees/api/asker", model_id: "opus" }));
  await writeFile(join(base, "sessions", "answerer.json"), JSON.stringify({ session_id: "s2", cwd: "/w/worktrees/frontend/answerer", model_id: "sonnet" }));
  await writeFile(join(base, "status", "answerer.md"), "title: o form\n09:12 [working] ajustando o form de cartão\n");
  await writeFile(join(base, "events", "asker.ndjson"), `${JSON.stringify({ seq: 1, type: "driver", subtype: "started" })}\n`);
  return base;
}

function fakeDriver(base, name, answer = () => ({ ok: true, seq: 1 })) {
  const got = [];
  const server = createServer((conn) => {
    let buf = "";
    conn.on("data", (data) => {
      buf += data;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const cmd = JSON.parse(line);
        got.push(cmd);
        conn.write(`${JSON.stringify(answer(cmd))}\n`);
      }
    });
    conn.on("error", () => {});
  });
  return new Promise((resolve) => {
    server.listen(seatSockPath(base, name), () => resolve({ got, close: () => server.close() }));
  });
}

function mcp(base, seat) {
  const child = spawn(process.execPath, [join(HERE, "peer/peer-mcp.mjs")], {
    env: { HIVE_STATE_DIR: base, HIVE_SEAT: seat, PATH: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  const waiting = new Map();
  child.stdout.on("data", (data) => {
    buf += data;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = waiting.get(message.id);
      if (waiter) { waiting.delete(message.id); waiter(message); }
    }
  });
  let id = 0;
  return {
    call(method, params) {
      id += 1;
      const mine = id;
      const answer = new Promise((resolve) => waiting.set(mine, resolve));
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
      return answer;
    },
    stop() { child.kill(); },
  };
}

const said = (reply) => reply.result.content.map((c) => c.text).join("\n");

test("the peer tools introduce themselves the way an mcp server has to", async () => {
  const base = await hive();
  const client = mcp(base, "asker");
  try {
    const hello = await client.call("initialize", { protocolVersion: "2024-11-05" });
    assert.equal(hello.result.serverInfo.name, "hive");
    assert.ok(hello.result.capabilities.tools);
    const list = (await client.call("tools/list", {})).result.tools.map((t) => t.name);
    assert.deepEqual(list, ["peers", "message", "ask", "peek", "publish", "reply_on_page", "browser_navigate", "browser_screenshot", "browser_profile", "browser_set_cookie", "browser_cookies", "browser_resize", "browser_eval", "browser_snapshot", "browser_click", "browser_type", "browser_select_option", "browser_press_key", "browser_wait_for", "browser_tabs", "browser_back", "browser_forward", "browser_reload", "browser_upload", "browser_network", "browser_console", "device_open", "device_screenshot", "device_tap", "device_swipe", "device_type", "device_key", "device_tree", "device_logs", "device_close", "spawn", "rename", "task", "buzz", "reply_on_slack", "ask_person"]);
  } finally {
    client.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test("peers answers with the fleet and what each is doing", async () => {
  const base = await hive();
  const driver = await fakeDriver(base, "answerer");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const out = said(await client.call("tools/call", { name: "peers", arguments: {} }));
    assert.match(out, /you are asker \(local\)/);
    assert.match(out, /^open now \(1\)$/m);
    assert.match(out, /answerer "o form" · local · frontend · sonnet · working · "ajustando o form de cartão"/);
    assert.doesNotMatch(out, /^· asker/m);
  } finally {
    client.stop();
    driver.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("message reaches the peer's driver, named", async () => {
  const base = await hive();
  const driver = await fakeDriver(base, "answerer");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const out = said(await client.call("tools/call", { name: "message", arguments: { seat: "answer", text: "que shape o form manda?" } }));
    assert.match(out, /delivered to answerer/);
    assert.equal(driver.got.length, 1);
    assert.deepEqual(driver.got[0], { type: "say", text: "que shape o form manda?", images: [], from: "asker" });
  } finally {
    client.stop();
    driver.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("a seat reaches a peer as many times as the round needs, with nothing to run out of", async () => {
  const base = await hive();
  const driver = await fakeDriver(base, "answerer");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    for (let i = 0; i < 6; i++) {
      const reply = await client.call("tools/call", { name: "message", arguments: { seat: "answerer", text: `what now ${i}?` } });
      assert.ok(!reply.result.isError, `the hive refused message ${i}`);
    }
    assert.equal(driver.got.length, 6);
  } finally {
    client.stop();
    driver.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("a seat with no name in the hive is told to reopen instead of writing anonymously", async () => {
  const base = await hive();
  const driver = await fakeDriver(base, "answerer");
  const client = mcp(base, "");
  try {
    await client.call("initialize", {});
    const reply = await client.call("tools/call", { name: "message", arguments: { seat: "answerer", text: "oi" } });
    assert.equal(reply.result.isError, true);
    assert.match(said(reply), /no name in the hive yet/);
    assert.equal(driver.got.length, 0);
  } finally {
    client.stop();
    driver.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("a name that fits nobody comes back with the seats that do exist", async () => {
  const base = await hive();
  const driver = await fakeDriver(base, "answerer");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const reply = await client.call("tools/call", { name: "message", arguments: { seat: "floresta", text: "oi" } });
    assert.equal(reply.result.isError, true);
    assert.match(said(reply), /no seat called “floresta”. Live seats: answerer/);
  } finally {
    client.stop();
    driver.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("ask arms the wait, sends the question, and gives up saying where the answer will land", async () => {
  const base = await hive();
  const theirs = await fakeDriver(base, "answerer");
  const mine = await fakeDriver(base, "asker");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const out = said(await client.call("tools/call", { name: "ask", arguments: { seat: "answerer", question: "que shape?", timeout_seconds: 15 } }));
    assert.match(out, /has not answered in 15s/);
    assert.match(out, /best assumption/);
    const asked = mine.got.map((c) => c.type);
    assert.equal(asked[0], "expect");
    assert.equal(asked.at(-1), "unexpect");
    assert.ok(asked.slice(1, -1).every((type) => type === "collect"), "the wait polls the driver, never the events file");
    assert.equal(theirs.got[0].from, "asker");
  } finally {
    client.stop();
    theirs.close();
    mine.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("ask hands back the answer its own driver held, without reading the events file", async () => {
  const base = await hive();
  await writeFile(join(base, "events", "asker.ndjson"), "not json at all\n");
  const theirs = await fakeDriver(base, "answerer");
  let polls = 0;
  const mine = await fakeDriver(base, "asker", (cmd) => {
    if (cmd.type !== "collect") return { ok: true, seq: 1 };
    polls += 1;
    return polls < 2 ? { ok: true, answered: false } : { ok: true, answered: true, text: "shape B", images: [] };
  });
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const out = said(await client.call("tools/call", { name: "ask", arguments: { seat: "answerer", question: "que shape?", timeout_seconds: 15 } }));
    assert.match(out, /answerer answered:\n\nshape B/);
    const expect = mine.got.find((c) => c.type === "expect");
    assert.equal(expect.from, "answerer");
    assert.ok(expect.wait_ms > 15_000, "the driver keeps the answer armed a little past the ask's own wait");
    assert.equal(mine.got.some((c) => c.type === "unexpect"), false);
  } finally {
    client.stop();
    theirs.close();
    mine.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("ask never waits past the point where the agent's mcp client cuts a silent tool", async () => {
  const base = await hive();
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const listed = await client.call("tools/list", {});
    const ask = listed.result.tools.find((tool) => tool.name === "ask");
    assert.match(ask.inputSchema.properties.timeout_seconds.description, /max 270/);
  } finally {
    client.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test("buzz asks the hive to ring, and refuses to ring about nothing", async () => {
  const base = await hive();
  const asked = [];
  const door = createHttpServer((req, res) => {
    let buf = "";
    req.on("data", (piece) => { buf += piece; });
    req.on("end", () => {
      asked.push({ path: req.url, body: JSON.parse(buf || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ sent: 1 }));
    });
  });
  await new Promise((up) => door.listen(socketPathFor({ home: base }), up));
  const client = mcp(base, "asker");
  try {
    const empty = await client.call("tools/call", { name: "buzz", arguments: { line: "   " } });
    assert.match(JSON.stringify(empty.result), /nothing to buzz about/);
    assert.equal(asked.length, 0);

    const rang = await client.call("tools/call", { name: "buzz", arguments: { line: "  o deploy   caiu em prod " } });
    assert.match(JSON.stringify(rang.result), /phone was buzzed/);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].path, "/api/buzz");
    assert.equal(asked[0].body.seat, "asker");
    assert.equal(asked[0].body.text, "o deploy caiu em prod");
    assert.equal(asked[0].body.where, "local");
  } finally {
    client.stop();
    door.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("a rename lands where the rail reads it and where the seat list reads it", async () => {
  const base = await hive();
  await writeFile(join(base, "status", "asker.md"), "title: asker\n09:12 [working] lendo a query lenta\n");
  const mine = await fakeDriver(base, "asker");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const out = said(await client.call("tools/call", { name: "rename", arguments: { title: "  o áudio   mudo no CRM ", now: "trocando o importer" } }));
    assert.match(out, /o áudio mudo no CRM/);
    assert.deepEqual(mine.got, [{ type: "control", op: "setTitle", title: "o áudio mudo no CRM" }]);
    const held = readFileSync(join(base, "status", "asker.md"), "utf8");
    assert.match(held, /^title: o áudio mudo no CRM$/m);
    assert.match(held, /^09:12 \[working\] lendo a query lenta$/m);
    assert.match(held, /^\d{2}:\d{2} \[working\] trocando o importer$/m);
    assert.equal(held.match(/^title:/gm).length, 1);
  } finally {
    client.stop();
    mine.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("a rename with nothing in it leaves the seat with the name it had", async () => {
  const base = await hive();
  const mine = await fakeDriver(base, "asker");
  const client = mcp(base, "asker");
  try {
    await client.call("initialize", {});
    const reply = await client.call("tools/call", { name: "rename", arguments: { title: "   " } });
    assert.equal(reply.result.isError, true);
    assert.match(said(reply), /showing its slug/);
    assert.equal(mine.got.length, 0);
    assert.equal(existsSync(join(base, "status", "asker.md")), false);
  } finally {
    client.stop();
    mine.close();
    await rm(base, { recursive: true, force: true });
  }
});

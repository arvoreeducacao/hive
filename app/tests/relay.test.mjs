import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const relay = createRequire(import.meta.url)("../main/relay.js");
const { socketPathFor } = await import("../lib/doorstep.mjs");

test("both sides of the app pick the very same socket", () => {
  const casos = [
    { home: "/Users/alguem/.hive" },
    { home: "/private/tmp/" + "x".repeat(140), short: "/var/tmp" },
    { home: "/a", platform: "win32", hub: "/hub" }
  ];
  for (const caso of casos) {
    assert.equal(relay.socketPathFor({ short: "/var/tmp", ...caso }), socketPathFor({ short: "/var/tmp", ...caso }),
      `the server and the app would open different doors for ${JSON.stringify(caso)}`);
  }
});

test("the window's own address never leaks to the socket", () => {
  const headers = new Map([["host", "app"], ["origin", "hive://app"], ["referer", "hive://app/"], ["content-type", "application/json"], ["accept", "*/*"]]);
  const sent = relay.headersToSend(headers);
  assert.equal(sent.host, undefined);
  assert.equal(sent.origin, undefined);
  assert.equal(sent.referer, undefined);
  assert.equal(sent["content-type"], "application/json");
});

test("hop-by-hop headers never cross the bridge", () => {
  for (const bad of ["connection", "transfer-encoding", "content-length", "upgrade", "keep-alive"]) {
    assert.ok(relay.HOP_BY_HOP.has(bad), `${bad} must not be forwarded`);
    assert.equal(relay.headersToAnswer({ [bad]: "x", "content-type": "text/html" })[bad], undefined);
  }
  assert.equal(relay.headersToAnswer({ "Content-Type": "text/html" })["content-type"], "text/html");
});

test("a header the server repeats arrives as one value", () => {
  assert.equal(relay.headersToAnswer({ "set-cookie": ["a=1", "b=2"] })["set-cookie"], "a=1, b=2");
});

test("the path and query survive the trip to the socket", () => {
  assert.equal(relay.pathOf("hive://app/api/hive?name=um&where=local"), "/api/hive?name=um&where=local");
  assert.equal(relay.pathOf("hive://app/"), "/");
  assert.equal(relay.socketUrlFor("/tmp/h.sock", "hive://app/pty?name=um&cols=80"), "ws+unix:///tmp/h.sock:/pty?name=um&cols=80");
});

test("the page hands the bridge a relative path, and it must not choke on it", () => {
  assert.equal(relay.pathOf("/pty?name=um&where=local"), "/pty?name=um&where=local");
  assert.equal(relay.socketUrlFor("/tmp/h.sock", "/events?name=um&from=0"), "ws+unix:///tmp/h.sock:/events?name=um&from=0");
});

test("a named pipe keeps its backslashes — the ws package hands them straight back", () => {
  const pipe = "\\\\.\\pipe\\hive-01044a5b2a5e";
  const url = relay.socketUrlFor(pipe, "/events?name=um&from=0");
  assert.equal(url, "ws+unix:\\\\.\\pipe\\hive-01044a5b2a5e:/events?name=um&from=0");
  assert.doesNotThrow(() => new URL(url), "the ws package parses this address with new URL() before it ever reaches net.connect");
  const parsed = new URL(url);
  assert.equal(`${parsed.pathname}${parsed.search}`.split(":")[0], pipe, "what the ws package treats as the socketPath has to be exactly the pipe name");
});

test("the window is loaded from the scheme, never from a port", () => {
  const main = readFileSync(join(HERE, "main.js"), "utf8");
  assert.match(main, /const BASE = relay\.HOME_PAGE;/);
  assert.doesNotMatch(main, /PORT: String\(/, "the app still hands the server a port");
  assert.match(relay.HOME_PAGE, /^hive:\/\//);
});

test("the page reaches the bridge through a preload, with the renderer still sandboxed", () => {
  const main = readFileSync(join(HERE, "main.js"), "utf8");
  assert.match(main, /preload: join\(HERE, "main", "preload\.js"\)/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  const preload = readFileSync(join(HERE, "main", "preload.js"), "utf8");
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /exposeInMainWorld\("[^"]*",\s*ipcRenderer\s*\)/, "handing the raw ipc to the page undoes the sandbox");
});

const wire = async () => {
  const { EventEmitter } = await import("node:events");
  const { createServer } = await import("node:http");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { WebSocketServer } = createRequire(import.meta.url)("ws");

  const http = createServer();
  const sockets = new WebSocketServer({ server: http });
  const open = new Set();
  sockets.on("connection", (ws) => { open.add(ws); ws.on("close", () => open.delete(ws)); });
  const door = socketPathFor({ home: mkdtempSync(join(tmpdir(), "relay-")) });
  await new Promise((ready) => http.listen(door, ready));

  const ipcMain = new EventEmitter();
  const wires = relay.wireTerminals({ ipcMain, socketPath: door });

  const window_ = () => {
    const sender = new EventEmitter();
    sender.isDestroyed = () => false;
    sender.send = (channel, id, payload, page) => sender.emit(channel, id, payload, page);
    return sender;
  };

  const page = (sender) => {
    const listeners = new Map();
    const mark = `page-${listeners.size}-${Math.random()}`;
    let nextId = 0;
    for (const [channel, hook] of [["hive:open", "open"], ["hive:data", "data"], ["hive:close", "close"], ["hive:error", "error"]]) {
      sender.on(channel, (id, payload, from) => { if (from === mark) listeners.get(id)?.[hook]?.(payload); });
    }
    return {
      mark,
      open(path, heard) {
        const id = ++nextId;
        listeners.set(id, heard);
        ipcMain.emit("hive:open", { sender }, id, path, mark);
        return id;
      },
      say(id, text) { ipcMain.emit("hive:send", { sender }, id, text, mark); }
    };
  };

  const rest = () => new Promise((done) => setTimeout(done, 250));
  const shut = () => {
    for (const key of [...wires.links.keys()]) wires.drop(key);
    for (const ws of open) ws.terminate();
    sockets.close();
    http.close();
  };
  return { ipcMain, open, wires, window_, page, rest, shut };
};

test("two pages of one window number their links the same, and neither takes the other down", async () => {
  const bench = await wire();
  const sender = bench.window_();

  const before = bench.page(sender);
  const heardBefore = [];
  before.open("/events?name=um", { open() {}, data() {}, close: () => heardBefore.push("closed"), error() {} });
  await bench.rest();

  const now = bench.page(sender);
  let closed = false;
  now.open("/events?name=um", { open() {}, data() {}, close: () => { closed = true; }, error() {} });
  await bench.rest();

  assert.equal(closed, false, "the page that just loaded was told its own live link had closed");
  assert.equal(bench.open.size, 1, "the window ended up holding a link for each of its pages");
  assert.deepEqual(heardBefore, ["closed"], "the link of the page that is gone was left running");
  bench.shut();
});

test("what the page types still reaches the seat after the page before it goes away", async () => {
  const bench = await wire();
  const sender = bench.window_();

  bench.page(sender).open("/events?name=um", { open() {}, data() {}, close() {}, error() {} });
  await bench.rest();
  const stale = [...bench.open][0];

  const now = bench.page(sender);
  const id = now.open("/events?name=um", { open() {}, data() {}, close() {}, error() {} });
  await bench.rest();
  stale.terminate();
  await bench.rest();

  const heard = [];
  for (const ws of bench.open) ws.on("message", (raw) => heard.push(raw.toString()));
  now.say(id, "say it again");
  await bench.rest();

  assert.deepEqual(heard, ["say it again"], "the app lost the link it types through");
  bench.shut();
});

test("a link that dies after being replaced does not take the live one out of the map", async () => {
  const bench = await wire();
  const sender = bench.window_();
  const one = bench.page(sender);

  const id = one.open("/events?name=um", { open() {}, data() {}, close() {}, error() {} });
  await bench.rest();
  const first = [...bench.open][0];

  bench.ipcMain.emit("hive:open", { sender }, id, "/events?name=um", one.mark);
  await bench.rest();
  first.terminate();
  await bench.rest();

  const held = [...bench.open];
  assert.equal(held.length, 1, "the seat should hold exactly one link");
  const painted = [];
  sender.on("hive:data", (heardId, line, from) => { if (from === one.mark && heardId === id) painted.push(line); });
  held[0].send("still here");
  await bench.rest();
  assert.deepEqual(painted, ["still here"], "the live link went missing when the replaced one died");
  bench.shut();
});

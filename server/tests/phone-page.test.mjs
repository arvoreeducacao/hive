import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSyncBroker } from "../sync/broker.mjs";
import { isSyncPath, phoneFile, phoneFiles, serveSync } from "../sync/mount.mjs";
import { createContext, runInContext } from "node:vm";
import { aadOf, bytesOf, encrypt, keyIdOf, random, toB64 } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

test("every file the phone page asks for is one the server serves, and the offline shell lists the same ones", () => {
  const sw = readFileSync(join(HERE, "phone", "sw.js"), "utf8");
  const cached = JSON.parse(sw.match(/const FILES = (\[[^\]]+\]);/)[1]);
  for (const path of cached) assert.ok(phoneFile(path), `${path} is cached for offline but the server does not serve it`);
  for (const rel of phoneFiles()) assert.ok(cached.includes(`/phone${rel === "/" ? "/" : rel}`) || rel === "/index.html" || rel === "/sw.js", `/phone${rel} is served but never cached for offline`);
  const page = readFileSync(join(HERE, "phone", "index.html"), "utf8");
  for (const src of [...page.matchAll(/(?:src|href)="(\/phone\/[^"]+)"/g)].map((one) => one[1])) assert.ok(phoneFile(src), `${src} is on the page but not served`);
  const app = readFileSync(join(HERE, "phone", "app.js"), "utf8");
  for (const src of [...app.matchAll(/from "(\/phone\/[^"]+)"/g)].map((one) => one[1])) assert.ok(phoneFile(src), `${src} is imported but not served`);
});

test("the phone's face and markdown are the desktop's own, to the byte", () => {
  assert.equal(readFileSync(join(HERE, "phone", "avatar.mjs"), "utf8"), readFileSync(join(HERE, "..", "app", "assets", "avatar", "avatar.mjs"), "utf8"), "the phone's face drifted from the desktop's — copy app/assets/avatar/avatar.mjs over server/phone/avatar.mjs");
  const mine = readFileSync(join(HERE, "phone", "markdown.mjs"), "utf8").split("\n");
  const theirs = readFileSync(join(HERE, "..", "app", "assets", "markdown.mjs"), "utf8").split("\n");
  assert.equal(mine[0], "const phrase = (text) => text;");
  assert.equal(theirs[0], 'import { phrase } from "./i18n.mjs";');
  assert.deepEqual(mine.slice(1), theirs.slice(1), "the phone's markdown drifted from the desktop's — copy app/assets/markdown.mjs over server/phone/markdown.mjs and put the first line back");
});

test("the page comes out of the server's door with its types, without a signature, and the sync door refuses the unsigned", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-phone-page-"));
  const pod = newIdentity("pod");
  const broker = createSyncBroker({ dataDir, audience: pod.fingerprint, owner: "jonas" });
  const http = createServer((request, response) => {
    const url = new URL(request.url, "http://sync");
    if (isSyncPath(url.pathname)) return serveSync(broker, request, response, url);
    response.writeHead(404);
    response.end();
  });
  await new Promise((ready) => http.listen(0, "127.0.0.1", ready));
  const url = `http://127.0.0.1:${http.address().port}`;
  try {
    const page = await fetch(`${url}/phone/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await page.text(), /<title>Hive<\/title>/);
    const script = await fetch(`${url}/phone/device.mjs`);
    assert.equal(script.headers.get("content-type"), "text/javascript");
    assert.equal((await fetch(`${url}/phone/../server.mjs`)).status, 404);
    assert.equal((await fetch(`${url}/phone/nope.js`)).status, 404);
    const hello = await (await fetch(`${url}/sync/hello`)).json();
    assert.equal(hello.audience, pod.fingerprint);
    assert.equal(hello.person, "jonas");
    assert.equal((await fetch(`${url}/sync/seats`)).status, 401);
    assert.equal((await fetch(`${url}/sync/stream`)).status, 401);
  } finally {
    http.closeAllConnections?.();
    await new Promise((done) => http.close(() => done()));
    broker.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

function runTheWorker({ kept = {}, names = {} } = {}) {
  const heard = new Map();
  const shown = [];
  const waited = [];
  const sandbox = {
    self: {
      addEventListener: (kind, fn) => heard.set(kind, fn),
      skipWaiting: () => {},
      clients: { claim: () => {}, matchAll: async () => [], openWindow: async () => {} },
      registration: { showNotification: async (title, options) => shown.push({ title, ...options }) }
    },
    caches: { open: async () => ({ match: async () => new Response(JSON.stringify(names), { headers: { "content-type": "application/json" } }) }) },
    indexedDB: {
      open: () => {
        const asked = {};
        queueMicrotask(() => {
          asked.result = { transaction: () => ({ objectStore: () => ({ get: (key) => {
            const req = {};
            queueMicrotask(() => { req.result = kept[key]; req.onsuccess?.(); });
            return req;
          } }) }) };
          asked.onsuccess?.();
        });
        return asked;
      }
    },
    crypto: globalThis.crypto, atob, btoa, TextEncoder, TextDecoder, Response, URL, queueMicrotask, console,
    Request: class { constructor(path) { this.url = new URL(path, "https://hive.test").href; } }
  };
  createContext(sandbox);
  runInContext(readFileSync(join(HERE, "phone", "sw.js"), "utf8"), sandbox);
  return {
    shown,
    async push(payload) {
      heard.get("push")({ data: { json: () => payload }, waitUntil: (job) => waited.push(job) });
      await Promise.all(waited);
    }
  };
}

test("the push tells the phone which chat came back and what it said, and falls back to the names it kept when it cannot open the line", async () => {
  const raw = random(32);
  const keyId = await keyIdOf(raw);
  const box = await encrypt(raw, aadOf({ seat: "jonas-1", lane: "notice", seq: 7, keyId }), bytesOf(JSON.stringify({ title: "a fila do suporte", text: "são 135 abertos, 27 de verdade" })));
  const kept = { seatKeys: { "jonas-1": { [keyId]: toB64(raw) } } };
  const names = { names: { "jonas-1": "o nome velho" }, words: { chat: "um chat", done: "terminou o turno", needs: "está esperando você", more: "e outros {n} chats voltaram" } };

  const worker = runTheWorker({ kept, names });
  await worker.push({ seat: "jonas-1", wake: "done", seq: 7, n: { keyId, nonce: box.nonce, ct: box.ct } });
  assert.deepEqual({ title: worker.shown[0].title, body: worker.shown[0].body }, { title: "a fila do suporte", body: "são 135 abertos, 27 de verdade" });

  await worker.push({ seat: "jonas-1", wake: "done", seq: 7, more: 3, n: { keyId, nonce: box.nonce, ct: box.ct } });
  assert.equal(worker.shown[1].body, "são 135 abertos, 27 de verdade\ne outros 3 chats voltaram");

  const blind = runTheWorker({ kept: {}, names });
  await blind.push({ seat: "jonas-1", wake: "needs", seq: 7, n: { keyId, nonce: box.nonce, ct: box.ct } });
  assert.deepEqual({ title: blind.shown[0].title, body: blind.shown[0].body }, { title: "o nome velho", body: "está esperando você" }, "a phone that cannot open the line still says which chat and what it wants");

  const bare = runTheWorker({ kept: {}, names: { words: names.words } });
  await bare.push({ seat: "jonas-2", wake: "done", seq: 1 });
  assert.deepEqual({ title: bare.shown[0].title, body: bare.shown[0].body }, { title: "um chat", body: "terminou o turno" });
});

test("two quick taps on send while a new chat is being asked for open one chat, not two", async () => {
  const app = readFileSync(join(HERE, "phone", "app.js"), "utf8");
  const handler = app.match(/\$\("draftCompose"\)\.onsubmit = async \(event\) => \{[\s\S]*?\n\};\n/)[0];
  const element = () => ({ value: "", disabled: false, hidden: false, style: {}, className: "", textContent: "", appendChild() {}, scrollTop: 0, scrollHeight: 0 });
  const elements = { draftTyped: { ...element(), value: "fix the login" } };
  const asked = [];
  const sandbox = {
    $: (id) => (elements[id] ||= element()),
    document: { createElement: element },
    device: { refreshPeople: () => new Promise((done) => setTimeout(done, 5)), askBirth: async (mac, mission) => { asked.push(mission); return { id: `birth-${asked.length}` }; } },
    macOnline: () => ({ name: "Mac", fingerprint: "mac" }),
    providers: { data: null },
    draftPick: {},
    whereWanted: "local",
    BIRTH_WAIT_MS: 60000,
    t: (text) => text,
    paintDraft() {}, paintBox() {}, draftAgent: () => "claude", whoLine: () => element(), draftNote: () => element(),
    restDraft() { elements.draftSend.disabled = false; elements.draftTyped.disabled = false; },
    setTimeout, clearTimeout,
  };
  createContext(sandbox);
  runInContext(`var pendingBirth = null;\n${handler}`, sandbox);
  const submit = sandbox.$("draftCompose").onsubmit;
  const tap = () => submit({ preventDefault() {} });
  await Promise.all([tap(), tap()]);
  assert.equal(asked.length, 1, "a double tap asked the Mac for two chats");
  clearTimeout(sandbox.pendingBirth.timer);
});

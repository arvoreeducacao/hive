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
  for (const rel of phoneFiles()) assert.ok(cached.includes(`/phone${rel === "/" ? "/" : rel}`) || rel === "/index.html" || rel === "/sw.js" || rel === "/page-host", `/phone${rel} is served but never cached for offline`);
  const page = readFileSync(join(HERE, "phone", "index.html"), "utf8");
  for (const src of [...page.matchAll(/(?:src|href)="(\/phone\/[^"]+)"/g)].map((one) => one[1])) assert.ok(phoneFile(src), `${src} is on the page but not served`);
  const app = readFileSync(join(HERE, "phone", "app.js"), "utf8");
  for (const src of [...app.matchAll(/from "(\/phone\/[^"]+)"/g)].map((one) => one[1])) assert.ok(phoneFile(src), `${src} is imported but not served`);
});

test("the phone's face, markdown and WebRTC shield are the desktop's own, to the byte", () => {
  assert.equal(readFileSync(join(HERE, "phone", "page-shield.mjs"), "utf8"), readFileSync(join(HERE, "..", "app", "assets", "page-shield.mjs"), "utf8"), "the phone's page shield drifted from the desktop's — copy app/assets/page-shield.mjs over server/phone/page-shield.mjs");
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

const policyOf = (text) => text.split(";").map((one) => one.trim()).filter(Boolean);

test("a page the chat drew reaches no network on the phone, and its host comes from the server sandboxed by its own response", async () => {
  const { PAGE_HOST, PAGE_HOST_POLICY, PAGE_PING_MESSAGE, PAGE_POLICY, PAGE_READY_MESSAGE, PAGE_SHOWN_MESSAGE, PAGE_SOURCE_MESSAGE, dressPage } = await import("../phone/pages.mjs");
  const desktop = [...readFileSync(join(HERE, "..", "app", "src", "app", "page-dress.js"), "utf8").match(/const PAGE_POLICY = \[([\s\S]*?)\]\.join/)[1].matchAll(/"([^"]+)"/g)].map((one) => one[1]);
  const phone = policyOf(PAGE_POLICY);
  assert.deepEqual(phone, desktop.map((rule) => (rule.startsWith("connect-src") ? "connect-src 'none'" : rule.split(" ").filter((word) => word !== "https:").join(" "))), "the phone differs from the desktop only by reaching no network: no https source and no connection, since the phone has no guard for private addresses");
  assert.ok(phone.includes("webrtc 'block'"));
  assert.doesNotMatch(PAGE_POLICY, /https:|http:|\*/);
  assert.deepEqual(policyOf(PAGE_HOST_POLICY), ["sandbox allow-scripts", ...phone, "frame-ancestors 'self'"]);

  const dataDir = mkdtempSync(join(tmpdir(), "hive-page-host-"));
  const broker = createSyncBroker({ dataDir, audience: newIdentity("pod").fingerprint, owner: "jonas" });
  const http = createServer((request, response) => serveSync(broker, request, response, new URL(request.url, "http://sync")));
  await new Promise((ready) => http.listen(0, "127.0.0.1", ready));
  try {
    const host = await fetch(`http://127.0.0.1:${http.address().port}${PAGE_HOST}`);
    assert.equal(host.status, 200);
    assert.equal(host.headers.get("content-security-policy"), PAGE_HOST_POLICY, "the host is sandboxed by the response, so even opened on its own it has no origin of the phone");
    assert.equal(host.headers.get("referrer-policy"), "no-referrer");
    const page = await fetch(`http://127.0.0.1:${http.address().port}/phone/`);
    assert.doesNotMatch(page.headers.get("content-security-policy"), /sandbox/);
  } finally {
    await new Promise((done) => http.close(done));
    broker.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
  const sw = readFileSync(join(HERE, "phone", "sw.js"), "utf8");
  assert.ok(!JSON.parse(sw.match(/const FILES = (\[[^\]]+\]);/)[1]).includes(PAGE_HOST), "a sandboxed frame is never served by the worker, so the host is not cached for it");

  const script = readFileSync(join(HERE, "phone", "page-host.html"), "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const word of [PAGE_READY_MESSAGE, PAGE_SOURCE_MESSAGE]) assert.ok(script.includes(`"${word}"`), `the host does not speak ${word}`);
  const parent = { said: [], postMessage(message) { this.said.push(message); } };
  const listeners = new Map();
  const written = [];
  const sandbox = {
    parent,
    addEventListener: (kind, fn) => listeners.set(kind, fn),
    removeEventListener: (kind) => listeners.delete(kind),
    document: { open: () => written.push("open"), write: (html) => written.push(html), close: () => written.push("close") }
  };
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(script, sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(parent.said)), [{ type: PAGE_READY_MESSAGE }]);
  listeners.get("message")({ source: { stranger: true }, data: { type: PAGE_SOURCE_MESSAGE, html: "<p>de outro</p>" } });
  listeners.get("message")({ source: parent, data: { type: "other", html: "<p>x</p>" } });
  assert.deepEqual(written, [], "the host writes only what its parent sends");
  const take = listeners.get("message");
  take({ source: parent, data: { type: PAGE_SOURCE_MESSAGE, html: "<p>funil</p>" } });
  take({ source: parent, data: { type: PAGE_SOURCE_MESSAGE, html: "<p>de novo</p>" } });
  assert.deepEqual(written, ["open", "<p>funil</p>", "close"], "the host writes the page once");

  const dressed = dressPage("<p>x</p>");
  assert.match(dressed, /^<!DOCTYPE html><meta charset="utf-8">.*<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/);
  assert.ok(dressed.includes(PAGE_SHOWN_MESSAGE) && dressed.includes(PAGE_PING_MESSAGE) && dressed.indexOf(PAGE_SHOWN_MESSAGE) < dressed.indexOf("<p>x</p>"), "the page says it is there before its own code runs, holding the parent before the page can shadow it");
  assert.doesNotMatch(dressed, /hive-page-height/);
  assert.match(dressPage("<!doctype html><p>x</p>", { report: true }), /^<!doctype html><meta charset="utf-8">[\s\S]*hive-page-height[\s\S]*<p>x<\/p>$/);
});

test("before any code of the page runs, the phone puts the desktop's own shield in the page: no WebRTC and no frame of its own", async () => {
  const { PAGE_POLICY, PAGE_HOST_POLICY, dressPage } = await import("../phone/pages.mjs");
  const { PAGE_SHIELD } = await import("../phone/page-shield.mjs");
  assert.ok(policyOf(PAGE_POLICY).includes("webrtc 'block'") && policyOf(PAGE_HOST_POLICY).includes("webrtc 'block'"), "where the browser knows the directive, the policy blocks WebRTC too");
  const dressed = dressPage('<p>x</p><template shadowrootmode="closed"><iframe></iframe></template><script>page()</script>', { report: true });
  const scripts = [...dressed.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts[0][1], PAGE_SHIELD, "the shield is the first script of the page");
  assert.ok(scripts[0].index < dressed.indexOf("<p>x</p>") && scripts.at(-1)[1] === "page()", "the shield comes before the page's markup and code");
  assert.doesNotMatch(dressed, /\sshadowrootmode=/i, "a declarative shadow root would hide a frame from the shield");
});

const appPiece = (app, name) => app.match(new RegExp(`(?:async )?function ${name}\\(.*\\{\\n[\\s\\S]*?\\n\\}\\n`))[0];

function fakeDom() {
  const node = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), attrs: {}, style: {}, dataset: {}, children: [], listeners: {}, isConnected: true, textContent: "", className: "", type: "",
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      addEventListener(kind, fn) { (this.listeners[kind] ||= []).push(fn); },
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...kids) { for (const kid of this.children) kid.isConnected = false; this.children = kids; },
      fire(kind) { for (const fn of this.listeners[kind] || []) fn(); }
    };
    return el;
  };
  return { createElement: node };
}

test("the phone draws the page in a sandboxed frame of its own, hands the page only to that frame, sizes it only by that frame's window, and closes a page that leaves", async () => {
  const app = readFileSync(join(HERE, "phone", "app.js"), "utf8");
  const timers = new Map();
  let made = 0;
  const sandbox = {
    document: fakeDom(),
    t: (text) => text,
    pageSourceOf: async () => "<p>funil</p>",
    dressPage: (html, { report }) => `${report ? "R" : ""}${html}`,
    PAGE_POLICY: "default-src 'none'",
    PAGE_HOST: "/phone/page-host",
    PAGE_READY_MESSAGE: "hive-page-ready", PAGE_SOURCE_MESSAGE: "hive-page-source", PAGE_SHOWN_MESSAGE: "hive-page-shown", PAGE_PING_MESSAGE: "hive-page-ping", PAGE_HEIGHT_MESSAGE: "hive-page-height",
    PAGE_ANSWER_MS: 5000,
    timers,
    setTimeout: (fn, ms) => { made += 1; timers.set(made, { fn, ms }); return made; },
    clearTimeout: (id) => { timers.delete(id); },
    pageHeightOf: (raw) => Math.min(2000, Math.max(80, Number(raw) || 480)),
    fitHeightOf: (raw) => (Number(raw) > 0 ? Math.min(2000, Math.max(80, Math.ceil(raw))) : 0),
    GROWTH_WINDOW_MS: 3000, GROWTH_STEPS: 12,
    pageFrames: new Map(), pageGrowth: new WeakMap(),
    Date
  };
  createContext(sandbox);
  runInContext(`const PAGE_MESSAGES = new Set([PAGE_READY_MESSAGE, PAGE_SHOWN_MESSAGE, PAGE_HEIGHT_MESSAGE]);\n${["grewTooOften", "fitPageFrame", "heardPage", "pageNoteInto", "pageInto"].map((name) => appPiece(app, name)).join("\n")}`, sandbox);

  const box = sandbox.document.createElement("div");
  await sandbox.pageInto(box, { seat: "funil", blob: "b1", title: "o funil", height: 5000, fit: true });
  const frame = box.children[0];
  assert.equal(frame.tagName, "IFRAME");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts", "the frame is sandboxed by its attribute for its whole life, so anywhere it navigates has no origin of the phone");
  assert.equal(frame.src, "/phone/page-host");
  assert.equal(frame.getAttribute("csp"), "default-src 'none'");
  assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(frame.style.height, "2000px");

  const said = [];
  frame.contentWindow = { postMessage: (message, target) => said.push({ message, target }) };
  const stranger = { postMessage: (message) => said.push({ stranger: message }) };
  sandbox.heardPage({ source: stranger, data: { type: "hive-page-ready" } });
  sandbox.heardPage({ source: null, data: { type: "hive-page-ready" } });
  assert.deepEqual(said, [], "only the frame's own window gets the page");
  sandbox.heardPage({ source: frame.contentWindow, data: { type: "hive-page-ready" } });
  assert.deepEqual(JSON.parse(JSON.stringify(said)), [{ message: { type: "hive-page-source", html: "R<p>funil</p>" }, target: "*" }]);

  sandbox.heardPage({ source: stranger, data: { type: "hive-page-height", height: 300 } });
  assert.equal(frame.style.height, "2000px", "another window does not size this frame");
  sandbox.heardPage({ source: frame.contentWindow, data: { type: "hive-page-height", height: 312.4 } });
  assert.equal(frame.style.height, "313px");
  for (let step = 0; step < 20; step += 1) sandbox.heardPage({ source: frame.contentWindow, data: { type: "hive-page-height", height: 400 + step * 10 } });
  assert.equal(frame.dataset.fit, "held", "a page that keeps growing is held where it is");

  const runTimers = () => { const due = [...sandbox.timers.values()]; sandbox.timers.clear(); for (const one of due) one.fn(); };
  said.length = 0;
  frame.fire("load");
  assert.equal(JSON.parse(JSON.stringify(said))[0].message.type, "hive-page-ping", "every load asks the frame whether the page is still the one it was given");
  assert.equal([...sandbox.timers.values()][0].ms, 5000);
  sandbox.heardPage({ source: stranger, data: { type: "hive-page-shown" } });
  assert.equal(sandbox.timers.size, 1, "a stranger cannot answer for the frame");
  sandbox.heardPage({ source: frame.contentWindow, data: { type: "hive-page-shown" } });
  runTimers();
  assert.equal(box.children[0], frame, "a page that answers stays");
  frame.fire("load");
  sandbox.heardPage({ source: frame.contentWindow, data: { type: "hive-page-ready" } });
  runTimers();
  assert.equal(box.children[0], frame, "a host that loaded again gets the page again and stays");
  frame.fire("load");
  runTimers();
  assert.notEqual(box.children[0], frame, "a load nobody answers for means the frame went to another address, and the page is closed");
  assert.equal(box.children[0].textContent, "the page tried to open another address and was closed");
  assert.equal(sandbox.pageFrames.has(frame), false);
  frame.fire("load");
  assert.equal(sandbox.timers.size, 0, "a closed frame is not watched any more");

  const full = sandbox.document.createElement("div");
  await sandbox.pageInto(full, { seat: "funil", blob: "b1", title: "o funil", fit: false });
  assert.equal(full.children[0].style.height, undefined);
  assert.equal(sandbox.pageFrames.get(full.children[0]).html, "<p>funil</p>", "full screen measures nothing");
});

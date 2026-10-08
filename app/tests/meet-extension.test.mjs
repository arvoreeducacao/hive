import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AVEIA_MARK, CAPTION_FILES, HIVE_ONLY_DESCRIPTION, HIVE_ONLY_NAME, aveiaOriginOf, installCaptionBridge, manifestFor, pointAtAveia } from "../lib/meeting-captions.mjs";
import { deploymentAddress, pack } from "../assets/meet-captions/pack.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const EXT = join(HERE, "assets", "meet-captions", "extension");
const load = createRequire(import.meta.url);
const { createRouter, createQueue, QUEUE_MAX } = load(join(EXT, "destinations.js"));
const AVEIA = "https://aveia.example";
const unbuilt = load(join(EXT, "aveia-origin.js"));
const origins = unbuilt.at(AVEIA);
const { originOf } = origins;
const { listen, readHandoff } = load(join(EXT, "aveia-connect.js"));
const tongue = load(join(EXT, "caption-language.js"));

const TOKEN = "dev_token_0123456789abcdef";

function shelf(first = {}) {
  const held = { ...first };
  return { held, get: async (key) => (key in held ? { [key]: held[key] } : {}), set: async (items) => { Object.assign(held, JSON.parse(JSON.stringify(items))); } };
}

function fakeAveia({ email = "lia.moreira@aveia.example" } = {}) {
  const net = { calls: [], down: false, status: 200, recording: false, lines: new Map(), meetings: 0 };
  net.fetch = async (url, init) => {
    const call = { url, method: init.method, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : null };
    net.calls.push(call);
    if (net.down) throw new TypeError("Failed to fetch");
    if (net.status !== 200) return { status: net.status, json: async () => ({}) };
    if (url.endsWith("/api/ext/me")) return { status: 200, json: async () => ({ email, name: "Lia Moreira" }) };
    if (call.body.command === "start" && !net.recording) { net.recording = true; net.meetings += 1; }
    if (net.recording) for (const line of call.body.lines) net.lines.set(line.key, line.text);
    const stopped = net.recording && call.body.command === "stop";
    if (stopped) net.recording = false;
    const open = { meetingId: `m${net.meetings}`, startedAt: 1000, now: 5000, url: `https://aveia.example/n/m${net.meetings}` };
    return { status: 200, json: async () => (net.recording ? { recording: true, ...open } : stopped ? { recording: false, ...open } : { recording: false, meetingId: null, startedAt: null, now: 5000, url: null }) };
  };
  net.posts = () => net.calls.filter((call) => call.url.endsWith("/api/ext/captions"));
  return net;
}

function fakeHive() {
  const hive = { asked: [], error: "", recording: false, lines: new Map() };
  hive.ask = async (body) => {
    hive.asked.push(body);
    if (hive.error) return { error: hive.error };
    if (body.command === "start") hive.recording = true;
    if (body.command === "stop") { hive.recording = false; return { recording: false, now: 5000 }; }
    if (hive.recording) for (const line of body.lines) hive.lines.set(line.key, line.text);
    return hive.recording ? { recording: true, taken: true, meetingId: "h1", startedAt: 2000, now: 5000 } : { recording: false, now: 5000 };
  };
  return hive;
}

function bench({ connected = true, places = origins } = {}) {
  const clock = { at: 5000 };
  const storage = shelf(connected ? { aveia: { baseUrl: AVEIA, token: TOKEN, email: "lia.moreira@aveia.example" } } : {});
  const memory = shelf();
  const net = fakeAveia();
  const hive = fakeHive();
  const router = createRouter({ origins: places, askHive: hive.ask, fetch: net.fetch, storage, memory, now: () => clock.at, defer: () => 0, undefer: () => {} });
  const line = (n, text = `fala ${n}`) => ({ key: `abcd-${n}`, speaker: "Caio", text, seenAt: clock.at });
  const beat = (lines = [], command = "") => router.beat({ captions: true, inCall: true, lines, sentAt: clock.at, command, title: command === "start" ? "Planejamento" : "", tab: 7 });
  return { clock, storage, memory, net, hive, router, line, beat };
}

test("a batch of captions goes to the hive and to aveia, in the shape the hive always got", async () => {
  const b = bench();
  const started = await b.beat([], "start");
  assert.equal(started.recording, true);
  const said = await b.beat([b.line(1), b.line(2)]);
  assert.deepEqual([...b.hive.lines.keys()], ["abcd-1", "abcd-2"]);
  assert.deepEqual([...b.net.lines.keys()], ["abcd-1", "abcd-2"]);
  const sent = b.net.posts().at(-1);
  assert.equal(sent.url, "https://aveia.example/api/ext/captions");
  assert.equal(sent.auth, `Bearer ${TOKEN}`);
  assert.deepEqual(Object.keys(sent.body).sort(), ["captions", "command", "id", "inCall", "lines", "sentAt", "tab", "title"]);
  assert.deepEqual(Object.keys(b.hive.asked.at(-1)).sort(), ["captions", "command", "inCall", "lines", "sentAt", "tab", "title"]);
  assert.equal(b.net.posts()[0].body.command, "start");
  assert.equal(b.net.posts()[0].body.title, "Planejamento");
  assert.equal(said.destinations.aveia.accepted, 2);
  assert.equal(said.destinations.hive.accepted, 2);
  assert.equal(said.destinations.aveia.email, "lia.moreira@aveia.example");
  assert.equal(said.url, "https://aveia.example/n/m1");
  assert.equal(said.startedAt, 1000, "the clock starts with the destination that began first");
  assert.equal(JSON.stringify(said).includes(TOKEN), false, "the token never travels to the call's page");
});

test("the hive missing does not stop aveia, and aveia down does not stop the hive", async () => {
  const noHive = bench();
  noHive.hive.error = "no-host";
  await noHive.beat([], "start");
  const one = await noHive.beat([noHive.line(1)]);
  assert.equal(one.recording, true);
  assert.equal(one.destinations.hive.available, false);
  assert.equal(one.destinations.hive.error, "no-host");
  assert.equal(one.destinations.hive.recording, false, "a start the hive never heard is not kept for later");
  assert.deepEqual([...noHive.net.lines.keys()], ["abcd-1"]);

  const noNet = bench();
  noNet.net.down = true;
  await noNet.beat([], "start");
  const two = await noNet.beat([noNet.line(1)]);
  assert.equal(two.recording, true);
  assert.deepEqual([...noNet.hive.lines.keys()], ["abcd-1"]);
  assert.equal(two.destinations.hive.accepted, 1);
  assert.equal(two.destinations.aveia.accepted, 0);
  assert.equal(two.destinations.aveia.pending, 1);
  assert.equal(two.destinations.aveia.error, "offline");
});

test("only the destinations that are ticked and reachable record, and nothing reaches aveia while nobody records", async () => {
  const idle = bench();
  await idle.beat([]);
  await idle.beat([idle.line(1)]);
  assert.equal(idle.net.posts().length, 0, "an idle call sends nothing to aveia");
  assert.equal(idle.net.calls.length, 1, "only who is connected was asked, once");
  assert.equal(idle.hive.asked.length, 2, "the hive keeps hearing that a call is open");

  const b = bench();
  await b.router.setTargets({ hive: false });
  assert.equal(b.storage.held.targets.hive, false);
  await b.beat([], "start");
  await b.beat([b.line(1)]);
  assert.equal(b.hive.asked.length, 0, "an unticked hive is left alone");
  assert.deepEqual([...b.net.lines.keys()], ["abcd-1"]);
  const joined = await b.router.setTargets({ hive: true }, { title: "Planejamento" });
  assert.equal(b.hive.asked.at(-1).command, "start", "ticking a destination during a recording starts it there");
  assert.equal(joined.destinations.hive.recording, true);
  const left = await b.router.setTargets({ aveia: false });
  assert.equal(b.net.posts().at(-1).body.command, "stop", "unticking one stops it there");
  assert.equal(left.destinations.aveia.recording, false);
  assert.equal(left.recording, true);

  const alone = bench({ connected: false });
  alone.hive.error = "no-host";
  const said = await alone.beat([], "start");
  assert.equal(said.recording, false);
  assert.equal(said.usable, false);
  assert.equal(said.destinations.aveia.connectUrl, "https://aveia.example/conectar-extensao");
  assert.equal(alone.net.calls.length, 0, "without a token nothing is asked of aveia");
});

test("without network or with the server failing, aveia's batches wait in a queue and are sent again in order", async () => {
  const b = bench();
  await b.router.setTargets({ hive: false });
  b.net.down = true;
  await b.beat([b.line(1)], "start");
  assert.equal(b.net.posts().length, 1);
  await b.beat([b.line(2)]);
  assert.equal(b.net.posts().length, 1, "it waits before trying again");
  b.clock.at += 4000;
  b.net.down = false;
  b.net.status = 503;
  const waiting = await b.beat([b.line(1, "fala 1 crescida"), b.line(3)]);
  assert.equal(b.net.posts().length, 2);
  assert.equal(waiting.recording, true, "the person keeps seeing the recording");
  assert.equal(waiting.destinations.aveia.waiting, true);
  assert.equal(waiting.destinations.aveia.pending, 3);
  assert.equal(waiting.destinations.aveia.error, "http-503");
  assert.equal(b.memory.held.lanes.aveia.lines.length, 3, "the queue outlives the background being put to sleep");
  b.net.status = 200;
  b.clock.at += 8000;
  const back = await b.beat([]);
  assert.equal(b.net.meetings, 1);
  assert.deepEqual([...b.net.lines.entries()], [["abcd-1", "fala 1 crescida"], ["abcd-2", "fala 2"], ["abcd-3", "fala 3"]]);
  assert.equal(b.net.posts().at(-1).body.command, "start", "the start that never arrived travels with the first lines");
  assert.equal(back.destinations.aveia.pending, 0);
  assert.equal(back.destinations.aveia.accepted, 3);
  assert.equal(back.destinations.aveia.error, "");

  b.net.down = true;
  await b.beat([b.line(4)]);
  await b.beat([], "stop");
  b.net.down = false;
  b.clock.at += 60000;
  const done = await b.beat([]);
  const last = b.net.posts().slice(-2).map((call) => `${call.body.command}:${call.body.lines.length}`);
  assert.deepEqual(last, [":1", "stop:0"], "the lines go first and the stop goes alone after them");
  assert.equal(b.net.lines.get("abcd-4"), "fala 4");
  assert.equal(done.recording, false);
  assert.equal(done.destinations.aveia.pending, 0);
});

test("after the stop the menu still links to the notes of what was just recorded, until the next recording", async () => {
  const b = bench();
  await b.beat([b.line(1)], "start");
  const done = await b.beat([], "stop");
  assert.equal(done.recording, false);
  assert.equal(done.url, "https://aveia.example/n/m1", "aveia answers the stop with the address of the notes");
  assert.equal((await b.router.look()).url, "https://aveia.example/n/m1");
  const woke = createRouter({ origins, askHive: b.hive.ask, fetch: b.net.fetch, storage: b.storage, memory: b.memory, now: () => b.clock.at, defer: () => 0, undefer: () => {} });
  assert.equal((await woke.look()).url, "https://aveia.example/n/m1", "a background that slept still knows it");
  const again = await b.beat([], "start");
  assert.equal(again.url, "https://aveia.example/n/m2");
  await b.beat([], "stop");
  assert.equal((await b.router.signOut()).url, "", "signing out forgets it");
});

test("a recording aveia closed for silence during a long outage starts again with what was said meanwhile", async () => {
  const b = bench();
  await b.router.setTargets({ hive: false });
  await b.beat([b.line(1)], "start");
  b.net.down = true;
  b.clock.at += 4000;
  await b.beat([b.line(2)]);
  b.clock.at += 60000;
  b.net.down = false;
  b.net.recording = false;
  const back = await b.beat([b.line(3)]);
  assert.equal(b.net.meetings, 2, "the server had given the first one up, so a new one is opened");
  assert.deepEqual(b.net.posts().slice(-2).map((call) => `${call.body.command}:${call.body.lines.length}:${call.body.title}`), [":2:", "start:2:Planejamento"]);
  assert.deepEqual([...b.net.lines.keys()], ["abcd-1", "abcd-2", "abcd-3"], "nothing said during the outage is lost");
  assert.equal(back.recording, true, "the person keeps recording without doing anything");
  assert.equal(back.destinations.aveia.pending, 0);
  assert.equal(back.destinations.aveia.accepted, 3);

  const slept = bench();
  await slept.router.setTargets({ hive: false });
  await slept.beat([slept.line(1)], "start");
  slept.net.recording = false;
  const net = fakeAveia();
  const woke = createRouter({ origins, askHive: slept.hive.ask, fetch: net.fetch, storage: slept.storage, memory: slept.memory, now: () => slept.clock.at + 120000, defer: () => 0, undefer: () => {} });
  const said = await woke.beat({ captions: true, inCall: true, lines: [slept.line(2)], command: "", tab: 7 });
  assert.equal(net.posts().at(-1).body.command, "start", "a background that slept through the silence does the same");
  assert.deepEqual([...net.lines.keys()], ["abcd-2"]);
  assert.equal(said.recording, true);

  const stopped = bench();
  await stopped.router.setTargets({ hive: false });
  await stopped.beat([stopped.line(1)], "start");
  stopped.clock.at += 4000;
  stopped.net.recording = false;
  const ended = await stopped.beat([stopped.line(2)]);
  assert.equal(stopped.net.meetings, 1, "a recording ended somewhere else while the extension was talking stays ended");
  assert.equal(ended.recording, false);
  assert.equal(ended.destinations.aveia.pending, 0);
});

test("a background that was put to sleep wakes up with the queue it had", async () => {
  const b = bench();
  await b.router.setTargets({ hive: false });
  b.net.down = true;
  await b.beat([b.line(1), b.line(2)], "start");
  const net = fakeAveia();
  const woke = createRouter({ origins, askHive: b.hive.ask, fetch: net.fetch, storage: b.storage, memory: b.memory, now: () => b.clock.at + 60000, defer: () => 0, undefer: () => {} });
  const said = await woke.beat({ captions: true, inCall: true, lines: [], command: "" });
  assert.deepEqual([...net.lines.keys()], ["abcd-1", "abcd-2"]);
  assert.equal(said.destinations.aveia.recording, true);
  assert.equal(said.destinations.hive.enabled, false, "what was unticked stays unticked");
});

test("the queue holds the newest four thousand lines and a line that grew replaces itself", () => {
  const queue = createQueue();
  for (let n = 0; n < QUEUE_MAX + 10; n++) queue.add({ key: `k-${n}`, speaker: "a", text: "x", seenAt: n });
  assert.equal(queue.size, QUEUE_MAX);
  assert.equal(queue.peek(1)[0].key, "k-10");
  const small = createQueue();
  small.add({ key: "k-1", text: "oi" });
  const sent = small.peek(200);
  small.add({ key: "k-1", text: "oi, tudo bem" });
  small.settle(sent);
  assert.equal(small.size, 1, "what grew while the batch travelled is sent again");
  small.settle(small.peek(200));
  assert.equal(small.size, 0);
});

test("a 401 from aveia disconnects it and nothing more is sent until the person connects again", async () => {
  const b = bench();
  await b.beat([], "start");
  await b.beat([b.line(1)]);
  b.net.status = 401;
  const refused = await b.beat([b.line(2)]);
  assert.equal(refused.destinations.aveia.available, false);
  assert.equal(refused.destinations.aveia.expired, true);
  assert.equal(b.storage.held.aveia.token, "", "a token that was refused is thrown away");
  assert.equal(refused.destinations.hive.recording, true, "the hive keeps recording");
  const before = b.net.calls.length;
  b.clock.at += 120000;
  await b.beat([b.line(3)]);
  await b.beat([b.line(4)]);
  await b.router.look({ refresh: true });
  assert.equal(b.net.calls.length, before, "not one more request");
  assert.deepEqual([...b.hive.lines.keys()], ["abcd-1", "abcd-2", "abcd-3", "abcd-4"]);

  b.net.status = 200;
  await b.storage.set({ aveia: { baseUrl: "https://aveia.example", token: `${TOKEN}_new`, email: "lia.moreira@aveia.example" } });
  const again = await b.router.accountChanged();
  assert.equal(again.destinations.aveia.available, true);
  await b.beat([]);
  assert.equal(b.net.posts().at(-1).auth, `Bearer ${TOKEN}_new`);
  assert.deepEqual([...b.net.lines.keys()], ["abcd-1", "abcd-2", "abcd-3", "abcd-4"], "what was said meanwhile was kept and arrives");

  const me = bench();
  me.net.status = 401;
  const said = await me.beat([]);
  assert.equal(said.destinations.aveia.available, false, "a token refused when asking who it is disconnects too");
  assert.equal(me.storage.held.aveia.token, "");
});

test("aveia is only ever spoken to at its own address or a local one", async () => {
  assert.equal(originOf("https://aveia.example/conectar-extensao"), "https://aveia.example");
  assert.equal(originOf("http://localhost:3000/x"), "http://localhost:3000");
  assert.equal(originOf("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  for (const bad of ["https://aveia.example.evil.com", "http://aveia.example", "https://localhost:3000", "https://evil.com", "http://user:pw@localhost:3000", "javascript:alert(1)", "", null]) assert.equal(originOf(bad), "", String(bad));
  const b = bench();
  await b.storage.set({ aveia: { baseUrl: "https://evil.example", token: TOKEN } });
  await b.router.accountChanged();
  await b.beat([], "start");
  assert.ok(b.net.calls.length > 0);
  assert.ok(b.net.calls.every((call) => call.url.startsWith("https://aveia.example/")), "a strange address stored falls back to the real one");
});

function fakePage(origin) {
  const page = { location: { origin }, posted: [], heard: [] };
  page.addEventListener = (kind, fn) => page.heard.push([kind, fn]);
  page.postMessage = (data, to) => page.posted.push([data, to]);
  return page;
}

test("the page hears that the extension is here even when its own script runs after the first announce", () => {
  const ready = [{ type: "aveia-extension-ready" }, "https://aveia.example"];
  const page = fakePage("https://aveia.example");
  const later = [];
  page.document = { readyState: "loading", addEventListener: (kind, fn) => later.push([kind, fn]) };
  listen({ page, storage: shelf(), originOf });
  assert.deepEqual(page.posted, [ready], "once right away, for a page that is already listening");
  assert.deepEqual(later.map(([kind]) => kind), ["DOMContentLoaded"]);
  later[0][1]();
  assert.deepEqual(page.posted, [ready, ready], "and again when the page's own scripts have run");
  const loaded = page.heard.find(([kind]) => kind === "load");
  loaded[1]();
  assert.equal(page.posted.length, 3, "and once more when everything has loaded");

  const parsed = fakePage("https://aveia.example");
  parsed.document = { readyState: "interactive", addEventListener: () => assert.fail("the document was already parsed") };
  listen({ page: parsed, storage: shelf(), originOf });
  assert.deepEqual(parsed.heard.map(([kind]) => kind), ["message", "load"]);

  const done = fakePage("https://aveia.example");
  done.document = { readyState: "complete", addEventListener: () => assert.fail("the document was already loaded") };
  listen({ page: done, storage: shelf(), originOf });
  assert.deepEqual(done.heard.map(([kind]) => kind), ["message"]);
  assert.deepEqual(done.posted, [ready]);
});

test("the token is taken only from aveia's own page, and the page is told it arrived", async () => {
  const page = fakePage("https://aveia.example");
  const storage = shelf();
  const heard = listen({ page, storage, originOf, now: () => 42 });
  assert.deepEqual(page.posted, [[{ type: "aveia-extension-ready" }, "https://aveia.example"]]);
  assert.equal(page.heard[0][0], "message");
  const handoff = { type: "aveia-extension-token", token: TOKEN, email: "lia.moreira@aveia.example", baseUrl: "https://aveia.example" };
  assert.equal(await heard({ source: page, origin: "https://evil.example", data: handoff }), false, "another origin");
  assert.equal(await heard({ source: {}, origin: "https://aveia.example", data: handoff }), false, "a frame inside the page");
  assert.equal(await heard({ source: page, origin: "https://aveia.example", data: { ...handoff, baseUrl: "https://evil.example" } }), false, "a token that asks to be sent somewhere else");
  assert.equal(await heard({ source: page, origin: "https://aveia.example", data: { ...handoff, token: "short" } }), false);
  assert.equal(await heard({ source: page, origin: "https://aveia.example", data: { ...handoff, type: "something-else" } }), false);
  assert.equal(await heard({ source: page, origin: "https://aveia.example", data: "aveia-extension-token" }), false);
  assert.deepEqual(storage.held, {});
  assert.equal(page.posted.length, 1);
  assert.equal(await heard({ source: page, origin: "https://aveia.example", data: handoff }), true);
  assert.deepEqual(storage.held.aveia, { baseUrl: "https://aveia.example", token: TOKEN, email: "lia.moreira@aveia.example", connectedAt: 42 });
  assert.deepEqual(page.posted[1], [{ type: "aveia-extension-connected" }, "https://aveia.example"]);
  assert.equal(JSON.stringify(page.posted).includes(TOKEN), false, "the token is never echoed back");

  assert.equal(listen({ page: fakePage("https://meet.google.com"), storage, originOf }), null, "on any other site it does not even listen");
  const local = fakePage("http://localhost:3000");
  assert.deepEqual(readHandoff({ source: local, origin: "http://localhost:3000", data: { type: "aveia-extension-token", token: TOKEN } }, local, originOf), { baseUrl: "http://localhost:3000", token: TOKEN, email: "" });
  assert.equal(readHandoff({ source: local, origin: "http://localhost:3000", data: { ...handoff } }, local, originOf), null, "a local page cannot hand a token for the real address");
});

test("the two manifests ask for the least they need and name files that are there", () => {
  const chrome = JSON.parse(readFileSync(join(EXT, "manifest.chrome.json"), "utf8"));
  const firefox = JSON.parse(readFileSync(join(EXT, "manifest.firefox.json"), "utf8"));
  for (const manifest of [chrome, firefox]) {
    assert.equal(manifest.name, "Aveia");
    assert.equal(manifest.version, "2.0.1");
    assert.deepEqual(Object.keys(manifest.icons), ["16", "32", "48", "128"]);
    const named = [...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((one) => one.js), ...(manifest.background.scripts || [manifest.background.service_worker]), (manifest.action || manifest.browser_action).default_popup];
    for (const file of named) assert.ok(existsSync(join(EXT, file)), file);
    assert.equal(manifest.homepage_url, AVEIA_MARK);
    assert.deepEqual(manifest.content_scripts.map((one) => one.matches), [["https://meet.google.com/*"], [`${AVEIA_MARK}/*`]]);
  }
  assert.deepEqual(chrome.permissions, ["storage", "nativeMessaging"]);
  assert.deepEqual(chrome.host_permissions, ["https://meet.google.com/*", `${AVEIA_MARK}/*`]);
  assert.deepEqual(chrome.optional_host_permissions, ["http://localhost/*", "http://127.0.0.1/*"]);
  assert.deepEqual(firefox.permissions, ["storage", "nativeMessaging", "https://meet.google.com/*", `${AVEIA_MARK}/*`]);
  assert.deepEqual(firefox.optional_permissions, ["http://localhost/*", "http://127.0.0.1/*"]);
  assert.equal(firefox.browser_specific_settings.gecko.id, "meet-captions@hive.dev");
  assert.equal(firefox.optional_host_permissions, undefined);
  const png = readFileSync(join(EXT, "icons", "icon-128.png"));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 128);
});

const everyFile = (dir) => readdirSync(dir, { withFileTypes: true, recursive: true }).filter((one) => one.isFile()).map((one) => join(one.parentPath, one.name));

function setUp(aveia) {
  const root = mkdtempSync(join(tmpdir(), "hive-aveia-ext-"));
  const userHome = join(root, "user");
  mkdirSync(join(userHome, ".config/google-chrome"), { recursive: true });
  mkdirSync(join(userHome, ".mozilla"), { recursive: true });
  const done = installCaptionBridge({ home: join(root, ".hive"), assets: join(HERE, "assets", "meet-captions"), sock: "/tmp/h.sock", nodePath: "/usr/bin/node", asNode: false, platform: "linux", userHome, run: () => true, ...(aveia === undefined ? {} : { aveia }) });
  return { root, done };
}

test("the code names no address: a mark stands where aveia's goes, and an unbuilt copy has no aveia at all", () => {
  assert.equal(AVEIA_MARK, "__AVEIA_ORIGIN__");
  assert.match(readFileSync(join(EXT, "aveia-origin.js"), "utf8"), /const BUILT_FOR = "__AVEIA_ORIGIN__";/);
  for (const file of CAPTION_FILES.filter((name) => name !== "aveia-origin.js")) assert.equal(readFileSync(join(EXT, file), "utf8").includes(AVEIA_MARK), false, file);
  assert.equal(unbuilt.DEFAULT_BASE, "");
  assert.equal(unbuilt.originOf(AVEIA), "");
  assert.equal(unbuilt.originOf("https://__aveia_origin__"), "");
  assert.equal(unbuilt.originOf("http://localhost:3000/x"), "http://localhost:3000");
  assert.equal(origins.DEFAULT_BASE, AVEIA);
  assert.equal(aveiaOriginOf("https://aveia.example/"), AVEIA);
  assert.equal(aveiaOriginOf(" https://aveia.example/conectar-extensao "), AVEIA);
  for (const bad of ["http://aveia.example", "aveia.example", "https://user:pw@aveia.example", "javascript:alert(1)", "", null, undefined]) assert.equal(aveiaOriginOf(bad), "", String(bad));
  assert.equal(pointAtAveia(`a ${AVEIA_MARK}/* b ${AVEIA_MARK}`, "https://aveia.example/"), `a ${AVEIA}/* b ${AVEIA}`);
  assert.equal(pointAtAveia(`"${AVEIA_MARK}"`, "http://aveia.example"), '""', "an address that is not https is no address");
});

test("setting the extension up from the hive writes the configured address where the mark was", () => {
  const { root, done } = setUp("https://aveia.example/");
  try {
    for (const dir of [done.chromeDir, done.firefoxDir]) {
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const named = [...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((one) => one.js), ...(manifest.background.scripts || [manifest.background.service_worker, "aveia-origin.js", "destinations.js"]), "popup.html", "popup.js", "popup.css"];
      for (const file of named) assert.ok(existsSync(join(dir, file)), `${dir}: ${file}`);
      assert.equal(manifest.homepage_url, AVEIA);
      assert.deepEqual(manifest.content_scripts.map((one) => one.matches), [["https://meet.google.com/*"], ["https://aveia.example/*"]]);
      assert.deepEqual(manifest.content_scripts[1].js, ["aveia-origin.js", "aveia-connect.js"]);
      assert.ok((manifest.host_permissions || manifest.permissions).includes("https://aveia.example/*"));
      for (const file of everyFile(dir)) assert.equal(readFileSync(file).includes(AVEIA_MARK), false, `${file} still carries the mark`);
      const built = load(join(dir, "aveia-origin.js"));
      assert.equal(built.DEFAULT_BASE, AVEIA);
      assert.equal(built.originOf("https://aveia.example/conectar-extensao"), AVEIA);
    }
    assert.ok(JSON.parse(readFileSync(join(done.chromeDir, "manifest.json"), "utf8")).key, "the manual install keeps the key that fixes its id");
    for (const file of CAPTION_FILES) assert.ok(existsSync(join(EXT, file)), file);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("with no address configured the extension is set up for the hive alone, with nothing of aveia's left in the manifest", () => {
  for (const nothing of [undefined, "", "http://aveia.example", "not an address"]) {
    const { root, done } = setUp(nothing);
    try {
      assert.equal(done.ok, true);
      assert.equal(done.chrome.ready, true);
      const chrome = JSON.parse(readFileSync(join(done.chromeDir, "manifest.json"), "utf8"));
      const firefox = JSON.parse(readFileSync(join(done.firefoxDir, "manifest.json"), "utf8"));
      for (const manifest of [chrome, firefox]) {
        assert.equal("homepage_url" in manifest, false);
        assert.deepEqual(manifest.content_scripts, [{ matches: ["https://meet.google.com/*"], js: ["caption-parse.js", "caption-language.js", "content.js"], run_at: "document_idle" }]);
        assert.equal(manifest.version, "2.0.1");
        assert.equal(manifest.name, HIVE_ONLY_NAME);
      }
      assert.deepEqual(chrome.host_permissions, ["https://meet.google.com/*"]);
      assert.deepEqual(chrome.optional_host_permissions, ["http://localhost/*", "http://127.0.0.1/*"]);
      assert.ok(chrome.key);
      assert.deepEqual(firefox.permissions, ["storage", "nativeMessaging", "https://meet.google.com/*"]);
      assert.equal(firefox.browser_specific_settings.gecko.id, "meet-captions@hive.dev");
      for (const dir of [done.chromeDir, done.firefoxDir]) {
        for (const file of everyFile(dir)) assert.equal(readFileSync(file).includes(AVEIA_MARK), false, `${file} still carries the mark`);
        const built = load(join(dir, "aveia-origin.js"));
        assert.equal(built.DEFAULT_BASE, "");
        assert.equal(built.originOf(AVEIA), "");
        assert.equal(built.originOf("http://127.0.0.1:8080"), "http://127.0.0.1:8080", "a local aveia can still be connected by who develops it");
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const pruned = JSON.parse(manifestFor(JSON.stringify({ a: AVEIA_MARK, list: ["x", `${AVEIA_MARK}/*`], content_scripts: [{ matches: [`${AVEIA_MARK}/*`], js: ["a.js"] }], kept: { matches: ["x"] } }), ""));
  assert.deepEqual(pruned, { list: ["x"], content_scripts: [], kept: { matches: ["x"] }, name: HIVE_ONLY_NAME, description: HIVE_ONLY_DESCRIPTION });
});

test("an extension built without an aveia is named for the hive, and one built for an aveia keeps the aveia name", () => {
  for (const file of ["manifest.chrome.json", "manifest.firefox.json"]) {
    const text = readFileSync(join(EXT, file), "utf8");
    const alone = JSON.parse(manifestFor(text, ""));
    assert.equal(alone.name, HIVE_ONLY_NAME, `${file} still calls itself Aveia with no Aveia in it`);
    assert.equal((alone.action || alone.browser_action).default_title, HIVE_ONLY_NAME);
    assert.doesNotMatch(alone.description, /Aveia/);
    const paired = JSON.parse(manifestFor(text, "https://aveia.example.com"));
    assert.equal(paired.name, "Aveia");
  }
});

test("an extension with no aveia address records in the hive and never speaks to the network", async () => {
  const b = bench({ connected: false, places: unbuilt });
  const idle = await b.router.look({ refresh: true });
  assert.equal(idle.destinations.aveia.configured, false);
  assert.equal(idle.destinations.aveia.available, false);
  assert.equal(idle.destinations.aveia.connectUrl, "", "there is nowhere to send the person to sign in");
  assert.equal(idle.destinations.aveia.baseUrl, "");
  const started = await b.beat([], "start");
  assert.equal(started.recording, true);
  const said = await b.beat([b.line(1)]);
  assert.deepEqual([...b.hive.lines.keys()], ["abcd-1"]);
  assert.equal(said.destinations.hive.accepted, 1);
  assert.equal(b.net.calls.length, 0);

  const stale = bench({ connected: true, places: unbuilt });
  const kept = await stale.beat([stale.line(1)], "start");
  assert.equal(kept.destinations.aveia.configured, false, "an account stored for an address this build does not know is not used");
  assert.equal(kept.destinations.aveia.available, false);
  assert.equal(stale.net.calls.length, 0, "and its token goes nowhere");

  const local = bench({ connected: false, places: unbuilt });
  await local.storage.set({ aveia: { baseUrl: "http://localhost:3000", token: TOKEN } });
  const dev = await local.router.accountChanged();
  assert.equal(dev.destinations.aveia.configured, true);
  assert.equal(dev.destinations.aveia.connectUrl, "http://localhost:3000/conectar-extensao");
  assert.ok(local.net.calls.length > 0);
  assert.ok(local.net.calls.every((call) => call.url.startsWith("http://localhost:3000/")));

  assert.equal((await bench().router.look()).destinations.aveia.configured, true);
  const content = readFileSync(join(EXT, "content.js"), "utf8");
  assert.match(content, /ui\.aveia\.box\.hidden = aveia\.configured === false;/);
  assert.match(content, /\.opt\[hidden\] \{ display: none; \}/);
  assert.match(content, /nowhereHive: "Para gravar, abra o Hive neste computador\."/);
  const popup = readFileSync(join(EXT, "popup.js"), "utf8");
  assert.match(popup, /aveia\.configured === false \? SAY\.aveiaOff/);
  assert.match(popup, /aveiaOff: "Esta instalação não tem um endereço do Aveia configurado\. Grave pelo Hive\."/);
});

const canZip = ["zip", "unzip"].every((tool) => spawnSync(tool, ["-v"], { stdio: "ignore" }).status === 0);
const inZip = (zip, file) => execFileSync("unzip", ["-p", zip, file], { encoding: "utf8", maxBuffer: 1 << 24 });
const namesIn = (zip) => execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter((name) => name && !name.endsWith("/")).sort();

test("the store packages are built with the address handed in, without the mark and without chrome's key", { skip: !canZip && "zip and unzip are not on this machine" }, () => {
  const out = mkdtempSync(join(tmpdir(), "hive-aveia-pack-"));
  try {
    const done = pack({ address: "https://aveia.example/", out, env: {} });
    assert.equal(done.ok, true, done.error);
    assert.equal(done.aveia, AVEIA);
    assert.equal(done.version, "2.0.1");
    assert.deepEqual(readdirSync(out).sort(), ["aveia-chrome-2.0.1.zip", "aveia-firefox-2.0.1.zip", "firefox-2.0.1"]);
    const chrome = JSON.parse(inZip(done.chrome, "manifest.json"));
    const firefox = JSON.parse(inZip(done.firefox, "manifest.json"));
    assert.equal("key" in chrome, false, "the store refuses a manifest with a key");
    assert.equal(chrome.manifest_version, 3);
    assert.equal(firefox.manifest_version, 2);
    assert.deepEqual(chrome.host_permissions, ["https://meet.google.com/*", "https://aveia.example/*"]);
    assert.deepEqual(firefox.permissions, ["storage", "nativeMessaging", "https://meet.google.com/*", "https://aveia.example/*"]);
    assert.deepEqual(firefox, JSON.parse(readFileSync(join(done.firefoxDir, "manifest.json"), "utf8")));
    const expected = [...CAPTION_FILES, "manifest.json", ...readdirSync(join(EXT, "icons")).map((name) => `icons/${name}`)].sort();
    for (const zip of [done.chrome, done.firefox]) {
      assert.deepEqual(namesIn(zip), expected, zip);
      assert.equal(JSON.parse(inZip(zip, "manifest.json")).homepage_url, AVEIA);
      assert.match(inZip(zip, "aveia-origin.js"), /const BUILT_FOR = "https:\/\/aveia\.example";/);
      for (const file of namesIn(zip)) assert.equal(execFileSync("unzip", ["-p", zip, file]).includes(AVEIA_MARK), false, `${zip}: ${file}`);
    }
    assert.deepEqual(everyFile(done.firefoxDir).map((file) => file.slice(done.firefoxDir.length + 1)).sort(), expected);

    assert.equal(pack({ out, env: { HIVE_AVEIA_URL: "https://other.example" }, repo: join(out, "nowhere") }).aveia, "https://other.example");
    const repo = join(out, "repo");
    mkdirSync(join(repo, "acme"), { recursive: true });
    mkdirSync(join(repo, "app"), { recursive: true });
    writeFileSync(join(repo, "acme", "hive.defaults"), "HIVE_NAMESPACE=acme\nHIVE_AVEIA_URL=https://aveia.acme.example\n");
    assert.equal(deploymentAddress(repo), "https://aveia.acme.example");
    assert.equal(pack({ out, env: {}, repo }).aveia, "https://aveia.acme.example", "with nothing asked, the deployment file in the checkout says where");
    assert.equal(pack({ address: "https://asked.example", out, env: { HIVE_AVEIA_URL: "https://other.example" }, repo }).aveia, "https://asked.example", "what is asked wins");
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("a store package is never built without an address or somewhere to put it", () => {
  const out = mkdtempSync(join(tmpdir(), "hive-aveia-pack-"));
  try {
    assert.match(pack({ out, env: {}, repo: join(out, "nowhere") }).error, /no Aveia address/);
    assert.match(pack({ address: "http://aveia.example", out, env: {} }).error, /not an https address/);
    assert.match(pack({ address: AVEIA, env: {} }).error, /no output folder/);
    assert.deepEqual(readdirSync(out), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the button on the call lives in its own shadow, names both destinations and never touches the token", () => {
  const content = readFileSync(join(EXT, "content.js"), "utf8");
  assert.match(content, /attachShadow\(\{ mode: "closed" \}\)/);
  assert.match(content, /start: "Gravar", recordingNow: "Gravando", stop: "Parar e gerar notas"/);
  assert.match(content, /Avise quem está na chamada\. Ninguém além de você vê que a reunião está sendo gravada\./);
  assert.match(content, /Não encontrei o Hive neste computador\. Só quem tem o app instalado grava nele\./);
  assert.match(content, /aveiaSignIn: "Entre no Aveia para conectar"/);
  assert.match(content, /:focus-visible \{ outline: 3px solid/);
  assert.doesNotMatch(content, /token|storage\.|innerHTML/, "the call's page side knows nothing about the token");
  const background = readFileSync(join(EXT, "background.js"), "utf8");
  assert.match(background, /connectNative\(HOST\)/);
  assert.match(background, /const HOST = "dev\.hive\.captions";/);
  for (const file of ["background.js", "destinations.js", "aveia-connect.js", "content.js", "popup.js"]) assert.doesNotMatch(readFileSync(join(EXT, file), "utf8"), /console\./, `${file} writes nothing to the log`);
});

test("a language name is compared without the beta badge, accents or case, and only a whole name counts", () => {
  assert.equal(tongue.normalize("Português (Brasil)BETA"), "portugues (brasil)");
  assert.equal(tongue.normalize("  INGLÊS   beta "), "ingles");
  assert.equal(tongue.normalize("Espanhol(México)"), "espanhol (mexico)");
  assert.equal(tongue.codeOf("Português (Brasil)"), "pt-BR");
  assert.equal(tongue.codeOf("Portuguese (Brazil) BETA"), "pt-BR");
  assert.equal(tongue.codeOf("Inglês"), "en");
  assert.equal(tongue.codeOf("english"), "en");
  assert.equal(tongue.codeOf("Inglês (Reino Unido)"), "", "a variant is not the plain language");
  assert.equal(tongue.codeOf("Português (Portugal)"), "");
  assert.equal(tongue.codeOf("Espanhol (México)"), "es");
  assert.equal(tongue.codeOf("Alemão"), "");
  assert.equal(tongue.codeOf(""), "");
  assert.ok(tongue.rankOf("es", "Espanhol (Espanha)") < tongue.rankOf("es", "Espanhol (México)"));
  assert.equal(tongue.rankOf("keep", "Inglês"), -1);
});

test("the preference falls back to portuguese and says when the call's language has to change", () => {
  assert.equal(tongue.DEFAULT, "pt-BR");
  assert.deepEqual(tongue.CODES, ["pt-BR", "en", "es", "keep"]);
  assert.equal(tongue.prefOf(undefined), "pt-BR");
  assert.equal(tongue.prefOf("fr"), "pt-BR");
  assert.equal(tongue.prefOf("keep"), "keep");
  assert.equal(tongue.labelOf("pt-BR", true), "Português (Brasil)");
  assert.equal(tongue.labelOf("keep", true), "Não mexer no idioma do Meet");
  assert.equal(tongue.labelOf("en", false), "English");
  assert.equal(tongue.decide("pt-BR", "Inglês"), "switch");
  assert.equal(tongue.decide("pt-BR", "Português (Brasil)"), "same");
  assert.equal(tongue.decide("pt-BR", ""), "switch");
  assert.equal(tongue.decide("en", "Inglês (Reino Unido)"), "switch");
  assert.equal(tongue.decide("es", "Spanish (Mexico)"), "same", "any accepted spanish is left alone");
  assert.equal(tongue.decide("keep", "Inglês"), "keep");
  assert.equal(tongue.needsSwitch("keep", "Alemão"), false);
  assert.equal(tongue.needsSwitch(undefined, "English"), true);
  assert.equal(tongue.pickOption("en", ["Inglês (Reino Unido)", "Inglês (Índia)BETA", "Inglês"]), 2);
  assert.equal(tongue.pickOption("es", ["Espanhol (México)", "Alemão", "Espanhol (Espanha) BETA"]), 2);
  assert.equal(tongue.pickOption("es", ["Espanhol (México)", "Alemão"]), 0);
  assert.equal(tongue.pickOption("pt-BR", ["Português (Portugal)", "Inglês"]), -1);
});

class FakeNode {
  constructor(tag, attrs = {}, kids = []) {
    this.nodeType = tag === "#text" ? 3 : 1;
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.childNodes = [];
    this.parentElement = null;
    this.nodeValue = "";
    this.heard = {};
    this.clicks = 0;
    for (const kid of kids) this.add(kid);
  }
  add(kid) {
    const node = typeof kid === "string" ? Object.assign(new FakeNode("#text"), { nodeValue: kid }) : kid;
    node.parentElement = this;
    this.childNodes.push(node);
    return node;
  }
  empty() { this.childNodes = []; }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  contains(other) { for (let at = other; at; at = at.parentElement) if (at === this) return true; return false; }
  on(kind, fn) { this.heard[kind] = fn; return this; }
  dispatchEvent(event) { for (let at = this; at; at = at.parentElement) if (at.heard[event.type]) at.heard[event.type](event); return true; }
  click() { this.clicks += 1; this.dispatchEvent({ type: "click" }); }
  matches(selector) {
    return selector.split(",").some((one) => {
      const found = /^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/.exec(one.trim());
      if (!found || this.nodeType !== 1) return false;
      const [, tag, name, value] = found;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (name && !(name in this.attrs)) return false;
      return value === undefined || this.attrs[name] === value;
    });
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => { for (const kid of node.childNodes) { if (kid.matches(selector)) found.push(kid); walk(kid); } };
    walk(this);
    return found;
  }
}

const el = (tag, attrs, kids) => new FakeNode(tag, attrs, kids);

const MEET_LANGUAGES = ["Africâner (África do Sul)|BETA", "Alemão", "Chinês, mandarim (simplificado)", "Coreano", "Espanhol (Espanha)", "Espanhol (México)", "Francês", "Hindi|BETA", "Inglês", "Inglês (Austrália)|BETA", "Inglês (Índia)|BETA", "Inglês (Reino Unido)", "Italiano", "Japonês", "Neerlandês", "Português (Brasil)", "Português (Portugal)|BETA", "Russo", "Turco|BETA", "Vietnamita|BETA"];

function fakeMeet({ shown = "Inglês", languages = MEET_LANGUAGES, picker = "popup", escape = true, virtual = true, deaf = false } = {}) {
  const meet = { shown, open: false, picked: [], closedBy: "" };
  const body = el("body");
  const doc = { body, defaultView: { KeyboardEvent: class { constructor(type, init) { Object.assign(this, init, { type }); } }, MouseEvent: class { constructor(type, init) { Object.assign(this, init, { type }); } } } };
  doc.querySelectorAll = (selector) => body.querySelectorAll(selector);
  const name = el("span", {}, [shown]);
  const attrs = picker === "popup" ? { "aria-haspopup": "listbox", "aria-label": "Idioma da reunião" } : picker === "combobox" ? { role: "combobox" } : {};
  const pill = el(picker === "combobox" ? "div" : "button", attrs, [el("i", {}, ["language"]), name, el("i", {}, ["arrow_drop_down"])]);
  const list = el("ul", { role: "listbox" });
  const ROW = 40;
  const SEEN = 5;
  let top = 0;
  const draw = () => {
    list.empty();
    const from = virtual ? Math.floor(top / ROW) : 0;
    const rows = virtual ? languages.slice(from, from + SEEN) : languages;
    for (const row of rows) {
      const [label, badge] = row.split("|");
      const option = el("li", { role: "option" }, [el("span", {}, [label]), ...(badge ? [el("span", {}, [badge])] : [])]);
      option.on("click", () => { meet.picked.push(label); if (!deaf) { meet.shown = label; name.childNodes[0].nodeValue = label; } close("option"); });
      list.add(option);
    }
  };
  Object.defineProperty(list, "scrollTop", { get: () => top, set: (to) => { top = Math.max(0, Math.min(to, Math.max(0, languages.length * ROW - SEEN * ROW))); draw(); } });
  Object.defineProperty(list, "scrollHeight", { get: () => languages.length * ROW });
  Object.defineProperty(list, "clientHeight", { get: () => SEEN * ROW });
  const layer = el("div");
  function close(how) { if (!meet.open) return; meet.open = false; meet.closedBy = how; layer.empty(); }
  pill.on("click", () => {
    if (meet.open) return close("picker");
    meet.open = true;
    top = Math.max(0, languages.findIndex((row) => row.split("|")[0] === meet.shown)) * ROW;
    list.scrollTop = top;
    layer.add(list);
  });
  body.on("keydown", (event) => { if (escape && event.key === "Escape") close("escape"); });
  const captions = el("div", { role: "region", "aria-label": "Legendas" }, [el("div", {}, ["Caio", "bom dia, pessoal"])]);
  const toggle = el("button", { "aria-label": "Desativar legendas" }, ["closed_caption"]);
  const stage = el("div", { tabindex: "-1" }, [el("button", { "aria-label": "Sair da chamada" }, ["call_end"]), toggle, captions, pill]);
  body.add(stage);
  body.add(layer);
  return { meet, doc, pill, list };
}

const now = async () => {};

test("on a call in english the picker is found, opened, scrolled and set to portuguese", async () => {
  for (const picker of ["popup", "combobox", "text"]) {
    const call = fakeMeet({ picker });
    const found = tongue.findPicker(call.doc);
    assert.equal(found.el, call.pill, picker);
    assert.equal(found.shown, "Inglês", "the globe and the arrow are not the language");
    const done = await tongue.setLanguage(call.doc, "pt-BR", { wait: now });
    assert.deepEqual(done, { state: "switched", shown: "Português (Brasil)" }, picker);
    assert.deepEqual(call.meet.picked, ["Português (Brasil)"]);
    assert.equal(call.meet.open, false);
    assert.equal(call.pill.clicks, 1, "the picker was clicked once and the option closed it");
    assert.deepEqual(await tongue.setLanguage(call.doc, "pt-BR", { wait: now }), { state: "same", shown: "Português (Brasil)" });
    assert.equal(call.pill.clicks, 1, "a call already in the right language is left alone");
  }
});

test("each preference picks its own option and the plain name never takes a variant", async () => {
  const english = fakeMeet({ shown: "Inglês (Reino Unido)" });
  assert.equal((await tongue.setLanguage(english.doc, "en", { wait: now })).state, "switched");
  assert.deepEqual(english.meet.picked, ["Inglês"]);

  const spanish = fakeMeet({ shown: "Português (Brasil)" });
  assert.equal((await tongue.setLanguage(spanish.doc, "es", { wait: now })).state, "switched");
  assert.deepEqual(spanish.meet.picked, ["Espanhol (Espanha)"], "spain comes before mexico, even opening the list below both");

  const mexico = fakeMeet({ shown: "Vietnamita", languages: MEET_LANGUAGES.filter((row) => row !== "Espanhol (Espanha)") });
  assert.equal((await tongue.setLanguage(mexico.doc, "es", { wait: now })).state, "switched");
  assert.deepEqual(mexico.meet.picked, ["Espanhol (México)"], "without spain the list is walked whole and mexico is taken");

  const beta = fakeMeet({ languages: MEET_LANGUAGES.map((row) => (row === "Português (Brasil)" ? "Português (Brasil)|BETA" : row)) });
  assert.equal((await tongue.setLanguage(beta.doc, "pt-BR", { wait: now })).state, "switched", "the beta badge does not hide the option");

  const whole = fakeMeet({ virtual: false });
  assert.equal((await tongue.setLanguage(whole.doc, "pt-BR", { wait: now })).state, "switched");

  const kept = fakeMeet();
  assert.deepEqual(await tongue.setLanguage(kept.doc, "keep", { wait: now }), { state: "keep" });
  assert.equal(kept.pill.clicks, 0, "asked to leave the language alone, nothing is touched");
});

test("when the language cannot be set the picker is closed again and the failure is told", async () => {
  const without = MEET_LANGUAGES.filter((row) => row !== "Português (Brasil)");
  const missing = fakeMeet({ languages: without });
  assert.deepEqual(await tongue.setLanguage(missing.doc, "pt-BR", { wait: now }), { state: "no-option", shown: "Inglês" });
  assert.equal(missing.meet.open, false);
  assert.equal(missing.meet.closedBy, "escape");
  assert.deepEqual(missing.meet.picked, []);

  const stubborn = fakeMeet({ languages: without, escape: false });
  assert.equal((await tongue.setLanguage(stubborn.doc, "pt-BR", { wait: now })).state, "no-option");
  assert.equal(stubborn.meet.closedBy, "picker", "a list that ignores escape is closed by its own picker");

  const endless = fakeMeet({ shown: "Idioma 3", languages: [...Array.from({ length: 400 }, (_, n) => `Idioma ${n}`), "Inglês", "Português (Brasil)"] });
  let waits = 0;
  assert.equal((await tongue.setLanguage(endless.doc, "pt-BR", { wait: async () => { waits += 1; }, scrolls: 5 })).state, "no-option", "the search gives up after a set number of scrolls");
  assert.ok(waits < 20, `it waited ${waits} times`);
  assert.equal(endless.meet.open, false);

  const deaf = fakeMeet({ deaf: true });
  assert.deepEqual(await tongue.setLanguage(deaf.doc, "pt-BR", { wait: now }), { state: "unsure", shown: "Inglês", picked: "Português (Brasil)" }, "a click the call ignored is not counted as done");

  const bare = fakeMeet();
  bare.pill.parentElement.childNodes.pop();
  assert.equal(tongue.findPicker(bare.doc), null, "the captions, their button and the call's frame are not the picker");
  assert.deepEqual(await tongue.setLanguage(bare.doc, "pt-BR", { wait: now }), { state: "no-picker" });
});

test("the preference lives in the background and reaches the call's menu and the popup", () => {
  const content = readFileSync(join(EXT, "content.js"), "utf8");
  assert.match(content, /language: "Idioma das legendas", languageStuck: "Não consegui mudar o idioma das legendas\. Troque no seletor do Meet, no canto inferior esquerdo\."/);
  assert.match(content, /const LANGUAGE_TRIES = 4;/);
  assert.match(content, /languageTries >= LANGUAGE_TRIES/);
  assert.match(content, /type: "aveia-language"/);
  const background = readFileSync(join(EXT, "background.js"), "utf8");
  assert.match(background, /"aveia-language":/);
  assert.match(background, /storage\.local\.set\(\{ captionLanguage: tongue\.prefOf\(message\.language\) \}\)/);
  const popup = readFileSync(join(EXT, "popup.js"), "utf8");
  assert.match(popup, /storage\.local\.set\(\{ captionLanguage:/);
  assert.match(readFileSync(join(EXT, "popup.html"), "utf8"), /<script src="caption-language\.js"><\/script>\n<script src="popup\.js">/);
  for (const name of ["manifest.chrome.json", "manifest.firefox.json"]) {
    const manifest = JSON.parse(readFileSync(join(EXT, name), "utf8"));
    assert.deepEqual(manifest.content_scripts[0].js, ["caption-parse.js", "caption-language.js", "content.js"]);
  }
  assert.ok(CAPTION_FILES.includes("caption-language.js"));
  assert.doesNotMatch(readFileSync(join(EXT, "caption-language.js"), "utf8"), /console\.|innerHTML|\/\/ |\/\*/);
});

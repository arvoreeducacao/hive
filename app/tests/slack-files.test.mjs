import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ONLY_ATTACHED, createSlackBridge } from "../lib/slack-bridge.mjs";
import { FILES_DAYS, filesFolder, slackFileUrl, sweepFiles } from "../lib/slack-files.mjs";

const JONAS = "U0748LXRG48";
const BOT = "U0C35AT9TQW";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const SHOT_URL = "https://files.slack.com/files-pri/T024-F0PRINT01/download/print.png";
const shot = (over = {}) => ({ id: "F0PRINT01", name: "print.png", mimetype: "image/png", size: PNG.length, url_private_download: SHOT_URL, ...over });

class FakeSocket {
  constructor() { this.listeners = new Map(); }
  on(kind, fn) { this.listeners.set(kind, fn); return this; }
  send() {}
  close() {}
}

function stage({ keys = { bot: "xoxb-test", app: "xapp-test", people: [JONAS] }, replies = [], says = () => ({ ok: true }), download = () => ({ status: 200, type: "image/png", bytes: PNG }), relay = null } = {}) {
  const home = mkdtempSync(join(tmpdir(), "hive-slack-files-"));
  const downloads = [];
  const relayed = [];
  const opened = [];
  const fetchImpl = async (url, options) => {
    if (String(url).startsWith("https://files.slack.com/")) {
      downloads.push({ url, token: options.headers.authorization, redirect: options.redirect });
      const got = download(url);
      return { status: got.status, headers: new Headers({ "content-type": got.type }), arrayBuffer: async () => got.bytes };
    }
    if (String(url).endsWith("/file")) {
      downloads.push({ url, token: options.headers.authorization, body: JSON.parse(options.body) });
      const got = relay(JSON.parse(options.body));
      return { status: 200, headers: new Headers({ "content-type": got.type }), json: async () => got.json, arrayBuffer: async () => got.bytes };
    }
    const method = String(url).split("/").pop();
    if (method === "auth.test") return { json: async () => ({ ok: true, user_id: BOT, user: "hive" }) };
    if (method === "apps.connections.open") return { json: async () => ({ ok: true, url: "wss://slack/socket" }) };
    if (method === "users.info") return { json: async () => ({ ok: true, user: { profile: { display_name: "Ada" } } }) };
    if (method === "conversations.info") return { json: async () => ({ ok: true, channel: { name: "time" } }) };
    if (method === "conversations.replies") return { json: async () => ({ ok: true, messages: replies }) };
    return { json: async () => ({ ok: true }) };
  };
  const bridge = createSlackBridge({
    home,
    keysOf: () => keys,
    openChat: async (mission) => { opened.push(mission); return { name: "aurora", where: "local" }; },
    say: async (seat, text) => { relayed.push({ seat, text }); return says(seat, text); },
    socketImpl: FakeSocket,
    fetchImpl
  });
  return { home, bridge, downloads, relayed, opened };
}

const envelope = (event) => JSON.stringify({ type: "events_api", envelope_id: "e1", payload: { event } });
const savedAt = (home, channel, thread, ts) => join(filesFolder(home, channel, thread), `${ts}-F0PRINT01.png`);

test("a mention in a thread that opened with a print hands the chat the print, saved on this machine", async () => {
  const it = stage({
    replies: [
      { user: JONAS, ts: "1700000000.000100", text: "esse modal já tem transparência", files: [shot()] },
      { user: JONAS, ts: "1700000100.000200", text: `<@${BOT}> cc` }
    ]
  });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> cc`, ts: "1700000100.000200", thread_ts: "1700000000.000100", channel: "C0TEAM01" }));

  const path = savedAt(it.home, "C0TEAM01", "1700000000.000100", "1700000000.000100");
  assert.deepEqual(readFileSync(path), PNG);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(it.downloads, [{ url: SHOT_URL, token: "Bearer xoxb-test", redirect: "manual" }]);
  const prompt = it.opened[0].prompt;
  assert.match(prompt, /esse modal já tem transparência \(attached: print\.png\)/);
  assert.ok(prompt.includes(`- ${path} (print.png, from Ada)`));
  assert.match(prompt, /Open each one with your file-reading tool/);
});

test("a print dropped later in a bound thread reaches the chat, even with no text and no mention", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> olha isso`, ts: "1.1", channel: "C024" }));
  await it.bridge.take(envelope({ type: "message", subtype: "file_share", user: JONAS, text: "", ts: "2.2", thread_ts: "1.1", channel: "C024", files: [shot()] }));

  assert.equal(it.opened.length, 1);
  assert.equal(it.relayed.length, 1);
  assert.ok(it.relayed[0].text.includes(ONLY_ATTACHED));
  assert.ok(it.relayed[0].text.includes(savedAt(it.home, "C024", "1.1", "2.2")));
});

test("a mention that carries its own print opens the chat with it", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> o que é isso?`, ts: "3.3", channel: "C024", files: [shot()] }));
  assert.ok(it.opened[0].prompt.includes(savedAt(it.home, "C024", "3.3", "3.3")));
});

test("through the relay the image is asked by its place in the thread, never by a url", async () => {
  const it = stage({
    keys: { bot: "hsr1.a.b", app: "hsr1.a.b", people: [JONAS], api: "https://relay.test/api", files: "https://relay.test/file", relayed: true },
    relay: () => ({ type: "image/png", bytes: PNG })
  });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "3.3", channel: "C024", files: [shot()] }));
  assert.deepEqual(it.downloads, [{ url: "https://relay.test/file", token: "Bearer hsr1.a.b", body: { channel: "C024", thread: "3.3", ts: "3.3", file: "F0PRINT01" } }]);
  assert.ok(it.opened[0].prompt.includes(savedAt(it.home, "C024", "3.3", "3.3")));
});

test("an image the bot may not download is named to the chat as unseen, with the scope that is missing", async () => {
  const it = stage({
    keys: { bot: "hsr1.a.b", app: "hsr1.a.b", people: [JONAS], api: "https://relay.test/api", files: "https://relay.test/file", relayed: true },
    relay: () => ({ type: "application/json; charset=utf-8", json: { ok: false, error: "file_refused", needed: "files:read" } })
  });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "3.3", channel: "C024", files: [shot()] }));
  const prompt = it.opened[0].prompt;
  assert.match(prompt, /Do not guess what they show/);
  assert.match(prompt, /print\.png, from Ada: the Slack app is missing the files:read scope/);
  assert.equal(existsSync(filesFolder(it.home, "C024", "3.3")), false);
});

test("a relay that does not hand files yet is said plainly", async () => {
  const it = stage({
    keys: { bot: "hsr1.a.b", app: "hsr1.a.b", people: [JONAS], api: "https://relay.test/api", files: "https://relay.test/file", relayed: true },
    relay: () => ({ type: "application/json; charset=utf-8", json: { ok: false, error: "unknown_method" } })
  });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "3.3", channel: "C024", files: [shot()] }));
  assert.match(it.opened[0].prompt, /relay does not hand files over yet/);
});

test("slack sending the bot's own keys to a login page means files:read is missing", async () => {
  const it = stage({ download: () => ({ status: 302, type: "text/html", bytes: Buffer.from("<html>") }) });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "3.3", channel: "C024", files: [shot()] }));
  assert.match(it.opened[0].prompt, /missing the files:read scope/);
});

test("a file that is not an image, or that lives off slack's file host, is never downloaded", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({
    type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "3.3", channel: "C024",
    files: [shot({ id: "F1", name: "planilha.pdf", mimetype: "application/pdf" }), shot({ id: "F2", url_private_download: "https://evil.example/x.png" })]
  }));
  assert.equal(it.downloads.length, 0);
  assert.match(it.opened[0].prompt, /planilha\.pdf, from Ada: it is not an image/);
  assert.match(it.opened[0].prompt, /print\.png, from Ada: slack gave no address on its own file host/);
  assert.equal(slackFileUrl("https://files.slack.com.evil.example/x"), "");
});

test("a print already on this machine is not downloaded again when the thread gets a new chat", async () => {
  const it = stage({
    says: () => ({ ok: false, error: "that seat is not alive here anymore" }),
    replies: [
      { user: JONAS, ts: "1.0", text: "olha o modal", files: [shot()] },
      { user: JONAS, ts: "2.0", text: `<@${BOT}> vê` },
      { user: JONAS, ts: "3.0", text: "voltei" }
    ]
  });
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "app_mention", user: JONAS, text: `<@${BOT}> vê`, ts: "2.0", thread_ts: "1.0", channel: "C024" }));
  await it.bridge.take(envelope({ type: "message", user: JONAS, text: "voltei", ts: "3.0", thread_ts: "1.0", channel: "C024" }));
  assert.equal(it.opened.length, 2);
  assert.equal(it.downloads.length, 1);
  assert.ok(it.opened[1].prompt.includes(savedAt(it.home, "C024", "1.0", "1.0")));
});

test("prints older than a week are swept, fresh ones stay", async () => {
  const home = mkdtempSync(join(tmpdir(), "hive-slack-sweep-"));
  const old = filesFolder(home, "C1", "1.1");
  const fresh = filesFolder(home, "C1", "2.2");
  mkdirSync(old, { recursive: true });
  mkdirSync(fresh, { recursive: true });
  const long_ago = (Date.now() - (FILES_DAYS + 1) * 24 * 60 * 60 * 1000) / 1000;
  utimesSync(old, long_ago, long_ago);
  await sweepFiles(home);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
});

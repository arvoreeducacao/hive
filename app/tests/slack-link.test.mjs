import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { linkFile, readLink, relayOf, slackKeys, writeLink } from "../lib/slack-hive.mjs";
import { createSlackBridge } from "../lib/slack-bridge.mjs";
import { createSlackLinker } from "../lib/slack-link.mjs";

const home = () => mkdtempSync(join(tmpdir(), "hive-slack-link-"));

const until = async (check, what) => {
  for (let at = 0; at < 200; at += 1) {
    if (check()) return;
    await new Promise((done) => setTimeout(done, 5));
  }
  assert.fail(`never happened: ${what}`);
};

function relayThatAnswers(waits) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url.endsWith("/link/start")) return { status: 200, json: async () => ({ ok: true, code: "ABCD-EFGH", claim: "c1", until: Date.now() + 60000, bot: "UBOT" }) };
    return { status: 200, json: async () => waits.shift() || { ok: true, pending: true } };
  };
  return { asked, fetchImpl };
}

test("the relay lives next to the team's doors unless it is named outright", () => {
  assert.equal(relayOf({ env: {}, config: { HIVE_DOOR_DOMAIN: "example.com" } }), "https://hive-slack.example.com");
  assert.equal(relayOf({ env: { HIVE_SLACK_RELAY: "https://elsewhere.test/" }, config: { HIVE_DOOR_DOMAIN: "example.com" } }), "https://elsewhere.test");
  assert.equal(relayOf({ env: {}, config: {} }), "");
});

test("a claimed token is kept where only this user can read it, and the bridge starts using the relay", async () => {
  const where = home();
  const relay = relayThatAnswers([{ ok: true, pending: true }, { ok: true, token: "hsr1.a.b", user: "UADA" }]);
  const linker = createSlackLinker({ home: where, relayOf: () => "https://relay.test", fetchImpl: relay.fetchImpl, poll: 1 });

  const started = await linker.start();
  assert.equal(started.code, "ABCD-EFGH");
  assert.equal(linker.state().pending.code, "ABCD-EFGH");
  await until(() => linker.state().linked === "UADA", "the link lands");

  assert.equal(statSync(linkFile(where)).mode & 0o777, 0o600);
  assert.ok(relay.asked.some((url) => url.includes("claim=c1")));
  const keys = slackKeys({ env: {}, envFile: "", home: where });
  assert.equal(keys.relayed, true);
  assert.equal(keys.api, "https://relay.test/api");
  assert.deepEqual(keys.people, ["UADA"]);
});

test("slack keys of the machine's own win over the relay link", async () => {
  const where = home();
  const relay = relayThatAnswers([{ ok: true, token: "hsr1.a.b", user: "UADA" }]);
  const linker = createSlackLinker({ home: where, relayOf: () => "https://relay.test", fetchImpl: relay.fetchImpl, poll: 1 });
  await linker.start();
  await until(() => readLink(where), "the link lands");
  const keys = slackKeys({ env: { HIVE_SLACK_BOT_TOKEN: "xoxb", HIVE_SLACK_APP_TOKEN: "xapp" }, envFile: "", home: where });
  assert.equal(keys.relayed, false);
  assert.equal(keys.bot, "xoxb");
});

test("an expired code says so, and nothing is kept", async () => {
  const where = home();
  const relay = relayThatAnswers([{ ok: false, error: "that code expired" }]);
  const linker = createSlackLinker({ home: where, relayOf: () => "https://relay.test", fetchImpl: relay.fetchImpl, poll: 1 });
  await linker.start();
  await until(() => !linker.state().pending, "the wait ends");
  assert.equal(linker.state().trouble, "that code expired");
  assert.equal(existsSync(linkFile(where)), false);
});

test("disconnecting forgets the link", async () => {
  const where = home();
  const relay = relayThatAnswers([{ ok: true, token: "hsr1.a.b", user: "UADA" }]);
  const linker = createSlackLinker({ home: where, relayOf: () => "https://relay.test", fetchImpl: relay.fetchImpl, poll: 1 });
  await linker.start();
  await until(() => linker.state().linked, "the link lands");
  linker.forget();
  assert.equal(linker.state().linked, "");
  assert.equal(slackKeys({ env: {}, envFile: "", home: where }).bot, "");
});

test("a hive with nowhere to link says it instead of hanging", async () => {
  const linker = createSlackLinker({ home: home(), relayOf: () => "" });
  const made = await linker.start();
  assert.match(made.error, /does not know where the slack relay lives/);
});

test("a linked bridge speaks to the relay exactly as it would to slack, and reconnects when the link changes", async () => {
  const where = home();
  writeLink(where, { token: "hsr1.a.b", user: "UADA", relay: "https://relay.test" });
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith("/apps.connections.open")) return { json: async () => ({ ok: true, url: "wss://relay.test/socket?ticket=t" }) };
    if (url.endsWith("/auth.test")) return { json: async () => ({ ok: true, user_id: "UBOT", user: "hive" }) };
    return { json: async () => ({ ok: true }) };
  };
  const sockets = [];
  class FakeSocket { constructor(url) { this.url = url; sockets.push(this); } on() { return this; } send() {} close() {} }
  const bridge = createSlackBridge({ home: where, keysOf: () => slackKeys({ env: {}, envFile: "", home: where }), socketImpl: FakeSocket, fetchImpl });

  await bridge.tick();
  assert.ok(urls.every((url) => url.startsWith("https://relay.test/api/")), `something went straight to slack: ${urls.join(", ")}`);
  assert.equal(sockets.at(-1).url, "wss://relay.test/socket?ticket=t");

  writeLink(where, { token: "hsr1.c.d", user: "UADA", relay: "https://relay.test" });
  await bridge.tick();
  assert.equal(sockets.length, 2, "a new token must open a new socket");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSlackBridge, NOT_MINE, PING_EVERY, PONG_WAIT } from "../lib/slack-bridge.mjs";
import { readChats } from "../lib/slack-hive.mjs";

const JOAO = "U0748LXRG48";
const BOT = "U0C35AT9TQW";

class FakeSocket {
  constructor(url) { this.url = url; this.sent = []; this.listeners = new Map(); FakeSocket.last = this; }
  on(kind, fn) { this.listeners.set(kind, fn); return this; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.listeners.get("close")?.(); }
  open() { this.listeners.get("open")?.(); }
  ping() { this.pings = (this.pings || 0) + 1; }
  pong() { this.listeners.get("pong")?.(); }
  terminate() { this.terminated = true; }
}

function stage({ people = [JOAO], opens = () => ({ name: "aurora", where: "local" }), says = () => ({ ok: true }), replies = [], now = Date.now } = {}) {
  const home = mkdtempSync(join(tmpdir(), "hive-slack-bridge-"));
  const calls = [];
  const said = [];
  const fetchImpl = async (url, options) => {
    const method = url.split("/").pop();
    const body = Object.fromEntries(new URLSearchParams(options.body));
    calls.push({ method, body });
    if (method === "apps.connections.open") return { json: async () => ({ ok: true, url: "wss://slack/socket" }) };
    if (method === "auth.test") return { json: async () => ({ ok: true, user_id: BOT, user: "hive" }) };
    if (method === "users.info") return { json: async () => ({ ok: true, user: { name: "joao.barros", profile: { display_name: "João" } } }) };
    if (method === "conversations.info") return { json: async () => ({ ok: true, channel: { name: "teste" } }) };
    if (method === "chat.postMessage") { said.push(body); return { json: async () => ({ ok: true, ts: "9.9" }) }; }
    if (method === "chat.getPermalink") return { json: async () => ({ ok: true, permalink: "https://leianaarvore.slack.com/archives/C024/p1000000" }) };
    if (method === "conversations.replies") return { json: async () => ({ ok: true, messages: replies }) };
    return { json: async () => ({ ok: true }) };
  };
  const opened = [];
  const relayed = [];
  const bridge = createSlackBridge({
    home,
    keysOf: () => ({ bot: "xoxb-test", app: "xapp-test", people }),
    openChat: async (mission) => { opened.push(mission); return opens(mission); },
    say: async (seat, text) => { relayed.push({ seat, text }); return says(seat, text); },
    socketImpl: FakeSocket,
    fetchImpl,
    now
  });
  return { home, bridge, calls, said, opened, relayed };
}

const envelope = (event) => JSON.stringify({ type: "events_api", envelope_id: "e1", payload: { event } });

const mention = (over = {}) => ({
  type: "app_mention", user: JOAO, text: `<@${BOT}> sobe o relatório`, ts: "1.1", channel: "C024", ...over
});

test("the bridge connects, learns who it is, and acks every envelope", async () => {
  const it = stage();
  const up = await it.bridge.tick();
  FakeSocket.last.open();
  assert.equal(up.running, false);
  assert.equal(it.bridge.botUser, BOT);
  assert.equal((await it.bridge.tick()).running, true);
  await it.bridge.take(envelope(mention()));
  assert.deepEqual(FakeSocket.last.sent, [{ envelope_id: "e1" }]);
});

test("a mention opens a chat with the person's own defaults and binds the thread", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));

  assert.equal(it.opened.length, 1);
  assert.match(it.opened[0].prompt, /sobe o relatório/);
  assert.match(it.opened[0].prompt, /#teste/);
  assert.match(it.opened[0].prompt, /reply_on_slack/);
  assert.equal(it.opened[0].errand, "slack · #teste");

  const chats = await readChats(it.home);
  assert.deepEqual(chats.map((one) => [one.channel, one.thread, one.seat]), [["C024", "1.1", "aurora"]]);
  assert.match(it.said[0].text, /aurora/);
  assert.equal(it.said[0].thread_ts, "1.1");
  assert.ok(it.calls.some((one) => one.method === "reactions.add" && one.body.name === "eyes"));
});

test("the next message in the thread lands in the chat instead of opening another", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  await it.bridge.take(envelope({ type: "message", user: JOAO, text: "e o de escrita?", ts: "2.2", thread_ts: "1.1", channel: "C024" }));

  assert.equal(it.opened.length, 1);
  assert.equal(it.relayed.length, 1);
  assert.equal(it.relayed[0].seat, "aurora");
  assert.match(it.relayed[0].text, /e o de escrita\?/);
  assert.match(it.relayed[0].text, /João/);
});

test("the mention and the channel copy of the same message only work once", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  await it.bridge.take(envelope({ ...mention(), type: "message", channel_type: "channel" }));
  assert.equal(it.opened.length, 1);
  assert.equal(it.relayed.length, 0);
});

test("a channel message in no thread of ours is none of our business", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "message", user: JOAO, text: "papo do canal", ts: "3.3", channel: "C024", channel_type: "channel" }));
  assert.equal(it.opened.length, 0);
  assert.equal(it.said.length, 0);
});

test("a direct message opens a chat with no channel to name", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "message", user: JOAO, text: "oi", ts: "4.4", channel: "D01", channel_type: "im" }));
  assert.equal(it.opened.length, 1);
  assert.equal(it.opened[0].errand, "slack · mensagem direta");
});

test("someone else's machine is not driven by someone else", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention({ user: "UXPTO" })));
  assert.equal(it.opened.length, 0);
  assert.equal(it.said[0].text, NOT_MINE);
});

test("the bot never answers itself, and edits and joins are not messages", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope({ type: "message", user: BOT, bot_id: "B0C3", text: "eu mesmo", ts: "5.5", channel: "D01", channel_type: "im" }));
  await it.bridge.take(envelope({ type: "message", bot_id: "B1", text: "outro robô", ts: "6.6", channel: "D01", channel_type: "im" }));
  await it.bridge.take(envelope({ type: "message", subtype: "channel_join", user: JOAO, text: "entrou", ts: "7.7", channel: "C024" }));
  assert.equal(it.opened.length, 0);
  assert.equal(it.relayed.length, 0);
  assert.equal(it.said.length, 0);
});

test("a message the person sent through a token that looks like a robot still counts", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention({ bot_id: "B0748" })));
  assert.equal(it.opened.length, 1);
});

test("another app writing in a bound thread is ignored without a word", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  it.said.length = 0;
  await it.bridge.take(envelope({ type: "message", user: "UBOTX", bot_id: "B77", text: "deploy ok", ts: "7.1", thread_ts: "1.1", channel: "C024" }));
  assert.equal(it.relayed.length, 0);
  assert.equal(it.said.length, 0);
});

test("a chat that is gone gives the thread a new one", async () => {
  const it = stage({ says: () => ({ ok: false, error: "that seat is not alive here anymore" }) });
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  await it.bridge.take(envelope({ type: "message", user: JOAO, text: "voltei", ts: "8.8", thread_ts: "1.1", channel: "C024" }));

  assert.equal(it.opened.length, 2);
  assert.match(it.said.map((one) => one.text).join("\n"), /não está mais aberto/);
  const chats = await readChats(it.home);
  assert.equal(chats.length, 1);
  assert.equal(chats[0].thread, "1.1");
});

test("a chat that will not open says so in the thread and binds nothing", async () => {
  const it = stage({ opens: () => ({ error: "no tmux on this machine" }) });
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  assert.match(it.said[0].text, /no tmux on this machine/);
  assert.deepEqual(await readChats(it.home), []);
});

test("the seat's answer goes back to its own thread, in slack's own markup", async () => {
  const it = stage();
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  it.said.length = 0;

  const sent = await it.bridge.replyFromSeat("aurora", "**pronto**: [o PR](https://x.dev/1)");
  assert.deepEqual(sent, { ok: true, channel: "C024", thread: "1.1" });
  assert.equal(it.said[0].text, "*pronto*: <https://x.dev/1|o PR>");
  assert.equal(it.said[0].thread_ts, "1.1");

  assert.match((await it.bridge.replyFromSeat("outra", "oi")).error, /did not come from slack/);
  assert.match((await it.bridge.replyFromSeat("aurora", "   ")).error, /nothing to say/);
});

test("with no tokens the bridge stays down and says why", async () => {
  const it = stage({ people: [] });
  const quiet = createSlackBridge({ home: it.home, keysOf: () => ({ bot: "", app: "", people: [] }), socketImpl: FakeSocket });
  const said = await quiet.tick();
  assert.equal(said.running, false);
  assert.match(said.why, /not connected to slack/);
});

test("slack asking to reconnect drops the socket so the next tick opens a new one", async () => {
  const it = stage();
  await it.bridge.tick();
  FakeSocket.last.open();
  const first = FakeSocket.last;
  await it.bridge.take(JSON.stringify({ type: "disconnect", reason: "refresh_requested" }));
  assert.equal(it.bridge.state().running, false);
  await it.bridge.tick();
  assert.notEqual(FakeSocket.last, first);
});

test("a socket whose other end went quiet is pinged, and one that never answers is replaced", async () => {
  let clock = 1000;
  const it = stage({ now: () => clock });
  await it.bridge.tick();
  FakeSocket.last.open();
  const first = FakeSocket.last;

  clock += PING_EVERY + 1;
  assert.equal((await it.bridge.tick()).running, true);
  assert.equal(first.pings, 1);

  clock += PONG_WAIT + 1;
  await it.bridge.tick();
  assert.equal(first.terminated, true);
  assert.notEqual(FakeSocket.last, first);
});

test("a socket that answers the ping stays", async () => {
  let clock = 1000;
  const it = stage({ now: () => clock });
  await it.bridge.tick();
  FakeSocket.last.open();
  const first = FakeSocket.last;

  clock += PING_EVERY + 1;
  await it.bridge.tick();
  first.pong();
  clock += PONG_WAIT + 1;
  assert.equal((await it.bridge.tick()).running, true);
  assert.equal(FakeSocket.last, first);
  assert.equal(first.terminated, undefined);
});

test("a mention dropped into a running thread carries what was said before it", async () => {
  const it = stage({
    replies: [
      { ts: "0.1", user: "UOUTRO", text: "o gráfico de leitura parou de subir" },
      { ts: "0.2", user: JOAO, text: "desde quinta, parece" },
      { ts: "1.1", user: JOAO, text: `<@${BOT}> sobe o relatório` },
      { ts: "1.9", user: JOAO, text: "isso veio depois e não conta" }
    ]
  });
  await it.bridge.tick();
  await it.bridge.take(envelope(mention({ thread_ts: "0.1" })));

  assert.equal(it.opened.length, 1);
  const mission = it.opened[0].prompt;
  assert.match(mission, /o gráfico de leitura parou de subir/);
  assert.match(mission, /desde quinta/);
  assert.doesNotMatch(mission, /veio depois e não conta/);
  assert.match(mission, /leianaarvore\.slack\.com\/archives\/C024/);
  assert.ok(mission.startsWith("sobe o relatório"));
});

test("a mention that opens its own thread quotes nobody", async () => {
  const it = stage({ replies: [{ ts: "1.1", user: JOAO, text: "sobe o relatório" }] });
  await it.bridge.tick();
  await it.bridge.take(envelope(mention()));
  assert.doesNotMatch(it.opened[0].prompt, /The thread before that/);
  assert.ok(!it.calls.some((one) => one.method === "conversations.replies"));
});

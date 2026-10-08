import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { asForm, askSlack, chatOfSeat, chatOfThread, earlierOnSlack, missionForSlack, readChats, saidOnSlack, slackKeys, slackified, splitForSlack, withoutTheBot, writeChats } from "../lib/slack-hive.mjs";

const home = () => mkdtempSync(join(tmpdir(), "hive-slack-"));

test("the keys come from the hub .env when the process has none", () => {
  const file = join(home(), ".env");
  writeFileSync(file, ["OTHER=1", "HIVE_SLACK_BOT_TOKEN=xoxb-bot", "HIVE_SLACK_APP_TOKEN=\"xapp-socket\"", "HIVE_SLACK_USERS=U1, U2"].join("\n"));
  const keys = slackKeys({ env: {}, envFile: file });
  assert.equal(keys.bot, "xoxb-bot");
  assert.equal(keys.app, "xapp-socket");
  assert.deepEqual(keys.people, ["U1", "U2"]);
});

test("the process env wins over the file, and a missing file leaves the keys empty", () => {
  const file = join(home(), ".env");
  writeFileSync(file, "HIVE_SLACK_BOT_TOKEN=from-file");
  assert.equal(slackKeys({ env: { HIVE_SLACK_BOT_TOKEN: "from-env" }, envFile: file }).bot, "from-env");
  assert.deepEqual(slackKeys({ env: {}, envFile: join(home(), "nothing-here") }), { bot: "", app: "", people: [], api: "https://slack.com/api", relayed: false });
});

test("every call is form encoded, because the web api refuses json on most methods", async () => {
  let seen = null;
  const fetchImpl = async (url, options) => {
    seen = { url, type: options.headers["content-type"], body: options.body };
    return { json: async () => ({ ok: true, user_id: "U9" }) };
  };
  const said = await askSlack("users.info", "xoxb-bot", { user: "U9", empty: "" }, { fetchImpl });
  assert.equal(said.user_id, "U9");
  assert.match(seen.type, /x-www-form-urlencoded/);
  assert.equal(seen.body, "user=U9");
  assert.equal(seen.url, "https://slack.com/api/users.info");
});

test("a refusal comes back as an error a caller can read", async () => {
  const fetchImpl = async () => ({ status: 200, json: async () => ({ ok: false, error: "not_in_channel" }) });
  assert.deepEqual(await askSlack("chat.postMessage", "xoxb", {}, { fetchImpl }), { ok: false, error: "not_in_channel" });
  assert.deepEqual(await askSlack("chat.postMessage", "", {}, { fetchImpl }), { ok: false, error: "no slack token on this machine" });
});

test("asForm drops what slack has no room for", () => {
  assert.equal(asForm({ a: 1, b: "", c: null, d: undefined, e: "x y" }).toString(), "a=1&e=x+y");
});

test("a thread finds its chat, and a chat finds its thread", async () => {
  const dir = home();
  await writeChats(dir, [
    { channel: "C1", thread: "1.1", seat: "aurora" },
    { channel: "C1", thread: "2.2", seat: "bolha" }
  ]);
  const chats = await readChats(dir);
  assert.equal(chatOfThread(chats, "C1", "2.2").seat, "bolha");
  assert.equal(chatOfThread(chats, "C2", "2.2"), null);
  assert.equal(chatOfSeat(chats, "aurora").thread, "1.1");
  assert.equal(chatOfSeat(chats, "ninguem"), null);
});

test("the newest chat of a seat is the one that answers", async () => {
  const dir = home();
  await writeChats(dir, [
    { channel: "C1", thread: "1.1", seat: "aurora" },
    { channel: "C9", thread: "9.9", seat: "aurora" }
  ]);
  assert.equal(chatOfSeat(await readChats(dir), "aurora").channel, "C9");
});

test("a chats file that is not there reads as no chats", async () => {
  assert.deepEqual(await readChats(join(home(), "nothing")), []);
});

test("the mission opens with their own words, so the chat is named after the ask", () => {
  const said = missionForSlack({ text: "sobe o gráfico de leitura", channelName: "teste", person: "Jonas" });
  assert.ok(said.startsWith("sobe o gráfico de leitura"));
  assert.match(said, /#teste/);
  assert.match(said, /reply_on_slack/);
  assert.match(said, /sobe o gráfico de leitura/);
  assert.match(missionForSlack({ text: "oi", person: "Jonas", direct: true }), /a direct message/);
});

test("a relayed message names who said it and repeats the way back", () => {
  const said = saidOnSlack({ text: "e agora?", person: "Jonas" });
  assert.match(said, /Jonas/);
  assert.match(said, /reply_on_slack/);
  assert.match(said, /e agora\?/);
});

test("the bot's own handle is taken out of what the person said", () => {
  assert.equal(withoutTheBot("<@U1> sobe o  deploy", "U1"), "sobe o deploy");
  assert.equal(withoutTheBot("<@U1>", "U1"), "");
  assert.equal(withoutTheBot("olá <@U2>", "U1"), "olá <@U2>");
});

test("markdown becomes slack's own", () => {
  assert.equal(slackified("**pronto**"), "*pronto*");
  assert.equal(slackified("[o PR](https://x.dev/1)"), "<https://x.dev/1|o PR>");
  assert.equal(slackified("## título"), "*título*");
  assert.equal(slackified("- um\n- dois"), "• um\n• dois");
});

test("a long answer is cut on whitespace, never mid word", () => {
  const whole = `${"a".repeat(30)} ${"b".repeat(30)} ${"c".repeat(30)}`;
  const pieces = splitForSlack(whole, 50);
  assert.equal(pieces.length, 3);
  assert.equal(pieces.join(" "), whole);
  assert.deepEqual(splitForSlack("   "), []);
  assert.deepEqual(splitForSlack("curto"), ["curto"]);
});

test("the thread so far keeps the newest lines and cuts the long ones", () => {
  const many = Array.from({ length: 30 }, (_, at) => ({ who: "Jonas", text: `linha ${at}` }));
  const kept = earlierOnSlack(many);
  assert.equal(kept.length, 20);
  assert.equal(kept[0], "Jonas: linha 10");
  assert.equal(kept.at(-1), "Jonas: linha 29");
  assert.ok(earlierOnSlack([{ who: "Jonas", text: "a".repeat(900) }])[0].endsWith("…"));
  assert.deepEqual(earlierOnSlack([{ who: "Jonas", text: "   " }]), []);
});

test("a mission opened inside a thread quotes it and says where it lives", () => {
  const said = missionForSlack({
    text: "e agora?",
    channelName: "teste",
    person: "Jonas",
    link: "https://acme.slack.com/archives/C1/p1",
    earlier: ["Bruna: o relatório parou", "Jonas: desde quinta"]
  });
  assert.ok(said.startsWith("e agora?"));
  assert.match(said, /thread that was already running/);
  assert.match(said, /> Bruna: o relatório parou/);
  assert.match(said, /archives\/C1\/p1/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { chatsOpenedIn, hiveCallOf } from "../src/app/orchestration-summary.js";
import { summarizeWork, summaryKind, toolAction } from "../src/app/timeline-rows.js";

const say = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) : text);

let n = 0;
const hive = (name, input = {}, extra = {}) => ({ key: `k${++n}`, kind: "tool", face: "mcp", tool: `mcp__hive__${name}`, name, server: "hive", arg: "", running: false, stat: "ok", keep: false, hive: hiveCallOf("hive", name, input), ...extra });
const tool = (face, name, extra = {}) => ({ key: `k${++n}`, kind: "tool", face, tool: name, name, arg: "a.js", running: false, stat: "ok", keep: false, ...extra });
const message = (seat, extra) => hive("message", { seat, text: "oi" }, extra);

test("messages to the same chats say both counts, and opened chats are counted by what the tool opened", () => {
  const work = [hive("spawn", { mission: "a" }), hive("spawn", { mission: "b", count: 2 }), message("retry"), message("retry"), message("leitor"), message("Retry"), message("leitor")];
  assert.equal(summarizeWork(work, say), "Opened 3 chats and sent 5 messages to 2 chats");
  assert.equal(summarizeWork([message("a"), message("a")], say), "Sent 2 messages to 1 chat");
  assert.equal(summarizeWork([message("a"), hive("peers")], say), "Sent 1 message to 1 chat and checked the open chats");
});

test("a call that failed is not counted as done, and the summary says how many failed", () => {
  assert.equal(summarizeWork([message("retry"), message("relatorio", { stat: "bad" })], say), "Sent 1 message to 1 chat · 1 call failed");
  assert.equal(summarizeWork([hive("spawn", {}, { stat: "bad" }), hive("spawn", {}, { stat: "bad" })], say), "2 calls failed");
  assert.equal(summarizeWork([hive("spawn", {}), hive("spawn", {}, { stat: "bad" }), tool("run", "Bash")], say), "Opened 1 chat and ran 1 command · 1 call failed");
});

test("asking a chat does not claim it answered, and reading or checking chats comes after what changed something", () => {
  assert.equal(summarizeWork([hive("ask", { seat: "a", question: "?" }), hive("ask", { seat: "b", question: "?" })], say), "Asked 2 chats");
  assert.equal(summarizeWork([hive("peek", { seat: "a" }), hive("peek", { seat: "b" }), hive("peers"), hive("peers")], say), "Read 2 chats and checked the open chats 2 times");
  assert.equal(summarizeWork([hive("peek", { seat: "a" }), tool("read", "Read"), hive("close", { seat: "a" }), hive("close", {})], say), "Read 1 chat, closed 2 chats, and performed 1 other action", "the closes come before the reads");
  assert.equal(summarizeWork([tool("read", "Read"), tool("read", "Read"), hive("peers"), hive("rename", { title: "x" }), hive("link_pr", { pr: "o/r#1" })], say), "Changed this chat's title, linked a pull request to this chat, and performed 3 other actions");
});

test("without the chat each call went to, the summary says what was done without guessing how many chats", () => {
  assert.equal(summarizeWork([hive("message", { text: "oi" }), hive("message", { text: "oi" })], say), "Sent 2 messages");
  assert.equal(summarizeWork([hive("peek", {}), hive("peek", {})], say), "Looked at other chats");
  assert.equal(summarizeWork([hive("ask", {}), hive("ask", {})], say), "Asked 2 questions");
});

test("the rest of the hive's tools read as what they are, never as a server name", () => {
  const browse = { ...hive("browser_click"), hive: null };
  const guide = { ...hive("guide"), hive: null };
  assert.equal(toolAction(browse), "browser");
  assert.equal(summarizeWork([browse, { ...browse, key: "k-b2" }, guide], say), "Used browser 2 times and used 1 tool");
  assert.equal(summarizeWork([tool("mcp", "slack_send", { server: "Slack" }), message("a")], say), "Used Slack and sent 1 message to 1 chat");
  assert.equal(summaryKind([message("a"), hive("spawn")]), "orchestration");
});

test("only the hive's own tools are read as orchestration, and a race is counted by the chats it opened", () => {
  assert.equal(hiveCallOf("slack", "message", { seat: "a" }), null);
  assert.equal(hiveCallOf("hive", "browser_click", {}), null);
  assert.deepEqual(hiveCallOf("hive", "message", { seat: " Retry ", text: "x" }), { kind: "message", seat: "retry", made: 0 });
  assert.deepEqual(hiveCallOf("hive", "spawn", { count: 3 }), { kind: "spawn", seat: "", made: 3 });
  assert.equal(chatsOpenedIn("opening a race of 2 chats on local: \"a\", \"b\"", 3), 2);
  assert.equal(chatsOpenedIn("opening a seat with \"a\" on local.", 3), 1);
  assert.equal(chatsOpenedIn("", 3), 3);
});

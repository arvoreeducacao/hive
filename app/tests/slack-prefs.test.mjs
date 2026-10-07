import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await state();
await views();
const { $ } = await app("core");

let answer = {};
const calls = [];
globalThis.fetch = async (path, opts = {}) => {
  calls.push({ path, method: opts.method || "GET" });
  const body = path === "/api/slack" ? answer : { ok: true, code: "ABCD-EFGH" };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};

const { slackStateSaid } = await app("slack-prefs");

const settle = () => new Promise((done) => setTimeout(done, 20));

async function openPane(state) {
  answer = state;
  $("help").classList.add("on");
  $("pref-nav").querySelector('button[data-pane="slack"]').click();
  await settle();
}

const shown = (id) => !$(id).hidden;

test("slack has a pane of its own in preferences", () => {
  assert.ok($("pref-nav").querySelector('button[data-pane="slack"]'));
  assert.ok($("pref-body").querySelector('.pref-pane[data-pane="slack"]'));
});

test("a hive with no link offers to connect and hides the rest", async () => {
  await openPane({ running: false, relayed: false, link: { relay: "https://relay.test", linked: "", pending: null, trouble: "" } });
  assert.match($("slack-state").textContent, /not connected/);
  assert.equal(shown("slack-connect"), true);
  assert.equal(shown("slack-forget"), false);
  assert.equal(shown("slack-code-box"), false);
});

test("connecting asks the hive for a code and shows it big enough to copy", async () => {
  await openPane({ running: false, relayed: false, link: { relay: "https://relay.test", linked: "", pending: null, trouble: "" } });
  answer = { running: false, relayed: false, link: { relay: "https://relay.test", linked: "", pending: { code: "ABCD-EFGH", until: Date.now() + 600000 }, trouble: "" } };
  $("slack-connect").click();
  await settle();
  assert.ok(calls.some((one) => one.path === "/api/slack/link" && one.method === "POST"));
  assert.equal(shown("slack-code-box"), true);
  assert.equal($("slack-code").textContent, "ABCD-EFGH");
  assert.equal(shown("slack-connect"), false, "a second code while the first is waiting only confuses");
});

test("a linked hive names who it answers and offers to disconnect", async () => {
  await openPane({ running: true, relayed: true, link: { relay: "https://relay.test", linked: "UADA", pending: null, trouble: "" } });
  assert.match($("slack-state").innerHTML, /UADA/);
  assert.equal(shown("slack-forget"), true);
  assert.equal(shown("slack-connect"), false);
  $("slack-forget").click();
  await settle();
  assert.ok(calls.some((one) => one.path === "/api/slack/link" && one.method === "DELETE"));
});

test("the line under the title worries only when something is wrong", () => {
  assert.equal(slackStateSaid({ running: false, link: { relay: "", linked: "" } }).worry, true);
  assert.equal(slackStateSaid({ running: false, link: { relay: "r", linked: "UADA" } }).worry, true);
  assert.equal(slackStateSaid({ running: false, link: { relay: "r", trouble: "that code expired" } }).worry, true);
  assert.equal(slackStateSaid({ running: true, relayed: false, link: { relay: "r" } }).worry, false);
  assert.match(slackStateSaid({ running: true, relayed: true, link: { relay: "r", linked: "<b>x</b>" } }).text, /&lt;b&gt;/);
});

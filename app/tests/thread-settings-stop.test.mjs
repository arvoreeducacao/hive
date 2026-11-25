import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, state } from "./dom.mjs";

const posts = [];
let saved = {};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (String(url) === "/api/config" && init?.method === "POST") {
    const body = JSON.parse(init.body);
    posts.push(body.config);
    saved = { ...saved, ...body.config.threads };
    return Promise.resolve({ ok: true, json: async () => ({ config: { threads: saved } }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ sessions: [] }) });
};
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { adoptThreadSettings } = await app("thread-settings");
const settle = () => new Promise((done) => setTimeout(done, 10));

test("the cleanup card has a switch to stop what the chat left running, off by default", async () => {
  adoptThreadSettings({ config: {} });
  const flip = document.getElementById("t-stop-on-settle");
  assert.ok(flip, "the switch is in Settle and snooze, in the cleanup card");
  assert.ok(flip.closest(".set-group").querySelector("#settle-commands"), "it sits with the settle commands");
  assert.equal(flip.getAttribute("aria-pressed"), "false");
  assert.equal(st.threadRules.stopServersOnSettle, false);
  flip.click();
  await settle();
  assert.deepEqual(posts.at(-1), { threads: { stopServersOnSettle: true } });
  assert.equal(document.getElementById("t-stop-on-settle").getAttribute("aria-pressed"), "true");
});

test("the server reads the switch when a chat settles", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const at = server.indexOf("whenSeatSettles(async (seat) => {");
  assert.ok(at > 0, "the server registers its settle step");
  const step = server.slice(at, server.indexOf("\n});", at));
  assert.match(step, /closeLeftovers\(seat,/);
  assert.match(step, /stopRunning: config\.threads\.stopServersOnSettle === true/);
  assert.match(step, /foregroundOf/);
});

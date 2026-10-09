import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");

await views();

const { getStructured } = await app("chat-stretches");
const { st } = await app("core");

const HERE = fileURLToPath(new URL("../src/app", import.meta.url));
const layout = readFileSync(join(HERE, "seat-layout.js"), "utf8");

let seq = 0;

const seat = () => {
  const e = getStructured({ name: `refused-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  return e;
};

const warnings = (e) => [...(svConvFlushAll(), e.scroll).querySelectorAll(".sv-meta.warn")].map((el) => el.textContent);

test("a message the driver never took says so, instead of leaving an untouched box", async () => {
  const e = seat();
  e.ws = null;
  e.type("sobe o relatório");
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(warnings(e).length, 1);
  assert.match(warnings(e)[0], /not connected to the driver/);
});

test("nothing is said when the driver takes the message", async () => {
  const e = seat();
  e.ws = { readyState: 1, send: (line) => {
    const cid = JSON.parse(line).cid;
    queueMicrotask(() => e.pending.get(cid)?.({ ok: true, queued: false }));
  } };
  e.type("sobe o relatório");
  await new Promise((go) => setTimeout(go, 0));
  assert.deepEqual(warnings(e), []);
});

test("a handle that fits two chats says so in the conversation, and the words stay in the box", async () => {
  const e = seat();
  e.ws = { readyState: 1, send: () => assert.fail("nothing should have gone to the driver") };
  const held = st.data.sessions;
  st.data.sessions = [
    { name: e.name, where: "local", state: "idle", title: e.name, structured: true },
    { name: "api-payload", where: "local", state: "idle", title: "api-payload", structured: true },
    { name: "api-webhooks", where: "local", state: "idle", title: "api-webhooks", structured: true },
  ];
  const box = (svConvFlushAll(), e.host).querySelector(".sv-composer textarea");
  box.value = "confere com #api antes";
  (svConvFlushAll(), e.host).querySelector(".sv-composer").dispatchEvent(new Event("submit"));
  await new Promise((go) => setTimeout(go, 0));
  st.data.sessions = held;
  assert.equal(warnings(e).length, 1);
  assert.match(warnings(e)[0], /fits 2 seats/);
  assert.equal(box.value, "confere com #api antes");
});

test("the bar tells which of its refusals it was, instead of dropping the message", () => {
  assert.match(layout, /if \(bare\) return void composerRefused\(/);
  assert.match(layout, /if \(found\.error\) return void composerRefused\(found\.error\);/);
  assert.match(layout, /if \(!target\) return void composerRefused\(/);
  assert.match(layout, /if \(woven\.error\) return void composerRefused\(woven\.error\);/);
  assert.match(layout, /if \(!sendToSeat\([\s\S]{0,120}\{\n\s+return void composerRefused\(/);
});

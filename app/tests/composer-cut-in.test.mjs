import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");

await views();

const { getStructured } = await app("chat-stretches");
const { IS_MAC } = await app("core");

let seq = 0;

function busySeat() {
  const e = getStructured({ name: `cut-in-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  e.turnOpen = true;
  const sent = [];
  e.ws = { readyState: 1, send: (line) => {
    const cmd = JSON.parse(line);
    sent.push(cmd.type);
    queueMicrotask(() => e.pending.get(cmd.cid)?.(cmd.type === "say" ? { ok: true, queued: true, cid: cmd.cid } : { ok: true }));
  } };
  return { e, sent };
}

const box = (e) => (svConvFlushAll(), e.host).querySelector(".sv-composer textarea");
const press = (e, mods) => box(e).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...mods }));
const settle = () => new Promise((go) => setTimeout(go, 10));
const chips = (e) => (svConvFlushAll(), e.host).querySelectorAll(".sv-queue .sv-qitem").length;
const bubbles = (e) => [...(svConvFlushAll(), e.scroll).querySelectorAll(".sv-user")].map((el) => el.textContent);

test("cmd+enter during a turn stops it and the message goes in without a queue chip", async () => {
  const { e, sent } = busySeat();
  box(e).value = "para e faz outra coisa";
  press(e, IS_MAC ? { metaKey: true } : { ctrlKey: true });
  await settle();
  assert.deepEqual(sent.slice(0, 2), ["say", "interrupt"]);
  assert.equal(chips(e), 0);
  assert.ok(bubbles(e).some((t) => t.includes("para e faz outra coisa")));
  assert.equal(box(e).value, "");
});

test("plain enter during a turn still waits in the queue", async () => {
  const { e, sent } = busySeat();
  box(e).value = "depois disso, revisa";
  press(e, {});
  await settle();
  assert.deepEqual(sent, ["say"]);
  assert.equal(chips(e), 1);
});

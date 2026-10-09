import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { svConvFlushAll, svConvSaid, svConvSeed, svConvShowNow } = await app("conversation-model");

let seq = 0;

function seat() {
  const painted = [];
  return {
    name: `frame-${++seq}`, tag: `frame-${seq}`, conv: svConvSeed(), atBottom: true,
    scroll: document.createElement("div"),
    convView: { show: (next) => painted.push(next) },
    painted
  };
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(done));

test("a burst of events paints the chat once, with every one of them in it", () => {
  const e = seat();
  for (let i = 0; i < 50; i++) svConvSaid(e, `resposta ${i}`);
  assert.equal(e.painted.length, 0, "an event painted the whole chat on its own");
  svConvFlushAll();
  assert.equal(e.painted.length, 1);
  assert.equal(e.painted[0].blocks.length, 50);
});

test("the next frame paints what is due without anyone asking", async () => {
  const e = seat();
  svConvSaid(e, "oi");
  await nextFrame();
  assert.equal(e.painted.length, 1);
  await nextFrame();
  assert.equal(e.painted.length, 1, "a frame with nothing new painted again");
});

test("painting now takes the pending frame with it, so the chat is not painted twice", async () => {
  const e = seat();
  svConvSaid(e, "oi");
  svConvShowNow(e);
  assert.equal(e.painted.length, 1);
  await nextFrame();
  assert.equal(e.painted.length, 1);
});

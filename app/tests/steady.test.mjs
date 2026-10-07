import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { app, state } from "./dom.mjs";

const st = await state();
const { createEffect, createRoot, steady } = await app("core");

function follower() {
  const seen = [];
  const warned = [];
  const quiet = console.warn;
  console.warn = (...said) => warned.push(said[0]);
  st.beat = 0;
  const stop = createRoot((dispose) => {
    const follow = steady("beat", () => seen.push(st.beat));
    createEffect(() => follow());
    return dispose;
  });
  return { seen, warned, stop: () => { stop(); console.warn = quiet; } };
}

test("a painter follows every write while the writer is calm", () => {
  const f = follower();
  for (let i = 1; i <= 10; i++) st.beat = i;
  assert.equal(f.seen.at(-1), 10);
  assert.equal(f.warned.length, 0);
  f.stop();
});

test("a runaway writer is throttled and named, and the painter catches up once the second is over", async () => {
  const f = follower();
  for (let i = 1; i <= 80; i++) st.beat = i;
  assert.equal(f.seen.length, 50, "past fifty runs in a second the painter stops repainting");
  assert.equal(f.seen.at(-1), 49);
  assert.match(f.warned[0], /^beat ran 51 times in a second/);
  await sleep(1100);
  assert.equal(f.seen.at(-1), 80, "when the second is over the painter paints the state it missed");
  st.beat = 81;
  assert.equal(f.seen.at(-1), 81, "and it keeps following writes from then on");
  f.stop();
});

function faller(falls) {
  const seen = [];
  const warned = [];
  const quiet = console.warn;
  console.warn = (...said) => warned.push(said[0]);
  st.beat = 0;
  let left = falls;
  const stop = createRoot((dispose) => {
    const follow = steady("beat", () => {
      if (left-- > 0) throw new Error("the view this paints into is not mounted yet");
      seen.push(st.beat);
    });
    createEffect(() => follow());
    return dispose;
  });
  return { seen, warned, stop: () => { stop(); console.warn = quiet; } };
}

test("a painter that threw before reading anything is not left deaf to the state", async () => {
  const f = faller(1);
  assert.match(f.warned[0], /^beat could not follow the state/);
  st.beat = 7;
  assert.equal(f.seen.length, 0, "the effect read nothing, so the write on its own cannot wake it");
  await sleep(1100);
  assert.equal(f.seen.at(-1), 7, "the rest it was given wakes it, and it paints the state it missed");
  st.beat = 8;
  assert.equal(f.seen.at(-1), 8, "and it keeps following writes from then on");
  f.stop();
});

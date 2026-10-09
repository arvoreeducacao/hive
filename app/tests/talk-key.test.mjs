import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await state();
await views();
const { CTRL_KEYS, MAC_KEYS } = await app("core");
const { talkKeyLetGo } = await app("hold-numbers");

const up = (code, mods = {}) => ({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

test("on the mac, command and d starts dictation and dim moves to option q", () => {
  assert.deepEqual(MAC_KEYS.talk, { meta: true, code: "KeyD" });
  assert.deepEqual(MAC_KEYS.dim, { alt: true, code: "KeyQ" });
  const taken = Object.entries(MAC_KEYS).filter(([, b]) => b && JSON.stringify(b) === JSON.stringify(MAC_KEYS.talk));
  assert.deepEqual(taken.map(([a]) => a), ["talk"]);
  assert.deepEqual(CTRL_KEYS.talk, { ctrl: true, shift: true, code: "Space" });
});

test("letting go of the d while command is still held keeps listening", () => {
  assert.equal(talkKeyLetGo(up("KeyD", { metaKey: true }), MAC_KEYS.talk), false);
});

test("letting go of command stops listening", () => {
  assert.equal(talkKeyLetGo(up("MetaLeft"), MAC_KEYS.talk), true);
  assert.equal(talkKeyLetGo(up("KeyD"), MAC_KEYS.talk), true);
});

test("a binding with no modifier stops when its own key is let go", () => {
  assert.equal(talkKeyLetGo(up("F5"), { code: "F5" }), true);
  assert.equal(talkKeyLetGo(up("KeyA"), { code: "F5" }), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { STT_SAMPLE_RATE, joinSound, loudnessOf, wasAnythingSaid, whereTheWordsGo } from "../assets/stt-sound.mjs";
import { apiBinary } from "../assets/api.mjs";

const speech = (seconds) => new Float32Array(STT_SAMPLE_RATE * seconds).fill(0.2);

test("the pieces the microphone hands over become one stretch of sound", () => {
  const whole = joinSound([new Float32Array([1, 2]), new Float32Array([3]), new Float32Array([4, 5])]);
  assert.deepEqual(Array.from(whole), [1, 2, 3, 4, 5]);
  assert.equal(joinSound([]).length, 0);
});

test("loudness is the root mean square, and silence is zero", () => {
  assert.equal(loudnessOf(new Float32Array(100)), 0);
  assert.equal(Math.round(loudnessOf(new Float32Array([1, -1, 1, -1])) * 100) / 100, 1);
  assert.equal(loudnessOf(null), 0);
});

test("a held key that caught nothing does not travel to the model", () => {
  assert.deepEqual(wasAnythingSaid(new Float32Array(0)), { said: false, why: "nothing" });
  assert.deepEqual(wasAnythingSaid(new Float32Array(STT_SAMPLE_RATE)), { said: false, why: "too quiet" });
});

test("a click that starts and stops at once is too quick to be speech", () => {
  assert.deepEqual(wasAnythingSaid(speech(0.1)), { said: false, why: "too short" });
  assert.equal(wasAnythingSaid(speech(0.4)).said, true);
});

test("real speech goes through", () => {
  assert.deepEqual(wasAnythingSaid(speech(3)), { said: true, why: "" });
});

test("the words land where the cursor was, with a space only when one is needed", () => {
  assert.deepEqual(whereTheWordsGo("mundo", "ola", 3), { text: "ola mundo", cursor: 9 });
  assert.deepEqual(whereTheWordsGo("mundo", "ola ", 4), { text: "ola mundo", cursor: 9 });
  assert.deepEqual(whereTheWordsGo("ola", "", 0), { text: "ola", cursor: 3 });
  assert.deepEqual(whereTheWordsGo("ola", "mundo", 0), { text: "olamundo", cursor: 3 });
});

test("the words land in the middle when the cursor is in the middle", () => {
  assert.deepEqual(whereTheWordsGo("no meio", "comeco fim", 6), { text: "comeco no meio fim", cursor: 14 });
});

test("nothing said leaves the box exactly as it was", () => {
  assert.deepEqual(whereTheWordsGo("   ", "ola", 3), { text: "ola", cursor: 3 });
  assert.deepEqual(whereTheWordsGo(null, "ola", 1), { text: "ola", cursor: 1 });
});

test("a cursor outside the text is pulled back inside it", () => {
  assert.deepEqual(whereTheWordsGo("fim", "ola", 99), { text: "ola fim", cursor: 7 });
  assert.deepEqual(whereTheWordsGo("fim", "ola", -5), { text: "fimola", cursor: 3 });
  assert.deepEqual(whereTheWordsGo("fim", "ola", null), { text: "ola fim", cursor: 7 });
});

test("sound goes to the server as raw bytes, not as json", async () => {
  let sent = null;
  globalThis.fetch = async (path, opts) => { sent = { path, opts }; return { ok: true, text: async () => '{"text":"oi"}' }; };
  const pcm = speech(1);
  const out = await apiBinary("/api/stt/transcribe", pcm);
  assert.equal(sent.opts.method, "POST");
  assert.equal(sent.opts.headers["content-type"], "application/octet-stream");
  assert.equal(sent.opts.body, pcm);
  assert.deepEqual(out, { text: "oi" });
});

test("a refusal from the server comes back as its own words", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => '{"error":"dictation is not ready on this machine yet"}' });
  await assert.rejects(apiBinary("/api/stt/transcribe", speech(1)), /not ready on this machine/);
});

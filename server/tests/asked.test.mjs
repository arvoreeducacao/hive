import { test } from "node:test";
import assert from "node:assert/strict";

import { SHOT_CEILING, createAsked, machineOfSeat } from "../asked.mjs";

test("a picture that comes back settles the wait it was opened for", async () => {
  const asked = createAsked();
  const { id, answer } = asked.open();
  assert.equal(asked.pending, 1);

  assert.equal(asked.settle(id, { type: "image/png", data: "AAA" }), true);
  assert.deepEqual(await answer, { type: "image/png", data: "AAA" });
  assert.equal(asked.pending, 0, "the wait was left open after it was answered");
});

test("a machine that never answers ends the wait instead of holding the request forever", async () => {
  const asked = createAsked({ waitMs: 10 });
  const { answer } = asked.open();
  const said = await answer;
  assert.match(said.error, /did not answer/);
  assert.equal(asked.pending, 0);
});

test("an answer for a wait nobody opened is refused, and never twice for the same one", () => {
  const asked = createAsked();
  const { id } = asked.open();
  assert.equal(asked.settle("nobody", { data: "x" }), false);
  assert.equal(asked.settle(id, { data: "x" }), true);
  assert.equal(asked.settle(id, { data: "x" }), false, "the same wait was settled twice");
});

test("two waits at once do not answer for each other", async () => {
  const asked = createAsked();
  const first = asked.open();
  const second = asked.open();
  assert.notEqual(first.id, second.id);

  asked.settle(second.id, { data: "second" });
  asked.settle(first.id, { data: "first" });
  assert.deepEqual(await first.answer, { data: "first" });
  assert.deepEqual(await second.answer, { data: "second" });
});

test("a server going down does not leave a phone hanging on a picture", async () => {
  const asked = createAsked();
  const { answer } = asked.open();
  asked.stop();
  assert.match((await answer).error, /going down/);
});

test("the seat says which machine to ask, and a seat nobody published says nobody", () => {
  const rows = [
    { fingerprint: "SHA256:mac", panel: { seats: [{ name: "a-seat" }, { name: "another" }] } },
    { fingerprint: "SHA256:other", panel: { seats: [{ name: "theirs" }] } }
  ];
  assert.equal(machineOfSeat(rows, "another"), "SHA256:mac");
  assert.equal(machineOfSeat(rows, "theirs"), "SHA256:other");
  assert.equal(machineOfSeat(rows, "nobody-has-this"), "");
  assert.equal(machineOfSeat([], "a-seat"), "");
  assert.equal(machineOfSeat(null, "a-seat"), "");
});

test("the ceiling is small enough to cross in one envelope", () => {
  assert.ok(SHOT_CEILING < (1 << 20), "a picture past the body ceiling would be refused by the door itself");
});

test("a new chat waits far longer than a picture, because opening one takes real time", async () => {
  const { ASK_WAIT_MS, BIRTH_WAIT_MS } = await import("../asked.mjs");
  assert.ok(BIRTH_WAIT_MS > ASK_WAIT_MS * 5, "a new chat would time out before the machine even finished naming it");
});

test("the wait says what it was waiting for, so the screen can tell the person", async () => {
  const shots = createAsked({ waitMs: 5, what: "picture" });
  const births = createAsked({ waitMs: 5, what: "new chat" });
  const one = shots.open();
  const two = births.open();

  assert.match((await one.answer).error, /picture/);
  assert.match((await two.answer).error, /new chat/);
  assert.notEqual(one.id, two.id, "two waiting rooms handed out the same id");
});

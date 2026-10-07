import { test } from "node:test";
import assert from "node:assert/strict";
import { RACE_MAX, raceBrief, raceCount, raceMissions, raceOf } from "../lib/race.mjs";

test("a race is two to four chats, never one, never a crowd", () => {
  assert.equal(raceCount(undefined), 1);
  assert.equal(raceCount("3"), 3);
  assert.equal(raceCount(0), 1);
  assert.equal(raceCount(99), RACE_MAX);
  assert.equal(raceCount("nope"), 1);
});

test("one chat is the same mission as before, untouched", () => {
  const body = { prompt: "fix the login", name: "login", count: 1 };
  assert.deepEqual(raceMissions(body), [{ ...body, count: 1 }]);
  assert.deepEqual(raceMissions({ prompt: "fix the login" }), [{ prompt: "fix the login", count: 1 }]);
});

test("a race hands every chat the same mission, its place in the race, and one shared errand", () => {
  const born = raceMissions({ prompt: "fix the login\nthe button does nothing", name: "login", count: 3, where: "local" });
  assert.equal(born.length, 3);
  assert.deepEqual(born.map((one) => one.name), ["login-1", "login-2", "login-3"]);
  assert.deepEqual(born.map((one) => one.race), [{ i: 1, of: 3 }, { i: 2, of: 3 }, { i: 3, of: 3 }]);
  assert.ok(born.every((one) => one.errand === "fix the login"), "the errand is the first line of the mission");
  assert.ok(born.every((one) => one.where === "local"));
  assert.ok(born[1].prompt.startsWith(raceBrief(2, 3)));
  assert.ok(born[1].prompt.endsWith("fix the login\nthe button does nothing"));
  assert.match(raceBrief(1, 2), /chat 1 of 2/);
  assert.match(raceBrief(1, 2), /worktree/);
});

test("an unnamed race lets each chat be named from the mission, and keeps the errand the person wrote", () => {
  const born = raceMissions({ prompt: "fix the login", errand: "  login   quebrado ", count: 2 });
  assert.deepEqual(born.map((one) => one.name), ["", ""]);
  assert.ok(born.every((one) => one.errand === "login quebrado"));
});

test("a group of seats is a race only when every seat carries the same size and there is more than one", () => {
  assert.equal(raceOf([{ race: 3 }, { race: 3 }, { race: 3 }]), 3);
  assert.equal(raceOf([{ race: 3 }, { race: 3 }]), 3, "a race with a seat already gone is still a race");
  assert.equal(raceOf([{ race: 3 }]), 0);
  assert.equal(raceOf([{ race: 3 }, {}]), 0);
  assert.equal(raceOf([{}, {}]), 0);
  assert.equal(raceOf([]), 0);
});

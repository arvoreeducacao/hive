import { test } from "node:test";
import assert from "node:assert/strict";
import { answerHold } from "../engine/protocol.mjs";

function clock() {
  let next = 1;
  const timers = new Map();
  return {
    later: (run, ms) => { const id = next++; timers.set(id, { run, ms }); return id; },
    cancel: (id) => timers.delete(id),
    fire(ms) {
      for (const [id, timer] of [...timers]) {
        if (timer.ms !== ms) continue;
        timers.delete(id);
        timer.run();
      }
    },
    pending: () => [...timers.values()].map((timer) => timer.ms),
  };
}

function bench() {
  const time = clock();
  const delivered = [];
  const hold = answerHold({ deliver: (answer) => delivered.push(answer), pickupMs: 30, later: time.later, cancel: time.cancel });
  return { hold, time, delivered };
}

test("an answer from a seat nobody waits on is not taken", () => {
  const { hold, delivered } = bench();
  assert.equal(hold.take("answerer", { text: "oi" }), false);
  assert.equal(hold.take(null, { text: "oi" }), false);
  assert.deepEqual(delivered, []);
});

test("the asker collects the held answer once, and nothing reaches the conversation", () => {
  const { hold, time, delivered } = bench();
  hold.expect("answerer", 500);
  assert.equal(hold.take("answerer", { text: "shape B", images: ["a.png"], side: "local" }), true);
  assert.deepEqual(hold.collect("answerer"), { text: "shape B", images: ["a.png"] });
  assert.equal(hold.collect("answerer"), null);
  time.fire(30);
  assert.deepEqual(delivered, []);
  assert.deepEqual(hold.waitingOn(), []);
});

test("an answer nobody collects reaches the conversation as a message", () => {
  const { hold, time, delivered } = bench();
  hold.expect("answerer", 500);
  hold.take("answerer", { text: "shape B", side: "cloud" });
  assert.deepEqual(hold.waitingOn(), ["answerer"]);
  time.fire(30);
  assert.deepEqual(delivered, [{ from: "answerer", text: "shape B", images: [], side: "cloud" }]);
  assert.equal(hold.collect("answerer"), null);
  assert.deepEqual(hold.waitingOn(), []);
});

test("giving up on the wait hands an answer that already landed to the conversation", () => {
  const { hold, delivered } = bench();
  hold.expect("answerer", 500);
  hold.take("answerer", { text: "chegou no limite" });
  hold.unexpect("answerer");
  assert.deepEqual(delivered.map((answer) => answer.text), ["chegou no limite"]);
});

test("a wait that runs out on its own stops swallowing what the seat says next", () => {
  const { hold, time } = bench();
  hold.expect("answerer", 500);
  time.fire(500);
  assert.deepEqual(hold.waitingOn(), []);
  assert.equal(hold.take("answerer", { text: "tarde demais" }), false);
});

test("a second answer only goes to the asker after the first one reached the conversation", () => {
  const { hold, delivered } = bench();
  hold.expect("answerer", 500);
  hold.take("answerer", { text: "primeira" });
  hold.expect("answerer", 500);
  hold.take("answerer", { text: "segunda" });
  assert.deepEqual(delivered.map((answer) => answer.text), ["primeira"]);
  assert.deepEqual(hold.collect("answerer"), { text: "segunda", images: [] });
});

test("arming the wait again does not leave the old deadline behind", () => {
  const { hold, time } = bench();
  hold.expect("answerer", 500);
  hold.expect("answerer", 900);
  assert.deepEqual(time.pending(), [900]);
});

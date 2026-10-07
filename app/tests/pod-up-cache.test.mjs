import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

/* `door` is the second witness: what the box says about itself when asked
   directly. It answers no by default, so every test written before it still
   reads the switch as the only voice in the room. */
function switchboard({ answers = ["up"], hasSwitch = true, slow = false, door = false } = {}) {
  const asked = [];
  let waiting = null;
  const world = {
    hasPowerSwitch: () => hasSwitch,
    powerSwitch: (verb) => {
      asked.push(verb);
      const said = { ok: true, out: answers[Math.min(asked.length - 1, answers.length - 1)] };
      if (!slow) return Promise.resolve(said);
      return new Promise((done) => { waiting = () => done(said); });
    },
    DEV: "ada",
    serverAddressOf: () => "https://hive-ada.example",
    askTheDoor: () => Promise.resolve({ ok: door })
  };
  const podUp = new Function(...Object.keys(world), `
    ${slice("const POD_UP_FRESH", "const WAKE_TIMEOUT")}
    return podUp;
  `)(...Object.values(world));
  return { podUp, asked, answer: () => waiting?.() };
}

test("a second ask inside the window is answered without another kubectl", async () => {
  const hive = switchboard();
  assert.equal(await hive.podUp(), true);
  assert.equal(await hive.podUp(), true);
  assert.deepEqual(hive.asked, ["status"], "one panel opening still buys the same answer twice");
});

test("two asks at the same instant share the one process they started", async () => {
  const hive = switchboard({ slow: true });
  const both = Promise.all([hive.podUp(), hive.podUp()]);
  hive.answer();
  assert.deepEqual(await both, [true, true]);
  assert.deepEqual(hive.asked, ["status"]);
});

test("whoever is watching for the pod to change asks fresh", async () => {
  const hive = switchboard({ answers: ["down", "up"] });
  assert.equal(await hive.podUp(), false);
  assert.equal(await hive.podUp({ fresh: true }), true, "the wake loop would wait forever on a cached no");
  assert.deepEqual(hive.asked, ["status", "status"]);
});

const brokenSwitch = (door) => new Function("hasPowerSwitch", "powerSwitch", "DEV", "serverAddressOf", "askTheDoor", `
  ${slice("const POD_UP_FRESH", "const WAKE_TIMEOUT")}
  return podUp;
`)(() => true, () => Promise.reject(new Error("kubectl is not here")), "ada", () => "https://hive-ada.example", () => Promise.resolve({ ok: door }));

test("a switch that broke is never remembered as an answer", async () => {
  const broken = brokenSwitch(false);
  assert.equal(await broken(), false);
  assert.equal(await broken(), false, "a broken switch was cached as a no and stopped being asked");
});

test("a box that opens its own door is up, whatever the switch could not say", async () => {
  const reachable = brokenSwitch(true);
  assert.equal(await reachable(), true, "kubectl was missing, but the server answered for itself");
  assert.equal(await reachable(), true, "and the door's yes is worth remembering");
});

test("a switch that says down is overruled by a door that answers", async () => {
  const asleep = switchboard({ answers: ["down"], door: false });
  assert.equal(await asleep.podUp(), false, "nothing answers, so the box really is down");

  const running = switchboard({ answers: ["down"], door: true });
  assert.equal(await running.podUp(), true, "the switch lagged behind a box that is already serving");
});

test("a hive with no power switch answers without asking anything", async () => {
  const hive = switchboard({ hasSwitch: false });
  assert.equal(await hive.podUp(), true);
  assert.deepEqual(hive.asked, []);
});

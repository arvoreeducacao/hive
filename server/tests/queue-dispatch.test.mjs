import { transferText } from "../engine/transfer-context.mjs";
import { ALREADY_IN_THE_TURN, QUEUE_MISS, frontWishes, queueMiss, sayGate } from "../engine/protocol.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");
const turnDriver = readFileSync(join(HERE, "engine/turn-driver.mjs"), "utf8");

function dispatcher() {
  const source = driver.slice(driver.indexOf("function dispatchSay("), driver.indexOf("const SILENCE_IS_A_WEDGE_MS"));
  const emitted = [];
  const handed = [];
  const gate = sayGate();
  const fronts = frontWishes();
  const dispatchSay = new Function(
    "transferText", "sessionStore", "emit", "ensureAwake", "watchForSilence", "userMessage", "input", "gate", "fronts",
    source + "return dispatchSay;"
  )(
    transferText,
    { meta: {} },
    (event) => emitted.push(event),
    () => {},
    () => {},
    (text, images) => Promise.resolve({ text, images }),
    { push: (message) => handed.push(message) },
    gate,
    fronts
  );
  return { dispatchSay, emitted, handed, gate, fronts };
}

test("a new turn drops the fronts the person approved for the turn before it", () => {
  const d = dispatcher();
  d.fronts.keep([{ name: "loja", agent: "codex", model: "opus", where: "cloud" }]);
  d.dispatchSay({ text: "outra coisa agora", images: [], cid: "c9-zz11x" });
  assert.deepEqual(d.fronts.rows(), []);
});

test("the seat says the moment a queued message enters the turn, with the cid the panel is holding", () => {
  const d = dispatcher();
  d.dispatchSay({ text: "typed while it ran", images: [], cid: "c7-ab12x" });
  assert.deepEqual(d.emitted, [{ type: "driver", subtype: "dispatched", cid: "c7-ab12x" }]);
});

test("a message with no cid — the mission the seat is born with — announces nothing", () => {
  const d = dispatcher();
  d.dispatchSay({ text: "the mission", images: [], cid: null });
  d.dispatchSay(null);
  assert.deepEqual(d.emitted, []);
});

test("the word comes before the handover, so the panel never sees a chip it could still take back", async () => {
  const d = dispatcher();
  d.dispatchSay({ text: "hi", images: [], cid: "c1-aa" });
  assert.equal(d.emitted.length, 1, "the event is out");
  assert.equal(d.handed.length, 0, "the model has not been handed anything yet");
  await Promise.resolve();
  assert.equal(d.handed.length, 1);
});

test("the seats that run one process per turn say it too", () => {
  const runTurn = turnDriver.slice(turnDriver.indexOf("function runTurn("), turnDriver.indexOf("const child = spawn("));
  assert.match(runTurn, /emit\(\{ type: "driver", subtype: "dispatched", cid: turn\.cid \}\)/);
  assert.ok(runTurn.indexOf("subtype: \"dispatched\"") < runTurn.indexOf("emit(initEvent())"), "the chip leaves before the turn opens");
});

test("the gate remembers what it let through, so a late button is told it went in and not that it is unknown", () => {
  const gate = sayGate();
  const first = gate.push({ text: "first", cid: "c1-aa" });
  gate.left(first.cid);
  assert.equal(gate.unsay("c1-aa"), null);
  assert.deepEqual(queueMiss(gate, "c1-aa"), { ok: false, gone: true, error: ALREADY_IN_THE_TURN });
  assert.deepEqual(queueMiss(gate, "c9-zz"), { ok: false, error: QUEUE_MISS });
});

test("a message that went straight into the turn is answered queued false, so the panel never guesses", () => {
  const say = driver.slice(driver.indexOf('if (cmd.type === "say")'), driver.indexOf('if (cmd.type === "expect")'));
  assert.match(say, /if \(goes\) answer\.queued = !item;/);
  assert.equal(/answer\.queued = true/.test(say), false, "a reply that only speaks when it queued leaves the panel guessing");
});

test("send now on a message already in the turn is a yes, not a refusal", () => {
  const saynow = driver.slice(driver.indexOf('if (cmd.type === "saynow")'), driver.indexOf('if (cmd.type === "answer")'));
  assert.match(saynow, /gate\.alreadyLeft\(cmd\.target\) \? \{ ok: true, already: true \}/);
  const unsay = driver.slice(driver.indexOf('if (cmd.type === "unsay")'), driver.indexOf('if (cmd.type === "saynow")'));
  assert.match(unsay, /reply\(queueMiss\(gate, cmd\.target\)\)/);
});

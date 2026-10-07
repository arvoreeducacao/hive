import { readsOnly, wakesTheSeat, answerWhileAsleep } from "../engine/seat-memory.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sayGate, answerHold } from "../engine/protocol.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

function slice(from, to) {
  const a = driver.indexOf(from);
  const b = driver.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of driver.mjs`);
  return driver.slice(a, b);
}

const CATALOGUE = [
  { value: "opus[1m]", resolvedModel: "claude-opus-5[1m]", displayName: "Opus (1M context)", supportedEffortLevels: ["low", "high"] },
  { value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet", supportedEffortLevels: ["low", "high"] },
  { value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku", supportedEffortLevels: [] },
];

function bench({ bornOn = "", setModelImpl, catalogue = CATALOGUE } = {}) {
  const source = `
    let currentModel = ${JSON.stringify(bornOn)};
    let chosenModel = ${JSON.stringify(bornOn)};
    let effortLevel = "";
    const options = {};
    if (chosenModel) options.model = chosenModel;
    let sleeping = false;
    let watched = false;
    const backgroundTasks = new Map();
    const armSleep = () => {};
    const sleepAfter = () => 0;
    ${slice("function handleCommand(cmd, reply)", "const server = createSeatServer")}
    return { handleCommand, peek: () => ({ chosenModel, currentModel, options, effortLevel }) };
  `;
  const persisted = [];
  const emitted = [];
  const opened = [];
  const gate = sayGate();
  const setModel = setModelImpl || (async () => {});
  const make = new Function(
    "emit", "gate", "dispatchSay", "sayEvent", "dismissNote", "pendingQuestions", "session", "name", "seq", "sessionId",
    "persistSession", "peerSayText", "expecting", "sessionStore", "side", "ensureAwake",
    "staleInterrupt", "eventsTrouble", "openSession",
    "readsOnly", "wakesTheSeat", "answerWhileAsleep",
    source
  );
  const built = make(
    (e) => emitted.push(e), gate, () => {}, () => {}, () => {}, new Map(),
    { setModel, supportedModels: async () => catalogue },
    "seat", 0, "", (patch) => persisted.push(patch),
    () => "", answerHold({ deliver: () => {} }), { meta: {} }, "local", () => {}, () => false, { broken: false },
    (freshInput) => opened.push(freshInput),
    readsOnly, wakesTheSeat, answerWhileAsleep
  );
  const ask = (cmd) => new Promise((done) => built.handleCommand(cmd, done));
  return { ask, peek: built.peek, persisted, emitted, opened, gate };
}

const lastModelWritten = (persisted) => persisted.filter((p) => "model" in p).at(-1)?.model;

test("picking a model puts it where a reopened session will read it", async () => {
  const b = bench({ bornOn: "opus[1m]" });
  const reply = await b.ask({ type: "control", op: "setModel", model: "sonnet" });
  assert.equal(reply.ok, true);
  assert.equal(
    b.peek().options.model,
    "sonnet",
    "the options a session reopens with still carry the model the seat was born on — waking up would undo the pick"
  );
});

test("the model a seat is put on is the model written down for it", async () => {
  const b = bench({ bornOn: "opus[1m]" });
  await b.ask({ type: "control", op: "setModel", model: "sonnet" });
  assert.equal(lastModelWritten(b.persisted), "sonnet");
});

test("a hard refusal outside a turn reopens the session instead of pinning the old model forever", async () => {
  const b = bench({ bornOn: "fable", setModelImpl: async () => { throw new Error("the CLI refused this switch"); } });
  const reply = await b.ask({ type: "control", op: "setModel", model: "opus[1m]" });
  assert.equal(reply.ok, true, "a hard refusal should not be the final word when nothing was mid-turn");
  assert.equal(b.peek().chosenModel, "opus[1m]");
  assert.equal(b.peek().options.model, "opus[1m]");
  assert.equal(lastModelWritten(b.persisted), "opus[1m]", "the pick still needs to survive a restart even though the live swap failed");
  assert.equal(b.opened.length, 1, "a fresh session is what actually makes the refused model land");
});

test("a hard refusal mid-turn does not reopen a session under a live generation", async () => {
  const b = bench({ bornOn: "fable", setModelImpl: async () => { throw new Error("the CLI refused this switch"); } });
  b.gate.push({ text: "still going", images: [] });
  const reply = await b.ask({ type: "control", op: "setModel", model: "opus[1m]" });
  assert.equal(reply.ok, false, "mid-turn refusals must not be swallowed into a silent no-op");
  assert.equal(b.opened.length, 0, "reopening underneath a live generation is exactly what this must avoid");
  assert.equal(b.peek().chosenModel, "fable", "an unresolved mid-turn refusal must not pretend the pick already landed");
});

test("going back to the account default clears the pick instead of pinning the old model", async () => {
  const b = bench({ bornOn: "opus[1m]" });
  await b.ask({ type: "control", op: "setModel", model: "" });
  assert.equal(b.peek().options.model, undefined, "an empty pick left the previous model pinned in the options");
  assert.equal(lastModelWritten(b.persisted), null);
});

test("a seat that was never put on a model has none to reopen with", async () => {
  const b = bench();
  assert.equal(b.peek().options.model, undefined);
  await b.ask({ type: "control", op: "setModel", model: "haiku" });
  assert.equal(b.peek().options.model, "haiku");
});

test("what a session reports on init does not overwrite what the person chose", () => {
  const onInit = slice('if (message.type === "system" && message.subtype === "init")', "restoreEffort();");
  assert.match(
    onInit,
    /persistSession\(\{ session_id: sessionId, cwd, model: chosenModel \|\| null/,
    "init writes the birth model back over the pick — every wake-up would undo the chosen model"
  );
});

test("a sentence that fell into the command is not a model this seat will take", async () => {
  const b = bench({ bornOn: "opus[1m]" });
  const junk = "eu foi mo e nao funcionou nao, cliquei pra trocar de modelo e nada";
  const reply = await b.ask({ type: "control", op: "setModel", model: junk });
  assert.equal(reply.ok, false, "anything at all used to travel through here into options.model");
  assert.match(reply.error, /no model called/);
  assert.equal(b.peek().chosenModel, "opus[1m]", "the seat must stay on what it was running");
  assert.equal(b.peek().options.model, "opus[1m]", "the next session would open on a model that does not exist");
  assert.equal(lastModelWritten(b.persisted), undefined, "nothing should have been written down for it");
});

test("a name the catalogue does not carry is refused even when it looks like one", async () => {
  const b = bench({ bornOn: "opus[1m]" });
  const reply = await b.ask({ type: "control", op: "setModel", model: "fable" });
  assert.equal(reply.ok, false, "\"fable\" only ever worked because the CLI happened to know the alias");
  assert.equal(b.peek().options.model, "opus[1m]");
});

test("a catalogue nobody could read does not block a pick", async () => {
  const b = bench({ bornOn: "opus[1m]", catalogue: [] });
  const reply = await b.ask({ type: "control", op: "setModel", model: "sonnet" });
  assert.equal(reply.ok, true, "refusing on a guess would strand the seat whenever the CLI cannot be asked");
  assert.equal(b.peek().options.model, "sonnet");
});

test("a seat that starts again reads back the model it was left on", () => {
  const boot = slice("if (storedSession.effort) effortLevel = storedSession.effort;", "function channel()");
  assert.match(
    boot,
    /if \(!chosenModel && storedSession\.model\)/,
    "the stored effort comes back but the stored model does not, so a restart drops the pick"
  );
});

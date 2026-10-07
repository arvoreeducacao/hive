import { readsOnly, wakesTheSeat, answerWhileAsleep } from "../engine/seat-memory.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dismissNote, sayEvent, sayGate, compactLine, birthsLeft, peerSayText, BIRTHS_MAX, staleInterrupt, answerHold } from "../engine/protocol.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

function slice(from, to) {
  const a = driver.indexOf(from);
  const b = driver.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of driver.mjs`);
  return driver.slice(a, b);
}

function bench({ session = { interrupt: async () => {} } } = {}) {
  const source = slice("function dismissQuestions(text)", "async function canUseTool")
    + slice("function handleCommand(cmd, reply)", "const server = createSeatServer");
  const emitted = [];
  const dispatched = [];
  const pendingQuestions = new Map();
  const gate = sayGate();
  const wakes = [];
  const make = new Function(
    "emit", "gate", "dispatchSay", "sayEvent", "dismissNote", "pendingQuestions", "session", "name", "seq", "sessionId", "persistSession",
    "birthsLeft", "peerSayText", "BIRTHS_MAX", "expecting", "sessionStore", "side", "ensureAwake", "staleInterrupt", "eventsTrouble",
    "currentModel", "chosenModel", "effortLevel",
    "readsOnly", "wakesTheSeat", "answerWhileAsleep",
    `let sleeping = false; let watched = false; const backgroundTasks = new Map(); const armed = []; const armSleep = (ms) => armed.push(ms); const sleepAfter = () => (watched ? 30 : 15); ${source}; return { handleCommand, doze: () => { sleeping = true; }, armed };`
  );
  const { handleCommand: handle, doze, armed } = make(
    (e) => emitted.push(e), gate, (item) => dispatched.push(item), sayEvent, dismissNote,
    pendingQuestions, session, "seat", 0, "", () => {},
    birthsLeft, peerSayText, BIRTHS_MAX, answerHold({ deliver: () => {} }), { meta: {} }, "local", () => wakes.push(Date.now()), staleInterrupt, { broken: false },
    "claude-opus-5", "opus", "high",
    readsOnly, wakesTheSeat, answerWhileAsleep
  );
  const say = (cmd) => {
    let answered = null;
    handle(cmd, (r) => { answered = r; });
    return answered;
  };
  const ask = (cmd) => new Promise((done) => handle(cmd, done));
  return { say, ask, doze, armed, emitted, dispatched, pendingQuestions, gate, wakes };
}

function openQuestion(pendingQuestions, id = "q1") {
  let settled = null;
  pendingQuestions.set(id, (value) => { settled = value; });
  return () => settled;
}

test("a message typed while a card is open drops the question and carries the words to the model", () => {
  const b = bench();
  const settled = openQuestion(b.pendingQuestions);
  const reply = b.say({ type: "say", text: "esquece as opções, vamos por outro caminho" });
  assert.deepEqual(reply, { ok: true, dismissed: 1 });
  assert.match(settled().dismissed, /esquece as opções, vamos por outro caminho/);
  assert.equal(b.pendingQuestions.size, 0);
  assert.equal(b.dispatched.length, 0, "the words already went out as the tool result — sending them twice would repeat them");
});

test("every open card is dropped by one message, not just the last one", () => {
  const b = bench();
  const first = openQuestion(b.pendingQuestions, "q1");
  const second = openQuestion(b.pendingQuestions, "q2");
  assert.equal(b.say({ type: "say", text: "outro caminho" }).dismissed, 2);
  assert.ok(first().dismissed && second().dismissed);
});

test("a message with images is dropped into the queue too, so the pictures still arrive", () => {
  const b = bench();
  openQuestion(b.pendingQuestions);
  b.say({ type: "say", text: "olha isso", images: ["/tmp/a.png"] });
  assert.deepEqual(b.dispatched, [{ text: "olha isso", images: ["/tmp/a.png"], cid: null }]);
});

test("with no card open a message takes the usual road", () => {
  const b = bench();
  assert.deepEqual(b.say({ type: "say", text: "oi" }), { ok: true, dismissed: 0, queued: false });
  assert.deepEqual(b.dispatched, [{ text: "oi", images: [], cid: null }]);
});

test("answering from the card still settles with the answers", () => {
  const b = bench();
  const settled = openQuestion(b.pendingQuestions);
  const reply = b.say({ type: "answer", id: "q1", answers: { "Which color?": "Blue" } });
  assert.deepEqual(reply, { ok: true });
  assert.deepEqual(settled(), { answers: { "Which color?": "Blue" } });
});

test("a question already dropped refuses a late answer", () => {
  const b = bench();
  openQuestion(b.pendingQuestions);
  b.say({ type: "say", text: "outro caminho" });
  assert.match(b.say({ type: "answer", id: "q1", answers: {} }).error, /no pending question/);
});

test("the dropped question reads as dropped in the window log", () => {
  assert.match(compactLine({ type: "driver", subtype: "question_dismissed", id: "q1" }), /dropped q1/);
});

test("uma mensagem acorda o assento adormecido; consultar estado, contexto ou catalogo nao", () => {
  const b = bench();
  b.say({ type: "state" });
  assert.equal(b.wakes.length, 0, "consultar estado nao pode acordar o assento");
  b.say({ type: "control", op: "context" });
  b.say({ type: "control", op: "catalog" });
  b.say({ type: "control", op: "mcp" });
  assert.equal(b.wakes.length, 0, "o painel pergunta contexto e catalogo a todo chat ao abrir: isso nao pode acordar ninguem");
  b.say({ type: "say", text: "oi" });
  assert.equal(b.wakes.length, 1, "mensagem tem que acordar antes de entrar na fila");
  b.say({ type: "interrupt", sent: Date.now() });
  assert.equal(b.wakes.length, 2, "parar o turno tambem passa pelo despertar");
  b.say({ type: "control", op: "setTitle", title: "x" });
  assert.equal(b.wakes.length, 3, "um control que muda algo acorda");
});

test("adormecido, o assento responde contexto e catalogo do que lembra, e diz quando nao lembra", async () => {
  const context = { totalTokens: 12, maxTokens: 200, percentage: 6 };
  const b = bench({ session: { interrupt: async () => {}, getContextUsage: async () => context } });
  const live = await b.ask({ type: "control", op: "context" });
  assert.deepEqual(live, { ok: true, data: context }, "acordado, responde ao vivo e guarda");
  b.doze();
  const ctx = await b.ask({ type: "control", op: "context" });
  assert.deepEqual(ctx, { ok: true, data: context, remembered: true, asleep: true });
  const cat = await b.ask({ type: "control", op: "catalog" });
  assert.equal(cat.ok, false);
  assert.equal(cat.asleep, true);
  assert.equal(b.wakes.length, 0, "nenhuma consulta acordou o assento");
  const state = await b.ask({ type: "state" });
  assert.equal(state.asleep, true, "o estado diz que o assento dorme");
});

test("o painel abrir ou fechar o chat nao acorda ninguem, so muda quanto tempo o assento espera para dormir", async () => {
  const b = bench();
  assert.deepEqual(b.say({ type: "presence", watched: true }), { ok: true, watched: true, sleep_after_ms: 30 });
  assert.equal(b.wakes.length, 0, "abrir o painel nao pode acordar o assento");
  assert.deepEqual(b.armed, [1000], "a troca de prazo confere o sono de novo, sem esperar o prazo antigo");
  assert.equal(b.emitted.filter((e) => e.subtype === "presence").length, 1);
  b.say({ type: "presence", watched: true });
  assert.deepEqual(b.armed, [1000], "repetir o mesmo estado nao mexe em nada");
  assert.deepEqual(b.say({ type: "presence", watched: false }), { ok: true, watched: false, sleep_after_ms: 15 });
  assert.equal((await b.ask({ type: "state" })).watched, false);
  b.doze();
  b.say({ type: "presence", watched: true });
  assert.equal(b.wakes.length, 0, "nem dormindo o painel acorda o assento");
  assert.equal((await b.ask({ type: "state" })).asleep, true);
});

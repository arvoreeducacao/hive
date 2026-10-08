import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { questionCard } = await app("chat-and-panes");
const { answerFromTheDay, closeDay, dayAskCard, dayAsking, dayCards, openDay } = await app("day");

const settle = () => new Promise((done) => setImmediate(done));
const fire = (el, kind) => el.dispatchEvent(new window.MouseEvent(kind, { bubbles: true, cancelable: true }));
const pick = (card, n) => fire(card.querySelectorAll(".qo")[n], "click");
const send = async (card) => { fire(card.querySelector(".qnext"), "click"); await settle(); };
const typeIn = (card, text) => {
  const input = card.querySelector(".qfree input");
  input.value = text;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  return input;
};
const errOf = (card) => card.querySelector(".qerr").textContent;

const ONE = [{ header: "conserto", question: "por onde o áudio volta?", options: [
  { label: "CloudFront", description: "desfaz em um deploy" },
  { label: "CORS no bucket", description: "mexe em produção" }
] }];

const took = () => {
  const seen = [];
  return { seen, send: (answers) => { seen.push(answers); return { ok: true }; } };
};

test("picking an option and sending answers with the label, keyed by the question", async () => {
  const got = took();
  const card = questionCard(ONE, got.send);
  pick(card, 0);
  await send(card);
  assert.deepEqual(got.seen, [{ "por onde o áudio volta?": "CloudFront" }]);
  assert.ok(card.classList.contains("answered"), "the card does not show it was answered");
});

test("what an option means is on the card, not hidden behind the mouse", () => {
  const card = questionCard(ONE, took().send);
  assert.deepEqual([...card.querySelectorAll(".qod")].map((d) => d.textContent),
    ["desfaz em um deploy", "mexe em produção"],
    "the description of an option is only a tooltip again — nobody reads it without hovering");
});

test("an option with nothing to explain gets no empty line under it", () => {
  const card = questionCard([{ header: "repos", question: "quais repos?", options: [
    { label: "api" }, { label: "frontend", description: "só a tela" }
  ] }], took().send);
  assert.deepEqual([...card.querySelectorAll(".qod")].map((d) => d.textContent), ["só a tela"]);
});

test("nothing picked, nothing sent — the send button holds until there is an answer", () => {
  const got = took();
  const card = questionCard(ONE, got.send);
  assert.equal(card.querySelector(".qnext").disabled, true);
  pick(card, 1);
  assert.equal(card.querySelector(".qnext").disabled, false);
});

test("your own words beat the options, and clear the one you had picked", async () => {
  const got = took();
  const card = questionCard(ONE, got.send);
  pick(card, 0);
  typeIn(card, "nenhuma das duas — mede primeiro");
  assert.deepEqual([...card.querySelectorAll(".qo")].filter((b) => b.classList.contains("sel")), [], "the option stayed picked under the typed answer");
  await send(card);
  assert.deepEqual(got.seen, [{ "por onde o áudio volta?": "nenhuma das duas — mede primeiro" }]);
});

test("a question that takes many keeps every pick, as a list", async () => {
  const got = took();
  const card = questionCard([{ header: "repos", question: "quais repos?", multiSelect: true, options: [
    { label: "api" }, { label: "frontend" }, { label: "acme" }
  ] }], got.send);
  pick(card, 0);
  pick(card, 2);
  await send(card);
  assert.deepEqual(got.seen, [{ "quais repos?": ["api", "acme"] }]);
  pick(card, 0);
});

test("two questions are one card: the first pick walks to the second, and only then it sends", async () => {
  const got = took();
  const card = questionCard([
    { header: "a", question: "primeira?", options: [{ label: "sim" }, { label: "não" }] },
    { header: "b", question: "segunda?", options: [{ label: "agora" }, { label: "depois" }] }
  ], got.send);
  const steps = [...card.querySelectorAll(".qstep")];
  assert.deepEqual(steps.map((s) => s.hidden), [false, true]);
  pick(card, 0);
  assert.deepEqual(steps.map((s) => s.hidden), [true, false], "picking the first answer did not walk to the second question");
  assert.deepEqual(got.seen, [], "it sent a half answered card");
  pick(card, 2);
  await send(card);
  assert.deepEqual(got.seen, [{ "primeira?": "sim", "segunda?": "agora" }]);
});

test("a refused answer says why and stays open, because the question is still there", async () => {
  const card = questionCard(ONE, () => ({ ok: false, error: "no pending question q-9" }));
  pick(card, 0);
  await send(card);
  assert.equal(card.classList.contains("answered"), false, "the card cleared itself over an answer that never landed");
  assert.match(errOf(card), /no pending question q-9/);
  assert.equal(card.querySelector(".qnext").disabled, false, "there is no way to try again");
});

test("a refusal with no reason still says something, never an empty red line", async () => {
  const card = questionCard(ONE, () => ({ ok: false }));
  pick(card, 0);
  await send(card);
  assert.ok(errOf(card).trim());
});

test("one send at a time — a second click while it travels does not answer twice", async () => {
  let waiting;
  const seen = [];
  const card = questionCard(ONE, (answers) => {
    seen.push(answers);
    return new Promise((done) => { waiting = done; });
  });
  pick(card, 0);
  send(card);
  send(card);
  assert.equal(seen.length, 1, "the answer went out twice");
  waiting({ ok: true });
});

const calls = [];
let reply = { ok: true };
let blowUp = false;

globalThis.fetch = (path, options) => {
  calls.push({ path: String(path), body: options?.body ? JSON.parse(options.body) : null });
  if (String(path).startsWith("/api/answer")) {
    if (blowUp) return Promise.reject(new Error("the app is not answering"));
    return Promise.resolve({ ok: true, json: async () => reply, text: async () => JSON.stringify(reply) });
  }
  const hive = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" }, day: st.data?.day };
  return Promise.resolve({ ok: true, json: async () => hive, text: async () => JSON.stringify(hive) });
};

const dayOf = (asks) => ({
  needsYou: [{ errand: "áudio mudo", seats: [{ name: "crm-audio", where: "local", asks }] }],
  cameBack: [{ errand: "ped-42", seats: [{ name: "ped-42", where: "local", asks: [{ id: "q-old", questions: ONE }] }] }],
  onTheWay: [],
  byHand: []
});

const fresh = ({ answers = { ok: true }, throws = false } = {}) => {
  calls.length = 0;
  reply = answers;
  blowUp = throws;
  dayCards.clear();
  closeDay();
};

const paths = () => calls.map((one) => one.path);

test("only the band that waits on you offers a question to answer", () => {
  fresh();
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }]));
  assert.deepEqual([...open.keys()], ["q-1"], "a question was picked up from a band that has nothing pending");
  assert.equal(open.get("q-1").seat.name, "crm-audio");
  assert.deepEqual(open.get("q-1").questions, ONE);
});

test("a repaint hands back the same card, so an answer half typed is not thrown away", () => {
  fresh();
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }]));
  const first = dayAskCard("q-1", open.get("q-1"));
  assert.equal(dayAskCard("q-1", open.get("q-1")), first);
});

test("the answer carries the seat and the question, and the day is pulled again after it lands", async () => {
  fresh();
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }]));
  const card = dayAskCard("q-1", open.get("q-1"));
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" }, day: dayOf([{ id: "q-1", questions: ONE }]) };
  openDay();
  document.getElementById("day-count").textContent = "stale";
  calls.length = 0;
  pick(card, 0);
  await send(card);
  for (let i = 0; i < 6; i++) await settle();
  assert.deepEqual(calls[0], { path: "/api/answer", body: {
    name: "crm-audio", where: "local", id: "q-1", answers: { "por onde o áudio volta?": "CloudFront" }
  } });
  assert.ok(paths().includes("/api/hive"), "the day was never pulled again");
  assert.notEqual(document.getElementById("day-count").textContent, "stale", "the day screen was left showing what it had before the answer");
  assert.ok(card.classList.contains("answered"));
  assert.equal(dayCards.get("q-1"), card,
    "the card was thrown away before the poll caught up, so a question already answered comes back looking open");
  closeDay();
});

test("a card the poll no longer shows is let go, and one still pending is kept", () => {
  fresh();
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }, { id: "q-2", questions: ONE }]));
  dayAskCard("q-1", open.get("q-1"));
  dayAskCard("q-2", open.get("q-2"));
  const still = dayAsking(dayOf([{ id: "q-2", questions: ONE }]));
  for (const id of [...dayCards.keys()]) if (!still.has(id)) dayCards.delete(id);
  assert.deepEqual([...dayCards.keys()], ["q-2"]);
});

test("a refused answer keeps the card on the screen and does not pretend the day changed", async () => {
  fresh({ answers: { error: "no pending question q-1" } });
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }]));
  const card = dayAskCard("q-1", open.get("q-1"));
  pick(card, 0);
  await send(card);
  for (let i = 0; i < 4; i++) await settle();
  assert.match(errOf(card), /no pending question q-1/);
  assert.equal(dayCards.has("q-1"), true);
  assert.deepEqual(paths(), ["/api/answer"], "a refusal still went and pulled the day");
});

test("an app that does not answer at all says so on the card instead of losing the answer", async () => {
  fresh({ throws: true });
  const open = dayAsking(dayOf([{ id: "q-1", questions: ONE }]));
  const card = dayAskCard("q-1", open.get("q-1"));
  pick(card, 0);
  await send(card);
  for (let i = 0; i < 4; i++) await settle();
  assert.match(errOf(card), /the app is not answering/);
  assert.equal(dayCards.has("q-1"), true);
});

test("an answer that lands hands the card back as taken, whoever asked for it", async () => {
  fresh();
  const seat = { name: "crm-audio", where: "local" };
  const said = await answerFromTheDay(seat, "q-1", { "por onde o áudio volta?": "CloudFront" });
  assert.deepEqual(said, { ok: true });
  assert.equal(calls[0].path, "/api/answer");
});

test("an answer sent from your own words leaves the field, and the focus goes back to the chat box", async () => {
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-scroll"></div><form class="sv-composer"><textarea></textarea></form>`;
  document.body.appendChild(host);
  const card = questionCard(ONE, took().send);
  host.querySelector(".sv-scroll").appendChild(card);
  const input = typeIn(card, "mede primeiro");
  input.focus();
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await settle();
  assert.ok(card.classList.contains("answered"));
  assert.equal(card.inert, true, "the answered card still takes clicks and typing");
  assert.equal(document.activeElement, host.querySelector(".sv-composer textarea"), "the focus stayed on the answered field");
  host.remove();
});

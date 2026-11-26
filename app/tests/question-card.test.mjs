import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const { svConvFlushAll } = await app("conversation-model");
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { answerQuestion, closeQuestion, questionCard } = await app("question-card");

const ONE = [{ header: "conserto", question: "por onde o áudio volta?", options: [
  { label: "CloudFront", description: "desfaz em um deploy" },
  { label: "CORS no bucket" }
] }];

const settle = () => new Promise((done) => setImmediate(done));
const fire = (el, kind) => el.dispatchEvent(new window.MouseEvent(kind, { bubbles: true, cancelable: true }));
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

const turn = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

const inAChat = (card) => {
  const chat = document.createElement("div");
  chat.className = "sv";
  const composer = document.createElement("div");
  composer.className = "sv-composer";
  const box = document.createElement("textarea");
  composer.append(box);
  chat.append(card, composer);
  document.body.append(chat);
  return { chat, box };
};

const asked = (name) => {
  const e = getStructured({ name, where: "local" });
  e.ws = { readyState: 1, send: () => {} };
  svEvent(e, { type: "driver", subtype: "question", id: "q-7", questions: ONE });
  return { e, card: (svConvFlushAll(), e.host).querySelector(".sv-q") };
};

test("the card in the chat carries the id of the question it asks", () => {
  const { card } = asked("question-card-id");
  assert.equal(card.dataset.id, "q-7");
  assert.equal(questionCard(ONE, () => ({ ok: true })).hasAttribute("data-id"), false, "a card asked from the day panel got an id it never had");
});

test("a question the chat dropped keeps its summary, then says why it was dropped", () => {
  const { e, card } = asked("question-card-dropped");
  svEvent(e, { type: "driver", subtype: "question_dismissed", id: "q-7" });
  assert.ok(["answered", "summed", "dropped"].every((one) => card.classList.contains(one)), card.className);
  assert.equal(card.inert, true, "a dropped card still takes clicks and typing");
  assert.deepEqual([...card.children].slice(-2).map((one) => one.className), ["qsum", "qdesc"]);
  assert.equal(card.querySelector(".qsum-a").textContent, "dropped");
  assert.equal(card.querySelector(".qdesc").textContent, "dropped — you said it in the chat instead");
});

test("a question that failed says what the driver said about it", () => {
  const { e, card } = asked("question-card-failed");
  svEvent(e, { type: "driver", subtype: "question_failed", id: "q-7", error: "the answer was not one of the options" });
  assert.equal(card.querySelector(".qdesc").textContent, "dropped — the answer was not one of the options");
  assert.equal(e.asked.has("q-7"), false);
});

test("an answered question with nothing to say has no drop note", () => {
  const { e, card } = asked("question-card-answered");
  svEvent(e, { type: "driver", subtype: "question_answered", id: "q-7", answers: { "por onde o áudio volta?": "CloudFront" } });
  assert.equal(card.classList.contains("dropped"), false);
  assert.equal(card.querySelector(".qdesc"), null);
  assert.equal(card.querySelector(".qsum-a").textContent, "CloudFront");
});

test("closing a card that held the focus hands it to the chat box; the composer's own answer leaves the focus alone", () => {
  const closed = questionCard(ONE, () => ({ ok: true }));
  const one = inAChat(closed);
  closed.querySelector(".qo").focus();
  closeQuestion(closed);
  assert.equal(document.activeElement, one.box, "the focus stayed inside an answered card");
  one.chat.remove();
  const answered = questionCard(ONE, () => ({ ok: true }));
  const two = inAChat(answered);
  answered.querySelector(".qo").focus();
  answerQuestion(answered);
  assert.notEqual(document.activeElement, two.box, "the composer's answer moved the focus it never moved");
  assert.ok(answered.classList.contains("answered"));
  assert.equal(answered.inert, true);
  two.chat.remove();
});

test("with the flag, later folds the card and gives the focus to the chat box; the wake brings it back to the picked option", async () => {
  turn(true);
  try {
    const card = questionCard(ONE, () => ({ ok: true }));
    const { chat, box } = inAChat(card);
    assert.equal(card.querySelector(".qwake").textContent, "", "the wake button speaks before the card was ever put off");
    const options = card.querySelectorAll(".qo");
    assert.deepEqual([...options].map((one) => one.getAttribute("aria-pressed")), ["false", "false"]);
    fire(options[1], "click");
    assert.deepEqual([...options].map((one) => one.getAttribute("aria-pressed")), ["false", "true"]);
    options[1].focus();
    key(options[1], "Escape");
    assert.ok(card.classList.contains("later"));
    assert.equal(document.activeElement, box, "putting the card off left the focus on a folded card");
    assert.match(card.querySelector(".qwake").textContent, /por onde o áudio volta\?/);
    fire(card.querySelector(".qwake"), "click");
    assert.ok(!card.classList.contains("later"));
    assert.equal(document.activeElement, options[1], "waking the card did not land on the option already picked");
    await settle();
    chat.remove();
  } finally {
    turn(false);
  }
});

test("with the flag, answering the first of two questions walks to the second and puts the focus on its first option", () => {
  turn(true);
  try {
    const card = questionCard([
      { header: "a", question: "primeira?", options: [{ label: "sim" }, { label: "não" }] },
      { header: "b", question: "segunda?", options: [{ label: "agora" }, { label: "depois" }] }
    ], () => ({ ok: true }));
    const { chat } = inAChat(card);
    const steps = card.querySelectorAll(".qstep");
    fire(steps[0].querySelectorAll(".qo")[0], "click");
    fire(card.querySelector(".qnext"), "click");
    assert.equal(document.activeElement, steps[1].querySelector(".qo"));
    assert.match(steps[1].querySelector(".qhint").textContent, /^pick one with 1–2 · ↵ sends the answer$/i);
    chat.remove();
  } finally {
    turn(false);
  }
});

test("without the flag an option carries no pressed state, as main has it", () => {
  const card = questionCard(ONE, () => ({ ok: true }));
  assert.deepEqual([...card.querySelectorAll(".qo")].map((one) => one.hasAttribute("aria-pressed")), [false, false]);
  assert.equal(card.querySelector(".qn").className, "qn");
});

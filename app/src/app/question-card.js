import { questionCardView } from "../views.js";
import { phrase, raycastOn, svgIcon } from "./core.js";

const questionCards = new WeakMap();


function answerOf(card, q) {
  const free = (card.typed.get(q?.question) || "").trim();
  return free ? [free] : (card.chosen.get(q?.question) || []);
}

function hintOf(card, q, i) {
  const total = card.questions.length;
  if (!card.raycast) {
    return q.multiSelect
      ? phrase("pick as many as you like, then {n}", { n: i < total - 1 ? phrase("next") : phrase("send") })
      : phrase("pick one");
  }
  const n = Math.min(9, q?.options?.length || 0);
  const pick = n ? (q?.multiSelect ? phrase("pick as many as you like with 1–{n}", { n }) : phrase("pick one with 1–{n}", { n })) : "";
  const go = i < total - 1 ? phrase("↵ answers and opens question {a} of {b}", { a: i + 2, b: total }) : phrase("↵ sends the answer");
  return [pick, go].filter(Boolean).join(" · ");
}

function titleOf(card, q) {
  if (!card.raycast) return q.header || phrase("question");
  return q.header ? `${phrase("question")} · ${q.header}` : phrase("question");
}

function nextLabel(card) {
  if (card.sending) return phrase("sending…");
  if (card.raycast) return phrase("Answer");
  return card.at === card.questions.length - 1 ? phrase("send") : phrase("next");
}

function questionModel(card) {
  const total = card.questions.length;
  return {
    id: card.id,
    raycast: card.raycast,
    at: card.at,
    steps: card.questions.map((q, qi) => {
      const picked = card.chosen.get(q.question) || [];
      return {
        key: String(qi),
        title: titleOf(card, q),
        count: total > 1 ? `${qi + 1}/${total}` : "",
        question: q.question,
        hint: hintOf(card, q, qi),
        typed: card.typed.get(q.question) || "",
        options: (q.options || []).map((o, oi) => ({ key: String(oi), digit: oi < 9 ? String(oi + 1) : "", label: o.label, description: o.description || "", picked: picked.includes(o.label) }))
      };
    }),
    placeholder: phrase("or answer in your own words"),
    marks: { check: svgIcon("i-check"), chosen: phrase("chosen") },
    back: `← ${phrase("back")}`,
    laterLabel: phrase("Later"),
    next: nextLabel(card),
    nextKey: card.raycast ? "↵" : "⇧⏎",
    nextOff: card.sending || !answerOf(card, card.questions[card.at]).length,
    error: card.error,
    later: card.later,
    wake: card.wake,
    answered: card.answered,
    refocus: card.refocus,
    summed: card.summed,
    summary: card.summary,
    note: card.note
  };
}

const paint = (card) => card.view?.show(questionModel(card));

function goTo(card, n) {
  card.at = Math.max(0, Math.min(card.questions.length - 1, n));
  paint(card);
}

function settle(card, refocus) {
  card.answered = true;
  card.refocus = refocus;
  paint(card);
}

function submitAnswers(card) {
  if (card.sending) return;
  const answers = {};
  for (let i = 0; i < card.questions.length; i++) {
    const q = card.questions[i];
    const got = answerOf(card, q);
    if (!got.length) return goTo(card, i);
    answers[q.question] = q.multiSelect ? got : got[0];
  }
  card.sending = true;
  card.error = "";
  paint(card);
  Promise.resolve(card.send(answers)).then((r) => {
    card.sending = false;
    if (r?.ok) return settle(card, true);
    card.error = r?.error || phrase("the answer did not land — try again");
    paint(card);
  });
}

function pickOption(card, qi, oi) {
  const q = card.questions[qi];
  const label = q?.options?.[oi]?.label;
  if (!q) return;
  card.typed.delete(q.question);
  const got = card.chosen.get(q.question) || [];
  if (q.multiSelect) {
    const was = got.indexOf(label);
    if (was >= 0) got.splice(was, 1); else got.push(label);
    card.chosen.set(q.question, got);
    return paint(card);
  }
  card.chosen.set(q.question, [label]);
  if (!card.raycast && qi < card.questions.length - 1) return goTo(card, qi + 1);
  paint(card);
}

function typeAnswer(card, qi, text) {
  const q = card.questions[qi];
  card.typed.set(q.question, text);
  if (text.trim()) card.chosen.delete(q.question);
  paint(card);
}

function enterAnswer(card, qi) {
  const q = card.questions[qi];
  if (!answerOf(card, q).length) return;
  if (qi < card.questions.length - 1) return goTo(card, qi + 1);
  submitAnswers(card);
}

function putOff(card, off) {
  card.later = off;
  card.wake = { question: card.questions[card.at]?.question || "", go: phrase("answer") };
  paint(card);
}

function questionCard(questions, send, id) {
  const card = {
    id, questions, send, raycast: raycastOn(), at: 0, chosen: new Map(), typed: new Map(), sending: false, error: "",
    later: false, wake: null, answered: false, refocus: false, summed: false, summary: [], note: "", view: null
  };
  card.view = questionCardView(questionModel(card), {
    pick: (qi, oi) => pickOption(card, qi, oi),
    type: (qi, text) => typeAnswer(card, qi, text),
    enter: (qi) => enterAnswer(card, qi),
    go: (n) => goTo(card, n),
    next: () => (card.at === card.questions.length - 1 ? submitAnswers(card) : goTo(card, card.at + 1)),
    putOff: (off) => putOff(card, off)
  });
  questionCards.set(card.view.el, card);
  return card.view.el;
}

function closeQuestion(el) {
  const card = questionCards.get(el);
  if (card) settle(card, true);
}

function answerQuestion(el) {
  const card = questionCards.get(el);
  if (card) settle(card, false);
}

function dropQuestion(el, note) {
  const card = questionCards.get(el);
  if (!card) return;
  card.note = note;
  paint(card);
}

function sumQuestion(el, rows) {
  const card = questionCards.get(el);
  if (!card) return;
  card.summed = true;
  card.summary = rows.map((row, at) => ({ key: String(at), question: row.question, answer: row.answer }));
  paint(card);
}

export { answerQuestion, closeQuestion, dropQuestion, questionCard, sumQuestion };

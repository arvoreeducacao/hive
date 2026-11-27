import { esc, phrase, renderMarkdown } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { composerLive, onComposerMode, paintComposer } from "./composer-modes.js";
import { answerQuestion, sumQuestion } from "./question-card.js";
import { structPool } from "./structured-seats.js";

const TYPING_SETTLES_MS = 1500;

const asksOfCards = new WeakMap();

function newAsk(ev) {
  const questions = Array.isArray(ev.questions) ? ev.questions : [];
  return { id: ev.id, questions, at: 0, chosen: questions.map(() => []), typed: questions.map(() => ""), files: questions.map(() => []), folded: false, sending: false, submitted: false, error: "", saved: null, start: null, waiting: false };
}

function typingNow(e) {
  const box = e.box?.textarea;
  if (!box || document.activeElement !== box) return false;
  return Date.now() - (e.lastKeyAt || 0) < TYPING_SETTLES_MS;
}

function waitForTyping(e, ask) {
  clearTimeout(ask.settle);
  if (!typingNow(e)) {
    ask.waiting = false;
    return;
  }
  ask.waiting = true;
  ask.settle = setTimeout(() => {
    if (e.ask !== ask) return;
    waitForTyping(e, ask);
    paintComposer(e);
  }, TYPING_SETTLES_MS - (Date.now() - (e.lastKeyAt || 0)) + 20);
}

function noteAsk(e, ev, card) {
  if (card) asksOfCards.set(card, Array.isArray(ev.questions) ? ev.questions : []);
  if (e.ask) dropAsk(e);
  e.ask = newAsk(ev);
  waitForTyping(e, e.ask);
  paintComposer(e);
}

function askSettles(e) {
  const ask = e.ask;
  if (!ask?.waiting) return;
  clearTimeout(ask.settle);
  ask.waiting = false;
  paintComposer(e);
}

const askActive = (e) => !!e.ask && !e.ask.waiting;

const readyFiles = (ask, at) => (ask.files?.[at] || []).filter((rec) => rec.state === "ready" && rec.path);

const filesWaiting = (ask, at) => (ask.files?.[at] || []).some((rec) => rec.state !== "ready");

function answerOf(ask, at) {
  const typed = String(ask.typed[at] || "").trim();
  if (typed) return [typed];
  if (ask.chosen[at]?.length) return ask.chosen[at];
  return readyFiles(ask, at).length ? [""] : [];
}

const attachmentLine = (rec) => `Attached ${rec.kind === "image" ? "image" : "file"} "${rec.name}": "${rec.path}"`;

function answerWithAttachments(answer, records) {
  const lines = (records || []).filter((rec) => rec?.path).map(attachmentLine).join("\n");
  if (!lines) return answer;
  if (Array.isArray(answer)) return [...answer.filter((one) => one !== ""), lines];
  const said = String(answer ?? "");
  return said ? `${said}\n\n${lines}` : lines;
}

const askComplete = (ask) => ask.questions.every((_, at) => answerOf(ask, at).length > 0);

const hasReview = (ask) => ask.questions.length > 1;

const reviewing = (ask) => !!ask && hasReview(ask) && ask.at >= ask.questions.length;

const lastStep = (ask) => (hasReview(ask) ? ask.questions.length : ask.questions.length - 1);

function nextStop(ask) {
  const total = ask.questions.length;
  for (let step = 1; step < total; step++) {
    const at = (ask.at + step) % total;
    if (!answerOf(ask, at).length) return at;
  }
  return hasReview(ask) ? total : ask.at;
}

function takeBox(e, ask) {
  if (!e.box || ask.saved) return;
  e.holding = true;
  ask.saved = e.box.snapshot();
  e.box.restore(ask.start || { text: "" });
  e.holding = false;
}

function giveBox(e, ask) {
  if (!e.box || !ask?.saved) return;
  e.holding = true;
  e.box.restore(ask.saved);
  ask.saved = null;
  e.holding = false;
}

function readTyped(e) {
  const ask = e.ask;
  if (!ask?.saved || !e.box || reviewing(ask)) return;
  ask.typed[ask.at] = e.box.textarea.value;
}

function showQuestion(e, at) {
  const ask = e.ask;
  readTyped(e);
  ask.at = Math.max(0, Math.min(lastStep(ask), at));
  if (ask.saved && e.box) {
    e.holding = true;
    e.box.restore({ text: reviewing(ask) ? "" : ask.typed[ask.at] || "" });
    e.holding = false;
  }
  ask.error = "";
  paintComposer(e);
}

function stepAsk(e, d) {
  askSettles(e);
  if (!askActive(e) || e.ask.sending) return;
  showQuestion(e, e.ask.at + d);
}

function goToStep(e, at) {
  askSettles(e);
  if (!askActive(e) || e.ask.sending || !Number.isInteger(at)) return;
  showQuestion(e, at);
}

function confirmAsk(e) {
  askSettles(e);
  if (askActive(e)) advanceAsk(e);
}

function advanceAsk(e) {
  const ask = e.ask;
  if (!ask || ask.sending) return;
  readTyped(e);
  if (reviewing(ask) || !hasReview(ask)) return submitAsk(e);
  if (!answerOf(ask, ask.at).length) return;
  showQuestion(e, nextStop(ask));
}

function submitAsk(e) {
  const ask = e.ask;
  const missing = ask.questions.findIndex((_, at) => !answerOf(ask, at).length);
  if (missing >= 0) return showQuestion(e, missing);
  if (ask.questions.some((_, at) => filesWaiting(ask, at))) {
    ask.error = phrase("Wait for attachments to finish uploading, or remove failed uploads.");
    return paintComposer(e);
  }
  const answers = {};
  ask.questions.forEach((q, at) => { answers[q.question] = answerWithAttachments(q.multiSelect ? answerOf(ask, at) : answerOf(ask, at)[0], readyFiles(ask, at)); });
  ask.sending = true;
  ask.error = "";
  paintComposer(e);
  Promise.resolve(e.box?.answer(ask.id, answers)).then((r) => {
    if (e.ask !== ask) return;
    if (r?.ok) {
      ask.submitted = true;
      if (r.card) answerQuestion(r.card);
      return closeAsk(e, { id: ask.id, subtype: "question_answered", answers }, r.card);
    }
    ask.sending = false;
    ask.error = r?.error || phrase("the answer did not land — try again");
    paintComposer(e);
  });
}

function pickOption(e, i) {
  const ask = e.ask;
  const q = ask?.questions[ask.at];
  const option = q?.options?.[i];
  if (!option || ask.sending) return;
  askSettles(e);
  readTyped(e);
  const typed = String(ask.typed[ask.at] || "").trim();
  if (typed) {
    if (ask.saved) ask.saved = { ...ask.saved, text: ask.saved.text?.trim() ? `${ask.saved.text.replace(/\s+$/, "")}\n\n${typed}` : typed };
    ask.typed[ask.at] = "";
    e.holding = true;
    e.box?.restore({ text: "" });
    e.holding = false;
  }
  const got = ask.chosen[ask.at];
  if (q.multiSelect) {
    const was = got.indexOf(option.label);
    if (was >= 0) got.splice(was, 1);
    else got.push(option.label);
    return paintComposer(e);
  }
  ask.chosen[ask.at] = [option.label];
  paintComposer(e);
}

function foldAsk(e) {
  if (!e.ask) return;
  e.ask.folded = !e.ask.folded;
  paintComposer(e);
}

function returnAskFiles(e, ask) {
  if (ask.submitted || !e.box?.merge) return;
  const left = (ask.files || []).flat().filter((rec) => rec.state === "ready" && rec.path);
  if (!left.length) return;
  const images = left.filter((rec) => rec.kind === "image");
  const files = left.filter((rec) => rec.kind !== "image");
  const text = [...images.map((_, i) => `[Image #${i + 1}]`), ...files.map((_, i) => `[File #${i + 1}]`)].join(" ");
  e.box.merge({ text, images: images.map((rec, i) => [i + 1, rec.path]), files: files.map((rec, i) => [i + 1, { path: rec.path, name: rec.name, size: rec.size, type: rec.type }]) });
}

function dropAsk(e) {
  const ask = e.ask;
  if (!ask) return;
  clearTimeout(ask.settle);
  e.ask = null;
  giveBox(e, ask);
  returnAskFiles(e, ask);
  paintComposer(e);
}

function answerSaid(ask, at) {
  const said = answerOf(ask, at).filter(Boolean).join(", ");
  const files = readyFiles(ask, at).length;
  return [said, files ? phrase("attachments: {count}", { count: files }) : ""].filter(Boolean).join(" · ");
}

function askNav(ask) {
  if (!hasReview(ask)) return "";
  const review = reviewing(ask);
  const page = review ? `<span class="cp-ask-page" role="img" aria-label="${esc(phrase("Review"))}">${composerIcon("check")}</span>`
    : `<span class="cp-ask-page">${ask.at + 1}/${ask.questions.length}</span>`;
  return `<span class="cp-ask-nav" role="group" aria-label="${esc(phrase("Questions"))}">`
    + `<button type="button" class="cp-ask-arrow" data-act="ask-step" data-d="-1" aria-label="${esc(phrase("Previous question"))}"${ask.at === 0 || ask.sending ? " disabled" : ""}>${composerIcon("chevronDown")}</button>`
    + page
    + `<button type="button" class="cp-ask-arrow next" data-act="ask-step" data-d="1" aria-label="${esc(phrase("Next question"))}"${review || ask.sending ? " disabled" : ""}>${composerIcon("chevronDown")}</button>`
    + `</span>`;
}

function askTop(ask, head, line) {
  const fold = ask.folded;
  const title = fold ? phrase("Show the question and its options") : phrase("Hide the question and its options");
  return `<div class="cp-ask-top"><button type="button" class="cp-brow cp-ask-head" data-act="ask-fold" title="${esc(title)}" aria-expanded="${!fold}">`
    + `<span class="cp-bc"><span class="cp-ask-h">${esc(head)}</span><span class="cp-bfold${fold ? "" : " open"}">${composerIcon("chevronDown")}</span>`
    + `${fold ? `<span class="cp-ask-line">${esc(line)}</span>` : ""}</span></button>${askNav(ask)}</div>`;
}

function askFoot(e) {
  const said = askPrimary(e);
  return `<div class="cp-ask-foot"><button type="button" class="cp-ask-go" data-act="ask-confirm"${said.disabled ? " disabled" : ""}>${esc(said.label)}</button></div>`;
}

function askSection(e, kind, head, line, body) {
  const fold = e.ask.folded;
  return `<section class="cp-ban cp-ask${kind}" data-fold="${fold ? "collapsed" : "expanded"}">`
    + askTop(e.ask, head, line)
    + (fold ? "" : `<div class="cp-ask-body">${body}${e.ask.error ? `<div class="cp-ask-err">${esc(e.ask.error)}</div>` : ""}</div>${askFoot(e)}`)
    + `</section>`;
}

function reviewBanner(e) {
  const ask = e.ask;
  const rows = ask.questions.map((q, at) => {
    const said = answerSaid(ask, at);
    return `<button type="button" class="cp-ask-sum" data-act="ask-to" data-at="${at}" title="${esc(phrase("Change this answer"))}"${ask.sending ? " disabled" : ""}>`
      + `<span class="cp-ask-sum-q">${esc(q.header || q.question || "")}</span>`
      + `<span class="cp-ask-sum-a${said ? "" : " missing"}">${esc(said || phrase("No answer yet"))}</span></button>`;
  }).join("");
  const line = ask.questions.map((q, at) => `${q.header || q.question || ""}: ${answerSaid(ask, at) || "—"}`).join(" · ");
  return askSection(e, " cp-ask-review", phrase("Review"), line, `<div class="cp-ask-sums">${rows}</div>`);
}

function askBanner(e) {
  const ask = e.ask;
  if (reviewing(ask)) return reviewBanner(e);
  const q = ask.questions[ask.at] || {};
  const typed = String(ask.typed[ask.at] || "").trim();
  const chosen = ask.chosen[ask.at] || [];
  const options = (q.options || []).map((o, i) => {
    const on = !typed && chosen.includes(o.label);
    const desc = o.description && o.description !== o.label ? `<span class="cp-opt-d">${esc(o.description)}</span>` : "";
    const key = i < 9 ? ` title="${esc(phrase("Shortcut: {key}", { key: i + 1 }))}" aria-keyshortcuts="${i + 1}"` : "";
    return `<button type="button" class="cp-opt" data-act="ask-pick" data-i="${i}" aria-pressed="${on}"${key}${ask.sending ? " disabled" : ""}>`
      + `<span class="cp-opt-mark"><span class="${q.multiSelect ? "cp-check" : "cp-radio"}">${q.multiSelect && on ? composerIcon("check") : ""}</span></span>`
      + `<span class="cp-opt-body"><span class="cp-opt-l">${esc(o.label)}</span>${desc}</span></button>`;
  }).join("");
  const body = `<div class="cp-ask-q md">${renderMarkdown(String(q.question || ""))}</div><div class="cp-ask-opts">${options}</div>`;
  return askSection(e, "", q.header || phrase("Question"), q.question || "", body);
}

function closeAsk(e, ev, card) {
  if (e.ask?.id === ev.id) dropAsk(e);
  if (!card) return;
  const questions = asksOfCards.get(card) || [];
  const answers = ev.answers || null;
  const said = (q) => {
    if (ev.subtype !== "question_answered") return phrase("dropped");
    const got = answers?.[q.question];
    if (Array.isArray(got)) return got.join(", ");
    return got ? String(got) : phrase("answered");
  };
  sumQuestion(card, questions.map((q) => ({ question: q.question || q.header || "", answer: said(q) })));
}

function answerDigit(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || !/^[1-9]$/.test(ev.key)) return;
  const at = ev.target;
  if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || at?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;
  for (const e of structPool.values()) {
    if (!composerLive(e) || !askActive(e) || e.ask.folded || e.ask.sending || !e.host?.isConnected || !e.host.getClientRects().length) continue;
    const q = e.ask.questions[e.ask.at];
    if (!q?.options?.[Number(ev.key) - 1]) return;
    ev.preventDefault();
    ev.stopPropagation();
    pickOption(e, Number(ev.key) - 1);
    return;
  }
}

function askPlaceholder(e) {
  if (reviewing(e.ask)) return phrase("Press Enter to send the answers, or pick a question to change it");
  const q = e.ask.questions[e.ask.at];
  return q?.options?.length ? phrase("Type your own answer, or leave this blank to use the selected option") : phrase("Type your answer");
}

function askPrimary(e) {
  const ask = e.ask;
  const total = ask.questions.length;
  if (reviewing(ask) || !hasReview(ask)) {
    const label = ask.sending ? phrase("Submitting...") : total > 1 ? phrase("Submit answers") : phrase("Submit answer");
    const disabled = ask.sending || ask.questions.some((_, at) => filesWaiting(ask, at)) || !askComplete(ask);
    return { label, disabled };
  }
  const label = nextStop(ask) === total ? phrase("Review answers") : phrase("Next question");
  return { label, disabled: ask.sending || filesWaiting(ask, ask.at) || !answerOf(ask, ask.at).length };
}

onComposerMode({
  before(e, mode) {
    if (e.holding || !e.ask) return;
    if (mode === "question" && !e.ask.saved) {
      e.ask.start = { text: e.ask.typed[e.ask.at] || "" };
      takeBox(e, e.ask);
    }
    if (e.ask.saved && mode !== "question") giveBox(e, e.ask);
    if (mode === "question") readTyped(e);
  },
  paint(e, form, mode) {
    const box = e.box?.textarea;
    if (!box) return;
    const locked = mode === "question" && reviewing(e.ask);
    if (box.readOnly !== locked) box.readOnly = locked;
  }
});

if (typeof window !== "undefined") window.addEventListener("keydown", answerDigit, true);

export { TYPING_SETTLES_MS, advanceAsk, confirmAsk, goToStep, reviewing, answerOf, answerWithAttachments, attachmentLine, askActive, askBanner, askComplete, askPlaceholder, askPrimary, askSettles, closeAsk, dropAsk, foldAsk, noteAsk, pickOption, stepAsk };

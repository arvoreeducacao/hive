import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

await views();

const st = await state();
const { getStructured, withQuotes } = await app("chat-stretches");
const { svConvActions, svConvFlushAll, svConvLine, svConvPush, svConvSeed } = await app("conversation-model");
const { replyTo } = await app("chat-reply");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let made = 0;

function pane() {
  const name = `reply-${++made}`;
  st.data = { ...(st.data || {}), sessions: [{ name, where: "local", state: "idle" }], spawning: [] };
  const e = getStructured({ name, where: "local" });
  e.at = 1000;
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  document.body.appendChild(e.host);
  return e;
}

const answered = (e, html, seq) => svConvPush(e, { key: `a${seq}`, kind: "said", parts: [html], streaming: false, stamped: true, at: "1000", said: "1000", seq });
const shown = (e) => (svConvFlushAll(), e.scroll);
const shut = (e) => { e.convView.dispose(); e.host.remove(); structPool.delete(e.name); };
const hover = (el) => el.dispatchEvent(new dom.MouseEvent("mouseover", { bubbles: true }));
const leave = (e) => e.scroll.dispatchEvent(new dom.MouseEvent("mouseleave"));

function oneAnswer(e) {
  const bubble = svConvLine(e, "sv-user", "o que mudou?");
  bubble.stamped = true;
  answered(e, "<p>Mudou o cálculo.</p><p>E o teste passou.</p>", 2);
  const answer = shown(e).querySelector(".sv-msg");
  hover(answer);
  return answer;
}

test("hovering an answer lights its stamp with a reply button beside the copy and the fork", () => {
  const e = pane();
  const answer = oneAnswer(e);
  const reply = answer.querySelector(":scope > .sv-stamp > .st-reply");
  assert.ok(reply, "the hovered answer has no reply button");
  assert.equal(reply.tagName, "BUTTON");
  assert.equal(reply.type, "button");
  assert.equal(reply.title, "Reply");
  assert.equal(reply.getAttribute("aria-label"), "Reply to this response");
  assert.equal(reply.querySelector("use").getAttribute("href"), "#i-reply");
  assert.equal(reply.disabled, false);
  assert.ok(answer.classList.contains("lit"));
  shut(e);
});

test("reply puts the whole answer in the quote tray and hands the keyboard to the composer", () => {
  const e = pane();
  const answer = oneAnswer(e);
  const box = e.host.querySelector(".sv-composer textarea");
  answer.querySelector(".st-reply").click();
  assert.equal(e.quotes.count(), 1);
  const [{ said, kind }] = e.quotes.pinned();
  assert.match(said, /^Mudou o cálculo\.\n+E o teste passou\.$/);
  assert.equal(kind, "what it answered");
  assert.equal(e.host.querySelector(".sv-attach .att.quote .qt").textContent, said);
  assert.ok(e.host.querySelector(".sv-composer").classList.contains("ready"), "the composer does not know it holds a quote");
  assert.ok(document.activeElement === box, "the composer did not take the focus");
  shut(e);
});

test("the reply button is reached with Tab and keeps its focus when the stamp is painted again", () => {
  const e = pane();
  const answer = oneAnswer(e);
  const reply = answer.querySelector(".st-reply");
  assert.equal(reply.tabIndex, 0);
  reply.focus();
  assert.ok(document.activeElement === reply, "the reply button cannot take focus");
  leave(e);
  hover(answer);
  assert.ok(answer.querySelector(".st-reply") === reply, "a new hover built a second button");
  assert.ok(document.activeElement === reply, "painting the stamp again took the focus away");
  shut(e);
});

test("what you asked has no reply button, only answers do", () => {
  const e = pane();
  oneAnswer(e);
  const bubble = e.scroll.querySelector(".sv-user");
  leave(e);
  hover(bubble);
  assert.ok(bubble.querySelector(".sv-stamp"), "the bubble was not lit");
  assert.equal(bubble.querySelector(".st-reply"), null);
  shut(e);
});

test("while the chat cannot take a message, reply is disabled and the selection quote is not offered", async () => {
  const e = pane();
  e.mirror = { dev: "ana", seat: "api" };
  e.host.classList.add("sv-cold");
  const answer = oneAnswer(e);
  const reply = answer.querySelector(".st-reply");
  assert.equal(reply.disabled, true);
  assert.equal(replyTo(e, answer), false);
  assert.equal(e.quotes.count(), 0);
  const range = document.createRange();
  range.selectNodeContents(answer.querySelector("p"));
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  e.scroll.dispatchEvent(new dom.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(e.host.querySelector(".sv-quote-pop").classList.contains("on"), false);
  document.getSelection().removeAllRanges();
  e.host.classList.remove("sv-cold");
  leave(e);
  hover(answer);
  assert.equal(reply.disabled, false, "the reply stayed off once the chat could take a message again");
  shut(e);
});

test("a reply sent with a comment comes back as a plain card for the whole answer, with the comment below", () => {
  const e = pane();
  const answer = oneAnswer(e);
  answer.querySelector(".st-reply").click();
  svConvLine(e, "sv-user", withQuotes(e.quotes.all(), "e o caso de borda?"));
  const sent = [...shown(e).querySelectorAll(".sv-user")].at(-1);
  const card = sent.querySelector(".sv-said-quote");
  assert.ok(card, "the reply did not travel as a quote");
  assert.equal(card.querySelector("mark"), null, "the whole answer was drawn as a stretch of it");
  assert.equal(sent.querySelector(".sv-said-body").textContent, "e o caso de borda?");
  shut(e);
});

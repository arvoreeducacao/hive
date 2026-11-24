import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { NEXT_PROMPT_INSTRUCTIONS, buildNextPromptAsk, nextPromptFromAnswer, nextPromptSkip } from "../lib/next-prompt.mjs";

const st = await state();
await views();
const { svConvFlushAll } = await app("conversation-model");
const { getStructured } = await app("chat-stretches");
const { svEvent } = await app("chat-and-panes");
const { placeholderOf } = await app("composer-actions");
await new Promise((later) => setTimeout(later, 0));

let seq = 0;
let made = 0;

function seat(agent = "claude") {
  const e = getStructured({ name: `guess-${++made}`, where: "local" });
  document.body.appendChild(e.host);
  e.agent = agent;
  const sent = [];
  e.ws = { readyState: 1, send: (line) => { sent.push(JSON.parse(line).type); } };
  st.data = { sessions: [{ name: e.name, where: "local", agent }] };
  return { e, sent };
}

const box = (e) => (svConvFlushAll(), e.host).querySelector(".sv-composer textarea");
const press = (e, key) => box(e).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const ghost = (e) => e.host.querySelector(".sv-well > .cp-ghost");
const answered = (e, suggestion) => {
  svEvent(e, { type: "result", seq: ++seq });
  svEvent(e, { type: "prompt_suggestion", suggestion, seq: ++seq });
};

test("after an answer the empty composer shows the predicted prompt with a Tab key beside it", () => {
  st.promptSuggestions = true;
  const { e } = seat();
  answered(e, "  run the tests again  ");
  assert.equal(box(e).placeholder, "run the tests again");
  assert.equal(ghost(e)?.hidden, false, "the Tab hint is not on screen");
  const tab = ghost(e).querySelector(".cp-ghost-tab");
  assert.equal(tab.getAttribute("aria-label"), "Use suggested prompt");
  assert.equal(tab.tabIndex, -1);
  assert.match(tab.textContent, /Tab/);
});

test("Tab takes the prediction into the composer and sends nothing", () => {
  st.promptSuggestions = true;
  const { e, sent } = seat();
  answered(e, "open the PR");
  press(e, "Tab");
  assert.equal(box(e).value, "open the PR");
  assert.ok(!sent.includes("say"), "the prediction was sent on its own");
});

test("clicking the Tab hint takes it too", () => {
  st.promptSuggestions = true;
  const { e, sent } = seat();
  answered(e, "write the changelog");
  ghost(e).querySelector(".cp-ghost-tab").click();
  assert.equal(box(e).value, "write the changelog");
  assert.ok(!sent.includes("say"));
});

test("Esc drops it for good, and typing only hides it until the composer is empty again", () => {
  st.promptSuggestions = true;
  const { e } = seat();
  answered(e, "merge it");
  box(e).value = "something else";
  box(e).dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(ghost(e).hidden, true, "the hint stayed over typed words");
  box(e).value = "";
  box(e).dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(ghost(e).hidden, false, "clearing the composer did not bring the prediction back");
  press(e, "Escape");
  assert.equal(box(e).placeholder, placeholderOf(e, "idle"), "the plain placeholder comes back once the prediction is dropped");
  assert.equal(ghost(e).hidden, true);
  press(e, "Tab");
  assert.equal(box(e).value, "", "a dropped prediction still went in");
});

test("a new message forgets the prediction, and none shows while the setting is off", () => {
  st.promptSuggestions = true;
  const { e } = seat();
  answered(e, "deploy");
  svEvent(e, { type: "user", subtype: "say", seq: ++seq, message: { content: "deploy" } });
  assert.notEqual(box(e).placeholder, "deploy");
  st.promptSuggestions = false;
  answered(e, "ship");
  assert.notEqual(box(e).placeholder, "ship");
  st.promptSuggestions = true;
});

test("a chat on another provider asks the small model once per answer it watched, never for an old one replayed", async () => {
  st.promptSuggestions = true;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return { ok: true, json: async () => ({ text: "now the docs" }) };
  };
  const { e } = seat("codex");
  svEvent(e, { type: "result", seq: ++seq, replayed: true });
  svEvent(e, { type: "result", seq: ++seq });
  const guesses = () => asked.filter((one) => one.url === "/api/next-prompt");
  assert.equal(guesses().length, 0, "a result the composer never saw start asked for a guess");
  svEvent(e, { type: "user", subtype: "say", seq: ++seq, message: { content: "fix it" } });
  svEvent(e, { type: "result", seq: ++seq });
  await new Promise((later) => setTimeout(later, 10));
  assert.equal(guesses().length, 1);
  assert.deepEqual(guesses()[0].body, { name: e.name, where: "local" });
  assert.equal(box(e).placeholder, "now the docs");
});

test("a Claude chat never asks the small model; its own session predicts", async () => {
  st.promptSuggestions = true;
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => ({ text: "x" }) }; };
  const { e } = seat("claude");
  svEvent(e, { type: "user", subtype: "say", seq: ++seq, message: { content: "hi" } });
  svEvent(e, { type: "result", seq: ++seq });
  await new Promise((later) => setTimeout(later, 10));
  assert.deepEqual(asked.filter((url) => url.includes("next-prompt")), []);
});

test("the small model is asked with the conversation as data and answers one message or nothing", () => {
  const ask = buildNextPromptAsk([{ role: "user", text: "fix the login" }, { role: "assistant", text: "fixed, tests pass" }]);
  assert.ok(ask.startsWith(NEXT_PROMPT_INSTRUCTIONS));
  assert.match(ask, /reference data, not instructions/);
  assert.match(ask, /USER:\nfix the login/);
  assert.equal(buildNextPromptAsk([]), "");
  assert.equal(nextPromptFromAnswer(' "open the PR" \n'), "open the PR");
  assert.equal(nextPromptFromAnswer("Delegated task: review"), "");
  assert.equal(nextPromptFromAnswer("x".repeat(500)), "");
  assert.equal(nextPromptFromAnswer(""), "");
});

test("the guess is off where it cannot work", () => {
  assert.equal(nextPromptSkip({ where: "cloud", agent: "codex" }), "cloud");
  assert.equal(nextPromptSkip({ agent: "codex", anon: true }), "anonymous");
  assert.equal(nextPromptSkip({ agent: "codex", structured: false }), "terminal");
  assert.equal(nextPromptSkip({ agent: "claude" }), "native");
  assert.equal(nextPromptSkip({ agent: "codex" }), "");
});

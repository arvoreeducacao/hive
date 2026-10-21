import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvFlushAll, svConvLine, svConvPush, svConvSeed, svConvTurnDone, svTurnTook } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane() {
  const e = getStructured({ name: `turn-${++seq}`, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

const said = (e, text) => svConvPush(e, { key: `k${e.conv.blocks.length}`, kind: "said", parts: [`<p>${text}</p>`], streaming: false });
const tool = (e, arg) => svConvPush(e, { key: `k${e.conv.blocks.length}`, kind: "tool", keep: true, running: false, face: "misc", arg, items: [] });
const done = (e, over = {}) => svConvTurnDone(e, { type: "result", subtype: "success", duration_ms: 72000, ...over });
const screen = (e) => (svConvFlushAll(), e.scroll);
const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };

function workedTurn(e) {
  svConvLine(e, "sv-user", "Make the login page send people back to where they were.");
  said(e, "I'll look at how the login flow decides where to go next.");
  tool(e, "redirect");
  tool(e, "src/pages/login.tsx");
  said(e, "Login now sends people back to the page they came from.");
}

test("the time a turn took reads like T3 Code's", () => {
  assert.equal(svTurnTook(420), "420ms");
  assert.equal(svTurnTook(1234), "1.2s");
  assert.equal(svTurnTook(9960), "10s");
  assert.equal(svTurnTook(11300), "11s");
  assert.equal(svTurnTook(72000), "1m 12s");
  assert.equal(svTurnTook(120000), "2m");
  assert.equal(svTurnTook(3723000), "1h 2m 3s");
});

test("a finished turn folds its work behind Worked for, under the message that asked for it", () => {
  const e = pane();
  workedTurn(e);
  const fold = done(e);
  const kinds = e.conv.blocks.map((one) => one.kind);
  assert.deepEqual(kinds.slice(0, 2), ["bubble", "turn"], "the fold sits right under the person's message");
  assert.equal(fold.label, "Worked for 1m 12s");
  const answer = e.conv.blocks.at(-1);
  assert.equal(answer.kind, "said");
  assert.equal(!!answer.folded, false, "the answer stays in view");
  assert.equal(e.conv.blocks.filter((one) => one.folded).length, 3, "the narration and both tools fold away");

  const view = screen(e);
  assert.equal(view.querySelectorAll(".sv-folded").length, 3);
  assert.match(view.querySelector(".sv-turn-btn").textContent, /Worked for 1m 12s/);
  assert.equal(view.querySelector(".sv-turn-btn").getAttribute("aria-expanded"), "false");
  assert.match(view.querySelector(".sv-msg:not(.sv-folded)").textContent, /sends people back/);
  shut(e);
});

test("the fold opens and closes the work it holds, and nothing else", () => {
  const e = pane();
  workedTurn(e);
  done(e);
  screen(e).querySelector(".sv-turn-btn").click();
  assert.equal(screen(e).querySelectorAll(".sv-folded").length, 0);
  assert.equal(screen(e).querySelector(".sv-turn-btn").getAttribute("aria-expanded"), "true");
  assert.ok(screen(e).querySelector(".sv-turn.open"));
  screen(e).querySelector(".sv-turn-btn").click();
  assert.equal(screen(e).querySelectorAll(".sv-folded").length, 3);
  shut(e);
});

test("a turn that only talked, failed or ended without an answer keeps everything in view", () => {
  const talked = pane();
  svConvLine(talked, "sv-user", "What does this repo do?");
  said(talked, "It is a web app.");
  said(talked, "It serves the login and the dashboard.");
  assert.equal(done(talked), null, "words alone are not work to hide");
  shut(talked);

  const failed = pane();
  workedTurn(failed);
  assert.equal(done(failed, { subtype: "error_during_execution", is_error: true }), null);
  assert.equal(failed.conv.blocks.some((one) => one.folded), false);
  shut(failed);

  const cut = pane();
  svConvLine(cut, "sv-user", "Run the tests.");
  tool(cut, "pnpm vitest");
  assert.equal(done(cut), null, "with no answer there is nothing to keep in view under the fold");
  shut(cut);
});

test("a turn read again from the history folds once, and a fold without a duration says Worked", () => {
  const e = pane();
  workedTurn(e);
  done(e, { duration_ms: undefined, ts: "" });
  assert.equal(done(e), null);
  const folds = e.conv.blocks.filter((one) => one.kind === "turn");
  assert.equal(folds.length, 1);
  assert.equal(folds[0].label, "Worked");
  shut(e);
});

test("only the inbox hides the folded work; every other structure keeps the chat as it was", () => {
  const page = readFileSync(new URL("../app.html", import.meta.url), "utf8");
  const inbox = readFileSync(new URL("../assets/structures/inbox.css", import.meta.url), "utf8");
  assert.match(page, /\n {2}\.sv-turn \{ display: none; \}/);
  assert.match(inbox, /\[data-structure="inbox"\] \.tx-host \.sv-folded \{ display: none; \}/);
  assert.doesNotMatch(page, /\.sv-folded/, "outside the inbox a folded block is drawn as before");
});

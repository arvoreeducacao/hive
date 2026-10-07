import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const { svAppend } = await app("structured-seats");
const { svConvSaid, svConvThink, svConvTool, svConvToolLanded } = await app("conversation-model");
const { getStructured } = await app("chat-stretches");

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const model = readFileSync(join(SRC, "app", "conversation-model.js"), "utf8");
const view = readFileSync(join(SRC, "conversation.jsx"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

function node(classes = "") {
  const el = document.createElement("div");
  el.className = classes;
  return el;
}

let seq = 0;

function seat() {
  return getStructured({ name: `work-${++seq}`, where: "local" });
}

const TOOL_OF = { read: "Read", write: "Write", run: "Bash", web: "WebFetch", agent: "Task", mcp: "mcp__db__query", "": "Bolt" };

let calls = 0;

function toolCard(e, { ms = 0, failed = false, running = false, shot = false, kind = "", targ = "" } = {}) {
  const use = `t${++calls}`;
  const card = svConvTool(e, { id: use, name: TOOL_OF[kind], input: {} }, false);
  card.use = use;
  card.arg = targ;
  if (shot) card.keep = true;
  if (running) return card;
  landed(e, card);
  card.ms = ms ? String(ms) : "";
  return card;
}

const landed = (e, card) => svConvToolLanded(e, { tool_use_id: card.use, is_error: false, content: "" }, false);

const failedCard = (e, opts) => {
  const card = toolCard(e, { ...opts, running: true });
  svConvToolLanded(e, { tool_use_id: card.use, is_error: true, content: "" }, false);
  return card;
};

const prose = (e) => svConvSaid(e, "here is what came out of it");
const summary = (el) => el.querySelector(".wname").textContent;
const blocks = (e) => [...e.scroll.children].filter((c) => c.classList.contains("sv-work"));
const kinds = (e) => [...e.scroll.children].map((c) => c.className.split(" ")[0]);
const grouped = (e) => [...e.scroll.children].find((c) => c.classList.contains("sv-work"));
const args = (el) => [...el.children].map((c) => c.querySelector(".targ").textContent);

test("a run of tool calls folds into one block when the answer starts", () => {
  const e = seat();
  toolCard(e, { ms: 120 });
  toolCard(e, { ms: 380 });
  prose(e);
  assert.deepEqual(kinds(e), ["sv-work", "sv-msg"]);
  assert.equal(grouped(e).querySelector(".wname").textContent, "used 2 tools");
  assert.equal(grouped(e).querySelector(".wms").textContent, "500ms");
});

test("the folded block keeps the cards, in order, inside its body", () => {
  const e = seat();
  toolCard(e, { targ: "first" });
  toolCard(e, { targ: "second" });
  svAppend(e, node("sv-meta"));
  assert.deepEqual(args(grouped(e).querySelector(".wbody")), ["first", "second"]);
});

test("thinking rides along with the calls it belongs to", () => {
  const e = seat();
  svConvThink(e, "weighing it up", "");
  toolCard(e);
  toolCard(e);
  prose(e);
  assert.equal(grouped(e).querySelector(".wbody").children.length, 3);
});

test("a lone call is not worth a wrapper", () => {
  const e = seat();
  toolCard(e);
  prose(e);
  assert.deepEqual(kinds(e), ["sv-tool", "sv-msg"]);
});

test("prose in the middle cuts the run in two, so the order stays honest", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  prose(e);
  toolCard(e);
  toolCard(e);
  prose(e);
  assert.deepEqual(kinds(e), ["sv-work", "sv-msg", "sv-work", "sv-msg"]);
});

test("a question card is never folded away — it is waiting on an answer", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  svAppend(e, node("sv-q"));
  assert.deepEqual(kinds(e), ["sv-work", "sv-q"]);
});

test("a published artifact stays on the surface", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  svAppend(e, node("sv-art"));
  assert.deepEqual(kinds(e), ["sv-work", "sv-art"]);
});

test("a failure is counted on the closed summary, so it cannot hide in there", () => {
  const e = seat();
  toolCard(e);
  failedCard(e);
  failedCard(e);
  prose(e);
  assert.equal(grouped(e).querySelector(".wbad").textContent, "2 failed");
  assert.ok(grouped(e).classList.contains("bad"));
});

test("a run with no timing shows no duration", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  prose(e);
  assert.equal(grouped(e).querySelector(".wms").textContent, "");
});

test("the block builds while the run is still going, so what is on the surface is what is running", () => {
  const e = seat();
  toolCard(e, { ms: 120 });
  toolCard(e, { running: true });
  assert.deepEqual(kinds(e), ["sv-work", "sv-tool"]);
  assert.equal(summary(grouped(e)), "used 1 tool");
});

test("the summary counts up as the calls drop into it", () => {
  const e = seat();
  toolCard(e, { ms: 100 });
  toolCard(e, { ms: 200 });
  assert.equal(summary(grouped(e)), "used 1 tool");
  toolCard(e, { running: true });
  assert.equal(summary(grouped(e)), "used 2 tools");
  assert.equal(grouped(e).querySelector(".wms").textContent, "300ms");
});

test("a call that is still running keeps the ones behind it on the surface, so the order stays honest", () => {
  const e = seat();
  const slow = toolCard(e, { running: true });
  toolCard(e);
  toolCard(e, { running: true });
  assert.deepEqual(kinds(e), ["sv-tool", "sv-tool", "sv-tool"]);
  landed(e, slow);
  toolCard(e, { running: true });
  assert.deepEqual(kinds(e), ["sv-work", "sv-tool", "sv-tool"]);
  assert.equal(summary(grouped(e)), "used 2 tools");
});

test("a card that came back with a picture stays on the surface and cuts the run in two", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  toolCard(e, { shot: true });
  toolCard(e);
  toolCard(e);
  prose(e);
  assert.deepEqual(kinds(e), ["sv-work", "sv-tool", "sv-work", "sv-msg"]);
  assert.deepEqual(blocks(e).map(summary), ["used 2 tools", "used 2 tools"]);
});

test("a picture is never folded away, even when it is the last thing the run did", () => {
  const e = seat();
  toolCard(e);
  toolCard(e);
  toolCard(e, { shot: true });
  prose(e);
  assert.deepEqual(kinds(e), ["sv-work", "sv-tool", "sv-msg"]);
});

test("a lone call before a picture is left as itself, not put in a drawer of one", () => {
  const e = seat();
  toolCard(e);
  toolCard(e, { shot: true });
  toolCard(e);
  toolCard(e);
  prose(e);
  assert.deepEqual(kinds(e), ["sv-tool", "sv-tool", "sv-work", "sv-msg"]);
});

test("two pictures in a row both stay out", () => {
  const e = seat();
  toolCard(e, { shot: true });
  toolCard(e, { shot: true });
  prose(e);
  assert.deepEqual(kinds(e), ["sv-tool", "sv-tool", "sv-msg"]);
});

test("a tool result that carries a picture marks its card to stay on the surface", () => {
  assert.match(slice(model, "function svConvShots(e, card, paths)", "function svConvRunOff(", "conversation-model.js"), /card\.keep = true;/);
  assert.match(view, /"sv-keep": !!props\.block\.keep/);
});

test("the summary says what the run did, not how many times it did something", () => {
  const e = seat();
  toolCard(e, { kind: "read" });
  toolCard(e, { kind: "read" });
  toolCard(e, { kind: "run" });
  prose(e);
  assert.equal(summary(grouped(e)), "read 2 files and ran 1 command");
});

test("editing one file four times is one file changed, not four", () => {
  const e = seat();
  for (let i = 0; i < 4; i++) toolCard(e, { kind: "write", targ: "app/app.html" });
  toolCard(e, { kind: "write", targ: "app/assets/i18n.mjs" });
  prose(e);
  assert.equal(summary(grouped(e)), "changed 2 files");
});

test("a write nobody could name a target for still counts as one", () => {
  const e = seat();
  toolCard(e, { kind: "write" });
  toolCard(e, { kind: "write", targ: "app/app.html" });
  prose(e);
  assert.equal(summary(grouped(e)), "changed 2 files");
});

test("three kinds are joined as a sentence, in a fixed order", () => {
  const e = seat();
  toolCard(e, { kind: "agent" });
  toolCard(e, { kind: "run" });
  toolCard(e, { kind: "read" });
  prose(e);
  assert.equal(summary(grouped(e)), "read 1 file, ran 1 command and ran 1 agent");
});

test("a species the summary has no verb for falls back instead of disappearing", () => {
  const e = seat();
  toolCard(e, { kind: "mcp" });
  toolCard(e, { kind: "read" });
  prose(e);
  assert.equal(summary(grouped(e)), "read 1 file and used 1 tool");
});

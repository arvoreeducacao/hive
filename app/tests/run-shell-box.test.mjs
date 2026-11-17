import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { renderMarkdown } = await import("../assets/markdown.mjs");

let seq = 0;

const seat = (extra = {}) => {
  const e = getStructured({ name: `run-box-${++seq}`, where: "local", ...extra });
  document.body.appendChild(e.host);
  const sent = [];
  e.ws = { readyState: 1, send: (line) => {
    const cmd = JSON.parse(line);
    sent.push(cmd);
    queueMicrotask(() => e.pending.get(cmd.cid)?.({ ok: true }));
  } };
  return { e, sent };
};

const answer = (host, words) => {
  const msg = document.createElement("div");
  msg.className = "sv-msg md";
  msg.innerHTML = renderMarkdown(words);
  host.appendChild(msg);
  return msg;
};

test("the run button of a ! box runs the command in the chat it was said in", async () => {
  const { e, sent } = seat();
  const msg = answer(e.host, "Rode no chat:\n```\n! aws sso login --sso-session prod\n```");
  msg.querySelector(".md-run").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "shell");
  assert.equal(sent[0].command, "aws sso login --sso-session prod");
  assert.equal(sent[0].quiet, false);
  assert.equal(e.sent.at(-1), "!aws sso login --sso-session prod");
});

test("a !! box runs outside the chat's history, like typing !! does", async () => {
  const { e, sent } = seat();
  answer(e.host, "```bash\n!! gh auth status\n```").querySelector(".md-run").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(sent[0].command, "gh auth status");
  assert.equal(sent[0].quiet, true);
});

test("a second click right after the first does not run the command twice", async () => {
  const { e, sent } = seat();
  const run = answer(e.host, "```\n! make deploy\n```").querySelector(".md-run");
  run.click();
  run.click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(sent.length, 1);
});

test("a mirrored chat refuses, since the command would run on the wrong machine", async () => {
  const { e, sent } = seat({ mirror: { dev: "other", seat: "x" } });
  answer(e.host, "```\n! ls\n```").querySelector(".md-run").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(sent.length, 0);
});

test("a box outside any chat does nothing", async () => {
  const loose = document.createElement("div");
  document.body.appendChild(loose);
  const msg = answer(loose, "```\n! ls\n```");
  assert.doesNotThrow(() => msg.querySelector(".md-run").click());
});

const composer = (e) => e.host.querySelector(".sv-composer textarea");

test("copy to chat puts the line in the box, ! included, and runs nothing", async () => {
  const { e, sent } = seat();
  answer(e.host, "```\n! aws sso login --sso-session prod\n```").querySelector(".md-tochat").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(composer(e).value, "! aws sso login --sso-session prod");
  assert.equal(sent.length, 0);
  assert.equal(document.activeElement, composer(e));
});

test("copy to chat takes the place of what was in the box, so the line stays a shell line", async () => {
  const { e } = seat();
  composer(e).value = "um rascunho";
  answer(e.host, "```\n!! gh auth status\n```").querySelector(".md-tochat").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(composer(e).value, "!! gh auth status");
});

test("copy to chat does nothing in a mirrored chat", async () => {
  const { e } = seat({ mirror: { dev: "other", seat: "y" } });
  answer(e.host, "```\n! ls\n```").querySelector(".md-tochat").click();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(composer(e).value, "");
});

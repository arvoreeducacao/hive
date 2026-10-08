import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMMENT_MAX, addComment, commentCommitLine, commentsFile, pinOf, readComments, settleComment, settleCommitLine, shelve
} from "../lib/shelf.mjs";
import { PIN_SHIM_MARK, withPinShim } from "../lib/shelf-pins.mjs";

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "hive-shelf-comments."));
  shelve({
    home, slug: "catalogacao-de-livros", tab: "telas", html: "<title>Catalogação de livros</title>",
    title: "Catalogação de livros", kind: "telas", owner: "guilherme", label: "draft", at: 1_700_000_000_000
  });
  return { home, gone: () => rmSync(home, { recursive: true, force: true }) };
}

const said = (home, over = {}) => addComment(home, "catalogacao-de-livros", {
  tab: "telas", v: 1, who: "rita", text: "o botão de baixo some no celular", at: 1_700_000_001_000,
  pin: { frame: "f-3", name: "Opção B", x: 0.42, y: 0.61 }, ...over
});

test("a comment lands in comments.json next to the page, pinned where the person clicked", () => {
  const { home, gone } = sandbox();
  try {
    const { comment } = said(home);
    assert.match(comment.id, /^c-[a-f0-9]{10}$/);
    assert.deepEqual(comment.pin, { frame: "f-3", name: "Opção B", x: 0.42, y: 0.61 });
    assert.equal(comment.done, false);
    assert.ok(existsSync(commentsFile(home, "catalogacao-de-livros")));
    const kept = JSON.parse(readFileSync(commentsFile(home, "catalogacao-de-livros"), "utf8"));
    assert.equal(kept.comments.length, 1);
    assert.deepEqual(readComments(home, "catalogacao-de-livros").comments, kept.comments);
  } finally { gone(); }
});

test("a comment with no words, too many words, or on a page nobody shelved is refused", () => {
  const { home, gone } = sandbox();
  try {
    assert.equal(said(home, { text: "   " }).error, "a comment needs some words");
    assert.match(said(home, { text: "x".repeat(COMMENT_MAX + 1) }).error, /stops at/);
    assert.equal(addComment(home, "nao-existe", { text: "oi" }).error, "no page with that name on the shelf");
    assert.equal(addComment("", "catalogacao-de-livros", { text: "oi" }).error, "the shelf has no repo on this machine yet");
    assert.equal(readComments(home, "catalogacao-de-livros").comments.length, 0);
  } finally { gone(); }
});

test("a pin is kept as fractions of the frame, clamped, and a comment without one is just a comment", () => {
  assert.deepEqual(pinOf({ frame: "f-1", x: 1.7, y: -0.2 }), { frame: "f-1", name: "", x: 1, y: 0 });
  assert.deepEqual(pinOf({ x: 0.123456, y: 0.5 }), { frame: "", name: "", x: 0.1235, y: 0.5 });
  assert.equal(pinOf(null), null);
  assert.equal(pinOf({ frame: "f-1" }), null);
  const { home, gone } = sandbox();
  try {
    const { comment } = said(home, { pin: null });
    assert.equal("pin" in comment, false);
  } finally { gone(); }
});

test("a reply points at a comment that exists; a reply to nothing is a plain comment", () => {
  const { home, gone } = sandbox();
  try {
    const first = said(home).comment;
    const reply = said(home, { text: "no desktop também", pin: null, re: first.id, at: 1_700_000_002_000 }).comment;
    assert.equal(reply.re, first.id);
    const lost = said(home, { text: "?", re: "c-0000000000", at: 1_700_000_003_000 });
    assert.match(lost.error, /no conversation with that id/, "responder a uma conversa que não existe é recusado, não vira comentário solto");
    assert.equal(readComments(home, "catalogacao-de-livros").comments.length, 2);
  } finally { gone(); }
});

test("two comments with the same words at the same moment still get different ids", () => {
  const { home, gone } = sandbox();
  try {
    const a = said(home).comment;
    const b = said(home).comment;
    assert.notEqual(a.id, b.id);
  } finally { gone(); }
});

test("settling a comment marks who closed it and when; reopening clears that", () => {
  const { home, gone } = sandbox();
  try {
    const { comment } = said(home);
    const closed = settleComment(home, "catalogacao-de-livros", { id: comment.id, done: true, who: "guilherme", at: 5 }).comment;
    assert.deepEqual({ done: closed.done, doneBy: closed.doneBy, doneAt: closed.doneAt }, { done: true, doneBy: "guilherme", doneAt: 5 });
    const back = settleComment(home, "catalogacao-de-livros", { id: comment.id, done: false }).comment;
    assert.equal(back.done, false);
    assert.equal("doneBy" in back, false);
    assert.equal(settleComment(home, "catalogacao-de-livros", { id: "c-nope", done: true }).error, "no comment with that id on this page");
  } finally { gone(); }
});

test("the commit line says who spoke and on which tab", () => {
  assert.equal(commentCommitLine("catalogacao-de-livros", { who: "rita", tab: "telas", v: 1 }), "estante: catalogacao-de-livros · comentário de rita em telas v1");
  assert.equal(commentCommitLine("x", { who: "", tab: "", v: 0 }), "estante: x · comentário de alguém");
  assert.equal(settleCommitLine("x", { done: true }), "estante: x · comentário atendido");
  assert.equal(settleCommitLine("x", { done: false }), "estante: x · comentário reaberto");
});

test("the pin shim rides along when a page is served, once, before </body> when there is one", () => {
  const bare = withPinShim("<title>Telas</title><section class=\"frame\" id=\"f-1\"></section>");
  assert.ok(bare.startsWith("<title>Telas</title>"));
  assert.ok(bare.includes(`<script ${PIN_SHIM_MARK}>`));
  assert.ok(bare.includes("postMessage"));
  assert.equal(withPinShim(bare), bare, "serving twice must not stack two shims");

  const full = withPinShim("<html><body><p>oi</p></body></html>");
  assert.ok(full.indexOf(`<script ${PIN_SHIM_MARK}>`) < full.indexOf("</body>"));
  assert.ok(full.endsWith("</body></html>"));
});

test("the agent's answer hangs on the conversation, and only on one that is there", () => {
  const { home, gone } = sandbox();
  try {
    const first = said(home).comment;
    const good = said(home, { text: "empilhei", pin: null, re: first.id, agent: true, at: 1_700_000_004_000 }).comment;
    assert.equal(good.re, first.id);
    assert.equal(good.agent, true);
    const lost = said(home, { text: "empilhei", re: "c-inventado", agent: true, at: 1_700_000_005_000 });
    assert.match(lost.error, /no conversation with that id/);
    assert.equal(readComments(home, "catalogacao-de-livros").comments.length, 2, "nada é gravado quando a conversa não existe");
  } finally { gone(); }
});

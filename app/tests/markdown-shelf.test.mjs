import { test } from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../assets/markdown.mjs";

const attr = (html, name) => (html.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];

test("a shelf address in the chat becomes something you can click", () => {
  const html = renderMarkdown("o plano está em hive://shelf/chat-orquestrador?tab=documento&v=1");
  assert.match(html, /class="md-shelf"/);
  assert.equal(attr(html, "data-slug"), "chat-orquestrador");
  assert.equal(attr(html, "data-tab"), "documento");
  assert.equal(attr(html, "data-v"), "1");
  assert.doesNotMatch(html, /target="_blank"/, "it opens inside the app, not in a browser");
});

test("a written link carries its own words", () => {
  const html = renderMarkdown("veja o [plano do orquestrador](hive://shelf/chat-orquestrador?tab=documento&v=1)");
  assert.match(html, />plano do orquestrador</);
  assert.equal(attr(html, "data-slug"), "chat-orquestrador");
});

test("the sentence keeps its punctuation, the link does not", () => {
  const html = renderMarkdown("está em hive://shelf/chat-orquestrador?tab=telas&v=2.");
  assert.equal(attr(html, "data-v"), "2");
  assert.match(html, /<\/a>\.$|<\/a>\.<\/p>/);
});

test("the lens of a pr is a tab the chat knows how to open", () => {
  const html = renderMarkdown("a lente está em hive://shelf/lente-do-pr?tab=lente&v=3");
  assert.equal(attr(html, "data-tab"), "lente");
  assert.equal(attr(html, "data-v"), "3");
});

test("no tab and no version still opens the page", () => {
  const html = renderMarkdown("hive://shelf/publicar-sem-claude-ai");
  assert.equal(attr(html, "data-slug"), "publicar-sem-claude-ai");
  assert.equal(attr(html, "data-tab"), "");
  assert.equal(attr(html, "data-v"), "");
});

test("a made-up tab or version is dropped instead of trusted", () => {
  const html = renderMarkdown("hive://shelf/uma-pagina?tab=inventada&v=-3");
  assert.equal(attr(html, "data-tab"), "");
  assert.equal(attr(html, "data-v"), "");
});

test("what is not a page on the shelf is not a shelf link", () => {
  for (const text of ["hive://app/api/shelf", "hive://shelf/MAIUSCULA", "hive://shelf/", "hive://outra-coisa/x"]) {
    assert.doesNotMatch(renderMarkdown(text), /md-shelf/, text);
  }
});

test("links to the world keep opening in the world", () => {
  const html = renderMarkdown("o PR é https://github.com/acme/hive/pull/353");
  assert.match(html, /target="_blank"/);
  assert.doesNotMatch(html, /md-shelf/);
});

test("an address written as code is a link too — the chat does not depend on how the model typed it", () => {
  const html = renderMarkdown("a página está em `hive://shelf/chat-orquestrador?tab=telas&v=2`");
  assert.match(html, /class="md-shelf"/);
  assert.equal(attr(html, "data-slug"), "chat-orquestrador");
  assert.equal(attr(html, "data-tab"), "telas");
  assert.equal(attr(html, "data-v"), "2");
  assert.match(html, /<code>hive:\/\/shelf\/chat-orquestrador\?tab=telas&amp;v=2<\/code>/, "it still looks like code");
});

test("code that only carries an address inside a command stays code", () => {
  const command = renderMarkdown("rode `curl --unix-socket ~/.hive/hive.sock hive://shelf/uma-pagina`");
  assert.doesNotMatch(command, /md-shelf/, "a command is to be copied, not clicked");
  assert.match(command, /<code>/);
  assert.doesNotMatch(renderMarkdown("`hive://shelf/MAIUSCULA`"), /md-shelf/);
  assert.doesNotMatch(renderMarkdown("`hive://app/api/shelf`"), /md-shelf/);
});

test("a fenced block is left alone", () => {
  const fenced = renderMarkdown("```\nhive://shelf/uma-pagina\n```");
  assert.doesNotMatch(fenced, /md-shelf/);
  assert.match(fenced, /md-code/);
});

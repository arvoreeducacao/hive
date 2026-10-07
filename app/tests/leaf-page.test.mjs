import { test } from "node:test";
import assert from "node:assert/strict";

import { FIGURE_TOOL, bodyForLeaf, readsHtml, sayMissing, sendToLeaf } from "../lib/leaf-page.mjs";

const READS_HTML = {
  create_document: { properties: { title: {}, markdown: {}, html: {}, parentId: {} } },
  update_document: { properties: { documentId: {}, markdown: {}, html: {}, mode: {} } }
};

const MARKDOWN_ONLY = {
  create_document: { properties: { title: {}, markdown: {}, parentId: {} } },
  update_document: { properties: { documentId: {}, markdown: {}, mode: {} } }
};

const PAGE = `<meta charset="utf-8"><title>Artefatos no Leaf</title>
<style>:root { --ink: #1A1917; --raise: #F2F0EC; } .d-box { fill: none; stroke: var(--ink); }</style>
<h1>Artefatos no Leaf</h1>
<p>O texto que um assento escreve.</p>
<figure><svg viewBox="0 0 100 40" aria-label="o mecanismo inteiro"><rect class="d-box" x="1" y="1" width="20" height="10"/></svg>
<figcaption>a legenda prova o que o desenho diz.</figcaption></figure>
<script>nada()</script>`;

function leafOnATable({ tools = [FIGURE_TOOL], upload, write } = {}) {
  const calls = [];
  const session = {
    async call(name, args) {
      calls.push({ name, args });
      if (name === FIGURE_TOOL) return upload ? upload(args, calls) : { said: { url: `/api/uploads/u/fig${calls.length}.svg` } };
      if (write) return write(name, args);
      const id = name === "update_document" ? args.documentId : "doc_1";
      return { said: { id, url: `https://leaf.example/doc/${id}` } };
    }
  };
  return { session, tools, calls, inputs: READS_HTML };
}

test("the page loses its weight and keeps its words", () => {
  const made = bodyForLeaf(PAGE);
  assert.equal(/<style|<script/.test(made.html), false);
  assert.equal(/<svg/.test(made.html), false);
  assert.match(made.html, /O texto que um assento escreve\./);
  assert.match(made.html, /a legenda prova/);
  assert.equal(made.figures.length, 1);
  assert.match(made.figures[0].svg, /stroke: #1A1917/);
});

test("the drawing goes up as an svg file and the page points at it", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "Artefatos no Leaf", html: PAGE, parentId: "pai" });

  assert.equal(sent.error, undefined);
  assert.equal(sent.how, "created");
  assert.equal(sent.drawings, 1);
  assert.deepEqual(sent.missing, []);

  const upload = table.calls[0];
  assert.equal(upload.name, FIGURE_TOOL);
  assert.equal(upload.args.contentType, "image/svg+xml");
  assert.match(Buffer.from(upload.args.data, "base64").toString("utf8"), /^<svg /);

  const wrote = table.calls[1];
  assert.equal(wrote.name, "create_document");
  assert.equal(wrote.args.parentId, "pai");
  assert.match(wrote.args.html, /<img src="\/api\/uploads\/u\/fig1\.svg" alt="o mecanismo inteiro">/);
  assert.equal(/leaf-figure-/.test(wrote.args.html), false);
});

test("republishing the same page edits the document it already has", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: PAGE, docId: "doc_9" });

  assert.equal(sent.how, "updated");
  assert.equal(sent.id, "doc_9");
  const wrote = table.calls[1];
  assert.equal(wrote.name, "update_document");
  assert.equal(wrote.args.documentId, "doc_9");
  assert.equal(wrote.args.mode, "replace");
});

test("a leaf that cannot take a drawing still gets the text, and says what stayed behind", async () => {
  const table = leafOnATable({ tools: ["create_document", "update_document"] });
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: PAGE });

  assert.equal(sent.error, undefined);
  assert.equal(sent.drawings, 0);
  assert.equal(sent.kept, 1);
  assert.match(sent.missing[0].why, new RegExp(`no ${FIGURE_TOOL} yet`));

  assert.equal(table.calls.length, 1);
  assert.equal(table.calls[0].name, "create_document");
  assert.match(table.calls[0].args.html, /Desenho que não veio: o mecanismo inteiro/);
  assert.equal(/leaf-figure-/.test(table.calls[0].args.html), false);
});

test("one drawing refused does not cost the page, and is named", async () => {
  const table = leafOnATable({ upload: () => ({ error: "the leaf refused the token" }) });
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: PAGE });

  assert.equal(sent.error, undefined);
  assert.equal(sent.drawings, 0);
  assert.match(sent.missing[0].why, /refused the token/);
  assert.match(table.calls[1].args.html, /Desenho que não veio/);
});

test("a drawing too big for the leaf is left out before it is sent", async () => {
  const heavy = `<svg viewBox="0 0 10 10" aria-label="o pesado"><text>${"a".repeat(600000)}</text></svg>`;
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: `<p>t</p>${heavy}` });

  assert.equal(sent.drawings, 0);
  assert.match(sent.missing[0].why, /over the 500 kB/);
  assert.equal(table.calls.some((c) => c.name === FIGURE_TOOL), false);
});

test("a page too big for the leaf is refused with the size in the sentence", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: `<p>${"a".repeat(700000)}</p>` });

  assert.match(sent.error, /over the 600 kB/);
  assert.equal(table.calls.length, 0);
});

test("a page that sanitizes down to nothing is refused instead of creating an empty document", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: "<style>a{}</style><script>b()</script>" });

  assert.match(sent.error, /nothing left/);
  assert.equal(table.calls.length, 0);
});

test("a leaf that writes but gives no id is an error, not a silent success", async () => {
  const table = leafOnATable({ write: () => ({ said: {} }) });
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "x", html: PAGE });

  assert.match(sent.error, /gave no id/);
});

test("what is left of a mark nobody could upload never reaches the leaf", () => {
  assert.equal(sayMissing('<img src="leaf-figure-0" alt="">'), "");
  assert.equal(sayMissing('<p>a</p><img src="leaf-figure-3" alt="o desenho">'), "<p>a</p><p><em>Desenho que não veio: o desenho</em></p>");
  assert.equal(sayMissing('<img src="/api/uploads/u/a.svg" alt="ok">'), '<img src="/api/uploads/u/a.svg" alt="ok">');
});

test("a leaf that only reads markdown is refused, because it drops html in silence", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: MARKDOWN_ONLY, title: "x", html: PAGE });

  assert.match(sent.error, /does not read html yet/);
  assert.equal(table.calls.length, 0);

  assert.equal(readsHtml(READS_HTML, "create_document"), true);
  assert.equal(readsHtml(MARKDOWN_ONLY, "create_document"), false);
  assert.equal(readsHtml({}, "create_document"), false);
});

const WITH_PHOTO = `<h1>Capas</h1>
<p>as capas que o time desenhou</p>
<img alt="a capa nova" src="data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUg".repeat(200)}">
<img src="https://ja.e/uma/url.png" alt="essa já é endereço">`;

test("a photo embedded in the page goes up as a file, and the page points at it", async () => {
  const table = leafOnATable();
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "Capas", html: WITH_PHOTO });

  assert.equal(sent.error, undefined);
  assert.equal(sent.images, 1);
  assert.deepEqual(sent.missing, []);

  const upload = table.calls[0];
  assert.equal(upload.name, FIGURE_TOOL);
  assert.equal(upload.args.contentType, "image/png");

  const wrote = table.calls[1];
  assert.match(wrote.args.html, /<img alt="a capa nova"\s+src="\/api\/uploads\/u\/fig1\.svg">/);
  assert.match(wrote.args.html, /src="https:\/\/ja\.e\/uma\/url\.png"/);
  assert.equal(/data:image/.test(wrote.args.html), false);
});

test("the body stops carrying the bytes of its photos", () => {
  const made = bodyForLeaf(WITH_PHOTO);

  assert.equal(made.images.length, 1);
  assert.ok(made.html.length < WITH_PHOTO.length / 2);
  assert.equal(/data:image/.test(made.html), false);
  assert.match(made.html, /as capas que o time desenhou/);
});

test("a photo the leaf refuses leaves the page standing and is named", async () => {
  const table = leafOnATable({ upload: () => ({ error: "the leaf is rate limiting this account, wait a minute" }) });
  const sent = await sendToLeaf({ session: table.session, tools: table.tools, inputs: table.inputs, title: "Capas", html: WITH_PHOTO });

  assert.equal(sent.images, 0);
  assert.equal(sent.missing[0].what, "image");
  assert.match(sent.missing[0].why, /rate limiting/);
  assert.match(table.calls[1].args.html, /Desenho que não veio: a capa nova/);
});

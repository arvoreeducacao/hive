import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { liveMarkdown, liveStart, liveStep, renderMarkdown, renderMarkdownBlocks } from "../assets/markdown.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "src/app/conversation-model.js"), "utf8") + "\n" + readFileSync(join(HERE, "src/app/chat-and-panes.js"), "utf8");

const typed = (text) => text.split("").map((_, i) => text.slice(0, i + 1));

test("the blocks are the same page the finished render gives", () => {
  const say = "# t\n\numa **linha**\n\n- a\n- b\n\n```js\nconst a = 1;\n```";
  assert.equal(renderMarkdownBlocks(say).join(""), renderMarkdown(say));
});

test("bold reads as bold before the closing stars arrive", () => {
  assert.equal(liveMarkdown("um **forte").join(""), "<p>um <b>forte</b></p>");
  assert.equal(liveMarkdown("um **forte**").join(""), "<p>um <b>forte</b></p>");
});

test("italic, strike and inline code close themselves mid-word", () => {
  assert.equal(liveMarkdown("um *lev").join(""), "<p>um <i>lev</i></p>");
  assert.equal(liveMarkdown("um ~~risc").join(""), "<p>um <s>risc</s></p>");
  assert.equal(liveMarkdown("roda `npm te").join(""), "<p>roda <code>npm te</code></p>");
});

test("a marker with nothing after it yet is held back, not shown raw", () => {
  assert.equal(liveMarkdown("um **").join(""), "<p>um </p>");
  assert.equal(liveMarkdown("um `").join(""), "<p>um </p>");
  assert.equal(liveMarkdown("um **forte** e *").join(""), "<p>um <b>forte</b> e </p>");
});

test("a half-written link never shows its address", () => {
  assert.equal(liveMarkdown("veja [o plano](https://arvo").join(""), "<p>veja </p>");
  assert.ok(!liveMarkdown("veja [o plano](https://arvo").join("").includes("<a"));
  assert.ok(liveMarkdown("veja [o plano](https://example.dev)").join("").includes('href="https://example.dev"'));
});

test("an open fence is already a code box while the code is typed", () => {
  const out = liveMarkdown("```js\nconst a = 1;").join("");
  assert.ok(out.includes('<pre class="md-code" data-lang="js">const a = 1;</pre>'));
  assert.ok(!out.includes("**"));
});

test("inside a fence the markers are left alone", () => {
  assert.ok(liveMarkdown("```\nconst a = `x` + **b").join("").includes("const a = `x` + **b"));
});

test("the bullet mark is not mistaken for italic", () => {
  assert.equal(liveMarkdown("* um item").join(""), "<ul><li>um item</li></ul>");
  assert.equal(liveMarkdown("- a *lev").join(""), "<ul><li>a <i>lev</i></li></ul>");
});

test("an asterisk in the middle of a word gains no partner", () => {
  assert.equal(liveMarkdown("2*3 e 4").join(""), "<p>2*3 e 4</p>");
});

test("what was already written never changes as the rest arrives", () => {
  const say = "# título\n\numa **linha** e `x`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- um\n- dois\n\n> nota\n\n```js\nconst a = 1;\n```\n\nfim [link](https://a.b) do texto";
  let held = [];
  for (const so_far of typed(say)) {
    const blocks = liveMarkdown(so_far);
    const settled = Math.min(held.length, blocks.length) - 1;
    for (let i = 0; i < settled; i++) assert.equal(blocks[i], held[i], `o bloco ${i} mudou em "${so_far.slice(-20)}"`);
    held = blocks;
  }
  assert.deepEqual(held, renderMarkdownBlocks(say));
});

test("every step of the way is html the browser can take", () => {
  for (const so_far of typed("um **forte** com [link](https://a.b) e `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |")) {
    const out = liveMarkdown(so_far).join("");
    assert.equal((out.match(/<p>/g) || []).length, (out.match(/<\/p>/g) || []).length, so_far);
    assert.ok(!out.includes("<script"), so_far);
  }
});

const CHUNKED = "# título\n\numa **linha** e `x`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- um\n- dois\n\n> nota\n\n```js\nconst a = 1;\n```\n\n---\n\nfim [link](https://a.b) do texto\n\n2. dois\n3. três";

test("reading only the open block says the same page as reading it all again", () => {
  let held = liveStart();
  let raw = "";
  for (const one of CHUNKED) {
    raw += one;
    held = liveStep(held, one);
    assert.deepEqual(held.blocks, liveMarkdown(raw), `a leitura por partes divergiu em "${raw.slice(-20)}"`);
  }
  assert.deepEqual(held.blocks, renderMarkdownBlocks(CHUNKED));
});

test("a chunk that carries several blocks at once seals every one of them but the last", () => {
  const held = liveStep(liveStart(), "# t\n\numa linha\n\noutra");
  assert.equal(held.sealed.length, 2);
  assert.equal(held.open, "outra");
  assert.deepEqual(held.blocks, liveMarkdown("# t\n\numa linha\n\noutra"));
});

test("what was sealed is never parsed again — the open block is all that is read", () => {
  let held = liveStep(liveStart(), "# t\n\nprimeira\n\nseg");
  const sealed = held.sealed;
  held = liveStep(held, "unda");
  assert.equal(held.sealed, sealed, "os blocos prontos foram remontados");
  assert.equal(held.open, "segunda");
});

test("a fence being typed holds the whole box open until it closes", () => {
  let held = liveStep(liveStart(), "```js\nconst a = 1;");
  assert.equal(held.sealed.length, 0);
  assert.match(held.blocks[0], /<pre class="md-code" data-lang="js">const a = 1;<\/pre>/);
  held = liveStep(held, "\n```\n\ndepois");
  assert.equal(held.sealed.length, 1);
  assert.equal(held.open, "depois");
});

test("a table that grows a rule after its head is never sealed halfway", () => {
  let held = liveStep(liveStart(), "antes\n\n| a | b |");
  assert.equal(held.sealed.length, 1);
  held = liveStep(held, "\n|---|---|\n| 1 | 2 |");
  assert.deepEqual(held.blocks, liveMarkdown("antes\n\n| a | b |\n|---|---|\n| 1 | 2 |"));
});

test("the seat paints the stream through the live render, only the open block re-parsed", () => {
  const cut = page.slice(page.indexOf("function svConvDraftPaint"), page.indexOf("function svConvDraftDrop"));
  assert.match(cut, /draft\.held = liveStep\(draft\.held, draft\.pending\)/);
  assert.match(page, /held: liveStart\(\)/);
  assert.match(page, /requestAnimationFrame\(\(\) => svConvDraftPaint\(e\)\)/);
  assert.ok(!/e\.draft\.textContent \+=/.test(page), "o rascunho ainda está sendo escrito como texto puro");
});

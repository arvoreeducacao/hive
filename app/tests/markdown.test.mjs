import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../assets/markdown.mjs";

test("escapes html before anything else", () => {
  const out = renderMarkdown('<img src=x onerror=alert(1)> and **<b>bold</b>**');
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("&lt;img"));
  assert.ok(out.includes("<b>&lt;b&gt;bold&lt;/b&gt;</b>"));
});

test("bold, italic, strike, inline code", () => {
  const out = renderMarkdown("um **forte** e *leve* e ~~riscado~~ com `x = 1`");
  assert.ok(out.includes("<b>forte</b>"));
  assert.ok(out.includes("<i>leve</i>"));
  assert.ok(out.includes("<s>riscado</s>"));
  assert.ok(out.includes("<code>x = 1</code>"));
});

test("inline code wins over emphasis inside it", () => {
  const out = renderMarkdown("veja `a ** b ** c`");
  assert.ok(out.includes("<code>a ** b ** c</code>"));
  assert.ok(!out.includes("<b>"));
});

test("links only for http(s), attributes escaped", () => {
  const out = renderMarkdown('[site](https://example.dev) e [mal](javascript:alert(1))');
  assert.ok(out.includes('href="https://example.dev"'));
  assert.ok(!out.includes('href="javascript:'));
  assert.ok(!out.includes("<a") || out.match(/<a /g).length === 1);
});

test("a bare url becomes a link, trailing punctuation stays out", () => {
  const out = renderMarkdown("Migration: https://github.com/arvoreeducacao/migrations/pull/481, depois o resto.");
  assert.ok(out.includes('<a href="https://github.com/arvoreeducacao/migrations/pull/481" target="_blank" rel="noreferrer">https://github.com/arvoreeducacao/migrations/pull/481</a>,'));
});

test("a bare url inside a list item is a link too", () => {
  const out = renderMarkdown("- **Backend**: https://github.com/arvoreeducacao/api-arvore/pull/2531");
  assert.ok(out.includes("<b>Backend</b>"));
  assert.ok(out.includes('href="https://github.com/arvoreeducacao/api-arvore/pull/2531"'));
});

test("a url already in a markdown link is not linked twice", () => {
  const out = renderMarkdown("[PR](https://github.com/x/y/pull/1) e https://github.com/x/y/pull/1");
  assert.equal(out.match(/<a /g).length, 2);
  assert.ok(!out.includes("<a href=\"#\""));
});

test("a bare url wrapped in bold keeps the markers out of the link", () => {
  const out = renderMarkdown("Publicado: **https://claude.ai/code/artifact/7d20429c**");
  assert.ok(out.includes('<b><a href="https://claude.ai/code/artifact/7d20429c" target="_blank" rel="noreferrer">https://claude.ai/code/artifact/7d20429c</a></b>'));
  assert.ok(!out.includes("**"));
});

test("underscores inside a bare url stay literal", () => {
  const out = renderMarkdown("veja https://x.com/a_b_c agora");
  assert.ok(out.includes(">https://x.com/a_b_c</a>"));
  assert.ok(!out.includes("<i>"));
});

test("an image with a local path becomes a shot link", () => {
  const out = renderMarkdown("![preview](/Users/joao/arvore-hub/.hive/assets/preview-caminho.png)");
  assert.ok(out.includes('class="md-shot"'));
  assert.ok(out.includes('data-path="/Users/joao/arvore-hub/.hive/assets/preview-caminho.png"'));
  assert.ok(out.includes(">preview</a>"));
});

test("an image with an http url is a plain link, anything else stays text", () => {
  const out = renderMarkdown("![shot](https://example.dev/a.png)");
  assert.ok(out.includes('<a href="https://example.dev/a.png" target="_blank" rel="noreferrer">shot</a>'));
  const not = renderMarkdown("![x](javascript:alert(1))");
  assert.ok(!not.includes("<a"));
});

test("code fences keep their content verbatim and named language", () => {
  const out = renderMarkdown("antes\n```js\nconst a = \"<oi>\";\n```\ndepois");
  assert.ok(out.includes('data-lang="js"'));
  assert.ok(out.includes("const a = &quot;&lt;oi&gt;&quot;;"));
  assert.ok(out.includes("<p>antes</p>"));
  assert.ok(out.includes("<p>depois</p>"));
});

test("every fence carries its own copy button, and only the fence is inside the box", () => {
  const out = renderMarkdown("antes\n```\numa linha\n```\ndepois");
  const box = out.slice(out.indexOf('<div class="md-codebox">'), out.indexOf("</div>") + 6);
  assert.ok(box.includes('<pre class="md-code"'));
  assert.ok(box.includes('<button type="button" class="md-copy"'));
  assert.ok(!box.includes("antes") && !box.includes("depois"));
});

test("a diff fence colours each line by its sign", () => {
  const out = renderMarkdown("```diff\n@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;\n const b = 3;\n```");
  assert.ok(out.includes('class="md-code md-diff" data-lang="diff"'));
  assert.ok(out.includes('<span class="del">-const a = 1;</span>'));
  assert.ok(out.includes('<span class="add">+const a = 2;</span>'));
  assert.ok(out.includes('<span class="ctx"> const b = 3;</span>'));
  assert.ok(out.includes('<span class="ctx">@@ -1,3 +1,3 @@</span>'));
});

test("diff file headers are frame, not additions or removals", () => {
  const out = renderMarkdown("```diff\n--- a/x.ts\n+++ b/x.ts\n```");
  assert.ok(out.includes('<span class="ctx">--- a/x.ts</span>'));
  assert.ok(out.includes('<span class="ctx">+++ b/x.ts</span>'));
});

test("an empty line inside a diff keeps its height", () => {
  const out = renderMarkdown("```diff\n+a\n\n+b\n```");
  assert.ok(out.includes('<span class="ctx">&#8203;</span>'));
});

test("a fence with any other language stays verbatim", () => {
  const out = renderMarkdown("```js\n-um\n+dois\n```");
  assert.ok(!out.includes("md-diff"));
  assert.ok(out.includes("-um\n+dois"));
});

test("lists, ordered and not, with shallow nesting marked", () => {
  const out = renderMarkdown("- um\n- dois\n  - fundo\n\n1. a\n2. b");
  assert.ok(out.includes("<ul><li>um</li><li>dois</li><li class=\"deep\">fundo</li></ul>"));
  assert.ok(out.includes("<ol><li>a</li><li>b</li></ol>"));
});

test("headings cap at four levels", () => {
  const out = renderMarkdown("# t1\n##### deep");
  assert.ok(out.includes('class="md-h md-h1"'));
  assert.ok(!out.includes("md-h5"));
});

test("tables need the rule line", () => {
  const out = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
  assert.ok(out.includes("<th>a</th>"));
  assert.ok(out.includes("<td>2</td>"));
  const not = renderMarkdown("| solto | sem regra |");
  assert.ok(!not.includes("<table"));
});

test("blockquote and hr", () => {
  const out = renderMarkdown("> uma linha\n> outra\n\n---");
  assert.ok(out.includes("<blockquote>uma linha<br>outra</blockquote>"));
  assert.ok(out.includes("<hr>"));
});

test("single newlines inside a paragraph become breaks", () => {
  assert.equal(renderMarkdown("linha um\nlinha dois"), "<p>linha um<br>linha dois</p>");
});

test("a file:// address to a picture is the same link a markdown image gets, named by the file", () => {
  const out = renderMarkdown("veja file:///Users/mateus/.hive/shots/x/meu%20print.png agora");
  assert.ok(out.includes('class="md-shot"'));
  assert.ok(out.includes('data-path="/Users/mateus/.hive/shots/x/meu print.png"'));
  assert.ok(out.includes(">meu print.png</a>"));
  assert.ok(!out.includes("file:///"));
});

test("a file:// picture address cannot decode its way out of the link", () => {
  const out = renderMarkdown("done: file:///tmp/a%22%3E%3Cimg%20src=x%20onerror=alert%281%29%3E%27.png");
  assert.ok(!out.includes("<img"));
  assert.ok(!out.includes('a"'));
  assert.ok(!out.includes("a'"));
  assert.ok(out.includes('data-path="/tmp/a&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&#39;.png"'));
});

test("a file:// address that is not a picture stays text", () => {
  const out = renderMarkdown("leia file:///tmp/notas.md");
  assert.ok(!out.includes("md-shot"));
  assert.ok(out.includes("file:///tmp/notas.md"));
});

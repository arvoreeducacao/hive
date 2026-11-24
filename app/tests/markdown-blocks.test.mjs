import { test } from "node:test";
import assert from "node:assert/strict";
import { filePathCandidate, liveMarkdown, liveStart, liveStep, renderMarkdown, renderMarkdownBlocks } from "../assets/markdown.mjs";

const typed = (text) => text.split("").map((_, i) => text.slice(0, i + 1));

test("a fence carries its language, its title and the wrap, copy and toolbar of a code block", () => {
  const out = renderMarkdown('```ts title="src/app/a.ts"\nconst a = 1;\n```');
  assert.match(out, /<div class="md-codebox" data-lang="ts" data-wrap="true" data-title="src\/app\/a.ts">/);
  assert.match(out, /<span class="md-codename">src\/app\/a.ts<\/span>/);
  assert.match(out, /class="md-wrap" aria-pressed="true"/);
  assert.match(out, /class="md-copy"/);
  assert.match(out, /role="toolbar"/);
  assert.ok(out.includes('<pre class="md-code" data-lang="ts">const a = 1;</pre>'));
});

test("a fence with no language says text, and a tilde fence with a longer close is a fence too", () => {
  assert.match(renderMarkdown("```\nx\n```"), /<span class="md-codename">text<\/span>/);
  const tilde = renderMarkdown("~~~~py\nprint(1)\n~~~\n~~~~~");
  assert.ok(tilde.includes('data-lang="py"'));
  assert.ok(tilde.includes("print(1)\n~~~</pre>"), "a shorter fence inside is code, not the end");
});

test("a fence indented under a list item keeps its code flush, and the list keeps its numbers", () => {
  const out = renderMarkdown("1. instale:\n   ```sh\n   npm ci\n   ```\n2. rode");
  assert.ok(out.startsWith("<ol><li>instale:<div class=\"md-codebox\""));
  assert.ok(out.includes(">npm ci</pre>"));
  assert.ok(out.includes("<li>rode</li></ol>"));
  assert.ok(renderMarkdown("3. três\n4. quatro").startsWith('<ol start="3">'));
});

test("an open fence says so, and loses the mark once it closes", () => {
  assert.match(liveMarkdown("```js\nconst a").join(""), /data-open/);
  assert.doesNotMatch(liveMarkdown("```js\nconst a\n```").join(""), /data-open/);
});

test("mermaid gets its diagram toggle only once the fence has closed", () => {
  const open = liveMarkdown("```mermaid\ngraph TD; A-->B").join("");
  assert.match(open, /data-mermaid data-open/);
  assert.doesNotMatch(open, /md-view/);
  const closed = renderMarkdown("```mermaid\ngraph TD; A-->B\n```");
  assert.match(closed, /data-mermaid/);
  assert.match(closed, /class="md-view"/);
  assert.ok(closed.includes("A--&gt;B"), "the source stays escaped until the diagram replaces it");
});

test("inline math, display math and a math fence keep their tex for KaTeX and show it until then", () => {
  const out = renderMarkdown("energia $E = mc^2$ e\n\n$$\n\\frac{a}{b}\n$$\n\n```math\nx^2\n```");
  assert.ok(out.includes('<span class="md-math" data-tex="E = mc^2" data-md-copy="$E = mc^2$">$E = mc^2$</span>'));
  assert.match(out, /<div class="md-math md-math-display" data-tex="\\frac\{a\}\{b\}" data-display/);
  assert.match(out, /data-tex="x\^2" data-display/);
});

test("money is not math", () => {
  for (const said of ["custa R$ 10 e R$ 20", "de $5 para $10", "$HOME/$USER", "o preço é $ 30"]) {
    assert.doesNotMatch(renderMarkdown(said), /md-math/, said);
  }
});

test("emphasis inside a formula is left to the formula", () => {
  const out = renderMarkdown("veja $a_1 * b_2 * c$ aqui");
  assert.ok(out.includes('data-tex="a_1 * b_2 * c"'));
  assert.ok(!out.includes("<i>"));
});

test("an open display formula is held as text and marked open", () => {
  assert.match(liveMarkdown("$$\n\\sum_i").join(""), /md-math-display" data-tex="\\sum_i" data-display data-open/);
});

test("github alerts become titled callouts with their own markdown inside", () => {
  for (const kind of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    const out = renderMarkdown(`> [!${kind}]\n> leia **isto**\n> - um item`);
    assert.match(out, new RegExp(`<div class="md-alert" data-alert="${kind.toLowerCase()}" role="note">`));
    assert.match(out, /<p class="md-alert-title"><svg/);
    assert.ok(out.includes("<p>leia <b>isto</b></p><ul><li>um item</li></ul>"));
  }
  assert.doesNotMatch(renderMarkdown("> [!NOTE] ao lado"), /md-alert/, "a marker with words after it is a plain quote, as on GitHub");
});

test("details folds, with its summary and markdown inside", () => {
  const out = renderMarkdown("<details>\n<summary>Mais **contexto**</summary>\n\n- um\n- dois\n</details>\n\ndepois");
  assert.ok(out.startsWith('<details class="md-details"><summary><svg'));
  assert.ok(out.includes("<span>Mais <b>contexto</b></span></summary>"));
  assert.ok(out.includes('<div class="md-details-body"><ul><li>um</li><li>dois</li></ul></div></details><p>depois</p>'));
  assert.match(renderMarkdown("<details open>\n<summary>x</summary>\ny\n</details>"), /<details class="md-details" open>/);
  assert.match(renderMarkdown("<details>\nsem resumo\n</details>"), /<span>Details<\/span>/);
});

test("a table scrolls on its own, keeps its alignment and carries the copy menu", () => {
  const out = renderMarkdown("| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |");
  assert.ok(out.startsWith('<div class="md-table"><div class="md-table-scroll"><table>'));
  assert.ok(out.includes('<th data-align="left">a</th><th data-align="center">b</th><th data-align="right">c</th>'));
  assert.match(out, /<div class="md-tablebar"><button type="button" class="md-table-copy" aria-haspopup="menu"/);
});

test("a table needs no outer pipes, and an escaped pipe stays in its cell", () => {
  const out = renderMarkdown("nome | valor\n--- | ---\na \\| b | 2");
  assert.ok(out.includes("<td>a | b</td><td>2</td>"));
});

test("path-shaped code and links are offered to the workspace, prose and hosts are not", () => {
  assert.equal(filePathCandidate("src/app/core.js"), "src/app/core.js");
  assert.equal(filePathCandidate("app/server.mjs:42"), "app/server.mjs:42");
  assert.equal(filePathCandidate("core.js:12:3"), "core.js:12:3");
  assert.equal(filePathCandidate("app/x.ts#L10"), "app/x.ts:10");
  assert.equal(filePathCandidate("/Users/ana/repo/README.md"), "/Users/ana/repo/README.md");
  for (const not of ["core.js", "x = 1", "github.com/a/b.c", "https://a.b/c.js", "src/components", "models/glm-5.3", "javascript:alert(1)", "localhost:3000", "a/b c.ts"]) {
    assert.equal(filePathCandidate(not), null, not);
  }
  const out = renderMarkdown("veja `src/app/core.js:42` e [o servidor](app/server.mjs) e ![d](docs/a.pdf)");
  assert.ok(out.includes('<code class="md-pathish" data-path="src/app/core.js:42">src/app/core.js:42</code>'));
  assert.ok(out.includes('<a href="#" class="md-file" data-path="app/server.mjs">o servidor</a>'));
  assert.ok(out.includes("![d](docs/a.pdf)"), "an image of something that is not a picture stays as written");
});

test("a link to another chat of the hive is marked for its chip", () => {
  const out = renderMarkdown("pergunte ao [outro chat](hive://seat/api-fix) ou a hive://seat/web-ui.");
  assert.ok(out.includes('<a href="#" class="md-seat" data-seat="api-fix">outro chat</a>'));
  assert.ok(out.includes('<a href="#" class="md-seat" data-seat="web-ui">hive://seat/web-ui</a>.'));
});

test("backslash escapes show the character and never start emphasis or math", () => {
  assert.equal(renderMarkdown("\\*não\\* e \\$5 e \\_x\\_"), "<p>*não* e $5 e _x_</p>");
});

test("headings go to six, drawn at four at most", () => {
  assert.match(renderMarkdown("###### seis"), /<div class="md-h md-h4">seis<\/div>/);
  assert.doesNotMatch(renderMarkdown("#hashtag"), /md-h/);
});

const RICH = "# Plano\n\nTexto com $x^2$ e `app/a.ts:3`.\n\n> [!TIP]\n> dica\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```mermaid\ngraph TD; A-->B\n```\n\n<details>\n<summary>mais</summary>\n\ncorpo\n</details>\n\n1. um\n   ```js\n   const a = 1;\n   ```\n2. dois\n\n$$\na+b\n$$\n\nfim";

test("what was written stays put while the rich page streams in, and the stream ends where the full render does", () => {
  let held = [];
  let live = liveStart();
  let raw = "";
  for (const so_far of typed(RICH)) {
    const blocks = liveMarkdown(so_far);
    const settled = Math.min(held.length, blocks.length) - 1;
    for (let i = 0; i < settled; i++) assert.equal(blocks[i], held[i], `o bloco ${i} mudou em "${so_far.slice(-20)}"`);
    held = blocks;
    live = liveStep(live, so_far.slice(raw.length));
    raw = so_far;
    assert.deepEqual(live.blocks, blocks, `o render por partes divergiu em "${so_far.slice(-20)}"`);
  }
  assert.deepEqual(held, renderMarkdownBlocks(RICH));
});

test("every step of a streamed fence, table and formula is html that closes what it opens", () => {
  for (const so_far of typed(RICH)) {
    const out = liveMarkdown(so_far).join("");
    for (const tag of ["div", "pre", "table", "details", "ul", "ol", "p", "span"]) {
      assert.equal((out.match(new RegExp(`<${tag}[ >]`, "g")) || []).length, (out.match(new RegExp(`</${tag}>`, "g")) || []).length, `${tag} em "${so_far.slice(-24)}"`);
    }
  }
});

test("code and emphasis written as html inside a summary show as code and emphasis", () => {
  const out = renderMarkdown("<details>\n<summary>Saída do <code>ls -la</code> e <b>mais</b></summary>\n\ncorpo\n\n</details>");
  assert.ok(out.includes("<span>Saída do <code>ls -la</code> e <b>mais</b></span>"), out);
  assert.ok(!out.includes("&lt;code&gt;"));
});

test("a task list item becomes a checkbox that says whether it is done, and copies back as markdown", () => {
  const out = renderMarkdown("- [ ] send the report\n- [x] buy **it**\n- plain");
  assert.ok(out.startsWith('<ul class="md-tasks">'));
  assert.ok(out.includes('<li class="md-task"><input type="checkbox" class="md-check" disabled data-md-copy="[ ]">send the report</li>'));
  assert.ok(out.includes('<li class="md-task"><input type="checkbox" class="md-check" disabled checked data-md-copy="[x]">buy <b>it</b></li>'));
  assert.ok(out.includes("<li>plain</li>"), "an item with no box stays a bullet");
  assert.doesNotMatch(renderMarkdown("- [link](https://a.dev)"), /md-check/, "a link is not a box");
  assert.doesNotMatch(renderMarkdown("- [x]y"), /md-check/, "the box needs a space after it");
});

test("a ★ Insight block becomes a callout, closed or still being written", () => {
  const rule = "─".repeat(40);
  const out = renderMarkdown(`before\n\`★ Insight ${rule}\`\n- one\n- two\n\`${rule}\`\nafter`);
  assert.ok(out.startsWith("<p>before</p><div class=\"md-alert\" data-alert=\"insight\" role=\"note\"><p class=\"md-alert-title\">"));
  assert.ok(out.includes("Insight</p><ul><li>one</li><li>two</li></ul></div><p>after</p>"));
  assert.match(renderMarkdown(`★ Insight ${rule}\nplain line`), /data-alert="insight"[\s\S]*<p>plain line<\/p><\/div>$/);
  const fenced = renderMarkdown(`★ Insight ${rule}\n\`\`\`txt\n${rule}\n\`\`\`\n${rule}\nout`);
  assert.ok(fenced.endsWith("</div></div><p>out</p>"), "a rule inside a fence does not close the callout");
  assert.doesNotMatch(renderMarkdown(`\`\`\`\n★ Insight ${rule}\n\`\`\``), /data-alert/, "inside a fence it stays code");
  const live = liveMarkdown(`★ Insight ${rule}\nhalf`).join("");
  assert.match(live, /data-alert="insight"[\s\S]*<p>half<\/p>/);
});

test("the code block header carries the icon of its language, or of the file it names", () => {
  assert.match(renderMarkdown("```bash\nls\n```"), /<svg class="md-i md-lang" data-glyph="terminal" data-tone="green"/);
  assert.match(renderMarkdown("```ts\nx\n```"), /data-badge="TS" data-tone="blue"/);
  assert.match(renderMarkdown("```json\n{}\n```"), /data-glyph="braces"/);
  assert.match(renderMarkdown('```\nx\n```').replace(/<span class="md-codeacts"[\s\S]*$/, ""), /<span class="md-codetitle"><span class="md-codename">text<\/span>/, "plain text has no icon");
  assert.match(renderMarkdown('```py title="a/b.py"\nx\n```'), /data-badge="PY"/);
  assert.match(renderMarkdown('```text title="Dockerfile"\nFROM x\n```'), /data-glyph="box"/);
  assert.match(renderMarkdown('```text title="notes.unknownext"\nx\n```'), /<span class="md-codetitle"><svg class="md-i" viewBox/, "an unknown file keeps the file icon");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";
import { renderMarkdown } from "../assets/markdown.mjs";

const st = await state();
const rich = await app("markdown-rich");
const { blockText } = await app("terminal-history");

const drawn = (said) => {
  const el = document.createElement("div");
  el.className = "sv-msg md";
  el.innerHTML = renderMarkdown(said);
  document.body.append(el);
  return el;
};

const settle = async (check, tries = 50) => {
  for (let i = 0; i < tries; i++) {
    if (check()) return true;
    await new Promise((done) => setTimeout(done, 10));
  }
  return check();
};

test("a closed fence is coloured once the highlighter arrives, and the next one is coloured on the spot", async () => {
  const first = drawn("```ts\nconst a: number = 1; // um\n```");
  rich.enrichMarkdown(first);
  assert.ok(await settle(() => first.querySelector(".hljs-keyword")), "the lazy highlighter never painted the block");
  assert.equal(first.querySelector("pre").textContent, "const a: number = 1; // um", "the colours keep the code as it was");
  const second = drawn("```python\ndef f():\n    return 1\n```");
  rich.enrichMarkdown(second);
  assert.ok(second.querySelector(".hljs-keyword"), "with the highlighter loaded, painting is synchronous");
  first.remove();
  second.remove();
});

test("text, diffs and unknown languages are left as written", () => {
  for (const said of ["```\nplain\n```", "```diff\n+a\n-b\n```", "```klingon\nqapla\n```"]) {
    const el = drawn(said);
    rich.enrichMarkdown(el);
    assert.equal(el.querySelector("[class^=hljs]"), null, said);
    el.remove();
  }
});

test("a long fence still being written waits for its closing fence before it is coloured", async () => {
  const long = `\`\`\`js\n${"const a = 1;\n".repeat(800)}`;
  const el = document.createElement("div");
  el.innerHTML = renderMarkdown(long).replace('data-wrap="true"', 'data-wrap="true" data-open');
  rich.enrichMarkdown(el);
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(el.querySelector(".hljs-keyword"), null);
});

test("formulas are typeset by KaTeX, and a broken one keeps its source", async () => {
  const el = drawn("área $\\pi r^2$ e quebrada $\\frac{a$\n\n$$\n\\sum_{i=1}^n i\n$$");
  rich.enrichMarkdown(el);
  const [inline, broken, display] = el.querySelectorAll(".md-math");
  assert.ok(await settle(() => inline.querySelector(".katex")), "KaTeX never typeset the inline formula");
  assert.ok(display.querySelector(".md-math-scroll .katex-display"));
  assert.equal(broken.textContent, "$\\frac{a$");
  assert.ok(document.querySelector('link[href="/assets/dist/lazy/katex/katex.min.css"]'), "the formula faces come with the first formula");
  el.remove();
});

test("copying a message gives back the formula and the chip as they were written, without the block chrome", () => {
  const el = drawn("veja $x^2$\n\n```js\nconst a = 1;\n```");
  el.querySelector(".md-math").innerHTML = "<span class=\"katex\">x²</span>";
  const said = blockText(el);
  assert.match(said, /\$x\^2\$/);
  assert.doesNotMatch(said, /Copy code|Disable line wrap|^js$/m);
  assert.equal(el.querySelector(".md-math").style.display, "");
  el.remove();
});

test("the wrap button flips the block and says what it will do next", () => {
  const el = drawn("```js\nconst a = 1;\n```");
  const box = el.querySelector(".md-codebox");
  const wrap = el.querySelector(".md-wrap");
  wrap.click();
  assert.equal(box.dataset.wrap, "false");
  assert.equal(wrap.getAttribute("aria-pressed"), "false");
  assert.equal(wrap.title, "Wrap lines");
  wrap.click();
  assert.equal(box.dataset.wrap, "true");
  el.remove();
});

test("a table copies as markdown, with its alignment, and as csv, quoting what needs it", () => {
  const el = drawn("| nome | total |\n|:--|--:|\n| a, b | $x$ |\n| \"c\" | 2 |");
  const table = el.querySelector("table");
  assert.equal(rich.tableAsMarkdown(table), "| nome | total |\n| :--- | ---: |\n| a, b | $x$ |\n| \"c\" | 2 |");
  assert.equal(rich.tableAsCsv(table), "nome,total\n\"a, b\",$x$\n\"\"\"c\"\"\",2");
  el.remove();
});

test("the table's copy button opens the menu with the three formats, and a second click closes it", () => {
  const el = drawn("| a |\n|---|\n| 1 |");
  const button = el.querySelector(".md-table-copy");
  button.click();
  const menu = document.querySelector(".md-menu");
  assert.ok(menu);
  assert.deepEqual([...menu.querySelectorAll("button")].map((one) => one.textContent), ["Copy as Markdown", "Copy as CSV", "Copy as HTML"]);
  button.click();
  assert.equal(document.querySelector(".md-menu"), null);
  el.remove();
});

class FakeClipboardItem {
  constructor(data) {
    this.data = data;
    this.types = Object.keys(data);
  }

  async getType(type) {
    return this.data[type];
  }
}

const fakeClipboard = (write) => {
  const before = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const item = globalThis.ClipboardItem;
  globalThis.ClipboardItem = FakeClipboardItem;
  Object.defineProperty(navigator, "clipboard", { value: { write, writeText: async () => { throw new Error("plain text is not enough"); } }, configurable: true });
  return () => {
    globalThis.ClipboardItem = item;
    if (before) Object.defineProperty(navigator, "clipboard", before);
    else delete navigator.clipboard;
  };
};

test("copying a table as HTML writes the markup as plain text and as text/html, and the button says it copied", async () => {
  const items = [];
  const restore = fakeClipboard(async (data) => { items.push(...data); });
  const el = drawn("| nome | total |\n|:--|--:|\n| a & b | $x$ |");
  try {
    const button = el.querySelector(".md-table-copy");
    button.click();
    const html = [...document.querySelectorAll(".md-menu button")].find((one) => one.textContent === "Copy as HTML");
    assert.ok(html);
    assert.equal(html.getAttribute("role"), "menuitem");
    html.click();
    assert.ok(await settle(() => button.classList.contains("copied")), "the button never said it copied");
    assert.equal(document.querySelector(".md-menu"), null);
    assert.equal(button.getAttribute("aria-label"), "Copied");
    assert.equal(items.length, 1);
    assert.deepEqual([...items[0].types].sort(), ["text/html", "text/plain"]);
    const markup = await (await items[0].getType("text/plain")).text();
    assert.match(markup, /^<table dir="ltr" style="border-collapse:collapse">/);
    assert.match(markup, /<td style="[^"]*">a &amp; b<\/td><td style="[^"]*;text-align:right">\$x\$<\/td>/);
    assert.equal(await (await items[0].getType("text/html")).text(), `<meta charset="utf-8">${markup}`);
  } finally {
    restore();
    el.remove();
  }
});

test("when the clipboard refuses HTML, the table copy fails the way the other formats do: no copied mark", async () => {
  const restore = fakeClipboard(async () => { throw new Error("denied"); });
  const el = drawn("| a |\n|---|\n| 1 |");
  try {
    const button = el.querySelector(".md-table-copy");
    button.click();
    [...document.querySelectorAll(".md-menu button")].find((one) => one.textContent === "Copy as HTML").click();
    await new Promise((done) => setTimeout(done, 30));
    assert.equal(button.classList.contains("copied"), false);
    assert.equal(button.getAttribute("aria-label"), "Copy table");
  } finally {
    restore();
    el.remove();
  }
});

test("a path the seat's workspace has becomes a file chip on its line, and one it lacks stays code", async () => {
  st.data = { hub: "/Users/ana/hub", sessions: [{ name: "api", where: "local", cwd: "/Users/ana/hub/api", title: "API", state: "idle" }] };
  const asked = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const q = new URL(String(url), "http://x").searchParams.get("q");
    return { ok: true, json: async () => ({ files: q === "src/app.ts" ? ["src/app.ts", "src/app.ts.bak"] : [] }) };
  };
  try {
    const el = drawn("abra `src/app.ts:42`, `/Users/ana/hub/api/src/app.ts` e `src/nada.ts`, ou [o app](src/app.ts)");
    rich.enrichMarkdown(el, { seat: { name: "api", where: "local" } });
    assert.ok(await settle(() => el.querySelectorAll(".md-chip[data-kind=file]").length === 3), el.innerHTML);
    const [first, absolute, linked] = el.querySelectorAll(".md-chip[data-kind=file]");
    assert.equal(first.dataset.path, "src/app.ts");
    assert.equal(first.dataset.line, "42");
    assert.equal(first.querySelector(".cl").textContent, "app.ts:42");
    assert.equal(first.dataset.mdCopy, "`src/app.ts:42`");
    assert.equal(absolute.dataset.path, "src/app.ts");
    assert.equal(linked.parentElement.dataset.mdCopy, "o app", "a link with words of its own keeps them beside the chip");
    assert.ok(el.querySelector("code.md-pathish[data-path='src/nada.ts']"), "a file the workspace lacks stays code");
    assert.equal(asked.filter((one) => one.includes("q=src%2Fapp.ts")).length, 1, "the same path is asked once");
  } finally {
    globalThis.fetch = before;
  }
});

test("a path outside the seat's folder is never offered", () => {
  st.data = { hub: "/Users/ana/hub", sessions: [{ name: "api", where: "local", cwd: "/Users/ana/hub/api" }] };
  assert.equal(rich.landingOf("/etc/hosts", { name: "api", where: "local" }), null);
  assert.equal(rich.landingOf("../web/x.ts", { name: "api", where: "local" }), null);
  assert.deepEqual(rich.landingOf("./src/../lib/a.ts:9:2", { name: "api", where: "local" }), { rel: "lib/a.ts", line: 9, col: 2 });
  assert.deepEqual(rich.landingOf("~/hub/api/x.md", { name: "api", where: "local" }), { rel: "x.md", line: 0, col: 0 });
});

test("a link to a chat this hive knows becomes the chat's chip, with its title", () => {
  st.data = { hub: "/h", sessions: [{ name: "web-ui", where: "local", title: "Tela nova", state: "working" }] };
  const el = drawn("veja hive://seat/web-ui e hive://seat/sumiu");
  rich.enrichMarkdown(el);
  const chip = el.querySelector(".md-chip[data-kind=chat]");
  assert.ok(chip);
  assert.equal(chip.dataset.seat, "web-ui");
  assert.equal(chip.dataset.mdCopy, "hive://seat/web-ui");
  assert.ok(el.querySelector("a.md-seat[data-seat=sumiu]"), "a chat this hive does not know stays a link");
  el.remove();
});

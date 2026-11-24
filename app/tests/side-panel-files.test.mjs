import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state } from "./dom.mjs";

const st = await state();
const { filesSurface, inertDocument, resolvedFrom } = await app("side-panel-files");
const { asMention, linesExcerpt, mentionPathOf, putInComposer } = await app("file-mentions");
const { structPool } = await app("structured-seats");

const ROOT = "/work/lote";

const LISTINGS = {
  "": { dirs: [{ name: "docs", path: "docs", nested: false }, { name: "src", path: "src", nested: false }], files: [{ name: "page.html", path: "page.html" }, { name: "README.md", path: "README.md" }] },
  src: { dirs: [], files: [{ name: "lote.ts", path: "src/lote.ts" }] },
  docs: { dirs: [], files: [{ name: "flow.mmd", path: "docs/flow.mmd" }] }
};

const FILES = {
  "README.md": "---\ntitle: Lote\n---\n# Lote consignado\n\nSee [the flow](docs/flow.mmd).\n\n```mermaid\ngraph TD; A-->B\n```\n\n<script>alert(1)</script>\n",
  "src/lote.ts": "export function canClose(lote) {\n  if (lote.consigned) return lote.remessa !== null;\n  return lote.invoice !== null;\n}\n",
  "page.html": "<html><head><meta http-equiv=\"refresh\" content=\"0;url=http://127.0.0.1:8790/api/x\"><script>parent.alert(1)</script><link rel=\"stylesheet\" href=\"http://localhost/x.css\"></head><body><h1 onclick=\"alert(1)\">Hi</h1><a href=\"http://localhost:8790/api/x\">x</a><iframe src=\"http://localhost\"></iframe></body></html>",
  "docs/flow.mmd": "graph TD; A-->B\n"
};

const asked = [];

globalThis.fetch = async (url) => {
  asked.push(String(url));
  const at = new URL(String(url), "http://hive");
  let body = {};
  if (at.pathname === "/api/tree") {
    const q = at.searchParams.get("q");
    const head = { state: "ok", root: ROOT, git: true, cut: false, total: 5 };
    body = q ? { ...head, q, matches: ["src/lote.ts"], matched: 1 } : { ...head, listing: { dir: at.searchParams.get("dir") || "", ...LISTINGS[at.searchParams.get("dir") || ""] } };
  } else if (at.pathname === "/api/tree/file") {
    const path = at.searchParams.get("path");
    const text = FILES[path];
    body = text === undefined ? { path, state: "missing" } : { path, state: "ok", size: text.length, text, language: "", lines: text.split("\n").map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;")) };
  }
  return { ok: true, json: async () => body };
};

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((done) => setTimeout(done, 0)); };

function seatNamed(name, extra = {}) {
  const seat = { name, where: "local", cwd: ROOT, trees: [], ...extra };
  st.data = { ...(st.data || {}), sessions: [...(st.data?.sessions || []).filter((one) => one.name !== name), seat] };
  return seat;
}

function mounted(seat) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const extra = {};
  const repaint = () => filesSurface.paint(host, seat, extra, repaint);
  const act = (hit, event = {}) => filesSurface.acts(hit.dataset.act, hit, seat, extra, repaint, event);
  return { host, extra, repaint, act };
}

function composerFor(name) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.name = name;
  tile.innerHTML = '<form class="sv-composer"><textarea></textarea></form>';
  document.body.appendChild(tile);
  const sent = [];
  structPool.set(name, { name, host: tile, mirror: false, ws: { readyState: 1, send: (data) => sent.push(data) } });
  return { tile, box: tile.querySelector("textarea"), sent };
}

const rowNames = (host) => [...host.querySelectorAll(".fx-list .fx-row .fx-name")].map((one) => one.textContent);

test("the tree shows the chat's folder and opens a folder only when asked", async () => {
  const seat = seatNamed("tree-seat");
  const { host, repaint, act } = mounted(seat);
  repaint();
  assert.match(host.querySelector(".fx-list").textContent, /Reading the files/);
  await settle();
  assert.deepEqual(rowNames(host), ["docs", "src", "page.html", "README.md"]);
  assert.ok(!asked.some((url) => url.includes("dir=src")), "a closed folder is not listed");
  act(host.querySelector('.fx-dir[data-path="src"]'));
  await settle();
  assert.deepEqual(rowNames(host), ["docs", "src", "lote.ts", "page.html", "README.md"]);
  assert.equal(host.querySelector('.fx-dir[data-path="src"]').getAttribute("aria-expanded"), "true");
  assert.equal(host.querySelector('.fx-item[data-path="src/lote.ts"]').getAttribute("draggable"), "true");
  assert.match(host.querySelector(".fx-foot").textContent, /lote/);
});

test("the filter asks the server for names and shows each match inside its folder", async () => {
  const seat = seatNamed("filter-seat");
  const { host, repaint } = mounted(seat);
  repaint();
  await settle();
  const input = host.querySelector(".fx-q");
  input.value = "lot";
  filesSurface.typed({ target: input }, seat);
  repaint();
  await new Promise((done) => setTimeout(done, 200));
  await settle();
  assert.ok(asked.some((url) => url.includes("q=lot")));
  assert.deepEqual(rowNames(host), ["src", "lote.ts"]);
  assert.equal(host.querySelector(".fx-name mark").textContent, "lot");
});

test("a markdown file renders with its diagram, and the source view numbers every line", async () => {
  const seat = seatNamed("md-seat");
  const { host, repaint, act } = mounted(seat);
  repaint();
  await settle();
  act(host.querySelector('.fx-item[data-path="README.md"]'));
  await settle();
  const doc = host.querySelector(".fx-body .fx-doc");
  assert.ok(doc, "markdown is rendered, not shown as text");
  assert.match(doc.textContent, /Lote consignado/);
  assert.ok(doc.querySelector('.md-codebox[data-mermaid]'), "a fenced mermaid block goes to the diagram renderer");
  assert.ok(doc.querySelector('.md-codebox[data-lang="yaml"]'), "the front matter reads as yaml, not as a heading");
  assert.equal(doc.querySelector("script"), null, "html inside markdown is escaped");
  assert.ok(doc.querySelector('a.md-file[data-path="docs/flow.mmd"]'));
  act(host.querySelector('[data-act="files-source"]'));
  assert.equal(host.querySelectorAll(".fx-ln").length, FILES["README.md"].split("\n").length - 1);
  assert.equal(host.querySelector(".fx-pick").hidden, false);
  act(host.querySelector('[data-act="files-back"]'));
  assert.equal(host.querySelector(".fx-file").hidden, true);
});

test("a link between documents opens the other file in the same tab", async () => {
  const seat = seatNamed("link-seat");
  const { host, extra, repaint, act } = mounted(seat);
  repaint();
  await settle();
  act(host.querySelector('.fx-item[data-path="README.md"]'));
  await settle();
  host.querySelector("a.md-file").dispatchEvent(new dom.MouseEvent("click", { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(extra.filesPath, "docs/flow.mmd");
  assert.ok(host.querySelector('.fx-doc .md-codebox[data-mermaid]'), "a .mmd file is drawn as a diagram");
  assert.equal(resolvedFrom("docs/a/b.md", "../c.md"), "docs/c.md");
  assert.equal(resolvedFrom("docs/b.md", "/src/x.ts:12"), "src/x.ts");
  assert.equal(resolvedFrom("b.md", "../../etc/passwd"), "");
  assert.equal(resolvedFrom("b.md", "https://example.com"), "");
});

test("an html page renders in a sandbox with no scripts, no network and no way out", async () => {
  const seat = seatNamed("html-seat");
  const { host, repaint, act } = mounted(seat);
  repaint();
  await settle();
  act(host.querySelector('.fx-item[data-path="page.html"]'));
  await settle();
  const frame = host.querySelector("iframe.fx-frame");
  assert.ok(frame);
  assert.equal(frame.getAttribute("sandbox"), "", "no allow-scripts, no allow-same-origin");
  const page = inertDocument(FILES["page.html"]);
  assert.match(page, /<meta http-equiv="Content-Security-Policy" content="default-src 'none';/);
  assert.doesNotMatch(page, /<script|refresh|onclick|<iframe|<link/i);
  assert.match(page, /<a href="http:\/\/localhost:8790\/api\/x" target="_blank">/);
  assert.match(page, /<h1>Hi<\/h1>/);
});

test("picked lines go into the composer with the path and the range, and nothing is sent", async () => {
  const seat = seatNamed("pick-seat");
  const { box, sent } = composerFor("pick-seat");
  box.value = "Look at this:";
  const { host, repaint, act } = mounted(seat);
  repaint();
  await settle();
  act(host.querySelector('.fx-dir[data-path="src"]'));
  await settle();
  act(host.querySelector('.fx-item[data-path="src/lote.ts"]'));
  await settle();
  assert.equal(host.querySelector('[data-act="files-send"]').disabled, true);
  act(host.querySelector('.fx-no[data-line="2"]'));
  act(host.querySelector('.fx-no[data-line="3"]'), { shiftKey: true });
  assert.equal(host.querySelectorAll(".fx-ln.sel").length, 2);
  assert.match(host.querySelector(".fx-range").textContent, /2.3/);
  act(host.querySelector('[data-act="files-send"]'));
  assert.equal(box.value, "Look at this:\n\n@src/lote.ts#L2-3\n```ts\n  if (lote.consigned) return lote.remessa !== null;\n  return lote.invoice !== null;\n```\n");
  assert.deepEqual(sent, []);
  structPool.delete("pick-seat");
});

test("a file dragged from the tree lands in the chat's composer as a mention", async () => {
  const seat = seatNamed("drag-seat");
  const { tile, box, sent } = composerFor("drag-seat");
  const { host, repaint } = mounted(seat);
  repaint();
  await settle();
  const carried = new Map();
  const transfer = { types: [], effectAllowed: "", dropEffect: "", setData(type, value) { carried.set(type, value); this.types = [...carried.keys()]; }, getData: (type) => carried.get(type) || "" };
  const fire = (target, type) => {
    const event = new dom.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    target.dispatchEvent(event);
    return event;
  };
  fire(host.querySelector('.fx-item[data-path="README.md"]'), "dragstart");
  assert.equal(carried.get("text/plain"), "@README.md");
  const over = fire(box, "dragover");
  assert.equal(over.defaultPrevented, true);
  assert.ok(tile.classList.contains("dropping"));
  fire(box, "drop");
  assert.equal(box.value, "@README.md ");
  assert.ok(!tile.classList.contains("dropping"));
  fire(host.querySelector('.fx-dir[data-path="docs"]'), "dragstart");
  fire(host, "drop");
  assert.equal(box.value, "@README.md ", "a drop back on the panel is ignored");
  fire(box, "drop");
  assert.equal(box.value, "@README.md @docs/ ");
  assert.deepEqual(sent, []);
  structPool.delete("drag-seat");
});

test("the mention is written from where the chat stands", () => {
  const payload = { root: "/hub/.wt-x", path: "app/a.ts", folder: false, where: "local" };
  assert.equal(mentionPathOf({ cwd: "/hub/.wt-x", where: "local" }, payload), "app/a.ts");
  assert.equal(mentionPathOf({ cwd: "/hub", where: "local" }, payload), ".wt-x/app/a.ts");
  assert.equal(mentionPathOf({ cwd: "/elsewhere", where: "local" }, payload), "/hub/.wt-x/app/a.ts");
  assert.equal(mentionPathOf({ cwd: "/hub/.wt-x", where: "local" }, { ...payload, path: "app", folder: true }), "app/");
  assert.equal(asMention("docs/new note.md"), '@"docs/new note.md"');
  assert.equal(linesExcerpt("a.md", 4, 4, "```js\nx\n```", "md"), "@a.md#L4\n````md\n```js\nx\n```\n````");
  assert.equal(putInComposer("nobody-here", "@a.md"), false);
});

test("a plain shell never takes a file mention, an agent in a terminal does", async () => {
  const { pool } = await app("leader-key");
  const { canTake } = await app("file-mentions");
  const pasted = [];
  const live = { term: { paste: (text) => pasted.push(text), focus() {} }, ws: { readyState: 1 } };
  const before = st.data;
  st.data = { ...(st.data || {}), sessions: [...(st.data?.sessions || []), { name: "plain-shell", where: "local", kind: "shell" }, { name: "agent-term", where: "local", agent: "claude" }] };
  pool.set("plain-shell", live);
  pool.set("agent-term", live);
  try {
    assert.equal(canTake("plain-shell"), false);
    assert.equal(putInComposer("plain-shell", "@a.md"), false);
    assert.equal(canTake("agent-term"), true);
    assert.equal(putInComposer("agent-term", "@a.md", { focus: false }), true);
    assert.deepEqual(pasted, ["@a.md "]);
  } finally {
    pool.delete("plain-shell");
    pool.delete("agent-term");
    st.data = before;
  }
});

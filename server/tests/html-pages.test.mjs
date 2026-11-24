import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_DEFAULT_HEIGHT, PAGE_MAX_BYTES, isPageId, keepPage, pageAppearance, pageHeight, pageSource, pagePathOf, pageTitle, pageWidth, readRenderAnswer, renderAnswer } from "../peer/html-pages.mjs";
import { pagePreview } from "../peer/peer.mjs";
import { PEER_TOOLS, peerCalls } from "../peer/peer-tools.mjs";
import { socketPathFor } from "../door.mjs";

const PNG_DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-pages-"));
  for (const dir of ["sessions", "sock", "status", "events"]) await mkdir(join(base, dir), { recursive: true });
  await writeFile(join(base, "sessions", "drawer.json"), JSON.stringify({ session_id: "s1", cwd: "/w/drawer" }));
  return base;
}

const said = (reply) => reply.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

test("a page comes either as html or as a path, never both and never neither", async () => {
  assert.match((await pageSource({})).error, /either as html or as path/);
  assert.match((await pageSource({ html: "<p>a</p>", path: "/tmp/a.html" })).error, /either as html or as path/);
  assert.equal((await pageSource({ html: "<p>a</p>" })).html, "<p>a</p>");
});

test("a page file has to be a full path to an html file that exists and fits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hive-page-file-"));
  try {
    assert.match((await pageSource({ path: "page.html" })).error, /not a full path/);
    assert.match((await pageSource({ path: join(dir, "notes.txt") })).error, /not an \.html file/);
    assert.match((await pageSource({ path: join(dir, "gone.html") })).error, /there is no file/);
    await writeFile(join(dir, "big.html"), "x".repeat(PAGE_MAX_BYTES + 1));
    assert.match((await pageSource({ path: join(dir, "big.html") })).error, /bigger than/);
    await writeFile(join(dir, "ok.html"), "<h1>ok</h1>");
    assert.equal((await pageSource({ path: join(dir, "ok.html") })).html, "<h1>ok</h1>");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a page that grows with its frame is refused before it reaches the chat", async () => {
  assert.match((await pageSource({ html: "<div style='height:100vh'></div>" })).error, /vh units/);
  assert.match((await pageSource({ html: "<style>.a{min-height:50dvh}</style>" })).error, /vh units/);
  assert.match((await pageSource({ html: "<style>html, body { margin: 0; height: 100% }</style>" })).error, /height:100%/);
  assert.match((await pageSource({ html: "<style>body{min-height:100%}</style>" })).error, /height:100%/);
  assert.equal((await pageSource({ html: "<style>.card { height: 100% } body .x { height: 100% }</style>" })).error, undefined, "only html and body themselves are held to it");
  assert.equal((await pageSource({ html: "<p>the review is due in 2 weeks</p>" })).error, undefined);
});

test("height:100% written in the style of html or body is refused as well", async () => {
  assert.match((await pageSource({ html: '<html style="height:100%"><body style="height:100%">Hello</body></html>' })).error, /height:100%/);
  assert.match((await pageSource({ html: "<body class='x' style='margin:0; min-height: 100%'>" })).error, /height:100%/);
  assert.equal((await pageSource({ html: '<body style="max-height:100%"><div style="height:100%">x</div>' })).error, undefined);
});

test("the limit holds for the page as it will be drawn, images inlined", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hive-page-heavy-"));
  try {
    const one = join(dir, "one.png");
    const two = join(dir, "two.png");
    await writeFile(one, Buffer.alloc(4_500_000, 1));
    await writeFile(two, Buffer.alloc(4_500_000, 2));
    assert.match((await pageSource({ html: `<img src="${one}"><img src="${two}">` })).error, /with its images inlined the page is bigger/);
    assert.equal((await pageSource({ html: `<img src="${one}">` })).error, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("local images given as absolute paths are inlined, and the ones that are not there are named", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hive-page-img-"));
  try {
    const dot = join(dir, "dot.png");
    await writeFile(dot, Buffer.from(PNG_DOT.split(",")[1], "base64"));
    const gone = join(dir, "gone.png");
    const done = await pageSource({ html: `<img src="${dot}"><img src='${gone}'><img src="https://example.com/a.png"><img src="${dot}">` });
    assert.equal(done.html.split("data:image/png;base64,").length - 1, 2, "both uses of the same file are inlined");
    assert.ok(done.html.includes(`src='${gone}'`), "a missing file is left as it was");
    assert.ok(done.html.includes('src="https://example.com/a.png"'), "remote images load as they are");
    assert.deepEqual(done.missing, [gone]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("title, height, width and appearance are held to their ranges", () => {
  assert.match(pageTitle("   ").error, /give the page a title/);
  assert.match(pageTitle("x".repeat(201)).error, /longer than 200/);
  assert.equal(pageTitle("  Sales\n by month ").title, "Sales by month");
  assert.equal(pageHeight(10), 80);
  assert.equal(pageHeight(99999), 2000);
  assert.equal(pageHeight("nope"), PAGE_DEFAULT_HEIGHT);
  assert.equal(pageWidth(100), 240);
  assert.equal(pageWidth(undefined), 728);
  assert.equal(pageAppearance("light"), "light");
  assert.equal(pageAppearance("neon"), "dark");
});

test("a kept page lands under the chat's own folder and its answer reads back", async () => {
  const base = await mkdtemp(join(tmpdir(), "hive-page-keep-"));
  try {
    const id = await keepPage({ base, seat: "drawer", html: "<p>hi</p>" });
    assert.ok(isPageId(id));
    assert.equal(readFileSync(pagePathOf(base, "drawer", id), "utf8"), "<p>hi</p>");
    await assert.rejects(keepPage({ base, seat: "../evil", html: "x" }), /no chat/);
    const answer = renderAnswer({ id, title: "Hi", height: 300 });
    assert.deepEqual(readRenderAnswer(answer), { id, title: "Hi", height: 300 });
    assert.match(JSON.parse(answer).message, /Do not describe it again/);
    assert.equal(readRenderAnswer("not json"), null);
    assert.equal(readRenderAnswer(JSON.stringify({ render: { id: "../../etc", title: "x", height: 1 } })), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("html_render keeps the page and hands back only a small reference, never the page itself", async () => {
  const base = await hive();
  try {
    const calls = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "drawer", PATH: "" });
    const page = `<h1>${"chart ".repeat(200)}</h1>`;
    const reply = await calls.html_render({ html: page, title: "Chart", height: 420 });
    assert.equal(reply.isError, undefined, said(reply));
    const text = said(reply);
    assert.ok(!text.includes("chart chart"), "the agent's context does not get the page back");
    const ref = readRenderAnswer(text);
    assert.equal(ref.title, "Chart");
    assert.equal(ref.height, 420);
    assert.equal(readFileSync(pagePathOf(base, "drawer", ref.id), "utf8"), page);
    const refused = await calls.html_render({ html: "<div style='height:100vh'></div>", title: "Tall", height: 300 });
    assert.equal(refused.isError, true);
    const untitled = await calls.html_render({ html: "<p>x</p>", title: " ", height: 300 });
    assert.equal(untitled.isError, true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("both page tools are open to a read-only chat, since they only change what this chat shows", () => {
  const names = PEER_TOOLS.map((tool) => tool.name);
  assert.ok(names.includes("html_preview") && names.includes("html_render"));
  const render = PEER_TOOLS.find((tool) => tool.name === "html_render");
  assert.deepEqual(render.inputSchema.required, ["title", "height"]);
  assert.match(render.description, /--background/);
  assert.match(render.description, /vh units/);
});

test("html_preview asks the app on this machine and turns the picture and the measures into an answer", async () => {
  const base = await hive();
  try {
    await writeFile(socketPathFor({ home: base }), "");
    const asked = [];
    const ask = async (door, method, path, payload) => {
      asked.push({ door, method, path, payload });
      return { ok: true, said: { image: PNG_DOT, contentHeight: 512, capturedHeight: 512, console: [{ level: "error", text: "boom" }] } };
    };
    const env = { HIVE_STATE_DIR: base, HIVE_SEAT: "drawer", PATH: "" };
    const done = await pagePreview({ html: "<p>x</p>", width: 390, appearance: "light", env, ask });
    assert.equal(done.contentHeight, 512);
    assert.equal(asked[0].path, "/api/render/preview");
    assert.deepEqual(asked[0].payload, { name: "drawer", html: "<p>x</p>", width: 390, appearance: "light" });
    const nobody = await pagePreview({ html: "<p>x</p>", env: { HIVE_STATE_DIR: base, PATH: "" }, ask });
    assert.match(nobody.error, /no seat/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("html_preview says plainly when no app is open to draw the page", async () => {
  const base = await hive();
  try {
    const calls = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "drawer", PATH: "" });
    assert.ok(!existsSync(socketPathFor({ home: base })));
    const reply = await calls.html_preview({ html: "<p>x</p>" });
    assert.equal(reply.isError, true);
    assert.match(said(reply), /no hive answering on this machine/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

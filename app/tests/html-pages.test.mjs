import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { svToolCard, svToolResult } = await app("subagents-dock");
const { getStructured } = await app("chat-stretches");
const { svConvSeed } = await app("conversation-model");
const { isPageTool, readRenderAnswer } = await app("html-pages");
const { PAGE_POLICY, dressPage, previewStage } = await app("page-dress");
await app("hold-numbers");

const PAGE = "6f1d3c2a-9b8e-4c7d-a6f5-1e2d3c4b5a69";
const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (String(url).includes(PAGE)) return { ok: true, status: 200, text: async () => "<h1>Sales</h1>" };
  return { ok: false, status: 404, text: async () => "" };
};
after(() => { globalThis.fetch = realFetch; });

function seatOf(name, where = "local") {
  st.data = { sessions: [{ name, where, state: "idle" }], spawning: [] };
  const e = getStructured({ name, where });
  e.conv = svConvSeed();
  document.body.appendChild(e.host);
  return e;
}

const answer = (id, title = "Sales by month", height = 420) => [{ type: "text", text: JSON.stringify({ render: { id, title, height }, message: "on screen" }) }];

const settle = async () => { for (let hop = 0; hop < 3; hop++) await new Promise((done) => setTimeout(done, 10)); };

test("only the hive's own html_render becomes a page in the chat", () => {
  assert.ok(isPageTool("mcp__hive__html_render"));
  assert.ok(isPageTool("hive:html_render"));
  assert.ok(!isPageTool("mcp__other-server__html_render"));
  assert.ok(!isPageTool("html_render_extra"));
});

test("the theme, the policy and the height reporter go after the doctype, so the page stays in standards mode", () => {
  const dressed = dressPage("<!doctype html><html><body><p>x</p></body></html>", "light", { report: true });
  assert.match(dressed, /^<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
  assert.ok(dressed.includes("--background: #fcfcfc"));
  assert.ok(dressed.includes("hive-page-height"));
  const bare = dressPage("<p>x</p>", "dark");
  assert.match(bare, /^<!DOCTYPE html>/);
  assert.ok(bare.includes("--background: #0a0a0a"));
  assert.ok(!bare.includes("hive-page-height"), "a preview measures from outside and needs no reporter");
});

test("before any code of the page runs, the chat and the preview take WebRTC out of the page", async () => {
  const { PAGE_SHIELD } = await import("/assets/page-shield.mjs");
  for (const report of [true, false]) {
    const dressed = dressPage("<p>x</p><script>page()</script>", "dark", { report });
    const first = /<script>([\s\S]*?)<\/script>/.exec(dressed);
    assert.equal(first[1], PAGE_SHIELD, "the shield is the first script of the page");
    assert.ok(first.index < dressed.indexOf("<style>") && first.index < dressed.indexOf("<p>x</p>"));
  }
  assert.match(PAGE_POLICY, /(^|; )webrtc 'block'(;|$)/);
});

test("the preview draws the page inside a sandboxed frame, so a child frame the page makes never shares its window", () => {
  const stage = new DOMParser().parseFromString(previewStage('<p class="x">a "quoted" & page</p>', "light"), "text/html");
  const frames = stage.querySelectorAll("iframe");
  assert.equal(frames.length, 1);
  const [frame] = frames;
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
  assert.equal(frame.getAttribute("csp"), PAGE_POLICY);
  assert.equal(frame.getAttribute("srcdoc"), dressPage('<p class="x">a "quoted" & page</p>', "light", { report: true }), "the page inside is the chat's own dressing, with the shield and the height reporter");
  assert.ok(stage.querySelector("style").textContent.includes("#fcfcfc"), "the stage paints the page's own ground");
  const holder = [...stage.querySelectorAll("script")].map((one) => one.textContent).join("");
  assert.match(holder, /event\.source !== frame\.contentWindow/, "only the page's frame sets its height");
});

test("the page policy keeps the Hive and this machine out of the page's reach", () => {
  assert.match(PAGE_POLICY, /default-src 'none'/);
  assert.match(PAGE_POLICY, /connect-src https:(;|$)/);
  assert.match(PAGE_POLICY, /form-action 'none'/);
  assert.match(PAGE_POLICY, /frame-src 'none'/);
  for (const part of PAGE_POLICY.split(";")) {
    assert.doesNotMatch(part, /\bhttp:|hive:|localhost|'self'|\*/, `${part.trim()} would let the page reach this machine`);
  }
});

test("a render answer is read back only when its id is a page id", () => {
  assert.deepEqual(readRenderAnswer(answer(PAGE)[0].text), { id: PAGE, title: "Sales by month", height: 420 });
  assert.equal(readRenderAnswer(JSON.stringify({ render: { id: "../x", title: "t", height: 1 } })), null);
  assert.equal(readRenderAnswer("the page is on screen"), null);
  assert.equal(readRenderAnswer(JSON.stringify({ render: { id: PAGE, title: "t", height: 99999 } })).height, 2000);
});

test("a page lands in a sandboxed frame that cannot reach the app, with the chat's own folder in the address", async () => {
  const e = seatOf("pages-one");
  const row = svToolCard(e, { id: "tu-1", name: "mcp__hive__html_render", input: { html: "<h1>Sales</h1>", title: "Sales by month", height: 420 } }, true);
  assert.equal(row.dataset.page, "1");
  assert.equal(row.dataset.state, "drawing");
  assert.equal(row.querySelector("iframe"), null, "nothing is drawn before the page is kept");
  await svToolResult(e, { tool_use_id: "tu-1", content: answer(PAGE) }, true);
  await settle();
  assert.ok(fetched.some((url) => url === `/api/render/page?name=pages-one&where=local&id=${PAGE}`));
  const frame = row.querySelector("iframe.sv-page-frame");
  assert.ok(frame);
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts", "no same origin, no forms, no popups, no top navigation");
  assert.equal(frame.getAttribute("csp"), PAGE_POLICY, "a page that navigates away keeps the policy or is refused");
  assert.ok(frame.srcdoc.includes("<h1>Sales</h1>"));
  assert.ok(frame.srcdoc.includes("Content-Security-Policy"));
  assert.equal(frame.style.height, "420px", "the frame starts at the height the agent measured");
  assert.equal(row.dataset.state, "ready");
  assert.equal(row.querySelector(".sv-page-grow").hidden, false);
});

test("the frame takes the height its own page reports, held between 80 and 20000", async () => {
  const e = seatOf("pages-two");
  const row = svToolCard(e, { id: "tu-2", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-2", content: answer(PAGE) }, true);
  await settle();
  const frame = row.querySelector("iframe.sv-page-frame");
  const say = (height, source = frame.contentWindow) => window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-height", height }, source }));
  say(612.2);
  assert.equal(frame.style.height, "613px");
  say(999999);
  assert.equal(frame.style.height, "20000px");
  say(10);
  assert.equal(frame.style.height, "80px");
  say(500, window);
  assert.equal(frame.style.height, "80px", "another window cannot resize this frame");
});

test("a page that keeps growing with its own frame is held instead of climbing to the ceiling", async () => {
  const e = seatOf("pages-loop");
  const row = svToolCard(e, { id: "tu-7", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-7", content: answer(PAGE) }, true);
  await settle();
  const frame = row.querySelector("iframe.sv-page-frame");
  for (let step = 1; step <= 20; step++) window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-height", height: 420 + step * 16 }, source: frame.contentWindow }));
  assert.equal(frame.dataset.fit, "held");
  assert.ok(parseFloat(frame.style.height) <= 2000);
  const held = frame.style.height;
  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-height", height: 9000 }, source: frame.contentWindow }));
  assert.equal(frame.style.height, held, "a held frame stops following the page");
});

test("a page that grows while its frame widens, as when a chat opens, keeps following its height", async () => {
  const e = seatOf("pages-widening");
  const row = svToolCard(e, { id: "tu-9", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-9", content: answer(PAGE) }, true);
  await settle();
  const frame = row.querySelector("iframe.sv-page-frame");
  let width = 300;
  Object.defineProperty(frame, "clientWidth", { configurable: true, get: () => width });
  for (let step = 1; step <= 20; step++) {
    width += 40;
    window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-height", height: 300 + step * 16 }, source: frame.contentWindow }));
  }
  assert.equal(frame.dataset.fit, "1", "a wider frame is a new layout, not a page chasing its own frame");
  assert.equal(frame.style.height, `${300 + 20 * 16}px`);
});

test("a cloud chat's page is asked for with where=cloud", async () => {
  const e = seatOf("pages-cloud", "cloud");
  svToolCard(e, { id: "tu-3", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-3", content: answer(PAGE) }, true);
  assert.ok(fetched.some((url) => url === `/api/render/page?name=pages-cloud&where=cloud&id=${PAGE}`));
});

test("a refused or lost page says so in the chat instead of leaving an empty box", async () => {
  const e = seatOf("pages-bad");
  const refused = svToolCard(e, { id: "tu-4", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-4", is_error: true, content: [{ type: "text", text: "the page sizes something with vh units" }] }, true);
  assert.equal(refused.dataset.state, "bad");
  assert.match(refused.querySelector(".sv-page-note").textContent, /vh units/);
  const lost = svToolCard(e, { id: "tu-5", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-5", content: answer("6f1d3c2a-9b8e-4c7d-a6f5-000000000000") }, true);
  assert.equal(lost.dataset.state, "bad");
  assert.equal(lost.querySelector("iframe"), null);
});

test("full screen opens the page over the app, escape closes it and the focus goes back to the button", async () => {
  const e = seatOf("pages-full");
  const row = svToolCard(e, { id: "tu-6", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-6", content: answer(PAGE) }, true);
  await settle();
  const grow = row.querySelector(".sv-page-grow");
  assert.ok(grow.getAttribute("aria-label"));
  grow.focus();
  grow.click();
  const viewer = document.querySelector(".sv-page-viewer");
  assert.ok(viewer);
  assert.equal(viewer.getAttribute("role"), "dialog");
  assert.equal(viewer.querySelector(".sv-page-viewer-title").textContent, "Sales by month");
  assert.equal(document.activeElement, viewer.querySelector(".sv-page-viewer-close"));
  assert.equal(viewer.querySelector("iframe").getAttribute("sandbox").includes("allow-same-origin"), false);
  assert.equal(e.host.inert, true, "the app behind the full screen page is out of the keyboard's reach");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(document.querySelector(".sv-page-viewer"), null);
  assert.ok(document.activeElement === grow, "the focus returns to the button that opened it");
  assert.equal(e.host.inert, false, "and the app is reachable again");
});

test("escape pressed inside the full screen page closes it, and no other window can close it", async () => {
  const e = seatOf("pages-esc");
  const row = svToolCard(e, { id: "tu-8", name: "mcp__hive__html_render", input: {} }, true);
  await svToolResult(e, { tool_use_id: "tu-8", content: answer(PAGE) }, true);
  await settle();
  row.querySelector(".sv-page-grow").click();
  const frame = document.querySelector(".sv-page-viewer iframe");
  assert.ok(frame.srcdoc.includes("hive-page-escape"), "the full screen page tells the app about escape");
  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-escape" }, source: window }));
  assert.ok(document.querySelector(".sv-page-viewer"), "a message from elsewhere is ignored");
  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "hive-page-escape" }, source: frame.contentWindow }));
  assert.equal(document.querySelector(".sv-page-viewer"), null);
});

test("a page stays in the chat when the turn folds its work away", async () => {
  const { deriveTimelineRows } = await app("timeline-rows");
  const blocks = [
    { key: "a", kind: "bubble", text: "draw it", at: 1 },
    { key: "b", kind: "tool", tool: "Bash", face: "run", at: 2 },
    { key: "c", kind: "node", el: document.createElement("div"), at: 3 },
    { key: "d", kind: "said", text: "done", at: 4 }
  ];
  const rows = deriveTimelineRows(blocks, { say: (text) => text });
  assert.ok(rows.some((row) => row.kind === "block" && row.key === "c"), "the page row is not folded into Worked for");
});

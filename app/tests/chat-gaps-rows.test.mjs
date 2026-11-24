import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
import { cleanPatch, cleanToolCalls, TOOL_CALLS_CHOICES } from "../lib/config.mjs";

await views();
const rows = await app("timeline-rows");
const model = await app("conversation-model");
const inspector = await app("tool-inspector");

const say = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) : text);

let n = 0;
const key = () => `g${++n}`;
const ask = (text, at, extra = {}) => ({ key: key(), kind: "bubble", body: text, text, at: String(at), dataset: {}, thumbs: [], ...extra });
const said = (text, at, extra = {}) => ({ key: key(), kind: "said", parts: [`<p>${text}</p>`], at: at ? String(at) : "", streaming: false, ...extra });
const tool = (face, name, extra = {}) => ({ key: key(), kind: "tool", face, tool: name, name, arg: "", running: false, stat: "ok", keep: false, ...extra });
const think = (body) => ({ key: key(), kind: "think", body });
const look = (extra = {}) => ({ say, busy: false, ...extra });
const shown = (out) => out.flatMap((row) => (row.kind === "block" ? [row.block] : row.kind === "work-group" ? row.items.map((one) => one.block) : []));

test("the tool calls setting takes only its four choices, and anything else falls back to all", () => {
  assert.deepEqual(TOOL_CALLS_CHOICES, ["all", "failed", "none", "zen"]);
  assert.equal(cleanToolCalls(undefined, "x", []), "all");
  const problems = [];
  assert.equal(cleanToolCalls("loud", "x", problems), "all");
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ toolCalls: "zen" }), { clean: { toolCalls: "zen" }, problems: [] });
});

test("hide successful keeps what failed, what runs, pictures, questions and plans", () => {
  const ok = tool("run", "Bash");
  const bad = tool("run", "Bash", { stat: "bad" });
  const running = tool("read", "Read", { running: true, stat: "" });
  const picture = tool("mcp", "shot", { keep: true });
  const question = tool("ask", "AskUserQuestion");
  const list = [ask("go", 1), ok, bad, running, picture, question, think("hm"), said("done", 9)];
  const kept = rows.visibleBlocks(list, "failed");
  assert.ok(!kept.includes(ok));
  for (const one of [bad, running, picture, question]) assert.ok(kept.includes(one), one.tool);
  const none = rows.visibleBlocks(list, "none");
  assert.deepEqual(none.filter((b) => b.kind === "tool").map((b) => b.tool), ["shot", "AskUserQuestion"]);
  assert.ok(none.some((b) => b.kind === "think"), "hide all still keeps the thinking");
  assert.ok(rows.visibleBlocks(list, "all") === list);
});

test("zen keeps the messages and the last answer of each stretch, with no fold", () => {
  const first = said("looking", 2);
  const last = said("all done", 9);
  const steerAnswer = said("ok, also that", 14);
  const list = [ask("fix it", 1), first, tool("run", "Bash"), think("x"), last, ask("and this?", 10, { dataset: { cid: "c1" } }), tool("read", "Read"), steerAnswer];
  const out = rows.deriveTimelineRows(list, look({ tools: "zen", steers: new Set(["c1"]) }));
  assert.deepEqual(shown(out).map((b) => b.kind), ["bubble", "said", "bubble", "said"]);
  assert.ok(shown(out)[1] === last);
  assert.ok(shown(out)[3] === steerAnswer);
  assert.equal(out.some((row) => row.kind === "turn-fold"), false);
});

test("zen while working shows the clock and the answer being written, not the live tool line", () => {
  const list = [ask("go", 1), tool("run", "Bash", { running: true, stat: "" }), said("half", 0, { streaming: true })];
  const out = rows.deriveTimelineRows(list, look({ tools: "zen", busy: true, since: 1 }));
  assert.deepEqual(out.map((row) => row.kind), ["block", "working", "block"]);
  assert.equal(out.some((row) => row.kind === "work-live" || row.kind === "thinking"), false);
});

test("a message from another chat folds into one line under its sender, and the sender line goes away", () => {
  const from = { key: key(), kind: "peer", from: "from ", name: "Book cipher", seat: "book-cipher", says: "another chat wrote to this one" };
  const bubble = ask("Note from the chat\nsecond line", 5, { peer: true });
  const out = rows.deriveTimelineRows([ask("hi", 1), said("hello", 2), from, bubble], look());
  assert.equal(out.some((row) => row.block?.kind === "peer"), false);
  const row = out.find((one) => one.block === bubble);
  assert.deepEqual(row.from, { name: "Book cipher", seat: "book-cipher", says: "another chat wrote to this one" });
  assert.equal(row.gist, "Note from the chat");
  assert.equal(row.open, false);
  const opened = rows.deriveTimelineRows([from, bubble], look({ users: new Set([bubble.key]) }));
  assert.equal(opened.find((one) => one.block === bubble).open, true);
  const lone = { ...from, key: key() };
  assert.ok(rows.deriveTimelineRows([lone, said("x", 1)], look()).some((one) => one.block === lone), "a sender with no message after it still shows");
});

test("a model or effort change says only what changed, in the friendly name", () => {
  const name = (id) => ({ "claude-opus-5-5": "Opus 5.5", "claude-sonnet-5-5": "Sonnet 5.5" })[id] || id;
  assert.deepEqual(model.switchSays({ model: "claude-opus-5-5", effort: "high" }, { model: "claude-sonnet-5-5", effort: "" }, name), { from: "Opus 5.5 High", to: "Sonnet 5.5" });
  assert.deepEqual(model.switchSays({ model: "claude-opus-5-5", effort: "high" }, { model: "claude-opus-5-5", effort: "max" }, name), { from: "High", to: "Max" });
  assert.deepEqual(model.switchSays({ model: "claude-opus-5-5", effort: "high" }, { model: "claude-sonnet-5-5", effort: "high" }, name), { from: "Opus 5.5", to: "Sonnet 5.5" });
  assert.deepEqual(model.switchSays({ model: "a", effort: "" }, { model: "a", effort: "low" }, name), { from: "Default", to: "Low" });
  assert.equal(model.switchSays({ model: "a", effort: "x" }, { model: "a", effort: "x" }, name), null);
});

test("an effort drop and the model change that caused it make one divider", () => {
  const e = { conv: model.svConvSeed(), tag: "t" };
  const name = (id) => id.toUpperCase();
  model.svConvSwitch(e, { model: "opus", effort: "high" }, { model: "opus", effort: "" }, name);
  model.svConvSwitch(e, { model: "opus", effort: "" }, { model: "sonnet", effort: "" }, name);
  assert.equal(e.conv.blocks.length, 1);
  assert.deepEqual([e.conv.blocks[0].from, e.conv.blocks[0].to], ["OPUS High", "SONNET"]);
  model.svConvSwitch(e, { model: "sonnet", effort: "" }, { model: "opus", effort: "high" }, name);
  assert.equal(e.conv.blocks.length, 0, "going back to where it started leaves no divider");
});

test("the full date of a clock is in the app's language", () => {
  const at = new Date(2026, 10, 19, 12, 6).getTime();
  assert.match(rows.fullTimeOf(at, "pt-BR"), /19 de novembro de 2026$/);
  assert.match(rows.fullTimeOf(at, "en"), /19 November 2026$/);
  assert.equal(rows.fullTimeOf(0), "");
});

test("a finished tool keeps its arguments, its answer as coloured JSON and a web search as links", () => {
  assert.deepEqual(inspector.toolArgs("mcp", { query: "SELECT 1" }, "sales-db", "read_query").map((row) => row.key), ["server", "tool", "arguments"]);
  assert.deepEqual(inspector.toolArgs("run", { command: "ls" }), [], "a shell call shows its command its own way");
  assert.deepEqual(inspector.toolArgs("read", { file_path: "a.ts", limit: 20 }).map((row) => `${row.key}=${row.text}`), ["file_path=a.ts", "limit=20"]);
  assert.equal(inspector.prettyJson('{"a":[1,true]}'), '{\n  "a": [\n    1,\n    true\n  ]\n}');
  assert.equal(inspector.prettyJson("not json"), "");
  assert.deepEqual(inspector.jsonSpans('{"k": "v", "n": -2.5, "z": null}').filter((one) => one.cls).map((one) => one.cls), ["json-punct", "json-key", "json-punct", "json-str", "json-punct", "json-key", "json-punct", "json-num", "json-punct", "json-key", "json-punct", "json-lit", "json-punct"]);
  const web = inspector.webResults('Web search results for query: "hive chat"\n\nLinks: [{"title":"One","url":"https://a.dev/1"},{"title":"bad","url":"javascript:alert(1)"},{"url":"https://b.dev"}]\n\nWhat the search found.');
  assert.equal(web.query, "hive chat");
  assert.deepEqual(web.links.map((one) => [one.title, one.url]), [["One", "https://a.dev/1"], ["b.dev", "https://b.dev/"]]);
  assert.equal(web.rest, "What the search found.");
  assert.equal(inspector.webResults("plain text"), null);
});

test("a browser call wears the favicon of the page it is on, and only for a public site", () => {
  assert.equal(inspector.isBrowserTool("mcp__hive__browser_click"), true);
  assert.equal(inspector.isBrowserTool("Read"), false);
  assert.equal(inspector.faviconOf("https://github.com/x"), "https://github.com/favicon.ico");
  for (const page of ["http://localhost:3000", "https://10.0.0.1", "https://box.local", "file:///etc/hosts"]) assert.equal(inspector.faviconOf(page), "", page);
  const e = { conv: model.svConvSeed(), tag: "t", tools: new Map(), at: Date.now() };
  const opened = model.svConvTool(e, { id: "1", name: "mcp__hive__browser_navigate", input: { url: "https://docs.example.org/page/1" } }, false);
  const clicked = model.svConvTool(e, { id: "2", name: "mcp__hive__browser_click", input: { ref: "e1" } }, false);
  const read = model.svConvTool(e, { id: "3", name: "Read", input: { file_path: "a.ts" } }, false);
  assert.equal(opened.favicon, "https://docs.example.org/favicon.ico");
  assert.equal(clicked.favicon, "https://docs.example.org/favicon.ico", "a click stays on the page the last navigation opened");
  assert.equal(read.favicon, "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const rows = await app("timeline-rows");
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const model = await app("conversation-model");

const say = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) : text);

let n = 0;
const key = () => `k${++n}`;
const ask = (text, at, extra = {}) => ({ key: key(), kind: "bubble", body: text, text, at: String(at), dataset: {}, ...extra });
const said = (text, at, extra = {}) => ({ key: key(), kind: "said", parts: [`<p>${text}</p>`], at: at ? String(at) : "", streaming: false, ...extra });
const tool = (face, name, arg, extra = {}) => ({ key: key(), kind: "tool", face, tool: name, name, arg, running: false, stat: "ok", keep: false, ...extra });
const think = (body) => ({ key: key(), kind: "think", body });
const meta = (cls, text) => ({ key: key(), kind: "meta", cls, text });
const kinds = (list) => list.map((one) => (one.kind === "block" ? `${one.block.kind}${one.hidden ? ":hidden" : ""}` : one.kind));
const look = (extra = {}) => ({ say, busy: false, ...extra });

test("the work of a settled turn folds behind one line that says how long it took, and the answer stays", () => {
  const turn = [ask("arruma o build", 1000), tool("read", "Read", "a.js"), said("achei", 5000), tool("run", "Bash", "npm test"), tool("run", "Bash", "npm run lint"), said("pronto", 39000)];
  const out = rows.deriveTimelineRows(turn, look());
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "said:hidden", "said"]);
  const fold = out[1];
  assert.equal(fold.label, "Worked for 38s");
  assert.equal(fold.open, false);
  assert.equal(out[2].fold, fold.fold, "the folded words keep the fold they belong to, so the search can open it");
  const open = rows.deriveTimelineRows(turn, look({ unfolded: new Set([fold.fold]) }));
  assert.deepEqual(kinds(open), ["bubble", "turn-fold", "tool", "said", "work-toggle", "said"]);
  assert.equal(open.find((one) => one.kind === "work-toggle").summary, "Ran 2 commands");
  assert.equal(open[2].work, true, "a lone call is a row of its own, not a group");
});

test("a turn the person stopped folds under the line that says when, and the stop line does not repeat", () => {
  const out = rows.deriveTimelineRows([ask("faz", 1000), tool("run", "Bash", "sleep 9"), said("comecei", 4000), meta("sv-meta sv-stopped", "You stopped after 12s")], look());
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "said"]);
  assert.equal(out[1].label, "You stopped after 12s");
});

test("a message pushed into the turn splits it: the work after it folds on its own as Continued for", () => {
  const steer = ask("usa o pnpm", 20000, { dataset: { cid: "c9" } });
  const turn = [ask("instala", 1000), tool("run", "Bash", "npm i"), said("rodando", 10000), steer, tool("run", "Bash", "pnpm i"), tool("run", "Bash", "pnpm test"), said("feito", 50000)];
  const out = rows.deriveTimelineRows(turn, look({ steers: new Set(["c9"]) }));
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "said:hidden", "bubble", "turn-fold", "said"]);
  assert.equal(out[1].label, "Worked for 49s");
  assert.equal(out[3].steer, true);
  assert.equal(out[4].label, "Continued for 30s");
  assert.notEqual(out[1].fold, out[4].fold, "each segment opens on its own");
  const plain = rows.deriveTimelineRows(turn, look());
  assert.equal(plain.filter((one) => one.kind === "turn-fold").length, 2, "without the steer mark it is just another turn");
});

test("while the run works, the turn says how long under the ask and its tail is one live line", () => {
  const ask1 = ask("roda os testes", 1000);
  const turn = [ask1, said("vou rodar", 2000), tool("read", "Read", "package.json"), tool("run", "Bash", "npm test", { cmd: "cd app && npm test -- --watch=false", running: true, stat: "" })];
  const out = rows.deriveTimelineRows(turn, look({ busy: true, since: 900, thinking: "**Rodando a suíte**\n\nvou ver se passa." }));
  assert.deepEqual(kinds(out), ["bubble", "working", "said", "work-live"]);
  assert.equal(out[1].t0, 1000, "the clock starts at the ask, the later of the two");
  const live = out[3];
  assert.equal(live.label, "Running npm test");
  assert.equal(live.icon, "terminal");
  assert.equal(live.active, true);
  assert.equal(live.thought, "Rodando a suíte", "the thought line is the bold heading while it streams");
  const open = rows.deriveTimelineRows(turn, look({ busy: true, expanded: new Set([live.group]) }));
  assert.deepEqual(kinds(open), ["bubble", "working", "said", "work-live", "work-group"]);
  assert.equal(open[4].items.length, 2);
});

test("before any tool, the live line is the thought, and a failed last call turns it back into Thinking with its group", () => {
  const thinking = rows.deriveTimelineRows([ask("oi", 1000)], look({ busy: true, thinking: "Lendo o modelo da conversa. Depois o render." }));
  assert.deepEqual(kinds(thinking), ["bubble", "working", "thinking"]);
  assert.equal(thinking[2].thought, "Lendo o modelo da conversa.");
  assert.equal(thinking[2].label, "Thinking…");
  const failed = rows.deriveTimelineRows([ask("oi", 1000), tool("run", "Bash", "false", { stat: "bad" })], look({ busy: true }));
  assert.deepEqual(kinds(failed), ["bubble", "working", "thinking"]);
  assert.ok(failed[2].group, "the failed group can still be opened");
  const writing = rows.deriveTimelineRows([ask("oi", 1000), said("escrevendo", 0, { streaming: true })], look({ busy: true }));
  assert.deepEqual(kinds(writing), ["bubble", "working", "said"], "the answer streaming is its own sign of life");
});

test("a group says what it did: the two heaviest kinds, then the rest as other actions", () => {
  const reads = [tool("read", "Read", "a"), tool("read", "Read", "b"), tool("read", "Read", "c")];
  const runs = [tool("run", "Bash", "ls"), tool("run", "Bash", "pwd")];
  assert.equal(rows.summarizeWork([...reads, ...runs], say), "Read 3 files and ran 2 commands");
  assert.equal(rows.summarizeWork([...reads, ...runs, tool("web", "WebSearch", "x"), tool("plan", "TodoWrite", "")], say), "Read 3 files, ran 2 commands, and performed 2 other actions");
  assert.equal(rows.summarizeWork([think("a"), think("b")], say), "Thought (×2)");
  assert.equal(rows.summarizeWork([tool("write", "Edit", "a.js"), tool("write", "Edit", "a.js"), tool("write", "Write", "b.js")], say), "Changed 2 files");
  assert.equal(rows.summarizeWork([tool("mcp", "slack_send", "", { server: "Slack" }), tool("read", "Grep", "x")], say), "Used Slack and searched code 1 time");
  assert.equal(rows.summaryKind(reads), "read");
  assert.equal(rows.iconOf(rows.summaryKind([...reads, ...runs])), "hammer");
});

test("a long message from the person folds after 600 visible characters or 8 lines, and says how to open it", () => {
  assert.equal(rows.shouldCollapseUserMessage("curta"), false);
  assert.equal(rows.shouldCollapseUserMessage("x".repeat(601)), true);
  assert.equal(rows.shouldCollapseUserMessage(`[${"x".repeat(590)}](https://example.com/${"y".repeat(80)})`), false, "a link counts by its label");
  assert.equal(rows.shouldCollapseUserMessage("1\n2\n3\n4\n5\n6\n7\n8\n9"), true);
  const long = ask("x".repeat(700), 1000);
  const [shut] = rows.deriveTimelineRows([long], look());
  assert.deepEqual([shut.long, shut.open, shut.toggle], [true, false, "Show full message"]);
  const [open] = rows.deriveTimelineRows([long], look({ users: new Set([long.key]) }));
  assert.deepEqual([open.open, open.toggle], [true, "Show less"]);
});

test("the files a settled turn changed hang on its answer, its edits open the diff, and the turn at work gets none", () => {
  const edit = tool("write", "Edit", "a.js", { edit: { file: "/private/w/app/a.js", path: "a.js" } });
  const blocks = [ask("um", 1000), edit, said("feito", 3000), ask("dois", 9000), said("indo", 9500)];
  const asked = [];
  const turnFiles = (asks) => {
    asked.push(asks);
    return new Map([[0, { n: 3, html: "<b>3 files</b>", pathOf: (file) => (file.endsWith("/app/a.js") ? "app/a.js" : "") }], [1, { n: 4, html: "<b>other</b>", pathOf: () => "" }]]);
  };
  const out = rows.deriveTimelineRows(blocks, look({ busy: true, turnFiles, unfolded: new Set([`f:${blocks[0].key}`]) }));
  assert.deepEqual(asked, [[1000, 9000]]);
  const answer = out.find((one) => one.block?.parts?.[0] === "<p>feito</p>");
  assert.equal(answer.files, "<b>3 files</b>");
  assert.deepEqual(out.find((one) => one.key === edit.key).diff, { n: 3, file: "app/a.js", label: "Open diff" });
  assert.equal(out.some((one) => one.files === "<b>other</b>"), false);
});

test("the end of the timeline carries the chat's present, after everything else", () => {
  const out = rows.deriveTimelineRows([ask("oi", 1000), said("ok", 2000)], look({ status: [{ id: "snoozed", icon: "alarm", label: "Snoozed", action: "Wake now", act: "unsnooze" }] }));
  assert.deepEqual(out.at(-1), { kind: "status", key: "st:snoozed", id: "snoozed", icon: "alarm", label: "Snoozed", action: "Wake now", act: "unsnooze" });
});

test("without the timeline look, the drawers come out as before: a landed run of two calls or more, the live ones on the surface", () => {
  const landed = [tool("read", "Read", "a"), tool("read", "Read", "b")];
  assert.deepEqual(kinds(rows.legacyRows([...landed, tool("read", "Read", "c", { running: true })], true)), ["work", "tool"]);
  assert.deepEqual(kinds(rows.legacyRows([tool("read", "Read", "a", { running: true }), tool("read", "Read", "b", { running: true })], true)), ["tool", "tool"]);
  assert.deepEqual(kinds(rows.legacyRows(landed, false)), ["work"]);
  assert.deepEqual(kinds(rows.legacyRows([tool("read", "Read", "a"), said("x")], false)), ["tool", "said"], "a drawer of one is undone");
  const kept = [tool("read", "Read", "a"), tool("read", "Read", "b", { keep: true }), tool("read", "Read", "c", { running: true })];
  assert.deepEqual(kinds(rows.legacyRows(kept, true)), ["tool", "tool", "tool"], "a card with a picture never enters the drawer");
});

test("terminal colours and the exit code come out of a command's output", () => {
  assert.deepEqual(rows.commandResult("Exit code 2\nboom", true), { exit: 2, out: "boom" });
  assert.deepEqual(rows.commandResult("ok", false), { exit: 0, out: "ok" });
  const spans = rows.ansiSpans("\u001b[1;31mFAIL\u001b[0m a.test\n\u001b[38;5;208mlaranja\u001b[39m\r\n50%\r100%\u001b]0;title\u0007");
  assert.deepEqual(spans.map((one) => [one.text, one.cls, one.css]), [
    ["FAIL", "ansi-fg-1 ansi-bold", ""],
    [" a.test\n", "", ""],
    ["laranja", "", "color:rgb(255 135 0)"],
    ["\n100%", "", ""]
  ]);
});

test("the live line names the program it runs", () => {
  assert.equal(rows.programOf("cd app && NODE_ENV=test npm run build -- --x"), "npm run build");
  assert.equal(rows.programOf("git status --short"), "git status");
  assert.equal(rows.programOf("/usr/bin/grep -an foo"), "grep");
  assert.equal(rows.liveThoughtLine("Primeiro leio. Depois escrevo."), "Primeiro leio.");
  assert.equal(rows.thoughtTail("**Um**\n\ncorpo\n\n**Dois**\n\nmais"), "**Dois**\n\nmais");
});

const BASE = Date.now() - 120000;
let seq = 0;
const at = (s) => new Date(BASE + s * 1000).toISOString();
const ev = (s, body) => ({ seq: ++seq, ts: at(s), parent_tool_use_id: null, ...body });
const sayEv = (s, text, cid = null) => ev(s, { type: "user", subtype: "say", cid, images: [], message: { role: "user", content: [{ type: "text", text }] } });
const thinkStart = (s) => ev(s, { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } });
const thinkDelta = (s, thinking) => ev(s, { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking } } });
const thought = (s, thinking) => ev(s, { type: "assistant", message: { content: [{ type: "thinking", thinking }] } });
const toolUse = (s, id, name, input) => ev(s, { type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const toolResult = (s, id, content, isError = false) => ev(s, { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } });
const answer = (s, text) => ev(s, { type: "assistant", message: { content: [{ type: "text", text }] } });
const driver = (s, subtype, extra = {}) => ev(s, { type: "driver", subtype, ...extra });
const retry = (s, attempt) => ev(s, { type: "system", subtype: "api_retry", attempt, max_retries: 10, retry_delay_ms: 1500, error_status: 529, error: "overloaded" });

let seats = 0;
const seat = () => {
  const e = getStructured({ name: `tl-${++seats}`, where: "local", agent: "claude" });
  document.body.appendChild(e.host);
  return e;
};
const painted = (e) => {
  model.svConvFlush(e);
  return e.convRows.map((one) => (one.kind === "block" ? one.block.kind : one.kind));
};

model.svConvTimeline({ look: () => ({}) });

test("a live run, event by event: thinking streams into the live line, the tool takes it over, and the end folds it all", () => {
  const e = seat();
  svEvent(e, sayEv(0, "roda a suíte"));
  svEvent(e, driver(0, "turn_started"));
  svEvent(e, thinkStart(1));
  svEvent(e, thinkDelta(1, "Vou rodar a suíte do app. "));
  svEvent(e, thinkDelta(1, "Depois olho o resultado."));
  assert.deepEqual(painted(e), ["bubble", "working", "thinking"]);
  assert.equal(e.scroll.querySelector(".tl-thought .tl-label").textContent, "Vou rodar a suíte do app.");
  svEvent(e, thought(2, "Vou rodar a suíte do app. Depois olho o resultado."));
  svEvent(e, toolUse(3, "t1", "Bash", { command: "cd app && npm test" }));
  assert.deepEqual(painted(e), ["bubble", "working", "work-live"]);
  assert.match(e.scroll.querySelector(".tl-live").textContent, /Running npm test/);
  svEvent(e, toolResult(9, "t1", "Exit code 1\n\u001b[31m1 failing\u001b[0m", true));
  svEvent(e, answer(12, "Um teste falhou."));
  svEvent(e, ev(12, { type: "result", subtype: "success" }));
  assert.equal(e.turnOpen, false);
  assert.deepEqual(painted(e), ["bubble", "turn-fold", "said"]);
  assert.match(e.scroll.querySelector(".tl-fold").textContent, /^Worked for/);
  e.scroll.querySelector(".tl-fold button").click();
  assert.deepEqual(painted(e), ["bubble", "turn-fold", "work-toggle", "said"]);
  assert.equal(e.scroll.querySelector(".tl-work .tl-label").textContent, "Ran 1 command", "the thought rides along in the group without being counted");
  e.scroll.querySelector(".tl-work button").click();
  const card = e.scroll.querySelector(".tl-group .sv-tool[data-kind='run']");
  assert.ok(card, "the group opens on its calls");
  card.open = true;
  card.dispatchEvent(new Event("toggle"));
  assert.equal(card.querySelector(".tl-cmd-line").textContent, "cd app && npm test");
  assert.equal(card.querySelector(".tl-cmd-out .ansi-fg-1").textContent, "1 failing");
  assert.equal(card.querySelector(".tl-cmd-exit").textContent, "exit 1");
});

test("the provider retrying shows as a line that turns into recovered when the answer comes", () => {
  const e = seat();
  svEvent(e, sayEv(20, "oi"));
  svEvent(e, driver(20, "turn_started"));
  svEvent(e, retry(21, 1));
  svEvent(e, retry(23, 2));
  const line = () => e.scroll.querySelector(".tl-retry");
  model.svConvFlush(e);
  assert.equal(e.scroll.querySelectorAll(".tl-retry").length, 1, "one line, updated in place");
  assert.equal(line().textContent, "Retrying (2/10) in 1.5s· 529");
  assert.equal(line().dataset.state, "retrying");
  svEvent(e, answer(26, "oi!"));
  model.svConvFlush(e);
  assert.equal(line().dataset.state, "recovered");
  assert.match(line().textContent, /^Recovered after 2 retries/);
  svEvent(e, ev(27, { type: "result", subtype: "success" }));
  model.svConvFlush(e);
  assert.equal(line(), null, "once the turn settles, the recovered line folds away with the work");
});

test("a message pushed in mid-turn moves to where it entered and opens a Continued for segment", () => {
  const e = seat();
  svEvent(e, sayEv(30, "instala tudo"));
  svEvent(e, toolUse(31, "a1", "Bash", { command: "npm i" }));
  svEvent(e, sayEv(32, "usa pnpm", "c7"));
  svEvent(e, toolResult(40, "a1", "ok"));
  svEvent(e, answer(41, "instalei"));
  svEvent(e, driver(42, "dispatched", { cid: "c7" }));
  svEvent(e, driver(42, "said_now", { cid: "c7" }));
  svEvent(e, toolUse(43, "a2", "Bash", { command: "pnpm i" }));
  svEvent(e, toolResult(50, "a2", "ok"));
  svEvent(e, answer(52, "agora com pnpm"));
  svEvent(e, ev(52, { type: "result", subtype: "success" }));
  model.svConvFlush(e);
  const order = e.conv.blocks.map((one) => one.kind);
  assert.deepEqual(order, ["bubble", "tool", "said", "bubble", "tool", "said"], "the pushed message sits where it entered the turn");
  const folds = [...e.scroll.querySelectorAll(".tl-fold")].map((one) => one.textContent);
  assert.equal(folds.length, 2);
  assert.match(folds[1], /^Continued for 10s/);
  assert.ok(e.scroll.querySelector(".sv-user.tl-steer"));
});

test("a match folded away is still in the page, and the search opens its fold", () => {
  const e = seat();
  svEvent(e, sayEv(60, "procura"));
  svEvent(e, answer(61, "palavra escondida no meio"));
  svEvent(e, toolUse(62, "f1", "Read", { file_path: "/tmp/a.js" }));
  svEvent(e, toolResult(63, "f1", "x"));
  svEvent(e, answer(64, "fim"));
  svEvent(e, ev(64, { type: "result", subtype: "success" }));
  model.svConvFlush(e);
  const hidden = e.scroll.querySelector('.sv-msg[hidden="until-found"]');
  assert.ok(hidden, "the folded words stay in the page, hidden until found");
  assert.match(hidden.textContent, /palavra escondida/);
  hidden.dispatchEvent(new Event("beforematch", { bubbles: true }));
  assert.equal(e.scroll.querySelector('.sv-msg[hidden="until-found"]'), null);
  assert.equal(model.svConvElements(e).get(e.conv.blocks[1].key)?.textContent.includes("palavra escondida"), true, "the block still maps to its element");
});

test("what was just sent is anchored while it is answered, and the first tool lets go of it", () => {
  const e = seat();
  svEvent(e, sayEv(100, "anterior"));
  svEvent(e, answer(101, "ok"));
  e.atBottom = true;
  e.heardAt = Date.now() - 5000;
  const bubble = model.svConvLine(e, "sv-user", "nova pergunta");
  assert.deepEqual(e.anchor, { key: bubble.key });
  e.heardAt = Date.now();
  svEvent(e, toolUse(119, "z1", "Read", { file_path: "/tmp/z" }));
  model.svConvFlush(e);
  assert.equal(e.anchor, null);
  assert.equal(e.atBottom, true);
  const old = model.svConvLine(e, "sv-user", "depois");
  e.at = Date.now() - 60000;
  e.atBottom = false;
  e.anchor = null;
  model.svConvAnchor(e, old);
  assert.equal(e.anchor, null, "nothing is anchored while the person reads back");
});

test("only a real gesture up lets go of the end, and coming back within 40px follows again", () => {
  const e = seat();
  let top = 500;
  Object.defineProperty(e.scroll, "scrollHeight", { configurable: true, get: () => 1000 });
  Object.defineProperty(e.scroll, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(e.scroll, "scrollTop", { configurable: true, get: () => top, set: (v) => { top = Math.max(0, Math.min(600, v)); } });
  e.atBottom = true;
  top = 300;
  e.scroll.dispatchEvent(new Event("scroll"));
  assert.equal(e.atBottom, true, "the content moving under the view is not the person scrolling");
  e.scroll.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
  assert.equal(e.atBottom, false);
  top = 570;
  e.scroll.dispatchEvent(new Event("scroll"));
  assert.equal(e.atBottom, true);
});

test("a command whose output the replay only kept as a preview loads the whole of it when opened", async () => {
  const e = seat();
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return { json: async () => ({ ok: true, output: "\u001b[33mlinha inteira\u001b[0m", cut: false, whole: true }) };
  };
  try {
    svEvent(e, sayEv(200, "roda"));
    svEvent(e, toolUse(201, "toolu_big", "Bash", { command: "npm run build" }));
    svEvent(e, toolResult(202, "toolu_big", "<persisted-output>\nOutput too large (61.5KB). Full output saved to: /x/tool-results/a.txt\n\nPreview (first 2KB):\n..."));
    svEvent(e, driver(202, "turn_started"));
    model.svConvFlush(e);
    e.scroll.querySelector(".tl-live button").click();
    const card = e.scroll.querySelector(".tl-group .sv-tool");
    card.open = true;
    card.dispatchEvent(new Event("toggle"));
    assert.equal(card.querySelector(".tl-cmd-note")?.textContent, "Loading output…");
    await new Promise((done) => setTimeout(done, 50));
    model.svConvFlush(e);
    assert.match(asked[0], /\/api\/seat\/tool-output\?name=tl-\d+&where=local&id=toolu_big/);
    assert.equal(card.querySelector(".tl-cmd-out .ansi-fg-3")?.textContent, "linha inteira");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a turn waiting on the person shows no thinking line under the card it waits on", () => {
  const turn = [ask("planeja", 1000), tool("run", "Bash", "ls", { at: "2000" })];
  const busy = rows.deriveTimelineRows(turn, look({ busy: true, since: 1000 }));
  assert.ok(busy.some((one) => one.kind === "work-live" || one.kind === "thinking"));
  const asking = rows.deriveTimelineRows([ask("planeja", 1000)], look({ busy: true, since: 1000, waiting: true }));
  assert.ok(!asking.some((one) => one.kind === "thinking"), "nothing claims the agent is thinking while it waits for an answer");
  assert.ok(asking.some((one) => one.kind === "working"));
});

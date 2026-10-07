import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { phrase, renderMarkdownBlocks } = await app("core");
const { SUB_LOG_MAX } = await app("subagents-dock");
const { workSummary } = await app("structured-seats");
const hive = await app("conversation-model");

const seat = () => ({
  name: "rafa", tag: "t", where: "local", at: Date.now(), atBottom: false,
  scroll: { scrollTop: 0, scrollHeight: 0 }, host: document.createElement("div"),
  tools: new Map(), subs: new Map(), conv: hive.svConvSeed(), convView: null, subsView: null
});

const kinds = (e) => e.conv.blocks.map((one) => one.kind);
const tool = (e, name, arg, live = true) => hive.svConvTool(e, { id: `x${e.conv.seq}`, name, input: name === "Bash" ? { command: arg } : { file_path: arg } }, live);

test("every block the chat holds is keyed apart, so the view can tell two of a kind from each other", () => {
  const e = seat();
  hive.svConvLine(e, "sv-meta", "uma");
  hive.svConvLine(e, "sv-meta", "uma");
  const keys = e.conv.blocks.map((one) => one.key);
  assert.equal(new Set(keys).size, 2);
});

test("a line that is not the person's is a note, and one that is becomes a bubble", () => {
  const e = seat();
  hive.svConvLine(e, "sv-meta warn", "deu ruim");
  hive.svConvLine(e, "sv-user", "oi");
  assert.deepEqual(kinds(e), ["meta", "bubble"]);
  assert.equal(e.conv.blocks[0].cls, "sv-meta warn");
  assert.equal(e.conv.blocks[1].body, "oi");
  assert.equal(e.conv.blocks[1].peer, false);
});

test("a bubble that came from another chat says so on the block, not on a class added later", () => {
  const e = seat();
  hive.svConvLine(e, "sv-user peer", "de outro");
  assert.equal(e.conv.blocks[0].peer, true);
});

test("the quotes the box pinned come back as their own cards, and the rest as the said body", () => {
  const e = seat();
  hive.svConvLine(e, "sv-user", "> citado\n\nresto");
  const body = e.conv.blocks[0].body;
  assert.match(body, /<blockquote class="sv-said-quote">/);
  assert.match(body, /<span class="qt">citado<\/span>/);
  assert.match(body, /<div class="sv-said-body">resto<\/div>/);
});

test("a mention is woven into the body the block already holds, never into a second one", () => {
  st.data = { sessions: [{ name: "rafa", state: "idle", where: "local" }] };
  const e = seat();
  const bubble = hive.svConvLine(e, "sv-user", "fala #rafa");
  hive.svConvMentions(bubble);
  assert.equal(e.conv.blocks.length, 1);
  assert.match(bubble.body, /^fala <span class="mention" data-seat="rafa"/);
  assert.match(bubble.body, /#rafa/);
});

test("an image the person sent hangs on the bubble, keyed so two of the same file still show twice", () => {
  const e = seat();
  const bubble = hive.svConvLine(e, "sv-user", "olha");
  hive.svConvThumb(e, bubble, "/tmp/a.png");
  hive.svConvThumb(e, bubble, "/tmp/a.png");
  assert.equal(bubble.thumbs.length, 2);
  assert.equal(new Set(bubble.thumbs.map((one) => one.key)).size, 2);
  assert.match(bubble.thumbs[0].src, /path=%2Ftmp%2Fa\.png&where=local&name=rafa/);
});

test("each picture wears the number its mark carries in the words, and the file's name", () => {
  const e = seat();
  const bubble = hive.svConvLine(e, "sv-user", "compara [Image #1] com [Image #2]");
  hive.svConvThumb(e, bubble, "/tmp/antes.png");
  hive.svConvThumb(e, bubble, "/tmp/depois.png");
  assert.deepEqual(bubble.thumbs.map((one) => one.mark), ["#1", "#2"]);
  assert.deepEqual(bubble.thumbs.map((one) => one.name), ["antes.png", "depois.png"]);
  assert.match(bubble.body, /<span class="said-img">\[Image #1\]<\/span>/);
  assert.match(bubble.body, /<span class="said-img">\[Image #2\]<\/span>/);
});

test("what the model said is kept block by block, the way the render hands it over", () => {
  const e = seat();
  hive.svConvSaid(e, "# t\n\numa linha");
  assert.deepEqual(e.conv.blocks[0].parts, renderMarkdownBlocks("# t\n\numa linha"));
  assert.equal(e.conv.blocks[0].streaming, false);
});

test("the stamp belongs to the tail of a run, and leaves the block that stops ending it", () => {
  const e = seat();
  const one = hive.svConvSaid(e, "primeira");
  assert.equal(one.stamped, true);
  const two = hive.svConvSaid(e, "segunda");
  assert.equal(one.stamped, false);
  assert.equal(two.stamped, true);
  assert.equal(two.said, one.at, "o relógio do bloco diz quando a resposta começou");
});

test("work between two things the model said does not break the run", () => {
  const e = seat();
  const one = hive.svConvSaid(e, "primeira");
  tool(e, "Read", "a.txt");
  const two = hive.svConvSaid(e, "segunda");
  assert.equal(one.stamped, false);
  assert.equal(two.said, one.at);
});

test("something the person said starts a run of its own", () => {
  const e = seat();
  const said = hive.svConvSaid(e, "resposta");
  e.at = e.at + 5000;
  const asked = hive.svConvLine(e, "sv-user", "e agora?");
  assert.equal(said.stamped, true, "a voz mudou, então a resposta continua carimbada");
  assert.equal(asked.stamped, true);
  assert.equal(asked.said, asked.at);
  assert.notEqual(asked.said, said.at);
});

test("a card that landed drops into the drawer the moment there is a newer one to show", () => {
  const e = seat();
  const first = tool(e, "Read", "a.txt");
  first.running = false;
  tool(e, "Read", "b.txt");
  assert.deepEqual(kinds(e), ["work", "tool"]);
  assert.deepEqual(e.conv.blocks[0].items.map((one) => one.arg), ["a.txt"]);
});

test("a call that is still running keeps the ones behind it out on the surface with it", () => {
  const e = seat();
  tool(e, "Read", "a.txt");
  tool(e, "Read", "b.txt");
  assert.deepEqual(kinds(e), ["tool", "tool"]);
});

test("a drawer that would hold a single card is undone, and the card goes back where it was", () => {
  const e = seat();
  const one = tool(e, "Read", "a.txt");
  one.running = false;
  const kept = tool(e, "Read", "b.txt");
  assert.deepEqual(kinds(e), ["work", "tool"]);
  kept.running = false;
  hive.svConvShots(e, kept, ["/tmp/shot.png"]);
  tool(e, "Read", "c.txt");
  assert.deepEqual(kinds(e), ["tool", "tool", "tool"]);
  assert.deepEqual(e.conv.blocks.map((b) => b.arg), ["a.txt", "b.txt", "c.txt"]);
});

test("two calls or more are worth a drawer, and it says what the run did", () => {
  const e = seat();
  for (const name of ["a.txt", "b.txt", "c.txt"]) tool(e, "Read", name).running = false;
  hive.svConvFold(e);
  assert.deepEqual(kinds(e), ["work"]);
  assert.equal(e.conv.blocks[0].items.length, 3);
  assert.equal(e.conv.blocks[0].name, workSummary(e.conv.blocks[0].items.map(hive.svConvAsCard)));
  assert.match(e.conv.blocks[0].name, /3/, "o gaveteiro tem que dizer quantas chamadas guardou");
});

test("a failed call turns the drawer, and the drawer counts it", () => {
  const e = seat();
  const one = tool(e, "Read", "a.txt");
  one.running = false;
  one.stat = "bad";
  one.ms = "40";
  const two = tool(e, "Read", "b.txt");
  two.running = false;
  two.ms = "60";
  tool(e, "Read", "c.txt");
  assert.equal(e.conv.blocks[0].bad, true);
  assert.equal(e.conv.blocks[0].badly, phrase("{n} failed", { n: 1 }));
  assert.equal(e.conv.blocks[0].ms, "100ms");
});

test("a card that carries a picture stays on the surface and never enters the drawer", () => {
  const e = seat();
  const one = tool(e, "Read", "a.txt");
  one.running = false;
  hive.svConvShots(e, one, ["/tmp/shot.png"]);
  tool(e, "Read", "b.txt");
  assert.deepEqual(kinds(e), ["tool", "tool"]);
  assert.equal(one.keep, true);
  assert.equal(one.shots[0].alt, "shot.png");
});

test("a call that lands says how it went, how long it took and what it answered", () => {
  const e = seat();
  const card = tool(e, "Bash", "ls");
  card.t0 = String(Date.now() - 1500);
  hive.svConvToolLanded(e, { tool_use_id: "x0", content: "tudo certo" }, true);
  const landed = e.conv.blocks[0];
  assert.equal(landed.running, false);
  assert.equal(landed.stat, "ok");
  assert.equal(landed.body, "tudo certo");
  assert.match(landed.took, /^1\.[45]s$/);
});

test("a call that failed is marked bad, not merely finished", () => {
  const e = seat();
  tool(e, "Bash", "ls");
  hive.svConvToolLanded(e, { tool_use_id: "x0", is_error: true, content: "estourou" }, true);
  assert.equal(e.conv.blocks[0].stat, "bad");
});

test("a replayed call is not given a start time it never had", () => {
  const e = seat();
  const card = tool(e, "Bash", "ls", false);
  assert.equal(card.t0, "");
  hive.svConvToolLanded(e, { tool_use_id: "x0", content: "ok" }, false);
  assert.equal(e.conv.blocks[0].took, "");
});

test("a diff comes out of the answer line by line, each one saying what it is", () => {
  const lines = hive.svConvDiff("--- a\n+++ b\n@@ -1 +1 @@\n-antes\n+depois");
  assert.deepEqual(lines.map((one) => one.cls), ["ctx", "ctx", "ctx", "del", "add"]);
  assert.equal(hive.svConvDiff("nada aqui"), null);
});

test("only the artifact tool gets a link to open, and only when the answer carries one", () => {
  assert.deepEqual(hive.svConvToolLink({ tool: "Artifact" }, "Published at https://claude.ai/code/artifact/abc"), { url: "https://claude.ai/code/artifact/abc", label: phrase("open ↗") });
  assert.equal(hive.svConvToolLink({ tool: "Bash" }, "https://claude.ai/code/artifact/abc"), null);
  assert.equal(hive.svConvToolLink({ tool: "Artifact" }, "sem link"), null);
});

test("the running mark comes off a block without asking it for a classList", () => {
  const e = seat();
  const card = tool(e, "Read", "a.txt");
  hive.svConvRunOff(e, card);
  assert.equal(card.running, false);
});

test("a message taken back leaves the chat by its cid, and takes nothing else with it", () => {
  const e = seat();
  const one = hive.svConvLine(e, "sv-user", "primeira");
  one.dataset.cid = "c1";
  const two = hive.svConvLine(e, "sv-user", "segunda");
  two.dataset.cid = "c2";
  hive.svConvUnsay(e, "c1");
  assert.deepEqual(e.conv.blocks.map((b) => b.dataset.cid), ["c2"]);
});

test("the stream grows the open block and never rebuilds the ones already written", () => {
  const e = seat();
  const say = "# título\n\numa **linha**\n\n- um\n- dois";
  for (const one of say) {
    hive.svConvStream(e, one);
    hive.svConvDraftPaint(e);
  }
  assert.equal(e.draft.block.streaming, true);
  assert.deepEqual(e.draft.block.parts, renderMarkdownBlocks(say));
  assert.equal(e.draft.held.sealed.length, 2, "o título e o parágrafo ficaram prontos");
});

test("what arrives between two frames goes in together, in one read", () => {
  const e = seat();
  hive.svConvStream(e, "uma ");
  hive.svConvStream(e, "linha");
  assert.equal(e.draft.pending, "uma linha");
  hive.svConvDraftPaint(e);
  assert.equal(e.draft.pending, "");
  assert.deepEqual(e.draft.block.parts, renderMarkdownBlocks("uma linha"));
});

test("the draft leaves the chat when the finished answer takes its place", () => {
  const e = seat();
  hive.svConvStream(e, "oi");
  hive.svConvDraftPaint(e);
  assert.deepEqual(kinds(e), ["said"]);
  hive.svConvDraftDrop(e);
  assert.deepEqual(kinds(e), []);
});

test("a thought carries how long it took only when it took long enough to say", () => {
  const e = seat();
  const slow = hive.svConvThink(e, "pensando alto", "· 1.2s");
  const quick = hive.svConvThink(e, "rápido", "");
  assert.equal(slow.dur, "· 1.2s");
  assert.equal(quick.dur, "");
  assert.equal(slow.body, "pensando alto");
  assert.equal(slow.thinking, phrase("thinking"));
});

test("a note the harness left folds away under its own label", () => {
  const e = seat();
  hive.svConvNote(e, "system note", "corpo");
  assert.equal(e.conv.blocks[0].label, "system note");
  assert.equal(e.conv.blocks[0].body, "corpo");
});

test("a message from another chat names who wrote it and why it came", () => {
  const e = seat();
  hive.svConvPeer(e, "ana", true);
  assert.equal(e.conv.blocks[0].name, "ana");
  assert.equal(e.conv.blocks[0].says, phrase("answering what this chat asked"));
  assert.equal(hive.svConvPeer(seat(), "ana", false).says, phrase("another chat wrote to this one"));
});

test("an element the app still builds itself is carried whole, not described", () => {
  const e = seat();
  const card = document.createElement("div");
  card.className = "sv-art";
  hive.svConvAppend(e, card);
  assert.deepEqual(kinds(e), ["node"]);
  assert.equal(e.conv.blocks[0].el, card);
});

test("the cards of a run are found on the surface and inside the drawer alike", () => {
  const e = seat();
  for (const name of ["a", "b", "c"]) tool(e, "Read", name).running = false;
  assert.equal(hive.svConvCards(e).length, 3);
});

test("a launched agent is pinned with what it was asked, and its log grows by steps", () => {
  const e = seat();
  const item = hive.svConvSubPin(e, { id: "s1", input: { subagent_type: "Explore", description: "olha  o  repo", prompt: "faça" } });
  assert.equal(item.name, "Explore");
  assert.equal(item.arg, "olha o repo");
  assert.equal(item.body, "faça");
  hive.svConvSubStep(e, "s1", "read", "i-file", "leu a.txt", "t1");
  const step = hive.svConvSubStep(e, "s1", "run", "i-term", "rodou ls", "t2");
  assert.equal(item.steps.length, 2);
  assert.equal(step.now, true);
  assert.equal(item.steps[0].now, false);
});

test("the log keeps only the last steps, so a long agent does not grow without end", () => {
  const e = seat();
  hive.svConvSubPin(e, { id: "s1", input: {} });
  for (let n = 1; n <= SUB_LOG_MAX + 2; n++) hive.svConvSubStep(e, "s1", "read", "i-file", `passo ${n}`, `t${n}`);
  const item = e.subs.get("s1");
  assert.equal(item.steps.length, SUB_LOG_MAX);
  assert.equal(item.steps[0].text, "passo 3");
  assert.equal(item.steps.at(-1).text, `passo ${SUB_LOG_MAX + 2}`);
});

test("a step that landed says how it went, and only the step it belongs to", () => {
  const e = seat();
  hive.svConvSubPin(e, { id: "s1", input: {} });
  hive.svConvSubStep(e, "s1", "read", "i-file", "leu", "t1");
  hive.svConvSubStep(e, "s1", "run", "i-term", "rodou", "t2");
  hive.svConvSubLanded(e, "s1", "t2", true);
  const item = e.subs.get("s1");
  assert.deepEqual(item.steps.map((one) => one.landed), [false, true]);
  assert.equal(item.steps[1].bad, true);
});

test("an agent that landed leaves the dock and the model together", () => {
  const e = seat();
  hive.svConvSubPin(e, { id: "s1", input: {} });
  assert.equal(e.conv.subs.length, 1);
  hive.svConvSubUnpin(e, "s1");
  assert.equal(e.conv.subs.length, 0);
  assert.equal(e.subs.size, 0);
});

test("a run older than the transcript it was read from is not pinned again", () => {
  const e = seat();
  e.at = Date.now() - 7 * 60 * 60 * 1000;
  assert.equal(hive.svConvSubPin(e, { id: "s1", input: {} }), null);
  assert.equal(e.conv.subs.length, 0);
});

test("the clock on a pinned agent only speaks once it has been going a while", () => {
  const e = seat();
  hive.svConvSubPin(e, { id: "s1", input: {} });
  const item = e.subs.get("s1");
  item.dataset.t0 = String(Date.now() - 4000);
  hive.svConvSubs(e);
  assert.equal(item.ms, "4.0s");
  item.dataset.t0 = String(Date.now());
  hive.svConvSubs(e);
  assert.equal(item.ms, "");
});

test("the dock the seat shows counts the agents it is holding", () => {
  const e = seat();
  e.host.innerHTML = `<div class="sv-subs"><span class="scount"></span></div>`;
  hive.svConvSubPin(e, { id: "s1", input: {} });
  hive.svConvSubPin(e, { id: "s2", input: {} });
  const dock = e.host.querySelector(".sv-subs");
  assert.equal(dock.classList.contains("on"), true);
  assert.equal(dock.querySelector(".scount").textContent, "2");
  hive.svConvSubUnpin(e, "s1");
  hive.svConvSubUnpin(e, "s2");
  assert.equal(dock.classList.contains("on"), false);
  assert.equal(dock.querySelector(".scount").textContent, "0");
});

test("a picture the model named in its words hangs under what it said, once per file", () => {
  const e = seat();
  hive.svConvSaid(e, "o print: `/tmp/a.png` e file:///tmp/a.png, e o outro em /tmp/b.png");
  const said = e.conv.blocks[0];
  assert.deepEqual(said.shots.map((one) => one.path), ["/tmp/a.png", "/tmp/b.png"]);
  assert.equal(said.shots[0].src, "/api/image?path=%2Ftmp%2Fa.png&where=local&name=rafa");
  assert.equal(said.shots[1].alt, "b.png");
});

test("words without a picture hang nothing", () => {
  const e = seat();
  hive.svConvSaid(e, "só texto, e https://x.dev/a.png é da web");
  assert.deepEqual(e.conv.blocks[0].shots, []);
});

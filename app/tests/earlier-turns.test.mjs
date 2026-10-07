import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const modules = readdirSync(join(HERE, "src/app")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(HERE, "src/app", f), "utf8")).join("\n");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const link = readFileSync(join(HERE, "lib/seat-link.mjs"), "utf8");
const desk = readFileSync(join(HERE, "lib/seat-desk.mjs"), "utf8");
const { SV_TURNS, svEarlierWords, svEarlierSeq, svSpliceEarlier } = await app("chat-stretches");

const between = (from, to) => { const a = modules.indexOf(from); const b = modules.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from} … ${to} not found in src/app`); return modules.slice(a, b); };

test("a structured seat asks the driver for its last five turns, not the whole chat", () => {
  assert.match(modules, /\/events\?name=\$\{encodeURIComponent\(e\.name\)\}&where=\$\{e\.where\}&from=\$\{e\.lastSeq\}&window=\$\{e\.window \|\| "turns"\}&turns=\$\{SV_TURNS\}/);
  assert.equal(SV_TURNS, 5);
});

test("the bridge carries the window and the turns to the door, and asks for everything again after a drop", () => {
  assert.match(server, /const window = asked === "tail" \|\| asked === "turns" \? asked : "all";/);
  assert.match(server, /seatThroughServer\(ws, \{ where, name, from, window, turns, refuse \}\);/);
  assert.match(link, /events\?from=\$\{seen\}&window=\$\{seen \? "all" : window\}/);
  assert.match(desk, /before: Number\(query\.get\("before"\)\) \|\| 0/);
});

test("the earliest seq on screen is the floor of the next page", () => {
  assert.equal(svEarlierSeq([{ seq: 40 }, { seq: 12 }, { seq: "x" }, { seq: 0 }]), 12);
  assert.equal(svEarlierSeq([]), 0);
});

test("older blocks land under the earlier bar, never above it", () => {
  const bar = { key: "t:earlier", kind: "node" };
  const blocks = [bar, { key: "t:1" }, { key: "t:2" }];
  svSpliceEarlier(blocks, [{ key: "t:-5" }, { key: "t:-4" }]);
  assert.deepEqual(blocks.map((b) => b.key), ["t:earlier", "t:-5", "t:-4", "t:1", "t:2"]);
  const bare = [{ key: "t:1" }];
  svSpliceEarlier(bare, [{ key: "t:-1" }]);
  assert.deepEqual(bare.map((b) => b.key), ["t:-1", "t:1"]);
});

test("the bar says how much of the chat is on screen", () => {
  assert.equal(svEarlierWords(10, 140), "the last 10 of 140 turns");
});

test("reaching the top of the scroll asks for the page before, once at a time", () => {
  assert.match(modules, /if \(y < SV_EARLIER_NEAR && e\.earlier && !e\.earlier\.loading\) svLoadEarlier\(e\);/);
  const load = between("async function svLoadEarlier(e) {", "\nfunction svEarlierBlocks(");
  assert.match(load, /if \(!held \|\| held\.loading\) return;\s*if \(e\.conv\.shownFrom\) return svUnfoldTurns\(e\);\s*if \(!held\.more \|\| !e\.firstSeq\) return;/, "memory is unfolded before the server is asked, and a bar with nothing beyond never fetches");
  assert.match(load, /\/api\/seat\/earlier\?name=/);
  assert.match(load, /e\.scroll\.scrollTop = y \+ \(e\.scroll\.scrollHeight - tall\);/, "the page you were reading does not jump when older turns land above it");
  assert.match(load, /e\.conv\.blocks\.shift\(\);\s*e\.earlier = null;/, "the bar goes away with the last page");
});

test("older events are shaped through the same svEvent, on a scratch conversation, and the live one is put back whole", () => {
  const fn = between("function svEarlierBlocks(e, events, page) {", "\nfunction svEarlier(e, ev) {");
  assert.match(fn, /e\.conv = svConvSeed\(\);/);
  assert.match(fn, /e\.conv\.seq = -page \* 1000000;/, "keys of a page never collide with the live ones or with another page");
  assert.match(fn, /e\.lastSeq = 0;/, "older seqs must not be refused as already painted");
  assert.match(fn, /svEvent\(e, \{ \.\.\.ev, replayed: true \}\)/, "an old event never rings, runs or scrolls");
  for (const field of ["conv", "lastSeq", "atBottom", "draft", "run", "sent", "firstSeq", "convView"]) assert.match(fn, new RegExp(`e\\.${field} = kept\\.${field};`));
});

test("the app answers a page of earlier turns from whichever door holds the seat", () => {
  const route = server.slice(server.indexOf('on("GET", "/api/seat/earlier"'), server.indexOf("\n});", server.indexOf('on("GET", "/api/seat/earlier"')));
  assert.match(route, /if \(!isSeatName\(name\)\) return json/);
  assert.match(route, /const door = where === "local" \? desk : await serverFor\(\);/);
  assert.match(route, /events\?from=0&window=all&before=\$\{before\}&turns=\$\{turns\}/);
  assert.match(route, /earlier: !!held\.body\?\.earlier/);
});

const { SV_KEEP_BLOCKS, SV_KEEP_TURNS, svTrimTurns, svLoadEarlier, svEarlierBar } = await app("chat-stretches");
const hive = await app("conversation-model");

const seat = (topOfCut = 0) => {
  const painted = [];
  const scroll = document.createElement("div");
  const mirror = (blocks) => scroll.replaceChildren(...blocks.map(() => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ top: topOfCut });
    return el;
  }));
  return {
    name: "rafa", tag: "t", where: "local", at: Date.now(), atBottom: true, firstSeq: 0, earlier: null,
    scroll, host: document.createElement("div"),
    tools: new Map(), subs: new Map(), conv: hive.svConvSeed(), subsView: null,
    convView: { show(next) { painted.push(next); mirror(next.blocks); }, painted }
  };
};

const talk = (e, turns) => { for (let i = 0; i < turns; i++) { hive.svConvLine(e, "sv-user", `pergunta ${i}`); hive.svConvSaid(e, `resposta ${i}`); } };

const onScreen = (e) => e.convView.painted.at(-1).blocks.map((one) => one.key);

test("a chat that keeps talking folds the turns before the last eight under the bar, and the bar counts them", () => {
  const e = seat();
  talk(e, SV_KEEP_TURNS);
  assert.equal(svTrimTurns(e), false);
  assert.equal(e.earlier, null);
  talk(e, 2);
  assert.equal(svTrimTurns(e), true);
  const keys = onScreen(e);
  assert.equal(keys[0], "t:earlier");
  assert.equal(keys.length, 1 + SV_KEEP_TURNS * 2, "eight turns of two blocks each stay on screen");
  assert.equal(e.conv.blocks.length, 1 + 20, "the folded turns stay in memory, the screen just stops painting them");
  assert.equal(e.earlier.say.textContent, "the last 8 of 10 turns");
  assert.equal(e.earlier.more, false);
});

test("a turn heavy with tool blocks folds the turns before it well under eight, and is never cut in half", () => {
  const e = seat();
  hive.svConvLine(e, "sv-user", "pergunta pesada");
  for (let i = 0; i < SV_KEEP_BLOCKS + 10; i++) hive.svConvSaid(e, `passo ${i}`);
  talk(e, 2);
  assert.equal(svTrimTurns(e), true);
  assert.equal(e.earlier.say.textContent, "the last 2 of 3 turns");
  assert.equal(onScreen(e).length, 1 + 4, "the two light turns stay, the heavy one goes under the bar whole");
  assert.equal(hive.svConvCutKey(e.conv.blocks, SV_KEEP_TURNS, SV_KEEP_BLOCKS), e.conv.shownFrom);
});

test("the block budget never empties the screen: the last turn stays whole even when it alone is over budget", () => {
  const e = seat();
  talk(e, 1);
  hive.svConvLine(e, "sv-user", "pergunta enorme");
  for (let i = 0; i < SV_KEEP_BLOCKS * 2; i++) hive.svConvSaid(e, `passo ${i}`);
  assert.equal(svTrimTurns(e), true);
  assert.equal(e.earlier.say.textContent, "the last 1 of 2 turns");
  assert.equal(onScreen(e).length, 1 + 1 + SV_KEEP_BLOCKS * 2);
  assert.equal(hive.svConvCutKey(e.conv.blocks, SV_KEEP_TURNS, Infinity), null, "without a budget two turns are never folded");
});

test("nothing is folded while the person is reading up the chat", () => {
  const e = seat();
  talk(e, 12);
  e.atBottom = false;
  assert.equal(svTrimTurns(e), false);
  assert.equal(e.earlier, null);
  assert.equal(onScreen(e).length, 24);
});

test("a chat short enough to fit on screen is never folded, even at the bottom", () => {
  const e = seat(120);
  talk(e, 12);
  assert.equal(svTrimTurns(e), false);
  assert.equal(e.earlier, null);
  assert.equal(onScreen(e).length, 24, "the 9th turn from the end is still visible, so nothing above it is hidden");
  assert.equal(e.conv.shownFrom, null);
});

test("scrolling to the top brings five turns back from memory, and only asks the server when memory is empty", async () => {
  const e = seat();
  talk(e, 15);
  svTrimTurns(e);
  assert.equal(e.earlier.say.textContent, "the last 8 of 15 turns");
  const fetchWas = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error("the server must not be asked"); };
  try {
    await svLoadEarlier(e);
    assert.equal(e.earlier.say.textContent, "the last 13 of 15 turns");
    assert.equal(onScreen(e).length, 1 + 26);
    assert.equal(e.atBottom, false);
    await svLoadEarlier(e);
    assert.equal(e.earlier, null, "with everything back on screen the bar goes");
    assert.equal(onScreen(e).length, 30);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("turns brought back from memory fold again once the reader is back at the bottom", async () => {
  const e = seat();
  talk(e, 15);
  svTrimTurns(e);
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("the server must not be asked"); };
  try {
    await svLoadEarlier(e);
    assert.equal(e.earlier.say.textContent, "the last 13 of 15 turns");
    assert.equal(e.settling, true, "the scroll that keeps the page in place is not a return to the bottom");
    assert.equal(svTrimTurns(e), false, "away from the bottom nothing folds");
    e.atBottom = true;
    assert.equal(svTrimTurns(e), true);
    assert.equal(e.earlier.say.textContent, "the last 8 of 15 turns");
    assert.equal(onScreen(e).length, 1 + 16);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("the jump button and the scroll that reaches the bottom both fold the chat back", () => {
  const wiring = between('scroll.addEventListener("scroll", () => {', "const subsHead =");
  assert.match(wiring, /const wasBottom = e\.atBottom;/);
  assert.match(wiring, /if \(e\.settling\) e\.settling = false;\s*else if \(y < \(e\.lastScrollY \|\| 0\)\) e\.atBottom = bottom;/, "the scroll an unfold makes to hold the page still is swallowed once");
  assert.match(wiring, /if \(e\.atBottom && !wasBottom\) svTrimTurns\(e\);/, "reaching the bottom folds");
  assert.match(wiring, /jump\.addEventListener\("click", \(\) => \{\s*e\.atBottom = true;\s*scroll\.scrollTop = scroll\.scrollHeight;\s*paintJump\(\);\s*svTrimTurns\(e\);/, "the jump button folds");
  const restores = modules.match(/svConvShow\(e\);\s*e\.settling = true;\s*e\.scroll\.scrollTop = y \+ \(e\.scroll\.scrollHeight - tall\);/g) || [];
  assert.equal(restores.length, 2, "both the unfold from memory and the page from the server settle the scroll before the listener sees it");
});

test("with the server still holding older turns, the bar stays after memory is unfolded and counts both", async () => {
  const e = seat();
  svEarlierBar(e, { turns: 5, turnsTotal: 40 });
  assert.equal(e.earlier.say.textContent, "the last 5 of 40 turns");
  talk(e, 5);
  assert.equal(svTrimTurns(e), false);
  assert.equal(e.earlier.say.textContent, "the last 5 of 40 turns");
  talk(e, 5);
  assert.equal(svTrimTurns(e), true);
  assert.equal(e.earlier.say.textContent, "the last 8 of 45 turns");
  const fetchWas = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error("no"); };
  try {
    await svLoadEarlier(e);
    assert.equal(fetched, 0);
    assert.ok(e.earlier, "the server still has 35 turns to give");
    assert.equal(e.earlier.say.textContent, "the last 10 of 45 turns");
    assert.equal(e.conv.shownFrom, null);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("a windowed event on a chat that already folded turns reuses the bar instead of adding a second one", () => {
  const e = seat();
  talk(e, 10);
  svTrimTurns(e);
  svEarlierBar(e, { turns: 5, turnsTotal: 40 });
  assert.equal(e.conv.blocks.filter((one) => one.key === "t:earlier").length, 1);
  assert.equal(e.earlier.more, true);
  assert.equal(e.earlier.say.textContent, "the last 8 of 45 turns");
});

test("every paint, the streaming frame included, goes through the blocks on screen and not the whole chat", () => {
  assert.match(modules, /e\.convView\.show\(\{ key: e\.name, blocks: svConvShown\(e\.conv\)\.map\(svConvSay\) \}\);/);
  assert.match(modules, /const isHumanTurnContent = \(content\) => Array\.isArray\(content\) && content\.some\(\(b\) => b\.type === "text"\) && !content\.some\(\(b\) => b\.type === "tool_result"\);/);
});

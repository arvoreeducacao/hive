import { test } from "node:test";
import assert from "node:assert";
import { panelOf, peerOfTheBoard, readPanel, teamFromBoard, teamSeatKey, readTeamSeatKey, machineOf, liveliestOfDev, PANEL_FRESH } from "../lib/team.mjs";

const seat = (over = {}) => ({
  name: "app-ios-carregamento",
  title: "Carregamento no app iOS",
  where: "cloud",
  state: "working",
  when: "12 min",
  model: "opus",
  summary: "Investigando a tela branca no boot",
  done: "reproduziu",
  now: "medindo",
  next: "trocar o unzip",
  ...over
});

test("the published panel carries the card and nothing else", () => {
  const panel = panelOf([seat({ prs: ["acme/hub#1"], history: [1, 2, 3], threads: ["x"] })], "rafael", 1000);
  assert.deepStrictEqual(Object.keys(panel), ["v", "dev", "at", "seats"]);
  assert.deepStrictEqual(Object.keys(panel.seats[0]), ["name", "title", "where", "state", "when", "model", "summary", "description", "now", "live", "liveSince"]);
});

test("the face rides along when it is a real one, and is left out when it is not", () => {
  const withFace = panelOf([seat()], "rafael", 1000, new Map(), "pebble/curious/turquoise");
  assert.deepStrictEqual(Object.keys(withFace), ["v", "dev", "at", "avatar", "seats"]);
  assert.equal(withFace.avatar, "pebble/curious/turquoise");
  for (const junk of ["", "sphere/curious/turquoise", "pebble/curious", undefined]) {
    assert.deepStrictEqual(Object.keys(panelOf([seat()], "rafael", 1000, new Map(), junk)), ["v", "dev", "at", "seats"], `${junk} should not be published`);
  }
});

test("a face read off another pod is refused unless it is one we can draw", () => {
  const panel = (avatar) => readPanel(JSON.stringify({ v: 1, dev: "rafael", at: 1000, avatar, seats: [] }), 1000);
  assert.equal(panel("pebble/curious/turquoise").avatar, "pebble/curious/turquoise");
  for (const junk of ["sphere/curious/turquoise", "<script>", "", null]) assert.equal(panel(junk).avatar, "", `${junk} should not be trusted`);
});

test("shells and junk names never reach the team", () => {
  const panel = panelOf([seat({ kind: "shell" }), seat({ name: "../etc/passwd" }), seat({ name: "ok" })], "rafael", 1000);
  assert.deepStrictEqual(panel.seats.map((s) => s.name), ["ok"]);
});

test("a seat with no title falls back to its name, and long text is cut", () => {
  const panel = panelOf([seat({ title: "", summary: "x".repeat(900) })], "rafael", 1000);
  assert.strictEqual(panel.seats[0].title, "app-ios-carregamento");
  assert.strictEqual(panel.seats[0].summary.length, 400);
});

test("reading back a panel gives the same seats", () => {
  const text = JSON.stringify(panelOf([seat()], "rafael", 5000));
  const read = readPanel(text, 5000);
  assert.strictEqual(read.dev, "rafael");
  assert.strictEqual(read.stale, false);
  assert.deepStrictEqual(read.seats.map((s) => s.title), ["Carregamento no app iOS"]);
});

test("a panel left behind by a closed app is stale, not a fleet", () => {
  const text = JSON.stringify(panelOf([seat()], "rafael", 0));
  assert.strictEqual(readPanel(text, PANEL_FRESH + 1).stale, true);
});

test("garbage, another version and a bad dev name read as nothing", () => {
  assert.strictEqual(readPanel("not json"), null);
  assert.strictEqual(readPanel(JSON.stringify({ v: 99, dev: "rafael", at: 1, seats: [] })), null);
  assert.strictEqual(readPanel(JSON.stringify({ v: 1, dev: "../root", at: 1, seats: [] })), null);
  assert.strictEqual(readPanel(""), null);
});

test("an unknown state reads as idle instead of styling nothing", () => {
  const read = readPanel(JSON.stringify({ v: 1, dev: "rafael", at: 1, seats: [{ name: "a", state: "on fire" }] }), 1);
  assert.strictEqual(read.seats[0].state, "idle");
});

test("who is running something comes first, and a stale panel shows no seats", () => {
  const board = (dev, panel, extra = {}) => ({ fingerprint: `k-${dev}`, panel, ...extra });
  const rows = teamFromBoard([
    board("rosa", panelOf([seat(), seat({ name: "b", state: "needs" })], "rosa", 1000)),
    board("art", panelOf([], "art", 1000)),
    board("vini", panelOf([seat()], "vini", 1000 - (PANEL_FRESH + 1))),
    board("jonas", panelOf([seat()], "jonas", 1000))
  ], "jonas", 1000);

  assert.deepStrictEqual(rows.map((r) => [r.dev, r.seats.length, r.needs]), [
    ["jonas", 1, 0],
    ["rosa", 2, 1],
    ["art", 0, 0],
    ["vini", 0, 0]
  ]);
  assert.strictEqual(rows.find((r) => r.dev === "vini").sharing, false, "a panel nobody refreshed is still shown as live");
  assert.strictEqual(rows[0].mine, true, "my own machine is not mine, or is not the first thing I see");
  assert.strictEqual(rows.some((r) => "pod" in r), false,
    "a row still carries a pod name, which is one deployment's way of hosting and not something the screen should know");
});

test("a team seat key survives the round trip and refuses anything else", () => {
  assert.deepStrictEqual(readTeamSeatKey(teamSeatKey("rosa", "app-ios")), { dev: "rosa", machine: "", name: "app-ios" });

  const studio = teamSeatKey("pedro", "arrumar-o-rail", "SHA256:cFiq6rLSylh4swpXK8vp4mqC8L4nBdHninFTrrSS6is");
  const macbook = teamSeatKey("pedro", "arrumar-o-rail", "SHA256:wvUgCSLqaSFeNZV697Vtks1mZcweWZWxFgHtf2QWY94");
  assert.notStrictEqual(studio, macbook, "the same seat name on two machines of mine shared one chat, which is answering the wrong seat");
  assert.deepStrictEqual(readTeamSeatKey(studio), { dev: "pedro", machine: "cFiq6rLSyl", name: "arrumar-o-rail" });
  assert.strictEqual(readTeamSeatKey("team:rafael/../etc"), null);
  assert.strictEqual(readTeamSeatKey("app-ios"), null);
});

import { knockOf, readKnock, sayOf, readSay, sayLine, grantLive, turnsOfTail, GRANT_MS, KNOCK_FRESH } from "../lib/team.mjs";

test("a knock survives the round trip and expires on its own", () => {
  const text = JSON.stringify(knockOf("jonas", "bot-maluco", 1000));
  assert.deepStrictEqual(readKnock(text, 1000), { from: "jonas", seat: "bot-maluco", at: 1000, kind: "knock" });
  assert.strictEqual(readKnock(text, 1000 + KNOCK_FRESH + 1), null);
  assert.strictEqual(readKnock(JSON.stringify(knockOf("jonas", "bot-maluco", 1000, "bye")), 1000).kind, "bye");
});

test("the answer to a knock travels as a knock of its own, and an invented kind is just a knock", () => {
  const yes = readKnock(JSON.stringify(knockOf("art", "bot-maluco", 1000, "yes")), 1000);
  assert.deepStrictEqual(yes, { from: "art", seat: "bot-maluco", at: 1000, kind: "yes" });
  assert.strictEqual(readKnock(JSON.stringify(knockOf("art", "bot-maluco", 1000, "shove")), 1000).kind, "knock");
});

test("a knock with a name that is not a name is refused", () => {
  assert.strictEqual(readKnock(JSON.stringify(knockOf("../root", "seat", 1))), null);
  assert.strictEqual(readKnock(JSON.stringify(knockOf("jonas", "../etc/passwd", 1))), null);
  assert.strictEqual(readKnock(JSON.stringify(sayOf("jonas", "seat", "oi", 1, "x"))), null);
});

test("a message keeps who wrote it and is cut before it travels", () => {
  const said = readSay(JSON.stringify(sayOf("jonas", "seat", "x".repeat(9000), 5, "id-1")));
  assert.strictEqual(said.from, "jonas");
  assert.strictEqual(said.text.length, 4000);
  assert.strictEqual(readSay(JSON.stringify(sayOf("jonas", "seat", "   ", 5, "id-2"))), null);
});

test("the message reaches the seat saying who is talking", () => {
  assert.strictEqual(sayLine("jonas", "  manda o reset  "), "jonas: manda o reset");
});

test("a grant is only live while it has a holder and time left", () => {
  assert.strictEqual(grantLive({ with: "jonas", until: 2000 }, 1000), true);
  assert.strictEqual(grantLive({ with: "jonas", until: 500 }, 1000), false);
  assert.strictEqual(grantLive({ with: "", until: 9e12 }, 1000), false);
  assert.strictEqual(grantLive(null, 1000), false);
  assert.ok(GRANT_MS >= 600000);
});

test("only the conversation leaves the machine — tools stay home", () => {
  const tail = [
    JSON.stringify({ type: "user", subtype: "say", message: { content: [{ type: "text", text: "olha isso" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "achei o bug" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "cat /etc/shadow" } }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "root:x:0:0" }] } }),
    JSON.stringify({ type: "assistant", parent_tool_use_id: "t1", message: { content: [{ type: "text", text: "subagente falando" }] } }),
    "não é json"
  ].join("\n");
  assert.deepStrictEqual(turnsOfTail(tail), [
    { who: "you", text: "olha isso" },
    { who: "seat", text: "achei o bug" }
  ]);
});

test("the tail keeps the last turns and cuts each one", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `t${i} ` + "x".repeat(900) }] } })).join("\n");
  const turns = turnsOfTail(many);
  assert.strictEqual(turns.length, 12);
  assert.ok(turns[0].text.startsWith("t18"));
  assert.strictEqual(turns[0].text.length, 420);
});

test("a card only carries the keyboard while the grant is alive", () => {
  const seats = [{ name: "a", title: "A", where: "local", state: "working" }];
  const dead = panelOf(seats, "jonas", 5000, new Map([["a", { with: "rafa", until: 1000 }]]));
  assert.strictEqual(dead.seats[0].keyboard, undefined);
  const live = panelOf(seats, "jonas", 5000, new Map([["a", { with: "rafa", until: 9e12, turns: [{ who: "seat", text: "oi" }] }]]));
  assert.strictEqual(live.seats[0].keyboard.with, "rafa");
  assert.deepStrictEqual(readPanel(JSON.stringify(live), 5000).seats[0].keyboard.turns, [{ who: "seat", text: "oi" }]);
});

/* ── the poke ── */

import { pokeOf, readPoke, canPoke, POKE_FRESH } from "../lib/team.mjs";

test("a poke carries who and when, and nothing else", () => {
  const poke = pokeOf("vini", 1000);
  assert.deepStrictEqual(poke, { v: 1, kind: "poke", from: "vini", at: 1000, id: "vini:1000" });
  assert.deepStrictEqual(readPoke(JSON.stringify(poke), 1500), { from: "vini", at: 1000, id: "vini:1000" });
});

test("a poke that arrived late arrived for nobody", () => {
  const poke = JSON.stringify(pokeOf("art", 1000));
  assert.strictEqual(readPoke(poke, 1000 + POKE_FRESH + 1), null);
});

test("junk in the poke folder is not a poke", () => {
  assert.strictEqual(readPoke("{"), null);
  assert.strictEqual(readPoke(JSON.stringify({ v: 1, kind: "knock", from: "art", seat: "a", at: 1000 }), 1500), null);
  assert.strictEqual(readPoke(JSON.stringify({ v: 1, kind: "poke", from: "Nope!", at: 1000 }), 1500), null);
  assert.strictEqual(readPoke(JSON.stringify({ v: 1, kind: "poke", from: "art", at: 0 }), 1500), null);
});

test("only the hives that were given it can poke", () => {
  const allowed = ["ada", "grace", "alan"];
  for (const dev of allowed) assert.strictEqual(canPoke(dev, allowed), true);
  for (const dev of ["linus", "margaret", "", null]) assert.strictEqual(canPoke(dev, allowed), false);
  for (const dev of allowed) assert.strictEqual(canPoke(dev), false, "with no list configured nobody pokes");
});

test("a hello is a poke with one more word, and a plain poke has no word at all", () => {
  const hello = pokeOf("vini", 1000, true);
  assert.deepStrictEqual(hello, { v: 1, kind: "poke", from: "vini", at: 1000, id: "vini:1000", hello: true });
  assert.deepStrictEqual(readPoke(JSON.stringify(hello), 1500), { from: "vini", at: 1000, id: "vini:1000", hello: true });
  assert.ok(!("hello" in pokeOf("vini", 1000)), "a shake does not carry the word");
  assert.ok(!("hello" in readPoke(JSON.stringify(pokeOf("vini", 1000)), 1500)));
  const forged = JSON.stringify({ ...pokeOf("vini", 1000), hello: "yes" });
  assert.ok(!("hello" in readPoke(forged, 1500)), "anything but true is not a hello");
});

/* ── the conversation, mirrored ── */

import { toolLine, liveOf, liveOfTail, readLive, liveFileOf, LIVE_DIR, LIVE_ARG, LIVE_TEXT, LIVE_ASKS, LIVE_OPTIONS, LIVE_ASK } from "../lib/team.mjs";

const said = (text) => ({ type: "text", text });

test("a step travels as one line, and the whole input stays home", () => {
  const e = liveOf({
    seq: 4, ts: "t", type: "assistant", parent_tool_use_id: null,
    message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "git status", timeout: 5000 } }] }
  });
  assert.deepStrictEqual(e.message.content, [{ type: "tool_use", id: "t1", name: "Bash", line: "git status", input: {} }]);
});

test("what a tool answered never leaves the machine that ran it", () => {
  const e = liveOf({
    seq: 5, ts: "t", type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "root:x:0:0" }] }
  });
  assert.deepStrictEqual(e.message.content, [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "" }]);
  assert.deepStrictEqual(e.images, []);
});

test("thinking and images disappear, and an event that was only those is nothing at all", () => {
  const thought = { seq: 6, ts: "t", type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm" }, said("achei")] } };
  assert.deepStrictEqual(liveOf(thought).message.content, [said("achei")]);
  assert.strictEqual(liveOf({ seq: 7, ts: "t", type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm" }] } }), null);
  assert.strictEqual(liveOf({ seq: 8, ts: "t", type: "assistant", message: { content: [{ type: "redacted_thinking", data: "x" }] } }), null);
  assert.strictEqual(liveOf({ seq: 9, ts: "t", type: "user", message: { content: [{ type: "image", source: { data: "AAAA" } }] } }), null);
});

test("the stream and the heartbeat are not conversation", () => {
  assert.strictEqual(liveOf({ seq: 1, ts: "t", type: "stream_event", event: { delta: { text: "h" } } }), null);
  assert.strictEqual(liveOf({ hive_ping: 1 }), null);
  assert.strictEqual(liveOf(null), null);
  assert.strictEqual(liveOf({ seq: 2, ts: "t", type: "tool_use_result" }), null);
});

test("only the driver noises a person would miss otherwise cross", () => {
  assert.strictEqual(liveOf({ seq: 1, ts: "t", type: "driver", subtype: "interrupted", ms: 40 }).ms, 40);
  assert.strictEqual(liveOf({ seq: 2, ts: "t", type: "driver", subtype: "warning", message: "slow" }).message, "slow");
  for (const subtype of ["replayed", "said_now", "unsaid", "windowed", "slept", "woke", "mcp_gateway"]) {
    assert.strictEqual(liveOf({ seq: 3, ts: "t", type: "driver", subtype }), null, `${subtype} should stay home`);
  }
});

const asking = (over = {}) => ({
  seq: 12,
  ts: "t",
  type: "driver",
  subtype: "question",
  id: "toolu_01F8V6",
  questions: [{
    question: "Onde a pergunta deixou de aparecer?",
    header: "Onde quebrou",
    multiSelect: false,
    options: [
      { label: "No celular", description: "a porta do telefone" },
      { label: "Na tela do dia", description: "" }
    ]
  }],
  ...over
});

test("a question crosses to the other machine with the options a person taps", () => {
  const e = liveOf(asking());
  assert.strictEqual(e.type, "driver");
  assert.strictEqual(e.subtype, "question");
  assert.strictEqual(e.id, "toolu_01F8V6");
  assert.strictEqual(e.questions.length, 1);
  assert.strictEqual(e.questions[0].question, "Onde a pergunta deixou de aparecer?");
  assert.strictEqual(e.questions[0].header, "Onde quebrou");
  assert.strictEqual(e.questions[0].multiSelect, false);
  assert.deepStrictEqual(e.questions[0].options.map((o) => o.label), ["No celular", "Na tela do dia"]);
  assert.strictEqual(e.questions[0].options[0].description, "a porta do telefone");
});

test("the question text crosses byte for byte, or the answer would come back under a key nobody asked", () => {
  const asked = "Duas    linhas\ne  espaço";
  const e = liveOf(asking({ questions: [{ question: asked, options: [{ label: "vai" }] }] }));
  assert.strictEqual(e.questions[0].question, asked);
});

test("what closes a question crosses too, so the card stops asking on the phone", () => {
  for (const subtype of ["question_answered", "question_dismissed", "question_failed"]) {
    const e = liveOf({ seq: 4, ts: "t", type: "driver", subtype, id: "toolu_9" });
    assert.strictEqual(e.subtype, subtype, `${subtype} has to cross`);
    assert.strictEqual(e.id, "toolu_9");
    assert.strictEqual(e.questions, undefined, "only the asking carries the options");
  }
});

test("a question arrives cut to a size a phone can hold", () => {
  const many = Array.from({ length: LIVE_ASKS + 3 }, (_, at) => ({
    question: `pergunta ${at}`,
    header: "h".repeat(200),
    options: Array.from({ length: LIVE_OPTIONS + 5 }, (_, o) => ({ label: `o${o}`, description: "d".repeat(900) }))
  }));
  const e = liveOf(asking({ questions: many }));
  assert.strictEqual(e.questions.length, LIVE_ASKS);
  assert.strictEqual(e.questions[0].options.length, LIVE_OPTIONS);
  assert.ok(e.questions[0].header.length <= 60);
  assert.ok(e.questions[0].options[0].description.length <= 400);
  const long = liveOf(asking({ questions: [{ question: "q".repeat(LIVE_ASK + 500), options: [] }] }));
  assert.strictEqual(long.questions[0].question.length, LIVE_ASK);
});

test("a question with nothing readable in it still crosses, so the seat does not look idle while it waits", () => {
  const e = liveOf(asking({ questions: [] }));
  assert.strictEqual(e.subtype, "question");
  assert.deepStrictEqual(e.questions, []);
});

test("a question survives the sieve on the way in as well as on the way out", () => {
  const mirrored = liveOfTail([JSON.stringify(asking())].join("\n"));
  assert.strictEqual(mirrored.length, 1);
  const read = readLive(mirrored.map((one) => JSON.stringify(one)).join("\n"));
  assert.strictEqual(read[0].questions[0].options.length, 2);
  assert.strictEqual(read[0].id, "toolu_01F8V6");
});

test("the init card carries the model and nothing to fingerprint the machine with", () => {
  const e = liveOf({ seq: 1, ts: "t", type: "system", subtype: "init", model: "claude-opus-5", cwd: "/workspace/x", tools: ["Bash"], slash_commands: ["/prs"] });
  assert.deepStrictEqual(Object.keys(e), ["seq", "ts", "type", "subtype", "model"]);
});

test("a turn that ended says what it cost and nothing more", () => {
  const e = liveOf({ seq: 9, ts: "t", type: "result", subtype: "success", total_cost_usd: 0.5, duration_ms: 12, num_turns: 3, is_error: false, stop_reason: "end_turn", usage: { input_tokens: 9 } });
  assert.deepStrictEqual(Object.keys(e), ["seq", "ts", "type", "total_cost_usd", "duration_ms", "num_turns", "is_error", "stop_reason"]);
});

test("a replay stays a replay, so the far side paints it without the animation", () => {
  assert.strictEqual(liveOf({ seq: 1, ts: "t", type: "assistant", replayed: true, message: { content: [said("oi")] } }).replayed, true);
  assert.strictEqual(liveOf({ seq: 2, ts: "t", type: "assistant", message: { content: [said("oi")] } }).replayed, undefined);
});

test("a very long answer is cut before it travels", () => {
  const e = liveOf({ seq: 1, ts: "t", type: "assistant", message: { content: [said("x".repeat(LIVE_TEXT + 500))] } });
  assert.strictEqual(e.message.content[0].text.length, LIVE_TEXT);
});

test("the tail starts where the last send stopped", () => {
  const tail = [
    JSON.stringify({ seq: 1, ts: "t", type: "assistant", message: { content: [said("velho")] } }),
    JSON.stringify({ seq: 2, ts: "t", type: "assistant", message: { content: [said("novo")] } }),
    JSON.stringify({ seq: 3, ts: "t", type: "stream_event", event: {} }),
    "não é json",
    JSON.stringify({ seq: 4, ts: "t", type: "user", subtype: "say", cid: "c1", message: { content: [said("manda o reset")] } })
  ].join("\n");
  assert.deepStrictEqual(liveOfTail(tail, 1).map((e) => e.seq), [2, 4]);
  assert.deepStrictEqual(liveOfTail(tail).map((e) => e.seq), [1, 2, 4]);
  assert.deepStrictEqual(liveOfTail("", 0), []);
});

test("a file that arrives from another machine is sieved again on the way in", () => {
  const forged = [
    JSON.stringify({ seq: 1, ts: "t", type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "root:x:0:0" }] } }),
    JSON.stringify({ seq: 2, ts: "t", type: "assistant", message: { content: [{ type: "thinking", thinking: "segredo" }, said("oi")] } }),
    JSON.stringify({ seq: 3, ts: "t", type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", line: "git status", input: { command: "cat /etc/shadow" } }] } }),
    "{"
  ].join("\n");
  const read = readLive(forged);
  assert.deepStrictEqual(read.map((e) => e.seq), [1, 2, 3]);
  assert.strictEqual(read[0].message.content[0].content, "");
  assert.deepStrictEqual(read[1].message.content, [said("oi")]);
  assert.deepStrictEqual(read[2].message.content, [{ type: "tool_use", id: "t1", name: "Bash", line: "git status", input: {} }]);
});

test("the mirror file is named after the seat, and a name that is not a name has no file", () => {
  assert.strictEqual(liveFileOf("app-ios-carregamento"), `${LIVE_DIR}/app-ios-carregamento.ndjson`);
  assert.strictEqual(liveFileOf("../../etc/passwd"), "");
  assert.strictEqual(liveFileOf("a b"), "");
  assert.strictEqual(liveFileOf("a;rm -rf /"), "");
  assert.strictEqual(liveFileOf(""), "");
});

test("the walk to the folder is not the command", () => {
  assert.strictEqual(toolLine("Bash", { command: "cd /home/dev/acme-hub/app && node --test team.test.mjs" }), "node --test team.test.mjs");
  assert.strictEqual(toolLine("Bash", { command: "  git   status  " }), "git status");
});

test("a deep path keeps the end, which is the half that says what it is", () => {
  assert.strictEqual(toolLine("Read", { file_path: "/home/dev/Documentos/Acme/acme-hub/app/team.mjs" }), "…/acme-hub/app/team.mjs");
  assert.strictEqual(toolLine("Edit", { file_path: "/etc/hosts" }), "/etc/hosts");
});

test("each tool says the one thing it is about", () => {
  assert.strictEqual(toolLine("Grep", { pattern: "toolLine", path: "/home/dev/hub/app" }), "toolLine in ~/hub/app");
  assert.strictEqual(toolLine("Glob", { pattern: "**/*.mjs" }), "**/*.mjs");
  assert.strictEqual(toolLine("WebFetch", { url: "https://example.com" }), "https://example.com");
  assert.strictEqual(toolLine("Task", { description: "achar o bug", prompt: "x".repeat(9000) }), "achar o bug");
  assert.strictEqual(toolLine("Skill", { skill: "delivery" }), "delivery");
  assert.strictEqual(toolLine("AskUserQuestion", { questions: [{ question: "P ou M?" }, { question: "outra" }] }), "P ou M?");
  assert.strictEqual(toolLine("TodoWrite", { todos: [{ status: "completed" }, { status: "in_progress", content: "escrevendo o teste" }] }), "1/2 · escrevendo o teste");
});

test("a tool nobody here knows still says something, or says nothing at all", () => {
  assert.strictEqual(toolLine("mcp__signoz__search_logs", { query: "service.name = api" }), "service.name = api");
  assert.strictEqual(toolLine("Whatever", { flag: true, depth: 3 }), "");
  assert.strictEqual(toolLine("Whatever", null), "");
});

/* the door a `user` event opens is wider than a person: a skill puts its whole SKILL.md through it,
   a subagent gets its system prompt through it, and a slash command puts its stdout through it. */

test("what a person typed crosses, and only that", () => {
  const said = liveOf({ seq: 1, type: "user", subtype: "say", message: { content: [{ type: "text", text: "olha esse bug" }] } });
  assert.strictEqual(said.message.content[0].text, "olha esse bug");
});

test("the body of a skill, injected into the same kind of event, does not", () => {
  const skill = liveOf({ seq: 2, type: "user", message: { content: [{ type: "text", text: "Base directory for this skill: /home/dev/.claude/skills/delivery\n\n# Delivery" }] } });
  assert.strictEqual(skill, null, "a SKILL.md left the machine dressed as a user message");
});

test("neither does a subagent's system prompt, nor the output of a slash command", () => {
  assert.strictEqual(liveOf({ seq: 3, type: "user", message: { content: [{ type: "text", text: "Approach this as the design lead at a small studio" }] } }), null);
  assert.strictEqual(liveOf({ seq: 4, type: "user", subtype: "", message: { content: [{ type: "text", text: "<local-command-stdout>ANTHROPIC_API_KEY=sk-ant-real</local-command-stdout>" }] } }), null);
});

test("a tool still closes its card, though: the result crosses empty, whatever the event says", () => {
  const done = liveOf({ seq: 5, type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: false, content: "AWS_SECRET=xyz" }] } });
  assert.deepStrictEqual(done.message.content, [{ type: "tool_result", tool_use_id: "t1", is_error: false, content: "" }]);
});

test("an event carrying both a card and injected prose crosses as the card alone", () => {
  const mixed = liveOf({ seq: 6, type: "user", message: { content: [
    { type: "text", text: "You are a helpful assistant with these tools" },
    { type: "tool_result", tool_use_id: "t2", is_error: true, content: "boom" }
  ] } });
  assert.deepStrictEqual(mixed.message.content, [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "" }]);
});

test("a step is one line, never a page", () => {
  assert.strictEqual(toolLine("Bash", { command: "x".repeat(900) }).length, LIVE_ARG);
});

import { askOf, readAsk, outboxOf, readOutbox, answerOf, readAnswer, askLine, owedOf, owedLive, owedText, owedFrom, ASK_CHARS, OWED_LIFE, OUT_DIR, KNOCK_DIR, SAY_DIR } from "../lib/team.mjs";

test("a question travels with who asked, which seat asked, and the id that pairs it to its answer", () => {
  const asked = askOf("jonas", "checkout", "qual é o formato do payload?", 1000, "abc");
  assert.deepStrictEqual(asked, { v: 1, kind: "ask", from: "jonas", agent: "checkout", at: 1000, id: "abc", text: "qual é o formato do payload?" });
  assert.deepStrictEqual(readAsk(JSON.stringify(asked), 1500), { from: "jonas", agent: "checkout", at: 1000, id: "abc", text: "qual é o formato do payload?" });
});

test("a question nobody answered in time is a question for nobody", () => {
  const asked = JSON.stringify(askOf("jonas", "checkout", "e aí?", 1000, "abc"));
  assert.strictEqual(readAsk(asked, 1000 + KNOCK_FRESH + 1), null);
});

test("junk in the knock folder is not a question", () => {
  assert.strictEqual(readAsk("{"), null);
  assert.strictEqual(readAsk(JSON.stringify({ v: 1, kind: "knock", from: "jonas", seat: "a", at: 1000 }), 1500), null);
  assert.strictEqual(readAsk(JSON.stringify(askOf("Não!", "checkout", "e aí?", 1000, "a")), 1500), null);
  assert.strictEqual(readAsk(JSON.stringify(askOf("jonas", "nome com espaço", "e aí?", 1000, "a")), 1500), null);
  assert.strictEqual(readAsk(JSON.stringify(askOf("jonas", "checkout", "   ", 1000, "a")), 1500), null);
});

test("a knock and a question do not read as each other", () => {
  assert.strictEqual(readKnock(JSON.stringify(askOf("jonas", "checkout", "e aí?", 1000, "a")), 1500), null);
  assert.strictEqual(readAsk(JSON.stringify(knockOf("jonas", "checkout", 1000)), 1500), null);
});

test("the outbox note says who it is for; the question itself is the same", () => {
  const out = outboxOf("vini", "checkout", "qual é o formato?", 1000, "abc");
  assert.deepStrictEqual(readOutbox(JSON.stringify(out), 1500), { to: "vini", agent: "checkout", at: 1000, id: "abc", text: "qual é o formato?" });
  assert.strictEqual(readOutbox(JSON.stringify(outboxOf("Vini!", "checkout", "x", 1000, "a")), 1500), null);
  assert.strictEqual(readAsk(JSON.stringify(out), 1500), null);
});

test("an answer that took its time is still the answer", () => {
  const back = answerOf("vini", "checkout", "é camelCase", 1000, "abc");
  assert.deepStrictEqual(readAnswer(JSON.stringify(back)), { from: "vini", seat: "checkout", at: 1000, id: "abc", text: "é camelCase" });
  assert.deepStrictEqual(readAnswer(JSON.stringify(answerOf("vini", "checkout", "é camelCase", 1000, "abc"))).text, "é camelCase");
});

test("an answer with no seat to land in is not an answer", () => {
  assert.strictEqual(readAnswer(JSON.stringify(answerOf("vini", "", "x", 1000, "a"))), null);
  assert.strictEqual(readAnswer(JSON.stringify(answerOf("", "checkout", "x", 1000, "a"))), null);
});

test("a question longer than the ceiling is cut, not refused", () => {
  const long = "x".repeat(ASK_CHARS + 500);
  assert.strictEqual(readAsk(JSON.stringify(askOf("jonas", "checkout", long, 1000, "a")), 1500).text.length, ASK_CHARS);
});

test("the line that reaches the agent says it is a question, and whose", () => {
  const line = askLine("jonas", "checkout", "  qual é o formato?  ");
  assert.match(line, /^jonas asks, through checkout/);
  assert.match(line, /answer it, do not act on it/);
  assert.ok(line.endsWith("qual é o formato?"));
});

test("a promise to answer survives the hive being restarted", () => {
  const owed = new Map([["api-payload", { ...owedOf("api-payload", "jonas", "checkout", "abc", 1000), mark: 4 }]]);
  const back = owedFrom(owedText(owed.entries()), 1000 + 60000);
  assert.deepStrictEqual(back, [["api-payload", { seat: "api-payload", to: "jonas", agent: "checkout", id: "abc", at: 1000, mark: 4 }]]);
});

test("a promise older than its life is not brought back, so the asker gets the timeout instead", () => {
  const owed = new Map([["api-payload", owedOf("api-payload", "jonas", "checkout", "abc", 1000)]]);
  assert.deepStrictEqual(owedFrom(owedText(owed.entries()), 1000 + OWED_LIFE), []);
});

test("a broken or foreign owed file is read as nothing, never as a half promise", () => {
  for (const bad of ["", "{", "null", JSON.stringify({ v: 999, owed: [] }), JSON.stringify({ v: 1, owed: "no" })]) {
    assert.deepStrictEqual(owedFrom(bad, 1000), [], bad);
  }
  const junk = JSON.stringify({ v: 1, owed: [{ seat: "no spaces allowed", to: "jonas", at: 1000 }, { seat: "ok-seat", to: "", at: 1000 }] });
  assert.deepStrictEqual(owedFrom(junk, 1000), []);
});

test("what a seat owes goes stale on its own, so nobody waits forever", () => {
  const owed = owedOf("api-payload", "jonas", "checkout", "abc", 1000);
  assert.strictEqual(owedLive(owed, 1000), true);
  assert.strictEqual(owedLive(owed, 1000 + OWED_LIFE - 1), true);
  assert.strictEqual(owedLive(owed, 1000 + OWED_LIFE), false);
  assert.strictEqual(owedLive(null, 1000), false);
  assert.strictEqual(owedLive({ seat: "a", to: "", id: "x", at: 1000 }, 1000), false);
});

test("the outbox is a folder of its own, so a question on its way out is never read as one coming in", () => {
  assert.notStrictEqual(OUT_DIR, KNOCK_DIR);
  assert.notStrictEqual(OUT_DIR, SAY_DIR);
});

test("the clothes ride next to the face, and a hive that never heard of them reads the face it knows", () => {
  const dressed = panelOf([seat()], "rafael", 1000, new Map(), "pebble/curious/turquoise", "hat:cap glasses:round");
  assert.deepStrictEqual(Object.keys(dressed), ["v", "dev", "at", "avatar", "wear", "seats"]);
  assert.equal(dressed.wear, "glasses:round hat:cap", "in slot order, so two hives agree on the text");
  for (const junk of ["", "hat:sombrero", "circle/curious/blue", undefined]) {
    assert.deepStrictEqual(Object.keys(panelOf([seat()], "rafael", 1000, new Map(), "pebble/curious/turquoise", junk)), ["v", "dev", "at", "avatar", "seats"], `${junk} should not be published`);
  }
  const read = (wear) => readPanel(JSON.stringify({ v: 1, dev: "rafael", at: 1000, avatar: "pebble/curious/turquoise", wear, seats: [] }), 1000);
  assert.equal(read("glasses:round hat:cap").wear, "glasses:round hat:cap");
  assert.equal(read("glasses:round hat:sombrero").wear, "glasses:round", "the piece nobody has is dropped, the rest is worn");
  for (const junk of ["<script>", "", null, undefined, 7]) assert.equal(read(junk).wear, "", `${junk} should not be trusted`);
  assert.equal(read(undefined).avatar, "pebble/curious/turquoise", "and the face is never lost over the clothes");
});

test("two machines of the same person are two rows, and neither erases the other", () => {
  const board = (key, panel) => ({ fingerprint: key, panel });
  const rows = teamFromBoard([
    board("SHA256:studio", panelOf([seat(), seat({ name: "b" })], "pedro", 1000, new Map(), "", "", "studio")),
    board("SHA256:macbook", panelOf([seat({ name: "c", state: "needs" })], "pedro", 1200, new Map(), "", "", "macbook")),
    board("SHA256:do-art", panelOf([seat({ name: "d" })], "art", 1000))
  ], "pedro", 1200);

  const meus = rows.filter((r) => r.mine);
  assert.strictEqual(meus.length, 2, "the newer machine ate the other one, which is the bug this undoes");
  assert.deepStrictEqual(meus.map((r) => [r.machine, r.seats.length]), [["studio", 2], ["macbook", 1]]);
  assert.strictEqual(meus.reduce((n, r) => n + r.seats.length, 0), 3, "the team cannot see the sum of what I am running");
  assert.strictEqual(rows.find((r) => r.machine === "macbook").needs, 1);
});

test("a machine that never said its name is known by the tail of its key, never by a blank", () => {
  const rows = teamFromBoard([
    { fingerprint: "SHA256:wvUgCSLqaSFeNZV697Vtks1mZcweWZWxFgHtf2QWY94", panel: panelOf([seat()], "pedro", 1000) }
  ], "pedro", 1000);
  assert.strictEqual(rows[0].machine, "·wvUgCS");
  assert.strictEqual(machineOf({ machine: "  studio  " }, "SHA256:x"), "studio", "a name with room around it is a different name");
});

test("what is addressed to a person lands on the machine that spoke last, not on the first of the list", () => {
  const board = (key, panel) => ({ fingerprint: key, panel });
  const rows = teamFromBoard([
    board("SHA256:velha", panelOf([seat()], "art", 1000, new Map(), "", "", "velha")),
    board("SHA256:nova", panelOf([seat({ name: "b" })], "art", 1600, new Map(), "", "", "nova"))
  ], "pedro", 1600);

  assert.strictEqual(liveliestOfDev(rows, "art").machine, "nova");
  assert.strictEqual(liveliestOfDev(rows, "ninguem"), null);
});

/* ── the closed door ── */

test("the deck only writes the door down when it is closed, and a deck with no word is an open door", () => {
  const seats = [{ name: "a", title: "A", where: "local", state: "working" }];
  const open = panelOf(seats, "jonas", 5000, new Map(), "", "", "", true);
  assert.strictEqual("knocks" in open, false);
  assert.strictEqual(readPanel(JSON.stringify(open), 5000).knocks, true);
  const closed = panelOf(seats, "jonas", 5000, new Map(), "", "", "", false);
  assert.strictEqual(closed.knocks, false);
  assert.strictEqual(readPanel(JSON.stringify(closed), 5000).knocks, false);
  assert.strictEqual(readPanel(JSON.stringify({ ...open, knocks: "nope" }), 5000).knocks, true);
});

test("the team board carries the door of each hive, and a stale deck reads as open", () => {
  const seats = [{ name: "a", title: "A", where: "local", state: "working" }];
  const rows = teamFromBoard([
    { fingerprint: "SHA256:a", panel: panelOf(seats, "jonas", 5000, new Map(), "", "", "", false) },
    { fingerprint: "SHA256:b", panel: panelOf(seats, "rafa", 5000, new Map(), "", "", "", true) },
    { fingerprint: "SHA256:c", panel: panelOf(seats, "vini", 5000 - PANEL_FRESH - 1, new Map(), "", "", "", false) }
  ], "rafa", 5000);
  const doorOf = (dev) => rows.find((row) => row.dev === dev).knocks;
  assert.strictEqual(doorOf("jonas"), false);
  assert.strictEqual(doorOf("rafa"), true);
  assert.strictEqual(doorOf("vini"), true);
});

test("a note to a teammate goes to the server that showed their panel, whatever that server calls itself", () => {
  const devs = [
    { dev: "ana", key: "SHA256:mine", mine: true },
    { dev: "bruno", key: "SHA256:bruno-server", mine: false }
  ];
  assert.equal(peerOfTheBoard(devs, "bruno"), "SHA256:bruno-server");
  assert.equal(peerOfTheBoard(devs, "ana"), "", "your own panel is not a peer to send to");
  assert.equal(peerOfTheBoard(devs, "carla"), "");
});

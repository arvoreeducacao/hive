import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookFate, memoryNote, compactLine } from "../engine/protocol.mjs";
import { glanceAt, stateOfSeat } from "../sessions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const driver = readFileSync(join(HERE, "../engine/driver.mjs"), "utf8");

const hook = (hook_event, stderr = "", subtype = "hook_response") => ({ type: "system", subtype, hook_id: "h1", hook_name: `${hook_event}:x`, hook_event, stdout: "{}", stderr, output: "", outcome: "success" });

const USED = 'hive-memory:{"v":1,"kind":"used","state":"on","items":[{"id":"m1","title":"api: mínimo 2 réplicas","source":"shared","relevance":0.96,"author":"rosa","date":"2026-05-02"},{"id":"c9","title":"readiness passava antes do Prisma","source":"conversation","relevance":0.88,"author":"","date":"2026-06-30T10:00:00Z"}]}';

test("the driver asks the sdk for every hook event", () => {
  assert.match(driver, /includeHookEvents: true/);
  assert.match(driver, /const hook = hookFate\(message\);\n\s+if \(hook\.memory\) emit\(hook\.memory\);\n\s+if \(!hook\.shown\) continue;/);
});

test("a hook response carrying the memory line becomes a memory event, and the hook itself stays out of the chat", () => {
  const fate = hookFate(hook("UserPromptSubmit", `algo antes\n${USED}\n`));
  assert.equal(fate.shown, false);
  assert.deepEqual(fate.memory, {
    type: "memory", kind: "used", state: "on",
    items: [
      { id: "m1", title: "api: mínimo 2 réplicas", source: "shared", relevance: 0.96, author: "rosa", date: "2026-05-02" },
      { id: "c9", title: "readiness passava antes do Prisma", source: "conversation", relevance: 0.88, author: "", date: "2026-06-30" }
    ]
  });
});

test("hooks other than SessionStart and Setup are dropped exactly as before, with or without a memory line", () => {
  for (const subtype of ["hook_started", "hook_progress", "hook_response"]) {
    assert.equal(hookFate(hook("PostToolUse", "", subtype)).shown, false, subtype);
    assert.equal(hookFate(hook("Stop", "", subtype)).memory, null, subtype);
  }
  assert.equal(hookFate(hook("SessionStart", "")).shown, true);
  assert.equal(hookFate(hook("Setup", "", "hook_started")).shown, true);
  assert.deepEqual(hookFate({ type: "assistant", message: { content: [] } }), { shown: true, memory: null });
  assert.deepEqual(hookFate({ type: "system", subtype: "init" }), { shown: true, memory: null });
});

test("only a hook response is read for the memory line, never a progress note", () => {
  assert.equal(hookFate(hook("UserPromptSubmit", USED, "hook_progress")).memory, null);
});

test("the state and the sent notes come through with only what the contract names", () => {
  assert.deepEqual(memoryNote('hive-memory:{"v":1,"kind":"state","state":"login","token":"segredo"}'), { type: "memory", kind: "state", state: "login" });
  assert.deepEqual(memoryNote('hive-memory:{"v":1,"kind":"state","state":"incognito"}'), { type: "memory", kind: "state", state: "incognito" });
  assert.deepEqual(memoryNote('hive-memory:{"v":1,"kind":"sent","at":1791211875980}'), { type: "memory", kind: "sent", at: 1791211875980 });
  assert.deepEqual(memoryNote('hive-memory:{"v":1,"kind":"used","state":"limited","items":[]}'), { type: "memory", kind: "used", state: "limited", items: [] });
});

test("a malformed or foreign line is no memory event at all", () => {
  for (const said of [
    "",
    "hive-memory:",
    "hive-memory:{not json",
    'hive-memory:{"v":2,"kind":"used","items":[]}',
    'hive-memory:{"kind":"used","items":[]}',
    'hive-memory:{"v":1,"kind":"shout"}',
    'hive-memory:{"v":1,"kind":"state","state":"on"}',
    'hive-memory:[1,2]',
    ' hive-memory:{"v":1,"kind":"sent","at":1}',
    `hive-memory:{"v":1,"kind":"used","items":[],"pad":"${"x".repeat(20000)}"}`
  ]) assert.equal(memoryNote(said), null, said.slice(0, 60));
});

test("an oversized or hostile payload is cut down to the contract", () => {
  const many = Array.from({ length: 10 }, (_, at) => ({
    id: `m${at}`, title: `linha um\nlinha dois ${"t".repeat(300)}`, source: at === 0 ? "evil" : "shared",
    relevance: at === 1 ? 7 : at === 2 ? "0.5" : 0.5, author: "a".repeat(200), date: "ontem", content: "o conteúdo inteiro da memória"
  }));
  many.push(null, "texto", { id: "sem-titulo" });
  const note = memoryNote(`hive-memory:${JSON.stringify({ v: 1, kind: "used", state: "everything", items: many })}`);
  assert.equal(note.state, "on");
  assert.equal(note.items.length, 6);
  for (const one of note.items) {
    assert.deepEqual(Object.keys(one).sort(), ["author", "date", "id", "relevance", "source", "title"]);
    assert.ok(one.title.length <= 120);
    assert.doesNotMatch(one.title, /\n/);
    assert.ok(one.author.length <= 60);
    assert.equal(one.date, "");
  }
  assert.equal(note.items[0].source, "conversation", "a source nobody named is never shown as verified");
  assert.equal(note.items[1].relevance, 1);
  assert.equal(note.items[2].relevance, null);
});

test("a memory note after the result does not wake an idle seat", () => {
  const lines = [
    { seq: 1, type: "assistant" },
    { seq: 2, type: "result" },
    { seq: 3, type: "memory", kind: "sent", at: 1 }
  ].map((e) => JSON.stringify(e)).join("\n");
  const seen = glanceAt(lines);
  assert.equal(seen.seq, 3);
  assert.equal(stateOfSeat({ alive: true, lastEvent: seen.last }), "idle");
});

test("the driver's log names the memory note in one line", () => {
  assert.equal(compactLine({ type: "memory", kind: "used", state: "on", items: [{}, {}] }), "memory used on items=2");
  assert.equal(compactLine({ type: "memory", kind: "sent", at: 1 }), "memory sent");
});

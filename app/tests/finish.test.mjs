import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const { parseStructuredTail, FINISH_WORDS } = new Function(
  'const PR_LINK = /https:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/pull\\/\\d+/g;'
  + 'const prettyModel = (m) => m || "";'
  + slice(server, "const FINISH_WORDS", "function structuredStateOf", "server.mjs")
  + "return { parseStructuredTail, FINISH_WORDS };"
)();

const { finishSeen, markFinishSeen, st } = await app("core");

const forget = () => { for (const key of Object.keys(finishSeen)) delete finishSeen[key]; };

const log = (...events) => events.map((e) => JSON.stringify(e)).join("\n");
const result = (over = {}) => ({
  type: "result", seq: 100, ts: "2026-08-20T13:30:34.564Z", subtype: "success",
  result: "the cover job is fixed", duration_ms: 90000, num_turns: 12,
  total_cost_usd: 1.5, stop_reason: "end_turn", is_error: false, permission_denials: [], ...over
});

test("the last result of the tail is what the seat left behind", () => {
  const info = parseStructuredTail(log(
    { type: "assistant", seq: 98 },
    result({ seq: 100 })
  ));
  assert.equal(info.working, false);
  assert.equal(info.finish.seq, 100);
  assert.equal(info.finish.text, "the cover job is fixed");
  assert.equal(info.finish.turns, 12);
  assert.equal(info.finish.cost, 1.5);
  assert.equal(info.finish.clipped, false);
});

test("a seat that went back to work still carries the finish of the turn before", () => {
  const info = parseStructuredTail(log(
    result({ seq: 100 }),
    { type: "user", seq: 101 },
    { type: "assistant", seq: 102 }
  ));
  assert.equal(info.working, true);
  assert.equal(info.finish.seq, 100);
});

test("two turns in the tail: the newer one is the one to read", () => {
  const info = parseStructuredTail(log(
    result({ seq: 100, result: "the old word" }),
    { type: "user", seq: 101 },
    result({ seq: 140, result: "the new word" })
  ));
  assert.equal(info.finish.seq, 140);
  assert.equal(info.finish.text, "the new word");
});

test("a closing word too long for the payload is cut, and says it was cut", () => {
  const info = parseStructuredTail(log(result({ result: "x".repeat(FINISH_WORDS + 500) })));
  assert.equal(info.finish.text.length, FINISH_WORDS);
  assert.equal(info.finish.clipped, true);
});

test("ending on its own is not worth a warning; anything else is", () => {
  assert.equal(parseStructuredTail(log(result())).finish.stop, "");
  assert.equal(parseStructuredTail(log(result({ stop_reason: "max_turns" }))).finish.stop, "max_turns");
  assert.equal(parseStructuredTail(log(result({ permission_denials: [{}, {}] }))).finish.denials, 2);
  assert.equal(parseStructuredTail(log(result({ is_error: true }))).finish.error, true);
});

test("a replayed result is history being read back, not a turn that just ended", () => {
  const info = parseStructuredTail(log(result({ replayed: true })));
  assert.equal(info.finish, null);
});

const seat = (over = {}) => ({ name: "resolver-ped-214", raw: "idle", finish: { seq: 100, at: "" }, ...over });

const only = (one) => { st.data = { sessions: [one], spawning: [], archived: [], pod: {} }; };

test("reading what a seat left marks that finish seen, and only once", () => {
  forget();
  only(seat());
  assert.equal(markFinishSeen("resolver-ped-214"), true);
  assert.equal(markFinishSeen("resolver-ped-214"), false, "a finish already read is not news again");
  assert.equal(JSON.parse(localStorage.getItem("hive.finish.seen"))["resolver-ped-214"], 100, "the read survives a reload");
});

test("the seen mark covers that finish only — the next turn is news again", () => {
  forget();
  only(seat());
  markFinishSeen("resolver-ped-214");
  only(seat({ finish: { seq: 140, at: "" } }));
  assert.equal(markFinishSeen("resolver-ped-214"), true);
  assert.equal(finishSeen["resolver-ped-214"], 140);
});

test("a seat that never ended a turn has nothing to mark", () => {
  forget();
  only(seat({ finish: null }));
  assert.equal(markFinishSeen("resolver-ped-214"), false);
  assert.equal("resolver-ped-214" in finishSeen, false);
});

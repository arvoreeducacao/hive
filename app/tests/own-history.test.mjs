import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_SESSION_ID, hiveEventMessages, parseHiveSessions, sayTextOf } from "../lib/own-history.mjs";

const say = (text) => JSON.stringify({ seq: 4, ts: "2026-09-03T16:02:02.994Z", type: "user", subtype: "say", message: { role: "user", content: [{ type: "text", text }] } });

const block = (name, meta, { stamp = "1756915329", first = say("Bom dia, kimi") } = {}) =>
  `==J==${name}\n${JSON.stringify(meta, null, 2)}\n==JT==${stamp}\n==JP==${first}\n\n==/J==\n`;

const kimi = { agent: "kimi", cwd: "/home/me/hub", model: "kimi-code/k3", updated: "2026-09-03T16:02:09.454Z", session_id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9", title: "saudacao matinal" };

test("a kimi seat's record becomes a history row with the id kimi named, its title and the first thing said", () => {
  const rows = parseHiveSessions(block("bom-dia-kimi-k3", kimi), "local");
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9");
  assert.equal(row.agent, "kimi");
  assert.equal(row.seat, "bom-dia-kimi-k3");
  assert.equal(row.title, "saudacao matinal");
  assert.equal(row.custom, "saudacao matinal");
  assert.equal(row.prompt, "Bom dia, kimi");
  assert.equal(row.cwd, "/home/me/hub");
  assert.equal(row.where, "local");
  assert.equal(row.at, 1756915329000, "the row is dated by the events file, the last time the seat moved");
});

test("without a title the first message names the row, and without an events file the record's own stamp dates it", () => {
  const { title, ...untitled } = kimi;
  const rows = parseHiveSessions(block("x", untitled, { stamp: "", first: say("Revisa o PR 42 pra mim, com calma") }), "cloud");
  assert.equal(rows[0].title, "Revisa o PR 42 pra mim, com calma");
  assert.equal(rows[0].at, Date.parse("2026-09-03T16:02:09.454Z"));
  assert.equal(rows[0].custom, undefined);
});

test("a peer's message loses the hive header before it names a row", () => {
  assert.equal(sayTextOf(say("[hive] message from seat orca (local). Answer it by name.\n\nolha o build")), "olha o build");
  assert.equal(sayTextOf("not json"), "");
});

test("claude's own records stay out — the transcript scan already has them — and a crooked record never becomes a row", () => {
  const raw = block("claude-seat", { ...kimi, agent: "claude", session_id: "3f1c9a2e-1111-4222-8333-444455556666" })
    + block("no-id", { ...kimi, session_id: "" })
    + block("shell-id", { ...kimi, session_id: "session_$(id)" })
    + block("bad name!", kimi)
    + block("broken", "{ not json");
  assert.deepEqual(parseHiveSessions(raw, "local"), []);
});

test("codex, kiro and opencode records are rows too", () => {
  const raw = block("c", { ...kimi, agent: "codex", session_id: "01a06474-0e8d-7543-b968-07e2f1890395" })
    + block("k", { ...kimi, agent: "kiro", session_id: "3eb09843-2a35-4e54-af18-4e41d13d456b" })
    + block("o", { ...kimi, agent: "opencode", session_id: "ses_9f1c2ab3abcd" });
  assert.deepEqual(parseHiveSessions(raw, "local").map((r) => r.agent), ["codex", "kiro", "opencode"]);
});

test("the ids the agents name are one shell word, or they are refused", () => {
  for (const id of ["session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9", "01a06474-0e8d-7543-b968-07e2f1890395", "ses_9f1c2ab3abcd"]) assert.ok(OWN_SESSION_ID.test(id), id);
  for (const id of ["", "short", "a b c d e f g h", "session_$(id)", "x".repeat(81)]) assert.ok(!OWN_SESSION_ID.test(id), id);
});

test("the preview reads the events file as a conversation, joining the pieces of one reply", () => {
  const lines = [
    say("Bom dia"),
    JSON.stringify({ type: "system", subtype: "init", session_id: "session_x" }),
    JSON.stringify({ type: "assistant", ts: "2026-09-03T16:02:22.329Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Bom dia!" }] } }),
    JSON.stringify({ type: "assistant", ts: "2026-09-03T16:02:23.329Z", message: { role: "assistant", content: [{ type: "text", text: "Como posso ajudar?" }] } }),
    JSON.stringify({ type: "result", subtype: "success" }),
    "not json"
  ].join("\n");
  const messages = hiveEventMessages(lines);
  assert.deepEqual(messages.map((m) => [m.role, m.text]), [["user", "Bom dia"], ["assistant", "Bom dia!\nComo posso ajudar?"]]);
  assert.equal(messages[1].at, "2026-09-03T16:02:22.329Z");
  assert.equal(hiveEventMessages(lines, 1).length, 1);
});

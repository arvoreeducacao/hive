import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMessageSearch, matchMessage, messageOf, queryWords, snippetAround } from "../lib/message-search.mjs";
import { registerMessageSearchRoutes } from "../routes/message-search.mjs";

const say = (text, ts) => JSON.stringify({ type: "user", subtype: "say", ts, uuid: `u-${ts}`, message: { role: "user", content: [{ type: "text", text }] } });
const answer = (text, ts, extra = {}) => JSON.stringify({ type: "assistant", ts, uuid: `a-${ts}`, message: { role: "assistant", content: [{ type: "text", text }] }, ...extra });
const tool = (ts) => JSON.stringify({ type: "user", ts, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "cadência no log da ferramenta" }] } });

function eventsDir() {
  const dir = mkdtempSync(join(tmpdir(), "hive-message-search-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("only what a person said and what the agent answered is searchable", () => {
  assert.equal(messageOf(JSON.parse(say("oi", "2026-11-23T10:01:00Z"))).role, "user");
  assert.equal(messageOf(JSON.parse(answer("feito", "2026-11-23T10:02:00Z"))).role, "assistant");
  assert.equal(messageOf(JSON.parse(tool("2026-11-23T10:03:00Z"))), null);
  assert.equal(messageOf(JSON.parse(answer("de um subagente", "2026-11-23T10:04:00Z", { parent_tool_use_id: "x" }))), null);
  assert.equal(messageOf({ type: "assistant", message: { content: [{ type: "thinking", thinking: "hm" }] } }), null);
});

test("every word has to be in the message, accents or not", () => {
  assert.deepEqual(queryWords("Cadência  RETRY a"), ["cadencia", "retry"]);
  assert.ok(matchMessage("o worker da cadência fez 3 retry", ["cadencia", "retry"]));
  assert.equal(matchMessage("o worker da cadência", ["cadencia", "retry"]), null);
  assert.match(snippetAround(`${"x ".repeat(80)}cadência no fim`, 160), /^… .*cadência no fim$/);
});

test("the search finds the chats whose messages say it, best first, and reads only what was added", async () => {
  const { dir, done } = eventsDir();
  try {
    writeFileSync(join(dir, "deploy.ndjson"), [say("roda o deploy", "2026-11-23T10:00:00Z"), answer("o worker da cadência fez 3 retry e caiu na DLQ", "2026-11-23T10:01:00Z"), tool("2026-11-23T10:02:00Z")].join("\n") + "\n");
    writeFileSync(join(dir, "orq.ndjson"), [say("manda o chat do retry esperar o PR da cadência", "2026-11-23T11:00:00Z")].join("\n") + "\n");
    writeFileSync(join(dir, "other.ndjson"), [say("nada a ver", "2026-11-23T12:00:00Z")].join("\n") + "\n");
    const search = createMessageSearch({ eventsDir: dir });
    const found = await search.search(["deploy", "orq", "other", "../etc/passwd", "missing"], "cadência retry");
    assert.deepEqual(found.map((one) => one.name).sort(), ["deploy", "orq"]);
    const deploy = found.find((one) => one.name === "deploy");
    assert.equal(deploy.role, "assistant");
    assert.match(deploy.snippet, /cadência/);
    assert.equal(deploy.at, "2026-11-23T10:01:00Z");
    appendFileSync(join(dir, "other.ndjson"), `${answer("agora a cadência deu retry também", "2026-11-23T12:05:00Z")}\n`);
    const again = await search.search(["other"], "cadencia retry");
    assert.equal(again.length, 1);
    assert.equal(again[0].role, "assistant");
    assert.deepEqual(await search.search(["deploy"], "x"), []);
  } finally { done(); }
});

test("a half-written last line waits for the rest instead of being lost", async () => {
  const { dir, done } = eventsDir();
  try {
    const line = say("a cadência voltou", "2026-11-23T10:00:00Z");
    writeFileSync(join(dir, "seat.ndjson"), line.slice(0, 20));
    const search = createMessageSearch({ eventsDir: dir });
    assert.deepEqual(await search.search(["seat"], "cadencia"), []);
    appendFileSync(join(dir, "seat.ndjson"), `${line.slice(20)}\n`);
    assert.equal((await search.search(["seat"], "cadencia")).length, 1);
  } finally { done(); }
});

test("the route hands the names and the query to the search and answers its matches", async () => {
  const routes = new Map();
  const asked = [];
  registerMessageSearchRoutes((method, path, handler) => routes.set(path, handler), { messageSearch: { search: async (names, query) => { asked.push({ names, query }); return [{ name: "a" }]; } } });
  const handler = routes.get("/api/chat/messages/search");
  let said = null;
  await handler({}, {}, new URL("http://hive/api/chat/messages/search?q=cad%C3%AAncia&names=a,%20b,,c"), (body, code) => { said = { body, code }; });
  assert.deepEqual(asked, [{ names: ["a", "b", "c"], query: "cadência" }]);
  assert.deepEqual(said.body, { query: "cadência", matches: [{ name: "a" }] });
});

test("a chat that is no longer asked about leaves the cache, so it cannot grow with every chat ever searched", async () => {
  const { dir, done } = eventsDir();
  try {
    for (const name of ["one", "two", "three"]) writeFileSync(join(dir, `${name}.ndjson`), `${say(`cadência em ${name}`, "2026-11-23T10:00:00Z")}\n`);
    const search = createMessageSearch({ eventsDir: dir });
    await search.search(["one", "two", "three"], "cadencia");
    assert.deepEqual(search.held().sort(), ["one", "three", "two"]);
    await search.search(["two"], "cadencia");
    assert.deepEqual(search.held(), ["two"]);
    await search.search(["two"], "");
    assert.deepEqual(search.held(), ["two"]);
    await search.search([], "");
    assert.deepEqual(search.held(), []);
  } finally { done(); }
});

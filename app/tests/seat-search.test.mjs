import { test } from "node:test";
import assert from "node:assert/strict";
import { TAIL_BYTES, findInSeat, searchSeats, snippetAround } from "../lib/seat-search.mjs";

const line = (event) => JSON.stringify(event);
const said = (text) => line({ type: "user", subtype: "say", message: { role: "user", content: [{ type: "text", text }] } });
const answered = (text) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const tool = (text) => line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: text }] } });

test("a chat is found by the words of its messages, the newest message first, and says who wrote it", () => {
  const raw = [said("revisa o webhook da cadência"), answered("O webhook da cadência devolve 503 quando o WhatsApp cai."), tool("webhook webhook webhook")].join("\n");
  assert.deepEqual(findInSeat(raw, ["webhook"]), { who: "agent", text: "O webhook da cadência devolve 503 quando o WhatsApp cai." });
  assert.deepEqual(findInSeat(raw, ["revisa", "webhook"]), { who: "you", text: "revisa o webhook da cadência" });
  assert.equal(findInSeat(raw, ["jacaré"]), null);
});

test("the search reads only the chats of this machine and needs a word of three letters", async () => {
  const files = { "/e/a.ndjson": said("o lote 812 da editora"), "/e/b.ndjson": answered("nada aqui") };
  const read = async (file) => files[file] || "";
  assert.deepEqual((await searchSeats({ eventsDir: "/e", names: ["a", "b"], asked: "lote", read })).map((one) => one.name), ["a"]);
  assert.deepEqual(await searchSeats({ eventsDir: "/e", names: ["a", "b"], asked: "lo", read }), []);
});

test("a chat name that could leave the events folder is never read", async () => {
  const asked = [];
  const read = async (file) => { asked.push(file); return said("o lote 812"); };
  const found = await searchSeats({ eventsDir: "/e", names: ["../../etc/passwd", "..", ".hidden", "ok-seat"], asked: "lote", read });
  assert.deepEqual(found.map((one) => one.name), ["ok-seat"]);
  assert.deepEqual(asked, ["/e/ok-seat.ndjson"]);
});

test("one search reads at most its byte budget across every chat", async () => {
  const chunk = said("o lote 812") + "\n" + "x".repeat(1000);
  const asked = [];
  const read = async (file, bytes) => { asked.push(bytes); return chunk.slice(0, bytes); };
  const names = Array.from({ length: 50 }, (_, at) => `seat-${at}`);
  await searchSeats({ eventsDir: "/e", names, asked: "lote", read, budget: 3000 });
  assert.ok(asked.length <= 4, `read ${asked.length} chats with a budget for three`);
  assert.ok(asked.every((bytes) => bytes <= TAIL_BYTES));
  assert.ok(asked.reduce((sum, bytes) => sum + bytes, 0) <= 3000 + TAIL_BYTES);
});

test("a long message is cut around the word it matched", () => {
  const text = `${"antes ".repeat(40)}o termo achado aqui ${"depois ".repeat(40)}`;
  const cut = snippetAround(text, ["termo"]);
  assert.ok(cut.startsWith("…") && cut.endsWith("…"));
  assert.match(cut, /termo achado/);
  assert.ok(cut.length <= 92);
});

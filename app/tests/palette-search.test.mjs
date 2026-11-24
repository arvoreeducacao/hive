import { test } from "node:test";
import assert from "node:assert/strict";
import { foldText, markWords, matchFields, noteOpen, openedOften, pickedQuery, rankRows, rankThreads, readOpens, recentThreads, recordOpen, searchWords, snippetAround } from "../src/app/palette-search.js";

const DAY = 24 * 60 * 60 * 1000;
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function memoryStorage() {
  const held = new Map();
  return { getItem: (k) => (held.has(k) ? held.get(k) : null), setItem: (k, v) => held.set(k, String(v)) };
}

test("folding drops accents and case and keeps every index where it was", () => {
  assert.equal(foldText("Cadência Ação"), "cadencia acao");
  assert.equal(foldText("Cadência").length, "Cadência".length);
  assert.deepEqual(searchWords("  “Cadência   RETRY” "), ["cadencia", "retry"]);
});

test("every word has to land somewhere, and a whole word beats a piece of one", () => {
  const fields = [{ value: "Retry da cadência no WhatsApp", weight: 1, midWord: true, primary: true }];
  assert.equal(matchFields(["cadencia", "nada"], fields), null);
  const whole = matchFields(["retry"], fields);
  const piece = matchFields(["etry"], fields);
  assert.ok(whole.quality > piece.quality);
  assert.deepEqual(whole.ranges, [[0, 5]]);
});

test("a little word like de or the may miss, as long as the words that carry the meaning land", () => {
  const fields = [{ value: "altura de linha do chat", weight: 1, midWord: true, primary: true }];
  assert.ok(matchFields(searchWords("altura da linha"), fields));
  assert.equal(matchFields(searchWords("da"), fields), null);
  assert.equal(matchFields(searchWords("largura da linha"), fields), null);
});

test("rows are ranked by how well the name answers, and the ones that do not answer leave", () => {
  const rows = [{ name: "new chat" }, { name: "open file…", search: "arquivo" }, { name: "themes", ctx: "the colours of the app" }];
  assert.deepEqual(rankRows(rows, searchWords("arquivo")).map((r) => r.name), ["open file…"]);
  assert.deepEqual(rankRows(rows, searchWords("the")).map((r) => r.name), ["themes"]);
  assert.equal(rankRows(rows, []).length, 3);
});

test("a chat is found by title, branch, pull request or project, and a title hit leads", () => {
  const now = Date.now();
  const chats = [
    { key: "a", title: "Deploy semanal", branch: "fix/cadencia-retry", project: "api", prs: [], activityAt: now },
    { key: "b", title: "Retry da cadência", branch: "main", project: "lead-engine", prs: [{ number: 2648, title: "" }], activityAt: now - 3 * DAY },
    { key: "c", title: "Orquestrador", branch: "", project: "hub", prs: [], activityAt: now }
  ];
  assert.deepEqual(rankThreads(chats, "cadência", now).map((c) => c.key), ["b", "a"]);
  assert.deepEqual(rankThreads(chats, "#2648", now).map((c) => c.key), ["b"]);
  assert.deepEqual(rankThreads(chats, "2648", now).map((c) => c.key), ["b"]);
  assert.deepEqual(rankThreads(chats, "lead engine", now).map((c) => c.key), ["b"]);
  assert.deepEqual(rankThreads(chats, "nothing like it", now), []);
});

test("the chat you open most comes first among matches of the same quality", () => {
  const now = Date.now();
  let opens = null;
  for (let i = 5; i >= 0; i--) opens = recordOpen(opens, now - i * DAY, "");
  const chats = [
    { key: "quiet", title: "Lote da Salta", activityAt: now - 2 * DAY, opens: null },
    { key: "often", title: "Lote da Bookfair", activityAt: now - 2 * DAY, opens }
  ];
  assert.deepEqual(rankThreads(chats, "lote", now).map((c) => c.key), ["often", "quiet"]);
  assert.equal(openedOften(chats[1], now), true);
  assert.equal(openedOften(chats[0], now), false);
});

test("opens close together count once, and the query that picked a chat is kept", () => {
  const at = Date.now();
  const first = recordOpen(null, at, "Cadência");
  const again = recordOpen(first, at + 60 * 1000, "retry");
  assert.equal(again.score, 1);
  assert.deepEqual(again.picks.map((p) => p.query), ["retry", "cadencia"]);
  const later = recordOpen(again, at + DAY, "");
  assert.ok(later.score > 1.9 && later.score < 2);
  assert.equal(pickedQuery("x".repeat(40)).length, 32);
});

test("opens live in storage and survive a new read", () => {
  const storage = memoryStorage();
  noteOpen(storage, "chat-a", Date.now(), "lote");
  assert.equal(readOpens(storage)["chat-a"].score, 1);
  assert.deepEqual(readOpens({ getItem: () => "{broken" }), {});
});

test("recent chats leave the current one out and come by last use", () => {
  const now = Date.now();
  const chats = [
    { key: "a", activityAt: now - DAY },
    { key: "b", activityAt: now - 2 * DAY, opens: { openedAt: now, score: 1, picks: [] } },
    { key: "c", activityAt: now }
  ];
  assert.deepEqual(recentThreads(chats, "c", 12).map((c) => c.key), ["b", "a"]);
  assert.equal(recentThreads(chats, "", 2).length, 2);
});

test("the words are marked wherever they show, accents or not, and the rest is escaped", () => {
  assert.equal(markWords("Retry da cadência <b>", ["cadencia", "retry"], esc), "<mark>Retry</mark> da <mark>cadência</mark> &#60;b&#62;");
  assert.equal(markWords("nada", [], esc), "nada");
});

test("a snippet keeps the matched word in view and says when it was cut", () => {
  const text = `${"antes ".repeat(40)}o worker da cadência caiu na DLQ ${"depois ".repeat(40)}`;
  const cut = snippetAround(text, ["cadencia"]);
  assert.match(cut, /^… .*cadência.* …$/);
  assert.ok(cut.length < 160);
  assert.equal(snippetAround("curto", ["curto"]), "curto");
});

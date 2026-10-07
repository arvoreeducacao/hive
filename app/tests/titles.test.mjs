import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

const STUBS = `
  const titles = new Map();
  let saved = 0;
  const saveTitles = () => { saved++; };
`;

const EXPOSE = `
  return {
    titles,
    myTitle,
    renameSeat,
    saves: () => saved
  };
`;

const hive = () => new Function(
  STUBS + slice("function cleanTitle(raw) {", "const PR_LINK") + EXPOSE
)();

test("a name written by hand is kept", () => {
  const h = hive();
  assert.equal(h.renameSeat("ajustar-paths", "local", "  Paths do Slack  "), "Paths do Slack");
  assert.equal(h.myTitle("ajustar-paths", "local"), "Paths do Slack");
  assert.equal(h.saves(), 1);
});

test("an empty name hands the card back to the seat's own name", () => {
  const h = hive();
  h.renameSeat("ajustar-paths", "local", "Paths do Slack");
  assert.equal(h.renameSeat("ajustar-paths", "local", "   "), "");
  assert.equal(h.myTitle("ajustar-paths", "local"), "");
  assert.equal(h.titles.has("local:ajustar-paths"), false);
});

test("the name belongs to one seat where it runs, not to the seat name alone", () => {
  const h = hive();
  h.renameSeat("ajustar-paths", "cloud", "Paths do Slack");
  assert.equal(h.myTitle("ajustar-paths", "local"), "");
  assert.equal(h.myTitle("ajustar-paths", "cloud"), "Paths do Slack");
});

test("no model is ever asked for a title", () => {
  /* the chat is named once at spawn (nameSession) and only a hand renames it after.
     the retry-until-settled titler was a third of a much bigger bill — see the
     simplificar-contexto-chats mission before growing one back. */
  assert.ok(!server.includes("TITLE_PROMPT"), "the server grew a title prompt again");
  assert.ok(!server.includes("pinnedTitle"), "the server re-titles seats on its own again");
});

test("a name written by hand keeps the hand's words, number or no number", () => {
  const h = hive();
  h.renameSeat("capas-cinza-audiolivros", "local", "Capas do Laruchi");
  assert.equal(h.myTitle("capas-cinza-audiolivros", "local"), "Capas do Laruchi");
});

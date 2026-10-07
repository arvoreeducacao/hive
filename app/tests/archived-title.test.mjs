import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, "..", "server.mjs"), "utf8");

const slice = (from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${from} is gone from server.mjs`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `${to} is gone from server.mjs`);
  return source.slice(start, end);
};

test("the title on the card is kept with the seat record", () => {
  const keep = slice("function rememberSeatTitle(", "const MODEL_WORDS");
  assert.match(keep, /rememberSeat\(\{ \.\.\.seat, title \}\)/, "the title the card shows is never written down, so the archive cannot inherit it");
  assert.match(keep, /seat\.title === title/, "the record is rewritten on every tick, and the fleet file with it");
  assert.match(slice("function build(name, where,", "  return {"), /rememberSeatTitle\(name, where, label\)/,
    "the card paints a title the record never hears about");
});

test("an archived chat is listed under the title it wore, not the name it was born with", () => {
  const found = slice("function archivedTitle(", "function archivedBrief(");
  assert.match(found, /myTitle\(seat\.name, seat\.where\)/, "a chat the person renamed goes back to its old face in the archive");
  assert.match(found, /seat\.title/, "the title carried in the archive entry is ignored");
  assert.match(found, /sessions", `\$\{seat\.name\}\.json`/,
    "a chat archived before the title was kept with the record has nowhere left to read it from");
  assert.match(slice("function archivedBrief(", "async function collect("), /title: archivedTitle\(seat\)/,
    "the archived list stopped asking for the title the chat wore");
});

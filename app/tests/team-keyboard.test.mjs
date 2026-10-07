import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knockOf, pokeOf, readKnock, readPoke } from "../lib/team.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, "..", "routes", "team.mjs"), "utf8");

const route = (path) => {
  const start = source.indexOf(`on("POST", "${path}"`);
  assert.ok(start >= 0, `${path} is gone from routes/team.mjs`);
  const end = source.indexOf("\n  });\n", start);
  assert.ok(end > start, `${path} has no end`);
  return source.slice(start, end);
};


test("the note the ask sends is one the other side reads back", () => {
  const said = readKnock(JSON.stringify(knockOf("joao", "seat-name", Date.now())));
  assert.ok(said, "the other hive could not read the ask");
  assert.equal(said.kind, "knock");
  assert.equal(said.from, "joao");
  assert.equal(said.seat, "seat-name");
});

test("the note the goodbye sends says it is a goodbye", () => {
  const said = readKnock(JSON.stringify(knockOf("joao", "seat-name", Date.now(), "bye")));
  assert.ok(said, "the other hive could not read the goodbye");
  assert.equal(said.kind, "bye");
});

test("the note the poke sends is one the other side reads back", () => {
  const said = readPoke(JSON.stringify(pokeOf("joao", Date.now())));
  assert.ok(said, "the other hive could not read the poke");
  assert.equal(said.from, "joao");
});

test("a bare seat and name is not a note, and never leaves looking like one", () => {
  assert.equal(readKnock(JSON.stringify({ seat: "seat-name", from: "joao" })), null);
  assert.equal(readPoke(JSON.stringify({ from: "joao" })), null);
});


for (const [path, builder] of [["/api/team/knock", "knockOf("], ["/api/team/bye", "knockOf("], ["/api/team/poke", "pokeOf("]]) {
  test(`${path} sends a stamped note through the peer-note road`, () => {
    const body = route(path);
    assert.match(body, /noteToPeer\(/, `${path} does not use the road that reaches another server`);
    assert.ok(body.includes(builder), `${path} sends something that was never stamped as a note`);
    assert.doesNotMatch(body, /sayToPeer\(/, `${path} is back on the road that stops at my own server`);
  });
}

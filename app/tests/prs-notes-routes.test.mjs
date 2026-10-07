import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrDomain } from "../routes/prs.mjs";

function harness() {
  const routes = new Map();
  let notes = {};
  let ids = 0;
  const domain = createPrDomain({
    sh: async () => "",
    shr: async () => ({ ok: true, out: "{}", error: "" }),
    extractJson: (raw) => { try { return JSON.parse(raw); } catch { return null; } },
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    readRegistry: async () => [],
    writeRegistry: async () => {},
    retire: async () => {},
    readNotes: async () => structuredClone(notes),
    writeNotes: async (next) => { notes = structuredClone(next); },
    newId: () => `n${++ids}`,
    now: () => 1700000000000
  });
  domain.register((method, path, handler) => routes.set(`${method || "GET"} ${path}`, handler), async (req) => req.body || {});

  const call = async (method, path, { body, query = "" } = {}) => {
    let answer = null;
    const json = (value, status = 200) => { answer = { value, status }; };
    await routes.get(`${method} ${path}`)({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answer;
  };
  return { call, notes: () => notes };
}

const NOTE = { key: "https://github.com/o/r/pull/7", path: "src/a.js", side: "new", line: 2, code: "const <b>a</b> = 2;", text: "use let" };

test("a note is written under the PR key and read back", async () => {
  const h = harness();
  const added = await h.call("POST", "/api/prs/notes", { body: NOTE });
  assert.equal(added.status, 200);
  assert.deepEqual(added.value.note, { id: "n1", at: 1700000000000, resolved: false, sentAt: 0, path: "src/a.js", side: "new", line: 2, text: "use let", code: "const a = 2;" });

  const read = await h.call("GET", "/api/prs/notes", { query: "?key=o/r%237" });
  assert.deepEqual(read.value.notes.map((one) => one.id), ["n1"]);
  assert.deepEqual(Object.keys(h.notes()), ["o/r#7"]);
});

test("a note without a PR, a line or words is refused", async () => {
  const h = harness();
  assert.equal((await h.call("POST", "/api/prs/notes", { body: { ...NOTE, key: "nowhere" } })).status, 400);
  assert.equal((await h.call("POST", "/api/prs/notes", { body: { ...NOTE, text: "" } })).value.error, "write the note first");
  assert.equal((await h.call("GET", "/api/prs/notes", { query: "" })).status, 400);
});

test("editing changes the words or the resolved mark, removing drops the PR when nothing is left", async () => {
  const h = harness();
  await h.call("POST", "/api/prs/notes", { body: NOTE });
  const edited = await h.call("POST", "/api/prs/notes/edit", { body: { key: "o/r#7", id: "n1", text: "use let, please" } });
  assert.equal(edited.value.note.text, "use let, please");
  const resolved = await h.call("POST", "/api/prs/notes/edit", { body: { key: "o/r#7", id: "n1", resolved: true } });
  assert.equal(resolved.value.note.resolved, true);
  assert.equal((await h.call("POST", "/api/prs/notes/edit", { body: { key: "o/r#7", id: "nope", resolved: true } })).status, 400);

  const removed = await h.call("POST", "/api/prs/notes/remove", { body: { key: "o/r#7", id: "n1" } });
  assert.deepEqual(removed.value.notes, []);
  assert.deepEqual(h.notes(), {});
});

test("the batch carries every open note, marks them sent, and refuses when all are resolved", async () => {
  const h = harness();
  await h.call("POST", "/api/prs/notes", { body: NOTE });
  await h.call("POST", "/api/prs/notes", { body: { ...NOTE, path: "src/b.js", line: 9, code: "let b", text: "bytes" } });
  await h.call("POST", "/api/prs/notes/edit", { body: { key: "o/r#7", id: "n2", resolved: true } });

  const batch = await h.call("POST", "/api/prs/notes/batch", { body: { key: "o/r#7", url: "https://github.com/o/r/pull/7" } });
  assert.equal(batch.status, 200);
  assert.equal(batch.value.count, 1);
  assert.match(batch.value.text, /^\[hive\] review notes on o\/r#7 · https:\/\/github.com\/o\/r\/pull\/7 — 1 note/);
  assert.match(batch.value.text, /1\. src\/a\.js:2 \(\+\) `const a = 2;`\n   use let/);
  assert.doesNotMatch(batch.value.text, /bytes/);
  assert.equal(h.notes()["o/r#7"].find((one) => one.id === "n1").sentAt, 1700000000000);
  assert.equal(h.notes()["o/r#7"].find((one) => one.id === "n2").sentAt, 0);

  await h.call("POST", "/api/prs/notes/edit", { body: { key: "o/r#7", id: "n1", resolved: true } });
  const empty = await h.call("POST", "/api/prs/notes/batch", { body: { key: "o/r#7" } });
  assert.equal(empty.status, 400);
});

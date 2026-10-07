import { test } from "node:test";
import assert from "node:assert/strict";
import { addNote, anchorNote, anchorNotes, batchText, cleanNote, editNote, lineOf, openNotes, plainOf, removeNote, sideOf, NOTES_PER_PR } from "../assets/review-notes.mjs";

const rows = [
  { t: "same", a: 1, d: 1, h: "<span>import x</span>" },
  { t: "removed", a: 2, d: null, h: "const <b>a</b> = 1;" },
  { t: "added", a: null, d: 2, h: "const <b>a</b> = 2;" },
  { t: "gap", n: 3 },
  { t: "added", a: null, d: 6, h: "if (a &lt; 3) go();" }
];

test("a note needs a file, a line and words", () => {
  assert.equal(cleanNote({ line: 3, text: "hm" }).error, "a note needs the file it is about");
  assert.equal(cleanNote({ path: "a.js", text: "hm" }).error, "a note needs the line it is about");
  assert.equal(cleanNote({ path: "a.js", line: 3, text: "   " }).error, "write the note first");
  const ok = cleanNote({ path: " a.js ", side: "nowhere", line: "3", text: "  use let  ", code: "const <b>a</b> = 2;   " });
  assert.deepEqual(ok, { path: "a.js", side: "new", line: 3, text: "use let", code: "const a = 2;" });
});

test("the painted html of a line comes back as the code the person read", () => {
  assert.equal(plainOf("if (a &lt; 3) <span class=\"hljs-title\">go</span>();"), "if (a < 3) go();");
  assert.equal(sideOf(rows[1]), "old");
  assert.equal(sideOf(rows[2]), "new");
  assert.equal(lineOf(rows[1]), 2);
  assert.equal(lineOf(rows[2]), 2);
});

test("a note pins to its line, follows the line when the diff shifts, and says so when the line is gone", () => {
  const stays = anchorNote({ side: "new", line: 2, code: "const a = 2;" }, rows);
  assert.deepEqual(stays, { index: 2, line: 2, moved: false, lost: false });

  const moved = anchorNote({ side: "new", line: 4, code: "if (a < 3) go();" }, rows);
  assert.deepEqual(moved, { index: 4, line: 6, moved: true, lost: false });

  const old = anchorNote({ side: "old", line: 2, code: "const a = 1;" }, rows);
  assert.equal(old.index, 1);

  const changed = anchorNote({ side: "new", line: 2, code: "something else" }, rows);
  assert.equal(changed.index, 2);
  assert.equal(changed.changed, true);

  const gone = anchorNote({ side: "new", line: 40, code: "never written" }, rows);
  assert.deepEqual(gone, { index: -1, line: 40, moved: false, lost: true });
});

test("notes are grouped by the row they land on, the lost ones apart", () => {
  const { byRow, lost } = anchorNotes([
    { id: "1", side: "new", line: 2, code: "const a = 2;", text: "one" },
    { id: "2", side: "new", line: 2, code: "const a = 2;", text: "two" },
    { id: "3", side: "new", line: 99, code: "gone", text: "three" }
  ], rows);
  assert.deepEqual([...byRow.keys()], [2]);
  assert.deepEqual(byRow.get(2).map((one) => one.id), ["1", "2"]);
  assert.deepEqual(lost.map((one) => one.id), ["3"]);
});

test("adding, editing, resolving and removing keep the list honest", () => {
  const first = addNote([], { path: "a.js", side: "new", line: 2, text: "use let", code: "const a = 2;" }, { id: "n1", at: 10 });
  assert.equal(first.notes.length, 1);
  assert.equal(first.note.resolved, false);
  assert.equal(first.note.sentAt, 0);

  const edited = editNote(first.notes, "n1", { text: "  use let, not const " });
  assert.equal(edited.note.text, "use let, not const");
  assert.equal(editNote(first.notes, "n1", { text: "  " }).error, "write the note first");
  assert.equal(editNote(first.notes, "nope", { resolved: true }).error, "that note is gone");

  const resolved = editNote(edited.notes, "n1", { resolved: true });
  assert.equal(resolved.note.resolved, true);
  assert.deepEqual(openNotes(resolved.notes), []);

  assert.deepEqual(removeNote(resolved.notes, "n1").notes, []);
  assert.equal(removeNote([], "n1").error, "that note is gone");

  const full = Array.from({ length: NOTES_PER_PR }, (_, i) => ({ id: String(i) }));
  assert.match(addNote(full, { path: "a.js", side: "new", line: 1, text: "x", code: "" }, { id: "more", at: 1 }).error, /already carries/);
});

test("the batch reads file by file, line by line, and leaves resolved notes out", () => {
  const text = batchText({ key: "o/r#7", url: "https://github.com/o/r/pull/7", notes: [
    { path: "src/b.js", side: "new", line: 10, code: "let b", text: "rename to bytes", at: 3, resolved: false },
    { path: "src/a.js", side: "old", line: 2, code: "const a = 1;", text: "why drop this?\nit was load-bearing", at: 2, resolved: false },
    { path: "src/a.js", side: "new", line: 2, code: "const a = 2;", text: "done already", at: 1, resolved: true }
  ] });
  assert.equal(text, [
    "[hive] review notes on o/r#7 · https://github.com/o/r/pull/7 — 2 notes, each pinned to a line of the diff:",
    "1. src/a.js:2 (−) `const a = 1;`",
    "   why drop this?",
    "   it was load-bearing",
    "2. src/b.js:10 (+) `let b`",
    "   rename to bytes",
    "Answer every note: change the code or say why it stays. Push to the same branch when you are done."
  ].join("\n"));
  assert.equal(batchText({ key: "o/r#7", notes: [{ resolved: true, path: "a", line: 1, at: 0 }] }), "");
});

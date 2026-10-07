import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { attribution, attributionSay, diffHtml, diffs, notes, noteTargets, notesBarHtml, paintDiff, reviewHtml } = await app("thread");

const FILE = {
  path: "src/a.js", added: 1, removed: 1, mode: "changed", binary: false, picture: false, noise: false, truncated: 0,
  lines: [
    { t: "same", a: 1, d: 1, h: "import x" },
    { t: "removed", a: 2, d: null, h: "const <b>a</b> = 1;" },
    { t: "added", a: null, d: 2, h: "const <b>a</b> = 2;" },
    { t: "gap", n: 4 },
    { t: "added", a: null, d: 7, h: "go();" }
  ]
};

const PR = { key: "o/r#7", repo: "o/r", number: 7, url: "https://github.com/o/r/pull/7", session: "builder", mine: true };

const box = (html) => { const el = document.createElement("div"); el.innerHTML = html; return el; };

function seed(list) {
  st.prs = [PR];
  st.openPr = PR.key;
  st.openFile = FILE.path;
  st.reviewChat = null;
  st.noteEdit = null;
  st.noteSent = "";
  st.data = { sessions: [{ name: "builder", title: "the builder", kind: "structured" }, { name: "zed", title: "another one", kind: "chat" }, { name: "sh1", title: "shell", kind: "shell" }] };
  diffs.set(PR.key, [FILE]);
  notes.set(PR.key, list);
}

test("every code line offers a note, and the offer carries the side, the line and the code", () => {
  seed([]);
  const el = box(paintDiff(FILE));
  const adds = [...el.querySelectorAll(".note-add")];
  assert.equal(adds.length, 4);
  assert.deepEqual(adds.map((b) => `${b.dataset.side}:${b.dataset.line}`), ["new:1", "old:2", "new:2", "new:7"]);
  assert.equal(adds[1].dataset.code, "const a = 1;");
  assert.equal(el.querySelectorAll(".note").length, 0);
});

test("a note lands under its line, a moved one says where it went, a lost one leads the file", () => {
  seed([
    { id: "n1", path: "src/a.js", side: "new", line: 2, code: "const a = 2;", text: "use let", resolved: false, sentAt: 0 },
    { id: "n2", path: "src/a.js", side: "new", line: 5, code: "go();", text: "why here", resolved: false, sentAt: 1 },
    { id: "n3", path: "src/a.js", side: "new", line: 40, code: "gone()", text: "old thought", resolved: true, sentAt: 0 },
    { id: "n4", path: "src/other.js", side: "new", line: 1, code: "", text: "not this file", resolved: false, sentAt: 0 }
  ]);
  const el = box(paintDiff(FILE));
  const rows = [...el.children];
  const noteAt = (id) => rows.findIndex((r) => r.dataset?.note === id);
  const codeAt = (side, line) => rows.findIndex((r) => r.classList?.contains("c") && r.querySelector(`.note-add[data-side="${side}"][data-line="${line}"]`));

  assert.equal(noteAt("n3"), 0, "the lost note leads the file");
  assert.ok(rows[0].classList.contains("lost"));
  assert.ok(rows[0].classList.contains("resolved"));
  assert.equal(noteAt("n1"), codeAt("new", 2) + 1, "the note sits right under its line");
  assert.equal(noteAt("n2"), codeAt("new", 7) + 1, "the moved note follows the code");
  assert.match(rows[noteAt("n2")].textContent, /moved to line 7/);
  assert.match(rows[noteAt("n2")].textContent, /sent/);
  assert.equal(noteAt("n4"), -1, "a note on another file stays out");
  assert.equal(rows[noteAt("n1")].querySelector("[data-resolve]").textContent, "resolve");
  assert.equal(rows[noteAt("n3")].querySelector("[data-resolve]").textContent, "reopen");
});

test("the editor opens under the line being annotated and nowhere else", () => {
  seed([]);
  st.noteEdit = { path: "src/a.js", side: "old", line: 2, code: "const a = 1;" };
  const el = box(paintDiff(FILE));
  const rows = [...el.children];
  const editor = rows.findIndex((r) => r.classList?.contains("note-edit"));
  const code = rows.findIndex((r) => r.classList?.contains("c") && r.querySelector('.note-add[data-side="old"][data-line="2"]'));
  assert.equal(editor, code + 1);
  assert.equal(el.querySelectorAll(".note-edit").length, 1);
  assert.ok(el.querySelector("#note-in"));
});

test("the bar counts open and resolved notes and offers the chats in a sensible order", () => {
  seed([]);
  assert.equal(notesBarHtml(PR), "");
  seed([
    { id: "n1", path: "src/a.js", side: "new", line: 2, code: "", text: "a", resolved: false, sentAt: 0 },
    { id: "n2", path: "src/a.js", side: "new", line: 3, code: "", text: "b", resolved: true, sentAt: 0 }
  ]);
  const bar = box(notesBarHtml(PR));
  assert.equal(bar.querySelector(".ncount").textContent, "1 open note · 1 resolved");
  assert.deepEqual(noteTargets(PR).map((t) => t.name), ["builder", "zed"], "the PR's own chat comes first and shells stay out");
  const options = [...bar.querySelectorAll("#note-seat option")].map((o) => o.value);
  assert.deepEqual(options, ["builder", "zed"]);
  assert.ok(bar.querySelector("#note-send"));
  assert.ok(reviewHtml(PR).includes("pr-notes"));

  st.reviewChat = "zed";
  assert.deepEqual(noteTargets(PR).map((t) => t.name), ["zed", "builder"], "inside a review the chat you are in comes first");

  st.data = { sessions: [] };
  const alone = box(notesBarHtml(PR));
  assert.ok(alone.querySelector("#note-copy"), "with no chat up the batch can still be copied");
  assert.equal(alone.querySelector("#note-send"), null);
});

test("the lines a chat wrote are marked in the gutter and counted in the file head; the rest are the person's", () => {
  seed([]);
  attribution.set(PR.key, { ok: true, seat: "builder", files: { "src/a.js": [2] }, added: 3, mine: 1 });
  const el = box(paintDiff(FILE));
  const mine = [...el.querySelectorAll(".n.mine")];
  assert.equal(mine.length, 1);
  assert.equal(mine[0].textContent, "2");
  assert.match(mine[0].title, /written by the builder/);
  assert.equal(attributionSay(PR.key, FILE), "1 of 1 added lines by the builder".replace("1 of 1", "1 of 1"));
  assert.match(diffHtml(PR), /by-seat/);

  attribution.set(PR.key, null);
  assert.equal(box(paintDiff(FILE)).querySelectorAll(".n.mine").length, 0);
  assert.equal(attributionSay(PR.key, FILE), "");
  assert.doesNotMatch(diffHtml(PR), /by-seat/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeFiles, linesWrittenIn, normalLine, writtenTexts } from "../lib/attribution.mjs";

const row = (content) => JSON.stringify({ type: "assistant", message: { role: "assistant", content } });
const tool = (name, input) => ({ type: "tool_use", id: "t1", name, input });

const TRANSCRIPT = [
  JSON.stringify({ type: "user", message: { role: "user", content: "fix it" } }),
  row([{ type: "text", text: "on it" }, tool("Edit", { file_path: "/repo/src/a.js", old_string: "const a = 1;", new_string: "const a = 2;\n  if (a > 1) go();\n" })]),
  row([tool("Write", { file_path: "/repo/src/new.js", content: "export const born = true;\n\n// x\n" })]),
  row([tool("MultiEdit", { file_path: "/repo/src/m.js", edits: [{ old_string: "x", new_string: "let many = 3;" }, { old_string: "y", new_string: "let more = 4;" }] })]),
  row([tool("Read", { file_path: "/repo/src/a.js" })]),
  "not json at all",
  row([tool("Bash", { command: "echo const a = 9;" })])
].join("\n");

test("only what a writing tool wrote counts, one trimmed line at a time", () => {
  const { written, files } = linesWrittenIn(TRANSCRIPT);
  assert.deepEqual([...written].sort(), ["const a = 2;", "export const born = true;", "if (a > 1) go();", "let many = 3;", "let more = 4;"]);
  assert.deepEqual([...files].sort(), ["/repo/src/a.js", "/repo/src/m.js", "/repo/src/new.js"]);
  assert.ok(!written.has("echo const a = 9;"), "a Bash command is not code the seat wrote into a file");
  assert.ok(!written.has("// x"), "a line too short to mean anything is left out");
  assert.deepEqual(linesWrittenIn(""), { written: new Set(), files: new Set() });
});

test("every shape of a writing tool's input is read", () => {
  assert.deepEqual(writtenTexts({ new_string: "a" }), ["a"]);
  assert.deepEqual(writtenTexts({ content: "b" }), ["b"]);
  assert.deepEqual(writtenTexts({ edits: [{ new_string: "c" }, { nope: 1 }] }), ["c"]);
  assert.deepEqual(writtenTexts(null), []);
  assert.equal(normalLine("   const   a  = 1;  "), "const a = 1;");
});

test("added lines of a diff that match what the seat wrote are marked, the rest are the person's", () => {
  const { written } = linesWrittenIn(TRANSCRIPT);
  const files = [
    { path: "src/a.js", lines: [
      { t: "same", a: 1, d: 1, h: "import x" },
      { t: "removed", a: 2, d: null, h: "const <b>a</b> = 1;" },
      { t: "added", a: null, d: 2, h: "const <b>a</b> = 2;" },
      { t: "added", a: null, d: 3, h: "  if (a &gt; 1) <span>go</span>();" },
      { t: "added", a: null, d: 4, h: "human touched this one" }
    ] },
    { path: "src/new.js", lines: [{ t: "added", a: null, d: 1, h: "export const born = true;" }] },
    { path: "src/none.js", lines: [{ t: "added", a: null, d: 1, h: "nothing of the seat" }] }
  ];
  const said = attributeFiles(files, written);
  assert.deepEqual(said.files, { "src/a.js": [2, 3], "src/new.js": [1] });
  assert.equal(said.added, 5);
  assert.equal(said.mine, 3);
  assert.deepEqual(attributeFiles([], written), { files: {}, added: 0, mine: 0 });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { indexEntries, indexLineFor, isMemoryFile, readMemory, scopeInText, withIndexLines, withScope, withText, withoutIndexLine } from "../lib/memory-files.mjs";

const SAVED = [
  "---",
  "name: deploy-em-pr-e-preview",
  "description: \"Deploy de PR sobe um preview, não produção\"",
  "metadata: ",
  "  node_type: memory",
  "  type: project",
  "  modified: 2026-09-18T22:35:50.796Z",
  "---",
  "",
  "O deploy de um PR sobe um preview.",
  ""
].join("\n");

test("a saved memory reads its name, description, nested type and no scope yet", () => {
  const memory = readMemory("deploy-em-pr-e-preview.md", SAVED);
  assert.equal(memory.name, "deploy-em-pr-e-preview");
  assert.equal(memory.description, "Deploy de PR sobe um preview, não produção");
  assert.equal(memory.type, "project");
  assert.equal(memory.scope, "");
  assert.equal(memory.broken, false);
  assert.match(memory.body, /^O deploy/);
});

test("the scope lands inside metadata, next to the type, and the rest of the file stays byte for byte", () => {
  const scoped = withScope(SAVED, "team");
  assert.equal(readMemory("x.md", scoped).scope, "team");
  assert.match(scoped, /\n  modified: 2026-09-18T22:35:50.796Z\n  scope: team\n---\n/);
  assert.equal(scoped.replace("  scope: team\n", ""), SAVED);
  const back = withScope(scoped, "personal");
  assert.equal(readMemory("x.md", back).scope, "personal");
  assert.equal((back.match(/scope:/g) || []).length, 1, "changing the scope rewrites the line instead of adding one");
});

test("a memory with no metadata block gets one, and an unknown scope is refused", () => {
  const bare = "---\nname: a\ndescription: b\n---\n\ncorpo\n";
  assert.equal(readMemory("a.md", withScope(bare, "personal")).scope, "personal");
  assert.throws(() => withScope(bare, "everyone"));
  assert.throws(() => withScope("no frontmatter here", "team"));
});

test("a scope written by hand at the top level or outside the two values is read as written or as none", () => {
  assert.equal(scopeInText("---\nname: a\nscope: team\n---\nx"), "team");
  assert.equal(scopeInText("---\nname: a\nmetadata:\n  scope: everyone\n---\nx"), "");
  assert.equal(readMemory("a.md", "no fence").broken, true);
});

test("editing the text rewrites the description on one line and keeps the frontmatter", () => {
  const edited = withText(SAVED, { description: "Preview\nem PR", body: "novo corpo" });
  const memory = readMemory("x.md", edited);
  assert.equal(memory.description, "Preview em PR");
  assert.equal(memory.type, "project");
  assert.equal(memory.body, "novo corpo\n");
});

test("the index reads title, file and hook, drops one line and appends new ones once", () => {
  const index = "# Memória\n\n## Como trabalhar\n- [Responder em pt-BR](responder.md) — sempre\n- [Sem tsc](never-run-tsc.md) — só o spec\n";
  assert.deepEqual(indexEntries(index).map((one) => [one.title, one.file, one.hook]), [["Responder em pt-BR", "responder.md", "sempre"], ["Sem tsc", "never-run-tsc.md", "só o spec"]]);
  const without = withoutIndexLine(index, "responder.md");
  assert.doesNotMatch(without, /responder\.md/);
  assert.match(without, /never-run-tsc\.md/);
  assert.match(without, /## Como trabalhar/);
  const line = indexLineFor({ file: "novo.md", title: "Novo [fato]", hook: "gancho\nem duas linhas" });
  assert.equal(line, "- [Novo fato](novo.md) — gancho em duas linhas");
  const grown = withIndexLines(index, [line, line, "- [Sem tsc](never-run-tsc.md) — de novo"]);
  assert.equal((grown.match(/novo\.md/g) || []).length, 1);
  assert.equal((grown.match(/never-run-tsc\.md/g) || []).length, 1);
  assert.ok(grown.endsWith("— gancho em duas linhas\n"));
  assert.equal(withIndexLines("", [line]), `${line}\n`);
});

test("only markdown files other than the index count as memories", () => {
  assert.equal(isMemoryFile("a.md"), true);
  assert.equal(isMemoryFile("MEMORY.md"), false);
  assert.equal(isMemoryFile("../a.md"), false);
  assert.equal(isMemoryFile(".hidden.md"), false);
  assert.equal(isMemoryFile("a.txt"), false);
});

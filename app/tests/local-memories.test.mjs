import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalMemories, memoryIdOfPath, projectLabel } from "../lib/local-memories.mjs";
import { readMemory } from "../lib/memory-files.mjs";

const raw = (name) => `---\nname: ${name}\ndescription: "sobre ${name}"\nmetadata:\n  type: project\n---\n\nCorpo de ${name}.\n`;

function place() {
  const root = mkdtempSync(join(tmpdir(), "hive-memories-"));
  const projects = join(root, "projects");
  const hub = join(projects, "-Users-ana-hub", "memory");
  mkdirSync(hub, { recursive: true });
  writeFileSync(join(hub, "a.md"), raw("a"));
  writeFileSync(join(hub, "b.md"), raw("b"));
  writeFileSync(join(hub, "MEMORY.md"), "# Memória\n- [A](a.md) — gancho de a\n- [B](b.md) — gancho de b\n");
  writeFileSync(join(projects, "-Users-ana-hub", "s.jsonl"), `${JSON.stringify({ type: "user", cwd: "/Users/ana/hub" })}\n`);
  mkdirSync(join(projects, "-Users-ana-hub-wt"), { recursive: true });
  symlinkSync(hub, join(projects, "-Users-ana-hub-wt", "memory"));
  mkdirSync(join(projects, "-Users-ana-empty", "memory"), { recursive: true });
  const local = createLocalMemories({ projectsRoot: projects, dataDir: join(root, "data"), home: "/Users/ana" });
  return { root, projects, hub, local };
}

test("every memory folder is listed once, a worktree's symlink to the hub folder included, with its index title", async () => {
  const { local } = place();
  const { projects, memories } = await local.list();
  assert.deepEqual(projects.map((one) => [one.id, one.label, one.count]), [["-Users-ana-hub", "~/hub", 2]]);
  assert.deepEqual(memories.map((one) => [one.id, one.title, one.hook, one.scope]), [["-Users-ana-hub/a.md", "A", "gancho de a", ""], ["-Users-ana-hub/b.md", "B", "gancho de b", ""]]);
});

test("changing the scope writes the frontmatter, and undo puts the file back as it was", async () => {
  const { local, hub } = place();
  const entry = await local.setScope("-Users-ana-hub/a.md", "team");
  assert.equal(readMemory("a.md", readFileSync(join(hub, "a.md"), "utf8")).scope, "team");
  await local.undo(entry.id);
  assert.equal(readFileSync(join(hub, "a.md"), "utf8"), raw("a"));
  await assert.rejects(local.undo(entry.id), /already undone/);
});

test("a memory reached through the worktree's symlink is the same file", async () => {
  const { local, hub } = place();
  await local.setScope("-Users-ana-hub-wt/b.md", "personal");
  assert.equal(readMemory("b.md", readFileSync(join(hub, "b.md"), "utf8")).scope, "personal");
});

test("deleting removes the file and its line in the local index at once, and undo brings both back", async () => {
  const { local, hub } = place();
  const index = readFileSync(join(hub, "MEMORY.md"), "utf8");
  const entry = await local.remove("-Users-ana-hub/a.md");
  assert.equal(existsSync(join(hub, "a.md")), false);
  assert.equal(readFileSync(join(hub, "MEMORY.md"), "utf8"), "# Memória\n- [B](b.md) — gancho de b\n");
  await local.undo(entry.id);
  assert.equal(readFileSync(join(hub, "a.md"), "utf8"), raw("a"));
  assert.equal(readFileSync(join(hub, "MEMORY.md"), "utf8"), index);
});

test("a file changed behind the panel's back is not overwritten by an undo", async () => {
  const { local, hub } = place();
  const entry = await local.setScope("-Users-ana-hub/a.md", "team");
  writeFileSync(join(hub, "a.md"), raw("a-editada"));
  await assert.rejects(local.undo(entry.id), /changed outside/);
});

test("ids and paths outside the memory folders are refused", async () => {
  const { local, projects } = place();
  await assert.rejects(local.setScope("../a.md", "team"), /no such memory/);
  await assert.rejects(local.setScope("-Users-ana-hub/MEMORY.md", "team"), /no such memory/);
  await assert.rejects(local.remove("-Users-ana-nothing/a.md"), /no such memory/);
  assert.equal(memoryIdOfPath(join(projects, "-Users-ana-hub", "memory", "a.md"), projects), "-Users-ana-hub/a.md");
  assert.equal(memoryIdOfPath(join(projects, "-Users-ana-hub", "memory", "MEMORY.md"), projects), "");
  assert.equal(memoryIdOfPath("/etc/passwd", projects), "");
});

test("a proposed memory carries its pull request until it is merged, then the personal copy goes and undo can bring it back", async () => {
  const { local, hub } = place();
  await local.markProposed(["-Users-ana-hub/a.md"], { number: 9, url: "https://github.com/acme/hub/pull/9", repo: "acme/hub" });
  const listed = await local.list();
  assert.equal(listed.memories.find((one) => one.file === "a.md").proposed.number, 9);
  assert.deepEqual(await local.pendingPrs(), [{ repo: "acme/hub", number: 9 }]);
  const open = await local.settle(() => "OPEN");
  assert.deepEqual(open.merged, []);
  assert.equal(existsSync(join(hub, "a.md")), true);
  const merged = await local.settle((key) => (key === "acme/hub#9" ? "MERGED" : undefined));
  assert.deepEqual(merged.merged, [{ number: 9, count: 1 }]);
  assert.equal(existsSync(join(hub, "a.md")), false);
  assert.doesNotMatch(readFileSync(join(hub, "MEMORY.md"), "utf8"), /a\.md/);
  assert.deepEqual(await local.pendingPrs(), []);
  await local.undo(merged.entry);
  assert.equal(existsSync(join(hub, "a.md")), true);
  assert.equal((await local.pendingPrs()).length, 1);
});

test("a proposal closed without merging gives the memory back to the candidates", async () => {
  const { local, hub } = place();
  await local.markProposed(["-Users-ana-hub/b.md"], { number: 5, url: "u", repo: "acme/hub" });
  await local.settle(() => "CLOSED");
  assert.equal(existsSync(join(hub, "b.md")), true);
  assert.equal((await local.list()).memories.find((one) => one.file === "b.md").proposed, null);
});

test("the project reads as the folder the sessions ran in, or as the slug without the home", () => {
  assert.equal(projectLabel("-Users-ana-Developer-hub", "/Users/ana/Developer/hub", "/Users/ana"), "~/Developer/hub");
  assert.equal(projectLabel("-Users-ana-Developer-hub", "", "/Users/ana"), "~/Developer-hub");
  assert.equal(projectLabel("-workspace-repos-hub", "", "/Users/ana"), "-workspace-repos-hub");
});

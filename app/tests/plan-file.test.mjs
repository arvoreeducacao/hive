import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planFileTarget, savePlanFile } from "../lib/plan-file.mjs";

test("a plan lands where the person said, inside the chat's folder", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plan-file-"));
  try {
    const saved = savePlanFile({ cwd, path: "plans/fechar-o-lote.md", text: "# Fechar o lote\n" });
    assert.deepEqual(saved, { ok: true, path: "plans/fechar-o-lote.md" });
    assert.equal(readFileSync(join(cwd, "plans/fechar-o-lote.md"), "utf8"), "# Fechar o lote\n");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a path that climbs out of the folder is refused", () => {
  for (const path of ["../fora.md", "plans/../../fora.md", "/etc/passwd.md"]) assert.ok(planFileTarget("/hub", path).error, path);
});

test("only a markdown file is written", () => {
  assert.ok(planFileTarget("/hub", "plans/x.sh").error);
  assert.equal(planFileTarget("/hub", "plans/x.MD").full, "/hub/plans/x.MD");
});

test("an empty plan writes nothing", () => {
  assert.ok(savePlanFile({ cwd: "/hub", path: "plans/x.md", text: "  " }).error);
});

test("a link inside the folder cannot carry the plan out of it", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plan-file-"));
  const outside = mkdtempSync(join(tmpdir(), "plan-outside-"));
  try {
    symlinkSync(outside, join(cwd, "door"));
    assert.ok(savePlanFile({ cwd, path: "door/plan.md", text: "# x\n" }).error);
    assert.ok(savePlanFile({ cwd, path: "door/new/plan.md", text: "# x\n" }).error);
    assert.equal(existsSync(join(outside, "plan.md")), false);
    assert.equal(existsSync(join(outside, "new")), false, "a folder was made outside before the check");
    mkdirSync(join(cwd, "plans"));
    symlinkSync(join(outside, "target.md"), join(cwd, "plans/linked.md"));
    assert.ok(savePlanFile({ cwd, path: "plans/linked.md", text: "# x\n" }).error);
    assert.equal(existsSync(join(outside, "target.md")), false, "a dangling link was followed");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

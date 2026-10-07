import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const attributes = readFileSync(join(REPO, ".gitattributes"), "utf8");

test("a shell script's shebang cannot be carried in on a Windows checkout", () => {
  assert.match(attributes, /^\*\.sh\s+text\s+eol=lf$/m);
  const trackedShellScripts = execFileSync("git", ["-C", REPO, "ls-files", "*.sh"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.ok(trackedShellScripts.length > 0, "nothing here to protect — the glob above found no shell scripts to check against");
});

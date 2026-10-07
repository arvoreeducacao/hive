import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publish = readFileSync(join(REPO, "infra/scripts/publish-release.sh"), "utf8");

const trim = () => publish.slice(publish.indexOf("tail_of_the_list="));

test("the release goes out before anything is trimmed", () => {
  assert.ok(publish.indexOf("gh release upload") < publish.indexOf("tail_of_the_list="),
    "the tail is trimmed before the assets are uploaded, so a hiccup in housekeeping loses the build");
});

test("housekeeping cannot fail a build that already published", () => {
  const tail = trim();
  assert.match(tail, /\|\| true/, "listing the old releases can still take the job down with it");
  assert.match(tail, /--cleanup-tag \\\n\s*\|\| echo/, "deleting a release another build already deleted still fails the job");
  assert.match(publish.trimEnd(), /\nexit 0$/, "the script does not end on the exit code of a delete it does not care about");
});

test("an empty tail is not read as one release with an empty name", () => {
  assert.match(trim(), /\[ -n "\$old" \] \|\| continue/);
});

test("every folder the pack carries is one this repo still has", () => {
  const script = readFileSync(join(REPO, "infra/scripts/pack-js.sh"), "utf8");
  const line = script.split("\n").find((one) => one.startsWith("tar ") && one.includes('"$pack"'));
  assert.ok(line, "pack-js.sh no longer tars anything, and this test lost its subject");
  const carried = line.slice(line.indexOf('"$pack"') + '"$pack"'.length).trim().split(/\s+/).filter(Boolean);
  assert.ok(carried.length, "the pack names no folder to carry");
  const gone = carried.filter((one) => !existsSync(join(REPO, one)));
  assert.deepEqual(gone, [], `tar dies on a folder that is not here any more: ${gone.join(", ")}`);
  assert.ok(carried.includes("app") && carried.includes("server"), "the pack stopped carrying what the desktop runs");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const readme = read("README.md");
const setup = read("infra/scripts/setup.sh");

test("the licence is there and says which one it is", () => {
  const licence = read("LICENSE");
  assert.match(licence, /Apache License\n\s+Version 2\.0, January 2004/);
  assert.doesNotMatch(licence, /\[name of copyright owner\]/, "the licence still carries the template placeholder");
});

test("the front door points at files that exist", () => {
  for (const hit of readme.matchAll(/\]\((?!https?:|\.\.\/)([^)#]+)\)/g)) {
    assert.ok(existsSync(join(REPO, hit[1])), `README links to ${hit[1]}, and there is no such file`);
  }
});

test("the front door does not leak how one company happens to host it", () => {
  assert.doesNotMatch(readme, /kubectl|arvore-prd|dkr\.ecr|\.arvore\.com\.br/);
});

test("installing the command line does not demand a cluster", () => {
  const required = setup.match(/^REQUIRED="([^"]*)"/m);
  assert.ok(required, "REQUIRED moved and this test lost its subject");
  for (const tool of ["kubectl", "aws"]) {
    assert.ok(!required[1].split(/\s+/).includes(tool),
      `setup.sh refuses to install without ${tool}, so nobody outside a cluster can run it`);
  }
  assert.match(setup, /CLUSTER_TOOLS="kubectl aws"/, "the cluster tools stopped being checked at all — they should warn, not vanish");
});

test("the installer names no company of its own", () => {
  assert.doesNotMatch(setup, /arvore/i, "setup.sh is the open part of the project and just named one company's paths");
  assert.match(setup, /above="\$\(dirname "\$DIR"\)"/, "setup.sh stopped working out the workspace from where the repo sits, so it needs a hardcoded path again");
});

test("the guides a newcomer is sent to are the ones that exist", () => {
  for (const doc of ["docs/run-your-own.md", "CONTRIBUTING.md", "SECURITY.md"]) {
    assert.ok(readme.includes(doc), `README stopped pointing at ${doc}`);
  }
  assert.ok(read("CONTRIBUTING.md").includes("AGENTS.md"), "the contributing guide stopped pointing at the one rule about killing servers");
});

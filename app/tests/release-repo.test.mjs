import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoOfManifest } from "../lib/env.mjs";

const HERE = new URL(".", import.meta.url).pathname;

test("the bundle still knows which repository releases it after packaging strips the build block", () => {
  const source = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8"));
  const { owner, repo } = source.build.publish;
  const releases = `${owner}/${repo}`;
  assert.match(releases, /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "the build block names no repository to publish to");
  assert.equal(repoOfManifest(source), releases, "from a checkout the build block names it");

  const packaged = { ...source };
  delete packaged.build;
  assert.equal(
    repoOfManifest(packaged),
    releases,
    "electron-builder drops the build block, and a bundle that cannot name its repository asks github for repos//releases, gets a 404 and falls back to rebuilding on the machine without saying why"
  );
});

test("a manifest that names no github repository names none", () => {
  assert.equal(repoOfManifest({}), "");
  assert.equal(repoOfManifest(null), "");
  assert.equal(repoOfManifest({ homepage: "https://example.com/arvoreeducacao/dev-workspaces" }), "");
  assert.equal(repoOfManifest({ homepage: "not a url" }), "");
});

test("the homepage is read the way people write it", () => {
  assert.equal(repoOfManifest({ homepage: "https://github.com/arvoreeducacao/dev-workspaces.git" }), "arvoreeducacao/dev-workspaces");
  assert.equal(repoOfManifest({ homepage: "https://github.com/arvoreeducacao/dev-workspaces/" }), "arvoreeducacao/dev-workspaces");
  assert.equal(repoOfManifest({ homepage: "http://github.com/a/b" }), "a/b");
});

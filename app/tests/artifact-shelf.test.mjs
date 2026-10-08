import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { artifactPublish, artifactSaid, artifactFace } = await app("subagents-dock");

const ON_THE_SHELF = `on the shelf as "Publicar sem claude.ai" · documento v1 · in-review · pushed to the team's repo
hive://shelf/publicar-sem-claude-ai?tab=documento&v=1 — this is the link to announce: it opens the page inside the hive, for anyone on the team
https://github.com/acme/artifacts/blob/HEAD/a/publicar-sem-claude-ai/documento.v1.html — the file in the repo, source only; post it to no one`;

const NO_ADDRESS = `the page is kept on this machine, but the shelf refused it: no reason given`;

test("publishing to the shelf opens a row in the session, like the old tool did", () => {
  const input = { path: "/tmp/rfc/publicar-sem-claude-ai.html", label: "in-review" };
  for (const name of ["mcp__hive__publish", "hive__publish", "hive:publish"]) {
    assert.equal(artifactPublish(name, input), true, name);
  }
});

test("the row knows which file it is, whichever tool published it", () => {
  assert.equal(artifactFace({ path: "/tmp/a/telas-x.html", label: "draft" }).name, "telas-x.html");
  assert.equal(artifactFace({ file_path: "/tmp/a/rfc.html" }).name, "rfc.html");
  assert.equal(artifactFace({ path: "/tmp/a/telas-x.html", label: "draft" }).label, "draft");
});

test("the row takes the hive address, not the file in the repo", () => {
  assert.equal(artifactSaid(ON_THE_SHELF).url, "hive://shelf/publicar-sem-claude-ai?tab=documento&v=1");
});

test("an answer with no address still leaves a row standing", () => {
  const said = artifactSaid(NO_ADDRESS);
  assert.equal(said.url, "");
  assert.equal(said.path, "");
});

test("the old tool keeps working exactly as before", () => {
  const said = artifactSaid("Published /tmp/page.html at https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96");
  assert.equal(said.path, "/tmp/page.html");
  assert.equal(said.url, "https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96");
  assert.equal(artifactPublish("Artifact", { file_path: "/tmp/page.html" }), true);
  assert.equal(artifactPublish("Artifact", { action: "list" }), false);
});

test("a tool that is not publishing opens no row", () => {
  assert.equal(artifactPublish("mcp__hive__peers", {}), false);
  assert.equal(artifactPublish("mcp__hive__publish", { label: "em-revisao" }), false);
  assert.equal(artifactPublish("mcp__hive__publish", { path: "   " }), false);
  assert.equal(artifactPublish("publish", { path: "/tmp/a.html" }), false);
  assert.equal(artifactPublish("Bash", { command: "publish" }), false);
});

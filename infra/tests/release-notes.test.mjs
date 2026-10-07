import { test } from "node:test";
import assert from "node:assert";
import { kindOf, sentence, prOf, mergedPr, writeNotes, quietOf } from "../../app/main/update.js";

test("the conventional prefix decides the group", () => {
  assert.equal(kindOf("feat(app): the packaged app updates by download"), "new");
  assert.equal(kindOf("fix: the PR panel stops burning the GitHub API budget"), "fixed");
  assert.equal(kindOf("perf(server): the fleet tick stops walking every worktree"), "faster");
  assert.equal(kindOf("add stuff to the mcp proxy"), "changed");
});

test("housekeeping never reaches the screen", () => {
  for (const subject of [
    "chore: the bundle whitelist loses the deleted module",
    "docs: the runbook explains the swap",
    "test(app): covers the release parser",
    "ci: the runner is arm64",
    "refactor(app): the tile paints from one place",
    "style: the lint agrees with itself",
    "build: electron 40",
    'Revert "Merge pull request #118 from arvoreeducacao/comms-channels"'
  ]) assert.equal(kindOf(subject), "quiet", subject);
});

test("a merge subject is never a note — the branch commits are", () => {
  assert.equal(kindOf("Merge pull request #134 from arvoreeducacao/joao-barros/-/pr-panel"), "quiet");
  assert.equal(mergedPr("Merge pull request #134 from arvoreeducacao/joao-barros/-/pr-panel"), "#134");
  assert.equal(mergedPr("fix: something"), "");
});

test("the subject becomes a sentence, not a commit line", () => {
  assert.equal(sentence("fix(app): the newest release is the one published last"), "The newest release is the one published last.");
  assert.equal(sentence("feat: images paste as thumbnails."), "Images paste as thumbnails.");
  assert.equal(sentence("fix: does it ack?"), "Does it ack?");
  assert.equal(sentence("fix: the update goes through REST (#133)"), "The update goes through REST.");
});

test("a squashed subject carries its own PR number", () => {
  assert.equal(prOf("fix: the update goes through REST (#133)"), "#133");
  assert.equal(prOf("fix: the update goes through REST"), "");
});

test("the body groups by kind, links the PR and counts the rest", () => {
  const body = writeNotes([
    { subject: "feat(app): the packaged app updates by download, not by rebuilding", pr: "#131" },
    { subject: "fix: the PR panel stops burning the GitHub API budget", pr: "#134" },
    { subject: "chore: the bundle whitelist loses the deleted module", pr: "#134" },
    { subject: "perf: the rail paints once per tick", pr: "" }
  ]);
  assert.equal(body, [
    "### new",
    "- The packaged app updates by download, not by rebuilding. (#131)",
    "",
    "### fixed",
    "- The PR panel stops burning the GitHub API budget. (#134)",
    "",
    "### faster",
    "- The rail paints once per tick.",
    "",
    "_1 housekeeping commit._"
  ].join("\n") + "\n");
});

test("the same sentence twice in a span is written once", () => {
  const body = writeNotes([
    { subject: "fix: the linux build ships the node-pty binding", pr: "#137" },
    { subject: "fix: the linux build ships the node-pty binding", pr: "#140" }
  ]);
  assert.equal(body.split("\n").filter((line) => line.startsWith("- ")).length, 1);
});

test("a release with nothing user-facing says so instead of showing an empty screen", () => {
  const body = writeNotes([{ subject: "chore: bumps the lockfile", pr: "#150" }]);
  assert.match(body, /Housekeeping only/);
  assert.match(body, /_1 housekeeping commit\._/);
});

test("the housekeeping count reads back out of the body", () => {
  assert.equal(quietOf("### fixed\n- A thing.\n\n_3 housekeeping commits._"), 3);
  assert.equal(quietOf("### fixed\n- A thing."), 0);
});

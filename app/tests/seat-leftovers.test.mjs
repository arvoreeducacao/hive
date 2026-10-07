import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { leftoversHtml, shortCommand, worktreesThatStayed } = await app("seat-leftovers");

test("a command is shown by its executable's name, never by the store path node lives in, and it is cut before it can push the dialog sideways", () => {
  const long = "/Users/dev/Library/pnpm/store/v11/links/@/node/24.16.0/cd3758d92cd77785ba8e8ba047fb3f3fb8617bdf37abef9d97c0563dca124fa0/node_modules/node/bin/node tests/browser-navigate.test.mjs --test-timeout=0 --experimental-strip-types --some-other-very-long-flag=value";
  const shown = shortCommand(long);
  assert.ok(shown.startsWith("node tests/browser-navigate.test.mjs"), shown);
  assert.ok(shown.length <= 72, `${shown.length} chars`);
  assert.ok(shown.endsWith("…"));
  assert.equal(shortCommand("grep -rn foo ."), "grep -rn foo .");
  assert.equal(shortCommand(""), "");
});

test("the list the dialog appends is made of blocks, not paragraphs nested in the dialog's own paragraph", () => {
  const html = leftoversHtml({ processes: [{ pid: 1, command: "/usr/bin/grep -rn --exclude-dir=.git x", etime: "01:00" }], worktrees: [{ path: "/w/.worktrees/a", held: "loose", loose: 2 }] });
  assert.doesNotMatch(html, /<p[\s>]/);
  assert.match(html, /<div class="left-say">/);
  assert.match(html, /<code>grep -rn --exclude-dir=\.git x<\/code>/);
  assert.match(html, /data-wt="\/w\/\.worktrees\/a"/);
  assert.equal(worktreesThatStayed({ ok: true }), "");
});

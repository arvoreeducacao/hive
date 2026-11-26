import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

const sheet = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "assets", "composer.css"), "utf8");

await views();
const { placeOfSeat } = await app("composer-place");

test("a chat in a worktree shows the folder's name, with the whole path in the title", () => {
  const place = placeOfSeat({ where: "local", trees: [{ repo: "dev-workspaces", branch: "jonas-costa/-/composer", path: "/Users/jonas/Developer/acme-hub/.wt-composer", main: false }] });
  assert.equal(place.label, ".wt-composer");
  assert.equal(place.title, "/Users/jonas/Developer/acme-hub/.wt-composer");
  assert.equal(place.branch, "jonas-costa/-/composer");
  assert.equal(place.icon, "worktree");
});

test("a chat on the repo's own checkout says local checkout and its branch", () => {
  const place = placeOfSeat({ where: "local", trees: [{ repo: "wiki", branch: "main", path: "/hub/wiki", main: true }] });
  assert.equal(place.label, "Local checkout");
  assert.equal(place.branch, "main");
});

test("a chat with no repo under it shows no strip", () => {
  assert.equal(placeOfSeat({ where: "local", trees: [] }), null);
  assert.equal(placeOfSeat(undefined), null);
});

test("a long folder or branch stays on one line and ends in an ellipsis, with the icons kept whole", () => {
  assert.match(sheet, /\.sv \.cp-place :is\(\.cp-place-where, \.cp-place-branch\) > span \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  assert.match(sheet, /\.sv \.cp-i \{[^}]*flex: none;/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

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

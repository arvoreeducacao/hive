import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const { prLinksMoved } = await app("focus-navigation");

test("the pull requests are read again only when a chat's hand-made link changes, not when chats come and go", () => {
  assert.equal(prLinksMoved([{ name: "retry", prLink: "" }]), false, "the first look has nothing to compare with");
  assert.equal(prLinksMoved([{ name: "retry", prLink: "" }, { name: "new-chat" }]), false);
  assert.equal(prLinksMoved([{ name: "retry", prLink: "o/lead-engine#2648" }]), true, "an agent linked a pull request");
  assert.equal(prLinksMoved([{ name: "retry", prLink: "o/lead-engine#2648" }, { name: "other", prLink: "" }]), false);
  assert.equal(prLinksMoved([{ name: "retry", prLink: "" }]), true, "and unlinked it");
});

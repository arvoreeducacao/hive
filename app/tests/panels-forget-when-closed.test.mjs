import assert from "node:assert/strict";
import { test } from "node:test";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { closeShelf, openShelf, openShelfPage, shelfBack } = await app("shelf");
const thread = await app("thread");
await app("hold-numbers");
await app("themes");

globalThis.fetch = async () => ({ ok: true, text: async () => "{}", json: async () => ({ pages: [], prs: [] }) });

const el = (id) => document.getElementById(id);

const page = () => ({
  slug: "hive-mais-leve", title: "Hive mais leve", description: "RFC", owner: "artemis", label: "decided", at: 1_700_000_000_000,
  tabs: { documento: { versions: [{ n: 1, label: "decided", at: 1 }] } }
});

const shelfWith = (one) => { st.shelf = { repo: "https://github.com/acme/artifacts", pages: [one] }; st.shelfShut = new Set(); };

test("closing the shelf drops the page it was showing and the gallery behind it, and opening draws them again", () => {
  const one = page();
  shelfWith(one);
  openShelf();
  openShelfPage(one, "documento");
  assert.match(el("sh-frame").dataset.here, /slug=hive-mais-leve/);
  assert.ok(el("sh-gal").childElementCount > 0, "the gallery is drawn while the shelf is open");
  closeShelf();
  assert.equal(el("sh-frame").dataset.here, undefined, "the page frame forgets where it was");
  assert.equal(el("sh-frame").getAttribute("src"), "about:blank", "the page document dies with the panel");
  assert.equal(el("sh-gal").childElementCount, 0, "the 300 cards do not stay mounted behind a hidden panel");
  openShelf();
  assert.ok(el("sh-gal").childElementCount > 0, "opening the shelf draws the gallery from the data again");
  closeShelf();
});

test("going back from a page to the gallery drops the page frame but keeps the gallery", () => {
  const one = page();
  shelfWith(one);
  openShelf();
  openShelfPage(one, "documento");
  shelfBack();
  assert.equal(el("sh-frame").dataset.here, undefined);
  assert.ok(el("sh-gal").childElementCount > 0);
  closeShelf();
});

const pr = () => ({ key: "o/r#1", repo: "o/r", number: 1, session: "a-chat", state: "open", ci: "passed", ciDetail: "3 checks", review: "", mergeable: "mergeable", checks: [] });

test("closing the PR panel empties its three columns, and opening paints them from the data again", () => {
  st.prs = [pr()];
  st.openPr = "o/r#1";
  st.reviewChat = null;
  thread.openPrs();
  assert.ok(el("pr-items").childElementCount > 0, "the list is drawn while the panel is open");
  assert.ok(el("pr-detail").childElementCount > 0, "the detail is drawn while the panel is open");
  thread.closePrs();
  assert.equal(el("pr-items").childElementCount, 0, "the list does not stay mounted behind a hidden panel");
  assert.equal(el("pr-mid").childElementCount, 0);
  assert.equal(el("pr-detail").childElementCount, 0, "a diff of thousands of nodes does not survive the close");
  st.prs = [pr(), { ...pr(), key: "o/r#2", number: 2 }];
  thread.openPrs();
  assert.equal(el("pr-items").querySelectorAll(".pr-row, [data-key]").length >= 1, true);
  assert.ok(el("pr-items").childElementCount > 0, "a PR that arrived while the panel was closed is there when it opens");
  thread.closePrs();
});

test("a review open inside a chat keeps its columns when the panel closes, and loses them when the review ends", () => {
  st.prs = [pr()];
  st.openPr = "o/r#1";
  st.reviewChat = null;
  thread.openPrs();
  st.reviewChat = "a-chat";
  thread.closePrs();
  assert.equal(el("pr-items").childElementCount, 0);
  assert.ok(el("pr-mid").childElementCount > 0, "the middle column belongs to the chat now, not to the panel");
  assert.ok(el("pr-detail").childElementCount > 0);
  thread.exitReview();
  assert.equal(el("pr-mid").childElementCount, 0, "with the review over and the panel closed, nothing stays mounted");
  assert.equal(el("pr-detail").childElementCount, 0);
});

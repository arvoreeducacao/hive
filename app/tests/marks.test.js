import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { outboundImageMarks, inlineImagePaths } = await app("pinned-images");

const marksOf = (pairs) => new Map(pairs);

test("outbound renumbers the marks in the order they appear", () => {
  const { text, images } = outboundImageMarks(
    "first [Image #7] then [Image #2]",
    marksOf([[2, "/a.png"], [7, "/b.png"]])
  );
  assert.equal(text, "first [Image #1] then [Image #2]");
  assert.deepEqual(images, ["/b.png", "/a.png"]);
});

test("outbound appends an attached image whose mark was erased from the text", () => {
  const { text, images } = outboundImageMarks("only words", marksOf([[1, "/a.png"]]));
  assert.equal(text, "only words");
  assert.deepEqual(images, ["/a.png"]);
});

test("outbound leaves a mark nobody attached as plain text", () => {
  const { text, images } = outboundImageMarks("see [Image #9]", marksOf([]));
  assert.equal(text, "see [Image #9]");
  assert.deepEqual(images, []);
});

test("inline writes the path exactly where the mark sits", () => {
  const out = inlineImagePaths("fix [Image #3] please", marksOf([[3, "/shot.png"]]));
  assert.equal(out, "fix /shot.png please");
});

test("inline appends a path whose mark is gone so the image still travels", () => {
  const out = inlineImagePaths("no mark left", marksOf([[1, "/a.png"]]));
  assert.equal(out, "no mark left\n/a.png");
});

test("inline leaves an unknown mark untouched", () => {
  const out = inlineImagePaths("see [Image #5]", marksOf([]));
  assert.equal(out, "see [Image #5]");
});

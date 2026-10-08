import { app } from "./dom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { nameSlug } = await app("pure-helpers");

test("a name typed with accents or spaces becomes the name the server would keep", () => {
  assert.equal(nameSlug("Inês"), "ines");
  assert.equal(nameSlug("  Ana Clara "), "ana-clara");
  assert.equal(nameSlug("zé_da-silva"), "ze-da-silva");
});

test("a name made only of what the server drops comes out empty, so the form can say why", () => {
  assert.equal(nameSlug("!!!"), "");
  assert.equal(nameSlug(""), "");
});

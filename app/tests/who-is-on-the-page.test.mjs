import test from "node:test";
import assert from "node:assert/strict";
import { colourOfDev, pagesOf, panelOf, readPanel, watchersOf, PAGE_FRESH } from "../lib/team.mjs";

const at = 1789760000000;

test("the panel carries which page each seat is on, and nothing else", () => {
  const panel = panelOf([], "rafael", at, new Map(), "", "", "", true, [
    { slug: "as-telas", tab: "telas", el: "criar-turma" },
    { slug: "../etc", el: "x" },
    { slug: "sem-pedaco" }
  ]);
  assert.deepEqual(panel.pages, [
    { slug: "as-telas", tab: "telas", el: "criar-turma" },
    { slug: "sem-pedaco" }
  ]);
  const read = readPanel(JSON.stringify(panel), at);
  assert.deepEqual(read.pages, panel.pages, "what goes out is what comes back");
});

test("a panel with nobody on a page does not carry the field at all", () => {
  const panel = panelOf([], "rafael", at, new Map(), "", "", "", true, []);
  assert.ok(!("pages" in panel));
  assert.deepEqual(readPanel(JSON.stringify(panel), at).pages, []);
});

test("who is on the page: the newest word from each person, and nobody stale", () => {
  const board = [
    { dev: "mateus", at, pages: [{ slug: "as-telas", tab: "telas", el: "criar-turma" }] },
    { dev: "mateus", at: at - 1000, pages: [{ slug: "as-telas", el: "importar" }] },
    { dev: "artemis", at, pages: [{ slug: "as-telas" }] },
    { dev: "rafael", at, pages: [{ slug: "as-telas", el: "lista" }] },
    { dev: "sumiu", at: at - PAGE_FRESH - 1, pages: [{ slug: "as-telas" }] },
    { dev: "noutra", at, pages: [{ slug: "outra-pagina" }] }
  ];
  const here = watchersOf(board, "rafael", "as-telas", at);
  assert.deepEqual(here.map((one) => one.dev), ["artemis", "mateus", "rafael"], "quem sumiu e quem está noutra página ficam de fora");
  assert.equal(here.find((one) => one.dev === "mateus").el, "criar-turma", "o mais novo vence");
  assert.equal(here.at(-1).mine, true, "eu fico por último");
});

test("the colour of a person is the colour of their own face, always the same", () => {
  assert.equal(colourOfDev("mateus"), colourOfDev("mateus"));
  assert.notEqual(colourOfDev("mateus"), colourOfDev("artemis"));
  assert.match(colourOfDev("mateus"), /^#[0-9a-f]{6}$/i);
  assert.equal(colourOfDev(""), colourOfDev(""), "sem nome não quebra");
});

test("a page of somebody else never carries anything but the address", () => {
  const dirty = pagesOf([{ slug: "as-telas", tab: "telas", el: "x".repeat(400), secret: "token" }]);
  assert.deepEqual(Object.keys(dirty[0]), ["slug", "tab", "el"]);
  assert.equal(dirty[0].el.length, 120);
});

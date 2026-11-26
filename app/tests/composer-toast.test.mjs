import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const { toast } = await app("composer-toast");

const stack = () => document.getElementById("cp-toasts");
const cards = () => [...(stack()?.querySelectorAll(".cp-toast") || [])];
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const clear = () => {
  for (const one of cards()) one.querySelector(".cp-toast-x").click();
};

test("a toast lands in one polite region at the end of the page, with its title, its words and a dismiss button", () => {
  const note = toast({ title: "Could not save file", description: "Try again.", stays: 0 });
  try {
    assert.equal(document.querySelectorAll("#cp-toasts").length, 1);
    assert.equal(stack().className, "cp-toasts");
    assert.equal(stack().getAttribute("role"), "region");
    assert.equal(stack().getAttribute("aria-live"), "polite");
    assert.equal(stack().parentElement, document.body);
    const [card] = cards();
    assert.equal(card, note.el, "the handle does not point at the card it made");
    assert.equal(card.className, "cp-toast error");
    assert.equal(card.getAttribute("role"), "alert");
    assert.deepEqual([...card.children].map((one) => one.className), ["cp-toast-text", "cp-toast-x"]);
    assert.equal(card.querySelector(".cp-toast-text b").textContent, "Could not save file");
    assert.equal(card.querySelector(".cp-toast-text span").textContent, "Try again.");
    const close = card.querySelector(".cp-toast-x");
    assert.equal(close.getAttribute("type"), "button");
    assert.equal(close.getAttribute("aria-label"), "Dismiss");
    assert.ok(close.querySelector("svg.cp-ai"), "the dismiss button lost its cross");
    toast({ title: "Copying image…", tone: "info", stays: 0 });
    assert.equal(document.querySelectorAll("#cp-toasts").length, 1, "a second toast opened a second region");
    assert.equal(cards()[1].getAttribute("role"), "status");
    assert.equal(cards()[1].querySelector(".cp-toast-text span"), null, "a toast with no words grew an empty line");
  } finally {
    clear();
  }
});

test("the dismiss button takes the toast away and leaves the region in place", () => {
  toast({ title: "um", stays: 0 });
  cards()[0].querySelector(".cp-toast-x").click();
  assert.deepEqual(cards(), []);
  assert.ok(stack(), "the region left with its last toast");
});

test("only the four newest toasts stay on screen", () => {
  try {
    for (const n of [1, 2, 3, 4, 5, 6]) toast({ title: `aviso ${n}`, stays: 0 });
    assert.deepEqual(cards().map((one) => one.querySelector("b").textContent), ["aviso 3", "aviso 4", "aviso 5", "aviso 6"]);
  } finally {
    clear();
  }
});

test("an update turns a waiting note into the error, drops words it no longer has, and keeps the role it was born with", async () => {
  const note = toast({ title: "Preparing image download…", description: "um momento", tone: "info", stays: 0 });
  try {
    note.update({ tone: "error", title: "Could not save image" });
    const [card] = cards();
    assert.equal(card.className, "cp-toast error");
    assert.equal(card.getAttribute("role"), "status");
    assert.equal(card.querySelector("b").textContent, "Could not save image");
    assert.equal(card.querySelector(".cp-toast-text span"), null, "the old words stayed under the new title");
    note.update({ description: "The media action failed.", stays: 20 });
    assert.equal(card.querySelector("b").textContent, "Could not save image", "an update with no title wiped the title");
    assert.equal(card.querySelector(".cp-toast-text span").textContent, "The media action failed.");
    await wait(60);
    assert.deepEqual(cards(), [], "the toast did not leave after the time the update gave it");
  } finally {
    clear();
  }
});

test("a toast leaves on its own after the time it was given, and close takes it at once", async () => {
  toast({ title: "rápido", stays: 20 });
  const kept = toast({ title: "fica", stays: 0 });
  assert.equal(cards().length, 2);
  await wait(60);
  assert.deepEqual(cards().map((one) => one.querySelector("b").textContent), ["fica"]);
  kept.close();
  assert.deepEqual(cards(), []);
});

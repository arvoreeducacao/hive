import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { modelNamed } = await app("chat-and-panes");

const ROWS = [
  { value: "default", label: "Default (recommended)", resolved: "claude-opus-5[1m]", isDefault: true },
  { value: "opus[1m]", label: "Opus (1M context)", resolved: "claude-opus-5[1m]", isDefault: false },
  { value: "claude-fable-5-1[1m]", label: "Fable", resolved: "claude-fable-5-1", isDefault: false },
  { value: "sonnet", label: "Sonnet", resolved: "claude-sonnet-5", isDefault: false },
  { value: "haiku", label: "Haiku", resolved: "claude-haiku-4-5-20251001", isDefault: false },
];

const picked = (arg) => modelNamed(ROWS, arg)?.value ?? null;

test("a sentence that fell into the command is not a model", () => {
  assert.equal(
    picked("eu foi mo e não funcionou não, cliquei pra trocar de modelo e nada"),
    null,
    "this travelled to the driver as a model name and the seat came back up on it"
  );
});

test("the words people actually type find their row", () => {
  assert.equal(picked("fable"), "claude-fable-5-1[1m]");
  assert.equal(picked("opus"), "opus[1m]");
  assert.equal(picked("sonnet"), "sonnet");
  assert.equal(picked("haiku"), "haiku");
});

test("a name people type is not the value the row carries", () => {
  assert.notEqual(picked("fable"), "fable", "sending the typed word raw is what put a name nothing resolves into the session file");
});

test("the id a session reports finds its row too", () => {
  assert.equal(picked("claude-fable-5-1"), "claude-fable-5-1[1m]");
  assert.equal(picked("claude-opus-5[1m]"), "default", "an exact value or resolved id wins before anything is guessed");
});

test("going back to the account default is still sayable", () => {
  assert.equal(picked("default"), "default");
});

test("a bare word never lands on the default row when a real model owns it", () => {
  assert.equal(modelNamed(ROWS, "opus").isDefault, false, "\"opus\" should put the seat on Opus, not on whatever the account happens to default to");
});

test("case and stray spaces do not matter", () => {
  assert.equal(picked("  Fable  "), "claude-fable-5-1[1m]");
  assert.equal(picked("HAIKU"), "haiku");
});

test("nothing typed is nothing picked", () => {
  assert.equal(picked(""), null);
  assert.equal(picked("   "), null);
  assert.equal(picked(undefined), null);
});

test("a near miss is refused rather than guessed at", () => {
  assert.equal(picked("opuss"), null);
  assert.equal(picked("claude"), null);
  assert.equal(picked("gpt-4"), null);
});

test("an empty catalogue picks nothing instead of throwing", () => {
  assert.equal(modelNamed([], "opus"), null);
  assert.equal(modelNamed(null, "opus"), null);
});

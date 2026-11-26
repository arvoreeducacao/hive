import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

await app("hold-numbers");

test("the history window, its preview and the revive question exist as soon as the keyboard module that reads them loads, before the views boot", () => {
  assert.equal(document.getElementById("history-screens").dataset.view, "solid");
  for (const id of ["history", "hist-preview", "revive-how", "hp-revive", "hist-search", "hist-list", "hist-sync"]) {
    assert.ok(document.getElementById(id), `#${id} only exists after the views boot, and a key pressed before that breaks the keyboard`);
  }
  assert.deepEqual(["history", "hist-preview", "revive-how"].map((id) => document.getElementById(id).classList.contains("on")), [false, false, false]);
});

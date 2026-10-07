import { app } from "./dom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { wb } = await app("welcome");
const { wRun } = await app("avatars");

const STATE = { dev: "ada", hub: "", hubLooks: { ok: false, why: "that folder does not exist" }, machine: { ok: true, deps: [] }, setup: { ok: false }, server: {}, signature: {}, claudeOnServer: {} };

function answering(actionAnswer) {
  globalThis.fetch = async (url) => ({
    json: async () => {
      if (String(url).startsWith("/api/onboarding/action")) {
        if (actionAnswer instanceof Error) throw actionAnswer;
        return actionAnswer;
      }
      return STATE;
    }
  });
}

function onTheKeyStep() {
  document.getElementById("welcome").hidden = false;
  Object.assign(wb, { step: "setup", dev: "ada", hub: "", s: STATE, busy: "", setupError: "" });
}

test("a setup the server refuses says why on the key step, and the button is free again", async () => {
  onTheKeyStep();
  answering({ error: "missing dependencies: tmux" });
  await wRun("setup");
  assert.equal(wb.setupError, "missing dependencies: tmux");
  assert.equal(wb.busy, "");
  assert.equal(wb.step, "setup");
  assert.match(document.getElementById("w-stage").textContent, /missing dependencies: tmux/);
  assert.doesNotMatch(document.getElementById("w-bar-right").textContent, /working…/);
});

test("a setup that never reaches the server still says something", async () => {
  onTheKeyStep();
  answering(new Error("socket hang up"));
  await wRun("setup");
  assert.match(wb.setupError, /did not answer/);
});

test("with no hub folder picked, the config line asks for one instead of pointing at nothing", async () => {
  onTheKeyStep();
  const { pageSetup } = await app("avatars");
  assert.match(pageSetup(), /no hub folder yet/);
  assert.doesNotMatch(pageSetup(), /will point at <code><\/code>/);
});

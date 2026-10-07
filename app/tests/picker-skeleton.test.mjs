import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const { closeSeatPicker, openSeatPicker } = await app("chat-and-panes");
const st = await state();

const CODEX = [
  { value: "gpt-5.5", label: "GPT-5.5", description: "frontier", efforts: [] },
  { value: "gpt-5.5-mini", label: "GPT-5.5 mini", description: "fast", efforts: [] },
];

function seat(name) {
  document.body.classList.add("experience-next");
  const tile = document.createElement("div");
  tile.className = "tile";
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-composer"><div class="sv-pick"><span class="sv-pill sv-pill-model"></span><span class="sv-pill sv-pill-effort"></span></div><textarea></textarea></div>`;
  tile.appendChild(host);
  document.body.appendChild(tile);
  return { name, host, where: "local", agent: "claude", model: "opus", catalog: [{ value: "opus", label: "Opus", group: "", efforts: [] }] };
}

function clear() {
  for (const stray of document.querySelectorAll(".tile, .sv-menu, .sv-scrim")) stray.remove();
  document.body.classList.remove("experience-next");
}

function heldFetch() {
  const asked = [];
  const answers = [];
  globalThis.fetch = (url) => {
    asked.push(String(url));
    return new Promise((ok) => answers.push(() => ok({ json: async () => ({ models: CODEX }) })));
  };
  return { asked, answerAll: () => answers.splice(0).forEach((answer) => answer()) };
}

const settle = () => new Promise((ok) => setTimeout(ok, 0));

test("opening the model picker already asks the other providers for their models", () => {
  clear();
  st.providers = [{ id: "claude", ready: true }, { id: "codex", ready: true }];
  const net = heldFetch();
  const e = seat("skeleton-ask");
  openSeatPicker(e, "model");
  assert.deepEqual(net.asked, ["/api/catalog?agent=codex"], "the rail's other provider is fetched before anyone clicks it");
  closeSeatPicker(e, true);
  clear();
});

test("a provider still loading shows rows of halftone in place of the models", async () => {
  clear();
  st.providers = [{ id: "claude", ready: true }, { id: "codex", ready: true }];
  const net = heldFetch();
  const e = seat("skeleton-rows");
  openSeatPicker(e, "model");
  e.menu.el.querySelectorAll(".sv-rail-btn")[1].click();
  const skeleton = e.menu.el.querySelector(".sv-skeleton");
  assert.ok(skeleton, "no bare loading line that collapses the menu");
  assert.equal(skeleton.getAttribute("aria-busy"), "true");
  assert.ok(skeleton.querySelectorAll(".sv-skel-row").length >= 4);
  assert.equal(skeleton.dataset.rows, String(skeleton.querySelectorAll(".sv-skel-row").length));
  net.answerAll();
  await settle();
  assert.equal(e.menu.el.querySelector(".sv-skeleton"), null);
  assert.equal(e.menu.el.querySelectorAll(".sv-row").length, 2);
  closeSeatPicker(e, true);
  clear();
});

test("a provider loaded once opens straight on its models the next time", async () => {
  clear();
  st.providers = [{ id: "claude", ready: true }, { id: "codex", ready: true }];
  const net = heldFetch();
  const e = seat("skeleton-cache");
  openSeatPicker(e, "model");
  net.answerAll();
  await settle();
  closeSeatPicker(e, true);
  net.asked.length = 0;
  openSeatPicker(e, "model");
  e.menu.el.querySelectorAll(".sv-rail-btn")[1].click();
  assert.deepEqual(net.asked, [], "the catalog is held for the session instead of asked on every open");
  assert.equal(e.menu.el.querySelector(".sv-skeleton"), null);
  assert.equal(e.menu.el.querySelectorAll(".sv-row").length, 2);
  closeSeatPicker(e, true);
  clear();
});

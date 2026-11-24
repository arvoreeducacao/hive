import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";
import { cleanPatch, cleanPrViews } from "../lib/config.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { closePrs, openPrs, paintPrs, prsShown } = await app("thread");
const { adoptPrViews, closePrViews, prViewsOpen } = await app("pr-views");
const prSide = await import(new URL("../src/app/pr-side.js", import.meta.url).href);

const posted = [];
let refuse = false;

globalThis.fetch = async (where, how) => {
  if (String(where) === "/api/config" && how?.method === "POST") {
    const asked = JSON.parse(how.body).config;
    posted.push(asked);
    const said = refuse ? { refused: "the disk is full", config: { prViews: st.prViews } } : { config: { prViews: asked.prViews } };
    return { ok: true, json: async () => said, text: async () => JSON.stringify(said) };
  }
  const body = JSON.stringify({ prs: st.prs });
  return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
};

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((done) => setTimeout(done, 4));
};

const press = (key, options = {}) => {
  const target = document.activeElement || document.body;
  target.dispatchEvent(new dom.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
};

const menu = () => document.querySelector(".pv-menu");
const items = () => [...menu().querySelectorAll("[data-pv-item]")].map((one) => one.textContent);
const trigger = () => $("pr-views");
const pr = (over = {}) => ({ key: "o/r#1", repo: "o/r", number: 1, title: "Fix the api", state: "open", ci: "passed", review: "", mergeable: "mergeable", mine: true, ...over });

function raycast(on) {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new dom.CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
}

async function panel({ saved = [], filter = "all", query = "" } = {}) {
  closePrViews(false);
  posted.length = 0;
  refuse = false;
  st.prs = [pr(), pr({ key: "o/r#2", number: 2, title: "Broken build", ci: "failed" }), pr({ key: "x/y#3", repo: "x/y", number: 3, title: "Docs", mine: false, review: "approved" })];
  st.blocks = [];
  st.openPr = null;
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  adoptPrViews({ config: { prViews: saved } });
  raycast(true);
  openPrs();
  await settle();
  const select = $("pr-filter");
  select.value = filter;
  select.dispatchEvent(new dom.Event("change", { bubbles: true }));
  const search = $("pr-url");
  search.value = query;
  search.dispatchEvent(new dom.Event("input", { bubbles: true }));
  await settle();
}

async function done() {
  closePrViews(false);
  closePrs();
  raycast(false);
  st.prFilter = "all";
  st.prQuery = "";
  await settle();
}

const typeName = (text) => {
  const input = menu().querySelector(".pv-input");
  input.value = text;
  input.dispatchEvent(new dom.Event("input", { bubbles: true }));
  return input;
};

test("save current view asks a name, keeps the filter and the search in the config, and gives the focus back to Views", async () => {
  await panel({ filter: "failing", query: "build" });
  try {
    assert.match(trigger().textContent, /Views/);
    assert.equal(trigger().getAttribute("aria-haspopup"), "menu");
    trigger().focus();
    trigger().click();
    assert.ok(menu(), "the menu opens under the trigger");
    assert.equal(menu().getAttribute("role"), "menu");
    assert.equal(trigger().getAttribute("aria-expanded"), "true");
    assert.deepEqual(items(), ["Save current view…"]);
    assert.ok(document.activeElement === menu().querySelector('[data-pv-act="save"]'), "the first item takes the focus");
    press("Enter");
    const input = menu().querySelector(".pv-input");
    assert.equal(menu().getAttribute("role"), "dialog");
    assert.ok(document.activeElement === input, "the name field takes the focus");
    assert.equal(input.value, "CI failing", "the filter suggests the name");
    typeName("Broken builds");
    press("Enter");
    await settle();
    assert.deepEqual(posted.map((one) => one.prViews.map(({ name, filter, query }) => ({ name, filter, query }))), [[{ name: "Broken builds", filter: "failing", query: "build" }]]);
    assert.match(posted[0].prViews[0].id, /^[A-Za-z0-9_-]+$/);
    assert.equal(menu(), null);
    assert.equal(trigger().getAttribute("aria-expanded"), "false");
    assert.ok(document.activeElement === trigger(), "the focus is back on the trigger");
    assert.match(trigger().textContent, /Broken builds/);
    assert.doesNotMatch(trigger().textContent, /\*/);
  } finally {
    await done();
  }
});

test("choosing a saved view restores its filter and search, with the keyboard", async () => {
  const saved = [{ id: "a", name: "Mine", filter: "mine", query: "" }, { id: "b", name: "Broken api", filter: "failing", query: "api" }];
  await panel({ saved });
  try {
    trigger().focus();
    trigger().click();
    assert.deepEqual(items(), ["Mine", "Broken api", "Save current view…"]);
    assert.deepEqual([...menu().querySelectorAll('[role="menuitemradio"]')].map((one) => one.getAttribute("aria-checked")), ["false", "false"]);
    press("ArrowDown");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-view="b"]'));
    press(" ");
    await settle();
    assert.equal(menu(), null);
    assert.equal(st.prFilter, "failing");
    assert.equal(st.prQuery, "api");
    assert.equal($("pr-url").value, "api");
    assert.equal($("pr-filter").value, "failing");
    assert.ok(document.activeElement === trigger());
    assert.match(trigger().textContent, /Broken api/);
    trigger().click();
    assert.equal(menu().querySelector('[data-pv-view="b"]').getAttribute("aria-checked"), "true", "the chosen view is checked while nothing changed");
    assert.ok(!items().includes("Update saved view"), "nothing to update while the list matches the view");
    press("End");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-act="delete"]'));
    press("Home");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-view="a"]'));
    press("ArrowUp");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-act="delete"]'), "the arrows wrap around");
  } finally {
    await done();
  }
});

test("a change to the list marks the view modified and offers Update saved view", async () => {
  await panel({ saved: [{ id: "b", name: "Broken api", filter: "failing", query: "api" }], filter: "failing", query: "api" });
  try {
    assert.match(trigger().textContent, /Broken api/);
    const search = $("pr-url");
    search.value = "api build";
    search.dispatchEvent(new dom.Event("input", { bubbles: true }));
    await settle();
    assert.match(trigger().textContent, /\*/, "the trigger shows the view was changed");
    assert.match(trigger().getAttribute("aria-label"), /Modified view/);
    trigger().click();
    assert.deepEqual(items(), ["Broken api", "Save current view…", "Update saved view", "Rename view…", "Delete view"]);
    assert.equal(menu().querySelector('[data-pv-view="b"]').getAttribute("aria-checked"), "false");
    menu().querySelector('[data-pv-act="update"]').click();
    await settle();
    assert.deepEqual(posted.at(-1).prViews, [{ id: "b", name: "Broken api", filter: "failing", query: "api build" }]);
    assert.equal(menu(), null);
    assert.doesNotMatch(trigger().textContent, /\*/);
    assert.ok(document.activeElement === trigger());
  } finally {
    await done();
  }
});

test("rename refuses a name already taken, then renames; delete takes the view out", async () => {
  await panel({ saved: [{ id: "a", name: "Mine", filter: "mine", query: "" }, { id: "b", name: "Broken api", filter: "failing", query: "api" }], filter: "failing", query: "api" });
  try {
    trigger().click();
    menu().querySelector('[data-pv-act="rename"]').click();
    const input = menu().querySelector(".pv-input");
    assert.equal(input.value, "Broken api");
    assert.match(menu().querySelector(".pv-title").textContent, /Rename PR view/);
    typeName("mine");
    assert.equal(menu().querySelector(".pv-err").textContent, "A view with this name already exists.");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(menu().querySelector('[data-pv-act="confirm"]').disabled, true);
    typeName("   ");
    assert.equal(menu().querySelector('[data-pv-act="confirm"]').disabled, true, "an empty name cannot be saved");
    typeName("Api on fire");
    menu().querySelector('[data-pv-act="confirm"]').click();
    await settle();
    assert.deepEqual(posted.at(-1).prViews.map((one) => one.name), ["Mine", "Api on fire"]);
    assert.match(trigger().textContent, /Api on fire/);
    trigger().click();
    menu().querySelector('[data-pv-act="delete"]').click();
    await settle();
    assert.deepEqual(posted.at(-1).prViews.map((one) => one.id), ["a"]);
    assert.match(trigger().textContent, /Views/);
    assert.ok(document.activeElement === trigger());
  } finally {
    await done();
  }
});

test("Esc closes the menu or the name form and gives the focus back, without closing the PR panel; Tab leaves the menu", async () => {
  await panel({ saved: [{ id: "a", name: "Mine", filter: "mine", query: "" }] });
  try {
    trigger().focus();
    trigger().click();
    paintPrs();
    assert.ok(menu(), "a repaint of the panel leaves the menu open");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-view="a"]'), "and the focus where it was");
    press("Escape");
    assert.equal(menu(), null);
    assert.equal($("prs").hidden, false, "Esc belongs to the menu, not to the panel");
    assert.ok(document.activeElement === trigger());
    trigger().click();
    menu().querySelector('[data-pv-act="save"]').click();
    assert.ok(document.activeElement === menu().querySelector(".pv-input"));
    press("Tab");
    assert.ok(document.activeElement === menu().querySelector('[data-pv-act="cancel"]'), "Tab stays inside the name form");
    press("Escape");
    assert.equal(menu(), null);
    assert.equal(posted.length, 0, "an abandoned name saves nothing");
    assert.ok(document.activeElement === trigger());
    trigger().click();
    press("Tab");
    assert.equal(menu(), null);
    assert.ok(document.activeElement === trigger());
    trigger().click();
    document.body.dispatchEvent(new dom.MouseEvent("pointerdown", { bubbles: true }));
    assert.equal(prViewsOpen(), false, "a click outside closes it");
    assert.equal($("prs").hidden, false);
  } finally {
    await done();
  }
});

test("a save the config refuses keeps the name form open and says why", async () => {
  await panel({ filter: "mine" });
  try {
    refuse = true;
    trigger().click();
    menu().querySelector('[data-pv-act="save"]').click();
    typeName("Only mine");
    press("Enter");
    await settle();
    assert.ok(menu(), "the form stays");
    assert.equal(menu().querySelector(".pv-err").textContent, "Could not save the PR views. Try again.");
    assert.equal(st.prViews.length, 0);
  } finally {
    await done();
  }
});

test("the PR tab of the side panel has the same Views menu, and a view chosen there opens the PR list with it", async () => {
  await panel({ saved: [{ id: "b", name: "Broken builds", filter: "failing", query: "build" }] });
  closePrs();
  await settle();
  const side = document.createElement("aside");
  side.className = "tp-main";
  document.body.append(side);
  const repaint = () => {
    const { main } = prSide.prSideHtml(() => "", repaint);
    side.innerHTML = main;
  };
  try {
    prSide.openPrSide("o/r#1");
    repaint();
    const paneTrigger = () => side.querySelector("[data-pr-views]");
    assert.ok(paneTrigger(), "the PR tab shows Views");
    assert.equal(paneTrigger().dataset.act, "pr-views");
    paneTrigger().focus();
    prSide.prSideAct(paneTrigger(), repaint);
    assert.ok(menu());
    assert.equal(paneTrigger().getAttribute("aria-expanded"), "true");
    assert.deepEqual(items(), ["Broken builds", "Save current view…"]);
    press("Escape");
    assert.equal(menu(), null);
    assert.ok(document.activeElement === paneTrigger(), "Esc gives the focus back to the PR tab trigger");
    assert.equal(prSide.prSideKey(), "o/r#1", "Esc closed the menu, not the PR panel");
    prSide.prSideAct(paneTrigger(), repaint);
    menu().querySelector('[data-pv-view="b"]').click();
    await settle();
    assert.equal($("prs").hidden, false, "the PR list opens with the view");
    assert.equal(st.prFilter, "failing");
    assert.equal(st.prQuery, "build");
    assert.deepEqual(prsShown().map((one) => one.key), ["o/r#2"], "the list holds what the view asks for");
    assert.match(trigger().textContent, /Broken builds/, "the PR list's Views shows the same view");
  } finally {
    prSide.closePrSide();
    side.remove();
    await done();
  }
});

test("the config keeps well formed views and refuses the rest", () => {
  const problems = [];
  const kept = cleanPrViews([
    { id: "a", name: " Mine ", filter: "mine", query: " api " },
    { id: "b", name: "mine", filter: "all" },
    { id: "bad id!", name: "x" },
    { id: "c", name: "Odd", filter: "everything" },
    { id: "d", name: "x".repeat(81) }
  ], "config", problems);
  assert.deepEqual(kept, [{ id: "a", name: "Mine", filter: "mine", query: "api" }]);
  assert.equal(problems.length, 4);
  assert.deepEqual(cleanPrViews(undefined, "config", []), []);
  const patched = cleanPatch({ prViews: [{ id: "a", name: "Mine", filter: "mine", query: "" }] });
  assert.deepEqual(patched, { clean: { prViews: [{ id: "a", name: "Mine", filter: "mine", query: "" }] }, problems: [] });
  assert.equal(cleanPatch({ prViews: "all" }).problems.length, 1, "a save with a bad list is refused whole");
});

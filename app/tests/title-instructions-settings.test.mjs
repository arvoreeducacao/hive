import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const titles = await app("title-instructions");

const saved = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  saved.push([String(url), body]);
  return { ok: true, json: async () => ({ config: body.config }) };
};

const settle = async () => { for (let n = 0; n < 4; n++) await new Promise((done) => setTimeout(done, 0)); };
const $ = (id) => document.getElementById(id);
const options = () => [...$("f-title-scope").options].map((one) => [one.value, one.textContent]);

test("the titles section lists every project and marks the ones with instructions of their own", () => {
  st.data = { sessions: [{ name: "retry", cwd: "/h/sales", trees: [{ repo: "sales-engine" }] }, { name: "api", cwd: "/h/api-acme", trees: [] }] };
  titles.adoptTitleInstructions({ config: { titleInstructions: { all: "Curto.", projects: { leaf: "Comece pela página." } } } });
  assert.deepEqual(options(), [["", "All projects"], ["api-acme", "api-acme"], ["leaf", "leaf · own instructions"], ["sales-engine", "sales-engine"]]);
  assert.equal($("f-title-scope").value, "");
  assert.equal($("f-title-rules").value, "Curto.");
  assert.equal($("f-title-note").textContent, "The default. leaf has its own instructions.");
  assert.equal($("f-title-reset").disabled, false);
});

test("writing a project's own instructions saves them with the rest, and the default stays", async () => {
  saved.length = 0;
  titles.adoptTitleInstructions({ config: { titleInstructions: { all: "Curto.", projects: {} } } });
  const pick = $("f-title-scope");
  pick.value = "sales-engine";
  pick.dispatchEvent(new Event("change", { bubbles: true }));
  const field = $("f-title-rules");
  assert.equal(field.value, "");
  assert.equal(field.placeholder, "Empty uses the instructions for all projects.");
  assert.equal($("f-title-reset").disabled, true);
  field.value = "  Comece pelo número da branch.  ";
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  assert.deepEqual(saved, [["/api/config", { config: { titleInstructions: { all: "Curto.", projects: { "sales-engine": "Comece pelo número da branch." } } } }]]);
  assert.equal($("f-title-note").textContent, "Only for sales-engine. Empty, it uses the instructions for all projects.");
  assert.ok(options().some(([value, label]) => value === "sales-engine" && label === "sales-engine · own instructions"));
});

test("back to the default empties only the chosen scope, and an unchanged field writes nothing", async () => {
  saved.length = 0;
  titles.adoptTitleInstructions({ config: { titleInstructions: { all: "Curto.", projects: { "sales-engine": "Ticket primeiro." } } } });
  titles.pickTitleScope("sales-engine");
  $("f-title-rules").dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  assert.deepEqual(saved, []);
  $("f-title-reset").click();
  await settle();
  assert.deepEqual(saved, [["/api/config", { config: { titleInstructions: { all: "Curto.", projects: {} } } }]]);
  assert.equal($("f-title-rules").value, "");
  titles.pickTitleScope("");
  assert.equal($("f-title-rules").value, "Curto.");
  assert.equal($("f-title-note").textContent, "The default for every project.");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

const { webPaneOf, webOfSeat, webYards, sendScreenPrint, sendScreenReview } = await app("chat-and-panes");

let shots = 0;
const calls = [];

function seatWithAPage(name, url = "http://localhost:3000/") {
  const host = document.createElement("div");
  const pane = webPaneOf(host, { name });
  const yard = document.createElement("div");
  const frame = document.createElement("webview");
  frame.dataset.id = "t1";
  frame.dataset.here = url;
  frame.capturePage = async () => { shots++; return { toDataURL: () => "data:image/png;base64,PRINT" }; };
  yard.appendChild(frame);
  webOfSeat.set(name, { tabs: [{ id: "t1", url }], active: 0 });
  webYards.set(name, yard);
  return pane;
}

function catchFetch() {
  calls.length = 0;
  shots = 0;
  const was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
  return () => { globalThis.fetch = was; };
}

test("the pane has a print and a review button next to the picker", () => {
  const pane = seatWithAPage("pane-seat");
  const row = [...pane.querySelectorAll(".web-url button")].map((b) => b.className);
  assert.ok(row.includes("web-print"), "the print button is in the address row");
  assert.ok(row.includes("web-review"), "the review button is in the address row");
  assert.equal(row.indexOf("web-review"), row.indexOf("web-pick") - 1);
});

test("print captures the whole viewport and posts it", async () => {
  const restore = catchFetch();
  const pane = seatWithAPage("print-seat", "http://localhost:5173/home");
  pane.querySelector(".web-print").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 5));
  restore();
  assert.equal(shots, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/browser/print");
  assert.equal(calls[0].body.name, "print-seat");
  assert.equal(calls[0].body.url, "http://localhost:5173/home");
  assert.equal(calls[0].body.crop, "data:image/png;base64,PRINT");
});

test("review sends the current url without a crop", async () => {
  const restore = catchFetch();
  seatWithAPage("review-seat", "http://localhost:5173/about");
  sendScreenReview("review-seat");
  await new Promise((done) => setTimeout(done, 5));
  restore();
  assert.equal(shots, 0, "review does not screenshot");
  assert.deepEqual(calls.map((c) => c.url), ["/api/browser/review"]);
  assert.equal(calls[0].body.url, "http://localhost:5173/about");
  assert.ok(!("crop" in calls[0].body));
});

test("a seat with no page open prints nothing", async () => {
  const restore = catchFetch();
  webOfSeat.delete("mute-seat");
  await sendScreenPrint("mute-seat");
  sendScreenReview("mute-seat");
  restore();
  assert.equal(calls.length, 0);
});

test("the print route saves the crop and injects a turn, honoring the pending rule", () => {
  const r = cut(browserRoutes, '"/api/browser/print"', '"/api/browser/review"', "routes/browser.mjs");
  assert.match(r, /\[hive\] print do navegador:/);
  assert.match(r, /const submit = seat && seat\.state !== "needs"/);
});

test("the review route asks for the two viewports and the checks, no page text trusted", () => {
  const r = cut(browserRoutes, '"/api/browser/review"', '"/api/browser/reference"', "routes/browser.mjs");
  assert.match(r, /revisar esta tela:/);
  assert.match(r, /390 e 1440/);
  assert.match(r, /if \(!pageUrl\) return json/);
});

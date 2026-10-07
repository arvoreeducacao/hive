import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app } from "./dom.mjs";

const { anchorToPill, closeSeatPicker, insideFocusStroke, openSeatPicker } = await app("chat-and-panes");

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

function pillAt(left, top) {
  const pill = document.createElement("span");
  pill.getBoundingClientRect = () => rect(left, top, 80, 26);
  return pill;
}

test("the model picker opens over its pill, clear of it by the shadow's reach", () => {
  const menu = document.createElement("div");
  anchorToPill(menu, pillAt(645, 869), rect(340, 80, 1630, 1190), rect(620, 860, 1340, 140));
  assert.equal(menu.style.width, "400px");
  assert.equal(menu.style.left, "25px", "the menu starts where the pill starts, not at the composer's corner");
  assert.equal(menu.style.bottom, "151px", "the halftone hangs 7px below the menu, so 20px keeps it off the pill");
});

test("a pill near the seat's right edge pushes the picker back inside it", () => {
  const menu = document.createElement("div");
  anchorToPill(menu, pillAt(560, 500), rect(200, 0, 420, 600), rect(210, 480, 400, 110));
  assert.equal(menu.style.width, "400px");
  assert.equal(menu.style.left, "2px", "the right edge stops 8px short of the seat");
});

test("a seat narrower than the picker gives it the seat minus the margins", () => {
  const menu = document.createElement("div");
  anchorToPill(menu, pillAt(20, 500), rect(0, 0, 300, 600), rect(10, 480, 280, 110));
  assert.equal(menu.style.width, "284px");
  assert.equal(menu.style.left, "-2px");
});


test("a browser flush with the seat edges leaves the focus stroke showing", () => {
  const seat = document.createElement("div");
  seat.className = "tile";
  const stage = document.createElement("div");
  seat.appendChild(stage);
  seat.getBoundingClientRect = () => rect(340, 80, 1630, 1190);
  stage.getBoundingClientRect = () => rect(1200, 80, 770, 1190);
  assert.deepEqual(insideFocusStroke(stage), { left: 1200, top: 82, width: 768, height: 1186 });
});

test("a browser away from the seat edges keeps its own box", () => {
  const seat = document.createElement("div");
  seat.className = "tile";
  const stage = document.createElement("div");
  seat.appendChild(stage);
  seat.getBoundingClientRect = () => rect(0, 0, 1000, 800);
  stage.getBoundingClientRect = () => rect(400, 100, 500, 600);
  assert.deepEqual(insideFocusStroke(stage), { left: 400, top: 100, width: 500, height: 600 });
});

test("a seat on a fractional pixel never lets the browser cover the stroke", () => {
  const seat = document.createElement("div");
  seat.className = "tile";
  const stage = document.createElement("div");
  seat.appendChild(stage);
  seat.getBoundingClientRect = () => rect(340.5, 80.4, 1000.3, 800.5);
  stage.getBoundingClientRect = () => rect(600.2, 80.4, 740.6, 800.5);
  const box = insideFocusStroke(stage);
  assert.ok(box.left + box.width <= 340.5 + 1000.3 - 2, "the right edge stays clear of the 2px stroke");
  assert.ok(box.top >= 80.4 + 2 && box.top + box.height <= 80.4 + 800.5 - 2, "top and bottom stay clear too");
  assert.deepEqual(box, { left: 601, top: 83, width: 737, height: 795 });
});

test("the seat's own border counts too: the stroke is drawn inside it", () => {
  const seat = document.createElement("div");
  seat.className = "tile";
  seat.style.border = "1px solid";
  const stage = document.createElement("div");
  seat.appendChild(stage);
  document.body.appendChild(seat);
  seat.getBoundingClientRect = () => rect(244, 88, 1337, 737);
  stage.getBoundingClientRect = () => rect(1049.4375, 174, 530.5625, 650);
  assert.deepEqual(insideFocusStroke(stage), { left: 1050, top: 174, width: 528, height: 648 }, "right and bottom stop at 1578 and 822, where the 2px stroke inside the 1px border begins");
  seat.remove();
});

test("in the new Hive the picker dims its seat and the dimming leaves with it", () => {
  document.body.classList.add("experience-next");
  const tile = document.createElement("div");
  tile.className = "tile";
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-composer"><span class="sv-pill sv-pill-model"></span><textarea></textarea></div>`;
  tile.appendChild(host);
  document.body.appendChild(tile);
  const e = { name: "anchor-scrim", host, catalog: [{ value: "opus", label: "Opus", group: "" }] };
  openSeatPicker(e, "model");
  assert.equal(tile.querySelectorAll(":scope > .sv-scrim").length, 1, "the whole seat dims, not only the chat column");
  assert.ok(e.menu.el.classList.contains("anchored"));
  assert.equal(e.menu.el.querySelector(".mf"), null, "the picker carries no key legend in the new Hive");
  closeSeatPicker(e);
  assert.equal(document.querySelectorAll(".sv-scrim").length, 0);
  tile.remove();
  document.body.classList.remove("experience-next");
});

test("in the new Hive the effort picker opens over its pill as a volume bar", () => {
  document.body.classList.add("experience-next");
  const tile = document.createElement("div");
  tile.className = "tile";
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-composer"><span class="sv-pill sv-pill-effort"></span><textarea></textarea></div>`;
  tile.appendChild(host);
  document.body.appendChild(tile);
  const e = { name: "anchor-effort", host, catalog: [{ value: "opus", label: "Opus", group: "", efforts: [{ value: "high", label: "High" }] }] };
  openSeatPicker(e, "effort");
  assert.ok(e.menu.el.classList.contains("anchored"));
  assert.ok(e.menu.el.classList.contains("volume"));
  assert.equal(tile.querySelectorAll(":scope > .sv-scrim").length, 1);
  closeSeatPicker(e, true);
  tile.remove();
  document.body.classList.remove("experience-next");
});

test("a dimmed seat drops its halftone shadow: it went behind what opened over it", () => {
  const css = readFileSync(new URL("../assets/experience.css", import.meta.url), "utf8");
  assert.match(css, /body\.experience-next :is\(#canvas > \.tile, \.tile\.open\)::after \{[^}]*var\(--reticle\)/, "the seat casts the halftone");
  assert.match(css, /body\.experience-next :is\(#canvas > \.tile, \.tile\.open\):has\(> \.sv-scrim\)::after \{ display: none; \}/);
  assert.ok(css.indexOf(":has(> .sv-scrim)::after") > css.indexOf(":is(#canvas > .tile, .tile.open)::after {"), "the switch-off comes after the shadow it turns off");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app.html"), "utf8");
const main = readFileSync(join(here, "..", "main.js"), "utf8");
const preload = readFileSync(join(here, "..", "main", "preload.js"), "utf8");

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Hive/1.0 Electron/38.0.0", configurable: true });

const st = await state();
await views();
const panes = await app("chat-and-panes");
const { DRIVING_LINGER, addWebTab, bornWebFrame, drivingNow, markDriving, openPopupTab, paintWebOfChat, paintYards, stepWeb, webPaneOf, webStateOf, yardOf } = panes;

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

const laterBy = (ms, run) => {
  const was = Date.now;
  Date.now = () => was.call(Date) + ms;
  try { return run(); } finally { Date.now = was; }
};

test("a page the seat is driving wears a mark the person cannot miss", () => {
  assert.match(page, /\.yard-glow \{[^}]*box-shadow: inset 0 0 0 2px var\(--accent\)/);
  assert.match(page, /#webyard \.yard\.driving \.yard-glow \{ display: block; \}/);
  assert.match(page, /#webyard \.yard\.driving \.yard-mark \{ display: inline-flex; \}/);
  const yard = yardOf("glow");
  assert.equal(yard.parentElement, document.getElementById("webyard"), "the yard hangs in the page, not in the air");
  assert.ok(yard.querySelector(".yard-glow"), "the mark is built with the yard, not with the page");
  const said = yard.querySelector(".yard-mark");
  assert.ok(said, "a glow alone does not say who is driving");
  assert.match(said.textContent, /\S/);
  assert.equal(yardOf("glow"), yard, "asking twice does not stack yards");
});

test("the mark goes up when an op is sent and only drops after the last one lands", () => {
  assert.equal(drivingNow("two"), false);
  markDriving("two", 1);
  markDriving("two", 1);
  assert.equal(drivingNow("two"), true);
  markDriving("two", -1);
  assert.equal(drivingNow("two"), true, "two ops at once are one mark, not two");
  markDriving("two", -1);
  assert.equal(drivingNow("two"), true, "a burst of fast ops would blink; the mark lingers");
  assert.equal(laterBy(DRIVING_LINGER + 500, () => drivingNow("two")), false, "once the linger is spent the mark goes down");
  markDriving("two", -1);
  assert.equal(laterBy(DRIVING_LINGER + 500, () => drivingNow("two")), false, "an answer nobody asked for never lights the mark");
});

test("the yard wears the mark for as long as the seat is driving", () => {
  st.open = "";
  st.webChat = "";
  st.data = { sessions: [{ name: "shown" }] };
  const web = webStateOf("shown");
  if (!web.tabs.length) addWebTab("shown");
  web.tabs[0].url = "https://example.com";
  markDriving("shown", 1);
  paintYards();
  assert.equal(yardOf("shown").classList.contains("driving"), true);
  markDriving("shown", -1);
  assert.equal(laterBy(DRIVING_LINGER + 500, () => { paintYards(); return yardOf("shown").classList.contains("driving"); }), false);
});

test("a link that asks for a new tab gets one here, instead of being swallowed", () => {
  const yard = yardOf("popup");
  const frame = bornWebFrame(yard, "popup", { id: "t-popup" });
  assert.equal(frame.getAttribute("allowpopups"), "", "without allowpopups chromium drops the popup before any handler sees it");
  const handler = cut(main, 'window_.webContents.on("did-attach-webview"', "window_.on(\"resize\"", "main.js");
  assert.match(handler, /guest\.session === seatBrowser && \/\^https\?:\/\.test\(url\)/);
  assert.match(handler, /window_\.webContents\.send\("seat-browser:popup", guest\.id, url\)/);
  assert.match(handler, /return \{ action: "deny" \}/, "the tab is ours to open — no native window ever opens");
  assert.match(preload, /onPopup: \(heard\) => ipcRenderer\.on\("seat-browser:popup"/);
});

test("the new tab lands on the seat the link came from, and falls out to the browser when full", () => {
  const outside = [];
  st.data = { sessions: [{ name: "asked" }], spawning: [], archived: [], pod: {} };
  window.seatBrowser = { openExternal: (url) => outside.push(url) };
  const yard = yardOf("asked");
  const frame = bornWebFrame(yard, "asked", { id: "t-asked" });
  frame.getWebContentsId = () => 77;
  const web = webStateOf("asked");
  web.tabs.length = 0;
  openPopupTab(77, "javascript:alert(1)");
  assert.equal(web.tabs.length, 0, "a page could ask for anything; only http and https are opened");
  openPopupTab(77, "https://opened.example");
  assert.equal(web.tabs[web.tabs.length - 1].url, "https://opened.example", "the seat is found by the page that asked, not by whoever is on screen");
  assert.deepEqual(outside, []);
  while (addWebTab("asked"));
  openPopupTab(77, "https://spilled.example");
  assert.deepEqual(outside, ["https://spilled.example"], "a full seat hands the link to the real browser");
  openPopupTab(999, "https://nobody.example");
  assert.deepEqual(outside, ["https://spilled.example", "https://nobody.example"], "a page from no yard of ours goes out too");
  assert.match(main, /ipcMain\.handle\("seat-browser:external"/);
  delete window.seatBrowser;
});

test("the pane has back, forward and reload, and they go dead when there is nowhere to go", () => {
  const host = document.createElement("div");
  const bar = webPaneOf(host, { name: "bar" }).querySelector(".web-url");
  assert.ok(bar.innerHTML.indexOf('class="web-step web-back"') < bar.innerHTML.indexOf("<input"), "the arrows come before the address, like every browser");
  assert.ok(bar.querySelector(".web-step.web-fwd"));
  assert.ok(bar.querySelector(".web-step.web-again"));

  st.open = "arrows";
  st.webChat = "arrows";
  const el = document.createElement("div");
  const web = webStateOf("arrows");
  web.tabs.length = 0;
  paintWebOfChat(el, { name: "arrows" });
  const pane = el.querySelector(".art.web");
  assert.equal(pane.querySelector(".web-back").disabled, true, "with no page open there is nowhere to go back to");
  assert.equal(pane.querySelector(".web-fwd").disabled, true);
  assert.equal(pane.querySelector(".web-again").disabled, true, "and nothing to reload");

  const yard = yardOf("arrows");
  const tab = web.tabs[web.active];
  tab.url = "https://example.com";
  const frame = bornWebFrame(yard, "arrows", tab);
  frame.dataset.here = tab.url;
  let went = "";
  Object.assign(frame, { canGoBack: () => true, canGoForward: () => false, goBack: () => { went = "back"; }, goForward: () => { went = "forward"; }, reload: () => { went = "reload"; } });
  paintWebOfChat(el, { name: "arrows" });
  assert.equal(pane.querySelector(".web-back").disabled, false);
  assert.equal(pane.querySelector(".web-fwd").disabled, true, "an arrow with nowhere to go is dead");
  assert.equal(pane.querySelector(".web-again").disabled, false);
  stepWeb("arrows", "back");
  assert.equal(went, "back");
  stepWeb("arrows", "forward");
  assert.equal(went, "back", "forward with no history does nothing");
  stepWeb("arrows", "reload");
  assert.equal(went, "reload");
  assert.equal(panes.webTouch.has("arrows"), true, "the person driving keeps the page awake too");
});

test("a picker that dims a seat dims the page that seat has open, and only that one", () => {
  const { closeSeatPicker, dimYardsUnderScrims } = panes;
  const css = readFileSync(new URL("../assets/experience.css", import.meta.url), "utf8");
  assert.match(css, /body\.experience-next #webyard \.yard\.dimmed::after \{[^}]*inset: 0;[^}]*background: rgba\(8, 8, 8, \.62\);/, "the page wears the same shade as the seat");
  const mine = yardOf("dim-mine");
  const other = yardOf("dim-other");
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.name = "dim-mine";
  document.body.appendChild(tile);
  const scrim = document.createElement("div");
  scrim.className = "sv-scrim";
  tile.appendChild(scrim);
  dimYardsUnderScrims();
  assert.ok(mine.classList.contains("dimmed"), "the seat's own page goes dark with it");
  assert.ok(!other.classList.contains("dimmed"), "a page of another seat stays lit");
  closeSeatPicker(null);
  assert.ok(!mine.classList.contains("dimmed"), "closing the picker lights the page again");
  tile.remove();
});

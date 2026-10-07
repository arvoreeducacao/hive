import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app.html"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Electron/30.0.0 hive", configurable: true });

const st = await state();
await views();
const web = await app("chat-and-panes");

const fresh = (name) => {
  web.webOfSeat.delete(name);
  web.drivenTab.delete(name);
  web.shutByThePerson.delete(name);
  web.wokeForAShot.delete(name);
  st.webChat = null;
  st.data = { sessions: [{ name, state: "idle" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  return web.webStateOf(name);
};

test("the seat drives a tab of its own, and the person keeps the one she picked", () => {
  const own = fresh("ada");
  web.landSeatOn("ada", "http://localhost:3000/writing");
  const seatTab = web.tabOfSeatDriving("ada");
  assert.ok(seatTab, "the seat did not take a tab of its own");
  assert.equal(seatTab.url, "http://localhost:3000/writing");

  const mine = web.addWebTab("ada");
  mine.url = "http://localhost:3000/library";
  assert.equal(own.tabs[own.active].id, mine.id, "the person's click did not move the person's tab");

  web.landSeatOn("ada", "http://localhost:3000/writing/books");
  assert.equal(own.tabs[own.active].id, mine.id, "the seat moved the tab the person was reading");
  assert.equal(web.tabOfSeatDriving("ada").url, "http://localhost:3000/writing/books");
  assert.equal(web.seatSeesItsOwnTab("ada"), false);
});

test("the first page of an empty chat lands in front, because there is nothing to take the person from", () => {
  const own = fresh("bia");
  web.landSeatOn("bia", "http://localhost:3000/writing");
  assert.equal(own.tabs[own.active].id, web.tabOfSeatDriving("bia").id, "an empty chat should show the page the seat opened");
  assert.equal(web.seatSeesItsOwnTab("bia"), true);
});

test("one of the five tabs is kept for the seat, so a full browser never eats the person's tab", () => {
  const own = fresh("cleo");
  for (let i = 0; i < web.WEB_TAB_CAP - 1; i++) web.addWebTab("cleo").url = `http://localhost:3000/p${i}`;
  assert.equal(web.addWebTab("cleo"), null, "the person went past her share of the cap");
  const seen = own.tabs[own.active].id;
  web.landSeatOn("cleo", "http://localhost:3000/writing");
  const seatTab = web.tabOfSeatDriving("cleo");
  assert.ok(seatTab, "the seat had no slot left and took nothing");
  assert.notEqual(seatTab.id, seen, "the seat adopted the tab the person was looking at");
  assert.equal(own.tabs[own.active].id, seen, "the person's tab moved");
  assert.equal(web.webTabsIn(own).length, web.WEB_TAB_CAP);
});

test("closing the seat's tab is allowed, and the next tool says so instead of failing for the wrong reason", () => {
  fresh("duda");
  web.landSeatOn("duda", "http://localhost:3000/writing");
  const seatTab = web.tabOfSeatDriving("duda");
  web.closeWebTab("duda", seatTab.id);
  assert.equal(web.tabOfSeatDriving("duda"), null, "the seat still points at a tab that is gone");
  const said = web.noPageOf("duda");
  assert.match(said, /the person closed the tab/);
  assert.match(said, /localhost:3000\/writing/);
  assert.equal(web.noPageOf("duda"), web.NO_PAGE, "the reason is told once, not forever");
});

test("the shot wakes the seat's tab behind the person's, and puts it back to sleep", async () => {
  const own = fresh("eva");
  web.landSeatOn("eva", "http://localhost:3000/writing");
  const mine = web.addWebTab("eva");
  mine.url = "http://localhost:3000/library";

  assert.equal(web.wakeDrivenTab("eva"), true, "the tab the seat drives was not woken for the shot");
  assert.equal(web.wokeForAShot.get("eva"), web.tabOfSeatDriving("eva").id);
  assert.equal(own.tabs[own.active].id, mine.id, "waking the tab moved what the person sees");
  web.letDrivenTabSleep("eva");
  assert.equal(web.wokeForAShot.has("eva"), false);

  own.active = own.tabs.indexOf(web.tabOfSeatDriving("eva"));
  assert.equal(web.wakeDrivenTab("eva"), false, "a tab already in front does not need waking");
});

test("a tab that is awake only for the shot is drawn, not hidden", () => {
  assert.match(page, /#webyard webview\.off \{ display: none; \}/);
  assert.match(page, /#webyard webview\.behind \{ position: absolute;[^}]*opacity: 0;[^}]*\}/, "the woken tab must keep a live surface, invisible to the person");
  const paint = cut(panes, "function paintYards() {", "\nfunction placeYard", "chat-and-panes.js");
  assert.match(paint, /frame\.classList\.toggle\("behind", !upFront && t\.id === woke\)/);
  assert.match(paint, /frame\.classList\.toggle\("off", !upFront && t\.id !== woke\)/);
});

test("the shot waits for a frame, and waits longer when the app is not in front", () => {
  const fn = cut(panes, "async function shotReady(woke)", "\nconst FRAME_WAIT", "chat-and-panes.js");
  assert.match(fn, /document\.hasFocus\(\) \? WAKE_SETTLE : WAKE_SETTLE_BLURRED/);
  const paint = cut(panes, "const nextPaint =", "const WAKE_SETTLE =", "chat-and-panes.js");
  assert.match(paint, /setTimeout\(finish, 60\)/, "a minimised window never fires requestAnimationFrame");
  const shot = cut(panes, "async function runBrowserShot(name, id) {", "\n}\n", "chat-and-panes.js");
  assert.match(shot, /const woke = wakeDrivenTab\(name\)/);
  assert.match(shot, /letDrivenTabSleep\(name\)/);
  assert.match(shot, /await shotReady\(woke\)/);
});

test("the mark of use lives on the tab, and the glow only when the person is on that tab", () => {
  const paint = cut(panes, "function paintYards() {", "\nfunction placeYard", "chat-and-panes.js");
  assert.match(paint, /yard\.classList\.toggle\("driving", drivingNow\(name\) && seatActsWhereThePersonLooks\(name\)\)/);
  assert.equal(web.seatActsWhereThePersonLooks("nobody"), false, "a chat with no tab open wears no glow");
  assert.match(page, /\.web-tab u \{[^}]*background: var\(--accent\)/);
  assert.match(page, /\.web-tab\.busy u \{[^}]*animation: yardPulse/);
  const bar = cut(panes, "const tabsBox = pane.querySelector(\".web-tabs\");", "if (tabsBox.dataset.h !== h)", "chat-and-panes.js");
  assert.match(bar, /t\.id === mine \? " driven" : ""/);
  assert.match(bar, /t\.id === mine && busy \? " busy" : ""/);
});

test("the tools stop promising a tab the seat and the person share", () => {
  const navigate = cut(mcp, 'name: "browser_navigate"', "inputSchema", "peer-tools.mjs");
  assert.doesNotMatch(navigate, /a tab you and the person share/);
  assert.match(navigate, /never steals the tab the person is reading/);
  const tabs = cut(mcp, 'name: "browser_tabs"', "inputSchema", "peer-tools.mjs");
  assert.match(tabs, /which tab is yours and which one the person is looking at/);
  assert.match(tabs, /without moving what the person sees/);
});

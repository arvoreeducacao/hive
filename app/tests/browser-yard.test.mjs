import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, dom, state } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app.html"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const source = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Electron/30.0.0 hive", configurable: true });

const st = await state();
const { $ } = await app("core");
const web = await app("chat-and-panes");

const seats = (names) => {
  st.data = { sessions: names.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.webChat = null;
};

const clear = () => {
  for (const [name, yard] of [...web.webYards]) { yard.remove(); web.webYards.delete(name); }
  for (const name of [...web.webOfSeat.keys()]) web.webOfSeat.delete(name);
  web.webTouch.clear();
  $("webyard").innerHTML = "";
};

const withPage = (name, url) => {
  const own = web.webStateOf(name);
  const tab = web.addWebTab(name);
  tab.url = url;
  web.touchWeb(name);
  return { own, tab };
};

test("the pages live outside the tiles, in a yard the repaint never touches", () => {
  clear();
  const host = $("webyard");
  assert.equal(host.getAttribute("aria-hidden"), "true");
  assert.ok(host.hasAttribute("data-no-t"));
  const yard = web.yardOf("ada");
  assert.equal(yard.parentElement, host);
  assert.equal(web.yardOf("ada"), yard, "a second look hands back the same yard");
  const paintWeb = cut(source, "function paintWebOfChat(el, s) {", "\nfunction paintArtifactChrome", "chat-and-panes.js");
  assert.ok(!paintWeb.includes("appendChild(frame)"), "no page is ever parented to the pane stage");
  clear();
});

test("the yard is painted from the fleet, not from the open tile", () => {
  clear();
  seats(["ada", "bea"]);
  withPage("ada", "https://example.com/one");
  withPage("bea", "https://example.com/two");
  web.paintYards();
  assert.deepEqual([...web.webYards.keys()], ["ada", "bea"]);
  assert.equal(st.webChat, null, "having a page does not depend on the pane being open");
  seats(["ada"]);
  web.paintYards();
  assert.deepEqual([...web.webYards.keys()], ["ada"], "a seat that died takes its pages with it");
  assert.equal($("webyard").querySelectorAll('.yard[data-name="bea"]').length, 0);
  clear();
});

test("a page is never moved between parents — moving a webview reloads it", () => {
  clear();
  seats(["ada"]);
  const { tab } = withPage("ada", "https://example.com/one");
  web.paintYards();
  const yard = web.webYards.get("ada");
  const frame = yard.querySelector(`webview[data-id="${tab.id}"]`);
  assert.equal(frame.parentElement, yard);
  assert.equal(frame.dataset.here, "https://example.com/one");
  assert.equal(web.placeYard("ada", yard), false, "with no pane on screen the yard stays off stage");
  assert.equal(yard.classList.contains("onstage"), false);
  assert.equal(frame.parentElement, yard, "showing a page is geometry, never adoption");
  const place = cut(source, "function placeYard(name, yard) {", "\n}\n", "chat-and-panes.js");
  assert.ok(!place.includes("appendChild"), "showing a page is geometry, never adoption");
  assert.match(place, /getBoundingClientRect\(\)/);
  clear();
});

test("the yard keeps painting while it is out of sight, which is what a screenshot needs", () => {
  const css = cut(page, "#webyard .yard {", "\n", "app.html");
  assert.match(css, /opacity: 0/, "opacity keeps the compositor alive; display:none and visibility:hidden do not");
  assert.match(css, /pointer-events: none/);
  assert.ok(!/#webyard \.yard \{[^}]*display: none/.test(page), "a hidden page cannot be captured");
  assert.match(page, /#webyard \.yard\.onstage \{ opacity: 1; pointer-events: auto; z-index: 3; \}/);
});

test("an op with no page says what to do instead of blaming the closed pane", () => {
  assert.equal(web.NO_PAGE, "this seat has no page open — browser_navigate first, the pane does not have to be open");
  assert.ok(!source.includes("the browser pane is not open on this seat"), "the old excuse is gone");
});

test("an op waits for the page it was aimed at, so navigate and shoot can arrive together", async () => {
  clear();
  seats(["ada"]);
  assert.equal(await web.pageOfSeat("ada", 200), null, "an op on a seat with no page gives up");
  const { tab } = withPage("ada", "https://example.com/one");
  web.paintYards();
  const frame = web.webYards.get("ada").querySelector(`webview[data-id="${tab.id}"]`);
  assert.equal(await web.pageOfSeat("ada", 200), null, "a webview that cannot run script yet is not a page — the op would throw on it");
  frame.executeJavaScript = async () => null;
  assert.equal(await web.pageOfSeat("ada", 200), frame, "a page that finished loading is handed over at once");
  frame.isLoading = () => true;
  const waiting = web.pageOfSeat("ada", 3000);
  frame.dispatchEvent(new dom.Event("did-stop-loading"));
  assert.equal(await waiting, frame, "an op that arrived while the page was loading waits for it");
  clear();
});

test("the card says which page the seat has open, and the chip opens the pane", () => {
  clear();
  seats(["ada"]);
  const el = document.createElement("article");
  el.dataset.name = "ada";
  el.innerHTML = '<button class="t-page" hidden><span></span></button>';
  document.body.append(el);
  const chip = el.querySelector(".t-page");
  web.paintWebChipOfChat(el, { name: "ada" });
  assert.equal(chip.hidden, true, "a seat with no page shows no chip");
  const { own, tab } = withPage("ada", "https://example.com/one");
  web.paintWebChipOfChat(el, { name: "ada" });
  assert.equal(chip.hidden, false);
  assert.equal(chip.querySelector("span").textContent, "example.com");
  tab.url = "file:///tmp/desenho/telas.html";
  web.paintWebChipOfChat(el, { name: "ada" });
  assert.equal(chip.querySelector("span").textContent, "telas.html", "a file:// page has no host — the chip shows its name");
  own.asleep = true;
  web.paintWebChipOfChat(el, { name: "ada" });
  assert.match(chip.querySelector("span").textContent, /asleep$/);
  own.asleep = false;
  chip.click();
  assert.equal(st.webChat, "ada", "the chip opens the pane");
  st.webChat = null;
  el.remove();
  assert.match(readFileSync(join(here, "..", "src", "tile.jsx"), "utf8"), /<button class="t-page" hidden/, "the tile draws no chip for the chip painter to find");
  clear();
});

test("the tools stop promising the pane has to be open", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  assert.ok(!/The pane has to be open/.test(tools), "no tool may still ask for an open pane");
});

test("a page nobody is watching dozes off on the same clock the seat does", () => {
  clear();
  assert.equal(web.PAGE_SLEEP_AFTER, 30 * 60 * 1000);
  web.touchWeb("ada");
  assert.equal(web.pageDozing("ada", false), false, "a page just touched is awake");
  assert.equal(web.pageDozing("ada", true), false, "a page on screen never dozes");
  web.webTouch.set("ada", Date.now() - web.PAGE_SLEEP_AFTER - 1000);
  assert.equal(web.pageDozing("ada", false), true);
  assert.equal(web.pageDozing("ada", true), false, "a page on screen never dozes");
  seats(["ada"]);
  const { own, tab } = withPage("ada", "https://example.com/one");
  web.paintYards();
  const yard = web.webYards.get("ada");
  assert.equal(yard.querySelectorAll("webview").length, 1);
  web.webTouch.set("ada", Date.now() - web.PAGE_SLEEP_AFTER - 1000);
  web.paintYards();
  assert.equal(own.asleep, true);
  assert.equal(yard.querySelectorAll("webview").length, 0, "dozing frees the page, the tab stays");
  assert.deepEqual(own.tabs.map((t) => t.id), [tab.id]);
  clear();
});

test("any op wakes the page before it is asked anything", () => {
  clear();
  st.data = { sessions: [{ name: "ada", state: "idle", browser: { want: { seq: 1, url: "https://example.com/one" }, ops: [] } }], spawning: [], archived: [], pod: { up: false, name: "" } };
  web.driveBrowsers();
  assert.ok(web.webTouch.get("ada") > 0, "the page was never woken");
  assert.equal(web.webStateOf("ada").tabs[0].url, "https://example.com/one");
  clear();
});

test("the sleep the pages keep is the sleep the seats keep", async () => {
  const { SLEEP_AFTER_MS } = await import("../../server/sleep.mjs");
  assert.equal(web.PAGE_SLEEP_AFTER, SLEEP_AFTER_MS, "one clock for the seat and for its pages");
});

test("the address bar follows the page, even when the page navigates itself", () => {
  clear();
  seats(["ada"]);
  const { tab } = withPage("ada", "https://example.com/one");
  web.paintYards();
  const frame = web.webYards.get("ada").querySelector(`webview[data-id="${tab.id}"]`);
  const went = new dom.Event("did-navigate");
  went.url = "https://example.com/two";
  frame.dispatchEvent(went);
  assert.equal(tab.url, "https://example.com/two");
  assert.equal(frame.dataset.here, "https://example.com/two", "or the next paint would drag the page back");
  tab.kind = "artifact";
  const again = new dom.Event("did-navigate");
  again.url = "https://example.com/three";
  frame.dispatchEvent(again);
  assert.equal(tab.url, "https://example.com/two", "an artifact tab is addressed by slug, not by url");
  clear();
});

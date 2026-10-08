import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "..", "main.js"), "utf8");
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const shelfSource = readFileSync(join(here, "..", "src", "app", "shelf.js"), "utf8");
const relay = createRequire(import.meta.url)("../main/relay.js");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Electron/30.0.0 hive", configurable: true });

const st = await state();
await views();
const web = await app("chat-and-panes");

const fresh = (name) => {
  for (const key of [...web.webOfSeat.keys()]) web.webOfSeat.delete(name);
  web.webOfSeat.delete(name);
  st.webChat = null;
  st.shelfWanted = false;
  st.published = [];
  st.data = { sessions: [{ name, state: "idle" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  return web.webStateOf(name);
};

test("the shelf answers one route, in GET, and refuses every other shape", () => {
  assert.equal(relay.shelfPagePath("shelf://a-page/?tab=documento&v=3"), "/api/shelf/page?slug=a-page&tab=documento&v=3");
  assert.equal(relay.shelfPagePath("shelf://a-page/"), "/api/shelf/page?slug=a-page");
  for (const refused of [
    "shelf://a-page/api/spawn",
    "shelf://a-page/anything",
    "shelf://NotASlug/",
    "shelf://-starts-with-a-dash/",
    "hive://app/api/artifacts",
    "https://example.com/",
    "not a url at all"
  ]) assert.equal(relay.shelfPagePath(refused), null, `${refused} must not reach the socket`);
  const fn = cut(readFileSync(join(here, "..", "main", "relay.js"), "utf8"), "function serveShelfPages", "\nasync function askTheSocket", "relay.js");
  assert.match(fn, /request\.method !== "GET"/);
  assert.match(fn, /status: 405/);
});

test("the browser's partition never gets the whole hive, only the shelf", () => {
  const source = readFileSync(join(here, "..", "main", "relay.js"), "utf8");
  const wired = cut(main, 'session.fromPartition("persist:seat-browser")', "ipcMain.handle(\"seat-browser:profile\"", "main.js");
  assert.match(wired, /relay\.serveShelfPages\(seatBrowser, SOCK\)/);
  assert.ok(!wired.includes("serveOverSocket"), "the seat browser must never be handed hive://");
  const privileges = cut(source, "protocol.registerSchemesAsPrivileged", "\n}", "relay.js");
  const shelf = cut(privileges, "scheme: SHELF_SCHEME", "}", "relay.js");
  assert.ok(!shelf.includes("supportFetchAPI"), "a page must be navigable, never readable by another page");
  assert.ok(!shelf.includes("corsEnabled"), "no cross-origin reads of the shelf");
});

test("the slug the browser accepts is the slug the shelf writes", () => {
  const written = cut(server, "const SHELF_SLUG =", "\n", "server.mjs").split("=")[1].trim().replace(/;$/, "");
  assert.equal(String(relay.SHELF_SLUG), written, "relay and server must agree on what a slug is");
});

test("a shelf address survives the round trip, and a plain page is not one", () => {
  for (const [slug, tab, v] of [["a-page", "documento", 3], ["a-page", "telas", 0], ["a-page", "", 0]]) {
    const address = web.shelfTabAddress(slug, tab, v);
    const read = web.shelfTabOf(address);
    assert.equal(read.slug, slug);
    assert.equal(read.tab, tab);
    assert.equal(read.version, v);
  }
  assert.equal(web.shelfTabOf("http://localhost:3000/"), null);
  assert.equal(web.shelfTabOf("https://example.com/shelf://a-page"), null);
  const link = web.shelfTabOf("hive://shelf/a-page?tab=plano&v=2#d1");
  assert.equal(link.slug, "a-page", "the link publish hands out is not read as a shelf address");
  assert.equal(link.tab, "plano");
  assert.equal(link.version, 2);
  assert.equal(link.at, "d1", "the deep link lost the decision it points at");
});

test("the link publish hands out opens the page, not a dead hive:// address", () => {
  const own = fresh("ada");
  web.gotoWeb("ada", "hive://shelf/a-page?tab=telas");
  const tab = own.tabs[own.active];
  assert.equal(tab.kind, "artifact");
  assert.equal(tab.slug, "a-page");
  assert.equal(tab.url, web.shelfTabAddress("a-page", "telas", 0, ""), "the webview was left with an address it cannot load");
});

test("a seat keeps one artifact tab, reused, and it never eats the tab cap", () => {
  const own = fresh("ada");
  const first = web.openArtifactTab("ada", { slug: "a-page", tab: "documento" }, 2);
  assert.equal(first.kind, "artifact");
  assert.equal(first.url, web.shelfTabAddress("a-page", "documento", 2, ""));
  const again = web.openArtifactTab("ada", { slug: "another-page", tab: "telas" }, 0);
  assert.equal(again, first, "a second artifact opened a second tab");
  assert.equal(again.slug, "another-page");
  assert.equal(own.tabs.filter((t) => t.kind === "artifact").length, 1);
  assert.equal(st.webChat, "ada", "opening it twice must not toggle the browser shut");
  for (let i = 0; i < web.WEB_TAB_CAP - 1; i++) assert.ok(web.addWebTab("ada"), `tab ${i + 1} of the cap was refused`);
  assert.equal(web.addWebTab("ada"), null, "the person ate the tab the seat keeps for itself");
  assert.ok(web.addWebTab("ada", "web", { forTheSeat: true }), "the seat's own tab was refused with a slot left for it");
  assert.equal(web.addWebTab("ada", "web", { forTheSeat: true }), null, "the cap counts one tab too many");
  assert.equal(web.webTabsIn(own).length, web.WEB_TAB_CAP, "the artifact tab was counted against the cap");
  assert.ok(web.openArtifactTab("ada", { slug: "a-page" }, 0), "a full browser still opens the artifact");
});

test("typing a shelf address in the bar opens it as an artifact tab", () => {
  const own = fresh("ada");
  web.gotoWeb("ada", "shelf://a-page/?tab=documento&v=3");
  const tab = own.tabs[own.active];
  assert.equal(tab.kind, "artifact");
  assert.equal(tab.slug, "a-page");
  assert.equal(tab.tab, "documento");
  assert.equal(tab.version, 3);
  web.gotoWeb("ada", "example.com");
  assert.equal(own.tabs[own.active].kind, "web");
  assert.equal(own.tabs[own.active].url, "https://example.com");
});

test("the picker tells the server which seat it came from", () => {
  const born = cut(panes, "function bornWebFrame(yard, name, t) {", "\n}\n", "chat-and-panes.js");
  assert.match(born, /ev\.channel === "hive-ask"\) askOnTheElement\(name, frame/);
  assert.match(born, /ev\.channel === "hive-pick-cancel"\) setWebPick\(name, false\)/);
  assert.match(panes, /function bornWebFrame\(yard, name, t\) \{/, "name is an argument here — a bare name in any other scope is window.name, and the server refuses it");
});

test("one chrome is built once and worn by both hosts", () => {
  const chrome = cut(shelfSource, "function paintPageChrome(host, { page, tab, version, onTab, onVersion }) {", "\n}\n", "shelf.js");
  assert.match(chrome, /className = "sh-tab"/);
  assert.match(chrome, /className = "sh-vers"/);
  assert.match(chrome, /className = "sh-ver"/);
  const shelfScreen = cut(shelfSource, "function paintShelfView() {", "\n}\n", "shelf.js");
  assert.match(shelfScreen, /paintPageChrome\(\$\("sh-tabs"\), \{/, "the shelf screen must not build its own strip");
  assert.ok(!shelfScreen.includes('className = "sh-tab"'), "the shelf screen stopped hand-rolling the tabs");
  assert.ok(!shelfScreen.includes('className = "sh-ver"'), "the shelf screen stopped hand-rolling the rail");
  const tabChrome = cut(panes, "function paintArtifactChrome(pane, now) {", "\n}\n", "chat-and-panes.js");
  assert.match(tabChrome, /paintPageChrome\(rail, \{/, "the browser tab wears the same one");
});

test("the page keeps the last, stretching row of the browser when the shelf rail leaves", () => {
  const html = readFileSync(join(here, "..", "app.html"), "utf8");
  assert.match(html, /\.art\.web \.web-rail\[hidden\] \{ display: none; \}/);
  assert.match(html, /\.art\.web > \.art-stage \{ grid-row: -2 \/ -1; \}/, "without it the page drops into an auto row and is 0px tall");
});

test("the shelf rail really leaves the screen on a tab that is not from the shelf", () => {
  const pane = document.createElement("section");
  pane.className = "art web";
  pane.innerHTML = '<div class="web-rail sh-tabs"></div><button class="web-link"></button><button class="web-ask"></button><button class="web-out"></button>';
  document.body.appendChild(pane);
  web.paintArtifactChrome(pane, { kind: "web", url: "https://github.com/acme/hive/pull/1114" });
  assert.equal(getComputedStyle(pane.querySelector(".web-rail")).display, "none");
  pane.remove();
});

test("the artifact chrome only shows on an artifact tab", () => {
  const pane = document.createElement("section");
  pane.innerHTML = '<div class="web-rail"></div><button class="web-link"></button><button class="web-ask"></button><button class="web-out"></button>';
  web.paintArtifactChrome(pane, { kind: "web", url: "https://example.com" });
  assert.equal(pane.querySelector(".web-link").hidden, true);
  assert.equal(pane.querySelector(".web-ask").hidden, true);
  assert.equal(pane.querySelector(".web-out").textContent, "browser");
  assert.equal(pane.querySelector(".web-rail").hidden, true);
  web.paintArtifactChrome(pane, { kind: "artifact", slug: "a-page", tab: "documento", version: 0 });
  assert.equal(pane.querySelector(".web-link").hidden, false);
  assert.equal(pane.querySelector(".web-ask").hidden, false);
  assert.equal(pane.querySelector(".web-out").textContent, "the shelf");
});

test("the address handed to someone else names the page, never the version", () => {
  assert.equal(web.shelfLinkOf("a-page", "documento"), "hive://shelf/a-page?tab=documento");
  assert.equal(web.shelfLinkOf("a-page", ""), "hive://shelf/a-page");
  const wired = cut(panes, 'pane.querySelector(".web-link").addEventListener', "web-ask", "chat-and-panes.js");
  assert.match(wired, /toClipboard\(shelfLinkOf\(t\.slug, t\.tab\)\)/);
  assert.ok(!/shelfLinkOf\([^)]*version/.test(panes), "no version ever reaches the copied link");
});

test("what the tab shows is always a settled version, so a new one repaints it", () => {
  const fn = cut(panes, "function paintArtifactChrome(pane, now) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /mine\.url = shelfTabAddress\(mine\.slug, shown\.tab, shown\.now\?\.n \|\| 0, mine\.at\);/);
  const paint = cut(panes, "function paintWebOfChat(el, s) {", "\nfunction paintArtifactChrome", "chat-and-panes.js");
  assert.ok(paint.indexOf("paintArtifactChrome(pane, now)") < paint.indexOf("const stage = pane.querySelector"),
    "the chrome settles the address before the stage reads it");
  assert.ok(paint.indexOf("paintArtifactChrome(pane, now)") < paint.indexOf("const input = pane.querySelector"),
    "and before the address bar shows it, or the bar names a version the tab is not on");
  assert.match(paint, /const untouched = document\.activeElement !== input \|\| input\.value === input\.dataset\.h;/,
    "a bar nobody is editing follows the tab");
  const wired = cut(panes, 'pane.querySelector(".web-url").addEventListener("submit"', "web-print", "chat-and-panes.js");
  assert.match(wired, /field\.blur\(\);/, "navigating hands focus back to the page, or the bar keeps the address you typed");
});

test("opening an artifact asks the origin for the shelf, one flight at a time", () => {
  fresh("ada");
  let pulls = 0;
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => { pulls++; return new Promise(() => {}); };
  try {
    web.openArtifactTab("ada", { slug: "a-page", tab: "documento" }, 0);
    assert.equal(st.shelfWanted, true, "opening an artifact never asked for the shelf");
    assert.equal(pulls, 1);
    web.openArtifactTab("ada", { slug: "a-page", tab: "telas" }, 0);
    assert.equal(pulls, 1, "a second opening put a second flight in the air");
  } finally {
    globalThis.fetch = fetched;
    st.shelfWanted = false;
  }
});

test("a stretch of the page can be quoted into the chat, like a stretch of an answer", () => {
  const picker = readFileSync(join(here, "..", "main", "seat-preload.js"), "utf8");
  assert.match(picker, /ipcRenderer\.sendToHost\("hive-quote"/);
  const read = cut(picker, "function readSelection() {", "\n}\n", "seat-preload");
  assert.match(read, /sel\.isCollapsed/, "an empty selection is not a quote");
  assert.match(read, /quoteBtn\.contains\(sel\.anchorNode\)/, "selecting the button itself is not a quote");
  assert.match(read, /slice\(0, QUOTE_CEILING\)/, "a page cannot push an unbounded string into the chat");
  const offer = cut(picker, "function offerQuote() {", "\n}\n", "seat-preload");
  assert.match(offer, /if \(picking\) return dropQuote\(\);/, "the picker and the quote never fight over one click");

  const born = cut(panes, "function bornWebFrame(yard, name, t) {", "\n}\n", "chat-and-panes.js");
  assert.match(born, /ev\.channel === "hive-quote"\) sendPageQuote\(name, ev\.args\[0\]\)/);
  const land = cut(panes, "function sendPageQuote(name, quote) {", "\n}\n", "chat-and-panes.js");
  assert.match(land, /e\.quotes\.add\(said, from\)/, "it lands in the same tray the chat quote uses");
  assert.match(land, /shelved\.version \? `v\$\{shelved\.version\}` : ""/, "and it says which version it came from");
});

test("a page left open keeps its rail alive, and only a page left open pays for it", () => {
  const own = fresh("ada");
  assert.equal(web.someoneReadingAPage(), false, "nobody is reading a page and the shelf is asked for anyway");
  web.openArtifactTab("ada", { slug: "a-page", tab: "documento" }, 0);
  st.webChat = "ada";
  assert.equal(own.tabs[own.active].kind, "artifact");
  const fn = cut(panes, "async function pullPages() {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /if \(someoneReadingAPage\(\)\) wantShelfIndex\(true\);/);
  const when = cut(panes, "const someoneReadingAPage = () =>", ";\n", "chat-and-panes.js");
  assert.match(when, /st\.webChat && showingArtifact\(st\.webChat\)/, "the tab on a seat");
  assert.match(when, /shelfOnScreen\(\) && !!st\.shelfOpen/, "or the shelf screen reading one");
  assert.ok(!/setInterval\(\s*\(\s*\)\s*=>\s*pullShelf/.test(panes), "no second timer — it rides the one that already beats");
});

test("reloading an artifact tab means the newest version, not the one a link froze", () => {
  const own = fresh("ada");
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => new Promise(() => {});
  let asked = false;
  try {
    web.openArtifactTab("ada", { slug: "a-page", tab: "documento" }, 2);
    const tab = own.tabs[own.active];
    assert.equal(tab.version, 2, "a link carrying ?v= must open on that version");
    st.shelfWanted = false;
    web.catchUpArtifact("ada");
    asked = st.shelfWanted;
    assert.equal(tab.version, 0, "the pin survived the reload — the page would stay frozen forever");
  } finally {
    globalThis.fetch = fetched;
    st.shelfWanted = false;
  }
  assert.equal(asked, true, "reloading never asked the origin for a fresh shelf");

  const own2 = fresh("bea");
  web.addWebTab("bea");
  own2.tabs[own2.active].url = "http://localhost:3000/";
  assert.equal(web.catchUpArtifact("bea"), false, "a plain page has no version to catch up with");

  const step = cut(panes, "function stepWeb(name, way) {", "\n}\n", "chat-and-panes.js");
  assert.match(step, /if \(way === "reload" && catchUpArtifact\(name\)\) return;/,
    "the reload button refetches the same frozen address instead of catching up");
  const driven = cut(panes, "async function runBrowserStep(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(driven, /else if \(!catchUpArtifact\(name\)\) frame\.reload\(\);/,
    "the agent's reload and the person's must mean the same thing");
});

test("esc in the address bar puts the address back and lets go of the keyboard", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const pane = web.webPaneOf(host, { name: "esc-bar" });
  const input = pane.querySelector(".web-url input");
  input.dataset.h = "https://example.com/";
  input.value = "half typed";
  input.focus();
  const press = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  input.dispatchEvent(press);
  assert.equal(press.defaultPrevented, true);
  assert.equal(input.value, "https://example.com/");
  assert.notEqual(document.activeElement, input, "the next esc reaches the chat and minimizes it");
  host.remove();
});

test("the new hive drops the browser's own header: the browser lives inside the chat", () => {
  const css = readFileSync(join(here, "..", "assets", "experience.css"), "utf8");
  assert.match(css, /body\.experience-next \.art\.web > \.art-head \{ display: none; \}/);
  assert.match(css, /body\.experience-next \.art\.web \.web-url input:is\(:focus, :focus-visible\) \{[^}]*outline-offset: -2px;/, "the focused bar draws its line inside, never over its neighbours");
});

test("the new tab plus and the close cross sit in the middle of their box", () => {
  const css = readFileSync(join(here, "..", "assets", "experience.css"), "utf8");
  for (const which of [".web-plus", ".web-tab > i"]) {
    const rule = css.match(new RegExp(`body\\.experience-next \\.art\\.web ${which.replace(/[.>]/g, (c) => `\\${c}`)} \\{[^}]*\\}`))?.[0] || "";
    assert.match(rule, /display: flex; align-items: center; justify-content: center;/, `${which}: a grid would give its hidden text a row of its own and push the icon up`);
  }
});

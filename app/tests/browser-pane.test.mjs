import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { keepPane, restorePane } = await app("focus-navigation");
const { paneOfSeat } = await app("core");
const panes = await app("chat-and-panes");
const { ART_WEBVIEW } = await app("subagents-dock");

const HERE = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(HERE, "main.js"), "utf8");
const source = readFileSync(join(HERE, "src/app/chat-and-panes.js"), "utf8");

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

function hive(names = ["oi"]) {
  st.LIMIT = 4;
  st.data = { sessions: names.map((name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = [{ id: "b1", ws: "w0", label: "", manual: true, keys: [...names] }];
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threadChat = null;
  st.reviewChat = null;
  st.seatsKnown = true;
  bootSolid();
  render();
}

test("the browser button lives in the tag row, next to the pencil", () => {
  hive();
  const tags = document.querySelector('.tile[data-name="oi"] .t-tags');
  const order = [...tags.children].map((one) => one.className);
  assert.ok(order.indexOf("t-web") >= 0 && order.indexOf("t-web") < order.indexOf("t-edit"), "t-web comes before t-edit");
  assert.match(tags.querySelector(".t-web").innerHTML, /<use href="#i-browser"/);
});

test("opening the browser closes every sibling pane first", () => {
  assert.equal(ART_WEBVIEW, true, "the pane only exists inside Electron");
  hive();
  st.cockChat = "oi";
  st.deviceChat = "oi";
  st.threadChat = "oi";
  st.reviewChat = "oi";
  panes.openBrowser("oi");
  assert.equal(st.webChat, "oi");
  assert.equal(st.cockChat, null);
  assert.equal(st.deviceChat, null);
  assert.equal(st.threadChat, null);
  assert.equal(st.reviewChat, null);
});

test("the pane is a window onto the pages, never their home", () => {
  assert.equal("paintArtOfChat" in panes, false, "the artifact pane is gone — the artifact is a tab now");
  const paintWeb = cut(source, "function paintWebOfChat(el, s) {", "\nfunction paintArtifactChrome", "chat-and-panes.js");
  assert.match(paintWeb, /el\.querySelector\("\.art\.web"\)/);
  assert.ok(!paintWeb.includes('createElement("webview")'), "the pane must not build webviews — closing it would kill them");

  hive();
  const web = panes.webStateOf("oi");
  web.tabs.length = 0;
  const tab = panes.addWebTab("oi");
  tab.url = "http://localhost:3000/one";
  panes.webTouch.set("oi", Date.now());
  panes.paintYards();
  const yard = document.querySelector('#webyard .yard[data-name="oi"]');
  const frame = yard.querySelector("webview");
  assert.equal(frame.dataset.here, "http://localhost:3000/one");
  tab.url = "http://localhost:3000/two";
  panes.paintYards();
  assert.equal(yard.querySelectorAll("webview").length, 1, "the same tab keeps the same frame");
  assert.equal(yard.querySelector("webview").dataset.here, "http://localhost:3000/two");
});

test("tabs stop at the cap, and the cap is five", () => {
  assert.equal(panes.WEB_TAB_CAP, 5);
  hive();
  const web = panes.webStateOf("capped");
  web.tabs.length = 0;
  for (let i = 0; i < panes.WEB_TAB_CAP - 1; i++) assert.ok(panes.addWebTab("capped"));
  assert.equal(panes.addWebTab("capped"), null, "the person may not take the slot kept for the seat");
  assert.ok(panes.addWebTab("capped", "web", { forTheSeat: true }));
  assert.equal(panes.addWebTab("capped", "web", { forTheSeat: true }), null);
  assert.ok(panes.addWebTab("capped", "artifact"), "an artifact tab is not one of the five");
});

test("browser tabs live in their own partition, never the personal session", () => {
  const yard = document.createElement("div");
  const frame = panes.bornWebFrame(yard, "oi", { id: "w-part", url: "", title: "", kind: "web" });
  assert.equal(frame.getAttribute("partition"), "persist:seat-browser");
  const born = cut(source, "function bornWebFrame(yard, name, t) {", "\n}\n", "chat-and-panes.js");
  assert.ok(!born.includes("persist:claude-artifacts"));
  assert.ok(!born.includes("persist:canopy-cockpit"));
});

test("the address bar completes schemes and keeps localhost on http", () => {
  assert.equal(panes.webAddress("localhost:3000/app-v2"), "http://localhost:3000/app-v2");
  assert.equal(panes.webAddress("127.0.0.1:8799"), "http://127.0.0.1:8799");
  assert.equal(panes.webAddress("designsystem.example.dev"), "https://designsystem.example.dev");
  assert.equal(panes.webAddress("https://claude.ai"), "https://claude.ai");
  assert.equal(panes.webAddress("  "), "");
});

test("the pane registry remembers a browser pane across tile close and reopen", () => {
  hive();
  st.open = "oi";
  st.webChat = "oi";
  keepPane();
  assert.equal(paneOfSeat.get("oi").kind, "browser");
  st.webChat = null;
  restorePane("oi");
  assert.equal(st.webChat, "oi", "reopening the seat brings its browser back");
});

test("the seat browser session denies permission prompts and gets the debugger attached", () => {
  const wired = cut(main, 'session.fromPartition("persist:seat-browser")', 'window_.on("resize"', "main.js");
  assert.match(wired, /setPermissionRequestHandler\(\(_wc, _permission, grant\) => grant\(false\)\)/);
  assert.match(wired, /guest\.debugger\.attach\("1\.3"\)/);
  assert.match(wired, /guest\.session === seatBrowser/);
});

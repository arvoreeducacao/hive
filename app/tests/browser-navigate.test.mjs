import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const polling = readFileSync(join(here, "..", "src", "app", "focus-navigation.js"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const peer = readFileSync(join(here, "..", "..", "server", "peer", "peer.mjs"), "utf8");

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Hive/1.0 Electron/38.0.0", configurable: true });

const st = await state();
const { driveBrowsers, drivenTab, tabOfSeatDriving, webStateOf, webTabsIn, addWebTab, WEB_TAB_CAP } = await app("chat-and-panes");

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

test("the seat carries a browser intent in the fleet payload", () => {
  assert.match(server, /browser: browserState\(name\),/);
  assert.match(browserRoutes, /const browserWants = new Map\(\);/);
  assert.match(server, /registerBrowserRoutes\(on,/, "the domain answers through the router, not the if-chain");
});

test("the navigate route validates the seat and stores a bumped intent", () => {
  const route = cut(browserRoutes, '"/api/browser/navigate"', 'on("POST", "/api/browser/shoot"', "routes/browser.mjs");
  assert.match(route, /if \(!isSeatName\(asked\.name\)\) return json/);
  assert.match(route, /if \(!target\) return json/);
  assert.match(route, /browserWants\.set\(asked\.name, \{ url: target, seq: \+\+browserSeq \}\)/);
});

test("the renderer reconciles the intent by seq, over the whole fleet, not tile by tile", () => {
  st.open = "b";
  st.webChat = "";
  st.data = { sessions: [{ name: "a", browser: { want: { url: "example.com", seq: 1 } } }, { name: "b", browser: null }] };
  driveBrowsers();
  const web = webStateOf("a");
  assert.equal(web.tabs.length, 1, "a seat nobody is looking at is driven all the same");
  assert.equal(web.tabs[0].url, "https://example.com", "a bare host is dialed over https");
  assert.equal(webStateOf("b").tabs.length, 0, "a seat with no intent is left alone");
  driveBrowsers();
  assert.equal(web.tabs.length, 1, "the same seq is applied once and never again");
  st.data.sessions[0].browser.want = { url: "https://two.example", seq: 2 };
  driveBrowsers();
  assert.equal(web.tabs.length, 1, "navigating again reuses the tab the seat is already driving");
  assert.equal(web.tabs[0].url, "https://two.example");
  assert.equal(st.webChat, "", "a seat navigating never steals the screen from the person");
});

test("a tab the person opened is never the one the seat drives over", () => {
  st.webChat = "";
  const web = webStateOf("beside");
  web.tabs.length = 0;
  drivenTab.delete("beside");
  st.data = { sessions: [{ name: "beside", browser: { want: { url: "https://one.example", seq: 21 } } }] };
  driveBrowsers();
  const drove = web.tabs[web.active];
  const mine = addWebTab("beside");
  mine.url = "http://localhost:3000/my-screen";
  st.data.sessions[0].browser.want = { url: "https://two.example", seq: 22 };
  driveBrowsers();
  assert.equal(web.tabs.length, 2, "the seat opened no third tab");
  assert.equal(drove.url, "https://two.example", "the seat went back to its own tab");
  assert.equal(mine.url, "http://localhost:3000/my-screen", "the person's tab was left alone");
  assert.equal(web.tabs[web.active], mine, "the seat moved the tab the person was looking at");
  assert.equal(tabOfSeatDriving("beside"), drove, "the tools act on the tab the seat just drove");
});

test("a seat sent to a shelf address lands on the artifact tab, with its rail", () => {
  st.webChat = "";
  const web = webStateOf("shelved");
  web.tabs.length = 0;
  drivenTab.delete("shelved");
  st.data = { sessions: [{ name: "shelved", browser: { want: { url: "shelf://a-page/?tab=telas", seq: 31 } } }] };
  driveBrowsers();
  const tab = web.tabs[web.active];
  assert.equal(tab.kind, "artifact", "a shelf address opened a plain web tab, so the page lost its rail");
  assert.equal(tab.slug, "a-page");
  assert.equal(tab.tab, "telas");
  assert.equal(st.webChat, "", "landing on the shelf never steals the screen from the person");
});

test("the reconcile respects the tab cap, and the seat still has a slot of its own", () => {
  st.webChat = "";
  const web = webStateOf("capped");
  web.tabs.length = 0;
  drivenTab.delete("capped");
  while (webTabsIn(web).length < WEB_TAB_CAP - 1) addWebTab("capped");
  assert.equal(addWebTab("capped"), null, "the person may not fill the seat's slot");
  st.data = { sessions: [{ name: "capped", browser: { want: { url: "https://late.example", seq: 9 } } }] };
  driveBrowsers();
  assert.equal(webTabsIn(web).length, WEB_TAB_CAP, "the seat did not get the slot kept for it");
  const drove = tabOfSeatDriving("capped");
  assert.equal(drove.url, "https://late.example");
  st.data.sessions[0].browser.want = { url: "https://later.example", seq: 10 };
  driveBrowsers();
  assert.equal(webTabsIn(web).length, WEB_TAB_CAP, "a full seat opens no sixth tab");
  assert.equal(drove.url, "https://later.example", "it lands on the tab it already drives");
});

test("the reconcile runs on every pull, right before the paint the gate may skip", () => {
  assert.match(polling, /driveBrowsers\(\);\s*const seen = pollKey\(raw, Date\.now\(\)\);\s*if \(seen === pollSeen\) perf\.skip\("poll"\);\s*else \{\s*pollSeen = seen;\s*render\(\);/);
});

test("the hive MCP exposes browser_navigate with a url argument", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  assert.match(tools, /name: "browser_navigate"/);
  const def = cut(tools, 'name: "browser_navigate"', "name: \"spawn\"", "tool def");
  assert.match(def, /required: \["url"\]/);
});

test("browser_navigate dispatches to the peer function and reports the url", () => {
  const call = cut(mcp, "async browser_navigate(args) {", "async publish(args)", "dispatch");
  assert.match(call, /browserNavigate\(\{ url: args\.url, env \}\)/);
  assert.match(call, /if \(done\.error\) return failure/);
});

test("browserNavigate reaches the app over the hive door, never a peer socket", () => {
  const fn = cut(peer, "export async function browserNavigate(", "\nexport async function askPerson", "peer.mjs");
  assert.match(fn, /hiveDoor\(self\.base\)/);
  assert.match(fn, /"POST", "\/api\/browser\/navigate"/);
  assert.match(fn, /if \(!self\.name\) return \{ error/);
});

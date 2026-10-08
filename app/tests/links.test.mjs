import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { threadKey } from "../lib/slack.mjs";
import { prKey } from "../lib/prs.mjs";
import { app, dom, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const threadRoutes = readFileSync(join(HERE, "routes/threads.mjs"), "utf8");

const st = await state();
const { homeOfLink, leavesForTheBrowser, openOutside, prKeyOf, threadKeyOf, wireLinks } = await app("chat-and-panes");
const { toolsHtml } = await app("thread");

function watching(run) {
  const wasFetch = globalThis.fetch;
  const wasOpen = dom.open;
  const dialled = [];
  const opened = [];
  globalThis.fetch = (url) => { dialled.push(String(url)); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  dom.open = (url, target) => { opened.push({ url, target }); return null; };
  return Promise.resolve(run())
    .then(() => ({ dialled, opened }))
    .finally(() => { globalThis.fetch = wasFetch; dom.open = wasOpen; });
}

async function where(url) {
  st.prs = [];
  st.threads = [];
  const go = homeOfLink("seat", url);
  if (!go) return null;
  const { dialled, opened } = await watching(go);
  if (dialled.some((u) => u.includes("/api/prs/register"))) return "pr";
  if (dialled.some((u) => u.includes("/api/threads/register"))) return "thread";
  return opened.length ? "artifact" : null;
}

const PR_URL = "https://github.com/acme/hive/pull/278";
const THREAD_URL = "https://acme.slack.com/archives/C0EXAMPLE01/p1755800000123456";

test("a pr, a thread and a published page open in the panel that already shows them", async () => {
  assert.equal(await where(PR_URL), "pr");
  assert.equal(await where(`${PR_URL}/files`), "pr");
  assert.equal(await where(`${PR_URL}#issuecomment-1`), "pr");
  assert.equal(await where(THREAD_URL), "thread");
  assert.equal(await where(`${THREAD_URL}?thread_ts=1755799000.111111&cid=C0EXAMPLE01`), "thread");
  assert.equal(await where("https://claude.ai/code/artifact/abc123"), "artifact");
});

test("a link with no panel here still leaves for the browser", () => {
  for (const url of [
    "https://github.com/acme/hive/issues/12",
    "https://github.com/acme/hive",
    "https://acme.slack.com/archives/C0EXAMPLE01",
    "https://linear.app/acme/issue/EXP-231",
    "https://not-slack.com/archives/C0EXAMPLE01/p1755800000123456"
  ]) assert.equal(homeOfLink("seat", url), null, `${url} should have stayed in the browser`);
});

test("a pr link cannot be the whole sentence around it", () => {
  assert.equal(homeOfLink("seat", `the pr is ${PR_URL}`), null);
  assert.equal(homeOfLink("seat", `${PR_URL} and more`), null);
});

test("the page and the server name a pr the same way, or the panel never finds it", () => {
  for (const url of [PR_URL, `${PR_URL}/files`, `${PR_URL}#issuecomment-1`, "https://github.com/acme.hub/api/pull/9"]) {
    assert.equal(prKeyOf(url), prKey(url), url);
  }
  assert.equal(prKeyOf(PR_URL), "acme/hive#278");
});

test("the page and the server name a thread the same way, reply or not", () => {
  for (const url of [THREAD_URL, `${THREAD_URL}?thread_ts=1755799000.111111`]) {
    assert.equal(threadKeyOf(url), threadKey(url), url);
  }
  assert.equal(threadKeyOf(THREAD_URL), "C0EXAMPLE01:1755800000.123456");
});

test("the permalink of a reply opens the thread it belongs to, not one of its own", () => {
  assert.equal(threadKeyOf(`${THREAD_URL}?thread_ts=1755799000.111111`), "C0EXAMPLE01:1755799000.111111");
});

test("a link the person asked to keep outside is left alone", () => {
  const tools = toolsHtml({ link: THREAD_URL }, { ts: "1755800000.123456" });
  assert.match(tools, /data-out="1"/, "the Slack permalink of a message no longer says it belongs outside");
  const root = document.createElement("div");
  root.innerHTML = `<a data-out="1" href="${THREAD_URL}">Slack</a><a href="${THREAD_URL}">the same thread</a>`;
  wireLinks("seat", root);
  const [outside, inside] = root.querySelectorAll("a");
  assert.equal(outside.dataset.here, undefined, "wireLinks took over a link the person asked to keep outside");
  assert.equal(inside.dataset.here, "1", "wireLinks left a plain thread link to the browser");
});

test("a link already wired is not wired a second time", () => {
  const root = document.createElement("div");
  root.innerHTML = `<a href="${PR_URL}">the pr</a>`;
  wireLinks("seat", root);
  wireLinks("seat", root);
  const a = root.querySelector("a");
  return watching(() => a.dispatchEvent(new dom.MouseEvent("click", { bubbles: true, cancelable: true })))
    .then(({ dialled }) => assert.equal(dialled.filter((u) => u.includes("/api/prs/register")).length, 1, "one click registered the pr twice"));
});

test("the server takes a thread link the way it takes a pr link", () => {
  assert.match(server, /registerThreadRoutes\(on,/);
  assert.ok(threadRoutes.includes('on("POST", "/api/threads/register"'));
  assert.ok(threadRoutes.includes('if (!key) return json({ error: "send the link of a Slack thread" }, 400);'));
});

const press = (over) => ({ button: 0, metaKey: false, ctrlKey: false, ...over });
const leaves = (over, apple) => leavesForTheBrowser(press(over), apple);

test("holding the chord the person already knows sends the link to their own browser", () => {
  assert.equal(leaves({ metaKey: true }, true), true, "⌘+click leaves on a mac");
  assert.equal(leaves({ ctrlKey: true }, false), true, "ctrl+click leaves where there is no ⌘");
  assert.equal(leaves({ button: 1 }, true), true, "the middle button leaves on a mac too");
  assert.equal(leaves({ button: 1 }, false), true, "and everywhere else");
});

test("a plain click still lands in the panel that already shows the page", () => {
  assert.equal(leaves({}, true), false);
  assert.equal(leaves({}, false), false);
});

test("ctrl+click on a mac is the context menu, never a trip to the browser", () => {
  assert.equal(leaves({ ctrlKey: true }, true), false);
  assert.equal(leaves({ metaKey: true }, false), false, "⌘ is not the chord where windows and linux spell it ctrl");
});

test("only a web address leaves for the browser — a shelf link has no home out there", async () => {
  const { opened } = await watching(() => {
    openOutside("#");
    openOutside("hive://shelf/sinal-de-vida");
    openOutside("");
    openOutside(PR_URL);
  });
  assert.deepEqual(opened.map((o) => o.url), [PR_URL], 'href="#" and hive:// have nowhere to go out there, so they stay');
  assert.equal(opened[0].target, "_blank");
});

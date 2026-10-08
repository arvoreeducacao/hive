import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Window } from "happy-dom";
import { isPrPageSlug, nextToRead, prPageAddress, prPageFailed, prPageHtml, prPageSlug, prPageStart } from "../assets/pr-page.mjs";
import { createPrDomain } from "../routes/prs.mjs";
import { registerArtifactRoutes } from "../routes/artifacts.mjs";

const KEY = "acme/hive#1170";

const line = (t, a, d, h) => ({ t, a, d, h });

const FILES = [
  { path: "app/src/one.js", added: 2, removed: 1, lines: [line("removed", 1, null, "old"), line("added", null, 1, "<span class=\"hljs-keyword\">const</span> a"), line("added", null, 2, "b")] },
  { path: "app/src/two.js", added: 1, removed: 0, lines: [{ t: "gap", n: 4 }, line("added", null, 5, "two")] },
  { path: "app/assets/three.css", added: 1, removed: 0, lines: [line("added", null, 1, "three")] }
];

const PR = {
  key: KEY,
  repo: "acme/hive",
  number: 1170,
  title: "PR <b>page</b>",
  author: "art",
  state: "open",
  url: "https://github.com/acme/hive/pull/1170",
  head: "art/-/pr-no-hive",
  base: "main",
  bodyHtml: "<h2>Mudança</h2><p>texto \"com aspas\" </script><script>alert(1)</script></p>"
};

function openPage(html) {
  const window = new Window({ url: "https://hive.test/", settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  window.document.write(html);
  return window;
}

const press = (window, key) => window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
const selected = (window) => window.document.querySelector('.files li[aria-selected="true"]')?.title;
const seenPaths = (window) => [...window.document.querySelectorAll('.files li[data-seen="yes"]')].map((row) => row.title);

test("a PR page slug is stable, short and only ever looks like a PR page", () => {
  const slug = prPageSlug(KEY);
  assert.equal(slug, prPageSlug(KEY));
  assert.notEqual(slug, prPageSlug("acme/hive#117"));
  assert.ok(isPrPageSlug(slug));
  assert.equal(prPageAddress(KEY), `shelf://${slug}/`);
  assert.equal(isPrPageSlug("pr-lens-do-hive"), false);
  assert.equal(isPrPageSlug("my-page"), false);
});

test("next to read skips what was seen and wraps around", () => {
  const paths = ["a", "b", "c", "d"];
  assert.equal(nextToRead(paths, 0, new Set(["a"])), 1);
  assert.equal(nextToRead(paths, 1, new Set(["a", "b", "c"])), 3);
  assert.equal(nextToRead(paths, 3, new Set(["b", "c", "d"])), 0);
  assert.equal(nextToRead(paths, 2, new Set(paths)), 3);
});

test("the description goes into a sandboxed frame with GitHub's stylesheet, never into the page itself", () => {
  const html = prPageHtml({ pr: PR, files: FILES, markdownCss: ".markdown-body{color:red}" });
  const window = openPage(html);
  const frame = window.document.querySelector("iframe");
  assert.equal(frame.getAttribute("sandbox"), "allow-top-navigation-by-user-activation allow-popups allow-popups-to-escape-sandbox");
  const doc = frame.getAttribute("srcdoc");
  assert.match(doc, /\.markdown-body\{color:red\}/);
  assert.match(doc, /<article class="markdown-body"><h2>Mudança<\/h2>/);
  assert.match(doc, /<base target="_top">/);
  assert.ok([...window.document.querySelectorAll("script")].every((one) => !one.textContent.includes("alert(1)")), "the description's script stays inside the frame's text");
  assert.equal(window.document.querySelector(".card h1").textContent, "PR <b>page</b>");
  assert.equal(window.document.querySelector(".card .top a").getAttribute("href"), PR.url);
  assert.equal(window.document.querySelector(".card .chip").dataset.state, "open");
  assert.match(window.document.querySelector(".facts").textContent, /main ← art\/-\/pr-no-hive/);
  assert.equal(window.document.title, "#1170 PR <b>page</b>");
  window.close();
});

test("the first file opens first and v marks it seen and moves on, only on this machine", () => {
  const window = openPage(prPageHtml({ pr: PR, files: FILES, markdownCss: "" }));
  assert.equal(selected(window), "app/src/one.js");
  assert.equal(window.document.querySelector(".fpath").title, "app/src/one.js");
  assert.equal(window.document.querySelector(".fpath b").textContent, "one.js");
  assert.equal(window.document.querySelectorAll(".diff tr.added").length, 2);
  assert.equal(window.document.querySelector(".diff tr.added .hljs-keyword").textContent, "const");
  assert.equal(window.document.querySelector(".fhead button"), null, "the check beside each file is the only viewed control");
  assert.equal(window.document.querySelector(".count"), null, "the check beside each file is the only tally");

  press(window, "v");
  assert.deepEqual(seenPaths(window), ["app/src/one.js"]);
  assert.equal(selected(window), "app/src/two.js");
  assert.equal(window.document.querySelector(".diff tr.gap").textContent, "4 unchanged lines");

  press(window, "v");
  press(window, "v");
  assert.equal(seenPaths(window).length, 3);

  press(window, "k");
  assert.equal(selected(window), "app/src/two.js");
  press(window, "v");
  assert.deepEqual(seenPaths(window), ["app/src/one.js", "app/assets/three.css"], "v on a seen file takes the mark back");
  assert.equal(selected(window), "app/src/two.js");

  const kept = JSON.parse(window.localStorage.getItem(`hive.pr.viewed:${KEY}`));
  assert.deepEqual(Object.keys(kept).sort(), ["app/assets/three.css", "app/src/one.js"]);
  window.close();
});

test("a file seen before comes back unseen when its diff changed", () => {
  const first = openPage(prPageHtml({ pr: PR, files: FILES, markdownCss: "" }));
  press(first, "v");
  const kept = first.localStorage.getItem(`hive.pr.viewed:${KEY}`);
  first.close();

  const again = new Window({ url: "https://hive.test/", settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  again.localStorage.setItem(`hive.pr.viewed:${KEY}`, kept);
  const changed = [{ ...FILES[0], added: 3, lines: [...FILES[0].lines, line("added", null, 3, "c")] }, ...FILES.slice(1)];
  again.document.write(prPageHtml({ pr: PR, files: changed, markdownCss: "" }));
  assert.deepEqual(seenPaths(again), []);
  again.close();

  const same = new Window({ url: "https://hive.test/", settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  same.localStorage.setItem(`hive.pr.viewed:${KEY}`, kept);
  same.document.write(prPageHtml({ pr: PR, files: FILES, markdownCss: "" }));
  assert.deepEqual(seenPaths(same), ["app/src/one.js"]);
  same.close();
});

test("clicking a file opens its diff", () => {
  const window = openPage(prPageHtml({ pr: PR, files: FILES, markdownCss: "" }));
  window.document.querySelectorAll(".files li[data-i]")[2].querySelector(".name").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(selected(window), "app/assets/three.css");
  window.close();
});

function prDomain({ registry = [], sessions = [] } = {}) {
  const commands = [];
  const pull = { number: 1170, title: "PR page", user: { login: "art" }, state: "open", draft: false, merged_at: null, html_url: PR.url, head: { ref: "art/-/pr-no-hive" }, base: { ref: "main" }, body_html: "<p>oi</p>" };
  const diff = [
    "diff --git a/package-lock.json b/package-lock.json",
    "--- a/package-lock.json",
    "+++ b/package-lock.json",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/app/src/one.js b/app/src/one.js",
    "--- a/app/src/one.js",
    "+++ b/app/src/one.js",
    "@@ -1 +1,2 @@",
    " a",
    "+b",
    ""
  ].join("\n");
  const domain = createPrDomain({
    sh: async (name, args) => {
      commands.push(args);
      if (args[0] === "api") return JSON.stringify(pull);
      return diff;
    },
    shr: async () => ({ ok: true }),
    extractJson: (raw) => JSON.parse(raw),
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    liveSessions: () => sessions,
    readRegistry: async () => registry,
    markdownCss: async () => ".markdown-body{}"
  });
  return { domain, commands };
}

test("the server builds the PR page from GitHub's rendered description and the PR diff", async () => {
  const { domain, commands } = prDomain({ registry: [{ key: KEY, session: "seat" }] });
  const page = await domain.pullPage(prPageSlug(KEY));
  assert.match(page.start, /Loading hive #1170/);
  const html = page.start + (await page.rest());
  assert.deepEqual(commands.find((args) => args[0] === "api"), ["api", "repos/acme/hive/pulls/1170", "-H", "Accept: application/vnd.github.full+json"]);
  const window = openPage(html);
  assert.match(window.document.querySelector("iframe").getAttribute("srcdoc"), /<article class="markdown-body"><p>oi<\/p><\/article>/);
  assert.deepEqual([...window.document.querySelectorAll(".files li[data-i]")].map((row) => row.title), ["app/src/one.js", "package-lock.json"], "noise files go last");
  window.close();
});

test("the server finds a PR named only in a live chat, and refuses a slug it cannot place", async () => {
  const { domain } = prDomain({ sessions: [{ name: "seat", prs: [PR.url] }] });
  assert.ok(await domain.pullPage(prPageSlug(KEY)));
  assert.equal(await domain.pullPage(prPageSlug("acme/other#1")), null);
  assert.equal(await domain.pullPage("my-page"), null);
});

function shelfRoute(pullPage) {
  const routes = new Map();
  const reads = [];
  registerArtifactRoutes((method, path, handler) => routes.set(path, handler), {
    bodyOf: async () => ({}),
    SHELF_SLUG: /^[a-z0-9][a-z0-9-]{0,59}$/,
    TABS: ["documento"],
    readShelfPage: (...args) => { reads.push(args); return { html: Buffer.from("<title>Shelf</title>") }; },
    SHELF_HOME: "/hive/shelf",
    join,
    withPinShim: (html) => html,
    pullPage
  });
  const call = async (query) => {
    const out = { writes: [], written: [], ended: [], answers: [] };
    await routes.get("/api/shelf/page")({}, { writeHead: (status, headers) => out.writes.push({ status, headers }), write: (value) => out.written.push(String(value)), end: (value) => out.ended.push(String(value)) }, new URL(`http://hive/api/shelf/page${query}`), (value, status = 200) => out.answers.push({ value, status }));
    return out;
  };
  return { call, reads };
}

test("shelf://pr-… serves the PR page, and every other slug still reads the shelf", async () => {
  const slug = prPageSlug(KEY);
  const asked = [];
  const { call, reads } = shelfRoute(async (one) => { asked.push(one); return one === slug ? { start: "<title>PR</title>", rest: async () => "<main>pr</main>" } : null; });
  const pr = await call(`?slug=${slug}`);
  assert.deepEqual(pr.written, ["<title>PR</title>"], "the skeleton goes out before GitHub answers");
  assert.deepEqual(pr.ended, ["<main>pr</main>"]);
  assert.equal(pr.writes[0].headers["content-length"], undefined);
  assert.equal(pr.writes[0].headers["cache-control"], "no-store");
  assert.equal(reads.length, 0);

  const shelf = await call("?slug=my-page");
  assert.equal(shelf.ended.length, 1);
  assert.equal(reads.length, 1);
  assert.deepEqual(asked, [slug, "my-page"]);
});

test("a PR page that fails to build falls back to the shelf instead of crashing the route", async () => {
  const { call, reads } = shelfRoute(async () => { throw new Error("gh is down"); });
  await call(`?slug=${prPageSlug(KEY)}`);
  assert.equal(reads.length, 1);
});

test("a PR GitHub will not give back ends in a red notice instead of a skeleton that never leaves", async () => {
  const domain = createPrDomain({
    sh: async () => { throw new Error("gh is down"); },
    shr: async () => ({ ok: true }),
    extractJson: (raw) => JSON.parse(raw),
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    readRegistry: async () => [{ key: KEY }],
    markdownCss: async () => ""
  });
  const page = await domain.pullPage(prPageSlug(KEY));
  const window = openPage(page.start + (await page.rest()));
  assert.equal(window.document.querySelector(".failed .label").textContent, "Could not load hive #1170");
  assert.equal(window.document.querySelector(".failed a").getAttribute("href"), "https://github.com/acme/hive/pull/1170");
  assert.ok(window.document.querySelector(".waiting"), "the skeleton is in the page and hidden by the notice that follows it");
  window.close();
});

test("the skeleton names the PR it is loading and is hidden once the page arrives", () => {
  const start = prPageStart({ repo: "acme/hive", number: 7 });
  assert.match(start, /<title>hive #7<\/title>/);
  assert.match(start, /aria-busy="true"/);
  assert.match(start, /\.waiting:has\(~ \.page\), \.waiting:has\(~ \.failed\) \{ display: none; \}/);
  assert.match(prPageFailed({ repo: "a/b", number: 7, url: "" }), /<\/html>$/);
});

test("a long line wraps inside the diff instead of scrolling sideways", () => {
  const html = prPageHtml({ pr: PR, files: FILES, markdownCss: "" });
  assert.match(html, /\.diff \{ overflow: hidden auto;/, "the diff never scrolls sideways");
  assert.match(html, /\.diff table \{ border-collapse: collapse; width: 100%; \}/, "the table is as wide as the pane, never wider");
  assert.match(html, /\.diff td \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/, "the code keeps its indentation and wraps");
  assert.match(html, /\.diff td\.n \{[^}]*white-space: nowrap;/, "line numbers never wrap");
});

test("the GitHub links open in a new tab of the seat's browser, not over the PR page", () => {
  const page = openPage(prPageHtml({ pr: PR, files: FILES, markdownCss: "" }));
  const github = [...page.document.querySelectorAll("a")].find((a) => a.textContent.includes("GitHub"));
  assert.equal(github.getAttribute("target"), "_blank");
  assert.equal(github.getAttribute("rel"), "noopener");
  const failed = openPage(prPageFailed({ repo: PR.repo, number: PR.number, url: PR.url }));
  assert.equal(failed.document.querySelector("a").getAttribute("target"), "_blank");
});

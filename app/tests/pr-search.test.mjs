import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";
import { registerPrSearchRoutes, shapePullRequest } from "../routes/pr-search.mjs";

const { filterPullRequests, notePick, outboundPrPicks, prDisplayState, prPickSpans } = await app("pr-mentions");

const pr = (number, title, updatedAt, extra = {}) => ({ number, title, updatedAt, url: `https://github.com/acme/app/pull/${number}`, state: "open", headRefName: `b-${number}`, author: "ana", repo: "acme/app", ...extra });

const list = [pr(12, "Fix login", "2026-11-01"), pr(120, "Login page", "2026-11-20"), pr(1201, "Ship it", "2026-10-01"), pr(7, "Refactor auth", "2026-11-22", { headRefName: "login-fix" })];

test("a number keeps the prs that carry it, the exact one first, then the newest", () => {
  assert.deepEqual(filterPullRequests(list, "12").map((one) => one.number), [12, 120, 1201]);
  assert.deepEqual(filterPullRequests(list, "").map((one) => one.number), [7, 120, 12, 1201]);
});

test("words rank the title first, then the branch, ties go to the newest", () => {
  assert.deepEqual(filterPullRequests(list, "login").map((one) => one.number), [120, 12, 7]);
  assert.equal(filterPullRequests(Array.from({ length: 30 }, (_, i) => pr(i + 1, "x", "")), "").length, 12);
});

test("the state shown is open, draft, merged or closed", () => {
  assert.equal(prDisplayState({ state: "open", isDraft: true }), "draft");
  assert.equal(prDisplayState({ state: "merged" }), "merged");
  assert.equal(prDisplayState({ state: "closed" }), "closed");
  assert.equal(prDisplayState({ state: "open" }), "open");
});

test("a picked pr is inked by its state and goes out as its link, a chat handle never does", () => {
  notePick(pr(4242, "Merge me", "", { state: "merged" }));
  const said = "olha o #4242 e o #4242x e fala com #4242";
  assert.deepEqual(prPickSpans("veja #4242 agora").map((one) => one.cls), ["ink-chip ink-pr-merged"]);
  assert.equal(outboundPrPicks("veja #4242 agora", new Set([4242])), "veja https://github.com/acme/app/pull/4242 agora");
  assert.equal(outboundPrPicks("veja #4242", new Set()), "veja #4242");
  assert.equal(outboundPrPicks("veja #4242", new Set([4242]), (handle) => handle === "4242"), "veja #4242");
  assert.deepEqual(prPickSpans("veja #4242", (handle) => handle === "4242"), []);
  assert.match(outboundPrPicks(said, new Set([4242])), /#4242x/);
});

function harness({ remote = "git@github.com:acme/app.git", listed = [], viewed = null, seats = [{ name: "seat", where: "local", cwd: "/w/app", prs: [] }] } = {}) {
  const calls = [];
  const routes = [];
  registerPrSearchRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    sh: async (cmd, args) => { calls.push([cmd, ...args]); return args.includes("get-url") ? `${remote}\n` : ""; },
    shr: async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args[1] === "view") return viewed ? { ok: true, out: JSON.stringify(viewed) } : { ok: false, out: "" };
      return { ok: true, out: JSON.stringify(listed) };
    },
    liveSessions: () => seats,
    hub: "/hub"
  });
  const call = async (path) => {
    const url = new URL(path, "http://hive");
    let said = null;
    await routes.find((one) => one.path === url.pathname).handler({}, {}, url, (value) => { said = value; });
    return said;
  };
  return { call, calls };
}

test("the search reads the pull requests of the chat's own repository", async () => {
  const h = harness({ listed: [{ number: 3, title: "A", url: "u", state: "MERGED", isDraft: false, author: { login: "bo" } }] });
  const said = await h.call("/api/prs/search?name=seat&where=local&q=fix");
  assert.equal(said.repo, "acme/app");
  assert.deepEqual(said.prs.map((one) => [one.number, one.state, one.author]), [[3, "merged", "bo"]]);
  const listing = h.calls.find((one) => one[0] === "gh");
  assert.deepEqual(listing.slice(0, 4), ["gh", "pr", "list", "-R"]);
  assert.ok(listing.includes("--search") && listing.includes("fix"));
});

test("an old number outside the recent list is looked up on its own and comes first", async () => {
  const h = harness({ listed: [{ number: 900, title: "new" }], viewed: { number: 5, title: "old", state: "CLOSED" } });
  const said = await h.call("/api/prs/search?name=seat&number=5");
  assert.deepEqual(said.prs.map((one) => one.number), [5, 900]);
});

test("a chat with no repository says pull requests are not available", async () => {
  const h = harness({ remote: "", seats: [{ name: "seat", where: "local", cwd: "", prs: [] }] });
  assert.deepEqual(await h.call("/api/prs/search?name=seat"), { available: false, prs: [] });
});

test("a pr from gh is shaped down to what the menu needs", () => {
  assert.deepEqual(shapePullRequest({ number: "8", title: " a\n b ", state: "OPEN", isDraft: true, headRefName: "x", baseRefName: "main", author: { login: "c" } }, "o/r"), {
    number: 8, title: "a b", url: "", state: "open", isDraft: true, headRefName: "x", baseRefName: "main", updatedAt: "", author: "c", repo: "o/r"
  });
});

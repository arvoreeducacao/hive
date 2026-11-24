import { basename, join } from "node:path";
import { githubRepoOf } from "../lib/config.mjs";

const PR_LIST_LIMIT = 99;

const PR_LIST_FRESH_MS = 60_000;

const PR_LISTS_KEPT = 64;

const PR_SEARCH_FIELDS = "number,title,url,state,isDraft,headRefName,baseRefName,updatedAt,author";

const PR_LINK = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/\d+/i;

const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/;

export function shapePullRequest(raw, repo) {
  const state = String(raw?.state || "").toLowerCase();
  return {
    number: Number(raw?.number) || 0,
    title: String(raw?.title || "").replace(/\s+/g, " ").trim().slice(0, 300),
    url: String(raw?.url || ""),
    state: state === "merged" || state === "closed" ? state : "open",
    isDraft: !!raw?.isDraft,
    headRefName: String(raw?.headRefName || ""),
    baseRefName: String(raw?.baseRefName || ""),
    updatedAt: String(raw?.updatedAt || ""),
    author: String(raw?.author?.login || raw?.author || ""),
    repo
  };
}

function parseList(out) {
  try {
    const read = JSON.parse(String(out || "[]"));
    return Array.isArray(read) ? read : null;
  } catch {
    return null;
  }
}

export function registerPrSearchRoutes(on, context) {
  const { sh, shr, liveSessions, hub, now = Date.now } = context;
  const lists = new Map();
  const repos = new Map();

  async function remoteOf(dir) {
    if (!dir) return "";
    return githubRepoOf(String(await sh("git", ["-C", dir, "remote", "get-url", "origin"], { timeout: 4000 })).trim());
  }

  async function repoOfSeat(name, where) {
    const key = `${where}|${name}`;
    if (repos.has(key)) return repos.get(key);
    const seat = liveSessions().find((one) => one.name === name && (one.where || "local") === where);
    if (!seat) return "";
    let repo = where === "cloud" ? "" : await remoteOf(seat.cwd);
    if (!repo && seat.cwd) repo = await remoteOf(join(hub, basename(seat.cwd)));
    if (!repo) {
      const linked = (seat.prs || []).map((link) => PR_LINK.exec(String(link))).find(Boolean);
      repo = linked ? `${linked[1]}/${linked[2]}`.toLowerCase() : "";
    }
    if (repo) {
      if (repos.size >= PR_LISTS_KEPT) repos.delete(repos.keys().next().value);
      repos.set(key, repo);
    }
    return repo;
  }

  function forgetStaleLists() {
    for (const [key, held] of lists) if (now() - held.at >= PR_LIST_FRESH_MS) lists.delete(key);
    while (lists.size >= PR_LISTS_KEPT) lists.delete(lists.keys().next().value);
  }

  async function listOf(repo, query) {
    const key = `${repo}|${query}`;
    const held = lists.get(key);
    if (held && now() - held.at < PR_LIST_FRESH_MS) return held.list;
    const args = ["pr", "list", "-R", repo, "--state", "all", "--limit", String(PR_LIST_LIMIT), "--json", PR_SEARCH_FIELDS];
    if (query) args.push("--search", query);
    const said = await shr("gh", args, { timeout: 20000 });
    const list = said.ok ? parseList(said.out) : null;
    if (!list) return null;
    const shaped = list.map((raw) => shapePullRequest(raw, repo)).filter((pr) => pr.number > 0);
    forgetStaleLists();
    lists.set(key, { at: now(), list: shaped });
    return shaped;
  }

  async function oneOf(repo, number) {
    const said = await shr("gh", ["pr", "view", String(number), "-R", repo, "--json", PR_SEARCH_FIELDS], { timeout: 15000 });
    if (!said.ok) return null;
    try { return shapePullRequest(JSON.parse(said.out), repo); } catch { return null; }
  }

  on("GET", "/api/prs/search", async (req, res, url, json) => {
    const name = url.searchParams.get("name") || "";
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const asked = url.searchParams.get("repo") || "";
    const repo = REPO_SLUG.test(asked) ? asked.toLowerCase() : await repoOfSeat(name, where);
    if (!repo) return json({ available: false, prs: [] });
    const query = String(url.searchParams.get("q") || "").trim().slice(0, 120);
    const number = Number(url.searchParams.get("number")) || 0;
    const list = await listOf(repo, query);
    if (!list) return json({ available: true, repo, error: "the pull requests of this repository could not be read", prs: [] });
    if (number && !list.some((pr) => pr.number === number)) {
      const exact = await oneOf(repo, number);
      if (exact) return json({ available: true, repo, searched: !!query, prs: [exact, ...list] });
    }
    return json({ available: true, repo, searched: !!query, prs: list });
  });
}

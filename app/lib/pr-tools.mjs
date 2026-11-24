import { checkStatus, checksSummary, isFailing, jobInUrl, oneLogLine } from "./pr-checks.mjs";

const HOST = "github.com";
const REPO = /^[\w.-]+\/[\w.-]+$/;
const PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/;
const COMMIT = /^[0-9a-f]{7,40}$/i;
const TRUNK = /^(main|master)$/;
const READ_SECTIONS = ["body", "checks", "threads", "comments", "diff"];
const LIST_STATES = ["all", "open", "closed", "merged"];
const INVOLVEMENTS = ["all", "reviewing", "authored"];
const MERGE_METHODS = ["merge", "squash", "rebase", "fast-forward"];
const OPEN_OR_CLOSED = ["open", "closed"];
const UPDATE_FIELDS = ["title", "body", "ready", "state", "addLabels", "removeLabels", "requestReviewers"];
const PAGE_CHARS = 32000;
const LOGS_AT_ONCE = 5;
const TAIL_DEFAULT = 200;
const TAIL_MAX = 2000;
const LIST_DEFAULT = 30;
const LIST_MAX = 100;
const LIST_REACH = 1000;
const QUERY_MAX = 200;
const NAMES_MAX = 25;
const THREADS_PAGE = 100;
const THREAD_COMMENTS = 50;
const ERROR_CAP = 400;
const GH_WAIT = 30000;
const GH_SLOW = 120000;
const PUSH_WAIT = 180000;
const LOG_BYTES = 64 << 20;
const VIEW_FIELDS = "number,title,url,state,isDraft,author,headRefName,baseRefName,headRefOid,mergeable,autoMergeRequest,statusCheckRollup,body";
const LIST_FIELDS = "number,title,author,headRefName,baseRefName,state,isDraft,reviewDecision,statusCheckRollup,updatedAt";
const COMMENT_KIND = { comment: "issue-comment", inline: "review-comment", review: "review" };
const REVIEW_DECISION = { APPROVED: "approved", CHANGES_REQUESTED: "changes-requested", REVIEW_REQUIRED: "review-required" };
const MERGEABILITY = { MERGEABLE: "mergeable", CONFLICTING: "conflicting" };
const CHECKS_STATE = { failed: "failing", running: "pending", passed: "passing" };
const ADMIN_HINT = /--admin/;
const NO_BRANCH_PR = "This chat's branch has no known PR. Pass number, or open one with pull_request_create.";
const BAD_CURSOR = "This cursor is not from this tool. Pass a nextCursor from its last result.";
const NOT_A_JOB_LOG = "This check is not a GitHub Actions job, so GitHub holds no log for it.";
const NOT_A_JOB_RERUN = "This check is not a GitHub Actions job, so GitHub cannot re-run it.";
const ONE_JOB_AT_A_TIME = "GitHub re-runs one job of a run at a time. Re-run this one after the other finishes.";
const NOT_READ = "Not read, to keep the reply short. Ask for this check by name.";

const threadsQuery = (fields) => `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: ${THREADS_PAGE}) {
        pageInfo { hasNextPage }
        nodes { ${fields} }
      }
    }
  }
}`;

const THREADS_QUERY = threadsQuery(`id path line isResolved isOutdated
          comments(first: ${THREAD_COMMENTS}) { pageInfo { hasNextPage } nodes { author { login } body createdAt } }`);

const THREAD_STATES_QUERY = threadsQuery("isResolved");
const REPLY_MUTATION = "mutation($thread: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { id } } }";
const RESOLVE_MUTATION = "mutation($thread: ID!) { resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }";
const UNRESOLVE_MUTATION = "mutation($thread: ID!) { unresolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }";

export const PR_TOOL_WRITES = new Set(["pull_request_create", "pull_request_update", "pull_request_respond", "pull_request_merge", "ci_rerun"]);

export const PR_TOOL_NEEDS = {
  pull_request_read: "read", pull_request_list: "read", ci_logs: "read",
  pull_request_create: "operate", pull_request_update: "operate", pull_request_respond: "operate", ci_rerun: "operate",
  pull_request_merge: "full"
};

const parse = (text) => {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
};

const words = (value) => (typeof value === "string" ? value.trim() : "");
const wholeIn = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const keyOf = (target) => `${target.repository}#${target.number}`;
const targetOf = (repository, number) => ({ repository, number, url: `https://${HOST}/${repository}/pull/${number}` });
const identity = (target) => ({ host: HOST, repository: target.repository, number: target.number, url: target.url });
const stateOf = (raw) => String(raw?.state || "").toLowerCase() || "open";
const branchPath = (branch) => String(branch).split("/").map(encodeURIComponent).join("/");
const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function decodeCursor(raw) {
  const value = parse(Buffer.from(String(raw || ""), "base64url").toString("utf8"));
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const offsetOk = (value) => value === null || wholeIn(value, 0, Number.MAX_SAFE_INTEGER);

function readCursorOf(raw) {
  const cursor = decodeCursor(raw);
  if (!cursor) return null;
  if ("diff" in cursor) return wholeIn(cursor.diff, 0, Number.MAX_SAFE_INTEGER) ? { diff: cursor.diff } : null;
  if (!("threads" in cursor) || !("comments" in cursor)) return null;
  if (!offsetOk(cursor.threads) || !offsetOk(cursor.comments) || typeof cursor.includeResolved !== "boolean") return null;
  if (cursor.threads === null && cursor.comments === null) return null;
  return { threads: cursor.threads, comments: cursor.comments, includeResolved: cursor.includeResolved };
}

function targetOfText(text) {
  const hit = String(text || "").match(PR_URL);
  return hit ? targetOf(hit[1], Number(hit[2])) : null;
}

function trouble(result, fallback) {
  const lines = String(result?.error || "").split("\n").map((line) => line.trim()).filter((line) => line && !ADMIN_HINT.test(line));
  return (lines.slice(-2).join(" ") || fallback).slice(0, ERROR_CAP);
}

function graphqlTrouble(result, fallback) {
  const errors = parse(result?.out)?.errors;
  if (Array.isArray(errors) && errors.length) return String(errors[0]?.message || fallback).slice(0, ERROR_CAP);
  return result?.ok ? "" : trouble(result, fallback);
}

function namesOf(value, field) {
  if (value === undefined) return { names: undefined };
  if (!Array.isArray(value) || !value.length || value.length > NAMES_MAX) return { error: `${field} should list 1 to ${NAMES_MAX} names` };
  const names = value.map(words);
  if (names.some((one) => !one)) return { error: `${field} should hold only non-empty names` };
  return { names };
}

function checkOf(raw) {
  const url = raw.detailsUrl || raw.targetUrl || "";
  return {
    name: raw.name || raw.context || "check",
    status: checkStatus(raw),
    description: raw.description || null,
    url: url || null,
    workflow: raw.workflowName || null,
    ...jobInUrl(url)
  };
}

const rollupOf = (raw) => (raw?.statusCheckRollup || []).filter((one) => one && (one.status || one.state)).map(checkOf);

function checksCount(checks) {
  let passed = 0;
  let pending = 0;
  const failed = [];
  for (const check of checks) {
    if (isFailing(check.status)) failed.push(check.name);
    else if (check.status === "pending" || check.status === "action-required") pending += 1;
    else passed += 1;
  }
  return { passed, pending, failed };
}

const checkRun = (check) => ({ name: check.name, status: check.status, description: check.description, url: check.url, workflow: check.workflow });

function talkItem(said) {
  return {
    kind: COMMENT_KIND[said.kind] || "issue-comment",
    author: said.who || null,
    body: String(said.body || ""),
    createdAt: said.when || "",
    path: said.path || null,
    line: said.line || null,
    reviewState: said.kind === "review" ? said.verdict || null : null,
    url: said.url || null
  };
}

function conversationPage(threads, comments, start, includeResolved) {
  const shownThreads = [];
  const shownComments = [];
  let size = 0;
  const fits = (item) => {
    const weight = JSON.stringify(item).length;
    if (size && size + weight > PAGE_CHARS) return false;
    size += weight;
    return true;
  };
  let t = start.threads;
  let c = start.comments;
  if (t !== null) {
    while (t < threads.length) {
      const one = threads[t];
      if (one.isResolved && !includeResolved) { t += 1; continue; }
      if (!fits(one)) break;
      shownThreads.push(one);
      t += 1;
    }
  }
  const threadsLeft = t !== null && t < threads.length;
  if (!threadsLeft && c !== null) {
    while (c < comments.length) {
      if (!fits(comments[c])) break;
      shownComments.push(comments[c]);
      c += 1;
    }
  }
  const commentsLeft = c !== null && c < comments.length;
  const next = threadsLeft || commentsLeft ? { threads: threadsLeft ? t : null, comments: c, includeResolved } : null;
  return { threads: shownThreads, comments: shownComments, next };
}

function diffPage(patch, from) {
  const text = String(patch || "");
  if (from >= text.length) return { patch: "", truncated: false, nextCursor: null };
  let end = Math.min(text.length, from + PAGE_CHARS);
  if (end < text.length) {
    const lineEnd = text.lastIndexOf("\n", end);
    if (lineEnd > from) end = lineEnd + 1;
  }
  const more = end < text.length;
  return { patch: text.slice(from, end), truncated: more, nextCursor: more ? encodeCursor({ diff: end }) : null };
}

export function createPrTools({ gh, git, readRegistry, writeRegistry, readLinks = async () => [], talkOf = async () => [], now = Date.now }) {
  async function branchOf(cwd) {
    const said = await git(["branch", "--show-current"], { cwd, timeout: 10000 });
    return said.ok ? said.out.trim() : "";
  }

  async function chosenFor(name) {
    if (!name) return null;
    const chosen = (await readLinks()).find((one) => one?.session === name && /^[\w.-]+\/[\w.-]+#\d+$/.test(one.key || ""));
    return chosen ? targetOf(chosen.key.split("#")[0], Number(chosen.key.split("#")[1])) : null;
  }

  async function linkedTo(name) {
    if (!name) return [];
    const registry = await readRegistry();
    return registry
      .filter((one) => one && !one.retired && one.session === name && /^[\w.-]+\/[\w.-]+#\d+$/.test(one.key || ""))
      .map((one) => targetOf(one.key.split("#")[0], Number(one.key.split("#")[1])));
  }

  async function linkToChat(target, name) {
    if (!name) return;
    const key = keyOf(target);
    const registry = await readRegistry();
    const known = registry.find((one) => one.key === key);
    if (known && !known.retired && known.session) return;
    if (known) {
      delete known.retired;
      known.session = known.session || name;
    } else registry.push({ key, session: name, at: new Date(now()).toISOString() });
    await writeRegistry(registry);
  }

  async function repositoryFor(input, chat) {
    const named = words(input.repository);
    if (named) return REPO.test(named) ? { repository: named } : { error: "repository should be owner/name" };
    if (!chat.cwd) return { error: "This chat has no checkout to read the repository from. Pass repository (owner/name)." };
    const said = await gh(["repo", "view", "--json", "nameWithOwner"], { cwd: chat.cwd, timeout: GH_WAIT });
    const repository = parse(said.out)?.nameWithOwner;
    return repository && REPO.test(repository) ? { repository } : { error: trouble(said, "gh could not tell which GitHub repository this chat's checkout is") };
  }

  async function locate(input, chat) {
    if (input.number !== undefined && !wholeIn(input.number, 1, Number.MAX_SAFE_INTEGER)) return { error: "number should be a whole number above 0" };
    if (input.repository !== undefined && !REPO.test(words(input.repository))) return { error: "repository should be owner/name" };
    if (input.number !== undefined) {
      const repo = await repositoryFor(input, chat);
      return repo.error ? repo : { target: targetOf(repo.repository, input.number) };
    }
    const chosen = await chosenFor(chat.name);
    if (chosen) return { target: chosen };
    const branch = chat.cwd ? await branchOf(chat.cwd) : "";
    if (branch) {
      const said = await gh(["pr", "view", "--json", "url,headRefName"], { cwd: chat.cwd, timeout: GH_WAIT });
      const raw = parse(said.out);
      const target = targetOfText(raw?.url);
      if (target && raw.headRefName === branch) return { target };
    }
    const linked = await linkedTo(chat.name);
    if (linked.length === 1) return { target: linked[0] };
    if (linked.length > 1) return { error: `This chat has ${linked.length} PRs: ${linked.map(keyOf).join(", ")}. Pass number and repository.` };
    return { error: NO_BRANCH_PR };
  }

  async function viewPr(target, fields) {
    const said = await gh(["pr", "view", String(target.number), "-R", target.repository, "--json", fields], { timeout: GH_WAIT });
    const raw = said.ok ? parse(said.out) : null;
    return raw ? { raw } : { error: trouble(said, `GitHub did not return ${keyOf(target)}`) };
  }

  async function threadsOf(target, { withComments = true } = {}) {
    const [owner, name] = target.repository.split("/");
    const said = await gh(["api", "graphql", "-f", `query=${withComments ? THREADS_QUERY : THREAD_STATES_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${target.number}`], { timeout: GH_WAIT });
    const page = said.ok ? parse(said.out)?.data?.repository?.pullRequest?.reviewThreads : null;
    if (!page) return null;
    return {
      truncated: !!page.pageInfo?.hasNextPage,
      threads: (page.nodes || []).filter(Boolean).map((one) => ({
        id: String(one.id || ""),
        path: one.path || "",
        line: Number.isInteger(one.line) ? one.line : null,
        isResolved: !!one.isResolved,
        isOutdated: !!one.isOutdated,
        comments: (one.comments?.nodes || []).filter(Boolean).map((said) => ({ author: said.author?.login ?? null, body: String(said.body || ""), createdAt: said.createdAt || "" })),
        moreComments: !!one.comments?.pageInfo?.hasNextPage
      }))
    };
  }

  async function behindOf(target, base, head) {
    if (!base || !head) return null;
    const said = await gh(["api", `repos/${target.repository}/compare/${branchPath(base)}...${head}`, "--jq", ".behind_by"], { timeout: GH_WAIT });
    const raw = said.ok ? said.out.trim() : "";
    return /^\d+$/.test(raw) ? Number(raw) : null;
  }

  async function read(input, chat) {
    let cursor = null;
    if (input.cursor !== undefined) {
      cursor = readCursorOf(input.cursor);
      if (!cursor) return { error: BAD_CURSOR };
    }
    if (input.include !== undefined && (!Array.isArray(input.include) || input.include.some((one) => !READ_SECTIONS.includes(one)))) {
      return { error: `include should list some of ${READ_SECTIONS.join(", ")}` };
    }
    if (input.includeResolved !== undefined && typeof input.includeResolved !== "boolean") return { error: "includeResolved should be true or false" };
    const sections = cursor
      ? "diff" in cursor ? ["diff"] : [...(cursor.threads === null ? [] : ["threads"]), ...(cursor.comments === null ? [] : ["comments"])]
      : [...new Set(input.include || [])];
    const includeResolved = cursor && "includeResolved" in cursor ? cursor.includeResolved : input.includeResolved === true;
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    const wants = (section) => sections.includes(section);
    const [view, review, talk, diff] = await Promise.all([
      viewPr(target, VIEW_FIELDS),
      threadsOf(target, { withComments: wants("threads") }),
      wants("comments") ? talkOf(keyOf(target)) : null,
      wants("diff") ? gh(["pr", "diff", String(target.number), "-R", target.repository], { timeout: GH_SLOW, maxBuffer: LOG_BYTES }) : null
    ]);
    if (view.error) return view;
    const raw = view.raw;
    const threads = review?.threads || [];
    const checks = rollupOf(raw);
    const result = {
      ...identity(target),
      title: String(raw.title || ""),
      state: stateOf(raw),
      isDraft: !!raw.isDraft,
      author: raw.author?.login ?? null,
      headBranch: String(raw.headRefName || ""),
      baseBranch: String(raw.baseRefName || ""),
      headSha: raw.headRefOid || null,
      mergeability: MERGEABILITY[raw.mergeable] || "unknown",
      behindBy: await behindOf(target, raw.baseRefName, raw.headRefOid),
      autoMergeEnabled: !!raw.autoMergeRequest,
      checks: checksCount(checks),
      unresolvedThreads: review ? threads.filter((one) => !one.isResolved).length : null,
      ...(review?.truncated ? { unresolvedThreadsTruncated: true } : {})
    };
    if (wants("body")) result.body = String(raw.body || "");
    if (wants("checks")) result.checkRuns = checks.map(checkRun);
    if (wants("threads") || wants("comments")) {
      const comments = (Array.isArray(talk) ? talk : []).map(talkItem);
      const start = cursor && "threads" in cursor ? cursor : { threads: wants("threads") ? 0 : null, comments: wants("comments") ? 0 : null };
      const page = conversationPage(threads, comments, start, includeResolved);
      result.conversation = {
        ...(wants("threads") ? { reviewThreads: page.threads } : {}),
        ...(wants("comments") ? { comments: page.comments } : {}),
        truncated: wants("threads") && !!review?.truncated,
        nextCursor: page.next ? encodeCursor(page.next) : null
      };
    }
    if (wants("diff")) {
      if (!diff.ok && !diff.out) return { error: trouble(diff, `GitHub did not return the diff of ${keyOf(target)}`) };
      result.diff = diffPage(diff.out, cursor && "diff" in cursor ? cursor.diff : 0);
    }
    return { result };
  }

  async function list(input, chat) {
    const state = input.state === undefined ? "open" : input.state;
    if (!LIST_STATES.includes(state)) return { error: `state should be ${LIST_STATES.join(", ")}` };
    const involvement = input.involvement === undefined ? "all" : input.involvement;
    if (!INVOLVEMENTS.includes(involvement)) return { error: `involvement should be ${INVOLVEMENTS.join(", ")}` };
    const limit = input.limit === undefined ? LIST_DEFAULT : input.limit;
    if (!wholeIn(limit, 1, LIST_MAX)) return { error: `limit should be a whole number from 1 to ${LIST_MAX}` };
    const query = words(input.query);
    if (input.query !== undefined && (!query || query.length > QUERY_MAX)) return { error: `query should be 1 to ${QUERY_MAX} characters` };
    let offset = 0;
    if (input.cursor !== undefined) {
      const cursor = decodeCursor(input.cursor);
      if (!cursor || !wholeIn(cursor.list, 1, LIST_REACH)) return { error: BAD_CURSOR };
      offset = cursor.list;
    }
    const repo = await repositoryFor(input, chat);
    if (repo.error) return repo;
    const search = [query, involvement === "authored" ? "author:@me" : "", involvement === "reviewing" ? "review-requested:@me" : "", "sort:updated-desc"].filter(Boolean).join(" ");
    const reach = Math.min(LIST_REACH, offset + limit + 1);
    const said = await gh(["pr", "list", "-R", repo.repository, "--state", state, "--search", search, "--limit", String(reach), "--json", LIST_FIELDS], { timeout: GH_SLOW, maxBuffer: LOG_BYTES });
    const entries = said.ok ? parse(said.out) : null;
    if (!Array.isArray(entries)) return { error: trouble(said, `GitHub did not list the PRs of ${repo.repository}`) };
    const page = entries.slice(offset, offset + limit);
    const more = entries.length > offset + limit;
    const end = offset + limit;
    return {
      result: {
        repository: repo.repository,
        pullRequests: page.map((one) => ({
          number: one.number,
          title: String(one.title || ""),
          author: one.author?.login ?? null,
          headBranch: String(one.headRefName || ""),
          baseBranch: String(one.baseRefName || ""),
          state: stateOf(one),
          isDraft: !!one.isDraft,
          reviewDecision: REVIEW_DECISION[one.reviewDecision] || null,
          checksState: CHECKS_STATE[checksSummary(one.statusCheckRollup).ci] || null,
          updatedAt: one.updatedAt || ""
        })),
        truncated: more && end >= LIST_REACH,
        nextCursor: more && end < LIST_REACH ? encodeCursor({ list: end }) : null
      }
    };
  }

  async function create(input, chat) {
    const title = words(input.title);
    if (!title) return { error: "title is required" };
    if (typeof input.body !== "string") return { error: "body is required, even if empty" };
    if (input.base !== undefined && !words(input.base)) return { error: "base should be a branch name" };
    if (input.draft !== undefined && typeof input.draft !== "boolean") return { error: "draft should be true or false" };
    if (input.private === true) return { error: "GitHub has no private PRs. Leave private out." };
    if (!chat.cwd) return { error: "This chat has no checkout of its own, so it has no branch to push. Open the PR from the chat that holds the worktree." };
    const branch = await branchOf(chat.cwd);
    if (!branch) return { error: "This chat's checkout is not on a branch (detached HEAD). Check out a branch first." };
    const repo = await repositoryFor({}, chat);
    if (repo.error) return repo;
    const home = await gh(["repo", "view", repo.repository, "--json", "defaultBranchRef"], { timeout: GH_WAIT });
    const trunk = parse(home.out)?.defaultBranchRef?.name || "";
    if (branch === trunk || (!trunk && TRUNK.test(branch))) return { error: `This chat is on ${branch}, the repository's default branch. Create a branch for the work first.` };
    const pushed = await git(["push", "--set-upstream", "origin", branch], { cwd: chat.cwd, timeout: PUSH_WAIT });
    if (!pushed.ok) return { error: `git push failed: ${trouble(pushed, "no reason given")}` };
    const open = await gh(["pr", "list", "-R", repo.repository, "--head", branch, "--state", "open", "--json", "url", "--limit", "1"], { timeout: GH_WAIT });
    const existing = targetOfText((parse(open.out) || [])[0]?.url);
    if (existing) {
      await linkToChat(existing, chat.name);
      return { result: { ...identity(existing), created: false } };
    }
    const args = ["pr", "create", "-R", repo.repository, "--head", branch, "--title", title, "--body-file", "-"];
    if (words(input.base)) args.push("--base", words(input.base));
    if (input.draft === true) args.push("--draft");
    const made = await gh(args, { cwd: chat.cwd, input: input.body, timeout: GH_SLOW });
    const target = targetOfText(made.out);
    if (!target) return { error: made.ok ? "GitHub accepted the PR but did not say where it is. Find it with pull_request_list." : trouble(made, "gh refused to open the PR") };
    await linkToChat(target, chat.name);
    return { result: { ...identity(target), created: true } };
  }

  async function update(input, chat) {
    if (!UPDATE_FIELDS.some((field) => input[field] !== undefined)) return { error: "Pass title, body, ready, state, addLabels, removeLabels, or requestReviewers." };
    if (input.title !== undefined && !words(input.title)) return { error: "title should not be empty" };
    if (input.body !== undefined && typeof input.body !== "string") return { error: "body should be text" };
    if (input.ready !== undefined && typeof input.ready !== "boolean") return { error: "ready should be true or false" };
    if (input.state !== undefined && !OPEN_OR_CLOSED.includes(input.state)) return { error: "state should be open or closed" };
    const add = namesOf(input.addLabels, "addLabels");
    const remove = namesOf(input.removeLabels, "removeLabels");
    const reviewers = namesOf(input.requestReviewers, "requestReviewers");
    const bad = [add, remove, reviewers].find((one) => one.error);
    if (bad) return bad;
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    const ref = [String(target.number), "-R", target.repository];
    const edit = [];
    if (input.title !== undefined) edit.push("--title", words(input.title));
    if (input.body !== undefined) edit.push("--body-file", "-");
    for (const label of add.names || []) edit.push("--add-label", label);
    for (const label of remove.names || []) edit.push("--remove-label", label);
    for (const who of reviewers.names || []) edit.push("--add-reviewer", who);
    if (edit.length) {
      const said = await gh(["pr", "edit", ...ref, ...edit], { timeout: GH_SLOW, ...(input.body !== undefined ? { input: input.body } : {}) });
      if (!said.ok) return { error: trouble(said, "gh refused the edit") };
    }
    if (input.ready !== undefined) {
      const said = await gh(["pr", "ready", ...ref, ...(input.ready ? [] : ["--undo"])], { timeout: GH_WAIT });
      if (!said.ok) return { error: trouble(said, "gh refused to change the draft state") };
    }
    if (input.state !== undefined) {
      const said = await gh(["pr", input.state === "closed" ? "close" : "reopen", ...ref], { timeout: GH_WAIT });
      if (!said.ok) return { error: trouble(said, `gh refused to ${input.state === "closed" ? "close" : "reopen"} the PR`) };
    }
    return { result: identity(target) };
  }

  async function respond(input, chat) {
    const body = input.body === undefined ? undefined : words(input.body);
    if (body === "") return { error: "body should not be empty" };
    const thread = input.reviewThreadId === undefined ? "" : words(input.reviewThreadId);
    if (input.reviewThreadId !== undefined && !thread) return { error: "reviewThreadId should not be empty" };
    if (input.resolved !== undefined && typeof input.resolved !== "boolean") return { error: "resolved should be true or false" };
    if (body === undefined && (!thread || input.resolved === undefined)) return { error: "Pass body, or reviewThreadId with resolved." };
    if (!thread && input.resolved !== undefined) return { error: "resolved needs reviewThreadId." };
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    if (body !== undefined) {
      const said = thread
        ? await gh(["api", "graphql", "-f", `query=${REPLY_MUTATION}`, "-f", `thread=${thread}`, "-f", `body=${body}`], { timeout: GH_WAIT })
        : await gh(["pr", "comment", String(target.number), "-R", target.repository, "--body-file", "-"], { input: body, timeout: GH_WAIT });
      const wrong = thread ? graphqlTrouble(said, "GitHub refused the reply") : said.ok ? "" : trouble(said, "gh refused the comment");
      if (wrong) return { error: wrong };
    }
    if (thread && input.resolved !== undefined) {
      const said = await gh(["api", "graphql", "-f", `query=${input.resolved ? RESOLVE_MUTATION : UNRESOLVE_MUTATION}`, "-f", `thread=${thread}`], { timeout: GH_WAIT });
      const wrong = graphqlTrouble(said, "GitHub refused to change the thread");
      if (wrong) return { error: body === undefined ? wrong : `The reply was posted, but setting resolved failed: ${wrong} Retry without body.` };
    }
    return { result: { ...identity(target), replied: body !== undefined, resolved: input.resolved ?? null } };
  }

  async function merge(input, chat) {
    const expected = words(input.expectedHeadSha);
    if (!expected) return { error: "expectedHeadSha is required: pass headSha from pull_request_read." };
    if (!COMMIT.test(expected)) return { error: "expectedHeadSha should be a commit SHA, as headSha in pull_request_read." };
    const method = input.method === undefined ? "merge" : input.method;
    if (!MERGE_METHODS.includes(method)) return { error: `method should be ${MERGE_METHODS.join(", ")}` };
    if (method === "fast-forward") return { error: "GitHub has no fast-forward-only merge. Use merge, squash or rebase." };
    if (input.auto !== undefined && typeof input.auto !== "boolean") return { error: "auto should be true or false" };
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    const view = await viewPr(target, "state,headRefOid");
    if (view.error) return view;
    const head = String(view.raw.headRefOid || "");
    if (view.raw.state !== "OPEN") return { error: `This PR is already ${stateOf(view.raw)}, so there is nothing to merge.` };
    if (!head || !head.toLowerCase().startsWith(expected.toLowerCase())) {
      return { error: `The head moved: it is ${head || "unknown"} now, not ${expected}. Read the PR again with pull_request_read and decide on the new head.` };
    }
    const args = ["pr", "merge", String(target.number), "-R", target.repository, `--${method}`, "--match-head-commit", head];
    if (input.auto === true) args.push("--auto");
    const said = await gh(args, { timeout: GH_SLOW });
    if (!said.ok) return { error: trouble(said, "gh refused the merge") };
    const after = await viewPr(target, "state");
    return { result: { ...identity(target), state: after.raw ? stateOf(after.raw) : input.auto === true ? "open" : "merged" } };
  }

  async function checksToAct(target, named) {
    const view = await viewPr(target, "statusCheckRollup");
    if (view.error) return view;
    const all = rollupOf(view.raw);
    if (!named) return { checks: all.filter((one) => isFailing(one.status)) };
    const wanted = named.toLowerCase();
    const matches = all.filter((one) => one.name.toLowerCase() === wanted);
    if (!matches.length) return { error: `No check is named ${named}. Checks: ${all.map((one) => one.name).join(", ") || "none"}.` };
    return { checks: matches };
  }

  async function logOf(target, check, tail) {
    const base = { name: check.name, url: check.url };
    if (!check.job) return { ...base, log: null, truncated: false, detail: NOT_A_JOB_LOG };
    const ask = (how) => gh(["run", "view", "-R", target.repository, "--job", String(check.job), how], { timeout: GH_SLOW, maxBuffer: LOG_BYTES });
    let said = await ask("--log-failed");
    if (!said.out.trim()) said = await ask("--log");
    if (!said.out.trim()) return { ...base, log: null, truncated: false, detail: trouble(said, "GitHub kept no log for this job") };
    const lines = said.out.split("\n").filter((line) => line.trim()).map(oneLogLine).filter(Boolean).map((line) => line.text);
    const cut = Math.max(0, lines.length - tail);
    return { ...base, log: lines.slice(cut).join("\n"), truncated: cut > 0, detail: null };
  }

  async function logs(input, chat) {
    const named = input.check === undefined ? "" : words(input.check);
    if (input.check !== undefined && !named) return { error: "check should be the name of a check" };
    const tail = input.tailLines === undefined ? TAIL_DEFAULT : input.tailLines;
    if (!wholeIn(tail, 1, TAIL_MAX)) return { error: `tailLines should be a whole number from 1 to ${TAIL_MAX}` };
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    const picked = await checksToAct(target, named);
    if (picked.error) return picked;
    const shown = named ? picked.checks : picked.checks.slice(0, LOGS_AT_ONCE);
    const rest = named ? [] : picked.checks.slice(LOGS_AT_ONCE);
    const read = await Promise.all(shown.map((check) => logOf(target, check, tail)));
    return {
      result: {
        ...identity(target),
        checks: [...read, ...rest.map((check) => ({ name: check.name, url: check.url, log: null, truncated: false, detail: NOT_READ }))]
      }
    };
  }

  async function rerun(input, chat) {
    const named = input.check === undefined ? "" : words(input.check);
    if (input.check !== undefined && !named) return { error: "check should be the name of a check" };
    const located = await locate(input, chat);
    if (located.error) return located;
    const { target } = located;
    const picked = await checksToAct(target, named);
    if (picked.error) return picked;
    const outcomes = new Map();
    const byRun = new Map();
    picked.checks.forEach((check, at) => {
      if (!check.run || !check.job) return outcomes.set(at, { rerun: false, detail: NOT_A_JOB_RERUN });
      byRun.set(check.run, [...(byRun.get(check.run) || []), { check, at }]);
    });
    for (const [run, members] of byRun) {
      if (!named) {
        const said = await gh(["run", "rerun", String(run), "-R", target.repository, "--failed"], { timeout: GH_SLOW });
        for (const one of members) outcomes.set(one.at, said.ok ? { rerun: true, detail: null } : { rerun: false, detail: trouble(said, "gh refused the rerun") });
        continue;
      }
      const [first, ...others] = members;
      const said = await gh(["run", "rerun", "-R", target.repository, "--job", String(first.check.job)], { timeout: GH_SLOW });
      outcomes.set(first.at, said.ok ? { rerun: true, detail: null } : { rerun: false, detail: trouble(said, "gh refused the rerun") });
      for (const one of others) outcomes.set(one.at, { rerun: false, detail: ONE_JOB_AT_A_TIME });
    }
    return { result: { ...identity(target), checks: picked.checks.map((check, at) => ({ name: check.name, ...outcomes.get(at) })) } };
  }

  const handlers = {
    pull_request_read: read,
    pull_request_list: list,
    pull_request_create: create,
    pull_request_update: update,
    pull_request_respond: respond,
    pull_request_merge: merge,
    ci_logs: logs,
    ci_rerun: rerun
  };

  async function call(tool, args, chat = {}) {
    const run = handlers[tool];
    if (!run) return { error: `${tool || "that"} is not a PR tool` };
    const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};
    try {
      return await run(input, { name: String(chat.name || ""), cwd: String(chat.cwd || "") });
    } catch (wrong) {
      return { error: String(wrong?.message || wrong).slice(0, ERROR_CAP) };
    }
  }

  return { call };
}

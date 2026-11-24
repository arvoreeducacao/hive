import test from "node:test";
import assert from "node:assert/strict";
import { createPrTools } from "../lib/pr-tools.mjs";
import { createPrDomain } from "../routes/prs.mjs";

const SHA = "abc1234def5678abc1234def5678abc1234def56";
const NOT_A_JOB_LOG = "This check is not a GitHub Actions job, so GitHub holds no log for it.";
const NOT_A_JOB_RERUN = "This check is not a GitHub Actions job, so GitHub cannot re-run it.";

const ok = (value) => ({ ok: true, out: typeof value === "string" ? value : JSON.stringify(value), error: "" });
const no = (error) => ({ ok: false, out: "", error });

const rollup = () => [
  { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://github.com/o/r/actions/runs/100/job/200", workflowName: "ci" },
  { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/o/r/actions/runs/100/job/201", workflowName: "ci" },
  { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: "", detailsUrl: "https://github.com/o/r/actions/runs/101/job/300", workflowName: "ci" },
  { __typename: "StatusContext", context: "vercel", state: "FAILURE", targetUrl: "https://vercel.com/o/r", description: "Deploy failed" }
];

const view = (over = {}) => ({
  number: 12, title: "Add the thing", url: "https://github.com/o/r/pull/12", state: "OPEN", isDraft: false, author: { login: "ana" },
  headRefName: "feat-x", baseRefName: "main", headRefOid: SHA, mergeable: "MERGEABLE", autoMergeRequest: null,
  statusCheckRollup: rollup(), body: "the body", ...over
});

const thread = (id, isResolved) => ({
  id, path: "src/a.js", line: 4, isResolved, isOutdated: false,
  comments: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: "kody" }, body: `about ${id}`, createdAt: "2026-11-23T10:00:00Z" }] }
});

function github({ branch = "feat-x", branchPr = true, threads = [], checks = rollup(), state = () => "OPEN" } = {}) {
  return (kind, line) => {
    if (kind === "git" && line === "branch --show-current") return ok(`${branch}\n`);
    if (line === "pr view --json url,headRefName") return branchPr ? ok({ url: "https://github.com/o/r/pull/12", headRefName: branch }) : no(`no pull requests found for branch "${branch}"`);
    const viewing = line.match(/^pr view (\d+) -R o\/r --json/);
    if (viewing) {
      const number = Number(viewing[1]);
      return ok(view({ number, url: `https://github.com/o/r/pull/${number}`, state: state(), statusCheckRollup: checks }));
    }
    if (line.startsWith("api graphql") && line.includes("reviewThreads")) return ok({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: threads } } } } });
    if (line.startsWith("api repos/o/r/compare/main...")) return ok("3\n");
    if (line === "repo view --json nameWithOwner") return ok({ nameWithOwner: "o/r" });
    return null;
  };
}

const chain = (...replies) => (...args) => {
  for (const reply of replies) {
    const said = reply(...args);
    if (said) return said;
  }
  return null;
};

function harness(reply, { registry = [], talk = [], links = [] } = {}) {
  const calls = [];
  let kept = structuredClone(registry);
  const runner = (kind) => async (args, options = {}) => {
    calls.push({ kind, line: args.join(" "), args, options });
    return reply(kind, args.join(" "), args, options) || ok("");
  };
  const tools = createPrTools({
    gh: runner("gh"),
    git: runner("git"),
    readRegistry: async () => structuredClone(kept),
    writeRegistry: async (list) => { kept = structuredClone(list); },
    readLinks: async () => structuredClone(links),
    talkOf: async () => talk,
    now: () => Date.parse("2026-11-23T12:00:00Z")
  });
  return {
    call: (tool, args = {}, chat = { name: "seat", cwd: "/w/repo" }) => tools.call(tool, args, chat),
    calls,
    gh: () => calls.filter((one) => one.kind === "gh").map((one) => one.line),
    registry: () => kept
  };
}

test("pull_request_read reads this chat's branch PR: head, mergeability, check counts and open threads", async () => {
  const hive = harness(github({ threads: [thread("t1", false), thread("t2", true)] }));
  const { result, error } = await hive.call("pull_request_read");
  assert.equal(error, undefined);
  assert.deepEqual(result, {
    host: "github.com", repository: "o/r", number: 12, url: "https://github.com/o/r/pull/12",
    title: "Add the thing", state: "open", isDraft: false, author: "ana", headBranch: "feat-x", baseBranch: "main",
    headSha: SHA, mergeability: "mergeable", behindBy: 3, autoMergeEnabled: false,
    checks: { passed: 1, pending: 1, failed: ["test", "vercel"] }, unresolvedThreads: 1
  });
  const branchLookup = hive.calls.find((one) => one.line === "pr view --json url,headRefName");
  assert.equal(branchLookup.options.cwd, "/w/repo", "the branch PR is looked up where the chat works");
});

test("pull_request_read include adds the body, every check, the open threads and the comments", async () => {
  const talk = [
    { who: "kody", when: "2026-11-23T10:00:00Z", body: "rename this", kind: "inline", path: "src/a.js", line: 3, url: "https://github.com/o/r/pull/12#r1" },
    { who: "ana", when: "2026-11-23T11:00:00Z", body: "", kind: "review", verdict: "approved" }
  ];
  const hive = harness(github({ threads: [thread("t1", false), thread("t2", true)] }), { talk });
  const { result } = await hive.call("pull_request_read", { include: ["body", "checks", "threads", "comments"] });
  assert.equal(result.body, "the body");
  assert.deepEqual(result.checkRuns[0], { name: "test", status: "failure", description: null, url: "https://github.com/o/r/actions/runs/100/job/200", workflow: "ci" });
  assert.deepEqual(result.checkRuns.map((one) => one.status), ["failure", "success", "pending", "failure"]);
  assert.deepEqual(result.conversation.reviewThreads.map((one) => one.id), ["t1"], "resolved threads stay out unless asked");
  assert.deepEqual(result.conversation.reviewThreads[0].comments, [{ author: "kody", body: "about t1", createdAt: "2026-11-23T10:00:00Z" }]);
  assert.deepEqual(result.conversation.comments.map((one) => [one.kind, one.author, one.reviewState, one.path]), [["review-comment", "kody", null, "src/a.js"], ["review", "ana", "approved", null]]);
  assert.equal(result.conversation.nextCursor, null);
  const all = await hive.call("pull_request_read", { include: ["threads"], includeResolved: true });
  assert.deepEqual(all.result.conversation.reviewThreads.map((one) => one.id), ["t1", "t2"]);
  assert.equal("comments" in all.result.conversation, false);
});

test("pull_request_read pages a long diff, and the cursor reads only the rest of that diff", async () => {
  const patch = `${Array.from({ length: 2400 }, (_, n) => `+line ${n} ${"x".repeat(12)}`).join("\n")}\n`;
  const hive = harness(chain((kind, line) => (line === "pr diff 12 -R o/r" ? ok(patch) : null), github()));
  const first = await hive.call("pull_request_read", { include: ["diff"] });
  assert.ok(first.result.diff.patch.length <= 32000);
  assert.ok(first.result.diff.patch.endsWith("\n"), "a page ends at the end of a line");
  assert.equal(first.result.diff.truncated, true);
  assert.ok(first.result.diff.nextCursor);
  const second = await hive.call("pull_request_read", { cursor: first.result.diff.nextCursor });
  assert.equal(second.result.diff.nextCursor, null);
  assert.equal(first.result.diff.patch + second.result.diff.patch, patch);
  assert.equal("body" in second.result, false);
  const bad = await hive.call("pull_request_read", { cursor: "not-a-cursor" });
  assert.match(bad.error, /This cursor is not from this tool/);
});

test("without a PR on the branch, the PR the registry links to this chat is the default, and two of them ask for a number", async () => {
  const one = harness(github({ branch: "main", branchPr: false }), { registry: [{ key: "o/r#7", session: "seat" }, { key: "o/r#8", session: "other" }, { key: "o/r#9", session: "seat", retired: true }] });
  const read = await one.call("pull_request_read");
  assert.equal(read.result.number, 7);
  const two = harness(github({ branch: "main", branchPr: false }), { registry: [{ key: "o/r#7", session: "seat" }, { key: "x/y#3", session: "seat" }] });
  assert.equal((await two.call("pull_request_read")).error, "This chat has 2 PRs: o/r#7, x/y#3. Pass number and repository.");
  const none = harness(github({ branch: "main", branchPr: false }));
  assert.equal((await none.call("pull_request_read")).error, "This chat's branch has no known PR. Pass number, or open one with pull_request_create.");
  const away = harness(github());
  assert.match((await away.call("pull_request_read", { number: 4 }, { name: "seat", cwd: "" })).error, /Pass repository/);
  assert.deepEqual(away.gh(), []);
});

test("pull_request_list lists the chat's repository, recently updated first, without a PR link per row", async () => {
  const entries = Array.from({ length: 35 }, (_, n) => ({
    number: 100 - n, title: `PR ${n}`, author: { login: "ana" }, headRefName: `b${n}`, baseRefName: "main", state: "OPEN", isDraft: n === 0,
    reviewDecision: n === 0 ? "APPROVED" : "REVIEW_REQUIRED", statusCheckRollup: n === 0 ? rollup() : [], updatedAt: "2026-11-23T10:00:00Z"
  }));
  const hive = harness(chain((kind, line, args) => (line.startsWith("pr list") ? ok(entries.slice(0, Number(args[args.indexOf("--limit") + 1]))) : null), github()));
  const { result } = await hive.call("pull_request_list", { involvement: "authored", query: "label:bug", limit: 10 });
  const listed = hive.calls.find((one) => one.line.startsWith("pr list"));
  assert.deepEqual(listed.args.slice(0, 9), ["pr", "list", "-R", "o/r", "--state", "open", "--search", "label:bug author:@me sort:updated-desc", "--limit"]);
  assert.equal(listed.args[9], "11");
  assert.equal(result.repository, "o/r");
  assert.equal(result.pullRequests.length, 10);
  assert.deepEqual(result.pullRequests[0], { number: 100, title: "PR 0", author: "ana", headBranch: "b0", baseBranch: "main", state: "open", isDraft: true, reviewDecision: "approved", checksState: "failing", updatedAt: "2026-11-23T10:00:00Z" });
  assert.equal(result.pullRequests.some((one) => "url" in one), false, "a list of links would pin every PR to the chat");
  assert.ok(result.nextCursor);
  const next = await hive.call("pull_request_list", { cursor: result.nextCursor, limit: 10 });
  assert.deepEqual(next.result.pullRequests.map((one) => one.number), [90, 89, 88, 87, 86, 85, 84, 83, 82, 81]);
  assert.match((await hive.call("pull_request_list", { limit: 101 })).error, /limit should be/);
  assert.match((await hive.call("pull_request_list", { state: "draft" })).error, /state should be/);
});

const creating = (existing = []) => chain((kind, line) => {
  if (line === "repo view o/r --json defaultBranchRef") return ok({ defaultBranchRef: { name: "main" } });
  if (kind === "git" && line.startsWith("push")) return ok("");
  if (line.startsWith("pr list -R o/r --head feat-x")) return ok(existing);
  if (line.startsWith("pr create")) return ok("https://github.com/o/r/pull/13\n");
  return null;
}, github());

test("pull_request_create pushes the chat's branch, opens the PR with the body on stdin and links it to the chat", async () => {
  const hive = harness(creating());
  const { result } = await hive.call("pull_request_create", { title: "Add x", body: "Why it changes", draft: true, base: "release" });
  assert.deepEqual(result, { host: "github.com", repository: "o/r", number: 13, url: "https://github.com/o/r/pull/13", created: true });
  const push = hive.calls.find((one) => one.kind === "git" && one.args[0] === "push");
  assert.deepEqual(push.args, ["push", "--set-upstream", "origin", "feat-x"]);
  assert.equal(push.options.cwd, "/w/repo");
  const made = hive.calls.find((one) => one.line.startsWith("pr create"));
  assert.deepEqual(made.args, ["pr", "create", "-R", "o/r", "--head", "feat-x", "--title", "Add x", "--body-file", "-", "--base", "release", "--draft"]);
  assert.equal(made.options.input, "Why it changes");
  assert.ok(hive.calls.indexOf(push) < hive.calls.indexOf(made), "the branch is pushed before the PR opens");
  assert.deepEqual(hive.registry(), [{ key: "o/r#13", session: "seat", at: "2026-11-23T12:00:00.000Z" }]);
});

test("pull_request_create returns the branch's open PR instead of opening another, and refuses the default branch or a private PR", async () => {
  const again = harness(creating([{ url: "https://github.com/o/r/pull/12" }]));
  const { result } = await again.call("pull_request_create", { title: "Add x", body: "" });
  assert.equal(result.created, false);
  assert.equal(result.number, 12);
  assert.equal(again.gh().some((line) => line.startsWith("pr create")), false);
  const trunk = harness(chain((kind, line) => (kind === "git" && line === "branch --show-current" ? ok("main\n") : null), creating()));
  assert.equal((await trunk.call("pull_request_create", { title: "Add x", body: "" })).error, "This chat is on main, the repository's default branch. Create a branch for the work first.");
  assert.equal(trunk.calls.some((one) => one.args[0] === "push"), false);
  const hidden = harness(creating());
  assert.match((await hidden.call("pull_request_create", { title: "Add x", body: "", private: true })).error, /GitHub has no private PRs/);
  assert.deepEqual(hidden.calls, []);
});

test("pull_request_update edits, flips draft and closes through gh, and asks for something to do", async () => {
  const hive = harness(github());
  assert.equal((await hive.call("pull_request_update", { number: 12, repository: "o/r" })).error, "Pass title, body, ready, state, addLabels, removeLabels, or requestReviewers.");
  assert.deepEqual(hive.calls, []);
  const { result } = await hive.call("pull_request_update", { number: 12, repository: "o/r", title: "New", body: "Fresh body", addLabels: ["bug"], removeLabels: ["wip"], requestReviewers: ["org/team"], ready: false, state: "closed" });
  assert.deepEqual(result, { host: "github.com", repository: "o/r", number: 12, url: "https://github.com/o/r/pull/12" });
  assert.deepEqual(hive.gh(), [
    "pr edit 12 -R o/r --title New --body-file - --add-label bug --remove-label wip --add-reviewer org/team",
    "pr ready 12 -R o/r --undo",
    "pr close 12 -R o/r"
  ]);
  assert.equal(hive.calls[0].options.input, "Fresh body");
  assert.match((await hive.call("pull_request_update", { number: 12, repository: "o/r", addLabels: [] })).error, /addLabels should list 1 to 25 names/);
});

test("pull_request_respond comments on the PR, or replies to a thread and resolves it", async () => {
  const hive = harness(github());
  const said = await hive.call("pull_request_respond", { body: "Thanks" });
  assert.deepEqual([said.result.replied, said.result.resolved], [true, null]);
  const comment = hive.calls.find((one) => one.line.startsWith("pr comment"));
  assert.deepEqual(comment.args, ["pr", "comment", "12", "-R", "o/r", "--body-file", "-"]);
  assert.equal(comment.options.input, "Thanks");

  const threaded = harness(github());
  const { result } = await threaded.call("pull_request_respond", { number: 12, repository: "o/r", reviewThreadId: "PRRT_1", body: "Fixed", resolved: true });
  assert.deepEqual([result.replied, result.resolved], [true, true]);
  const mutations = threaded.calls.filter((one) => one.line.startsWith("api graphql")).map((one) => one.args);
  assert.match(mutations[0][3], /addPullRequestReviewThreadReply/);
  assert.ok(mutations[0].includes("thread=PRRT_1") && mutations[0].includes("body=Fixed"));
  assert.match(mutations[1][3], /resolveReviewThread/);

  assert.equal((await hive.call("pull_request_respond", { resolved: true })).error, "Pass body, or reviewThreadId with resolved.");
  assert.equal((await hive.call("pull_request_respond", { body: "x", resolved: true })).error, "resolved needs reviewThreadId.");
});

test("pull_request_respond says the reply landed when only resolving failed, so a retry does not post it twice", async () => {
  const hive = harness(chain((kind, line) => (line.includes("resolveReviewThread") ? ok({ errors: [{ message: "Resource not accessible" }] }) : null), github()));
  const { error } = await hive.call("pull_request_respond", { reviewThreadId: "PRRT_1", body: "Fixed", resolved: true });
  assert.equal(error, "The reply was posted, but setting resolved failed: Resource not accessible Retry without body.");
});

function merging(refusal = "") {
  let merged = false;
  return chain((kind, line) => {
    if (line.startsWith("pr merge")) {
      if (refusal) return no(refusal);
      merged = !line.includes("--auto");
      return ok("");
    }
    return null;
  }, github({ state: () => (merged ? "MERGED" : "OPEN") }));
}

test("pull_request_merge refuses when the head moved from expectedHeadSha, and never reaches gh pr merge", async () => {
  const hive = harness(merging());
  const { error } = await hive.call("pull_request_merge", { expectedHeadSha: "fff0000" });
  assert.equal(error, `The head moved: it is ${SHA} now, not fff0000. Read the PR again with pull_request_read and decide on the new head.`);
  assert.equal(hive.gh().some((line) => line.startsWith("pr merge")), false);
  assert.match((await hive.call("pull_request_merge", {})).error, /expectedHeadSha is required/);
  assert.match((await hive.call("pull_request_merge", { expectedHeadSha: SHA, method: "fast-forward" })).error, /no fast-forward/);
});

test("pull_request_merge pins GitHub to the head it read, never as admin, and tells a queued merge from a done one", async () => {
  const hive = harness(merging());
  const { result } = await hive.call("pull_request_merge", { expectedHeadSha: SHA.slice(0, 7), method: "squash" });
  assert.equal(result.state, "merged");
  const merge = hive.calls.find((one) => one.line.startsWith("pr merge"));
  assert.deepEqual(merge.args, ["pr", "merge", "12", "-R", "o/r", "--squash", "--match-head-commit", SHA]);
  const auto = harness(merging());
  const queued = await auto.call("pull_request_merge", { expectedHeadSha: SHA, auto: true });
  assert.equal(queued.result.state, "open");
  assert.ok(auto.gh().find((line) => line.startsWith("pr merge")).endsWith("--merge --match-head-commit " + SHA + " --auto"));
  assert.equal([...hive.gh(), ...auto.gh()].some((line) => line.includes("--admin")), false);
});

test("a merge GitHub blocks comes back without the hint to force it as admin", async () => {
  const hive = harness(merging("X Pull request o/r#12 is not mergeable: the base branch policy prohibits the merge.\nTo have the pull request merged after all the requirements have been met, add the `--auto` flag.\nTo use administrator privileges to immediately merge the pull request, add the `--admin` flag."));
  const { error } = await hive.call("pull_request_merge", { expectedHeadSha: SHA });
  assert.match(error, /base branch policy prohibits the merge/);
  assert.doesNotMatch(error, /admin/);
});

const jobLog = (lines) => Array.from({ length: lines }, (_, n) => `ci\tRun tests\t2026-11-23T10:00:00.1234567Z \u001b[31mline ${n}\u001b[0m`).join("\n");

test("ci_logs tails the failing checks' logs, 200 lines by default, and says which checks hold no log", async () => {
  const hive = harness(chain((kind, line) => (line === "run view -R o/r --job 200 --log-failed" ? ok(jobLog(300)) : null), github()));
  const { result } = await hive.call("ci_logs");
  assert.deepEqual(result.checks.map((one) => one.name), ["test", "vercel"]);
  const [test0, vercel] = result.checks;
  assert.equal(test0.log.split("\n").length, 200);
  assert.equal(test0.log.split("\n")[0], "line 100", "timestamps and colours are cleaned off");
  assert.equal(test0.truncated, true);
  assert.equal(test0.url, "https://github.com/o/r/actions/runs/100/job/200");
  assert.deepEqual(vercel, { name: "vercel", url: "https://vercel.com/o/r", log: null, truncated: false, detail: NOT_A_JOB_LOG });
  const short = await hive.call("ci_logs", { tailLines: 5 });
  assert.equal(short.result.checks[0].log, "line 295\nline 296\nline 297\nline 298\nline 299");
  assert.match((await hive.call("ci_logs", { tailLines: 2001 })).error, /tailLines should be a whole number from 1 to 2000/);
});

test("ci_logs reads a named check's whole log when it did not fail, and names the checks when the name is wrong", async () => {
  const hive = harness(chain((kind, line) => (line === "run view -R o/r --job 201 --log" ? ok(jobLog(3)) : null), github()));
  const { result } = await hive.call("ci_logs", { check: "LINT" });
  assert.deepEqual(result.checks.map((one) => [one.name, one.log]), [["lint", "line 0\nline 1\nline 2"]]);
  assert.ok(hive.gh().includes("run view -R o/r --job 201 --log-failed"), "the failed steps are tried first");
  assert.equal((await hive.call("ci_logs", { check: "nope" })).error, "No check is named nope. Checks: test, lint, build, vercel.");
});

test("ci_logs reads five failing logs at most and leaves the rest a name away", async () => {
  const many = Array.from({ length: 7 }, (_, n) => ({ __typename: "CheckRun", name: `job ${n}`, status: "COMPLETED", conclusion: "FAILURE", detailsUrl: `https://github.com/o/r/actions/runs/100/job/${400 + n}` }));
  const hive = harness(chain((kind, line) => (line.startsWith("run view") ? ok(jobLog(2)) : null), github({ checks: many })));
  const { result } = await hive.call("ci_logs");
  assert.equal(result.checks.filter((one) => one.log).length, 5);
  assert.deepEqual(result.checks.slice(5).map((one) => one.detail), ["Not read, to keep the reply short. Ask for this check by name.", "Not read, to keep the reply short. Ask for this check by name."]);
});

test("ci_rerun re-runs the failing jobs run by run, or one named job, and says which checks GitHub cannot re-run", async () => {
  const hive = harness(github());
  const { result } = await hive.call("ci_rerun");
  assert.deepEqual(result.checks, [{ name: "test", rerun: true, detail: null }, { name: "vercel", rerun: false, detail: NOT_A_JOB_RERUN }]);
  assert.ok(hive.gh().includes("run rerun 100 -R o/r --failed"));
  const named = harness(github());
  const one = await named.call("ci_rerun", { check: "lint" });
  assert.deepEqual(one.result.checks, [{ name: "lint", rerun: true, detail: null }]);
  assert.ok(named.gh().includes("run rerun -R o/r --job 201"));
  const refused = harness(chain((kind, line) => (line.startsWith("run rerun") ? no("run 100 cannot be rerun; it is still in progress") : null), github()));
  const said = await refused.call("ci_rerun");
  assert.deepEqual(said.result.checks[0], { name: "test", rerun: false, detail: "run 100 cannot be rerun; it is still in progress" });
});

test("an unknown tool and a throwing runner answer as errors, never as a crash", async () => {
  const hive = harness(() => { throw new Error("gh exploded"); });
  assert.equal((await hive.call("pull_request_delete")).error, "pull_request_delete is not a PR tool");
  assert.equal((await hive.call("pull_request_read")).error, "gh exploded");
});

function room({ sessions = [], reply = github() } = {}) {
  const routes = new Map();
  const calls = [];
  const shr = async (cmd, args, options = {}) => {
    calls.push({ cmd, line: args.join(" "), options });
    return reply(cmd, args.join(" "), args, options) || ok("");
  };
  const domain = createPrDomain({
    sh: async (...args) => (await shr(...args)).out,
    shr,
    extractJson: (raw) => { try { return JSON.parse(raw); } catch { return null; } },
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    liveSessions: () => sessions,
    ceilingOfChat: () => "full",
    readRegistry: async () => [],
    writeRegistry: async () => {},
    retire: async () => {},
    placeExists: (path) => path.startsWith("/w/")
  });
  domain.register((method, path, handler) => routes.set(path, { method, handler }), async (req) => req.body || {});
  const post = async (body) => {
    const answers = [];
    await routes.get("/api/prs/tool").handler({ body }, {}, new URL("http://hive/api/prs/tool"), (value, status = 200) => answers.push({ value, status }));
    return answers[0];
  };
  return { post, calls, domain, routes };
}

test("the tool route runs where the chat's latest worktree is, and a write drops the PR from the cache", async () => {
  const hive = room({
    sessions: [{ name: "seat", where: "local", cwd: "/w/hub", trees: [{ repo: "r", branch: "feat-x", path: "/w/hub/.wt-x", main: false }] }],
    reply: merging()
  });
  assert.equal(hive.routes.get("/api/prs/tool").method, "POST");
  hive.domain.prCache.set("o/r#12", { at: Date.now(), data: { state: "open" } });
  const read = await hive.post({ name: "seat", where: "local", tool: "pull_request_read", args: {} });
  assert.equal(read.status, 200);
  assert.equal(read.value.result.number, 12);
  assert.equal(hive.calls.find((one) => one.cmd === "git").options.cwd, "/w/hub/.wt-x");
  assert.ok(hive.domain.prCache.has("o/r#12"), "a read leaves the cache alone");
  const merged = await hive.post({ name: "seat", where: "local", tool: "pull_request_merge", args: { expectedHeadSha: SHA } });
  assert.equal(merged.value.result.state, "merged");
  assert.equal(hive.domain.prCache.has("o/r#12"), false);
});

test("the tool route answers 400 with the reason, and a chat on the server gets no local checkout", async () => {
  const hive = room({ sessions: [{ name: "pod", where: "cloud", cwd: "/w/pod", trees: [] }] });
  assert.deepEqual(await hive.post({ tool: "pull_request_read" }), { value: { error: "a PR tool runs for a chat of the hive, and no chat was named" }, status: 400 });
  const far = await hive.post({ name: "pod", where: "cloud", tool: "pull_request_read", args: {} });
  assert.equal(far.status, 400);
  assert.equal(far.value.error, "This chat's branch has no known PR. Pass number, or open one with pull_request_create.");
  assert.equal(hive.calls.some((one) => one.cmd === "git"), false);
});

test("this chat's PR is first the one the person linked to it, then the branch PR", async () => {
  const hive = harness(github(), { links: [{ session: "seat", where: "local", key: "o/r#40", at: "2026-11-23T10:00:00Z" }, { session: "other", key: "o/r#41" }] });
  const { result } = await hive.call("pull_request_read");
  assert.equal(result.number, 40);
  assert.ok(!hive.calls.some((one) => one.line === "pr view --json url,headRefName"), "the branch is not looked up when the chat has a linked PR");
  const unlinked = harness(github());
  assert.equal((await unlinked.call("pull_request_read")).result.number, 12);
});

test("pull_request_read counts open threads by their state alone, and fetches the comments only when threads are asked", async () => {
  const summary = harness(github({ threads: [thread("t1", false)] }));
  await summary.call("pull_request_read");
  const counted = summary.calls.filter((one) => one.line.startsWith("api graphql") && one.line.includes("reviewThreads"));
  assert.equal(counted.length, 1);
  assert.ok(!counted[0].line.includes("comments(first"), "a summary does not download the comment bodies");
  assert.ok(counted[0].line.includes("isResolved"));
  const detailed = harness(github({ threads: [thread("t1", false)] }));
  await detailed.call("pull_request_read", { include: ["threads"] });
  const fetched = detailed.calls.find((one) => one.line.startsWith("api graphql") && one.line.includes("reviewThreads"));
  assert.ok(fetched.line.includes("comments(first"));
});

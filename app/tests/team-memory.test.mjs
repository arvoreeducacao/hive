import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTeamMemory, findSecrets } from "../lib/team-memory-rules.mjs";
import { branchFor, createTeamMemoryHub, deleteChanges, proposalChanges, repoOfRemote, rollupState, teamCopy, teamFileName } from "../lib/team-memory.mjs";
import { readMemory } from "../lib/memory-files.mjs";

const memoryRaw = (name, body = "O fato.", extra = "") => `---\nname: ${name}\ndescription: "Descrição de ${name}"\nmetadata:\n  type: project\n  originSessionId: abc\n${extra}---\n\n${body}\n`;

const AWS = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const GITHUB = `ghp_${"a".repeat(36)}`;

test("the secret check is the one the hub CI runs, pattern by pattern", () => {
  assert.deepEqual(findSecrets("a.md", `chave ${AWS} aqui`).map((one) => one.what), ["AWS key"]);
  assert.deepEqual(findSecrets("a.md", GITHUB).map((one) => one.what), ["GitHub token"]);
  assert.deepEqual(findSecrets("a.md", `xoxb-${"1".repeat(12)}`).map((one) => one.what), ["Slack token"]);
  assert.deepEqual(findSecrets("a.md", `sk-ant-${"x".repeat(24)}`).map((one) => one.what), ["API key"]);
  assert.deepEqual(findSecrets("a.md", "-----BEGIN RSA PRIVATE KEY-----").map((one) => one.what), ["private key"]);
  assert.deepEqual(findSecrets("a.md", "api_token: abcdefgh123").map((one) => one.what), ["user secret"]);
  assert.deepEqual(findSecrets("a.md", "o access_token do aluno é o Author Code"), []);
});

test("the folder check finds an unlisted file, a dangling link and a bad name, like the CI", () => {
  const problems = checkTeamMemory({
    index: "- [A](a.md) — x\n- [Sumiu](sumiu.md) — y\n",
    files: { "a.md": memoryRaw("a"), "b.md": memoryRaw("b"), "C.md": memoryRaw("C") }
  });
  const kinds = problems.map((one) => `${one.file}:${one.kind}`);
  assert.ok(kinds.includes("MEMORY.md:dangling"));
  assert.ok(kinds.includes("b.md:unlisted"));
  assert.ok(kinds.includes("C.md:file-name"));
  assert.ok(!kinds.some((one) => one.startsWith("a.md")));
});

test("a file name becomes the hub's: lowercase, no accents, hyphens only", () => {
  assert.equal(teamFileName("Reader_Híbrida é o nome.md"), "reader-hibrida-e-o-nome.md");
  assert.equal(teamFileName("---.md"), "memoria.md");
});

test("the team copy says scope team, takes the file's name and leaves the session id behind", () => {
  const copy = teamCopy(memoryRaw("Reader_Híbrida", "corpo", "  scope: personal\n"), "reader-hibrida.md");
  const memory = readMemory("reader-hibrida.md", copy);
  assert.equal(memory.name, "reader-hibrida");
  assert.equal(memory.scope, "team");
  assert.doesNotMatch(copy, /originSessionId/);
});

test("a proposal writes each memory, appends its line to the team index and passes the CI check", () => {
  const built = proposalChanges({
    memories: [
      { id: "p/deploy.md", file: "deploy.md", raw: memoryRaw("deploy"), title: "Deploy em PR é preview", hook: "não é produção" },
      { id: "p/sales.md", file: "sales.md", raw: memoryRaw("sales"), title: "", hook: "" }
    ],
    teamIndex: "# Memória do time\n- [Antiga](antiga.md) — já estava\n",
    teamFiles: ["antiga.md"]
  });
  assert.equal(built.blocked, false);
  assert.deepEqual(built.changes.map((one) => one.path), [".claude/team-memory/deploy.md", ".claude/team-memory/sales.md", ".claude/team-memory/MEMORY.md"]);
  const index = built.changes.at(-1).content;
  assert.equal(index, "# Memória do time\n- [Antiga](antiga.md) — já estava\n- [Deploy em PR é preview](deploy.md) — não é produção\n- [sales](sales.md) — Descrição de sales\n");
  const files = { "antiga.md": memoryRaw("antiga"), ...Object.fromEntries(built.changes.slice(0, 2).map((one) => [one.path.split("/").pop(), one.content])) };
  assert.deepEqual(checkTeamMemory({ index, files }), []);
});

test("a proposal with a secret is blocked and says which memory and what it looks like", () => {
  const built = proposalChanges({ memories: [{ id: "p/x.md", file: "x.md", raw: memoryRaw("x", `use ${GITHUB}`) }], teamIndex: "", teamFiles: [] });
  assert.equal(built.blocked, true);
  assert.deepEqual(built.problems.map((one) => [one.from, one.kind, one.what]), [["p/x.md", "secret", "GitHub token"]]);
});

test("a proposal never overwrites a team memory with the same file name", () => {
  const built = proposalChanges({ memories: [{ id: "p/antiga.md", file: "antiga.md", raw: memoryRaw("antiga") }], teamIndex: "- [A](antiga.md)\n", teamFiles: ["antiga.md"] });
  assert.equal(built.blocked, true);
  assert.equal(built.problems[0].kind, "exists");
});

test("deleting a team memory removes the file and its index line", () => {
  const built = deleteChanges({ file: "a.md", teamIndex: "- [A](a.md) — x\n- [B](b.md) — y\n" });
  assert.deepEqual(built.changes, [{ path: ".claude/team-memory/a.md", content: null }, { path: ".claude/team-memory/MEMORY.md", content: "- [B](b.md) — y\n" }]);
});

test("the checks of a pull request read as one word", () => {
  assert.equal(rollupState([]), "none");
  assert.equal(rollupState([{ conclusion: "SUCCESS" }, { state: "SUCCESS" }]), "passing");
  assert.equal(rollupState([{ conclusion: "SUCCESS" }, { status: "IN_PROGRESS", conclusion: "" }]), "pending");
  assert.equal(rollupState([{ conclusion: "FAILURE" }, { status: "IN_PROGRESS" }]), "failing");
});

test("the repository comes from the hub remote, and the branch carries the login and the first file", () => {
  assert.equal(repoOfRemote("https://github.com/acme/acme-hub.git"), "acme/acme-hub");
  assert.equal(repoOfRemote("git@github.com:acme/hub.git"), "acme/hub");
  assert.equal(repoOfRemote("https://gitlab.com/acme/hub"), "");
  assert.equal(branchFor("Jonas", ["deploy-em-pr.md"], new Date("2026-11-10T12:34:56Z")), "jonas/-/memoria-deploy-em-pr-202611101234");
});

function fakeGh(answers) {
  const calls = [];
  const gh = async (args, opts = {}) => {
    calls.push({ args, input: opts.input ? JSON.parse(opts.input) : undefined });
    const key = args.join(" ");
    for (const [match, answer] of answers) {
      if (key.includes(match)) return typeof answer === "function" ? answer(args, opts) : answer;
    }
    return { ok: false, out: "", error: `no answer for ${key}` };
  };
  return { gh, calls };
}

const ok = (value) => ({ ok: true, out: typeof value === "string" ? value : JSON.stringify(value), error: "" });

const TREE = { data: { repository: { object: { entries: [
  { name: "MEMORY.md", type: "blob", object: { text: "- [Antiga](antiga.md) — já estava\n" } },
  { name: "antiga.md", type: "blob", object: { text: memoryRaw("antiga") } }
] } } } };

test("proposing opens one commit on a new branch from main and a pull request against main", async () => {
  const { gh, calls } = fakeGh([
    ["api user", ok("jonas\n")],
    ["api graphql", ok(TREE)],
    ["git/ref/heads/main", ok({ object: { sha: "main-sha" } })],
    ["git/commits/main-sha", ok({ tree: { sha: "tree-sha" } })],
    ["git/trees", ok({ sha: "new-tree" })],
    ["POST repos/acme/hub/git/commits", ok({ sha: "new-commit" })],
    ["git/refs", ok({ ref: "x" })],
    ["pulls", ok({ number: 12, html_url: "https://github.com/acme/hub/pull/12" })]
  ]);
  const hub = createTeamMemoryHub({ gh, repo: "acme/hub", now: () => new Date("2026-11-10T12:00:00Z") });
  const said = await hub.propose({ memories: [{ id: "p/deploy.md", file: "deploy.md", raw: memoryRaw("deploy"), title: "Deploy", hook: "preview" }], title: "Memória do time: deploy", body: "corpo" });
  assert.equal(said.state, "ok");
  assert.equal(said.pr.number, 12);
  const tree = calls.find((one) => one.args.includes("repos/acme/hub/git/trees")).input;
  assert.equal(tree.base_tree, "tree-sha");
  assert.deepEqual(tree.tree.map((one) => one.path), [".claude/team-memory/deploy.md", ".claude/team-memory/MEMORY.md"]);
  assert.match(tree.tree[1].content, /- \[Antiga\]\(antiga\.md\)[^\n]*\n- \[Deploy\]\(deploy\.md\) — preview\n$/);
  assert.deepEqual(calls.find((one) => one.args.includes("repos/acme/hub/git/commits") && one.input).input.parents, ["main-sha"]);
  assert.equal(calls.find((one) => one.args.includes("repos/acme/hub/git/refs")).input.ref, "refs/heads/jonas/-/memoria-deploy-202611101200");
  assert.deepEqual(calls.find((one) => one.args.includes("repos/acme/hub/pulls")).input, { title: "Memória do time: deploy", body: "corpo", head: "jonas/-/memoria-deploy-202611101200", base: "main" });
});

test("a blocked proposal never reaches GitHub past the read of main", async () => {
  const { gh, calls } = fakeGh([["api graphql", ok(TREE)]]);
  const hub = createTeamMemoryHub({ gh, repo: "acme/hub" });
  const said = await hub.propose({ memories: [{ id: "p/x.md", file: "x.md", raw: memoryRaw("x", AWS) }], title: "t", body: "" });
  assert.equal(said.state, "blocked");
  assert.equal(calls.length, 1);
});

test("the person who proposed cannot approve their own pull request", async () => {
  const { gh, calls } = fakeGh([
    ["api user", ok("jonas")],
    ["pr view 7", ok({ author: { login: "Jonas" }, state: "OPEN", files: [{ path: ".claude/team-memory/a.md" }] })]
  ]);
  const hub = createTeamMemoryHub({ gh, repo: "acme/hub" });
  assert.equal((await hub.approve(7)).state, "own");
  assert.ok(!calls.some((one) => one.args.includes("review")));
});

test("approving someone else's proposal reviews it and merges it, and a refused merge keeps the approval", async () => {
  const view = ok({ author: { login: "bruno" }, state: "OPEN", files: [{ path: ".claude/team-memory/a.md" }] });
  const merged = fakeGh([["api user", ok("jonas")], ["pr view 7", view], ["pr review 7", ok("")], ["pr merge 7", ok("")]]);
  assert.equal((await createTeamMemoryHub({ gh: merged.gh, repo: "acme/hub" }).approve(7)).state, "ok");
  assert.deepEqual(merged.calls.filter((one) => one.args[0] === "pr" && one.args[1] !== "view").map((one) => one.args.slice(0, 2).concat(one.args.slice(-1))), [["pr", "review", "--approve"], ["pr", "merge", "--merge"]]);
  const held = fakeGh([["api user", ok("jonas")], ["pr view 7", view], ["pr review 7", ok("")], ["pr merge 7", { ok: false, out: "", error: "Pull request is not mergeable: required checks pending" }]]);
  const said = await createTeamMemoryHub({ gh: held.gh, repo: "acme/hub" }).approve(7);
  assert.equal(said.state, "approved");
  assert.match(said.why, /required checks/);
});

test("the proposals tab lists only open pull requests that touch the team memory, with their content and checks", async () => {
  const { gh } = fakeGh([
    ["api user", ok("jonas")],
    ["pr list", ok([
      { number: 3, title: "outra coisa", files: [{ path: "README.md" }] },
      { number: 4, title: "Memória do time: deploy", url: "u", author: { login: "bruno" }, headRefOid: "head4", statusCheckRollup: [{ conclusion: "SUCCESS" }], files: [{ path: ".claude/team-memory/deploy.md", changeType: "ADDED" }, { path: ".claude/team-memory/MEMORY.md", changeType: "MODIFIED" }] }
    ])],
    ["expr=head4:", ok({ data: { repository: { object: { entries: [
      { name: "MEMORY.md", type: "blob", object: { text: "- [Deploy](deploy.md) — x\n" } },
      { name: "deploy.md", type: "blob", object: { text: memoryRaw("deploy") } }
    ] } } } })]
  ]);
  const said = await createTeamMemoryHub({ gh, repo: "acme/hub" }).proposals();
  assert.equal(said.state, "ok");
  assert.deepEqual(said.proposals.map((one) => one.number), [4]);
  const [one] = said.proposals;
  assert.equal(one.checks, "passing");
  assert.deepEqual(one.problems, []);
  assert.deepEqual(one.memories.map((memory) => [memory.file, memory.change, memory.name]), [["deploy.md", "added", "deploy"]]);
});

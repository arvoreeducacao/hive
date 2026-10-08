import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

const STUBS = `
  const HUB = "/hub";
  const POD = "";
  const NS = "dev-workspaces";
  const BASH = "bash";
  const spawn = () => { throw new Error("no child processes in this test"); };
  const sh = async () => "";
  const shr = async () => ({ ok: false, out: "", error: "" });
  const readFile = async () => "";
  const writeFile = async () => {};
  const statSync = () => ({ size: 10 });
  const existsSync = () => true;
  const join = (...p) => p.join("/");
  let ignoreFile = "";
  const readFileSync = () => { if (!ignoreFile) throw new Error("no .hiveignore"); return ignoreFile; };
  const setIgnore = (text) => { ignoreFile = text; };
`;

const EXPOSE = `
  return { readIndexWalk, rankIndex, pathScore, fuzzyScore, readSearchWalk, isRepoRel, isFileRel, hiveIgnore, setIgnore, INDEX_WALK, SEARCH_WALK };
`;

const layer = slice("const INDEX_TTL = 90000;", "const HISTORY_LINES");
const files = new Function(`${STUBS}\n${layer}\n${EXPOSE}`)();

const row = (repo, branch, path) => `${repo}\t${branch}\t${path}`;

test("the index walk reads repo, branch and path out of every line", () => {
  const rows = files.readIndexWalk([
    row("api", "main", "src/app.ts"),
    row(".worktrees/fix/api", "fix/lock", "src/app.ts"),
    "garbage without tabs",
    ""
  ].join("\n"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { repo: "api", name: "api", branch: "main", path: "src/app.ts" });
  assert.equal(rows[1].name, "api", "a worktree keeps the name of the repo it is a copy of");
  assert.equal(rows[1].repo, ".worktrees/fix/api");
});

test(".hiveignore takes out what git has no opinion about", () => {
  files.setIgnore("# mine\n*.pdf\ndocs/mockups/\n");
  const ignores = files.hiveIgnore();
  const rows = files.readIndexWalk([
    row("hub", "main", "docs/relatorio.pdf"),
    row("hub", "main", "docs/mockups/hive-editor.html"),
    row("hub", "main", "src/index.ts")
  ].join("\n"), ignores);
  assert.deepEqual(rows.map((r) => r.path), ["src/index.ts"]);
  files.setIgnore("");
});

test("the name of the file wins over the path, and a tight match wins over a scattered one", () => {
  const rows = files.readIndexWalk([
    row("api", "main", "src/shared/services/cron-lock.service.ts"),
    row("docusaurus-to-md", "main", "pnpm-lock.yaml"),
    row("api", "main", "src/modules/catalogation/create-converse-com-livro-feedback.use-case.ts")
  ].join("\n"));
  const found = files.rankIndex(rows, "cronlock", 3);
  assert.equal(found[0].path, "src/shared/services/cron-lock.service.ts");
});

test("an exact file name beats everything else", () => {
  const rows = files.readIndexWalk([
    row("a", "main", "src/deep/nested/server.mjs"),
    row("b", "main", "server.mjs.bak"),
    row("c", "main", "app/server.mjs")
  ].join("\n"));
  const found = files.rankIndex(rows, "server.mjs", 3);
  assert.ok(found[0].path.endsWith("server.mjs"));
  assert.notEqual(found[0].path, "server.mjs.bak");
});

test("a path nothing matches is left out", () => {
  const rows = files.readIndexWalk([row("a", "main", "src/index.ts")].join("\n"));
  assert.deepEqual(files.rankIndex(rows, "zzzz"), []);
});

test("the same file in three worktrees is one row that says how many copies exist", () => {
  const rows = files.readIndexWalk([
    row(".worktrees/fix/api", "fix/lock", "src/shared/cron-lock.service.ts"),
    row("api", "main", "src/shared/cron-lock.service.ts"),
    row(".worktrees/other/api", "other", "src/shared/cron-lock.service.ts")
  ].join("\n"));
  const found = files.rankIndex(rows, "cron-lock.service.ts", 10);
  assert.equal(found.length, 1);
  assert.equal(found[0].copies, 3);
  assert.equal(found[0].repo, "api", "the copy outside .worktrees is the one it offers");
});

test("an empty query still answers, so ⌘P opens on something", () => {
  const rows = files.readIndexWalk([row("a", "main", "src/index.ts"), row("a", "main", "README.md")].join("\n"));
  assert.equal(files.rankIndex(rows, "", 10).length, 2);
});

test("the search walk splits repo, path, line and the line itself", () => {
  const hits = files.readSearchWalk([
    "api\tsrc/a.ts:21:  async runExclusively(",
    "api\tsrc/b.ts:9:const url = 'http://x:8080/a:b'",
    "no tab here",
    "api\tsrc/c.ts:not-a-number:x"
  ].join("\n"));
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { repo: "api", name: "api", path: "src/a.ts", line: 21, text: "  async runExclusively(" });
  assert.equal(hits[1].text, "const url = 'http://x:8080/a:b'", "colons inside the line survive");
});

test("a path that tries to leave the repo is refused", () => {
  assert.ok(files.isRepoRel("api"));
  assert.ok(files.isRepoRel(".worktrees/fix/api"));
  assert.ok(!files.isRepoRel("../etc"));
  assert.ok(!files.isRepoRel("/etc"));
  assert.ok(files.isFileRel("src/app.ts"));
  assert.ok(!files.isFileRel("../../etc/passwd"));
  assert.ok(!files.isFileRel("/etc/passwd"));
  assert.ok(!files.isFileRel("src\\app.ts"));
  assert.ok(!files.isFileRel(""));
});

test("git is the one that ignores: the walk asks it for tracked plus new-and-not-ignored", () => {
  assert.match(files.INDEX_WALK, /ls-files --cached --others --exclude-standard/);
  assert.match(files.SEARCH_WALK, /grep \$fold -n -I --untracked/);
  assert.match(files.SEARCH_WALK, /wait/, "every repo greps at the same time");
});

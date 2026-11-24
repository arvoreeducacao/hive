import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { hitMatcher, patternProblem, readSearchProblem, searchFlags, searchOptions } from "../assets/code-search.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const from = server.indexOf("const SEARCH_WALK = [");
const SEARCH_WALK = new Function(`${server.slice(from, server.indexOf('].join("\\n");', from) + 13)}\nreturn SEARCH_WALK;`)();

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

async function hub() {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "hive-code-search-")));
  const repo = join(root, "api");
  await mkdir(join(repo, "src"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  await writeFile(join(repo, "src", "lock.ts"), [
    "export const LOCK_PREFIX = 'lock:';",
    "export async function runExclusively(key) { return key; }",
    "const lockPrefixLower = 1;",
    "const --flag-like = 'dash';",
    "const unlocked = runExclusivelyLater;"
  ].join("\n"));
  return { root, done: () => rm(root, { recursive: true, force: true }) };
}

const walk = (root, needle, flags = searchFlags(), glob = "") => {
  try {
    return execFileSync("bash", ["-c", SEARCH_WALK, "search", root, needle, glob, flags.fold, flags.word, flags.mode], { stdio: "pipe" }).toString();
  } catch (wrong) {
    return String(wrong.stdout || "");
  }
};

const linesOf = (raw) => raw.split("\n").filter((line) => line.includes("\t")).map((line) => line.split(":").slice(2).join(":").trim());

test("the three toggles become a fixed set of git flags and nothing else", () => {
  assert.deepEqual(searchFlags(), { fold: "-i", word: "", mode: "-F" });
  assert.deepEqual(searchFlags({ matchCase: true, wholeWord: true, regex: true }), { fold: "", word: "-w", mode: "-P" });
  assert.deepEqual(searchOptions({ matchCase: "1", wholeWord: "--open-files-in-pager=sh", regex: true }), { matchCase: true, wholeWord: false, regex: true });
});

test("a broken regular expression is named before git is asked", () => {
  assert.equal(patternProblem("run(", { regex: false }), "");
  assert.equal(patternProblem("run\\w+", { regex: true }), "");
  assert.match(patternProblem("run(", { regex: true }), /group|paren/i);
  assert.match(patternProblem("[a-", { regex: true }), /class|character|range|terminated/i);
});

test("match case, whole word and regex each change what the walk finds", async () => {
  const { root, done } = await hub();
  try {
    assert.equal(linesOf(walk(root, "lock_prefix")).length, 1, "case folds by default");
    assert.equal(linesOf(walk(root, "lock_prefix", searchFlags({ matchCase: true }))).length, 0);
    assert.equal(linesOf(walk(root, "lockprefix", searchFlags())).length, 1);
    const everywhere = linesOf(walk(root, "runExclusively", searchFlags({ matchCase: true })));
    assert.equal(everywhere.length, 2);
    const whole = linesOf(walk(root, "runExclusively", searchFlags({ matchCase: true, wholeWord: true })));
    assert.deepEqual(whole, ["export async function runExclusively(key) { return key; }"]);
    const pattern = linesOf(walk(root, "run\\w+Later", searchFlags({ regex: true })));
    assert.deepEqual(pattern, ["const unlocked = runExclusivelyLater;"]);
  } finally { await done(); }
});

test("a needle that looks like an option is searched as text, never obeyed", async () => {
  const { root, done } = await hub();
  const planted = join(root, "planted");
  try {
    assert.deepEqual(linesOf(walk(root, "--flag-like")), ["const --flag-like = 'dash';"]);
    walk(root, `--open-files-in-pager=touch ${planted}`);
    walk(root, "lock", { fold: `--open-files-in-pager=touch ${planted}`, word: "", mode: "-F" });
    walk(root, "lock", { fold: "", word: "", mode: `-O touch ${planted}` });
    assert.equal(existsSync(planted), false);
    assert.equal(walk(root, "lock", { fold: "-O", word: "", mode: "-F" }), "", "a flag the server never sends stops the walk");
  } finally { await done(); }
});

test("git's own complaint about a pattern comes back as a problem, not as an empty answer", async () => {
  const { root, done } = await hub();
  try {
    const raw = walk(root, "run(", searchFlags({ regex: true }));
    assert.equal(linesOf(raw).length, 0);
    assert.match(readSearchProblem(raw), /paren/i);
    assert.equal(readSearchProblem(walk(root, "run(")), "", "the same text as a plain string is fine");
  } finally { await done(); }
});

test("the palette marks what the search really matched", () => {
  const word = hitMatcher("lock", { wholeWord: true });
  assert.deepEqual("lock unlocked lock:".match(word), ["lock", "lock"]);
  assert.deepEqual("Lock lock".match(hitMatcher("lock", { matchCase: true })), ["lock"]);
  assert.deepEqual("a.b axb".match(hitMatcher("a.b")), ["a.b"]);
  assert.deepEqual("run1 run22".match(hitMatcher("run\\d+", { regex: true })), ["run1", "run22"]);
  assert.equal(hitMatcher("run(", { regex: true }), null);
});

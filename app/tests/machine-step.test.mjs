import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const APP = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(APP, "app.html"), "utf8");
const server = readFileSync(join(APP, "server.mjs"), "utf8");
const main = readFileSync(join(APP, "main.js"), "utf8");

await app("core");
const { wb } = await app("welcome");
const { pageMachine } = await app("avatars");

const dep = (name, over = {}) => ({ name, ok: true, why: `what ${name} is for`, install: `brew install ${name}`, path: `/usr/bin/${name}`, ...over });

const machine = (over = {}) => ({
  ok: true,
  wantsCluster: false,
  deps: [dep("tmux"), dep("gh"), dep("claude")],
  aws: { ok: true, profile: "the-profile", detail: "someone" },
  cluster: { ok: true, name: "the-cluster", detail: "" },
  gh: { ok: true, detail: "someone" },
  claude: { loggedIn: true, email: "someone@example.com" },
  ...over
});

const rowsOf = (screen) => [...screen.matchAll(/<span class="name">([^<]+)<\/span>/g)].map((one) => one[1]);

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

test("a tool the machine needs takes one row, not one for the binary and another for the login", () => {
  wb.s = { machine: machine() };
  const named = rowsOf(pageMachine());
  assert.deepEqual(named, ["tmux", "github", "claude"], "the machine step draws a tool twice");
  assert.equal(named.filter((one) => one === "gh" || one === "github").length, 1);
});

test("the one row a tool gets says where it is when it works, and how to fix it when it does not", () => {
  wb.s = { machine: machine() };
  const working = pageMachine();
  assert.match(working, /title="\/usr\/bin\/gh"/, "a working tool no longer says where it is");
  assert.doesNotMatch(working, /data-copy="gh auth login"/, "a logged-in github still offers the login command");

  wb.s = { machine: machine({ gh: { ok: false, detail: "gh auth login" } }) };
  const loggedOut = pageMachine();
  assert.match(loggedOut, /data-copy="gh auth login"/);
  assert.doesNotMatch(loggedOut, /brew install gh/, "a github that is installed but logged out asks to install it again");

  wb.s = { machine: machine({ deps: [dep("tmux"), dep("gh", { ok: false, path: "" }), dep("claude")] }) };
  const absent = pageMachine();
  assert.match(absent, /data-copy="brew install gh"/, "a github with no binary does not say how to install it");
  assert.doesNotMatch(absent, /data-copy="gh auth login"/, "a github with no binary is asked to log in first");
});

test("a tool the seats do not need is not called missing", () => {
  wb.s = { machine: machine({ deps: [dep("tmux"), dep("gh"), dep("claude", { ok: false, path: "", needed: false })] }) };
  const screen = pageMachine();
  assert.doesNotMatch(screen, /npm install -g/, "a machine whose seats run another agent is told to install claude");
  assert.match(screen, /someone@example\.com/);
});

test("no row lets the path on the right squeeze the sentence in the middle", () => {
  const row = cut(page, "\n  .w-check {", "}", "app.html");
  assert.match(row, /grid-template-columns:[^;]*minmax\(min\(\d+ch, 100%\), 1fr\)/,
    "the column that holds the sentence can still shrink to one character per line");
  assert.match(row, /grid-template-columns:[^;]*minmax\(0, auto\)/,
    "the column that holds the path still demands its whole intrinsic width");
  const path = cut(page, "\n  .w-check .ok {", "}", "app.html");
  assert.match(path, /text-overflow: ellipsis/, "a path too long for its column has nowhere to go");
  assert.match(path, /min-width: 0/);
});

test("github is asked whether it can act, not whether every account it remembers is healthy", () => {
  const look = cut(server, "async function machineLook", "let onboardingCache", "server.mjs");
  assert.match(look, /shr\("gh", \["api", "user", "--jq", "\.login"\]/,
    "gh auth status fails on a stale account even when the live credential works");
  assert.doesNotMatch(look, /shr\("gh", \["auth", "status"\]/);
});

test("the app hands its server the github token the terminal has, the way it hands over PATH", () => {
  assert.match(main, /async function loginShellGithubToken/);
  assert.match(main, /printf %s "\$\{GH_TOKEN:-\$GITHUB_TOKEN\}"/);
  assert.match(main, /githubToken && !inherited \? \{ GH_TOKEN: githubToken \} : \{\}/,
    "a token already in the app's environment has to win over the one read from the shell");
  const env = cut(main, "function serverEnv", "function onPath", "main.js");
  assert.match(env, /process\.env\.GH_TOKEN \|\| process\.env\.GITHUB_TOKEN/);
});

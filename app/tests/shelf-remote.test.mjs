import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { githubRepoOf, sameGithubRepo } from "../lib/config.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("a GitHub repo is the same repo whether git named it over ssh or https, with or without .git", () => {
  assert.equal(githubRepoOf("https://github.com/acme/artifacts"), "acme/artifacts");
  assert.equal(githubRepoOf("git@github.com:acme/artifacts.git"), "acme/artifacts");
  assert.equal(githubRepoOf("https://github.com/Acme/Artifacts.git"), "acme/artifacts");
  assert.ok(sameGithubRepo("git@github.com:acme/artifacts.git", "https://github.com/acme/artifacts"));
  assert.ok(sameGithubRepo("https://github.com/acme/artifacts.git", "https://github.com/acme/artifacts"));
});

test("a different repo, or a url that is not a GitHub repo, is never the same", () => {
  assert.ok(!sameGithubRepo("git@github.com:acme/artifacts.git", "https://github.com/acme/outro"));
  assert.ok(!sameGithubRepo("git@github.com:outra-org/artifacts.git", "https://github.com/acme/artifacts"));
  assert.ok(!sameGithubRepo("", "https://github.com/acme/artifacts"));
  assert.ok(!sameGithubRepo("https://gitlab.com/acme/artifacts", "https://github.com/acme/artifacts"));
  assert.equal(githubRepoOf("not a url"), "");
});

test("the shelf decides whether its clone belongs to the configured repo by owner and name, not by the spelling of the url", () => {
  const opened = server.slice(server.indexOf("async function openShelf()"), server.indexOf("const shelfBranch ="));
  assert.match(opened, /if \(seen && !sameGithubRepo\(seen, url\)\)/, "openShelf compares the remote by repo, so an ssh clone of the https url in the config is kept");
  assert.doesNotMatch(opened, /seen\.replace\(\/\\\.git\$\/, ""\) !==/, "the raw string comparison that threw the clone away on every launch is gone");
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildTitlePrompt } from "../lib/titling.mjs";
import { cleanPatch, cleanTitleInstructions } from "../lib/config.mjs";
import { TITLE_INSTRUCTIONS_CEILING, projectOfChat, titleInstructionsFor } from "../assets/title-instructions.mjs";

test("the person's instructions go into the ask for a new title and for a regenerated one, above the chat", () => {
  const rules = "Comece pelo número do ticket.";
  const first = buildTitlePrompt({ message: "conserta o retry", instructions: rules });
  assert.match(first, /The user's own instructions for titles\. Follow them, even where they differ from the editorial rules above; keep the JSON shape:\nComece pelo número do ticket\.\n\nUser message:\nconserta o retry$/);
  const again = buildTitlePrompt({ message: "USER:\noi", previousTitle: "Retry", instructions: `  ${rules}  ` });
  assert.match(again, /keep the JSON shape:\nComece pelo número do ticket\.\n\nChat contents:\nUSER:\noi$/);
});

test("with no instructions the ask is the one the hive always made", () => {
  assert.doesNotMatch(buildTitlePrompt({ message: "oi" }), /own instructions/);
  assert.doesNotMatch(buildTitlePrompt({ message: "oi", instructions: "   " }), /own instructions/);
});

test("a project's own instructions take the place of the ones for every project", () => {
  const set = { all: "No máximo cinco palavras.", projects: { "lead-engine": "Comece pelo número da branch." } };
  assert.equal(titleInstructionsFor(set, "lead-engine"), "Comece pelo número da branch.");
  assert.equal(titleInstructionsFor(set, "api-acme"), "No máximo cinco palavras.");
  assert.equal(titleInstructionsFor(set, ""), "No máximo cinco palavras.");
  assert.equal(titleInstructionsFor(undefined, "lead-engine"), "");
});

test("a chat's project is the repo of its worktree, or the folder it runs in", () => {
  assert.equal(projectOfChat({ trees: [{ path: "/w/x", repo: "lead-engine" }], cwd: "/h/acme-hub" }), "lead-engine");
  assert.equal(projectOfChat({ trees: [], cwd: "/h/acme-hub/api-acme/" }), "api-acme");
  assert.equal(projectOfChat(null), "");
});

test("a chat that runs inside one of its worktrees takes that worktree's project, not the first one listed", () => {
  const trees = [{ path: "/h/.worktrees/lead-engine/x", repo: "lead-engine" }, { path: "/h/.worktrees/api-acme/y", repo: "api-acme" }];
  assert.equal(projectOfChat({ trees, cwd: "/h/.worktrees/api-acme/y" }), "api-acme");
  assert.equal(projectOfChat({ trees, cwd: "/h/.worktrees/api-acme/y/app/" }), "api-acme");
  assert.equal(projectOfChat({ trees, cwd: "/h/.worktrees/api-acme/yz" }), "lead-engine", "a folder that only shares the start of the name is not inside the worktree");
  assert.equal(projectOfChat({ trees, cwd: "/h" }), "lead-engine");
});

test("the settings file keeps text, drops empty projects and says what it could not take", () => {
  const problems = [];
  const clean = cleanTitleInstructions({ all: "  curto  ", projects: { " lead-engine ": " ticket primeiro ", vazio: "  ", ruim: 3 } }, "config", problems);
  assert.deepEqual(clean, { all: "curto", projects: { "lead-engine": "ticket primeiro" } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /titleInstructions\.projects\.ruim/);

  const long = [];
  assert.deepEqual(cleanTitleInstructions({ all: "x".repeat(TITLE_INSTRUCTIONS_CEILING + 1) }, "config", long), { all: "", projects: {} });
  assert.equal(long.length, 1);
  assert.deepEqual(cleanTitleInstructions(undefined, "config", []), { all: "", projects: {} });
  assert.deepEqual(cleanTitleInstructions("text", "config", [""]), { all: "", projects: {} });
});

test("a panel write of the instructions passes the patch check", () => {
  const { clean, problems } = cleanPatch({ titleInstructions: { all: "a", projects: { sales: "b" } } });
  assert.deepEqual(problems, []);
  assert.deepEqual(clean, { titleInstructions: { all: "a", projects: { sales: "b" } } });
});

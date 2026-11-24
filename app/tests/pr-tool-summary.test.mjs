import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
import { phrase, speak } from "../assets/i18n.mjs";

await views();

const { prToolOf, prToolSummary } = await app("pr-tool-summary");
const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvSeed, svConvFlushAll, svConvTool, svConvToolLanded } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

const answer = (extra = {}) => JSON.stringify({ host: "github.com", repository: "o/r", number: 12, url: "https://github.com/o/r/pull/12", ...extra });
const label = (name, input, state, output) => prToolSummary(name, input, { state, output })?.label;

test("only the hive's own PR and CI tools are summed up, whatever the provider calls them", () => {
  assert.equal(prToolOf("mcp__hive__pull_request_read"), "pull_request_read");
  assert.equal(prToolOf("ci_rerun"), "ci_rerun");
  assert.equal(prToolOf("mcp__github__pull_request_read"), "", "another server's tool of the same name keeps its own row");
  assert.equal(prToolSummary("mcp__hive__peers", {}), null);
});

test("each PR tool reads as one line that names the PR, while it runs, when it lands and when it fails", () => {
  assert.equal(label("mcp__hive__pull_request_read", {}, "running"), "Reading this chat's PR");
  assert.equal(label("mcp__hive__pull_request_read", {}, "done", answer()), "Read PR #12");
  assert.equal(label("mcp__hive__pull_request_read", { number: 7 }, "failed", "This chat's branch has no known PR."), "Could not read PR #7");
  assert.equal(label("mcp__hive__pull_request_list", {}, "done", JSON.stringify({ repository: "o/r", pullRequests: [] })), "Listed PRs");
  assert.equal(label("mcp__hive__pull_request_create", { title: "x", body: "" }, "running"), "Opening a PR");
  assert.equal(label("mcp__hive__pull_request_create", { title: "x", body: "" }, "done", answer({ created: true })), "Opened PR #12");
  assert.equal(label("mcp__hive__pull_request_create", { title: "x", body: "" }, "done", answer({ created: false })), "Found PR #12 already open");
  assert.equal(label("mcp__hive__pull_request_update", { number: 12, title: "y" }, "done", answer()), "Updated PR #12");
  assert.equal(label("mcp__hive__pull_request_respond", { body: "thanks" }, "done", answer({ replied: true, resolved: null })), "Replied on PR #12");
  assert.equal(label("mcp__hive__pull_request_respond", { reviewThreadId: "T", resolved: true }, "done", answer({ replied: false, resolved: true })), "Resolved a conversation on PR #12");
  assert.equal(label("mcp__hive__pull_request_respond", { reviewThreadId: "T", resolved: false }, "done", answer({ replied: false, resolved: false })), "Reopened a conversation on PR #12");
  assert.equal(label("mcp__hive__pull_request_merge", { expectedHeadSha: "abc1234" }, "done", answer({ state: "merged" })), "Merged PR #12");
  assert.equal(label("mcp__hive__pull_request_merge", { expectedHeadSha: "abc1234", auto: true }, "done", answer({ state: "open" })), "Queued PR #12 to merge");
  assert.equal(label("mcp__hive__pull_request_merge", { number: 12, expectedHeadSha: "abc1234" }, "failed", "The head moved"), "Could not merge PR #12");
  assert.equal(label("mcp__hive__ci_logs", {}, "done", answer({ checks: [{ name: "test", log: "x" }] })), "Read the CI log of PR #12");
  assert.equal(label("mcp__hive__ci_logs", {}, "done", answer({ checks: [] })), "Found no failing check on PR #12");
  assert.equal(label("mcp__hive__ci_rerun", {}, "done", answer({ checks: [{ name: "test", rerun: true }] })), "Re-ran CI on PR #12");
  assert.equal(label("mcp__hive__ci_rerun", {}, "done", answer({ checks: [{ name: "vercel", rerun: false }] })), "Could not re-run CI on PR #12");
  assert.equal(label("ci_rerun", { number: 3 }, "running"), "Re-running CI on PR #3");
  assert.equal(prToolSummary("mcp__hive__pull_request_read", {}, { state: "done", output: answer() }).repository, "o/r");
});

test("in Portuguese the lines read as the person says them", () => {
  speak("pt-BR");
  try {
    const say = (text, vars) => phrase(text, vars);
    const pt = (name, input, state, output) => prToolSummary(name, input, { state, output }, say).label;
    assert.equal(pt("mcp__hive__pull_request_read", {}, "done", answer()), "Leu o PR #12");
    assert.equal(pt("mcp__hive__pull_request_create", { title: "x", body: "" }, "done", answer({ created: true })), "Abriu o PR #12");
    assert.equal(pt("mcp__hive__pull_request_merge", { expectedHeadSha: "abc1234" }, "done", answer({ state: "merged" })), "Fez merge do PR #12");
    assert.equal(pt("mcp__hive__ci_logs", {}, "done", answer({ checks: [{ name: "test" }] })), "Leu o log do CI do PR #12");
    assert.equal(pt("mcp__hive__ci_rerun", {}, "done", answer({ checks: [{ name: "test", rerun: true }] })), "Rodou o CI de novo no PR #12");
    assert.equal(pt("mcp__hive__pull_request_read", {}, "running"), "Lendo o PR deste chat");
  } finally {
    speak("en");
  }
});

test("a PR tool row in the chat shows the summary with the PR icon and the repository, and moves from running to done", () => {
  const e = getStructured({ name: "pr-rows-1", where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  svConvTool(e, { id: "p1", name: "mcp__hive__pull_request_merge", input: { expectedHeadSha: "abc1234", method: "squash" } }, true);
  let row = (svConvFlushAll(), e.scroll).querySelector('.sv-tool[data-tool="mcp__hive__pull_request_merge"]');
  assert.equal(row.querySelector(".tname").textContent, "Merging this chat's PR");
  svConvToolLanded(e, { tool_use_id: "p1", content: [{ type: "text", text: answer({ state: "merged" }) }] }, true);
  row = (svConvFlushAll(), e.scroll).querySelector('.sv-tool[data-tool="mcp__hive__pull_request_merge"]');
  assert.equal(row.querySelector(".tname").textContent, "Merged PR #12");
  assert.equal(row.querySelector(".targ").textContent, "o/r");
  assert.equal(row.querySelector(".tsrv").textContent, "hive");
  assert.equal(row.querySelector("summary use")?.getAttribute("href"), "#i-pr");
  svConvTool(e, { id: "p2", name: "mcp__hive__ci_logs", input: { number: 12, repository: "o/r" } }, true);
  svConvToolLanded(e, { tool_use_id: "p2", is_error: true, content: "GitHub did not return o/r#12" }, true);
  const failed = (svConvFlushAll(), e.scroll).querySelector('.sv-tool[data-tool="mcp__hive__ci_logs"]');
  assert.equal(failed.querySelector(".tname").textContent, "Could not read the CI log of PR #12");
  e.convView.dispose();
  structPool.delete(e.name);
});

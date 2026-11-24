const SLOT = /\{(\w+)\}/g;

const fillIn = (text, vars) => (vars ? String(text).replace(SLOT, (whole, key) => (key in vars ? String(vars[key]) : whole)) : String(text));

const HIVE_PR_TOOL = /^(?:mcp__hive__)?(pull_request_read|pull_request_list|pull_request_create|pull_request_update|pull_request_respond|pull_request_merge|ci_logs|ci_rerun)$/;

const prToolOf = (name) => HIVE_PR_TOOL.exec(String(name || ""))?.[1] || "";

function answerOf(text) {
  try {
    const value = JSON.parse(String(text ?? "").trim());
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function runningLabel(tool, pr, say) {
  if (tool === "pull_request_read") return say("Reading {pr}", { pr });
  if (tool === "pull_request_list") return say("Listing PRs");
  if (tool === "pull_request_create") return say("Opening a PR");
  if (tool === "pull_request_update") return say("Updating {pr}", { pr });
  if (tool === "pull_request_respond") return say("Replying on {pr}", { pr });
  if (tool === "pull_request_merge") return say("Merging {pr}", { pr });
  if (tool === "ci_logs") return say("Reading the CI log of {pr}", { pr });
  return say("Re-running CI on {pr}", { pr });
}

function failedLabel(tool, pr, say) {
  if (tool === "pull_request_read") return say("Could not read {pr}", { pr });
  if (tool === "pull_request_list") return say("Could not list PRs");
  if (tool === "pull_request_create") return say("Could not open a PR");
  if (tool === "pull_request_update") return say("Could not update {pr}", { pr });
  if (tool === "pull_request_respond") return say("Could not reply on {pr}", { pr });
  if (tool === "pull_request_merge") return say("Could not merge {pr}", { pr });
  if (tool === "ci_logs") return say("Could not read the CI log of {pr}", { pr });
  return say("Could not re-run CI on {pr}", { pr });
}

function doneLabel(tool, pr, answer, input, say) {
  if (tool === "pull_request_read") return say("Read {pr}", { pr });
  if (tool === "pull_request_list") return say("Listed PRs");
  if (tool === "pull_request_create") return answer?.created === false ? say("Found {pr} already open", { pr }) : say("Opened {pr}", { pr });
  if (tool === "pull_request_update") return say("Updated {pr}", { pr });
  if (tool === "pull_request_respond") {
    if (input.body === undefined && input.resolved === true) return say("Resolved a conversation on {pr}", { pr });
    if (input.body === undefined && input.resolved === false) return say("Reopened a conversation on {pr}", { pr });
    return say("Replied on {pr}", { pr });
  }
  if (tool === "pull_request_merge") {
    const queued = answer?.state ? answer.state !== "merged" : input.auto === true;
    return queued ? say("Queued {pr} to merge", { pr }) : say("Merged {pr}", { pr });
  }
  const checks = Array.isArray(answer?.checks) ? answer.checks : null;
  if (checks && !checks.length) return say("Found no failing check on {pr}", { pr });
  if (tool === "ci_logs") return say("Read the CI log of {pr}", { pr });
  if (checks && !checks.some((check) => check?.rerun)) return say("Could not re-run CI on {pr}", { pr });
  return say("Re-ran CI on {pr}", { pr });
}

function prToolSummary(name, input, { state = "running", output = "" } = {}, say = fillIn) {
  const tool = prToolOf(name);
  if (!tool) return null;
  const asked = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const answer = state === "done" ? answerOf(output) : null;
  const number = Number.isInteger(answer?.number) ? answer.number : Number.isInteger(asked.number) ? asked.number : 0;
  const pr = number ? `PR #${number}` : say("this chat's PR");
  const label = state === "failed" ? failedLabel(tool, pr, say) : state === "done" ? doneLabel(tool, pr, answer, asked, say) : runningLabel(tool, pr, say);
  const repository = typeof answer?.repository === "string" ? answer.repository : typeof asked.repository === "string" ? asked.repository.trim() : "";
  return { tool, label, repository };
}

export { prToolOf, prToolSummary };

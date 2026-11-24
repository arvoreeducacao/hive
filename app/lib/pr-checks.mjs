const CHECK_GOOD = ["SUCCESS", "NEUTRAL", "SKIPPED"];
const CHECK_ABANDONED = ["CANCELLED", "STALE", "EXPECTED"];
const LOG_LINE_CAP = 400;
const ANSI = /(?:\u001b|\^\[)\[[0-9;]*[a-zA-Z]/g;
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const LOG_MARK = /^(?:##)?\[(group|endgroup|error|warning|notice|command|debug|section)\](.*)$/;

function checkState(check) {
  if (check.status && check.status !== "COMPLETED") return "running";
  const done = check.conclusion || check.state || "";
  if (CHECK_GOOD.includes(done)) return "passed";
  if (CHECK_ABANDONED.includes(done)) return "skipped";
  return "failed";
}

function checkStatus(check) {
  if (check.status && check.status !== "COMPLETED") return "pending";
  const done = check.conclusion || check.state || "";
  if (done === "PENDING" || done === "EXPECTED" || done === "") return "pending";
  if (done === "ACTION_REQUIRED") return "action-required";
  if (done === "SUCCESS") return "success";
  if (done === "SKIPPED") return "skipped";
  if (done === "NEUTRAL") return "neutral";
  if (done === "CANCELLED" || done === "STALE") return "cancelled";
  return "failure";
}

const isFailing = (status) => status === "failure" || status === "cancelled";

function jobInUrl(url) {
  const found = String(url || "").match(/\/actions\/runs\/(\d+)\/job\/(\d+)/);
  return found ? { run: Number(found[1]), job: Number(found[2]) } : { run: 0, job: 0 };
}

function oneCheck(check) {
  const where = jobInUrl(check.detailsUrl);
  const from = Date.parse(check.startedAt || "") || 0;
  const to = Date.parse(check.completedAt || "") || 0;
  return {
    name: check.name || check.context || "check",
    workflow: check.workflowName || "",
    state: checkState(check),
    took: from && to > from ? to - from : 0,
    url: check.detailsUrl || check.targetUrl || "",
    run: where.run,
    job: where.job
  };
}

function checksSummary(rollup) {
  const checks = (rollup || []).filter((check) => check && (check.status || check.state)).map(oneCheck);
  if (!checks.length) return { ci: "none", detail: "", checks };
  const count = (state) => checks.filter((check) => check.state === state).length;
  const broken = checks.filter((check) => check.state === "failed");
  if (broken.length) return { ci: "failed", detail: broken.slice(0, 3).map((check) => check.name).join(", "), checks };
  const running = count("running");
  if (running) return { ci: "running", detail: `${running} of ${checks.length}`, checks };
  return { ci: "passed", detail: `${count("passed")} checks`, checks };
}

function oneLogLine(raw) {
  const parts = raw.split("\t");
  const wide = parts.length >= 3;
  const step = wide ? parts[1] : "";
  const text = (wide ? parts.slice(2).join("\t") : raw)
    .replace(ANSI, "")
    .replace(/^﻿/, "")
    .replace(STAMP, "")
    .replace(/\r$/, "");
  const marked = text.match(LOG_MARK);
  if (!marked) return { step, kind: "line", text };
  const [, what, rest] = marked;
  if (what === "endgroup") return null;
  if (what === "group") return { step, kind: "group", text: rest };
  if (what === "error") return { step, kind: "bad", text: rest };
  return { step, kind: "line", text: rest };
}

function readJobLog(raw, cap = LOG_LINE_CAP) {
  const all = String(raw || "").split("\n").filter((line) => line.trim());
  const cut = Math.max(0, all.length - cap);
  return { cut, lines: all.slice(cut).map(oneLogLine).filter(Boolean) };
}

export { checkState, checkStatus, checksSummary, isFailing, jobInUrl, oneCheck, oneLogLine, readJobLog };

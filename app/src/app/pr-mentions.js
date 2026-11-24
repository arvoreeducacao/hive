import { esc, phrase, st } from "./core.js";
import { attachmentIcon } from "./attachment-icons.js";

const PR_RESULT_LIMIT = 12;

const PR_SETTLE_MS = 180;

const PR_ICON = { open: "pullRequest", draft: "pullRequestDraft", merged: "merge", closed: "pullRequestClosed" };

const PR_MARK = /(^|[\s([{'"])#(\d{1,7})(?![\w.-])/g;

const DIGITS = /^\d*$/;

const picked = new Map();

const prDisplayState = (pr) => (pr?.state === "merged" ? "merged" : pr?.state === "closed" ? "closed" : pr?.isDraft ? "draft" : "open");

const recency = (pr) => Date.parse(pr?.updatedAt || "") || 0;

function scorePullRequest(pr, query) {
  const q = String(query || "").trim().toLowerCase().replace(/^#/, "");
  const title = String(pr.title || "").toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (String(pr.number) === q) return 100;
  if (title === q) return 90;
  if (title.includes(q)) return 80;
  if (words.length > 1 && words.every((word) => title.includes(word))) return 70;
  if (String(pr.headRefName || "").toLowerCase().includes(q)) return 60;
  if (String(pr.author || "").toLowerCase().includes(q)) return 50;
  if (String(pr.repo || "").toLowerCase().includes(q)) return 40;
  if (words.some((word) => title.includes(word))) return 30;
  return 10;
}

const haystackOf = (pr) => `#${pr.number} ${pr.title || ""} ${pr.repo || ""} ${pr.headRefName || ""} ${pr.author || ""}`.toLowerCase();

function filterPullRequests(list, query, { searched = false } = {}) {
  const all = Array.isArray(list) ? list.filter((pr) => Number(pr?.number) > 0) : [];
  const q = String(query || "").trim();
  if (DIGITS.test(q)) {
    return all
      .filter((pr) => String(pr.number).includes(q))
      .sort((a, b) => (Number(String(b.number) === q) - Number(String(a.number) === q)) || recency(b) - recency(a))
      .slice(0, PR_RESULT_LIMIT);
  }
  const lower = q.toLowerCase();
  const kept = searched ? all : all.filter((pr) => lower.split(/\s+/).every((word) => haystackOf(pr).includes(word)));
  return kept
    .map((pr) => ({ pr, score: scorePullRequest(pr, q) }))
    .sort((a, b) => b.score - a.score || recency(b.pr) - recency(a.pr))
    .map((one) => one.pr)
    .slice(0, PR_RESULT_LIMIT);
}

function notePick(pr) {
  picked.set(Number(pr.number), pr);
  const key = String(pr.url || "").match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (key) (st.prSeen ||= new Map()).set(`${key[1]}/${key[2]}#${key[3]}`, { state: prDisplayState(pr), title: pr.title || "" });
}

const pickedPr = (number) => picked.get(Number(number)) || null;

function prPickSpans(said, isChat = () => false) {
  const spans = [];
  PR_MARK.lastIndex = 0;
  for (const m of String(said ?? "").matchAll(PR_MARK)) {
    const pr = isChat(m[2]) ? null : pickedPr(m[2]);
    if (!pr) continue;
    const start = m.index + m[1].length;
    spans.push({ start, end: start + 1 + m[2].length, cls: `ink-chip ink-pr-${prDisplayState(pr)}` });
  }
  return spans;
}

function outboundPrPicks(text, numbers, isChat = () => false) {
  if (!numbers?.size) return String(text ?? "");
  PR_MARK.lastIndex = 0;
  return String(text ?? "").replace(PR_MARK, (mark, lead, n) => {
    const pr = numbers.has(Number(n)) && !isChat(n) ? pickedPr(n) : null;
    return pr?.url ? `${lead}${pr.url}` : mark;
  });
}

function prStateLabel(state) {
  if (state === "draft") return phrase("Draft pull request");
  if (state === "merged") return phrase("Merged pull request");
  if (state === "closed") return phrase("Closed pull request");
  return phrase("Open pull request");
}

function prRowHtml(pr, { selected, index, here }) {
  const state = prDisplayState(pr);
  const other = here && pr.repo && pr.repo.toLowerCase() !== here.toLowerCase();
  const desc = other ? `${pr.repo} · ${pr.title || ""}` : pr.title || "";
  return `<div class="sg sg-pr${selected ? " sel" : ""}" data-i="${index}" data-state="${state}">`
    + `<span class="mark cp-pr-icon" role="img" aria-label="${esc(prStateLabel(state))}" data-state="${state}">${attachmentIcon(PR_ICON[state])}</span>`
    + `<span class="val"><bdi>#${esc(String(pr.number))}</bdi></span><span class="desc">${esc(desc)}</span>`
    + "</div>";
}

function prEmptyText({ error, available, query }) {
  if (!available) return phrase("Pull requests are not available for this project.");
  if (error) return phrase("Pull requests could not be read for this project.");
  if (query) return phrase("No pull request matches {query}.", { query });
  return phrase("No pull requests found in this repository.");
}

const lists = new Map();

async function searchPullRequests({ name, where }, query) {
  if (!name) return { available: false, prs: [] };
  const q = String(query || "").trim();
  const key = `${where}|${name}|${DIGITS.test(q) ? "" : q.toLowerCase()}|${DIGITS.test(q) ? q : ""}`;
  const held = lists.get(key);
  if (held && Date.now() - held.at < 60_000) return held.said;
  const params = new URLSearchParams({ name, where: where || "local" });
  if (q && !DIGITS.test(q)) params.set("q", q);
  if (q && DIGITS.test(q)) params.set("number", q);
  const said = await fetch(`/api/prs/search?${params}`).then((r) => r.json()).catch(() => ({ error: "unreachable", available: true, prs: [] }));
  const shaped = { available: said?.available !== false, error: said?.error || "", repo: said?.repo || "", searched: !!said?.searched, prs: Array.isArray(said?.prs) ? said.prs : [] };
  if (!shaped.error) lists.set(key, { at: Date.now(), said: shaped });
  return shaped;
}

export { PR_RESULT_LIMIT, PR_SETTLE_MS, filterPullRequests, notePick, outboundPrPicks, pickedPr, prDisplayState, prEmptyText, prPickSpans, prRowHtml, prStateLabel, scorePullRequest, searchPullRequests };

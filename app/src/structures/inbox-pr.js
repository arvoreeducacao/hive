import { esc, phrase, renderMarkdown, st } from "../app/core.js";
import { ago } from "../app/pod.js";
import { commits, deleteBranch, diffs, hidePr, mergePr, mergeState, pullCommits, pullDiff, pullPrs, pullTalk, talks } from "../app/thread.js";
import { toClipboard } from "../app/terminal-history.js";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "timeline", label: "Timeline" },
  { id: "code", label: "Code" }
];

const STATE_SAID = { open: "Opened", draft: "Draft", merged: "Merged", closed: "Closed" };

const VERDICT_SAID = { approved: "approved", changes: "requested changes", commented: "reviewed" };

const side = {
  key: "", tab: "summary", fold: { description: true, checks: false, comments: true },
  newest: true, files: new Set(), composing: false, draft: "", sending: false, trouble: "", menu: false
};

const prOf = (key) => (st.prs || []).find((p) => p.key === key) || null;

const prSideKey = () => side.key;

function openPrSide(key) {
  if (side.key !== key) Object.assign(side, { key, tab: "summary", files: new Set(), composing: false, draft: "", trouble: "", menu: false });
  return side;
}

function closePrSide() {
  side.key = "";
  side.menu = false;
}

function askForTab(p, repaint) {
  if (!p || p.error) return;
  if (!talks.has(p.key)) pullTalk(p.key).then(repaint);
  if (side.tab === "timeline" && !commits.has(p.key)) pullCommits(p.key).then(repaint);
  if (side.tab === "code" && !diffs.has(p.key)) pullDiff(p.key).then(repaint);
}

/* PR text is rendered with html escaped, so the tags bots use become markdown instead of showing as text. */
const GITHUB_HTML = [
  [/<summary>([\s\S]*?)<\/summary>/gi, "\n**$1**\n"],
  [/<br\s*\/?>/gi, "\n"],
  [/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)"],
  [/<img\s[^>]*>/gi, ""],
  [/<\/?(details|sub|sup|p|div|span|picture|source|b|strong|em|i|code|kbd|blockquote|h\d)(\s[^>]*)?>/gi, ""]
];

const tamed = (text) => GITHUB_HTML.reduce((said, [tag, as]) => said.replace(tag, as), String(text || ""));

const markdown = (text) => renderMarkdown(tamed(text));

const avatar = (who) => (who ? `<img class="tp-av" src="https://github.com/${encodeURIComponent(who)}.png?size=40" alt="" loading="lazy">` : "");

const when = (iso) => (iso ? phrase("{when} ago", { when: ago(iso) }) : "");

function checksLine(p, icon) {
  const checks = p.checks || [];
  if (!checks.length) return `<span class="tp-ck">${icon("circleDashed")}<span>${esc(phrase("No checks reported"))}</span></span>`;
  const failed = checks.filter((c) => c.state === "failed").length;
  const running = checks.filter((c) => c.state === "running").length;
  if (failed) return `<span class="tp-ck bad">${icon("circleX")}<span>${esc(phrase("{n} of {total} checks failed", { n: failed, total: checks.length }))}</span></span>`;
  if (running) return `<span class="tp-ck run">${icon("working")}<span>${esc(phrase("{n} of {total} checks running", { n: running, total: checks.length }))}</span></span>`;
  return `<span class="tp-ck ok">${icon("done")}<span>${esc(phrase("All checks passed"))}</span></span>`;
}

function headHtml(p, icon) {
  const [owner, repo] = String(p.repo || "").split("/");
  const state = STATE_SAID[p.state] ? p.state : "open";
  const checkout = `gh pr checkout ${p.number}`;
  const files = Number(p.files) || 0;
  const menu = side.menu ? menuHtml(p) : "";
  return `<div class="tp-strip">
      <span class="tp-tab">${icon("pr")}<span>#${esc(p.number)}</span></span>
      <span class="tp-fill"></span>
      <button type="button" class="tp-ib" data-act="pr-close" title="${esc(phrase("Close"))}">${icon("x")}</button>
    </div>
    <div class="tp-head">
      <div class="tp-row">
        <a class="tp-repo" href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(phrase("open on GitHub"))}">${esc(owner)}/${esc(repo)} <span class="tp-num">#${esc(p.number)}</span>${icon("external")}</a>
        <span class="tp-fill"></span>
        <span class="tp-badge s-${state}">${icon(state === "merged" ? "merge" : "pr")}<span>${esc(phrase(STATE_SAID[state]))}</span></span>
        <span class="tp-more"><button type="button" class="tp-ib" data-act="pr-menu" title="${esc(phrase("More"))}">${icon("more")}</button>${menu}</span>
      </div>
      <h1 class="tp-title" title="${esc(p.title || "")}">${esc(p.title || p.key)}</h1>
      <div class="tp-meta">${avatar(p.author)}<span class="tp-who">${esc(p.author || "")}</span><span class="tp-dot">·</span><span>${esc(p.updatedAt ? phrase("updated {when}", { when: when(p.updatedAt) }) : "")}</span>
        <button type="button" class="tp-code" data-act="pr-copy" data-copy="${esc(checkout)}" title="${esc(phrase("Copy checkout command"))}">${esc(checkout)}</button></div>
      <div class="tp-branch"><span class="tp-refs"><code title="${esc(p.base || "")}">${esc(p.base || "")}</code>${icon("arrowLeft")}<code title="${esc(p.branch || "")}">${esc(p.branch || "")}</code></span>
        <span class="tp-stat">${icon("diff")}<span>${esc(phrase(files === 1 ? "1 file" : "{n} files", { n: files }))}</span><span class="add">+${Number(p.added) || 0}</span><span class="del">−${Number(p.removed) || 0}</span></span></div>
    </div>
    <nav class="tp-tabs"><span class="tp-seg">${TABS.map((t) => `<button type="button" class="${t.id === side.tab ? "on" : ""}" data-act="pr-tab" data-tab="${t.id}">${esc(phrase(t.label))}</button>`).join("")}</span>${checksLine(p, icon)}</nav>`;
}

function menuHtml(p) {
  const m = mergeState(p);
  const item = (act, label) => `<button type="button" data-act="${act}">${esc(phrase(label))}</button>`;
  return `<div class="tp-menu">
      ${m && !m.locked && !m.armed ? item("pr-merge", m.label) : ""}
      ${p.branchLeft ? item("pr-branch", "delete branch") : ""}
      ${item("pr-github", "open on GitHub")}
      ${item("pr-forget", "take off the list")}
    </div>`;
}

function reviewersOf(p) {
  const talk = talks.get(p.key) || [];
  const seen = new Map();
  for (const t of talk) if (t.kind === "review" && t.who !== p.author) seen.set(t.who, t.verdict || "");
  for (const who of p.reviewers || []) if (!seen.has(who)) seen.set(who, "");
  return [...seen];
}

function fieldRow(icon, glyph, label, value) {
  return `<div class="tp-field">${icon(glyph)}<span class="tp-fl">${esc(phrase(label))}</span><span class="tp-fv">${value}</span></div>`;
}

function foldHead(icon, id, label, extra = "") {
  return `<button type="button" class="tp-fold${side.fold[id] ? " open" : ""}" data-act="pr-fold" data-fold="${id}"><span>${label}</span>${icon(side.fold[id] ? "down" : "chevron")}</button>${extra}`;
}

function commentHtml(t, icon) {
  const verdict = t.kind === "review" ? `<span class="tp-verdict v-${esc(t.verdict || "")}">${esc(phrase(VERDICT_SAID[t.verdict] || t.verdict || "reviewed"))}</span>` : "";
  const at = t.kind === "inline" && t.path ? `<div class="tp-at">${icon("file")}<span>${esc(t.path)}${t.line ? `:${t.line}` : ""}</span></div>` : "";
  return `<article class="tp-cmt">
      <header>${avatar(t.who)}<b>${esc(t.who)}</b>${verdict}<span class="tp-when">${esc(when(t.when))}</span></header>
      ${at}${t.body ? `<div class="tp-md md">${markdown(t.body)}</div>` : ""}
    </article>`;
}

function summaryHtml(p, icon) {
  const reviewers = reviewersOf(p);
  const labels = p.labels || [];
  const none = `<span class="tp-none">${esc(phrase("None"))}</span>`;
  const people = reviewers.length
    ? reviewers.map(([who, verdict]) => `<span class="tp-person${verdict ? ` v-${esc(verdict)}` : ""}" title="${esc(verdict ? phrase(VERDICT_SAID[verdict] || verdict) : phrase("review requested"))}">${avatar(who)}${esc(who)}</span>`).join("")
    : none;
  const tags = labels.length
    ? labels.map((l) => `<span class="tp-label" style="--lc:#${esc(String(l.color || "888").replace(/[^0-9a-f]/gi, ""))}">${esc(l.name)}</span>`).join("")
    : none;
  const description = side.fold.description
    ? `<div class="tp-md md">${p.body ? markdown(p.body) : `<span class="tp-none">${esc(phrase("PR with no description"))}</span>`}</div>`
    : "";
  const checks = side.fold.checks
    ? `<ul class="tp-checks">${(p.checks || []).map((c) => `<li class="c-${esc(c.state)}">${icon(c.state === "passed" ? "done" : c.state === "failed" ? "circleX" : c.state === "running" ? "working" : "circleDashed")}<a href="${esc(c.url || p.url)}" target="_blank" rel="noreferrer">${esc(c.name)}</a>${c.workflow ? `<span class="tp-when">${esc(c.workflow)}</span>` : ""}</li>`).join("") || `<li class="tp-none">${esc(phrase("No checks reported"))}</li>`}</ul>`
    : "";
  const talk = talks.get(p.key);
  const said = (talk || []).filter((t) => t.kind !== "inline" && (t.body || t.kind === "review"));
  const order = side.newest ? said.slice().reverse() : said;
  const comments = !side.fold.comments ? ""
    : !talk ? `<p class="tp-none">${esc(phrase("reading the conversation…"))}</p>`
    : order.length ? order.map((t) => commentHtml(t, icon)).join("")
    : `<p class="tp-none">${esc(phrase("No comments yet."))}</p>`;
  const sort = `<button type="button" class="tp-sort" data-act="pr-sort">${icon("sort")}<span>${esc(phrase(side.newest ? "Newest first" : "Oldest first"))}</span></button>`;
  return `<div class="tp-fields">
      ${fieldRow(icon, "users", "Reviewers", people)}
      ${fieldRow(icon, "tag", "Labels", tags)}
    </div>
    <section class="tp-sec">${foldHead(icon, "description", esc(phrase("Description")))}${description}</section>
    <section class="tp-sec">${foldHead(icon, "checks", esc(phrase("Checks")))}${checks}</section>
    <section class="tp-sec">${foldHead(icon, "comments", esc(phrase("Comments ({n})", { n: talk ? said.length : 0 })), sort)}${comments}</section>`;
}

function timelineHtml(p, icon) {
  const talk = talks.get(p.key);
  const list = commits.get(p.key);
  if (!talk || !list) return `<p class="tp-none tp-pad">${esc(phrase("reading the timeline…"))}</p>`;
  const events = [
    ...list.map((c) => ({ when: c.when, html: `<div class="tp-ev">${icon("commit")}<div class="tp-evb"><span class="tp-evl"><b>${esc(c.who)}</b> ${esc(phrase("committed"))} <a class="tp-sha" href="${esc(`https://github.com/${p.repo}/commit/${c.sha}`)}" target="_blank" rel="noreferrer">${esc(c.sha)}</a><span class="tp-when">${esc(when(c.when))}</span></span><span class="tp-evt">${esc(c.title)}</span></div></div>` })),
    ...talk.map((t) => ({ when: t.when, html: `<div class="tp-ev">${icon(t.kind === "review" ? "eye" : "message")}<div class="tp-evb">${commentHtml(t, icon)}</div></div>` }))
  ].sort((a, b) => Date.parse(a.when || 0) - Date.parse(b.when || 0));
  if (!events.length) return `<p class="tp-none tp-pad">${esc(phrase("Nothing happened on this PR yet."))}</p>`;
  return `<div class="tp-timeline">${events.map((e) => e.html).join("")}</div>`;
}

function fileRows(f) {
  if (f.binary) return `<div class="tp-gap">${esc(phrase(f.picture ? "image" : "binary file"))}</div>`;
  return (f.lines || []).map((l) => {
    if (l.t === "gap") return `<div class="tp-gap">${esc(l.n > 0 ? phrase(l.n > 1 ? "⋯ {n} lines unchanged" : "⋯ {n} line unchanged", { n: l.n }) : "⋯")}</div>`;
    if (l.t === "note") return `<div class="tp-gap">${esc(phrase("no newline at end of file"))}</div>`;
    return `<div class="tp-ln ${esc(l.t)}"><i>${l.a ?? ""}</i><i>${l.d ?? ""}</i><span>${l.h || "&nbsp;"}</span></div>`;
  }).join("") + (f.truncated ? `<div class="tp-gap">${esc(phrase("⋯ {truncated} more lines in this file: open it on GitHub", { truncated: f.truncated }))}</div>` : "");
}

function codeHtml(p, icon) {
  const files = diffs.get(p.key);
  if (!files) return `<p class="tp-none tp-pad">${esc(phrase("reading the diff…"))}</p>`;
  if (!files.length) return `<p class="tp-none tp-pad">${esc(phrase("This PR has no diff to show."))}</p>`;
  return `<div class="tp-files">${files.map((f) => {
    const open = side.files.has(f.path);
    return `<section class="tp-file${open ? " open" : ""}${f.noise ? " noise" : ""}">
        <button type="button" class="tp-fhead" data-act="pr-file" data-path="${esc(f.path)}">${icon(open ? "down" : "chevron")}<span class="tp-fpath" title="${esc(f.path)}">${esc(f.path)}</span><span class="add">+${Number(f.added) || 0}</span><span class="del">−${Number(f.removed) || 0}</span></button>
        ${open ? `<div class="tp-diff">${fileRows(f)}</div>` : ""}
      </section>`;
  }).join("")}</div>`;
}

function composeHtml(icon) {
  if (!side.composing) return `<button type="button" class="tp-fab" data-act="pr-compose" title="${esc(phrase("Comment"))}">${icon("message")}</button>`;
  return `<form class="tp-compose" data-act="pr-noop">
      <textarea class="tp-text" rows="3" placeholder="${esc(phrase("what you have to say about this PR"))}"></textarea>
      ${side.trouble ? `<p class="tp-trouble">${esc(side.trouble)}</p>` : ""}
      <div class="tp-crow"><button type="button" class="tp-btn" data-act="pr-compose">${esc(phrase("Cancel"))}</button><button type="button" class="tp-btn primary" data-act="pr-send"${side.sending ? " disabled" : ""}>${esc(phrase(side.sending ? "Sending…" : "Comment"))}</button></div>
    </form>`;
}

/* the comment box is painted apart: the panel repaints often and a rebuilt textarea loses the caret. */
function prSideHtml(icon, repaint) {
  if (!side.key) return { main: "", compose: "" };
  const p = prOf(side.key);
  const strip = (label) => `<div class="tp-strip">${label ? `<span class="tp-tab">${icon("pr")}<span>${esc(label)}</span></span>` : ""}<span class="tp-fill"></span><button type="button" class="tp-ib" data-act="pr-close">${icon("x")}</button></div>`;
  if (!p) return { main: `${strip("")}<p class="tp-none tp-pad">${esc(phrase("reading the PR…"))}</p>`, compose: "" };
  if (p.error) return { main: `${strip(p.key)}<p class="tp-none tp-pad">${esc(p.error)}</p>`, compose: "" };
  askForTab(p, repaint);
  const body = side.tab === "timeline" ? timelineHtml(p, icon) : side.tab === "code" ? codeHtml(p, icon) : summaryHtml(p, icon);
  return { main: `${headHtml(p, icon)}<div class="tp-body">${body}</div>`, compose: composeHtml(icon) };
}

const prSideDraft = () => side.draft;

async function sendComment(repaint) {
  const p = prOf(side.key);
  const text = side.draft.trim();
  if (!p || !text || side.sending) return;
  side.sending = true;
  side.trouble = "";
  repaint();
  try {
    const d = await (await fetch("/api/prs/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: p.key, action: "comment", text }) })).json();
    if (d.ok) {
      Object.assign(side, { draft: "", composing: false });
      talks.delete(p.key);
      pullPrs();
    } else side.trouble = d.error || phrase("GitHub refused the comment");
  } catch (err) {
    side.trouble = String(err?.message || err);
  }
  side.sending = false;
  repaint();
}

function prSideAct(hit, repaint) {
  const act = hit.dataset.act;
  const p = prOf(side.key);
  if (act === "pr-close") closePrSide();
  else if (act === "pr-tab") { side.tab = hit.dataset.tab; side.menu = false; }
  else if (act === "pr-fold") side.fold[hit.dataset.fold] = !side.fold[hit.dataset.fold];
  else if (act === "pr-sort") side.newest = !side.newest;
  else if (act === "pr-menu") side.menu = !side.menu;
  else if (act === "pr-copy") { toClipboard(hit.dataset.copy || ""); hit.classList.add("copied"); return; }
  else if (act === "pr-file") {
    const path = hit.dataset.path;
    if (side.files.has(path)) side.files.delete(path);
    else side.files.add(path);
  } else if (act === "pr-compose") { side.composing = !side.composing; side.trouble = ""; }
  else if (act === "pr-send") return sendComment(repaint);
  else if (!p) return;
  else if (act === "pr-github") { side.menu = false; window.open(p.url, "_blank", "noopener,noreferrer"); }
  else if (act === "pr-merge") { side.menu = false; mergePr(p, hit); }
  else if (act === "pr-branch") { side.menu = false; deleteBranch(p, hit); }
  else if (act === "pr-forget") { closePrSide(); hidePr(p); }
  else return;
  repaint();
  if (act === "pr-compose" && side.composing) queueMicrotask(() => document.querySelector(".tp-text")?.focus());
}

function prSideTyped(target) {
  if (!target.classList?.contains("tp-text")) return false;
  side.draft = target.value;
  return true;
}

export { closePrSide, openPrSide, prSideAct, prSideDraft, prSideHtml, prSideKey, prSideTyped };

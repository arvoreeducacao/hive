const PAGE_SLUG = /^pr-[0-9a-f]{8}$/;

function fnv(text) {
  let hash = 0x811c9dc5;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const prPageSlug = (key) => `pr-${fnv(key)}`;

export const isPrPageSlug = (slug) => PAGE_SLUG.test(String(slug || ""));

export const prPageAddress = (key) => `shelf://${prPageSlug(key)}/`;

export const PR_PAGE_ADDRESS = /^shelf:\/\/pr-[0-9a-f]{8}\/?$/;

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const asScriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16)}`);

export function fileSignature(file) {
  return fnv([file.path, file.added, file.removed, ...(file.lines || []).map((line) => `${line.t}${line.h ?? ""}`)].join("\n"));
}

export function prPageFiles(files) {
  return (files || []).map((file) => ({
    path: String(file.path || ""),
    added: Number(file.added) || 0,
    removed: Number(file.removed) || 0,
    binary: !!file.binary,
    noise: !!file.noise,
    truncated: Number(file.truncated) || 0,
    sig: fileSignature(file),
    lines: (file.lines || []).map((line) => ({ t: line.t, a: line.a ?? null, d: line.d ?? null, n: line.n ?? null, h: line.h ?? "" }))
  }));
}

export function nextToRead(paths, at, seen) {
  for (let step = 1; step <= paths.length; step++) {
    const path = paths[(at + step) % paths.length];
    if (!seen.has(path)) return paths.indexOf(path);
  }
  return Math.min(at + 1, paths.length - 1);
}

function descriptionDoc(bodyHtml, markdownCss) {
  const body = String(bodyHtml || "").trim() || "<p><em>No description provided.</em></p>";
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_top"><style>${markdownCss}
html, body { margin: 0; background: #111111; }
::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background: #c4d8c7; border-radius: 0; }
::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active { background: #ff812e; }
.markdown-body { box-sizing: border-box; min-height: 100vh; padding: 16px 20px 32px; background: transparent; font-size: 14px; }
</style></head><body><article class="markdown-body">${body}</article></body></html>`;
}

const PAGE_STYLE = `
:root { --bg: #080909; --panel: #111111; --panel-2: #171918; --panel-3: #212421; --line: #2a2e2a; --line-2: #414640; --line-3: #747b70; --txt: #e2dac2; --txt-2: #bcb9af; --txt-3: #8a8d84; --green: #c4d8c7; --blue: #4fbbbc; --red: #d65c5c; --accent: #ff812e;
  --add: #7fbf8e; --add-bg: rgba(127, 191, 142, 0.13); --add-gutter: rgba(127, 191, 142, 0.28); --del: var(--red); --del-bg: rgba(214, 92, 92, 0.12); --del-gutter: rgba(214, 92, 92, 0.28);
  --mono: Hack, ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; --sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color-scheme: dark; }
* { box-sizing: border-box; border-radius: 0; }
::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--green); border-radius: 0; }
::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active { background: var(--accent); }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--txt); font: 13px/1.5 var(--sans); }
.label { font: 11px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--txt-3); }
.plus { color: var(--add); }
.minus { color: var(--del); }
.page { display: grid; grid-template-columns: minmax(320px, 36%) minmax(220px, 20%) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100%; }
.page > section { display: grid; min-height: 0; min-width: 0; }
.doc { grid-row: 1 / 3; grid-template-rows: auto minmax(0, 1fr); background: var(--panel); border-right: 1px solid var(--line-2); }
.changes-head { grid-column: 2 / 4; display: grid; grid-template-columns: subgrid; align-items: stretch; border-bottom: 1px solid var(--line-2); background: var(--panel-2); }
.changes-head > .label { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 14px; border-right: 1px solid var(--line); }
.card { display: grid; gap: 12px; padding: 18px 20px 16px; border-bottom: 1px solid var(--line-2); }
.card .top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.card .where { font: 12px var(--mono); color: var(--txt-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .top a { margin-left: auto; flex: none; font: 11px var(--mono); color: var(--blue); text-decoration: none; }
.card .top a:hover { text-decoration: underline; }
.card h1 { margin: 0; font-size: 19px; line-height: 1.35; font-weight: 600; overflow-wrap: anywhere; }
.chip { flex: none; font: 11px var(--mono); letter-spacing: .1em; text-transform: uppercase; padding: 2px 8px; border: 1px solid currentColor; color: var(--txt-3); }
.chip[data-state="open"] { color: var(--blue); }
.chip[data-state="merged"] { color: var(--green); }
.facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; margin: 0; font: 12px var(--mono); }
.facts dt { color: var(--txt-3); }
.facts dd { margin: 0; color: var(--txt-2); overflow-wrap: anywhere; }
.facts .branch { color: var(--blue); }
iframe { display: block; width: 100%; height: 100%; border: 0; background: var(--panel); }
.files-col { grid-template-rows: minmax(0, 1fr); background: var(--panel-2); border-right: 1px solid var(--line); }
.files { overflow: auto; margin: 0; padding: 4px 0 12px; list-style: none; }
.files li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 5px 14px 5px 22px; border-left: 2px solid transparent; font: 12px var(--mono); cursor: pointer; }
.files li.folder { display: block; padding: 12px 14px 4px; color: var(--txt-3); font-size: 11px; cursor: default; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files li[data-i]:hover { background: var(--panel-3); }
.files li[aria-selected="true"] { background: var(--panel-3); border-left-color: var(--blue); }
.files li[aria-selected="true"] .name { font-weight: 600; }
.files li .mark { width: 12px; height: 12px; border: 1px solid var(--line-3); }
.files li[data-seen="yes"] .mark { background: var(--green); border-color: var(--green); }
.files li[data-seen="yes"] .name { color: var(--txt-3); }
.files li .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files li .delta { font-size: 11px; white-space: nowrap; }
.hint { display: inline-flex; align-items: center; gap: 6px; letter-spacing: 0; text-transform: none; color: var(--txt-3); }
kbd { font: 10px var(--mono); color: var(--txt-2); border: 1px solid var(--line-3); padding: 0 4px; }
.right { grid-template-rows: minmax(0, 1fr); background: var(--panel-2); }
.fhead { display: flex; align-items: center; gap: 14px; min-width: 0; min-height: 40px; padding: 8px 14px; background: var(--panel-2); }
.fpath { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px var(--mono); }
.fpath .folder { color: var(--txt-3); }
.fpath b { font-weight: 600; }
.fstat { font: 11px var(--mono); white-space: nowrap; }
.blocks { display: inline-flex; gap: 2px; margin-left: 6px; vertical-align: middle; }
.blocks i { width: 8px; height: 8px; background: var(--line-2); }
.blocks i.a { background: var(--add); }
.blocks i.d { background: var(--del); }
.diff { overflow: hidden auto; font: 12px/20px var(--mono); }
.diff table { border-collapse: collapse; width: 100%; }
.diff td { padding: 0 10px; white-space: pre-wrap; overflow-wrap: anywhere; vertical-align: top; }
.diff td.n { width: 1%; padding: 0 8px; white-space: nowrap; color: var(--txt-3); text-align: right; user-select: none; }
.diff td.s { width: 1%; padding: 0 0 0 8px; user-select: none; }
.diff tr.added td { background: var(--add-bg); }
.diff tr.added td.n { background: var(--add-gutter); color: var(--txt); }
.diff tr.added td.s::before { content: "+"; color: var(--add); }
.diff tr.removed td { background: var(--del-bg); }
.diff tr.removed td.n { background: var(--del-gutter); color: var(--txt); }
.diff tr.removed td.s::before { content: "\\2212"; color: var(--del); }
.diff tr.gap td { padding: 4px 10px; background: rgba(79, 187, 188, 0.08); color: var(--txt-3); font-size: 11px; }
.diff .empty { padding: 24px 16px; color: var(--txt-2); white-space: normal; font-family: var(--sans); }
.diff .hljs-keyword, .diff .hljs-literal, .diff .hljs-type, .diff .hljs-selector-tag { color: #ff7b72; }
.diff .hljs-string, .diff .hljs-regexp, .diff .hljs-symbol, .diff .hljs-quote { color: #a5d6ff; }
.diff .hljs-number, .diff .hljs-attr, .diff .hljs-attribute, .diff .hljs-property, .diff .hljs-variable, .diff .hljs-meta { color: #79c0ff; }
.diff .hljs-title, .diff .hljs-section { color: #d2a8ff; }
.diff .hljs-built_in, .diff .hljs-params { color: #ffa657; }
.diff .hljs-comment { color: #8b949e; font-style: italic; }
.diff .hljs-tag, .diff .hljs-name, .diff .hljs-selector-class, .diff .hljs-selector-id { color: #7ee787; }
.waiting { position: fixed; inset: 0; background: var(--bg); }
.waiting:has(~ .page), .waiting:has(~ .failed) { display: none; }
.waiting .page { grid-template-rows: minmax(0, 1fr); }
.waiting .doc { grid-row: auto; }
.waiting .page > section { grid-template-rows: none; grid-auto-rows: min-content; align-content: start; gap: 12px; padding: 18px 16px; }
.loading { display: flex; align-items: center; gap: 10px; }
.loading i { width: 8px; height: 8px; background: var(--blue); animation: blink 1s steps(2) infinite; }
.bone { height: 12px; background: linear-gradient(90deg, var(--panel-2) 0, var(--panel-3) 40%, var(--panel-2) 80%); background-size: 300% 100%; animation: shimmer 1.4s linear infinite; }
.bone.title { height: 22px; }
.waiting .files-col .bone, .waiting .right .bone { background-image: linear-gradient(90deg, var(--panel-3) 0, var(--line-2) 40%, var(--panel-3) 80%); }
.bone.code { height: 14px; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: -50% 0; } }
@keyframes blink { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .bone, .loading i { animation: none; } }
.failed { display: grid; place-content: center; gap: 12px; height: 100%; padding: 24px; text-align: center; }
.failed .label { color: var(--red); }
.failed p { margin: 0; color: var(--txt-2); }
.failed a { color: var(--blue); font: 12px var(--mono); }
`;

const PAGE_SCRIPT = `
const data = JSON.parse(document.getElementById("pr-data").textContent);
const files = data.files;
const paths = files.map((file) => file.path);
const store = "hive.pr.viewed:" + data.key;
const read = () => { try { return JSON.parse(localStorage.getItem(store) || "{}") || {}; } catch { return {}; } };
const write = (marks) => { try { localStorage.setItem(store, JSON.stringify(marks)); } catch {} };
let marks = read();
let at = 0;
const list = document.querySelector(".files");
const diff = document.querySelector(".diff");
const head = document.querySelector(".fhead");
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const parts = (path) => { const cut = path.lastIndexOf("/") + 1; return [path.slice(0, cut), path.slice(cut)]; };
const seen = () => new Set(files.filter((file) => marks[file.path] === file.sig).map((file) => file.path));
const blocks = (file) => { const total = file.added + file.removed; const green = total ? Math.round((file.added / total) * 5) : 0; return '<span class="blocks">' + [0, 1, 2, 3, 4].map((i) => '<i class="' + (!total ? "" : i < green ? "a" : "d") + '"></i>').join("") + '</span>'; };
${nextToRead}
function paintList() {
  const done = seen();
  let folder = null;
  list.innerHTML = files.map((file, i) => {
    const [dir, name] = parts(file.path);
    const lead = dir !== folder ? '<li class="folder" title="' + esc(dir || "/") + '">' + esc(dir || "/") + '</li>' : "";
    folder = dir;
    return lead + '<li role="option" data-i="' + i + '" aria-selected="' + (i === at) + '" data-seen="' + (done.has(file.path) ? "yes" : "no") + '" title="' + esc(file.path) + '"><span class="mark"></span><span class="name">' + esc(name) + '</span><span class="delta"><span class="plus">+' + file.added + '</span> <span class="minus">\\u2212' + file.removed + '</span></span></li>';
  }).join("");
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  paintHead();
}
function paintHead() {
  const file = files[at];
  if (!file) { head.innerHTML = ""; return; }
  const [dir, name] = parts(file.path);
  head.innerHTML = '<span class="fpath" title="' + esc(file.path) + '"><span class="folder">' + esc(dir) + '</span><b>' + esc(name) + '</b></span><span class="fstat"><span class="plus">+' + file.added + '</span> <span class="minus">\\u2212' + file.removed + '</span>' + blocks(file) + '</span>';
}
function paintDiff() {
  const file = files[at];
  if (!file) { diff.innerHTML = '<div class="empty">This pull request changes no files.</div>'; return; }
  if (file.binary) { diff.innerHTML = '<div class="empty">Binary file, no text diff to show.</div>'; return; }
  const rows = file.lines.map((line) => {
    if (line.t === "gap") return '<tr class="gap"><td colspan="4">' + (line.n > 0 ? line.n + " unchanged lines" : "...") + '</td></tr>';
    if (line.t === "note") return '<tr class="gap"><td colspan="4">No newline at end of file</td></tr>';
    return '<tr class="' + esc(line.t) + '"><td class="n">' + (line.a ?? "") + '</td><td class="n">' + (line.d ?? "") + '</td><td class="s"></td><td class="code">' + line.h + '</td></tr>';
  }).join("");
  const cut = file.truncated ? '<div class="empty">' + file.truncated + ' more lines are not shown here.</div>' : "";
  diff.innerHTML = rows ? '<table>' + rows + '</table>' + cut : '<div class="empty">No lines changed in this file.</div>';
  diff.scrollTop = 0;
}
function show(i) {
  if (!files.length) return paintDiff();
  at = Math.max(0, Math.min(files.length - 1, i));
  paintList();
  paintDiff();
}
function markAndMove() {
  const file = files[at];
  if (!file) return;
  marks = read();
  if (marks[file.path] === file.sig) delete marks[file.path];
  else marks[file.path] = file.sig;
  write(marks);
  const done = seen();
  show(done.has(file.path) ? nextToRead(paths, at, done) : at);
}
list.addEventListener("click", (event) => {
  const row = event.target.closest("li[data-i]");
  if (row) show(Number(row.dataset.i));
});
addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest && event.target.closest("input, textarea, [contenteditable]")) return;
  if (event.key === "v") { event.preventDefault(); markAndMove(); }
  else if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); show(at + 1); }
  else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); show(at - 1); }
});
addEventListener("storage", (event) => { if (event.key === store) { marks = read(); paintList(); } });
show(0);
`;

const shortRepo = (repo) => String(repo || "").split("/").pop();

const bones = (widths, kind = "") => widths.map((width) => `<div class="bone ${kind}" style="width:${width}%"></div>`).join("");

export function prPageStart({ repo, number }) {
  const named = `${shortRepo(repo)} #${number}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(named)}</title>
<style>${PAGE_STYLE}</style></head>
<body>
<div class="waiting" aria-busy="true"><div class="page">
<section class="doc"><div class="loading label"><i></i>Loading ${escapeHtml(named)}</div>${bones([78, 56], "title")}${bones([40, 62, 48])}<br>${bones([92, 84, 90, 66, 88, 40])}</section>
<section class="files-col">${bones([30, 70, 64, 58, 30, 66, 72])}</section>
<section class="right">${bones([86, 70, 54, 88, 36, 72, 90, 60, 76, 92, 68, 40, 84, 58], "code")}</section>
</div></div>
`;
}

export function prPageRest({ pr, files, markdownCss }) {
  const listed = prPageFiles(files);
  const added = listed.reduce((sum, file) => sum + file.added, 0);
  const removed = listed.reduce((sum, file) => sum + file.removed, 0);
  const state = String(pr.state || "open").toLowerCase();
  const data = { key: pr.key, files: listed };
  return `<script>document.title = ${asScriptJson(`#${pr.number} ${pr.title}`)};</script>
<div class="page">
<section class="doc">
<div class="card">
<div class="top"><span class="chip" data-state="${escapeHtml(state)}">${escapeHtml(state)}</span><span class="where">${escapeHtml(shortRepo(pr.repo))} #${escapeHtml(pr.number)}</span>${pr.url ? `<a href="${escapeHtml(pr.url)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}</div>
<h1>${escapeHtml(pr.title)}</h1>
<dl class="facts"><dt>by</dt><dd>${escapeHtml(pr.author)}</dd><dt>into</dt><dd><span class="branch">${escapeHtml(pr.base)}</span> ← <span class="branch">${escapeHtml(pr.head)}</span></dd><dt>size</dt><dd>${listed.length} ${listed.length === 1 ? "file" : "files"} · <span class="plus">+${added}</span> <span class="minus">−${removed}</span></dd></dl>
</div>
<iframe title="Pull request description" sandbox="allow-top-navigation-by-user-activation allow-popups allow-popups-to-escape-sandbox" srcdoc="${escapeHtml(descriptionDoc(pr.bodyHtml, markdownCss))}"></iframe>
</section>
<div class="changes-head"><span class="label">Files<span class="hint" title="Viewed stays on this machine only"><kbd>v</kbd> viewed</span></span><div class="fhead"></div></div>
<section class="files-col"><ul class="files" role="listbox" aria-label="Changed files"></ul></section>
<section class="right"><div class="diff"></div></section>
</div>
<script type="application/json" id="pr-data">${asScriptJson(data)}</script>
<script>${PAGE_SCRIPT}</script>
</body></html>`;
}

export function prPageFailed({ repo, number, url }) {
  return `<div class="failed" role="alert"><span class="label">Could not load ${escapeHtml(shortRepo(repo))} #${escapeHtml(number)}</span><p>GitHub did not answer. Reload the tab to try again.</p>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open on GitHub ↗</a>` : ""}</div>
</body></html>`;
}

export const prPageHtml = ({ pr, files, markdownCss }) => prPageStart(pr) + prPageRest({ pr, files, markdownCss });

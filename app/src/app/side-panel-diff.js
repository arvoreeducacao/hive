import { esc, phrase, st } from "./core.js";
import { lucide } from "./lucide.js";
import { DIFF_ID, openSurface, registerSurface } from "./side-panel.js";
import { toClipboard } from "./terminal-history.js";

const FRESH = 15000;
const FILES_OPEN = 12;
const LINES_SHOWN = 4000;
const JUMP_TRIES = 20;
const UNCOMMITTED = "uncommitted";
const SCOPE = /^(uncommitted|turn:\d+)$/;
const LOOK_KEY = "hive.sidePanel.diff";
const TEST_PATH = /(^|\/)(__tests__|tests?|spec|e2e)(\/|$)|\.(test|spec)\.[^/]+$|_test\.[^/]+$/i;
const COPIED_FOR = 1400;

const readLook = () => {
  try { return { wrap: false, spaces: false, tests: false, tree: true, ...JSON.parse(localStorage.getItem(LOOK_KEY) || "{}") }; }
  catch { return { wrap: false, spaces: false, tests: false, tree: true }; }
};

const look = readLook();

const saveLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch {} };

const cache = new Map();

let jump = null;

let copied = "";

const seatKey = (s) => `${s.where === "cloud" ? "cloud" : "local"}:${s.name}`;

const where = (s) => (s.where === "cloud" ? "cloud" : "local");

const treePath = (s) => (s.trees || []).find((one) => one?.path)?.path || "";

function bag(s) {
  const key = seatKey(s);
  if (!cache.has(key)) cache.set(key, { changes: null, files: new Map(), turns: null, patches: new Map(), open: new Map(), folders: new Map() });
  return cache.get(key);
}

const stale = (slot) => !slot || (!slot.asking && Date.now() - slot.at > FRESH);

async function ask(slot, url, repaint) {
  slot.asking = true;
  let said = null;
  try { said = await (await fetch(url)).json(); } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  Object.assign(slot, { at: Date.now(), said, asking: false });
  repaint();
}

function changesOf(s, repaint) {
  const b = bag(s);
  if (stale(b.changes)) {
    b.changes = b.changes || { at: 0, said: null };
    ask(b.changes, `/api/changes?name=${encodeURIComponent(s.name)}&where=${where(s)}`, repaint);
  }
  return b.changes.said;
}

function fileDiffOf(s, path, repaint) {
  const b = bag(s);
  let slot = b.files.get(path);
  if (stale(slot)) {
    slot = slot || { at: 0, said: null };
    b.files.set(path, slot);
    ask(slot, `/api/changes/diff?name=${encodeURIComponent(s.name)}&where=${where(s)}&path=${encodeURIComponent(path)}`, repaint);
  }
  return slot.said;
}

function turnsOf(s, repaint) {
  const path = treePath(s);
  if (s.where === "cloud" || !path) return [];
  const b = bag(s);
  if (stale(b.turns)) {
    b.turns = b.turns || { at: 0, said: null };
    ask(b.turns, `/api/checkpoints?name=${encodeURIComponent(s.name)}&path=${encodeURIComponent(path)}`, repaint);
  }
  return (b.turns.said?.turns || []).filter((one) => !one.baseline);
}

function patchOf(s, ordinal, repaint) {
  const b = bag(s);
  let slot = b.patches.get(ordinal);
  if (!slot || (!slot.asking && !slot.said)) {
    slot = slot || { at: 0, said: null };
    b.patches.set(ordinal, slot);
    ask(slot, `/api/checkpoints/diff?name=${encodeURIComponent(s.name)}&path=${encodeURIComponent(treePath(s))}&ordinal=${ordinal}`, repaint);
  }
  return slot.said;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

const ESCAPES = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, "\\": 92 };

function unquote(raw) {
  const text = String(raw || "");
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text;
  const body = text.slice(1, -1);
  const bytes = [];
  const encoder = new TextEncoder();
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];
    if (char !== "\\") { bytes.push(...encoder.encode(char)); continue; }
    const next = body[at + 1] || "";
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(body.slice(at + 1, at + 4), 8));
      at += 3;
      continue;
    }
    bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
    at += 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function sidePath(token, side) {
  const clean = unquote(String(token || "").replace(/\t$/, ""));
  if (!clean || clean === "/dev/null") return "";
  return clean.startsWith(`${side}/`) ? clean.slice(2) : clean;
}

function headerPath(line) {
  const rest = line.slice("diff --git ".length);
  const quoted = / ("b\/(?:[^"\\]|\\.)*")$/.exec(rest);
  if (quoted) return sidePath(quoted[1], "b");
  const plain = / b\/(.+)$/.exec(rest);
  return plain ? plain[1] : rest;
}

function filesOfPatch(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let left = 0;
  let right = 0;
  for (const line of String(text || "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = { path: headerPath(line), hunks: [], added: 0, removed: 0, binary: false };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (!hunk && line.startsWith("+++ ")) { const path = sidePath(line.slice(4), "b"); if (path) file.path = path; continue; }
    if (!hunk && line.startsWith("--- ")) { const path = sidePath(line.slice(4), "a"); if (path && !file.hunks.length) file.from = path; continue; }
    if (line.startsWith("rename to ")) { file.path = unquote(line.slice(10)); continue; }
    if (line.startsWith("Binary files ") || line === "GIT binary patch") { file.binary = true; continue; }
    const head = HUNK.exec(line);
    if (head) {
      left = Number(head[1]);
      right = Number(head[2]);
      hunk = { head: line.replace(/ @@ .*$/, " @@"), context: head[3] || "", lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk || line.startsWith("\\")) continue;
    const sign = line[0];
    if (sign === "+") { hunk.lines.push({ kind: "add", old: 0, new: right++, text: line.slice(1) }); file.added++; }
    else if (sign === "-") { hunk.lines.push({ kind: "del", old: left++, new: 0, text: line.slice(1) }); file.removed++; }
    else if (sign === " ") hunk.lines.push({ kind: "ctx", old: left++, new: right++, text: line.slice(1) });
  }
  return files;
}

const bare = (text) => String(text || "").replace(/\s+/g, "");

function withoutSpaceChanges(lines) {
  const out = [];
  for (let at = 0; at < lines.length;) {
    if (lines[at].kind !== "del" && lines[at].kind !== "add") { out.push(lines[at]); at += 1; continue; }
    const dels = [];
    const adds = [];
    while (at < lines.length && lines[at].kind === "del") dels.push(lines[at++]);
    while (at < lines.length && lines[at].kind === "add") adds.push(lines[at++]);
    const kept = { dels: dels.filter((one) => bare(one.text)), adds: adds.filter((one) => bare(one.text)) };
    const same = kept.dels.length === kept.adds.length && kept.dels.every((one, i) => bare(one.text) === bare(kept.adds[i].text));
    if (same) for (const [i, one] of kept.adds.entries()) out.push({ kind: "ctx", old: kept.dels[i].old, new: one.new, text: one.text });
    else out.push(...kept.dels, ...kept.adds);
  }
  return out;
}

const count = (n) => Number(n || 0).toLocaleString("en-US");

const statHtml = (added, removed) => `<span class="df-stat"><span class="add">+${esc(count(added))}</span> <span class="del">−${esc(count(removed))}</span></span>`;

function pathHtml(path) {
  const at = path.lastIndexOf("/");
  const dir = at < 0 ? "" : path.slice(0, at + 1);
  const name = at < 0 ? path : path.slice(at + 1);
  return `<span class="df-path">${dir ? `<span class="df-dir">${esc(dir)}</span>` : ""}<span class="df-name">${esc(name)}</span></span>`;
}

function hunksHtml(hunks, budget) {
  const rows = [];
  for (const hunk of hunks) {
    const lines = look.spaces ? withoutSpaceChanges(hunk.lines) : hunk.lines;
    if (look.spaces && lines.every((one) => one.kind === "ctx")) continue;
    rows.push(`<div class="dl dl-hunk"><span class="dn"></span><span class="dn"></span><span class="dt">${esc(`${hunk.head}${hunk.context ? ` ${hunk.context}` : ""}`)}</span></div>`);
    for (const line of lines) {
      if (budget.left <= 0) { budget.cut += 1; continue; }
      budget.left -= 1;
      const sign = line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ";
      rows.push(`<div class="dl ${line.kind}"><span class="dn">${line.old || ""}</span><span class="dn">${line.new || ""}</span><span class="dt"><span class="ds">${sign}</span>${esc(line.text)}</span></div>`);
    }
  }
  return rows.join("") || emptyHtml(phrase("Only spaces changed in this file"));
}

function fileHtml(file, body, open, actions = "") {
  const id = `df-${encodeURIComponent(file.path).replace(/%/g, "_")}`;
  const copyOn = copied === file.path;
  const copy = `<button type="button" class="df-act df-copy${copyOn ? " done" : ""}" data-act="diff-copy" data-path="${esc(file.path)}" title="${esc(copyOn ? phrase("Copied") : phrase("Copy path"))}" aria-label="${esc(phrase("Copy the path of {file}", { file: file.path }))}">${lucide(copyOn ? "check" : "copy")}</button>`;
  return `<section class="df${open ? " open" : ""}" data-path="${esc(file.path)}" aria-label="${esc(file.path)}">
    <div class="df-head"><button type="button" class="df-toggle" data-act="diff-file" data-path="${esc(file.path)}" aria-expanded="${open}" aria-controls="${esc(id)}" title="${esc(open ? phrase("Collapse file") : phrase("Expand file"))}">${lucide("down", "df-chev")}${pathHtml(file.path)}</button>${copy}${statHtml(file.added, file.removed)}${actions}</div>
    ${open ? `<div class="df-body" id="${esc(id)}">${body}</div>` : ""}
  </section>`;
}

function treeOf(files) {
  const root = { name: "", path: "", dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(file);
  }
  return root;
}

function compacted(dir) {
  let node = dir;
  while (!node.files.length && node.dirs.size === 1) {
    const [child] = node.dirs.values();
    node = { ...child, name: `${node.name}/${child.name}` };
  }
  return node;
}

function treeRowsHtml(node, depth, scope, b) {
  const rows = [];
  for (const dir of [...node.dirs.values()].map(compacted).sort((x, y) => x.name.localeCompare(y.name))) {
    const open = !b.folders.get(`${scope}|${dir.path}`);
    rows.push(`<button type="button" class="dt-row dt-dir" data-act="diff-folder" data-folder="${esc(dir.path)}" aria-expanded="${open}" style="--depth:${depth}" title="${esc(open ? phrase("Collapse folder") : phrase("Expand folder"))}">${lucide("down", "dt-chev")}${lucide("folder", "dt-icon")}<span class="dt-name">${esc(dir.name)}</span></button>`);
    if (open) rows.push(treeRowsHtml(dir, depth + 1, scope, b));
  }
  for (const file of node.files) {
    const name = file.path.split("/").pop();
    rows.push(`<button type="button" class="dt-row dt-file" data-act="diff-jump" data-path="${esc(file.path)}" style="--depth:${depth}" title="${esc(file.path)}">${lucide("file", "dt-icon")}<span class="dt-name">${esc(name)}</span>${statHtml(file.added, file.removed)}</button>`);
  }
  return rows.join("");
}

function listHtml(files, scope, b) {
  if (!files.length || !look.tree) return "";
  return `<nav class="dt-list" aria-label="${esc(phrase("Changed files"))}">${treeRowsHtml(treeOf(files), 0, scope, b)}</nav>`;
}

function scopeHtml(scope, turns) {
  const options = [`<option value="${UNCOMMITTED}"${scope === UNCOMMITTED ? " selected" : ""}>${esc(phrase("Uncommitted"))}</option>`];
  const latest = turns[turns.length - 1];
  for (const turn of [...turns].reverse()) {
    const value = `turn:${turn.ordinal}`;
    const label = turn === latest ? phrase("Latest turn") : phrase("Turn {n}", { n: turn.ordinal });
    options.push(`<option value="${esc(value)}"${scope === value ? " selected" : ""}>${esc(label)}</option>`);
  }
  return `<label class="dscope"><span class="sp-sr">${esc(phrase("Diff scope"))}</span><select class="dscope-pick" data-diff-scope>${options.join("")}</select></label>`;
}

const emptyHtml = (text) => `<p class="dempty">${esc(text)}</p>`;

function toggleHtml(key, icon, on, said) {
  return `<button type="button" class="dbar-btn${on ? " on" : ""}" data-act="diff-look" data-look="${key}" aria-pressed="${on}" title="${esc(said)}" aria-label="${esc(said)}">${lucide(icon)}</button>`;
}

const scopeOf = (extra) => (typeof extra.diffScope === "string" && SCOPE.test(extra.diffScope) ? extra.diffScope : UNCOMMITTED);

function shownFiles(files) {
  return look.tests ? files.filter((file) => !TEST_PATH.test(file.path)) : files;
}

function diffHtml(s, extra, repaint) {
  if (!s) return `<div class="sp-diff">${emptyHtml(phrase("This chat has no changes to show yet"))}</div>`;
  const scope = scopeOf(extra);
  const b = bag(s);
  const turns = turnsOf(s, repaint);
  const ordinal = scope.startsWith("turn:") ? Number(scope.slice(5)) : 0;
  const budget = { left: LINES_SHOWN, cut: 0 };
  let all = [];
  let blocks = "";
  let note = "";
  if (ordinal) {
    const said = patchOf(s, ordinal, repaint);
    if (!said) note = phrase("Reading the diff…");
    else if (said.error) note = said.error;
    else {
      all = filesOfPatch(said.patch);
      blocks = shownFiles(all).map((file, at) => {
        const open = b.open.get(`${scope}|${file.path}`) ?? at < FILES_OPEN;
        const body = !open ? "" : file.binary ? emptyHtml(phrase("Binary file")) : hunksHtml(file.hunks, budget);
        return fileHtml(file, body, open);
      }).join("");
      if (said.cut) blocks += emptyHtml(phrase("This diff was cut at 2 MB, so the files below that point are missing"));
      if (!all.length) note = phrase("This turn changed no files");
    }
  } else {
    const said = changesOf(s, repaint);
    if (!said) note = phrase("Reading the changes…");
    else if (said.state !== "ok") note = said.error || phrase("git did not answer");
    else {
      all = said.files || [];
      blocks = shownFiles(all).map((file, at) => {
        const open = b.open.get(`${scope}|${file.path}`) ?? at < FILES_OPEN;
        let body = "";
        if (open) {
          const diff = fileDiffOf(s, file.path, repaint);
          body = !diff ? emptyHtml(phrase("Reading the diff…"))
            : diff.error ? emptyHtml(diff.error)
              : diff.binary ? emptyHtml(phrase("Binary file"))
                : `${hunksHtml(diff.hunks || [], budget)}${diff.cut ? emptyHtml(phrase("{n} more lines of this file are not shown", { n: count(diff.cut) })) : ""}`;
        }
        const opener = s.where === "cloud" ? "" : `<button type="button" class="df-act" data-act="diff-open" data-path="${esc(file.path)}" title="${esc(phrase("Open in the editor"))}" aria-label="${esc(phrase("Open {file} in the editor", { file: file.path }))}">${lucide("external")}</button>`;
        return fileHtml(file, body, open, opener);
      }).join("");
      if (!all.length) note = phrase("No uncommitted changes");
    }
  }
  const files = shownFiles(all);
  if (all.length && !files.length) note = phrase("Every changed file is a test");
  const added = files.reduce((sum, file) => sum + (file.added || 0), 0);
  const removed = files.reduce((sum, file) => sum + (file.removed || 0), 0);
  const allOpen = files.length > 0 && files.every((file, at) => b.open.get(`${scope}|${file.path}`) ?? at < FILES_OPEN);
  const fold = files.length ? `<button type="button" class="dbar-btn" data-act="diff-all" aria-pressed="${allOpen}" title="${esc(allOpen ? phrase("Collapse all") : phrase("Expand all"))}" aria-label="${esc(allOpen ? phrase("Collapse all") : phrase("Expand all"))}">${lucide(allOpen ? "foldAll" : "unfoldAll")}</button>` : "";
  const tools = [
    `<button type="button" class="dbar-btn" data-act="diff-refresh" title="${esc(phrase("Refresh"))}" aria-label="${esc(phrase("Refresh"))}">${lucide("refresh")}</button>`,
    fold,
    toggleHtml("wrap", "wrap", look.wrap, look.wrap ? phrase("Stop wrapping lines") : phrase("Wrap long lines")),
    toggleHtml("spaces", "space", look.spaces, look.spaces ? phrase("Show space changes") : phrase("Hide space changes")),
    toggleHtml("tests", "flask", look.tests, look.tests ? phrase("Show test files") : phrase("Hide test files")),
    toggleHtml("tree", "listTree", look.tree, look.tree ? phrase("Hide the file tree") : phrase("Show the file tree"))
  ].join("");
  const cut = budget.cut ? emptyHtml(phrase("{n} more lines are not shown", { n: count(budget.cut) })) : "";
  return `<div class="sp-diff${look.wrap ? " wrap" : ""}" role="region" aria-label="${esc(phrase("Diff"))}">
    <div class="dbar">${scopeHtml(scope, turns)}${files.length ? statHtml(added, removed) : ""}<span class="dbar-fill"></span>${tools}</div>
    <div class="dmain"><div class="dfiles">${note ? emptyHtml(note) : `${blocks}${cut}`}</div>${listHtml(files, scope, b)}</div>
  </div>`;
}

function focusKeyOf(el) {
  if (!el) return "";
  if (el.matches("[data-diff-scope]")) return "[data-diff-scope]";
  const act = el.dataset.act;
  if (!act) return "";
  const named = `[data-act="${CSS.escape(act)}"]`;
  if (el.dataset.path) return `${named}[data-path="${CSS.escape(el.dataset.path)}"]`;
  if (el.dataset.folder) return `${named}[data-folder="${CSS.escape(el.dataset.folder)}"]`;
  if (el.dataset.look) return `${named}[data-look="${CSS.escape(el.dataset.look)}"]`;
  return named;
}

function paintKeepingFocus(host, html) {
  if (host.dataset.h === html) return false;
  const held = host.contains(document.activeElement) ? focusKeyOf(document.activeElement) : "";
  const files = host.querySelector(".dfiles");
  const top = files ? files.scrollTop : 0;
  host.innerHTML = html;
  host.dataset.h = html;
  const now = host.querySelector(".dfiles");
  if (now) now.scrollTop = top;
  if (held) host.querySelector(held)?.focus();
  return true;
}

function jumpTo(host, path) {
  const section = [...host.querySelectorAll(".df")].find((one) => one.dataset.path === path);
  if (!section) return false;
  section.scrollIntoView?.({ block: "start" });
  section.querySelector(".df-toggle")?.focus();
  return true;
}

function landJump(host, s) {
  if (!jump) return;
  if (jump.name !== s.name || jump.tries <= 0) { jump = null; return; }
  jump.tries -= 1;
  if (jumpTo(host, jump.path)) jump = null;
}

function paint(host, s, extra, repaint) {
  paintKeepingFocus(host, diffHtml(s, extra, repaint));
  landJump(host, s);
}

function filesInScope(s, scope) {
  const b = bag(s);
  if (scope.startsWith("turn:")) return shownFiles(filesOfPatch(b.patches.get(Number(scope.slice(5)))?.said?.patch || ""));
  return shownFiles(b.changes?.said?.files || []);
}

function revealFile(s, scope, path) {
  if (s && path) bag(s).open.set(`${scope}|${path}`, true);
}

function acts(act, hit, s, extra, repaint) {
  if (!act.startsWith("diff-") || !s) return false;
  const scope = scopeOf(extra);
  const b = bag(s);
  if (act === "diff-file") {
    const key = `${scope}|${hit.dataset.path}`;
    const at = filesInScope(s, scope).findIndex((file) => file.path === hit.dataset.path);
    b.open.set(key, !(b.open.get(key) ?? at < FILES_OPEN));
  } else if (act === "diff-folder") {
    const key = `${scope}|${hit.dataset.folder}`;
    b.folders.set(key, !b.folders.get(key));
  } else if (act === "diff-all") {
    const files = filesInScope(s, scope);
    const allOpen = files.every((file, at) => b.open.get(`${scope}|${file.path}`) ?? at < FILES_OPEN);
    for (const file of files) b.open.set(`${scope}|${file.path}`, !allOpen);
  } else if (act === "diff-jump") {
    revealFile(s, scope, hit.dataset.path);
    jump = { name: s.name, path: hit.dataset.path, tries: JUMP_TRIES };
  } else if (act === "diff-refresh") {
    cache.delete(seatKey(s));
  } else if (act === "diff-look") {
    look[hit.dataset.look] = !look[hit.dataset.look];
    saveLook();
  } else if (act === "diff-copy") {
    toClipboard(hit.dataset.path);
    copied = hit.dataset.path;
    setTimeout(() => { if (copied === hit.dataset.path) { copied = ""; repaint(); } }, COPIED_FOR);
  } else if (act === "diff-open") {
    fetch("/api/changes/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: s.name, where: where(s), path: hit.dataset.path, line: 1 }) }).catch(() => {});
    return true;
  } else return false;
  repaint();
  return true;
}

function changed(event, s, extra) {
  const pick = event.target.closest?.("[data-diff-scope]");
  if (!pick || !SCOPE.test(pick.value)) return false;
  extra.diffScope = pick.value;
  return true;
}

function openDiffTab(name, { scope = "", file = "" } = {}) {
  const extra = scope && SCOPE.test(scope) ? { diffScope: scope } : null;
  const opened = openSurface(name, DIFF_ID, extra);
  const seat = (st.data?.sessions || []).find((one) => one.name === name);
  if (opened && file && seat) {
    revealFile(seat, scope || UNCOMMITTED, file);
    jump = { name, path: file, tries: JUMP_TRIES };
  }
  return opened;
}

registerSurface({
  id: DIFF_ID,
  icon: "diff",
  label: "Diff",
  letter: "d",
  order: 10,
  ready: (s) => !!s,
  whyNot: () => phrase("This chat has no changes to show yet"),
  paint,
  acts,
  changed
});

export { UNCOMMITTED, filesOfPatch, openDiffTab, withoutSpaceChanges };

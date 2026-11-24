import { render } from "./arrange.js";
import { esc, phrase, renderMarkdown } from "./core.js";
import { asMention, linesExcerpt, mentionPathOf, putInComposer, startMentionDrag } from "./file-mentions.js";
import { lucide } from "./lucide.js";
import { enrichMarkdown, markdownClick } from "./markdown-rich.js";
import { openSurface, registerSurface } from "./side-panel.js";
import { toClipboard } from "./terminal-history.js";

const FILES_ID = "files";
const FRESH = 15000;
const ROWS_SHOWN = 4000;
const FILES_PER_FOLDER = 1000;
const LINES_SHOWN = 5000;
const FILTER_WAIT = 140;
const DONE_FOR = 1400;
const MARKDOWN = /\.(md|markdown|mdown|mdx)$/i;
const MERMAID = /\.(mmd|mermaid)$/i;
const HTML_PAGE = /\.html?$/i;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const FRAME_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'; child-src 'none'";
const INERT = "script, noscript, meta[http-equiv], base, iframe, frame, frameset, object, embed, link, portal";
const MARKDOWN_TOOLS = ".md-copy, .md-wrap, .md-view, .md-table-copy";

const views = new Map();

const seatKey = (s) => `${s.where === "cloud" ? "cloud" : "local"}:${s.name}`;

const sideOf = (s) => (s.where === "cloud" ? "cloud" : "local");

function viewOf(s) {
  const key = seatKey(s);
  if (!views.has(key)) {
    views.set(key, { dirs: new Map(), open: new Set(), shut: new Set(), filter: "", found: null, files: new Map(), pick: null, done: "", fail: "", focus: "", timer: 0 });
  }
  return views.get(key);
}

const isPathish = (path) => typeof path === "string" && !!path && path.length < 400 && !path.startsWith("/") && !path.split("/").some((part) => !part || part === "." || part === "..");

const openPathOf = (extra) => (isPathish(extra?.filesPath) ? extra.filesPath : "");

const kindOfFile = (path) => (MARKDOWN.test(path) ? "markdown" : MERMAID.test(path) ? "mermaid" : HTML_PAGE.test(path) ? "html" : "");

const stale = (slot) => !slot || (!slot.asking && Date.now() - slot.at > FRESH);

async function ask(slot, url, repaint) {
  slot.asking = true;
  let said = null;
  try { said = await (await fetch(url)).json(); } catch (wrong) { said = { state: "unread", error: String(wrong?.message || wrong) }; }
  Object.assign(slot, { at: Date.now(), said, asking: false });
  repaint();
}

const seatQuery = (s) => `name=${encodeURIComponent(s.name)}&where=${sideOf(s)}`;

function listingOf(s, v, dir, repaint, force = false) {
  let slot = v.dirs.get(dir);
  if (force || stale(slot)) {
    slot = slot || { at: 0, said: null };
    v.dirs.set(dir, slot);
    if (!slot.asking) ask(slot, `/api/tree?${seatQuery(s)}&dir=${encodeURIComponent(dir)}${force ? "&force=1" : ""}`, repaint);
  }
  return slot.said;
}

function foundOf(s, v, repaint) {
  const q = v.filter.trim();
  if (!q) return null;
  if (v.found?.q === q) {
    if (stale(v.found)) ask(v.found, `/api/tree?${seatQuery(s)}&q=${encodeURIComponent(q)}`, repaint);
    return v.found;
  }
  const slot = { q, at: 0, said: null, asking: true };
  v.found = slot;
  clearTimeout(v.timer);
  v.timer = setTimeout(() => { if (v.found === slot) ask(slot, `/api/tree?${seatQuery(s)}&q=${encodeURIComponent(q)}`, repaint); }, FILTER_WAIT);
  return slot;
}

function fileOf(s, v, path, repaint) {
  let slot = v.files.get(path);
  if (stale(slot)) {
    slot = slot || { at: 0, said: null };
    v.files.set(path, slot);
    ask(slot, `/api/tree/file?${seatQuery(s)}&path=${encodeURIComponent(path)}`, repaint);
  }
  return slot.said;
}

const noteHtml = (text, depth = 0) => `<p class="fx-note" style="--depth:${depth}">${esc(text)}</p>`;

function sizeSaid(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function treeTrouble(said) {
  if (said.state === "gone") return phrase("The folder of this chat is not there any more");
  if (said.state === "outside") return phrase("This folder is outside the chat's folder");
  return phrase("Could not list the files: {why}", { why: said.error || phrase("no answer") });
}

function marked(name, q) {
  if (!q) return esc(name);
  const at = name.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return esc(name);
  return `${esc(name.slice(0, at))}<mark>${esc(name.slice(at, at + q.length))}</mark>${esc(name.slice(at + q.length))}`;
}

function folderRow(dir, depth, open) {
  const title = dir.nested ? `${dir.path} · ${phrase("a separate repository")}` : dir.path;
  return `<button type="button" class="fx-row fx-dir" data-act="files-folder" data-path="${esc(dir.path)}" data-drag="${esc(dir.path)}" data-folder="1" draggable="true" aria-expanded="${open}" style="--depth:${depth}" title="${esc(title)}">${lucide("down", "fx-chev")}${lucide("folder", "fx-icon")}<span class="fx-name">${esc(dir.name)}</span></button>`;
}

function fileRow(path, name, depth, openPath, q = "") {
  const on = path === openPath;
  return `<button type="button" class="fx-row fx-item${on ? " on" : ""}" data-act="files-open" data-path="${esc(path)}" data-drag="${esc(path)}" draggable="true" style="--depth:${depth}"${on ? ' aria-current="true"' : ""} title="${esc(`${path} · ${phrase("drag it to the chat to mention it")}`)}">${lucide("file", "fx-icon")}<span class="fx-name">${marked(name, q)}</span></button>`;
}

function rowsOfFolder(s, v, dir, depth, out, openPath, repaint) {
  const said = listingOf(s, v, dir, repaint);
  if (!said) return void out.push(noteHtml(phrase("Reading the files…"), depth));
  if (said.state !== "ok") return void out.push(noteHtml(treeTrouble(said), depth));
  const listing = said.listing;
  if (!listing || listing.missing) return void out.push(noteHtml(listing?.error ? phrase("Could not list the files: {why}", { why: listing.error }) : phrase("This folder is empty"), depth));
  for (const folder of listing.dirs) {
    if (out.length >= ROWS_SHOWN) return;
    const open = v.open.has(folder.path);
    out.push(folderRow(folder, depth, open));
    if (open) rowsOfFolder(s, v, folder.path, depth + 1, out, openPath, repaint);
  }
  for (const file of listing.files.slice(0, FILES_PER_FOLDER)) {
    if (out.length >= ROWS_SHOWN) return;
    out.push(fileRow(file.path, file.name, depth, openPath));
  }
  if (listing.files.length > FILES_PER_FOLDER) out.push(noteHtml(phrase("{n} more files in this folder. Use the filter to find them", { n: (listing.files.length - FILES_PER_FOLDER).toLocaleString() }), depth));
  if (!listing.dirs.length && !listing.files.length) out.push(noteHtml(phrase("This folder is empty"), depth));
}

function treeOfPaths(paths) {
  const root = { name: "", path: "", dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(path);
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

const byName = (a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

function foundRows(node, depth, v, openPath, q, out) {
  for (const dir of [...node.dirs.values()].map(compacted).sort((a, b) => byName(a.name, b.name))) {
    const open = !v.shut.has(dir.path);
    out.push(folderRow(dir, depth, open));
    if (open) foundRows(dir, depth + 1, v, openPath, q, out);
  }
  for (const path of [...node.files].sort((a, b) => byName(a.split("/").pop(), b.split("/").pop()))) out.push(fileRow(path, path.split("/").pop(), depth, openPath, q));
}

function foundHtml(s, v, openPath, repaint) {
  const slot = foundOf(s, v, repaint);
  const q = slot.q;
  if (!slot.said) return noteHtml(phrase("Looking for “{q}”…", { q }));
  if (slot.said.state !== "ok") return noteHtml(treeTrouble(slot.said));
  const matches = slot.said.matches || [];
  if (!matches.length) return noteHtml(phrase("No file name has “{q}”", { q }));
  const out = [];
  foundRows(treeOfPaths(matches), 0, v, openPath, q, out);
  if (slot.said.matched > matches.length) out.push(noteHtml(phrase("Showing {shown} of {total} files with “{q}”", { shown: matches.length.toLocaleString(), total: slot.said.matched.toLocaleString(), q })));
  return out.join("");
}

function treeHtml(s, v, head, openPath, repaint) {
  if (!head) return noteHtml(phrase("Reading the files…"));
  if (head.state !== "ok") return noteHtml(treeTrouble(head));
  if (v.filter.trim()) return foundHtml(s, v, openPath, repaint);
  const out = [];
  rowsOfFolder(s, v, "", 0, out, openPath, repaint);
  if (out.length >= ROWS_SHOWN) out.push(noteHtml(phrase("Only the first {n} rows are shown. Use the filter to find the rest", { n: ROWS_SHOWN.toLocaleString() })));
  return out.join("");
}

function footHtml(head) {
  if (head?.state !== "ok") return "";
  const folder = String(head.root || "").replace(/\/+$/, "").split("/").pop();
  const count = head.cut ? phrase("the first {n} files", { n: Number(head.total || 0).toLocaleString() }) : phrase("{n} files", { n: Number(head.total || 0).toLocaleString() });
  return `${folder ? `<span class="fx-root">${lucide("folder")}<span>${esc(folder)}</span></span>` : ""}<span class="fx-count">${esc(count)}</span>`;
}

function toolsHtml(v) {
  return [
    `<button type="button" class="fx-ib" data-act="files-refresh" title="${esc(phrase("Refresh the files"))}" aria-label="${esc(phrase("Refresh the files"))}">${lucide("refresh")}</button>`,
    `<button type="button" class="fx-ib" data-act="files-collapse" title="${esc(phrase("Collapse every folder"))}" aria-label="${esc(phrase("Collapse every folder"))}"${v.open.size ? "" : " disabled"}>${lucide("foldAll")}</button>`
  ].join("");
}

function pathHtml(path) {
  const at = path.lastIndexOf("/");
  return `<span class="fx-path" title="${esc(path)}">${at < 0 ? "" : `<span class="fx-dirname">${esc(path.slice(0, at + 1))}</span>`}<span class="fx-basename">${esc(path.slice(at + 1))}</span></span>`;
}

function flashButton(v, what, act, icon, said, saidDone) {
  const done = v.done === what;
  return `<button type="button" class="fx-ib${done ? " done" : ""}" data-act="${act}" title="${esc(done ? saidDone : said)}" aria-label="${esc(done ? saidDone : said)}">${lucide(done ? "check" : icon)}</button>`;
}

function headHtml(v, path, kind, source, ready) {
  const flip = kind && ready
    ? `<button type="button" class="fx-ib${source ? " on" : ""}" data-act="files-source" aria-pressed="${source}" title="${esc(source ? phrase("Show it rendered") : phrase("Show the source"))}" aria-label="${esc(source ? phrase("Show it rendered") : phrase("Show the source"))}">${lucide(source ? "eye" : "code")}</button>`
    : "";
  return [
    `<button type="button" class="fx-ib" data-act="files-back" title="${esc(phrase("Back to the files"))}" aria-label="${esc(phrase("Back to the files"))}">${lucide("arrowLeft")}</button>`,
    pathHtml(path),
    flip,
    flashButton(v, "copy", "files-copy", "copy", phrase("Copy the file path"), phrase("Path copied")),
    flashButton(v, "mention", "files-mention", "messagePlus", phrase("Add the file to the chat"), phrase("Added to the chat"))
  ].join("");
}

function fileTrouble(said) {
  if (said.state === "binary") return phrase("This is a binary file, so it is not shown here ({size})", { size: sizeSaid(said.size) });
  if (said.state === "big") return phrase("This file is too big to show here ({size})", { size: sizeSaid(said.size) });
  if (said.state === "missing") return phrase("This file is not there any more");
  if (said.state === "outside") return phrase("This file points outside the chat's folder, so it is not opened");
  if (said.state === "folder") return phrase("This is a folder");
  if (said.state === "gone") return phrase("The folder of this chat is not there any more");
  return phrase("Could not read the file: {why}", { why: said.error || phrase("no answer") });
}

function withFrontMatter(text) {
  const head = FRONT_MATTER.exec(text);
  return head ? `\`\`\`yaml\n${head[1]}\n\`\`\`\n\n${text.slice(head[0].length)}` : text;
}

function inertDocument(text) {
  const doc = new DOMParser().parseFromString(String(text || ""), "text/html");
  for (const el of doc.querySelectorAll(INERT)) el.remove();
  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*(javascript|vbscript):/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  }
  for (const link of doc.querySelectorAll("a[href], area[href]")) link.setAttribute("target", "_blank");
  const policy = doc.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute("content", FRAME_POLICY);
  doc.head.prepend(policy);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function sourceHtml(said) {
  const text = String(said.text || "");
  const lines = Array.isArray(said.lines) && said.lines.length ? said.lines : text.split("\n").map((line) => esc(line));
  const all = text.endsWith("\n") && lines.length > 1 && lines.at(-1) === "" ? lines.slice(0, -1) : lines;
  const shown = all.slice(0, LINES_SHOWN);
  const pick = phrase("Pick this line. Shift-click picks a range");
  const rows = shown.map((html, at) => `<div class="fx-ln" data-line="${at + 1}"><span class="fx-no" data-act="files-line" data-line="${at + 1}" title="${esc(pick)}">${at + 1}</span><span class="fx-tx">${html || " "}</span></div>`).join("");
  const cut = all.length > shown.length ? noteHtml(phrase("Only the first {n} lines are shown", { n: LINES_SHOWN.toLocaleString() })) : "";
  return `<div class="fx-src md" style="--digits:${String(shown.length).length}"><div class="md-code fx-code">${rows}</div></div>${cut}`;
}

const painted = new WeakMap();

function paintBody(body, s, path, mode, said) {
  const text = said?.state === "ok" ? said.text : "";
  const was = painted.get(body);
  const trouble = !said ? "reading" : said.state !== "ok" ? `${said.state}:${said.error || ""}:${said.size || 0}` : "";
  if (was && was.path === path && was.mode === mode && was.text === text && was.trouble === trouble) return false;
  const keep = was && was.path === path && was.mode === mode;
  const top = keep ? body.scrollTop : 0;
  const left = keep ? body.scrollLeft : 0;
  painted.set(body, { path, mode, text, trouble });
  body.dataset.mode = mode || "note";
  if (!said) body.innerHTML = noteHtml(phrase("Reading the file…"));
  else if (said.state !== "ok") body.innerHTML = noteHtml(fileTrouble(said));
  else if (mode === "markdown" || mode === "mermaid") {
    const source = mode === "mermaid" ? `\`\`\`mermaid\n${text.trim()}\n\`\`\`` : withFrontMatter(text);
    body.innerHTML = `<article class="fx-doc md">${renderMarkdown(source)}</article>`;
    enrichMarkdown(body.firstElementChild);
  } else if (mode === "html") {
    body.innerHTML = `${noteHtml(phrase("Scripts on this page do not run here, and it cannot reach the network"))}<iframe class="fx-frame" sandbox="" referrerpolicy="no-referrer" loading="lazy"></iframe>`;
    const frame = body.querySelector(".fx-frame");
    frame.title = path;
    frame.srcdoc = inertDocument(text);
  } else body.innerHTML = sourceHtml(said);
  body.scrollTop = top;
  body.scrollLeft = left;
  return true;
}

function paintPicked(body, pick, path, fresh) {
  const key = pick && pick.path === path ? `${pick.from}-${pick.to}` : "";
  if (!fresh && body.fxPicked === key) return;
  body.fxPicked = key;
  const rows = body.querySelectorAll(".fx-ln");
  for (const row of body.querySelectorAll(".fx-ln.sel")) row.classList.remove("sel");
  if (!key) return;
  for (let line = pick.from; line <= Math.min(pick.to, rows.length); line += 1) rows[line - 1]?.classList.add("sel");
}

function pickHtml(v, path) {
  const pick = v.pick?.path === path ? v.pick : null;
  const done = v.done === "send";
  const range = !pick ? phrase("Pick lines by their number, or select them, to add them to the chat")
    : pick.from === pick.to ? phrase("Line {n}", { n: pick.from }) : phrase("Lines {from}–{to}", { from: pick.from, to: pick.to });
  const said = done ? phrase("Added to the chat") : phrase("Add to chat");
  const send = `<button type="button" class="fx-send${done ? " done" : ""}" data-act="files-send" aria-label="${esc(said)}" title="${esc(said)}"${pick ? "" : " disabled"}>${lucide(done ? "check" : "messagePlus")}<span>${esc(said)}</span></button>`;
  const clear = pick ? `<button type="button" class="fx-ib" data-act="files-unpick" title="${esc(phrase("Clear the selection"))}" aria-label="${esc(phrase("Clear the selection"))}">${lucide("x")}</button>` : "";
  const fail = v.fail ? `<span class="fx-fail" role="status">${esc(v.fail)}</span>` : "";
  return `<span class="fx-range${pick ? " on" : ""}">${esc(range)}</span>${fail}<span class="fx-fill"></span>${clear}${send}`;
}

function focusKeyOf(el) {
  if (!el?.dataset?.act) return "";
  const named = `[data-act="${CSS.escape(el.dataset.act)}"]`;
  if (el.dataset.path) return `${named}[data-path="${CSS.escape(el.dataset.path)}"]`;
  if (el.dataset.line) return `${named}[data-line="${CSS.escape(el.dataset.line)}"]`;
  return named;
}

function setHtml(el, html) {
  if (el.fxHtml === html) return false;
  const held = el.contains(document.activeElement) ? focusKeyOf(document.activeElement) : "";
  const top = el.scrollTop;
  el.innerHTML = html;
  el.fxHtml = html;
  el.scrollTop = top;
  if (held) el.querySelector(held)?.focus({ preventScroll: true });
  return true;
}

function shellOf(host) {
  if (host.fxShell?.root.isConnected && host.contains(host.fxShell.root)) return host.fxShell;
  host.innerHTML = `<div class="fx">
    <div class="fx-tree">
      <div class="fx-bar"><label class="fx-find">${lucide("search")}<input class="fx-q" type="search" spellcheck="false" autocomplete="off"></label><span class="fx-tools"></span></div>
      <div class="fx-list" role="group"></div>
      <div class="fx-foot"></div>
    </div>
    <div class="fx-file" hidden>
      <div class="fx-head"></div>
      <div class="fx-body" tabindex="-1"></div>
      <div class="fx-pick" hidden></div>
    </div>
  </div>`;
  const root = host.firstElementChild;
  host.fxShell = {
    root,
    input: root.querySelector(".fx-q"),
    tools: root.querySelector(".fx-tools"),
    list: root.querySelector(".fx-list"),
    foot: root.querySelector(".fx-foot"),
    file: root.querySelector(".fx-file"),
    head: root.querySelector(".fx-head"),
    body: root.querySelector(".fx-body"),
    pick: root.querySelector(".fx-pick")
  };
  host.addEventListener("click", (event) => clickedInside(event, host));
  host.addEventListener("dragstart", (event) => dragFrom(event, host));
  host.addEventListener("keydown", (event) => keysOf(event, host));
  host.addEventListener("mouseup", () => pickFromSelection(host));
  return host.fxShell;
}

function sayLabels(shell) {
  const filter = phrase("Filter by name");
  if (shell.input.placeholder !== filter) {
    shell.input.placeholder = filter;
    shell.input.setAttribute("aria-label", filter);
    shell.root.setAttribute("aria-label", phrase("Files"));
    shell.list.setAttribute("aria-label", phrase("Files in this chat's folder"));
  }
}

function paint(host, s, extra, repaint) {
  const v = viewOf(s);
  const shell = shellOf(host);
  host.fxSeat = s;
  host.fxExtra = extra;
  host.fxRepaint = repaint;
  sayLabels(shell);
  const head = listingOf(s, v, "", repaint);
  const path = openPathOf(extra);
  shell.root.classList.toggle("reading", !!path);
  if (document.activeElement !== shell.input && shell.input.value !== v.filter) shell.input.value = v.filter;
  setHtml(shell.tools, toolsHtml(v));
  setHtml(shell.list, treeHtml(s, v, head, path, repaint));
  setHtml(shell.foot, footHtml(head));
  shell.file.hidden = !path;
  if (path) {
    const said = fileOf(s, v, path, repaint);
    const kind = kindOfFile(path);
    const ready = said?.state === "ok";
    const source = !kind || extra.filesSource === true;
    const mode = ready ? (source ? "source" : kind) : "";
    setHtml(shell.head, headHtml(v, path, kind, source, ready));
    const fresh = paintBody(shell.body, s, path, mode, said);
    paintPicked(shell.body, v.pick, path, fresh);
    shell.pick.hidden = mode !== "source";
    if (mode === "source") setHtml(shell.pick, pickHtml(v, path));
  }
  if (v.focus) {
    host.querySelector(v.focus)?.focus({ preventScroll: false });
    v.focus = "";
  }
}

function flash(v, what, repaint) {
  v.done = what;
  v.fail = "";
  setTimeout(() => { if (v.done === what) { v.done = ""; repaint(); } }, DONE_FOR);
}

function mentionOf(s, v, path, folder = false) {
  return mentionPathOf(s, { root: v.dirs.get("")?.said?.root || "", path, folder, where: sideOf(s) });
}

function pickedText(v, path) {
  const said = v.files.get(path)?.said;
  if (said?.state !== "ok" || !v.pick || v.pick.path !== path) return null;
  const lines = String(said.text).split("\n");
  return { from: v.pick.from, to: v.pick.to, text: lines.slice(v.pick.from - 1, v.pick.to).join("\n") };
}

const fenceLanguage = (path) => {
  const name = path.split("/").pop();
  return name.includes(".") ? name.split(".").pop().toLowerCase().replace(/[^a-z0-9+#-]/g, "") : "";
};

function inSheet(hit) {
  return !!hit?.closest?.(".sp-sheet");
}

function toggleFolder(v, path) {
  const set = v.filter.trim() ? v.shut : v.open;
  if (set.has(path)) set.delete(path);
  else set.add(path);
}

function acts(act, hit, s, extra, repaint, event) {
  if (!act.startsWith("files-") || !s) return false;
  const v = viewOf(s);
  const path = openPathOf(extra);
  if (act === "files-folder") toggleFolder(v, hit.dataset.path);
  else if (act === "files-open") {
    extra.filesPath = hit.dataset.path;
    v.pick = null;
    v.fail = "";
    v.focus = '.fx-head [data-act="files-back"]';
  } else if (act === "files-back") {
    extra.filesPath = "";
    v.pick = null;
    v.fail = "";
    if (path) v.focus = `.fx-row[data-path="${CSS.escape(path)}"]`;
  } else if (act === "files-source") {
    extra.filesSource = extra.filesSource !== true;
    v.pick = null;
  } else if (act === "files-refresh") {
    v.dirs.clear();
    v.files.clear();
    v.found = null;
    listingOf(s, v, "", repaint, true);
  } else if (act === "files-collapse") v.open.clear();
  else if (act === "files-copy" && path) {
    toClipboard(path);
    flash(v, "copy", repaint);
  } else if (act === "files-mention" && path) {
    if (putInComposer(s.name, asMention(mentionOf(s, v, path)), { focus: !inSheet(hit) })) flash(v, "mention", repaint);
    else v.fail = phrase("This chat cannot take text right now");
  } else if (act === "files-line" && path) pickLine(v, path, Number(hit.dataset.line), !!event?.shiftKey);
  else if (act === "files-unpick") v.pick = null;
  else if (act === "files-send" && path) {
    const picked = pickedText(v, path);
    if (!picked) return true;
    const said = linesExcerpt(mentionOf(s, v, path), picked.from, picked.to, picked.text, fenceLanguage(path));
    if (putInComposer(s.name, said, { block: true, focus: !inSheet(hit) })) flash(v, "send", repaint);
    else v.fail = phrase("This chat cannot take text right now");
  } else return false;
  repaint();
  return true;
}

function pickLine(v, path, line, extend) {
  if (!Number.isFinite(line) || line < 1) return;
  const held = v.pick?.path === path ? v.pick : null;
  if (extend && held) {
    v.pick = { path, anchor: held.anchor, from: Math.min(held.anchor, line), to: Math.max(held.anchor, line) };
    return;
  }
  v.pick = held && held.from === line && held.to === line ? null : { path, anchor: line, from: line, to: line };
  v.fail = "";
}

function pickFromSelection(host) {
  const s = host.fxSeat;
  const path = openPathOf(host.fxExtra);
  const chosen = document.getSelection?.();
  if (!s || !path || !chosen || chosen.isCollapsed || !chosen.rangeCount) return;
  const rowOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(".fx-ln");
  const a = rowOf(chosen.anchorNode);
  const b = rowOf(chosen.focusNode);
  if (!a || !b || !host.contains(a) || !host.contains(b)) return;
  const x = Number(a.dataset.line);
  const y = Number(b.dataset.line);
  viewOf(s).pick = { path, anchor: x, from: Math.min(x, y), to: Math.max(x, y) };
  host.fxRepaint?.();
}

function resolvedFrom(from, target) {
  const bare = String(target || "").replace(/^file:\/\//i, "").replace(/(?:#L\d+.*|:\d+(?::\d+)?)$/, "");
  if (!bare || /^[a-z][\w+.-]*:/i.test(bare)) return "";
  const parts = bare.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of bare.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join("/");
  return isPathish(path) ? path : "";
}

function clickedInside(event, host) {
  const doc = event.target.closest?.(".fx-doc");
  if (!doc) return;
  const fileLink = event.target.closest("a.md-file[data-path]");
  if (fileLink) {
    event.preventDefault();
    const extra = host.fxExtra;
    const target = resolvedFrom(openPathOf(extra), fileLink.dataset.path);
    if (!target || !host.fxSeat) return;
    extra.filesPath = target;
    viewOf(host.fxSeat).pick = null;
    host.fxRepaint?.();
    return;
  }
  if (event.target.closest(MARKDOWN_TOOLS)) return void markdownClick(event);
  if (event.target.closest('a[href="#"]')) event.preventDefault();
}

function dragFrom(event, host) {
  const row = event.target.closest?.("[data-drag]");
  const s = host.fxSeat;
  if (!row || !s) return;
  const v = viewOf(s);
  startMentionDrag(event, { root: v.dirs.get("")?.said?.root || "", path: row.dataset.drag, folder: !!row.dataset.folder, where: sideOf(s) }, s);
}

const rowsOf = (host) => [...host.querySelectorAll(".fx-list .fx-row")];

const depthOf = (row) => Number(row.style.getPropertyValue("--depth")) || 0;

function moveInTree(event, host) {
  const row = event.target.closest?.(".fx-row");
  if (!row) return false;
  const rows = rowsOf(host);
  const at = rows.indexOf(row);
  const folder = row.classList.contains("fx-dir");
  const open = row.getAttribute("aria-expanded") === "true";
  let to = null;
  if (event.key === "ArrowDown") to = rows[at + 1];
  else if (event.key === "ArrowUp") to = at > 0 ? rows[at - 1] : host.querySelector(".fx-q");
  else if (event.key === "Home") to = rows[0];
  else if (event.key === "End") to = rows.at(-1);
  else if (event.key === "ArrowRight" && folder) {
    if (!open) row.click();
    else to = rows[at + 1];
  } else if (event.key === "ArrowLeft") {
    if (folder && open) row.click();
    else to = rows.slice(0, at).reverse().find((one) => one.classList.contains("fx-dir") && depthOf(one) < depthOf(row));
  } else return false;
  event.preventDefault();
  event.stopPropagation();
  to?.focus();
  return true;
}

function keysOf(event, host) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const s = host.fxSeat;
  if (!s) return;
  const v = viewOf(s);
  if (event.target.classList?.contains("fx-q")) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      rowsOf(host)[0]?.focus();
    } else if (event.key === "Escape" && v.filter) {
      event.preventDefault();
      event.stopPropagation();
      event.target.value = "";
      v.filter = "";
      host.fxRepaint?.();
    }
    return;
  }
  if (moveInTree(event, host)) return;
  if (event.key === "Escape" && openPathOf(host.fxExtra) && event.target.closest?.(".fx-file")) {
    event.preventDefault();
    event.stopPropagation();
    host.querySelector('[data-act="files-back"]')?.click();
  }
}

function repaintFrom(el) {
  let at = el;
  while (at && !at.fxRepaint) at = at.parentElement;
  if (at) at.fxRepaint();
  else render();
}

function typed(event, s) {
  const box = event.target.closest?.(".fx-q");
  if (!box || !s) return;
  viewOf(s).filter = box.value;
  repaintFrom(box);
}

function openFilesTab(name, path = "") {
  return openSurface(name, FILES_ID, isPathish(path) ? { filesPath: path } : null);
}

const filesSurface = {
  id: FILES_ID,
  icon: "files",
  label: "Files",
  letter: "f",
  order: 15,
  ready: (s) => !!s && (!!s.cwd || !!(s.trees || []).length || s.where === "cloud"),
  whyNot: () => phrase("This chat has no folder yet"),
  paint,
  acts,
  typed
};

registerSurface(filesSurface);

export { FILES_ID, filesSurface, inertDocument, openFilesTab, resolvedFrom };

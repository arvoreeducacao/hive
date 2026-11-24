const GLYPHS = {
  chevron: '<path d="m9 18 6-6-6-6"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderClosed: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  expand: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  collapse: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  diff: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M9 10h6"/><path d="M12 13V7"/><path d="M9 17h6"/>'
};

const glyph = (name, cls = "") => `<svg class="tx-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name]}</svg>`;

const SECOND = 1000;

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

function countOf(value) {
  const short = (n, unit) => `${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}${unit}`;
  if (value < 1000) return String(value);
  if (value < 1e6) return short(value / 1e3, "k");
  if (value < 1e9) return short(value / 1e6, "m");
  return short(value / 1e9, "b");
}

const statHtml = (added, removed) => `<span class="tx-cf-stat"><span class="add">+${countOf(added)}</span><span class="del">-${countOf(removed)}</span></span>`;

function folded(dir) {
  let node = dir;
  while (node.children.length === 1 && node.children[0].kind === "dir") {
    const only = node.children[0];
    node = { ...only, name: `${node.name}/${only.name}` };
  }
  return node;
}

function nodesOf(dir) {
  const dirs = [...dir.dirs.values()].sort(byName)
    .map((one) => folded({ kind: "dir", name: one.name, path: one.path, added: one.added, removed: one.removed, children: nodesOf(one) }));
  return [...dirs, ...dir.files.slice().sort(byName)];
}

function turnFilesTree(files) {
  const grow = (name, path) => ({ name, path, added: 0, removed: 0, dirs: new Map(), files: [] });
  const root = grow("", "");
  for (const file of files || []) {
    const parts = String(file.path || "").replaceAll("\\", "/").split("/").filter(Boolean);
    if (!parts.length) continue;
    const added = Number(file.added) || 0;
    const removed = Number(file.removed) || 0;
    const ancestors = [root];
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, grow(part, dir.path ? `${dir.path}/${part}` : part));
      dir = dir.dirs.get(part);
      ancestors.push(dir);
    }
    dir.files.push({ kind: "file", name: parts.at(-1), path: parts.join("/"), added, removed });
    for (const one of ancestors) {
      one.added += added;
      one.removed += removed;
    }
  }
  return nodesOf(root);
}

function rowsOf(nodes, open, all, depth = 0, rows = []) {
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.kind === "dir" && (open.get(node.path) ?? all)) rowsOf(node.children, open, all, depth + 1, rows);
  }
  return rows;
}

function checkpointsOfTurns(asks, list) {
  const found = new Map();
  for (const one of list || []) {
    if (one.baseline || !one.files) continue;
    let turn = -1;
    asks.forEach((at, index) => { if (at && at <= one.at + SECOND - 1) turn = index; });
    if (turn >= 0) found.set(turn, one);
  }
  return found;
}

function turnFilesHtml({ turn, all = false, open = new Map(), drag = false, revert = false }, { esc, phrase }) {
  const nodes = turnFilesTree(turn.paths);
  const nested = nodes.some((node) => node.kind === "dir");
  const first = (turn.paths || [])[0]?.path || "";
  const toggle = nested
    ? `<button type="button" class="tx-cf-btn" data-act="cf-all" data-n="${turn.ordinal}" aria-label="${esc(phrase(all ? "Collapse all folders" : "Expand all folders"))}" title="${esc(phrase(all ? "Collapse all folders" : "Expand all folders"))}">${glyph(all ? "collapse" : "expand")}</button>`
    : "";
  const rows = rowsOf(nodes, open, all).map(({ node, depth }) => {
    const pad = `style="padding-left:${8 + depth * 14}px"`;
    if (node.kind === "dir") {
      const expanded = open.get(node.path) ?? all;
      return `<button type="button" class="tx-cf-row dir" data-act="cf-dir" data-n="${turn.ordinal}" data-path="${esc(node.path)}" aria-expanded="${expanded}" ${pad}>${glyph("chevron", "tx-cf-chev")}${glyph(expanded ? "folder" : "folderClosed")}<span class="tx-cf-name">${esc(node.name)}</span>${node.added || node.removed ? statHtml(node.added, node.removed) : ""}</button>`;
    }
    const indent = nested || depth > 0 ? '<span class="tx-cf-gap" aria-hidden="true"></span>' : "";
    return `<button type="button" class="tx-cf-row" data-act="turn-diff" data-n="${turn.ordinal}" data-file="${esc(node.path)}"${drag ? ' draggable="true"' : ""} ${pad}>${indent}${glyph("file")}<span class="tx-cf-name">${esc(node.name)}</span>${statHtml(node.added, node.removed)}</button>`;
  }).join("");
  const count = phrase(turn.files === 1 ? "1 changed file" : "{n} changed files", { n: turn.files });
  const sum = turn.added || turn.removed ? statHtml(turn.added, turn.removed) : "";
  return `<div class="tx-cf-head"><div class="tx-cf-sum"><span>${esc(count)}</span>${sum}</div><div class="tx-cf-acts">${toggle}${revert ? `<button type="button" class="tx-cf-btn" data-act="turn-revert" data-n="${turn.ordinal}" aria-label="${esc(phrase("Put these files back"))}" title="${esc(phrase("Put the files back as they were before this turn"))}">${glyph("undo")}</button>` : ""}<button type="button" class="tx-cf-btn tx-cf-open" data-act="turn-diff" data-n="${turn.ordinal}" data-file="${esc(first)}" aria-label="${esc(phrase("Open diff"))}" title="${esc(phrase("Open the full diff"))}">${glyph("diff")}<span>${esc(phrase("Open diff"))}</span></button></div></div><div class="tx-cf-rows">${rows}</div>`;
}

function pathIn(turn, file) {
  const said = String(file || "");
  return (turn?.paths || []).map((one) => one.path).filter((path) => said === path || said.endsWith(`/${path}`)).sort((a, b) => b.length - a.length)[0] || "";
}

export { checkpointsOfTurns, pathIn, turnFilesHtml, turnFilesTree };

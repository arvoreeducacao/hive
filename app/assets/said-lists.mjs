const ITEM = /^([ \t]*)(?:([-*•])|(\d{1,3})([.)]))[ \t]+/;

export function listItem(line) {
  const hit = ITEM.exec(String(line ?? ""));
  if (!hit) return null;
  const [lead, indent, bullet, number, sep] = hit;
  const text = String(line).slice(lead.length);
  if (bullet) return { kind: "ul", indent, bullet, lead: lead.length, markAt: indent.length, markEnd: indent.length + 1, text };
  return { kind: "ol", indent, n: Number(number), sep, lead: lead.length, markAt: indent.length, markEnd: indent.length + number.length + 1, text };
}

const blank = (line) => !line.trim();

function trimBlankEdges(lines) {
  let from = 0;
  let to = lines.length;
  while (from < to && blank(lines[from])) from++;
  while (to > from && blank(lines[to - 1])) to--;
  return lines.slice(from, to);
}

export function saidPieces(text) {
  const lines = String(text ?? "").split("\n");
  const items = lines.map(listItem);
  if (!items.some(Boolean)) return [{ kind: "text", text: lines.join("\n") }];
  const pieces = [];
  let plain = [];
  const flush = () => {
    const kept = trimBlankEdges(plain);
    if (kept.length) pieces.push({ kind: "text", text: kept.join("\n") });
    plain = [];
  };
  lines.forEach((line, at) => {
    const item = items[at];
    if (!item) return void plain.push(line);
    flush();
    const entry = item.kind === "ol" ? { n: item.n, text: item.text } : { text: item.text };
    const last = pieces.at(-1);
    if (last?.kind === item.kind) last.items.push(entry);
    else pieces.push({ kind: item.kind, items: [entry] });
  });
  flush();
  return pieces;
}

const SAID_URL = /https?:\/\/[^\s<>"']+/g;
const URL_TAIL = /[.,;:!?)\]…*~]+$/;

export function linkSaid(el) {
  const doc = el.ownerDocument;
  for (const node of [...el.childNodes]) {
    if (node.nodeType === 1) {
      if (node.tagName !== "A") linkSaid(node);
      continue;
    }
    if (node.nodeType !== 3) continue;
    const said = node.nodeValue;
    const pieces = [];
    let last = 0;
    for (const hit of said.matchAll(SAID_URL)) {
      const url = hit[0].replace(URL_TAIL, "");
      if (url.length <= hit[0].indexOf("//") + 2) continue;
      if (hit.index > last) pieces.push(doc.createTextNode(said.slice(last, hit.index)));
      const link = doc.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = url;
      pieces.push(link);
      last = hit.index + url.length;
    }
    if (!pieces.length) continue;
    if (last < said.length) pieces.push(doc.createTextNode(said.slice(last)));
    node.replaceWith(...pieces);
  }
  return el;
}

export function fillSaid(el, text, paintHead = (node) => node) {
  const doc = el.ownerDocument;
  el.textContent = "";
  saidPieces(text).forEach((piece, at) => {
    if (piece.kind === "text") {
      const hold = doc.createElement("div");
      hold.textContent = piece.text;
      if (at === 0) paintHead(hold);
      el.append(...hold.childNodes);
      return;
    }
    const list = doc.createElement(piece.kind);
    list.className = "said-list";
    for (const item of piece.items) {
      const row = doc.createElement("li");
      if (item.n !== undefined) row.value = item.n;
      row.textContent = item.text;
      list.append(row);
    }
    el.append(list);
  });
  return linkSaid(el);
}

export function listMarks(text) {
  const marks = [];
  let at = 0;
  for (const line of String(text ?? "").split("\n")) {
    const item = listItem(line);
    if (item) marks.push({ kind: item.kind, start: at + item.markAt, end: at + item.markEnd });
    at += line.length + 1;
  }
  return marks;
}

export function continueList(text, start, end = start) {
  const said = String(text ?? "");
  if (start !== end) return null;
  const lineStart = said.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = said.indexOf("\n", start);
  const lineEnd = nextBreak < 0 ? said.length : nextBreak;
  const item = listItem(said.slice(lineStart, lineEnd));
  if (!item || start < lineStart + item.lead) return null;
  if (!item.text.trim() && start === lineEnd) return { from: lineStart, to: lineEnd, text: item.indent };
  const mark = item.kind === "ul" ? `${item.bullet} ` : `${item.n + 1}${item.sep} `;
  return { from: start, to: end, text: `\n${item.indent}${mark}` };
}

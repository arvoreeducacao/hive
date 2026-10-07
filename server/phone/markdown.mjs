const phrase = (text) => text;

const escapeHtml = (s) => String(s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const escapeDecoded = (s) => s
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const IMAGE_TARGET = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const SHELF_LINK = /hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)/g;
const SHELF_ALONE = /^hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)$/;
const SHELF_TABS = ["documento", "telas", "plano", "lente"];
const SHELF_TRAIL = /(?:&(?:quot|#39|gt|lt|amp);|[.,;:!?)\]…*~])+$/;

const shelfAnchor = (slug, tail, shown) => {
  const raw = String(tail || "");
  const cut = raw.indexOf("#");
  const at = cut < 0 ? "" : raw.slice(cut + 1).replace(/[^\w-]/g, "");
  const asked = new URLSearchParams((cut < 0 ? raw : raw.slice(0, cut)).replace(/^\?/, "").replaceAll("&amp;", "&"));
  const tab = SHELF_TABS.includes(asked.get("tab")) ? asked.get("tab") : "";
  const version = Number(asked.get("v")) > 0 ? String(Number(asked.get("v"))) : "";
  return `<a href="#" class="md-shelf" data-slug="${slug}" data-tab="${tab}" data-v="${version}" data-at="${at}" title="${phrase("opens the page in a seat of its own")}">${shown}</a>`;
};

const emphasis = (s) => s
  .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
  .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
  .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

function codeSpan(text) {
  const chip = `<code>${text}</code>`;
  const alone = SHELF_ALONE.exec(String(text).trim());
  return alone ? shelfAnchor(alone[1], alone[2], chip) : chip;
}

function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`\n]+)`/g, (m, c) => {
    codes.push(c);
    return `\x00${codes.length - 1}\x00`;
  });
  const anchors = [];
  const keep = (html) => {
    anchors.push(html);
    return `\x01${anchors.length - 1}\x01`;
  };
  out = out
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, target) => {
      if (/^https?:\/\//i.test(target)) return keep(`<a href="${target}" target="_blank" rel="noreferrer">${alt || target}</a>`);
      if (IMAGE_TARGET.test(target)) return keep(`<a href="#" class="md-shot" data-path="${target}" title="${target}">${alt || target.split("/").pop()}</a>`);
      return m;
    })
    .replace(/\[([^\]\n]+)\]\(hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)\)/g, (m, label, slug, tail) =>
      keep(shelfAnchor(slug, tail, emphasis(label))))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) =>
      keep(`<a href="${url}" target="_blank" rel="noreferrer">${emphasis(label)}</a>`))
    .replace(SHELF_LINK, (whole, slug, query) => {
      const clean = whole.replace(SHELF_TRAIL, "");
      const trimmed = clean.slice(`hive://shelf/${slug}`.length);
      return keep(shelfAnchor(slug, trimmed, clean)) + whole.slice(clean.length);
    })
    .replace(/file:\/\/(\/[^\s<>"'\x00\x01)\]]+\.(?:png|jpe?g|gif|webp|bmp|avif|svg))\b/gi, (m, target) => {
      let path = target;
      try { path = escapeDecoded(decodeURIComponent(target)); } catch {}
      return keep(`<a href="#" class="md-shot" data-path="${path}" title="${path}">${path.split("/").pop()}</a>`);
    })
    .replace(/https?:\/\/[^\s\x00\x01]+/g, (url) => {
      const clean = url.replace(/(?:&(?:quot|#39|gt|lt|amp);|[.,;:!?)\]…*~])+$/, "");
      if (!clean.slice(8).length) return url;
      return keep(`<a href="${clean}" target="_blank" rel="noreferrer">${clean}</a>`) + url.slice(clean.length);
    });
  out = emphasis(out)
    .replace(/\x01(\d+)\x01/g, (m, i) => anchors[Number(i)]);
  return out.replace(/\x00(\d+)\x00/g, (m, i) => codeSpan(codes[Number(i)]));
}

const DIFF_LANG = /^(?:diff|patch|udiff)$/i;
const DIFF_FRAME = /^(?:\+\+\+|---|@@|diff |index |new file|deleted file|rename |similarity )/;

const diffClass = (line) => {
  if (DIFF_FRAME.test(line)) return "ctx";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
};

const diffBody = (code) => code
  .map((line) => `<span class="${diffClass(line)}">${line || "&#8203;"}</span>`)
  .join("");

const codeBox = (pre) => `<div class="md-codebox">${pre}`
  + `<button type="button" class="md-copy" title="${phrase("copy just this box")}">${phrase("copy")}</button></div>`;

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function markedBlocks(raw) {
  const lines = escapeHtml(String(raw ?? "").replace(/\r\n/g, "\n")).split("\n");
  const html = [];
  const paragraph = [];
  let opened = 0;

  const flush = () => {
    if (!paragraph.length) return;
    html.push({ at: opened, html: `<p>${paragraph.map(inline).join("<br>")}</p>` });
    paragraph.length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      flush();
      const code = [];
      const from = i;
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      const diff = DIFF_LANG.test(fence[1]);
      html.push({ at: from, hard: true, html: codeBox(`<pre class="md-code${diff ? " md-diff" : ""}" data-lang="${fence[1]}">${diff ? diffBody(code) : code.join("\n")}</pre>`) });
      continue;
    }

    if (isTableRow(line) && isTableRule(lines[i + 1] || "")) {
      flush();
      const from = i;
      const head = cells(line).map((c) => `<th>${inline(c)}</th>`).join("");
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(`<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        i++;
      }
      i--;
      html.push({ at: from, html: `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      const depth = Math.min(4, heading[1].length);
      html.push({ at: i, hard: true, html: `<div class="md-h md-h${depth}">${inline(heading[2])}</div>` });
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flush();
      const from = i;
      const ordered = !!numbered;
      const items = [];
      while (i < lines.length) {
        const it = ordered ? lines[i].match(/^(\s*)(\d+)[.)]\s+(.*)$/) : lines[i].match(/^(\s*)[-*+]\s+(.*)$/);
        if (!it) break;
        const body = ordered ? it[3] : it[2];
        const deep = it[1].length >= 2;
        items.push(`<li${deep ? ' class="deep"' : ""}>${inline(body)}</li>`);
        i++;
      }
      i--;
      html.push({ at: from, html: `<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>` });
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flush();
      html.push({ at: i, hard: true, html: "<hr>" });
      continue;
    }

    const quote = line.match(/^\s*&gt;\s?(.*)$/);
    if (quote) {
      flush();
      const from = i;
      const body = [quote[1]];
      while (i + 1 < lines.length && /^\s*&gt;\s?/.test(lines[i + 1])) body.push(lines[++i].replace(/^\s*&gt;\s?/, ""));
      html.push({ at: from, html: `<blockquote>${body.map(inline).join("<br>")}</blockquote>` });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    if (!paragraph.length) opened = i;
    paragraph.push(line);
  }
  flush();
  return html;
}

export function renderMarkdownBlocks(raw) {
  return markedBlocks(raw).map((one) => one.html);
}

export const renderMarkdown = (raw) => renderMarkdownBlocks(raw).join("");

const BLOCK_LEAD = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,4}\s+|>\s?)?)([\s\S]*)$/;
const LINK_TYPING = /!?\[[^\]\n]*$|!?\[[^\]\n]*\]\([^)\s]*$/;
const OPENS_AFTER = /[\s(]/;
const CLOSES_BEFORE = /[\s).,;:!?]/;

function softInline(body) {
  const opens = [];
  let inCode = false;
  let i = 0;
  while (i < body.length) {
    const one = body[i];
    if (one === "`") {
      if (inCode) opens.pop();
      else opens.push({ mark: "`", at: i });
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) { i++; continue; }
    const pair = body.slice(i, i + 2);
    if (pair === "**" || pair === "~~") {
      if (opens[opens.length - 1]?.mark === pair) opens.pop();
      else opens.push({ mark: pair, at: i });
      i += 2;
      continue;
    }
    if (one === "*" || one === "_") {
      const top = opens[opens.length - 1];
      const after = body[i + 1] ?? " ";
      const before = i === 0 ? " " : body[i - 1];
      if (top?.mark === one && CLOSES_BEFORE.test(after)) opens.pop();
      else if (OPENS_AFTER.test(before)) opens.push({ mark: one, at: i });
      i++;
      continue;
    }
    i++;
  }
  if (!opens.length) return body;
  const bare = opens.findIndex((one) => one.at + one.mark.length >= body.length);
  const kept = bare < 0 ? opens : opens.slice(0, bare);
  const said = bare < 0 ? body : body.slice(0, opens[bare].at);
  return said + kept.map((one) => one.mark).reverse().join("");
}

export function liveMarked(raw) {
  const lines = String(raw ?? "").replace(/\r\n/g, "\n").split("\n");
  const open = lines.filter((line) => /^\s*```/.test(line)).length % 2 === 1;
  if (!open) {
    const last = lines.length - 1;
    const [, lead, body] = BLOCK_LEAD.exec(lines[last]);
    lines[last] = lead + softInline(body.replace(LINK_TYPING, ""));
  }
  return markedBlocks(lines.join("\n"));
}

export function liveMarkdown(raw) {
  return liveMarked(raw).map((one) => one.html);
}

/* the whole stream is re-parsed on every chunk, and a long answer is parsed once per character it
   grows by. only the tail can still change — a block the writing has already walked past is
   finished for good — so the settled ones are kept as they came out and each chunk parses the open
   block alone. `sealed` is what has been kept, `open` is the source of the block still being
   written, and the two together read exactly like liveMarkdown of everything said so far. */
export const liveStart = () => ({ sealed: [], open: "" });

export function liveStep(held, chunk) {
  const open = (held?.open || "") + String(chunk ?? "").replace(/\r\n/g, "\n");
  const marked = liveMarked(open);
  const lines = open.split("\n");
  let seal = 0;
  for (let i = 0; i + 1 < marked.length; i++) {
    if (!marked[i].hard && String(lines[marked[i + 1].at - 1] ?? "x").trim()) break;
    seal = i + 1;
  }
  const sealed = seal ? (held?.sealed || []).concat(marked.slice(0, seal).map((one) => one.html)) : (held?.sealed || []);
  const rest = seal ? lines.slice(marked[seal].at).join("\n") : open;
  return { sealed, open: rest, blocks: sealed.concat(marked.slice(seal).map((one) => one.html)) };
}

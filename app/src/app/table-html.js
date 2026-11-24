const SECTIONS = new Set(["THEAD", "TBODY", "TFOOT"]);
const BLOCKS = new Set(["ARTICLE", "BLOCKQUOTE", "DETAILS", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TR", "UL"]);
const SKIPPED = new Set(["BUTTON", "INPUT", "SCRIPT", "STYLE", "TEMPLATE"]);

const TABLE_STYLE = "border-collapse:collapse";
const CELL_STYLE = "border:1px solid #d0d7de;padding:6px 12px;vertical-align:top";
const HEADER_CELL_STYLE = `${CELL_STYLE};background-color:#f6f8fa;color:#1f2328;font-weight:600`;

const BLOCK_EDGE = "\u0001";
const LINE_BREAK = "\u0002";
const COLLAPSIBLE = /[ \t\n\r\f]+/g;

const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const skipped = (element) => SKIPPED.has(element.tagName) || element.localName === "svg" || element.getAttribute("aria-hidden") === "true";

function collectCellText(node, parts) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      parts.push(child.textContent || "");
      continue;
    }
    if (child.nodeType !== 1) continue;
    if (child.hasAttribute("data-md-copy")) {
      parts.push(child.getAttribute("data-md-copy").trim());
      continue;
    }
    if (skipped(child)) continue;
    if (child.tagName === "BR") {
      parts.push(LINE_BREAK);
      continue;
    }
    const edge = BLOCKS.has(child.tagName) ? BLOCK_EDGE : child.tagName === "TD" || child.tagName === "TH" ? " " : "";
    parts.push(edge);
    collectCellText(child, parts);
    parts.push(edge);
  }
}

function cellContent(cell) {
  const parts = [];
  collectCellText(cell, parts);
  const tokens = parts.join("").replace(COLLAPSIBLE, " ").split(/([\u0001\u0002])/);
  let html = "";
  let lineStart = true;
  let pendingEdge = false;
  for (const token of tokens) {
    if (token === LINE_BREAK) {
      html = `${html.replace(/ +$/, "")}<br>`;
      lineStart = true;
      pendingEdge = false;
    } else if (token === BLOCK_EDGE) {
      pendingEdge = true;
    } else {
      const text = lineStart || pendingEdge ? token.replace(/^ +/, "") : token;
      if (!text) continue;
      if (pendingEdge && !lineStart) html = `${html.replace(/ +$/, "")}<br>`;
      html += escapeHtml(text).replaceAll(" ", "&nbsp;");
      lineStart = false;
      pendingEdge = false;
    }
  }
  return html.replace(/ +$/, "");
}

function physicalAlignment(align, rtl) {
  if (["left", "center", "right", "justify"].includes(align)) return align;
  if (align === "start") return rtl ? "right" : "left";
  if (align === "end") return rtl ? "left" : "right";
  return "";
}

const spanOf = (value) => {
  const span = Number.parseInt(value ?? "", 10);
  return Number.isNaN(span) || span < 0 ? 1 : span;
};

function spanAttributes(cell) {
  const columns = spanOf(cell.getAttribute("colspan"));
  const rows = spanOf(cell.getAttribute("rowspan"));
  return `${columns > 1 ? ` colspan="${columns}"` : ""}${rows !== 1 ? ` rowspan="${rows}"` : ""}`;
}

function cellMarkup(cell, rtl) {
  const tag = cell.tagName === "TH" ? "th" : "td";
  const align = cell.getAttribute("data-align") || cell.style?.textAlign || cell.getAttribute("align") || "";
  const textAlign = physicalAlignment(align || (tag === "th" ? "start" : ""), rtl);
  const style = `${tag === "th" ? HEADER_CELL_STYLE : CELL_STYLE}${textAlign ? `;text-align:${textAlign}` : ""}`;
  return `<${tag} style="${style}"${spanAttributes(cell)}>${cellContent(cell)}</${tag}>`;
}

function sectionMarkup(tag, rows, rtl) {
  let anyCell = false;
  const lines = rows.map((row) => {
    const cells = [...row.children].filter((cell) => cell.tagName === "TH" || cell.tagName === "TD");
    anyCell ||= cells.length > 0;
    return `    <tr>${cells.map((cell) => cellMarkup(cell, rtl)).join("")}</tr>`;
  });
  return anyCell ? [`  <${tag}>`, ...lines, `  </${tag}>`] : [];
}

const isRtl = (table) => {
  const dir = table.getAttribute("dir");
  if (dir) return dir === "rtl";
  return table.ownerDocument?.defaultView?.getComputedStyle?.(table)?.direction === "rtl";
};

export function tableAsHtml(table) {
  const rtl = isRtl(table);
  const lines = [];
  let loose = [];
  const flushLoose = () => {
    lines.push(...sectionMarkup("tbody", loose, rtl));
    loose = [];
  };
  for (const child of table.children) {
    if (child.tagName === "TR") {
      loose.push(child);
      continue;
    }
    if (!SECTIONS.has(child.tagName)) continue;
    flushLoose();
    lines.push(...sectionMarkup(child.tagName.toLowerCase(), [...child.children].filter((row) => row.tagName === "TR"), rtl));
  }
  flushLoose();
  return lines.length ? [`<table dir="${rtl ? "rtl" : "ltr"}" style="${TABLE_STYLE}">`, ...lines, "</table>"].join("\n") : "";
}

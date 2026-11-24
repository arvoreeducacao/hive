const OPENING_FENCE = /^(`{3,}|~{3,})([^\n]*)$/;

const CLOSING_FENCE = /^(`{3,}|~{3,})[ \t]*\r?$/;

const TRAILING_BLANK_LINES = /\n[ \t]*\n[ \t]*$/;

const CODE_INDENT = "  ";

const lineStartOf = (value, at) => value.lastIndexOf("\n", at - 1) + 1;

function lineEndOf(value, at) {
  const next = value.indexOf("\n", at);
  return next < 0 ? value.length : next;
}

function openingFence(line) {
  const hit = OPENING_FENCE.exec(line);
  if (!hit) return "";
  if (hit[1][0] === "`" && hit[2].includes("`")) return "";
  return hit[1];
}

function closesFence(line, fence) {
  const hit = CLOSING_FENCE.exec(line);
  return !!hit && hit[1][0] === fence[0] && hit[1].length >= fence.length;
}

function codeBlockAt(value, at) {
  const said = String(value ?? "");
  const caretLine = lineStartOf(said, at);
  let open = null;
  for (let start = 0; start < caretLine; start = lineEndOf(said, start) + 1) {
    const line = said.slice(start, lineEndOf(said, start));
    if (!open) {
      const fence = openingFence(line);
      if (fence) open = { fence, from: start + line.length + 1 };
    } else if (closesFence(line, open.fence)) {
      open = null;
    }
  }
  if (!open) return null;
  for (let start = lineEndOf(said, caretLine) + 1; start <= said.length; start = lineEndOf(said, start) + 1) {
    const end = lineEndOf(said, start);
    if (closesFence(said.slice(start, end), open.fence)) return { ...open, to: start - 1, close: { start, end } };
    if (end === said.length) break;
  }
  return { ...open, to: said.length, close: null };
}

const newlineAt = (start, end, text) => ({ start, end, text, selection: [start + text.length, start + text.length] });

function leaveOnTrailingBlankLines(said, block) {
  const trailing = TRAILING_BLANK_LINES.exec(said.slice(block.from, block.to));
  if (!trailing) return null;
  const cut = block.to - trailing[0].length;
  const closing = block.close ? said.slice(block.close.start, block.close.end) : block.fence;
  const text = `\n${closing}\n`;
  return newlineAt(cut, block.close ? block.close.end : block.to, text);
}

function fenceEnter(value, start, end = start) {
  const said = String(value ?? "");
  const lineStart = lineStartOf(said, start);
  const lineEnd = lineEndOf(said, start);
  const block = codeBlockAt(said, start);
  if (!block) {
    if (start !== end || start !== lineEnd || !openingFence(said.slice(lineStart, lineEnd))) return null;
    return newlineAt(start, end, "\n");
  }
  if (end > block.to) return null;
  if (start === end && start === lineEnd && closesFence(said.slice(lineStart, lineEnd), block.fence)) return newlineAt(start, end, "\n");
  if (start === end && start === block.to) {
    const leave = leaveOnTrailingBlankLines(said, block);
    if (leave) return leave;
  }
  const indent = /^[ \t]*/.exec(said.slice(lineStart, start))[0];
  return newlineAt(start, end, `\n${indent}`);
}

function outdentLine(line) {
  if (line.startsWith(CODE_INDENT)) return line.slice(CODE_INDENT.length);
  if (line.startsWith("\t") || line.startsWith(" ")) return line.slice(1);
  return line;
}

function fenceTab(value, start, end = start, outdent = false) {
  const said = String(value ?? "");
  const block = codeBlockAt(said, start);
  if (!block || end > block.to) return null;
  if (start === end && !outdent) return newlineAt(start, end, CODE_INDENT);
  const from = lineStartOf(said, start);
  const to = Math.min(lineEndOf(said, Math.max(start, end - 1)), block.to);
  const before = said.slice(from, to).split("\n");
  const after = before.map((line) => (outdent ? outdentLine(line) : line ? `${CODE_INDENT}${line}` : line));
  const text = after.join("\n");
  if (text === before.join("\n")) return { consumed: true };
  const firstDelta = after[0].length - before[0].length;
  const totalDelta = text.length - (to - from);
  const selectionStart = Math.max(from, start + firstDelta);
  return { start: from, end: to, text, selection: [selectionStart, Math.max(selectionStart, end + totalDelta)] };
}

export { CODE_INDENT, closesFence, codeBlockAt, fenceEnter, fenceTab, openingFence };

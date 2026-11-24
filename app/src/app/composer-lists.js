const ORDERED = /^(\d+)([.)])((?:[ \t]+)|\s*$)/;

const TASK = /^-(\s)\[[ xX]\]((?:[ \t]+)|\s*$)/;

const BULLET = /^([-*+•])((?:[ \t]+)|\s*$)/;

function columnsOf(text, fromColumn = 0) {
  let column = fromColumn;
  for (const char of text) {
    if (char === " ") column += 1;
    else if (char === "\t") column += 4 - (column % 4);
    else break;
  }
  return column - fromColumn;
}

function contentColumn(indent, markerWidth, padding) {
  const markerEnd = columnsOf(indent) + markerWidth;
  const space = columnsOf(padding, markerEnd);
  return markerEnd + (space >= 1 && space <= 4 ? space : 1);
}

function parseListMarker(line) {
  const indent = /^[ \t]*/.exec(line)[0];
  const rest = line.slice(indent.length);
  const ordered = ORDERED.exec(rest);
  if (ordered) {
    const space = ordered[3] ?? "";
    return {
      marker: { kind: "ordered", indent, number: ordered[1], delimiter: ordered[2], space },
      markerEnd: indent.length + ordered[0].length,
      contentColumn: contentColumn(indent, ordered[1].length + 1, space)
    };
  }
  const task = TASK.exec(rest);
  if (task) {
    return {
      marker: { kind: "task", indent, space: task[2] ?? "" },
      markerEnd: indent.length + task[0].length,
      contentColumn: contentColumn(indent, 1, task[1])
    };
  }
  const bullet = BULLET.exec(rest);
  if (bullet) {
    const space = bullet[2] ?? "";
    return {
      marker: { kind: "bullet", indent, bullet: bullet[1], space },
      markerEnd: indent.length + bullet[0].length,
      contentColumn: contentColumn(indent, 1, space)
    };
  }
  return null;
}

function nextNumber(number) {
  const value = Number.parseInt(number, 10);
  return Number.isSafeInteger(value) ? String(value + 1).padStart(number.length, "0") : number;
}

function nextMarkerText(marker) {
  if (marker.kind === "ordered") return `${marker.indent}${nextNumber(marker.number)}${marker.delimiter} `;
  if (marker.kind === "task") return `${marker.indent}- [ ] `;
  return `${marker.indent}${marker.bullet} `;
}

function lineAround(value, at) {
  const start = value.lastIndexOf("\n", at - 1) + 1;
  const next = value.indexOf("\n", at);
  const end = next < 0 ? value.length : next;
  return { start, end, text: value.slice(start, end) };
}

function renumberFollowing(value, afterLineEnd, marker) {
  const baseWidth = columnsOf(marker.indent);
  const parts = [];
  let expected = Number.parseInt(marker.number, 10) + 2;
  let position = afterLineEnd;
  let copiedUntil = afterLineEnd;
  while (position < value.length && Number.isSafeInteger(expected)) {
    const lineStart = position + 1;
    const next = value.indexOf("\n", lineStart);
    const lineEnd = next < 0 ? value.length : next;
    position = lineEnd;
    const line = value.slice(lineStart, lineEnd);
    const width = columnsOf(line);
    if (!line.trim() || width < baseWidth) break;
    if (width > baseWidth) continue;
    const parsed = parseListMarker(line);
    if (parsed?.marker.kind !== "ordered" || parsed.marker.delimiter !== marker.delimiter) break;
    const current = parsed.marker;
    const numberStart = lineStart + current.indent.length;
    const replacement = current.number.startsWith("0") ? String(expected).padStart(current.number.length, "0") : String(expected);
    if (replacement !== current.number) {
      parts.push(value.slice(copiedUntil, numberStart), replacement);
      copiedUntil = numberStart + current.number.length;
    }
    expected += 1;
  }
  return parts.length ? { end: copiedUntil, text: parts.join("") } : null;
}

function* markersAbove(value, lineStart) {
  let start = lineStart;
  while (start > 0) {
    const end = start - 1;
    start = value.lastIndexOf("\n", end - 1) + 1;
    const parsed = parseListMarker(value.slice(start, end));
    if (!parsed) return;
    yield parsed;
  }
}

function parentMarker(value, lineStart, marker) {
  const width = columnsOf(marker.indent);
  for (const above of markersAbove(value, lineStart)) {
    if (columnsOf(above.marker.indent) < width) return above.marker;
  }
  return null;
}

function nestedNumber(marker, previous) {
  if (marker.kind !== "ordered") return { replaced: 0, text: "" };
  const continues = previous?.kind === "ordered" && previous.delimiter === marker.delimiter;
  return { replaced: marker.number.length, text: continues ? nextNumber(previous.number) : "1" };
}

const asEdit = (start, end, text, caret) => ({ start, end, text, selection: [caret, caret] });

function listContinuation(value, caret) {
  const said = String(value ?? "");
  if (!Number.isInteger(caret) || caret < 0 || caret > said.length) return null;
  const line = lineAround(said, caret);
  const parsed = parseListMarker(line.text);
  if (!parsed || parsed.marker.space === "") return null;
  const markerEnd = line.start + parsed.markerEnd;
  if (caret < markerEnd) return null;
  if (!said.slice(markerEnd, line.end).trim()) {
    const parent = parentMarker(said, line.start, parsed.marker);
    const replacement = parent ? nextMarkerText(parent) : "";
    const caretAfter = line.start + replacement.length;
    const end = Math.max(caret, markerEnd);
    const renumbered = parent?.kind === "ordered" ? renumberFollowing(said, line.end, parent) : null;
    if (renumbered) return asEdit(line.start, renumbered.end, replacement + said.slice(end, line.end) + renumbered.text, caretAfter);
    return asEdit(line.start, end, replacement, caretAfter);
  }
  const insertion = `\n${nextMarkerText(parsed.marker)}`;
  const caretAfter = caret + insertion.length;
  const renumbered = parsed.marker.kind === "ordered" ? renumberFollowing(said, line.end, parsed.marker) : null;
  if (renumbered) return asEdit(caret, renumbered.end, insertion + said.slice(caret, line.end) + renumbered.text, caretAfter);
  return asEdit(caret, caret, insertion, caretAfter);
}

function listIndent(value, start, end = start) {
  const said = String(value ?? "");
  if (!Number.isInteger(start) || start !== end || start < 0 || start > said.length) return null;
  const line = lineAround(said, start);
  const parsed = parseListMarker(line.text);
  if (!parsed) return null;
  const { marker } = parsed;
  const width = columnsOf(marker.indent);
  let previousChild;
  for (const above of markersAbove(said, line.start)) {
    const aboveWidth = columnsOf(above.marker.indent);
    if (aboveWidth < width) break;
    if (aboveWidth > width) {
      if (!previousChild || aboveWidth < columnsOf(previousChild.indent)) previousChild = above.marker;
      continue;
    }
    const indent = previousChild?.indent ?? above.marker.indent + " ".repeat(above.contentColumn - aboveWidth);
    const number = nestedNumber(marker, previousChild);
    const replacedEnd = line.start + marker.indent.length + number.replaced;
    const replacement = indent + number.text;
    return asEdit(line.start, replacedEnd, replacement, start < replacedEnd ? line.start + indent.length : start - replacedEnd + line.start + replacement.length);
  }
  return asEdit(line.start, line.start, "  ", start + 2);
}

function listOutdent(value, start, end = start) {
  const said = String(value ?? "");
  if (!Number.isInteger(start) || start !== end || start < 0 || start > said.length) return null;
  const line = lineAround(said, start);
  const parsed = parseListMarker(line.text);
  if (!parsed?.marker.indent) return null;
  const { marker } = parsed;
  const parent = parentMarker(said, line.start, marker);
  const indent = parent?.indent ?? marker.indent.replace(/^(?:\t| {1,2})/, "");
  const continues = parent?.kind === "ordered" && marker.kind === "ordered" && parent.delimiter === marker.delimiter;
  const number = continues ? nestedNumber(marker, parent) : { replaced: 0, text: "" };
  const replacedEnd = line.start + marker.indent.length + number.replaced;
  const replacement = indent + number.text;
  const caretAfter = start < replacedEnd ? line.start + indent.length : start - replacedEnd + line.start + replacement.length;
  const renumbered = continues ? renumberFollowing(said, line.end, parent) : null;
  if (renumbered) return asEdit(line.start, renumbered.end, replacement + said.slice(replacedEnd, line.end) + renumbered.text, caretAfter);
  return asEdit(line.start, replacedEnd, replacement, caretAfter);
}

const onListLine = (value, at) => !!parseListMarker(lineAround(String(value ?? ""), at).text);

export { listContinuation, listIndent, listOutdent, onListLine, parseListMarker };

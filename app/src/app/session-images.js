import { hidePeek, openShot, showPeek } from "./picture-preview.js";

const IMAGE_IN_LINE = /[~.\w/@+-]*[\w@+-]\.(?:png|jpe?g|gif|webp|bmp|avif|svg)\b/gi;

const WRAP_CEILING = 64;

function wrappedLineAt(term, y) {
  const buf = term.buffer.active;
  let top = y - 1;
  if (!buf.getLine(top)) return null;
  while (top > 0 && buf.getLine(top).isWrapped) top--;
  const cell = buf.getNullCell();
  const at = [];
  let text = "";
  for (let row = top; row < top + WRAP_CEILING; row++) {
    const line = buf.getLine(row);
    if (!line || (row > top && !line.isWrapped)) break;
    for (let col = 0; col < line.length; col++) {
      line.getCell(col, cell);
      if (!cell.getWidth()) continue;
      const chars = cell.getChars() || " ";
      for (let i = 0; i < chars.length; i++) at.push({ row, col });
      text += chars;
    }
  }
  return { text, at };
}

function imagesInLine(text) {
  const found = [];
  IMAGE_IN_LINE.lastIndex = 0;
  for (let m; (m = IMAGE_IN_LINE.exec(text)); ) {
    if (text[m.index - 1] === ":") continue;
    found.push({ path: m[0], from: m.index, to: m.index + m[0].length - 1 });
  }
  return found;
}

const IMAGE_PATH_KEYS = ["file_path", "path", "notebook_path"];

const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)$/i;

const SHOTS_IN_A_CARD = 2;

const SHOTS_FROM_A_RESULT = 6;

const SHOT_SAID_CEILING = 400;

function shotOfInput(input) {
  const inp = input && typeof input === "object" ? input : {};
  for (const key of IMAGE_PATH_KEYS) {
    const asked = typeof inp[key] === "string" ? inp[key].trim() : "";
    if (asked && IMAGE_FILE.test(asked)) return asked;
  }
  return "";
}

function shotsOfResult(content) {
  if (!Array.isArray(content)) return [];
  const found = [];
  for (const piece of content) {
    if (piece?.type === "image" && typeof piece.path === "string" && piece.path) found.push(piece.path);
  }
  return [...new Set(found)].slice(0, SHOTS_FROM_A_RESULT);
}

function resultText(content) {
  if (typeof content === "string") return content;
  return (content || [])
    .map((piece) => (piece.type === "text" ? piece.text : piece.type === "image" && piece.path ? "" : `[${piece.type}]`))
    .filter((piece) => piece !== "")
    .join("\n");
}

const FILE_URL = /file:\/\/(\/[^\s<>"'`)\]]+\.(?:png|jpe?g|gif|webp|bmp|avif|svg))\b/gi;

const SHOTS_IN_A_SAID = 6;

function shotsOfSaid(text) {
  const said = String(text || "");
  const found = [];
  FILE_URL.lastIndex = 0;
  for (let m; (m = FILE_URL.exec(said)); ) {
    try { found.push(decodeURIComponent(m[1])); } catch { found.push(m[1]); }
  }
  const plain = said.replace(FILE_URL, " ");
  for (const hit of imagesInLine(plain)) found.push(hit.path);
  return [...new Set(found)].slice(0, SHOTS_IN_A_SAID);
}

function shotsOfTool(fromInput, text, content) {
  const said = String(text || "");
  const found = fromInput ? [fromInput] : [];
  const handed = fromInput ? [] : shotsOfResult(content);
  if (!handed.length && said.length <= SHOT_SAID_CEILING) for (const hit of imagesInLine(said)) found.push(hit.path);
  const all = [...new Set([...found, ...handed])];
  return all.slice(0, handed.length ? SHOTS_FROM_A_RESULT : SHOTS_IN_A_CARD);
}

const IMAGE_NOTE_LINE = /^\s*\[image(?::\s*source:\s*([^\]]+?))?\s*\]\s*$/i;

function withoutImageNotes(text, shown, content) {
  if (!shown.length) return text;
  const handed = shotsOfResult(content).length > 0;
  const room = { bare: shown.length, named: shown.length };
  const lines = String(text || "").split("\n");
  const kept = lines.filter((line) => {
    const note = IMAGE_NOTE_LINE.exec(line);
    if (!note) return true;
    const kind = note[1] ? "named" : "bare";
    if (!room[kind] || (note[1] && !handed && !shown.includes(note[1]))) return true;
    room[kind]--;
    return false;
  });
  return kept.length === lines.length ? text : kept.join("\n").trim();
}

function imageLinks(term, session) {
  return {
    provideLinks(y, done) {
      const line = wrappedLineAt(term, y);
      if (!line) return done(undefined);
      const links = [];
      for (const hit of imagesInLine(line.text)) {
        const from = line.at[hit.from];
        const to = line.at[hit.to];
        if (!from || !to) continue;
        links.push({
          text: hit.path,
          range: { start: { x: from.col + 1, y: from.row + 1 }, end: { x: to.col + 1, y: to.row + 1 } },
          activate: (ev) => { ev.preventDefault(); hidePeek(); openShot(hit.path, session.where, session.name); },
          hover: (ev) => showPeek(ev, hit.path, session.where, session.name),
          leave: hidePeek
        });
      }
      done(links.length ? links : undefined);
    }
  };
}

export { IMAGE_FILE, IMAGE_IN_LINE, IMAGE_PATH_KEYS, SHOTS_FROM_A_RESULT, SHOTS_IN_A_CARD, SHOTS_IN_A_SAID, SHOT_SAID_CEILING, WRAP_CEILING, imageLinks, imagesInLine, resultText, shotOfInput, shotsOfResult, shotsOfSaid, shotsOfTool, withoutImageNotes, wrappedLineAt };

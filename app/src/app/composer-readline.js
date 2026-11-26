import { IS_MAC } from "./core.js";

const CTRL_CHORDS = { KeyE: "lineEnd" };
const ALT_CHORDS = { KeyB: "wordBack", KeyF: "wordForward" };

const isWordPoint = (point) => point !== undefined && /[\p{L}\p{N}]/u.test(String.fromCodePoint(point));
const isLowHalf = (unit) => unit >= 0xdc00 && unit <= 0xdfff;
const isHighHalf = (unit) => unit >= 0xd800 && unit <= 0xdbff;

function pointBefore(value, at) {
  const size = at >= 2 && isLowHalf(value.charCodeAt(at - 1)) && isHighHalf(value.charCodeAt(at - 2)) ? 2 : 1;
  return { point: value.codePointAt(at - size), size };
}

function pointAt(value, at) {
  const point = value.codePointAt(at);
  return { point, size: point > 0xffff ? 2 : 1 };
}

function lineEndOf(value, at) {
  const next = value.indexOf("\n", at);
  return next < 0 ? value.length : next;
}

function wordBackFrom(value, at) {
  let i = at;
  for (const inWord of [false, true]) {
    while (i > 0) {
      const { point, size } = pointBefore(value, i);
      if (isWordPoint(point) !== inWord) break;
      i -= size;
    }
  }
  return i;
}

function wordForwardFrom(value, at) {
  let i = at;
  for (const inWord of [false, true]) {
    while (i < value.length) {
      const { point, size } = pointAt(value, i);
      if (isWordPoint(point) !== inWord) break;
      i += size;
    }
  }
  return i;
}

function readlineChord(kev, mac = IS_MAC) {
  if (kev.isComposing || kev.keyCode === 229 || kev.metaKey || kev.shiftKey) return null;
  if (kev.ctrlKey && !kev.altKey) return CTRL_CHORDS[kev.code] || null;
  if (kev.altKey && !kev.ctrlKey && !mac) return ALT_CHORDS[kev.code] || null;
  return null;
}

const caretAt = (spot) => ({ start: spot, end: spot, text: "", selection: [spot, spot] });

function readlineEdit(kev, box, { mac = IS_MAC } = {}) {
  const chord = readlineChord(kev, mac);
  if (!chord) return null;
  const value = box.value;
  const start = box.selectionStart ?? value.length;
  const end = box.selectionEnd ?? start;
  if (chord === "lineEnd") return caretAt(lineEndOf(value, end));
  if (chord === "wordBack") return caretAt(wordBackFrom(value, start));
  return caretAt(wordForwardFrom(value, end));
}

export { readlineChord, readlineEdit };

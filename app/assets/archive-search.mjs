const PUNCTUATION = /[^\p{Letter}\p{Number}]+/gu;
const NOT_A_LETTER = /[^\p{Letter}\p{Number}]/u;
const INSIDE_A_WORD_FROM = 4;

const EXACT_WORD = 3;
const START_OF_WORD = 2;
const INSIDE_A_WORD = 1;

const FIELD_WEIGHTS = { seat: 12, title: 12, was: 9, prompt: 4, cwd: 2 };
const DEEP_ONLY_SCORE = 1;

export function foldText(text) {
  return String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function wordsOf(asked) {
  return foldText(asked).split(PUNCTUATION).filter(Boolean);
}

function fieldOf(text) {
  const words = wordsOf(text);
  return { text: String(text || ""), words, line: words.join(" ") };
}

function howWordSits(field, word) {
  let best = 0;
  for (const one of field.words) {
    if (one === word) return EXACT_WORD;
    if (one.startsWith(word)) best = START_OF_WORD;
    else if (!best && word.length >= INSIDE_A_WORD_FROM && one.includes(word)) best = INSIDE_A_WORD;
  }
  return best;
}

export function holdsEvery(text, words) {
  const field = fieldOf(text);
  return words.every((word) => howWordSits(field, word) > 0);
}

const fieldsHeld = new WeakMap();

function fieldsOfSession(session) {
  const held = fieldsHeld.get(session);
  if (held) return held;
  const was = Array.isArray(session.was) ? session.was : [];
  const fields = {
    seat: [fieldOf(session.seat)],
    title: [fieldOf(session.title)],
    was: was.map((one) => fieldOf(one)),
    prompt: [fieldOf(session.prompt)],
    cwd: [fieldOf(session.cwd)]
  };
  fieldsHeld.set(session, fields);
  return fields;
}

function phraseBonus(field, words, whole, weight) {
  if (!field.line) return 0;
  if (field.line === whole) return weight * words.length * 2;
  if (field.line.startsWith(`${whole} `) || field.line.includes(` ${whole} `) || field.line.endsWith(` ${whole}`)) return weight * words.length;
  if (field.line.includes(whole)) return (weight * words.length) / 2;
  return 0;
}

function scoreSession(session, words, whole) {
  const fields = fieldsOfSession(session);
  let score = 0;
  for (const word of words) {
    let best = 0;
    for (const [kind, list] of Object.entries(fields)) {
      for (const field of list) best = Math.max(best, howWordSits(field, word) * FIELD_WEIGHTS[kind]);
    }
    if (!best) return { score: 0 };
    score += best;
  }
  let bonus = 0;
  for (const [kind, list] of Object.entries(fields)) {
    for (const field of list) bonus = Math.max(bonus, phraseBonus(field, words, whole, FIELD_WEIGHTS[kind]));
  }
  return { score: score + bonus, formerly: formerTitleThatMatched(fields, words, whole) };
}

function formerTitleThatMatched(fields, words, whole) {
  const holds = (field) => words.every((word) => howWordSits(field, word) > 0);
  if (holds(fields.title[0]) || holds(fields.seat[0])) return "";
  const matching = fields.was.filter(holds);
  if (!matching.length) return "";
  const weight = FIELD_WEIGHTS.was;
  return matching.reduce((best, field) => (phraseBonus(field, words, whole, weight) > phraseBonus(best, words, whole, weight) ? field : best)).text;
}

export function rankSessions(sessions, asked, { deep = new Map() } = {}) {
  const words = wordsOf(asked);
  if (!words.length) return sessions.map((session, order) => ({ session, score: 0, order }));
  const whole = words.join(" ");
  const found = [];
  for (let order = 0; order < sessions.length; order += 1) {
    const session = sessions[order];
    const hit = deep.get(`${session.where}/${session.id}`) || "";
    const { score, formerly } = scoreSession(session, words, whole);
    if (!score && !hit) continue;
    found.push({ session, score: score || DEEP_ONLY_SCORE, order, ...(hit ? { hit } : {}), ...(formerly ? { formerly } : {}) });
  }
  found.sort((a, b) => b.score - a.score || a.order - b.order);
  return found;
}

function foldWithPlaces(text) {
  let plain = "";
  const places = [];
  let at = 0;
  for (const char of String(text || "").normalize("NFC")) {
    const folded = foldText(char);
    for (let i = 0; i < folded.length; i += 1) places.push([at, at + char.length]);
    plain += folded;
    at += char.length;
  }
  return { plain, places, shown: String(text || "").normalize("NFC") };
}

export function markUp(text, asked) {
  const words = wordsOf(asked);
  if (!words.length) return [{ text }];
  const { plain, places, shown } = foldWithPlaces(text);
  const spans = [];
  for (const word of words) {
    let at = plain.indexOf(word);
    while (at >= 0) {
      const startsAWord = at === 0 || NOT_A_LETTER.test(plain[at - 1]);
      if (startsAWord || word.length >= INSIDE_A_WORD_FROM) spans.push([places[at][0], places[at + word.length - 1][1]]);
      at = plain.indexOf(word, at + word.length);
    }
  }
  if (!spans.length) return [{ text }];
  spans.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cut = 0;
  for (const [from, to] of spans) {
    if (from < cut) continue;
    if (from > cut) parts.push({ text: shown.slice(cut, from) });
    parts.push({ text: shown.slice(from, to), lit: true });
    cut = to;
  }
  if (cut < shown.length) parts.push({ text: shown.slice(cut) });
  return parts;
}

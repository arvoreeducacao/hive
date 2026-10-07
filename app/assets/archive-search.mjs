const PUNCTUATION = /[^\p{Letter}\p{Number}]+/gu;
const NOT_A_LETTER = /[^\p{Letter}\p{Number}]/u;

export function foldText(text) {
  return String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function wordsOf(asked) {
  return foldText(asked).split(PUNCTUATION).filter(Boolean);
}

function scoreIn(hay, words, whole, weight) {
  if (!hay) return 0;
  let score = 0;
  for (const word of words) {
    const at = hay.indexOf(word);
    if (at < 0) return 0;
    score += weight + (at === 0 ? weight : 0) + (at > 0 && NOT_A_LETTER.test(hay[at - 1]) ? weight / 2 : 0);
  }
  return score + (whole && hay.includes(whole) ? weight * words.length : 0);
}

export function rankSessions(sessions, asked, { deep = new Map() } = {}) {
  const words = wordsOf(asked);
  if (!words.length) return sessions.map((session, order) => ({ session, score: 0, order }));
  const whole = words.join(" ");
  const found = [];
  for (let order = 0; order < sessions.length; order += 1) {
    const session = sessions[order];
    const title = foldText(session.title);
    const prompt = foldText(session.prompt);
    const where = foldText(session.cwd);
    const hit = deep.get(`${session.where}/${session.id}`) || "";
    let score = scoreIn(title, words, whole, 12) || scoreIn(`${title} ${prompt}`, words, whole, 6) || scoreIn(`${title} ${prompt} ${where}`, words, whole, 3);
    if (!score && hit) score = 2;
    if (!score) continue;
    found.push({ session, score, order, ...(hit ? { hit } : {}) });
  }
  found.sort((a, b) => b.score - a.score || a.order - b.order);
  return found;
}

export function markUp(text, asked) {
  const words = wordsOf(asked);
  if (!words.length) return [{ text }];
  const plain = foldText(text);
  const spans = [];
  for (const word of words) {
    let at = plain.indexOf(word);
    while (at >= 0) {
      spans.push([at, at + word.length]);
      at = plain.indexOf(word, at + word.length);
    }
  }
  if (!spans.length) return [{ text }];
  spans.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cut = 0;
  for (const [from, to] of spans) {
    if (from < cut) continue;
    if (from > cut) parts.push({ text: text.slice(cut, from) });
    parts.push({ text: text.slice(from, to), lit: true });
    cut = to;
  }
  if (cut < text.length) parts.push({ text: text.slice(cut) });
  return parts;
}

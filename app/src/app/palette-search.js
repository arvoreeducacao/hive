const MARKS = /\p{M}/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const WRAPPING_QUOTES = /^\s*["'`“”‘’]+|["'`“”‘’]+\s*$/g;
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_MS = 14 * DAY_MS;
const OPEN_DEDUPE_MS = 10 * 60 * 1000;
const PICK_WINDOW_MS = 21 * DAY_MS;
const PICK_LIMIT = 3;
const PICK_MAX_LENGTH = 32;
const USE_BOOST_LIMIT = 2.5;
const OPENS_KEY = "hive.paletteOpens";
const OPENS_KEPT = 300;
const OFTEN_OPENED = 3;

const FILLER_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "um", "uma"]);

const WHOLE_WORD = 1;
const WORD_START = 0.8;
const MID_WORD = 0.3;

function foldChar(char) {
  const folded = char.normalize("NFD").replace(MARKS, "").toLowerCase();
  if (folded.length === char.length) return folded;
  const lowered = char.toLowerCase();
  return lowered.length === char.length ? lowered : char;
}

function foldText(text) {
  let out = "";
  for (const char of String(text ?? "")) out += foldChar(char);
  return out;
}

function searchWords(query) {
  return [...new Set(foldText(String(query ?? "").replace(WRAPPING_QUOTES, "")).split(/\s+/).filter(Boolean))];
}

const startsWord = (text, at) => at === 0 || !WORD_CHAR.test(text[at - 1]);

const endsWord = (text, end) => end >= text.length || !WORD_CHAR.test(text[end]);

function wordHit(folded, word, midWord) {
  let best = null;
  for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + 1)) {
    const start = startsWord(folded, at);
    const quality = start ? (endsWord(folded, at + word.length) ? WHOLE_WORD : WORD_START) : midWord ? MID_WORD : 0;
    if (quality > (best?.quality || 0)) best = { quality, at, end: at + word.length };
    if (quality === WHOLE_WORD) break;
  }
  return best;
}

function matchFields(words, fields) {
  if (!words.length) return { quality: 1, ranges: [] };
  const prepared = fields.filter((one) => one && one.value).map((one) => ({ ...one, folded: foldText(one.value) }));
  const fillerOptional = words.some((word) => !FILLER_WORDS.has(word));
  let total = 0;
  let counted = 0;
  const ranges = [];
  for (const word of words) {
    let best = 0;
    let range = null;
    for (const field of prepared) {
      const hit = wordHit(field.folded, word, !!field.midWord);
      if (!hit) continue;
      const quality = hit.quality * (field.weight ?? 1);
      if (quality > best) {
        best = quality;
        range = field.primary ? [hit.at, hit.end] : null;
      }
    }
    if (!best) {
      if (fillerOptional && FILLER_WORDS.has(word)) continue;
      return null;
    }
    total += best;
    counted += 1;
    if (range) ranges.push(range);
  }
  return counted ? { quality: total / counted, ranges } : null;
}

function rowFields(row) {
  return [
    { value: row.name, weight: 1, midWord: true, primary: true },
    { value: row.search, weight: 0.7 },
    { value: row.ctx, weight: 0.45, midWord: true }
  ];
}

function rankRows(rows, words) {
  if (!words.length) return rows;
  return rows
    .map((row, at) => ({ row, at, match: matchFields(words, rowFields(row)) }))
    .filter((one) => one.match)
    .sort((a, b) => b.match.quality - a.match.quality || a.at - b.at)
    .map((one) => one.row);
}

const decay = (ageMs) => 2 ** (-Math.max(0, ageMs) / HALF_LIFE_MS);

function pickedQuery(query) {
  const cut = foldText(String(query ?? "").replace(WRAPPING_QUOTES, "")).trim().slice(0, PICK_MAX_LENGTH);
  return (/[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut).trim();
}

function recordOpen(previous, at, query) {
  const pick = pickedQuery(query);
  const earlier = (previous?.picks || []).filter((one) => at - one.at <= PICK_WINDOW_MS);
  const picks = pick ? [{ query: pick, at }, ...earlier.filter((one) => one.query !== pick)].slice(0, PICK_LIMIT) : earlier;
  if (previous && at - previous.openedAt < OPEN_DEDUPE_MS) return { ...previous, picks };
  const score = previous ? previous.score * decay(at - previous.openedAt) + 1 : 1;
  return { openedAt: at, score, picks };
}

const openScore = (opens, now) => (opens ? opens.score * decay(now - opens.openedAt) : 0);

function usageBoost(subject, now) {
  const recency = subject.activityAt ? decay(now - subject.activityAt) : 0;
  return Math.min(USE_BOOST_LIMIT, 1 + recency + 0.5 * Math.log2(1 + openScore(subject.opens, now)));
}

const recentUse = (subject) => Math.max(subject.activityAt || 0, subject.opens?.openedAt || 0);

const openedOften = (subject, now) => openScore(subject.opens, now) >= OFTEN_OPENED;

function pickedFor(subject, query, now) {
  const want = pickedQuery(query);
  if (!want) return null;
  let found = null;
  for (const pick of subject.opens?.picks || []) {
    if (now - pick.at > PICK_WINDOW_MS) continue;
    if (pick.query === want || (want.length >= 3 && pick.query.startsWith(want))) {
      if (!found || pick.at > found.at) found = pick;
    }
  }
  return found;
}

function threadFields(subject) {
  const fields = [{ value: subject.title, weight: 1, midWord: true, primary: true }];
  for (const pr of subject.prs || []) {
    if (pr.number) fields.push({ value: `#${pr.number}`, weight: 1 });
    if (pr.title) fields.push({ value: pr.title, weight: 0.5 });
  }
  if (subject.branch) fields.push({ value: subject.branch, weight: 0.6 });
  if (subject.project) fields.push({ value: subject.project, weight: 0.25 });
  if (subject.where) fields.push({ value: subject.where, weight: 0.25 });
  return fields;
}

function threadQuery(words) {
  return words.map((word) => word.replace(/^#(?=\d)/, "")).filter(Boolean).map((word) => (/^\d+$/.test(word) ? `#${word}` : word));
}

function scoreThread(words, subject, now, query = "") {
  if (!words.length) return null;
  const asked = threadQuery(words);
  const match = matchFields(asked, threadFields(subject)) || (asked.join() !== words.join() ? matchFields(words, threadFields(subject)) : null);
  if (!match) return null;
  const pick = pickedFor(subject, query, now);
  return { score: match.quality * usageBoost(subject, now) + (pick ? 0.25 : 0), quality: match.quality, ranges: match.ranges };
}

function rankThreads(subjects, query, now) {
  const words = searchWords(query);
  return subjects
    .map((subject) => ({ subject, match: scoreThread(words, subject, now, query) }))
    .filter((one) => one.match)
    .sort((a, b) => b.match.score - a.match.score || recentUse(b.subject) - recentUse(a.subject))
    .map((one) => ({ ...one.subject, ranges: one.match.ranges }));
}

function recentThreads(subjects, currentKey, limit) {
  return subjects
    .filter((one) => one.key !== currentKey)
    .sort((a, b) => recentUse(b) - recentUse(a))
    .slice(0, limit);
}

function wordRanges(text, words) {
  const folded = foldText(text);
  const ranges = [];
  for (const word of words) {
    for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + word.length)) ranges.push([at, at + word.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const one of ranges) {
    const last = merged.at(-1);
    if (last && one[0] <= last[1]) last[1] = Math.max(last[1], one[1]);
    else merged.push([...one]);
  }
  return merged;
}

function markWords(text, words, escape) {
  const raw = String(text ?? "");
  const ranges = words.length ? wordRanges(raw, words) : [];
  let out = "";
  let at = 0;
  for (const [from, to] of ranges) {
    out += `${escape(raw.slice(at, from))}<mark>${escape(raw.slice(from, to))}</mark>`;
    at = to;
  }
  return out + escape(raw.slice(at));
}

function snippetAround(text, words, room = 72) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  const first = words.length ? wordRanges(flat, words)[0] : null;
  if (!first || flat.length <= room * 2) return flat.length > room * 2 ? `${flat.slice(0, room * 2).trimEnd()} …` : flat;
  const from = Math.max(0, first[0] - room / 2);
  const start = from > 0 ? flat.lastIndexOf(" ", from) + 1 || from : 0;
  const end = Math.min(flat.length, start + room * 2);
  const stop = end < flat.length ? flat.lastIndexOf(" ", end) : end;
  const body = flat.slice(start, stop > start ? stop : end).trim();
  return `${start > 0 ? "… " : ""}${body}${end < flat.length ? " …" : ""}`;
}

function readOpens(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(OPENS_KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

function writeOpens(storage, opens) {
  const kept = Object.entries(opens).sort((a, b) => (b[1]?.openedAt || 0) - (a[1]?.openedAt || 0)).slice(0, OPENS_KEPT);
  try { storage?.setItem(OPENS_KEY, JSON.stringify(Object.fromEntries(kept))); } catch {}
}

function noteOpen(storage, key, at, query) {
  if (!key) return null;
  const opens = readOpens(storage);
  opens[key] = recordOpen(opens[key] || null, at, query);
  writeOpens(storage, opens);
  return opens[key];
}

export { OPENS_KEY, foldText, markWords, matchFields, noteOpen, openedOften, pickedQuery, rankRows, rankThreads, readOpens, recentThreads, recentUse, recordOpen, scoreThread, searchWords, snippetAround, usageBoost, wordRanges };

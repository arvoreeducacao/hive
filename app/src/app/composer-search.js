const NAME_MARKERS = ["-", "_", "/"];

const WORD_MARKERS = [" ", "-", "_", "/"];

function subsequenceScore(value, query) {
  let at = 0;
  let first = -1;
  let previous = -1;
  let gaps = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== query[at]) continue;
    if (first < 0) first = i;
    if (previous >= 0) gaps += i - previous - 1;
    previous = i;
    at += 1;
    if (at === query.length) return first * 2 + gaps * 3 + (i - first + 1 - query.length) + Math.min(64, value.length - query.length);
  }
  return null;
}

function boundaryIndex(value, query, markers) {
  let best = null;
  for (const marker of markers) {
    const at = value.indexOf(`${marker}${query}`);
    if (at >= 0 && (best === null || at + marker.length < best)) best = at + marker.length;
  }
  return best;
}

function queryScore(value, query, { exact, prefix, boundary, includes, fuzzy, markers = WORD_MARKERS }) {
  if (!value || !query) return null;
  const penalty = Math.min(64, Math.max(0, value.length - query.length));
  if (value === query) return exact;
  if (value.startsWith(query)) return prefix + penalty;
  const edge = boundaryIndex(value, query, markers);
  if (edge !== null) return boundary + edge * 2 + penalty;
  const inside = value.indexOf(query);
  if (inside >= 0) return includes + inside * 2 + penalty;
  if (fuzzy === undefined) return null;
  const loose = subsequenceScore(value, query);
  return loose === null ? null : fuzzy + loose;
}

function commandScore(name, description, query) {
  const scores = [
    queryScore(name.toLowerCase(), query, { exact: 0, prefix: 2, boundary: 4, includes: 6, fuzzy: 100, markers: NAME_MARKERS }),
    queryScore(description.toLowerCase(), query, { exact: 20, prefix: 22, boundary: 24, includes: 26 })
  ].filter((score) => score !== null);
  return scores.length ? Math.min(...scores) : null;
}

function rankCommands(list, info, typed) {
  const query = String(typed ?? "").trim().replace(/^\/+/, "").toLowerCase();
  const names = [...list];
  if (!query) return names.sort((a, b) => a.localeCompare(b));
  return names
    .map((name) => ({ name, score: commandScore(name, info?.[name]?.description || "", query) }))
    .filter((one) => one.score !== null)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .map((one) => one.name);
}

export { commandScore, queryScore, rankCommands, subsequenceScore };

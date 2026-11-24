const STASH_KEY = "hive.prompt-stash";

const STASH_MAX = 20;

const SNIPPET_MAX = 90;

const validEntry = (one) => one && typeof one.id === "string" && typeof one.text === "string";

function readStash() {
  try {
    const read = JSON.parse(localStorage.getItem(STASH_KEY) || "[]");
    return Array.isArray(read) ? read.filter(validEntry) : [];
  } catch {
    return [];
  }
}

function writeStash(entries) {
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function stashEntry(box, at = Date.now()) {
  return {
    id: `s${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at,
    text: String(box.text || ""),
    images: Array.isArray(box.images) ? box.images : [],
    quotes: Array.isArray(box.quotes) ? box.quotes : [],
    files: Array.isArray(box.files) ? box.files : []
  };
}

function stashPrompt(box, at = Date.now()) {
  const entry = stashEntry(box, at);
  const next = [entry, ...readStash()];
  const evicted = next.length > STASH_MAX ? next.pop() : null;
  if (!writeStash(next)) return { ok: false, entry: null, evicted: null };
  return { ok: true, entry, evicted };
}

function takeStash(id) {
  const entries = readStash();
  const entry = entries.find((one) => one.id === id) || null;
  if (entry) writeStash(entries.filter((one) => one.id !== id));
  return entry;
}

function stashSnippet(entry, phrase) {
  const text = String(entry.text || "").replace(/\[Image #\d+\]/g, "").trim().replace(/\s+/g, " ");
  if (text) return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
  const quoted = entry.quotes?.[0]?.said?.trim().replace(/\s+/g, " ");
  if (quoted) return `“${quoted.length > SNIPPET_MAX ? `${quoted.slice(0, SNIPPET_MAX)}…` : quoted}”`;
  const images = entry.images?.length || 0;
  if (!images) return phrase("(empty)");
  return images === 1 ? phrase("(1 image)") : phrase("({n} images)", { n: images });
}

export { STASH_KEY, STASH_MAX, readStash, stashPrompt, stashSnippet, takeStash };

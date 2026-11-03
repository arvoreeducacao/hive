import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "guide");

export const GUIDE_ORDER = ["start", "providers", "hub", "skills", "extensions", "mcp", "seats", "interface", "team-and-cloud", "tools"];

const SEARCH_HITS = 5;
const SECTION_CEILING = 6000;

export function parseTopic(name, raw) {
  const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
  const title = (/^#\s+(.+)$/.exec(lines[0] || "") || [])[1]?.trim() || name;
  const rest = lines.slice(1).join("\n");
  const summary = rest.split(/\n\s*\n/).map((part) => part.trim()).find((part) => part && !part.startsWith("#")) || "";
  const sections = [];
  let current = null;
  for (const line of lines.slice(1)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      current = { heading: heading[1].trim(), lines: [line] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return {
    name,
    title,
    summary: summary.replace(/\s+/g, " "),
    body: String(raw).trim(),
    sections: sections.map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() })),
  };
}

export function readGuide(dir = GUIDE_DIR) {
  let files = [];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
  const rank = (name) => {
    const at = GUIDE_ORDER.indexOf(name);
    return at < 0 ? GUIDE_ORDER.length : at;
  };
  return files
    .map((file) => parseTopic(file.slice(0, -3), readFileSync(join(dir, file), "utf8")))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

function guideIndex(topics) {
  const lines = topics.map((t) => `- ${t.name}: ${t.title}. ${t.summary}`);
  return [
    "The Hive's own guide, written for the version of the app that is running.",
    "Call guide with topic to read one, or with search to find the sections that mention a few words.",
    "",
    ...lines,
  ].join("\n");
}

const wordsOf = (query) => [...new Set(String(query).toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter((w) => w.length > 1))];

const hitsIn = (text, word) => text.split(word).length - 1;

function guideSearch(topics, query) {
  const words = wordsOf(query);
  if (!words.length) return { error: "search needs at least one word of two letters or more" };
  const scored = [];
  for (const topic of topics) {
    for (const section of topic.sections) {
      const body = section.text.toLowerCase();
      const heading = section.heading.toLowerCase();
      const found = words.filter((w) => body.includes(w));
      if (!found.length) continue;
      const named = words.filter((w) => heading.includes(w) || topic.name.includes(w)).length;
      const score = found.reduce((sum, w) => sum + hitsIn(body, w), 0);
      scored.push({ topic, section, every: found.length === words.length, named, found: found.length, score });
    }
  }
  if (!scored.length) return { error: `nothing in the guide mentions ${words.join(", ")}. Topics: ${topics.map((t) => t.name).join(", ")}` };
  const best = scored
    .sort((a, b) => Number(b.every) - Number(a.every) || b.named - a.named || b.found - a.found || b.score - a.score)
    .slice(0, SEARCH_HITS);
  const shown = best.map(({ topic, section }) => {
    const text = section.text.length > SECTION_CEILING ? `${section.text.slice(0, SECTION_CEILING)}\n…(cut; read the whole topic "${topic.name}")` : section.text;
    return `[${topic.name}] ${text}`;
  });
  return { text: shown.join("\n\n---\n\n") };
}

export function answerGuide(args = {}, topics = readGuide()) {
  if (!topics.length) return { error: "this build of the Hive carries no guide — its server folder has no guide/ next to peer/" };
  const topic = String(args.topic || "").trim().toLowerCase();
  const search = String(args.search || "").trim();
  if (topic) {
    const found = topics.find((t) => t.name === topic) || topics.find((t) => t.name.startsWith(topic));
    if (!found) return { error: `no topic "${topic}". Topics: ${topics.map((t) => t.name).join(", ")}` };
    return { text: found.body };
  }
  if (search) return guideSearch(topics, search);
  return { text: guideIndex(topics) };
}

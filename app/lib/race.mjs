import { slug } from "./naming.mjs";

export { raceOf } from "./errands.mjs";

export const RACE_MAX = 4;

export function raceCount(asked) {
  const n = Math.floor(Number(asked) || 1);
  return Math.min(RACE_MAX, Math.max(1, n));
}

export const oneLine = (text, max = 60) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

export function raceBrief(i, of) {
  return `[hive] race: you are chat ${i} of ${of} on the same mission. Work in a git worktree of your own (EnterWorktree), never on the shared checkout, and open a PR when you are done — the person compares the ${of} results and keeps one.`;
}

export function raceMissions(body, count = raceCount(body?.count)) {
  const of = raceCount(count);
  const prompt = String(body?.prompt || "").trim();
  if (of < 2) return [{ ...body, count: 1 }];
  const named = slug(body?.name || "");
  const errand = oneLine(body?.errand) || oneLine(prompt.split("\n").find((line) => line.trim()) || named);
  return Array.from({ length: of }, (_, k) => {
    const i = k + 1;
    return {
      ...body,
      count: of,
      name: named ? `${named}-${i}` : "",
      errand,
      race: { i, of },
      prompt: prompt ? `${raceBrief(i, of)}\n\n${prompt}` : prompt
    };
  });
}


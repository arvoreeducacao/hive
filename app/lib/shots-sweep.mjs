import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const SHOTS_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function shotsDaysOf(env = process.env) {
  const asked = String(env.HIVE_SHOTS_DAYS ?? "").trim();
  if (asked === "") return SHOTS_DAYS;
  const days = Number(asked);
  return Number.isFinite(days) && days >= 0 ? days : SHOTS_DAYS;
}

export function staleShots(files, { now = Date.now(), days = SHOTS_DAYS } = {}) {
  if (!days) return [];
  const edge = now - days * DAY_MS;
  return files.filter((one) => (one.at || 0) < edge).map((one) => one.name);
}

async function filesOf(dir) {
  const names = await readdir(dir).catch(() => []);
  const found = [];
  for (const name of names) {
    const path = join(dir, name);
    const seen = await stat(path).catch(() => null);
    if (!seen) continue;
    if (seen.isDirectory()) found.push(...(await filesOf(path)));
    else found.push({ name: path, at: seen.mtimeMs, bytes: seen.size });
  }
  return found;
}

export async function sweepShots(dirs, { now = Date.now(), days = SHOTS_DAYS } = {}) {
  const gone = [];
  let freed = 0;
  for (const dir of dirs) {
    const files = await filesOf(dir);
    const bytesOf = new Map(files.map((one) => [one.name, one.bytes]));
    for (const path of staleShots(files, { now, days })) {
      await rm(path, { force: true }).catch(() => {});
      gone.push(path);
      freed += bytesOf.get(path) || 0;
    }
  }
  return { gone, freed };
}

export async function measureShots(root) {
  const chats = await readdir(root).catch(() => []);
  let files = 0;
  let bytes = 0;
  let held = 0;
  for (const chat of chats) {
    const inside = await filesOf(join(root, chat));
    if (!inside.length) continue;
    held += 1;
    files += inside.length;
    bytes += inside.reduce((n, one) => n + one.bytes, 0);
  }
  return { chats: held, files, bytes };
}

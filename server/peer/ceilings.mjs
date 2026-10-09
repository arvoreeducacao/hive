import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CEILINGS = ["read", "operate", "full"];
export const CEILING_DEFAULT = "full";

const rank = (level) => CEILINGS.indexOf(level);

export const isCeiling = (level) => rank(level) >= 0;

export const allows = (ceiling, need) => isCeiling(need) && rank(isCeiling(ceiling) ? ceiling : CEILING_DEFAULT) >= rank(need);

export function narrowest(...levels) {
  const known = levels.filter(isCeiling);
  if (!known.length) return CEILING_DEFAULT;
  return known.reduce((a, b) => (rank(b) < rank(a) ? b : a));
}

export const ceilingsFile = (base) => join(base, "ceilings.json");

function readAll(base) {
  try {
    const said = JSON.parse(readFileSync(ceilingsFile(base), "utf8"));
    return said && typeof said === "object" ? said : {};
  } catch {
    return {};
  }
}

export function readCeiling(base, seat) {
  const level = readAll(base)[seat];
  return isCeiling(level) ? level : CEILING_DEFAULT;
}

export function writeCeiling(base, seat, level) {
  const all = readAll(base);
  if (!isCeiling(level) || level === CEILING_DEFAULT) delete all[seat];
  else all[seat] = level;
  const file = ceilingsFile(base);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(all, null, 2)}\n`);
  renameSync(temp, file);
  return isCeiling(level) ? level : CEILING_DEFAULT;
}

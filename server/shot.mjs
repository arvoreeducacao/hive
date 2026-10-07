import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SHOT_KINDS = { jpg: "image/jpeg", png: "image/png" };
export const SHOT_CEILING = 4 << 20;

const SHOT_DATA_URL = /^data:([\w+.-]+\/[\w+.-]+)?;base64,/i;
const SHOT_EXT = Object.fromEntries(Object.entries(SHOT_KINDS).map(([ext, mime]) => [mime, ext]));

export function readShot(data, ceiling = SHOT_CEILING) {
  const found = SHOT_DATA_URL.exec(String(data || ""));
  const ext = SHOT_EXT[String(found?.[1] || "").toLowerCase()];
  if (!ext) return { error: "a picture from the phone comes as jpeg or png" };
  const bytes = Buffer.from(String(data).replace(SHOT_DATA_URL, ""), "base64");
  if (!bytes.length) return { error: "that picture came in empty" };
  if (bytes.length > ceiling) {
    const mb = (n) => `${Math.round((n / (1 << 20)) * 10) / 10} MB`;
    return { error: `that picture is ${mb(bytes.length)} — ${mb(ceiling)} is the ceiling for one` };
  }
  return { ext, bytes };
}

export function keepShot(base, seat, data, { at = Date.now(), ceiling = SHOT_CEILING } = {}) {
  const shot = readShot(data, ceiling);
  if (shot.error) return shot;
  const dir = join(base, "shots", seat);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `celular-${at}.${shot.ext}`);
  writeFileSync(path, shot.bytes);
  return { path };
}

export function sayWithShot(text, path) {
  return { type: "say", text: [String(text || "").trim(), path].filter(Boolean).join(" ") };
}

import { phrase } from "./i18n.mjs";

export const FILE_CEILING = 24 << 20;
export const DROP_CEILING = 32 << 20;
export const DROP_LIMIT = 6;

const RUNNABLE = new Set([
  "exe", "msi", "dll", "com", "bat", "cmd", "scr", "vbs", "ps1",
  "app", "pkg", "dmg", "deb", "rpm", "apk", "jar", "iso", "img"
]);

const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"]);

export function extensionOf(name) {
  const hit = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || "").trim());
  return hit ? hit[1].toLowerCase() : "";
}

export const isImageName = (name) => IMAGES.has(extensionOf(name));

export const isRunnableName = (name) => RUNNABLE.has(extensionOf(name));

const mb = (bytes) => {
  const n = bytes / (1 << 20);
  return `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} MB`;
};

export function refuseDrop(files) {
  const list = [...(files || [])];
  if (!list.length) return phrase("nothing readable came in that drop");
  if (list.length > DROP_LIMIT) return phrase("{n} files at once — {limit} is as many as one drop carries", { n: list.length, limit: DROP_LIMIT });

  if (list.some((f) => !String(f.name || "").trim())) return phrase("a file with no name does not go in");

  const runnable = list.find((f) => isRunnableName(f.name));
  if (runnable) return phrase("{name} is something the machine runs, not something a session reads", { name: runnable.name });

  const empty = list.find((f) => !(f.size > 0));
  if (empty) return phrase("{name} is empty — a folder has to be dropped as the files inside it", { name: empty.name });

  const heavy = list.find((f) => f.size > FILE_CEILING);
  if (heavy) return phrase("{name} is {size} — {ceiling} is the ceiling for one file", { name: heavy.name, size: mb(heavy.size), ceiling: mb(FILE_CEILING) });

  const total = list.reduce((sum, f) => sum + f.size, 0);
  if (total > DROP_CEILING) return phrase("{size} in one drop — {ceiling} is the ceiling", { size: mb(total), ceiling: mb(DROP_CEILING) });

  return "";
}

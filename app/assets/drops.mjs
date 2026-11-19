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

export function fileRefusal(file) {
  const name = String(file?.name || "").trim();
  if (!name) return phrase("a file with no name does not go in");
  if (isRunnableName(name)) return phrase("{name} is something the machine runs, not something a session reads", { name });
  if (!(file.size > 0)) return phrase("{name} is empty — a folder has to be dropped as the files inside it", { name });
  if (file.size > FILE_CEILING) return phrase("{name} is {size} — {ceiling} is the ceiling for one file", { name, size: mb(file.size), ceiling: mb(FILE_CEILING) });
  return "";
}

export function refuseDrop(files) {
  const list = [...(files || [])];
  if (!list.length) return phrase("nothing readable came in that drop");
  if (list.length > DROP_LIMIT) return phrase("{n} files at once — {limit} is as many as one drop carries", { n: list.length, limit: DROP_LIMIT });

  for (const file of list) {
    const said = fileRefusal(file);
    if (said) return said;
  }

  const total = list.reduce((sum, f) => sum + f.size, 0);
  if (total > DROP_CEILING) return phrase("{size} in one drop — {ceiling} is the ceiling", { size: mb(total), ceiling: mb(DROP_CEILING) });

  return "";
}

export function packDrop(files) {
  const batches = [];
  const refused = [];
  let batch = [];
  let weight = 0;
  for (const file of [...(files || [])]) {
    const said = fileRefusal(file);
    if (said) {
      refused.push(said);
      continue;
    }
    if (batch.length && (batch.length >= DROP_LIMIT || weight + file.size > DROP_CEILING)) {
      batches.push(batch);
      batch = [];
      weight = 0;
    }
    batch.push(file);
    weight += file.size;
  }
  if (batch.length) batches.push(batch);
  return { batches, refused };
}

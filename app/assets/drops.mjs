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

export const ATTACHMENT_LIMIT = 100;
export const IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGES_TOTAL_BYTES = 80 * 1024 * 1024;
export const ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const IMAGE_MAX_EDGE = 2000;

const ATTACHABLE_IMAGES = new Set(["gif", "jpg", "jpeg", "png", "webp", "heic", "heif"]);
const PREVIEWABLE_IMAGES = new Set(["bmp", "avif", "ico"]);
const IMAGE_MIME_EXTENSION = { "image/gif": "gif", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/svg+xml": "svg", "image/bmp": "bmp", "image/avif": "avif", "image/tiff": "tiff", "image/x-adobe-dng": "dng" };

export const isHeic = (file) => /^image\/hei[cf]$/i.test(String(file?.type || "")) || /^hei[cf]$/.test(extensionOf(file?.name));

export function attachmentKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const ext = extensionOf(file?.name) || IMAGE_MIME_EXTENSION[type] || "";
  if (ext === "svg" || ext === "dng") return "file";
  if (isHeic(file) || ATTACHABLE_IMAGES.has(ext)) return "image";
  const looksLikeImage = type.startsWith("image/") || Object.values(IMAGE_MIME_EXTENSION).includes(ext);
  if (!looksLikeImage) return "file";
  return PREVIEWABLE_IMAGES.has(ext) ? "file" : "unsupported-image";
}

export function formatAttachmentSize(bytes) {
  const kb = Math.max(1, Math.ceil((Number(bytes) || 0) / 1024));
  return kb >= 1024 ? `${((Number(bytes) || 0) / 1048576).toFixed(1)} MB` : `${kb} KB`;
}

const limitWord = (bytes) => `${Math.round(bytes / 1048576)} MB`;

export function admitAttachments(files, { held = 0, heldImageBytes = 0 } = {}) {
  const accepted = [];
  const refused = [];
  let taken = Math.max(0, held);
  let imageBytes = Math.max(0, heldImageBytes);
  for (const file of [...(files || [])]) {
    const name = String(file?.name || "").trim() || "file";
    const kind = attachmentKind(file);
    if (taken >= ATTACHMENT_LIMIT) {
      refused.push(phrase("You can attach up to {max} files per message.", { max: ATTACHMENT_LIMIT }));
      continue;
    }
    if (!(file?.size > 0)) {
      refused.push(phrase("'{name}' is empty or could not be read.", { name }));
      continue;
    }
    if (isRunnableName(name)) {
      refused.push(phrase("{name} is something the machine runs, not something a session reads", { name }));
      continue;
    }
    if (kind === "unsupported-image") {
      refused.push(phrase("'{name}' is not a supported image type. Attach GIF, HEIC, HEIF, JPEG, PNG, or WebP images.", { name }));
      continue;
    }
    if (file.size > ATTACHMENT_BYTES) {
      refused.push(phrase("'{name}' exceeds the {size} attachment limit.", { name, size: limitWord(ATTACHMENT_BYTES) }));
      continue;
    }
    if (kind === "image" && imageBytes + Math.min(file.size, IMAGE_BYTES) > IMAGES_TOTAL_BYTES) {
      refused.push(phrase("Images can total up to 80 MiB per message or question response. Use smaller images or send fewer at once."));
      continue;
    }
    if (kind === "image") imageBytes += Math.min(file.size, IMAGE_BYTES);
    taken += 1;
    accepted.push({ file, kind });
  }
  return { accepted, refused };
}

const ARCHIVE_MAX_BYTES = 50 * 1024 * 1024;

const ARCHIVE_MAX_ENTRIES = 2048;

const ARCHIVE_ENTRY_MAX_BYTES = 10 * 1024 * 1024;

const ARCHIVE_MAX_RATIO = 200;

const ARCHIVE_PATH_MAX = 1024;

const END_OF_DIRECTORY = 0x06054b50;

const DIRECTORY_ENTRY = 0x02014b50;

const LOCAL_HEADER = 0x04034b50;

const END_SEARCH_SPAN = 0xffff + 22;

class ArchiveError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function dosDate(date, time) {
  if (!date) return null;
  const at = new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
  return Number.isNaN(at.getTime()) ? null : at;
}

function findEnd(view) {
  const floor = Math.max(0, view.byteLength - END_SEARCH_SPAN);
  for (let at = view.byteLength - 22; at >= floor; at -= 1) if (view.getUint32(at, true) === END_OF_DIRECTORY) return at;
  return -1;
}

function readArchive(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > ARCHIVE_MAX_BYTES) throw new ArchiveError("too-big");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(view);
  if (end < 0) throw new ArchiveError("not-zip");
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (count === 0xffff || start === 0xffffffff) throw new ArchiveError("zip64");
  if (count > ARCHIVE_MAX_ENTRIES) throw new ArchiveError("too-many");
  if (start + size > bytes.byteLength) throw new ArchiveError("damaged");
  const names = new TextDecoder();
  const entries = [];
  let expanded = 0;
  let at = start;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > bytes.byteLength || view.getUint32(at, true) !== DIRECTORY_ENTRY) throw new ArchiveError("damaged");
    const method = view.getUint16(at + 10, true);
    const modified = dosDate(view.getUint16(at + 14, true), view.getUint16(at + 12, true));
    const packed = view.getUint32(at + 20, true);
    const length = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const noteLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    if (nameLength > ARCHIVE_PATH_MAX) throw new ArchiveError("path-too-long");
    const path = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + noteLength;
    expanded += length;
    if (expanded > ARCHIVE_MAX_BYTES * ARCHIVE_MAX_RATIO || (packed && length / packed > ARCHIVE_MAX_RATIO)) throw new ArchiveError("ratio");
    if (!path || path.startsWith("__MACOSX/")) continue;
    entries.push({ path: path.replace(/\\/g, "/"), folder: path.endsWith("/"), method, packed, size: length, offset, modified });
  }
  if (!entries.length) throw new ArchiveError("empty");
  return { bytes, entries };
}

function folderListing(entries, folder) {
  const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : "";
  const seen = new Map();
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix) || entry.path === prefix) continue;
    const rest = entry.path.slice(prefix.length);
    const cut = rest.indexOf("/");
    if (cut >= 0 && cut < rest.length - 1) {
      const name = rest.slice(0, cut);
      if (!seen.has(name)) seen.set(name, { name, path: `${prefix}${name}`, folder: true, size: 0, modified: null });
      continue;
    }
    const name = rest.replace(/\/$/, "");
    if (entry.folder) {
      if (!seen.has(name)) seen.set(name, { name, path: `${prefix}${name}`, folder: true, size: 0, modified: entry.modified });
      continue;
    }
    seen.set(name, { name, path: entry.path, folder: false, size: entry.size, modified: entry.modified });
  }
  return [...seen.values()].sort((a, b) => (Number(b.folder) - Number(a.folder)) || a.path.localeCompare(b.path));
}

async function inflateRaw(packed, ceiling) {
  if (typeof DecompressionStream !== "function") throw new ArchiveError("damaged");
  const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ceiling) {
      await reader.cancel().catch(() => {});
      throw new ArchiveError("damaged");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

async function readEntry(archive, path) {
  const entry = archive.entries.find((one) => one.path === path && !one.folder);
  if (!entry) throw new ArchiveError("damaged");
  if (entry.size > ARCHIVE_ENTRY_MAX_BYTES) throw new ArchiveError("entry-too-big");
  const { bytes } = archive;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.offset + 30 > bytes.byteLength || view.getUint32(entry.offset, true) !== LOCAL_HEADER) throw new ArchiveError("damaged");
  const begin = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const packed = bytes.subarray(begin, begin + entry.packed);
  if (entry.method === 0) return packed.slice();
  if (entry.method === 8) return inflateRaw(packed, entry.size);
  throw new ArchiveError("unsupported-entry");
}

export { ARCHIVE_ENTRY_MAX_BYTES, ARCHIVE_MAX_BYTES, ARCHIVE_MAX_ENTRIES, ArchiveError, folderListing, readArchive, readEntry };

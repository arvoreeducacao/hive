import { createHash } from "node:crypto";
import { connect } from "node:net";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SUN_PATH_CEILING = 100;

export function socketPathFor({ home, platform = process.platform, hub = "", short = tmpdir() } = {}) {
  if (platform === "win32") {
    const mark = createHash("sha256").update(String(hub || home || "hive")).digest("hex").slice(0, 12);
    return `\\\\.\\pipe\\hive-${mark}`;
  }
  const wanted = join(home, "hive.sock");
  if (Buffer.byteLength(wanted) <= SUN_PATH_CEILING) return wanted;
  const mark = createHash("sha256").update(wanted).digest("hex").slice(0, 12);
  return join(short, `hive-${mark}.sock`);
}

export function isNamedPipe(path) {
  return String(path).startsWith("\\\\.\\pipe\\");
}

export function readsAsStale(wrong) {
  return ["ECONNREFUSED", "ENOENT", "ENOTSOCK", "ECONNRESET"].includes(wrong?.code);
}

export function whoHasTheDoor(path, { timeout = 1500 } = {}) {
  if (isNamedPipe(path) || !existsSync(path)) return Promise.resolve("nobody");
  return new Promise((tell) => {
    const probe = connect(path);
    const done = (verdict) => { probe.destroy(); tell(verdict); };
    probe.setTimeout(timeout, () => done("nobody"));
    probe.once("connect", () => done("another hive"));
    probe.once("error", (wrong) => done(readsAsStale(wrong) ? "nobody" : "another hive"));
  });
}

export function sweepStale(path) {
  if (isNamedPipe(path) || !existsSync(path)) return false;
  try { unlinkSync(path); return true; } catch { return false; }
}

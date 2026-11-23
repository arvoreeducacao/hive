import { chmodSync, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const FILES_DIR = "slack-files";
export const FILES_KEPT = 8;
export const FILES_DAYS = 7;
export const IMAGE_CEILING = 20 * 1024 * 1024;
export const VIDEO_CEILING = 200 * 1024 * 1024;
export const KEPT_TYPES = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" }
};
const CEILINGS = { image: IMAGE_CEILING, video: VIDEO_CEILING };
const WAITS = { image: 45 * 1000, video: 5 * 60 * 1000 };
const SLACK_FILES_HOST = "files.slack.com";
const CHANNEL_SHAPE = /^[A-Z0-9]+$/;
const TS_SHAPE = /^\d+\.\d+$/;
const FILE_SHAPE = /^F[A-Z0-9]+$/;

export function slackFileUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    return url.protocol === "https:" && url.hostname === SLACK_FILES_HOST ? url.toString() : "";
  } catch { return ""; }
}

export const filesOf = (message) =>
  (Array.isArray(message?.files) ? message.files : [])
    .filter((one) => one && typeof one.id === "string")
    .map((one) => ({
      id: one.id,
      name: String(one.name || one.title || one.id),
      mimetype: String(one.mimetype || ""),
      size: Number(one.size) || 0,
      url: String(one.url_private_download || one.url_private || ""),
      lookup: one.file_access === "check_file_info"
    }));

export const kindOf = (mimetype) => KEPT_TYPES[mimetype]?.kind || "";

export const ceilingOf = (mimetype) => CEILINGS[kindOf(mimetype)] || 0;

export const isKept = (file) => file.lookup || !!kindOf(file.mimetype);

const waitFor = (file) => (file.lookup ? WAITS.video : WAITS[kindOf(file.mimetype)] || WAITS.image);

const megabytes = (bytes) => Math.round(bytes / 1024 / 1024);

export const filesFolder = (home, channel, thread) => join(home, FILES_DIR, `${channel}-${thread}`);

export function whyNot(error, needed = "", mimetype = "") {
  if (needed === "files:read") return "the Slack app is missing the files:read scope, so the bot cannot download files";
  if (error === "unknown_method") return "the team's Slack relay does not hand files over yet";
  if (error === "not_your_thread") return "the relay says this thread is not yours";
  if (error === "file_too_big") {
    const ceiling = ceilingOf(mimetype);
    return ceiling
      ? `it is bigger than ${megabytes(ceiling)} MB`
      : `it is bigger than this machine takes (${megabytes(IMAGE_CEILING)} MB for an image, ${megabytes(VIDEO_CEILING)} MB for a video)`;
  }
  if (error === "not_an_image" && kindOf(mimetype) === "video") return "the team's Slack relay does not hand videos over yet";
  if (error === "not_an_image" || error === "not_image_or_video") return "it is not an image or a video";
  if (error === "file_not_downloadable") return "slack gave no address on its own file host to download it from";
  return error || "it did not come";
}

export async function sweepFiles(home, now = Date.now()) {
  const root = join(home, FILES_DIR);
  let folders = [];
  try { folders = await readdir(root); } catch { return; }
  for (const one of folders) {
    const where = join(root, one);
    try {
      if (now - (await stat(where)).mtimeMs > FILES_DAYS * 24 * 60 * 60 * 1000) await rm(where, { recursive: true, force: true });
    } catch {}
  }
}

async function saveCapped(body, path, ceiling) {
  let size = 0;
  const counted = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > ceiling ? new Error("file_too_big") : null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(body), counted, createWriteStream(path, { mode: 0o600 }));
  return size;
}

const lengthOf = (answer) => Number(answer.headers?.get?.("content-length")) || 0;

export function createSlackFiles({ home, keysOf, ask, fetchImpl = globalThis.fetch, now = Date.now, log = () => {} }) {
  async function fromRelay(keys, { channel, thread, ts, file }) {
    const answer = await fetchImpl(keys.files, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.bot}`, "content-type": "application/json" },
      body: JSON.stringify({ channel, thread, ts, file: file.id }),
      signal: AbortSignal.timeout(waitFor(file))
    });
    const kind = String(answer.headers?.get?.("content-type") || "");
    if (kind.includes("application/json")) {
      const said = await answer.json().catch(() => ({}));
      return { error: String(said?.error || `the relay answered ${answer.status}`), needed: String(said?.needed || "") };
    }
    if (answer.status !== 200) return { error: `the relay answered ${answer.status}`, body: answer.body };
    return { body: answer.body, type: kind.split(";")[0].trim(), length: lengthOf(answer) };
  }

  async function fromSlack(keys, { file }) {
    let found = file;
    if (found.lookup) {
      const info = await ask("files.info", { file: found.id });
      if (!info.ok) return { error: info.error, needed: String(info.needed || "") };
      [found] = filesOf({ files: [info.file] });
      if (!found) return { error: "slack described no file" };
    }
    if (!kindOf(found.mimetype)) return { error: "not_image_or_video" };
    if (found.size > ceilingOf(found.mimetype)) return { error: "file_too_big", type: found.mimetype };
    const source = slackFileUrl(found.url);
    if (!source) return { error: "file_not_downloadable" };
    const answer = await fetchImpl(source, { headers: { authorization: `Bearer ${keys.bot}` }, redirect: "manual", signal: AbortSignal.timeout(waitFor(found)) });
    const kind = String(answer.headers?.get?.("content-type") || "");
    if ((answer.status >= 300 && answer.status < 400) || kind.startsWith("text/html")) return { error: "file_refused", needed: "files:read", body: answer.body };
    if (answer.status !== 200) return { error: `slack answered ${answer.status}`, body: answer.body };
    return { body: answer.body, type: found.mimetype, length: lengthOf(answer) };
  }

  async function one({ channel, thread, ts, file, who }) {
    const named = { name: file.name, who };
    if (!isKept(file)) return { ...named, error: whyNot("not_image_or_video") };
    if (![channel, thread, ts, file.id].every((part, at) => [CHANNEL_SHAPE, TS_SHAPE, TS_SHAPE, FILE_SHAPE][at].test(String(part)))) {
      return { ...named, error: "slack named it in a shape this machine does not trust" };
    }
    const folder = filesFolder(home, channel, thread);
    const stem = `${ts}-${file.id}`;
    const ready = Object.values(KEPT_TYPES).find(({ ext }) => existsSync(join(folder, `${stem}.${ext}`)));
    if (ready) return { ...named, kind: ready.kind, path: join(folder, `${stem}.${ready.ext}`) };
    const keys = keysOf();
    let got;
    try { got = keys.files ? await fromRelay(keys, { channel, thread, ts, file }) : await fromSlack(keys, { file }); }
    catch (wrong) { got = { error: String(wrong?.message || wrong) }; }
    const type = KEPT_TYPES[got.type] ? got.type : file.mimetype;
    const kept = KEPT_TYPES[type];
    const ceiling = ceilingOf(type);
    if (!got.error && (!kept || !got.body)) got = { ...got, error: "what came back is not an image or a video this machine keeps" };
    if (!got.error && got.length > ceiling) got = { ...got, error: "file_too_big" };
    if (got.error) {
      Promise.resolve(got.body?.cancel?.()).catch(() => {});
      log(`slack: the file ${file.id} in ${channel}:${thread} did not come — ${got.error}`);
      return { ...named, error: whyNot(got.error, got.needed, got.type || type) };
    }
    const path = join(folder, `${stem}.${kept.ext}`);
    const part = `${path}.part`;
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      if (!(await saveCapped(got.body, part, ceiling))) throw new Error("nothing came");
      await rename(part, path);
      chmodSync(path, 0o600);
    } catch (wrong) {
      await rm(part, { force: true }).catch(() => {});
      const why = String(wrong?.message || wrong);
      log(`slack: the file ${file.id} in ${channel}:${thread} could not be saved — ${why}`);
      return { ...named, error: wrong?.syscall ? "this machine could not save it" : whyNot(why, "", type) };
    }
    return { ...named, kind: kept.kind, path };
  }

  return {
    async fetchAll(channel, thread, shared) {
      const wanted = shared.filter((item) => isKept(item.file)).slice(-FILES_KEPT);
      const skipped = shared.filter((item) => !isKept(item.file)).map((item) => ({ name: item.file.name, who: item.who, error: whyNot("not_image_or_video") }));
      if (!wanted.length) return skipped;
      const fetched = await Promise.all(wanted.map((item) => one({ channel, thread, ...item })));
      sweepFiles(home, now()).catch(() => {});
      return [...fetched, ...skipped];
    }
  };
}

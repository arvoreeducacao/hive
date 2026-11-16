import { chmodSync, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const FILES_DIR = "slack-files";
export const FILES_KEPT = 8;
export const FILES_DAYS = 7;
export const FILE_CEILING = 20 * 1024 * 1024;
export const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
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

export const isImage = (file) => file.lookup || !!IMAGE_EXTENSIONS[file.mimetype];

export const filesFolder = (home, channel, thread) => join(home, FILES_DIR, `${channel}-${thread}`);

export function whyNot(error, needed = "") {
  if (needed === "files:read") return "the Slack app is missing the files:read scope, so the bot cannot download files";
  if (error === "unknown_method") return "the team's Slack relay does not hand files over yet";
  if (error === "not_your_thread") return "the relay says this thread is not yours";
  if (error === "file_too_big") return "it is bigger than 20 MB";
  if (error === "not_an_image") return "it is not an image";
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

export function createSlackFiles({ home, keysOf, ask, fetchImpl = globalThis.fetch, now = Date.now, log = () => {} }) {
  async function fromRelay(keys, { channel, thread, ts, file }) {
    const answer = await fetchImpl(keys.files, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.bot}`, "content-type": "application/json" },
      body: JSON.stringify({ channel, thread, ts, file: file.id }),
      signal: AbortSignal.timeout(45000)
    });
    const kind = String(answer.headers?.get?.("content-type") || "");
    if (kind.includes("application/json")) {
      const said = await answer.json().catch(() => ({}));
      return { error: String(said?.error || `the relay answered ${answer.status}`), needed: String(said?.needed || "") };
    }
    if (answer.status !== 200) return { error: `the relay answered ${answer.status}` };
    return { bytes: Buffer.from(await answer.arrayBuffer()), type: kind.split(";")[0].trim() };
  }

  async function fromSlack(keys, { file }) {
    let found = file;
    if (found.lookup) {
      const info = await ask("files.info", { file: found.id });
      if (!info.ok) return { error: info.error, needed: String(info.needed || "") };
      [found] = filesOf({ files: [info.file] });
      if (!found) return { error: "slack described no file" };
    }
    if (!IMAGE_EXTENSIONS[found.mimetype]) return { error: "not_an_image" };
    if (found.size > FILE_CEILING) return { error: "file_too_big" };
    const source = slackFileUrl(found.url);
    if (!source) return { error: "file_not_downloadable" };
    const answer = await fetchImpl(source, { headers: { authorization: `Bearer ${keys.bot}` }, redirect: "manual", signal: AbortSignal.timeout(45000) });
    const kind = String(answer.headers?.get?.("content-type") || "");
    if ((answer.status >= 300 && answer.status < 400) || kind.startsWith("text/html")) return { error: "file_refused", needed: "files:read" };
    if (answer.status !== 200) return { error: `slack answered ${answer.status}` };
    return { bytes: Buffer.from(await answer.arrayBuffer()), type: found.mimetype };
  }

  async function one({ channel, thread, ts, file, who }) {
    const named = { name: file.name, who };
    if (!isImage(file)) return { ...named, error: whyNot("not_an_image") };
    if (![channel, thread, ts, file.id].every((part, at) => [CHANNEL_SHAPE, TS_SHAPE, TS_SHAPE, FILE_SHAPE][at].test(String(part)))) {
      return { ...named, error: "slack named it in a shape this machine does not trust" };
    }
    const folder = filesFolder(home, channel, thread);
    const stem = `${ts}-${file.id}`;
    const ready = Object.values(IMAGE_EXTENSIONS).map((ext) => join(folder, `${stem}.${ext}`)).find((path) => existsSync(path));
    if (ready) return { ...named, path: ready };
    const keys = keysOf();
    let got;
    try { got = keys.files ? await fromRelay(keys, { channel, thread, ts, file }) : await fromSlack(keys, { file }); }
    catch (wrong) { got = { error: String(wrong?.message || wrong) }; }
    const ext = IMAGE_EXTENSIONS[got.type] || IMAGE_EXTENSIONS[file.mimetype];
    if (!got.error && (!ext || !got.bytes?.length || got.bytes.length > FILE_CEILING)) got = { error: "what came back is not an image this machine keeps" };
    if (got.error) {
      log(`slack: the image ${file.id} in ${channel}:${thread} did not come — ${got.error}`);
      return { ...named, error: whyNot(got.error, got.needed) };
    }
    const path = join(folder, `${stem}.${ext}`);
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(path, got.bytes, { mode: 0o600 });
      chmodSync(path, 0o600);
    } catch (wrong) {
      log(`slack: the image ${file.id} could not be saved — ${String(wrong?.message || wrong)}`);
      return { ...named, error: "this machine could not save it" };
    }
    return { ...named, path };
  }

  return {
    async fetchAll(channel, thread, shared) {
      const wanted = shared.filter((item) => isImage(item.file)).slice(-FILES_KEPT);
      const skipped = shared.filter((item) => !isImage(item.file)).map((item) => ({ name: item.file.name, who: item.who, error: whyNot("not_an_image") }));
      if (!wanted.length) return skipped;
      const fetched = await Promise.all(wanted.map((item) => one({ channel, thread, ...item })));
      sweepFiles(home, now()).catch(() => {});
      return [...fetched, ...skipped];
    }
  };
}

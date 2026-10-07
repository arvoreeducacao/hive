import { createHash } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

export const STT_ENGINE_VERSION = "0.2.3";

export const STT_ENGINE_RELEASE = "https://github.com/handy-computer/transcribe.cpp/releases/download";

export const STT_MODELS = [
  {
    id: "whisper-medium",
    file: "whisper-medium-Q8_0.gguf",
    repo: "handy-computer/whisper-medium-gguf",
    revision: "ec78f06fded51aa82cde751678b78f76f78c8b7f",
    url: "https://huggingface.co/handy-computer/whisper-medium-gguf/resolve/ec78f06fded51aa82cde751678b78f76f78c8b7f/whisper-medium-Q8_0.gguf",
    bytes: 831538144,
    sha256: "09e6a65e7de377aa5b10bae24608bc6f8ca2ed04b3993ef10d4a02bcd9a82adf",
    name: "Whisper Medium",
    quant: "Q8_0",
    detectsLanguage: true
  },
  {
    id: "parakeet-v3",
    file: "parakeet-tdt-0.6b-v3-Q8_0.gguf",
    repo: "handy-computer/parakeet-tdt-0.6b-v3-gguf",
    revision: "90f082450fcbacdb54e5900c44ef697c9ea59622",
    url: "https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf/resolve/90f082450fcbacdb54e5900c44ef697c9ea59622/parakeet-tdt-0.6b-v3-Q8_0.gguf",
    bytes: 739508576,
    sha256: "5859f77944efcd8eafa23a6350731960b2b55b2203df51f319665c807d802cc7",
    name: "Parakeet TDT 0.6B v3",
    quant: "Q8_0",
    detectsLanguage: false
  }
];

export const STT_DEFAULT_MODEL = STT_MODELS[0].id;

export const STT_MODEL = STT_MODELS[0];

export function sttModel(id) {
  return STT_MODELS.find((one) => one.id === id) || STT_MODEL;
}

export const STT_ENGINE_ASSETS = {
  "darwin-arm64": {
    asset: "transcribe-native-0.2.3-macos-arm64-metal.tar.gz",
    root: "transcribe-native-macos-arm64-metal",
    bytes: 1509309,
    sha256: "1cc5e89d442f55c165a3f90e49090cec75cec349071d834c0aa656161afa9543",
    lib: "libtranscribe.dylib"
  },
  "darwin-x64": {
    asset: "transcribe-native-0.2.3-macos-x86_64-cpu.tar.gz",
    root: "transcribe-native-macos-x86_64-cpu",
    bytes: 1443473,
    sha256: "39bb982430f25dcff93e1a1b81555a6cfbd7342f780d2fd13d2e91a78afdda8a",
    lib: "libtranscribe.dylib"
  },
  "linux-x64": {
    asset: "transcribe-native-0.2.3-linux-x86_64-cpu-vulkan.tar.gz",
    root: "transcribe-native-linux-x86_64-cpu-vulkan",
    bytes: 23999850,
    sha256: "a35b3c6eb220b825a5bc47ce265b7613be50dbdd7ec487f65c1c86c0e6ff9287",
    lib: "libtranscribe.so"
  },
  "linux-arm64": {
    asset: "transcribe-native-0.2.3-linux-aarch64-cpu-vulkan.tar.gz",
    root: "transcribe-native-linux-aarch64-cpu-vulkan",
    bytes: 20317314,
    sha256: "823081680364643d7afd6e294a879879311ed241a9713beec77185a1000ff773",
    lib: "libtranscribe.so"
  },
  "win32-x64": {
    asset: "transcribe-native-0.2.3-windows-x86_64-cpu-vulkan.tar.gz",
    root: "transcribe-native-windows-x86_64-cpu-vulkan",
    bytes: 20077848,
    sha256: "dac5b6038aaf8777cab541b0f854a79e34f13e5892266229f64c61d34a879e49",
    lib: "transcribe.dll"
  }
};

export const STT_DOWNLOAD_HOSTS = [
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.huggingface.co",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
];

const HOST_SUFFIXES = [".hf.co", ".huggingface.co", ".githubusercontent.com"];

export const STT_STALL_MS = 60000;

const PROGRESS_EVERY_MS = 250;

export function engineAssetFor(platform = process.platform, arch = process.arch) {
  return STT_ENGINE_ASSETS[`${platform}-${arch}`] || null;
}

export function sttPaths(home, { platform = process.platform, arch = process.arch, model = STT_DEFAULT_MODEL } = {}) {
  const dir = join(home, "stt");
  const chosen = sttModel(model);
  const engineDir = join(dir, "engine", STT_ENGINE_VERSION);
  const asset = engineAssetFor(platform, arch);
  return {
    dir,
    engineDir,
    contractPath: join(engineDir, "contract.json"),
    libPath: asset ? join(engineDir, asset.lib) : "",
    enginePartial: join(dir, `engine-${STT_ENGINE_VERSION}.tar.gz.partial`),
    modelPath: join(dir, chosen.file),
    modelPartial: join(dir, `${chosen.file}.partial`),
    handyProof: join(dir, chosen.id === STT_DEFAULT_MODEL ? "handy-model.json" : `handy-${chosen.id}.json`)
  };
}

export function huggingFaceCacheRoot(env = process.env, home = homedir()) {
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE;
  if (env.HF_HOME) return join(env.HF_HOME, "hub");
  return join(home, ".cache", "huggingface", "hub");
}

export function handyModelPath(env = process.env, home = homedir(), model = STT_DEFAULT_MODEL) {
  const chosen = sttModel(model);
  const folder = `models--${chosen.repo.replace("/", "--")}`;
  return join(huggingFaceCacheRoot(env, home), folder, "snapshots", chosen.revision, chosen.file);
}

function sizeOf(path) {
  try { return statSync(path).size; } catch { return 0; }
}

export function modelOnDisk(home, { env = process.env, home: userHome = homedir(), model = STT_DEFAULT_MODEL } = {}) {
  const chosen = sttModel(model);
  const paths = sttPaths(home, { model: chosen.id });
  if (sizeOf(paths.modelPath) === chosen.bytes) return "ready";
  if (sizeOf(handyModelPath(env, userHome, chosen.id)) === chosen.bytes) return "handy";
  if (sizeOf(paths.modelPartial) > 0) return "partial";
  return "none";
}

export function modelFileToLoad(home, { env = process.env, home: userHome = homedir(), model = STT_DEFAULT_MODEL } = {}) {
  const chosen = sttModel(model);
  const paths = sttPaths(home, { model: chosen.id });
  if (sizeOf(paths.modelPath) === chosen.bytes) return paths.modelPath;
  const borrowed = handyModelPath(env, userHome, chosen.id);
  if (sizeOf(borrowed) === chosen.bytes) return borrowed;
  return "";
}

export function engineOnDisk(home, { platform = process.platform, arch = process.arch } = {}) {
  const paths = sttPaths(home, { platform, arch });
  if (!paths.libPath || !existsSync(paths.libPath) || !existsSync(paths.contractPath)) return "none";
  try {
    const contract = JSON.parse(readFileSync(paths.contractPath, "utf8"));
    return contract.version === STT_ENGINE_VERSION ? "ready" : "none";
  } catch {
    return "none";
  }
}

export async function sha256Of(path) {
  const hash = createHash("sha256");
  await new Promise((done, fail) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", fail);
    stream.on("end", done);
  });
  return hash.digest("hex");
}

export function borrowedModelIsWhole(home, { env = process.env, home: userHome = homedir(), model = STT_DEFAULT_MODEL } = {}) {
  const paths = sttPaths(home, { model });
  const borrowed = handyModelPath(env, userHome, model);
  try {
    const proof = JSON.parse(readFileSync(paths.handyProof, "utf8"));
    const live = statSync(borrowed);
    return proof.path === borrowed && proof.mtimeMs === live.mtimeMs && proof.size === live.size;
  } catch {
    return false;
  }
}

export async function proveBorrowedModel(home, { env = process.env, home: userHome = homedir(), model = STT_DEFAULT_MODEL } = {}) {
  const chosen = sttModel(model);
  const paths = sttPaths(home, { model: chosen.id });
  const borrowed = handyModelPath(env, userHome, chosen.id);
  if (sizeOf(borrowed) !== chosen.bytes) return false;
  if (borrowedModelIsWhole(home, { env, home: userHome, model: chosen.id })) return true;
  if (await sha256Of(borrowed) !== chosen.sha256) return false;
  const live = statSync(borrowed);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.handyProof, JSON.stringify({ path: borrowed, mtimeMs: live.mtimeMs, size: live.size }));
  return true;
}

export function hostIsAllowed(rawUrl) {
  let host = "";
  try { host = new URL(rawUrl).hostname.toLowerCase(); } catch { return false; }
  if (STT_DOWNLOAD_HOSTS.includes(host)) return true;
  return HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function startOfRange(value) {
  const match = /bytes\s+(\d+)-/i.exec(String(value || ""));
  return match ? Number(match[1]) : -1;
}

export async function downloadResumable({
  url,
  dest,
  bytes = 0,
  sha256 = "",
  onProgress = () => {},
  signal,
  fetchImpl = fetch,
  stallMs = STT_STALL_MS,
  now = Date.now
}) {
  const partial = `${dest}.partial`;
  mkdirSync(dirname(dest), { recursive: true });
  let already = sizeOf(partial);
  if (bytes && already > bytes) { rmSync(partial, { force: true }); already = 0; }

  const watchdog = new AbortController();
  const onOutsideAbort = () => watchdog.abort();
  if (signal) {
    if (signal.aborted) return { cancelled: true, downloaded: already };
    signal.addEventListener("abort", onOutsideAbort, { once: true });
  }
  let lastByteAt = now();
  const tick = setInterval(() => {
    if (now() - lastByteAt >= stallMs) watchdog.abort();
  }, Math.max(250, Math.min(stallMs, 5000)));
  tick.unref?.();

  let handle = null;
  try {
    const answer = await fetchImpl(url, {
      signal: watchdog.signal,
      headers: already > 0 ? { range: `bytes=${already}-` } : undefined,
      redirect: "follow"
    });
    if (!hostIsAllowed(answer.url || url)) {
      throw Object.assign(new Error(`the download was sent somewhere we do not trust: ${answer.url || url}`), { code: "untrusted" });
    }
    if (answer.status === 416) {
      rmSync(partial, { force: true });
      throw Object.assign(new Error("the part already on disk no longer matches the file"), { code: "restart" });
    }
    if (!answer.ok) {
      throw Object.assign(new Error(`the download answered ${answer.status}`), { code: "http", status: answer.status });
    }
    const resumed = answer.status === 206 && startOfRange(answer.headers.get("content-range")) === already;
    if (already > 0 && !resumed) { rmSync(partial, { force: true }); already = 0; }

    const said = Number(answer.headers.get("content-length") || 0);
    const total = bytes || (resumed ? already + said : said);
    let downloaded = already;
    let toldAt = 0;
    onProgress({ downloaded, total });

    handle = openSync(partial, already > 0 ? "a" : "w");
    for await (const chunk of answer.body) {
      const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      writeSync(handle, piece);
      downloaded += piece.length;
      lastByteAt = now();
      if (lastByteAt - toldAt >= PROGRESS_EVERY_MS) {
        toldAt = lastByteAt;
        onProgress({ downloaded, total });
      }
    }
    closeSync(handle);
    handle = null;
    onProgress({ downloaded, total });

    if (bytes && sizeOf(partial) !== bytes) {
      throw Object.assign(new Error("the file that arrived is not the size it should be"), { code: "short" });
    }
    if (sha256) {
      const seen = await sha256Of(partial);
      if (seen !== sha256) {
        rmSync(partial, { force: true });
        throw Object.assign(new Error("the file that arrived is not the one we asked for"), { code: "corrupt" });
      }
    }
    renameSync(partial, dest);
    return { cancelled: false, downloaded, total };
  } catch (wrong) {
    if (handle !== null) { try { closeSync(handle); } catch {} }
    if (signal?.aborted) return { cancelled: true, downloaded: sizeOf(partial) };
    if (watchdog.signal.aborted) {
      throw Object.assign(new Error("the download went quiet for too long"), { code: "stalled" });
    }
    throw wrong;
  } finally {
    clearInterval(tick);
    signal?.removeEventListener("abort", onOutsideAbort);
  }
}

const BLOCK = 512;

function textAt(block, from, length) {
  const raw = block.subarray(from, from + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function octalAt(block, from, length) {
  const text = textAt(block, from, length).trim();
  return text ? parseInt(text, 8) || 0 : 0;
}

export function readTar(buffer) {
  const files = [];
  let at = 0;
  let longName = "";
  while (at + BLOCK <= buffer.length) {
    const head = buffer.subarray(at, at + BLOCK);
    if (head.every((byte) => byte === 0)) break;
    const prefix = textAt(head, 345, 155);
    const name = longName || (prefix ? `${prefix}/${textAt(head, 0, 100)}` : textAt(head, 0, 100));
    const size = octalAt(head, 124, 12);
    const kind = String.fromCharCode(head[156]) || "0";
    const body = buffer.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (kind === "L") { longName = body.toString("utf8").replace(/\0+$/, ""); continue; }
    longName = "";
    if (kind === "0" || kind === " " || kind === "7") files.push({ name, body, mode: octalAt(head, 100, 8) });
  }
  return files;
}

export function extractTarGz(buffer, into, { strip = 1 } = {}) {
  const written = [];
  for (const file of readTar(gunzipSync(buffer))) {
    const parts = file.name.split("/").filter(Boolean).slice(strip);
    if (!parts.length) continue;
    if (parts.some((part) => part === ".." || part === "." || part.includes("\\") || /^[a-zA-Z]:$/.test(part))) {
      throw Object.assign(new Error(`the archive tried to write outside its folder: ${file.name}`), { code: "unsafe" });
    }
    const path = join(into, ...parts);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.body);
    if (/\.(so|dylib|dll)(\.|$)/.test(path)) { try { chmodSync(path, 0o755); } catch {} }
    written.push(path);
  }
  return written;
}

export async function installEngine({
  home,
  platform = process.platform,
  arch = process.arch,
  onProgress = () => {},
  signal,
  fetchImpl = fetch,
  stallMs = STT_STALL_MS
}) {
  const asset = engineAssetFor(platform, arch);
  if (!asset) {
    throw Object.assign(new Error(`dictation has no engine built for ${platform} ${arch}`), { code: "unsupported" });
  }
  const paths = sttPaths(home, { platform, arch });
  if (engineOnDisk(home, { platform, arch }) === "ready") return { already: true, engineDir: paths.engineDir };

  const tarball = paths.enginePartial.replace(/\.partial$/, "");
  const out = await downloadResumable({
    url: `${STT_ENGINE_RELEASE}/v${STT_ENGINE_VERSION}/${asset.asset}`,
    dest: tarball,
    bytes: asset.bytes,
    sha256: asset.sha256,
    onProgress: ({ downloaded, total }) => onProgress({ what: "engine", downloaded, total }),
    signal,
    fetchImpl,
    stallMs
  });
  if (out.cancelled) return { cancelled: true };

  rmSync(paths.engineDir, { recursive: true, force: true });
  mkdirSync(paths.engineDir, { recursive: true });
  extractTarGz(readFileSync(tarball), paths.engineDir, { strip: 1 });
  rmSync(tarball, { force: true });

  if (engineOnDisk(home, { platform, arch }) !== "ready") {
    throw Object.assign(new Error("the engine unpacked without the pieces we expected"), { code: "incomplete" });
  }
  return { already: false, engineDir: paths.engineDir };
}

export async function installModel({ home, model = STT_DEFAULT_MODEL, onProgress = () => {}, signal, fetchImpl = fetch, stallMs = STT_STALL_MS, env = process.env, userHome = homedir() }) {
  const chosen = sttModel(model);
  const paths = sttPaths(home, { model: chosen.id });
  if (sizeOf(paths.modelPath) === chosen.bytes) return { already: true, path: paths.modelPath };
  if (await proveBorrowedModel(home, { env, home: userHome, model: chosen.id })) {
    return { already: true, borrowed: true, path: handyModelPath(env, userHome, chosen.id) };
  }
  const out = await downloadResumable({
    url: chosen.url,
    dest: paths.modelPath,
    bytes: chosen.bytes,
    sha256: chosen.sha256,
    onProgress: ({ downloaded, total }) => onProgress({ what: "model", model: chosen.id, downloaded, total }),
    signal,
    fetchImpl,
    stallMs
  });
  if (out.cancelled) return { cancelled: true };
  return { already: false, path: paths.modelPath };
}

export function removeModel(home, model) {
  const paths = sttPaths(home, { model });
  for (const path of [paths.modelPath, paths.modelPartial, paths.handyProof]) rmSync(path, { force: true });
  return { removed: paths.modelPath };
}

export function removeStt(home) {
  const paths = sttPaths(home);
  rmSync(paths.dir, { recursive: true, force: true });
  return { removed: paths.dir };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { closeSync, existsSync, ftruncateSync, mkdtempSync, openSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  STT_MODEL, downloadResumable, engineAssetFor, engineOnDisk, extractTarGz, hostIsAllowed,
  installEngine, modelOnDisk, readTar, removeModel, removeStt, sttModel, sttPaths
} from "../lib/stt-download.mjs";

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

const nests = [];

const nest = () => { const made = mkdtempSync(join(tmpdir(), "hive-stt-")); nests.push(made); return made; };

function modelSized(path, bytes) {
  const handle = openSync(path, "w");
  ftruncateSync(handle, bytes);
  closeSync(handle);
}

test.after(() => { for (const one of nests) rmSync(one, { recursive: true, force: true }); });

function tarOf(files) {
  const blocks = [];
  for (const [name, body] of Object.entries(files)) {
    const head = Buffer.alloc(512);
    head.write(name, 0, 100, "utf8");
    head.write("000644 \0", 100, 8, "utf8");
    head.write(body.length.toString(8).padStart(11, "0") + " ", 124, 12, "utf8");
    head.write("0", 156, 1, "utf8");
    head.write("ustar\0" + "00", 257, 8, "utf8");
    const sum = head.reduce((total, byte, at) => total + (at >= 148 && at < 156 ? 32 : byte), 0);
    head.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
    blocks.push(head, Buffer.from(body), Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

async function servingBytes(payload, { failAfter = 0, ranges = true } = {}) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.headers.range || "whole");
    const from = ranges && req.headers.range ? Number(/bytes=(\d+)-/.exec(req.headers.range)?.[1] || 0) : 0;
    const slice = payload.subarray(from);
    res.writeHead(from > 0 && ranges ? 206 : 200, {
      "content-length": String(slice.length),
      ...(from > 0 && ranges ? { "content-range": `bytes ${from}-${payload.length - 1}/${payload.length}` } : {})
    });
    if (failAfter > 0 && slice.length > failAfter) { res.write(slice.subarray(0, failAfter)); return res.destroy(); }
    res.end(slice);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/thing.bin`;
  return { url, hits, stop: () => new Promise((done) => server.close(done)) };
}

const trustLocalhost = (fetchImpl = fetch) => async (url, opts) => {
  const answer = await fetchImpl(url, opts);
  return new Proxy(answer, { get: (on, key) => (key === "url" ? "https://huggingface.co/thing.bin" : Reflect.get(on, key)) });
};

test("a download that finishes lands on the real name with the partial gone", async () => {
  const payload = Buffer.from("o ditado cabe nesta frase repetida ".repeat(400));
  const serving = await servingBytes(payload);
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  const seen = [];
  const out = await downloadResumable({
    url: serving.url, dest, bytes: payload.length, sha256: sha(payload),
    fetchImpl: trustLocalhost(), onProgress: (p) => seen.push(p)
  });
  await serving.stop();
  assert.equal(out.cancelled, false);
  assert.equal(readFileSync(dest).length, payload.length);
  assert.equal(existsSync(`${dest}.partial`), false);
  assert.ok(seen.at(-1).downloaded === payload.length);
});

test("a download picks up from the part already on disk", async () => {
  const payload = Buffer.from("um dois tres quatro ".repeat(500));
  const serving = await servingBytes(payload);
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  mkdirSync(join(home, "stt"), { recursive: true });
  writeFileSync(`${dest}.partial`, payload.subarray(0, 1000));
  const out = await downloadResumable({
    url: serving.url, dest, bytes: payload.length, sha256: sha(payload), fetchImpl: trustLocalhost()
  });
  await serving.stop();
  assert.deepEqual(serving.hits, ["bytes=1000-"]);
  assert.equal(out.downloaded, payload.length);
  assert.deepEqual(readFileSync(dest), payload);
});

test("a server that ignores the range starts the file over instead of gluing bytes", async () => {
  const payload = Buffer.from("recomeca do zero ".repeat(300));
  const serving = await servingBytes(payload, { ranges: false });
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  mkdirSync(join(home, "stt"), { recursive: true });
  writeFileSync(`${dest}.partial`, Buffer.from("lixo antigo"));
  await downloadResumable({ url: serving.url, dest, bytes: payload.length, sha256: sha(payload), fetchImpl: trustLocalhost() });
  await serving.stop();
  assert.deepEqual(readFileSync(dest), payload);
});

test("a file that arrives wrong is thrown away, never kept", async () => {
  const payload = Buffer.from("conteudo trocado no caminho");
  const serving = await servingBytes(payload);
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  await assert.rejects(
    downloadResumable({ url: serving.url, dest, bytes: payload.length, sha256: sha(Buffer.from("outra coisa")), fetchImpl: trustLocalhost() }),
    (wrong) => wrong.code === "corrupt"
  );
  await serving.stop();
  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(`${dest}.partial`), false);
});

test("a download sent to a host we do not trust stops before writing", async () => {
  const payload = Buffer.from("nao confio nisso");
  const serving = await servingBytes(payload);
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  await assert.rejects(
    downloadResumable({ url: serving.url, dest, bytes: payload.length, fetchImpl: fetch }),
    (wrong) => wrong.code === "untrusted"
  );
  await serving.stop();
  assert.equal(existsSync(`${dest}.partial`), false);
});

test("a download that goes quiet for too long gives up and keeps the part", async () => {
  const half = Buffer.alloc(1000, 7);
  const hush = createServer((req, res) => {
    res.writeHead(200, { "content-length": "200000" });
    res.write(half);
  });
  await new Promise((done) => hush.listen(0, "127.0.0.1", done));
  const home = nest();
  const dest = join(home, "stt", "thing.bin");
  let clock = 0;
  await assert.rejects(
    downloadResumable({
      url: `http://127.0.0.1:${hush.address().port}/quiet.bin`, dest, bytes: 200000,
      fetchImpl: trustLocalhost(), stallMs: 300, now: () => (clock += 120)
    }),
    (wrong) => wrong.code === "stalled"
  );
  assert.equal(readFileSync(`${dest}.partial`).length, half.length);
  await new Promise((done) => hush.close(done));
  hush.closeAllConnections?.();
});

test("cancelling keeps the part on disk and reports no error", async () => {
  const payload = Buffer.from("cancelado no meio ".repeat(100));
  const serving = await servingBytes(payload);
  const home = nest();
  const stop = new AbortController();
  stop.abort();
  const out = await downloadResumable({
    url: serving.url, dest: join(home, "stt", "thing.bin"), bytes: payload.length, signal: stop.signal, fetchImpl: trustLocalhost()
  });
  await serving.stop();
  assert.deepEqual(out, { cancelled: true, downloaded: 0 });
});

test("only the hosts that serve our files are trusted", () => {
  assert.equal(hostIsAllowed("https://huggingface.co/a/b"), true);
  assert.equal(hostIsAllowed("https://us.aws.cdn.hf.co/xet-bridge-us/abc"), true);
  assert.equal(hostIsAllowed("https://objects.githubusercontent.com/x"), true);
  assert.equal(hostIsAllowed("https://evil.example.com/whisper.gguf"), false);
  assert.equal(hostIsAllowed("https://huggingface.co.evil.com/x"), false);
  assert.equal(hostIsAllowed("not a url"), false);
});

test("the tar reader hands back each file whole", () => {
  const files = readTar(tarOf({ "top/contract.json": '{"version":"0.2.3"}', "top/libtranscribe.so": "MZ binary" }));
  assert.deepEqual(files.map((one) => one.name), ["top/contract.json", "top/libtranscribe.so"]);
  assert.equal(files[0].body.toString(), '{"version":"0.2.3"}');
});

test("unpacking drops the folder on top and refuses to write outside", () => {
  const into = nest();
  extractTarGz(gzipSync(tarOf({ "top/contract.json": "{}", "top/licenses/LICENSE": "MIT" })), into, { strip: 1 });
  assert.equal(readFileSync(join(into, "contract.json"), "utf8"), "{}");
  assert.equal(readFileSync(join(into, "licenses", "LICENSE"), "utf8"), "MIT");
  assert.throws(
    () => extractTarGz(gzipSync(tarOf({ "top/../../escape.txt": "nope" })), nest(), { strip: 1 }),
    (wrong) => wrong.code === "unsafe"
  );
});

test("a machine with no engine built for it says so instead of guessing", async () => {
  assert.equal(engineAssetFor("sunos", "sparc"), null);
  await assert.rejects(
    installEngine({ home: nest(), platform: "sunos", arch: "sparc" }),
    (wrong) => wrong.code === "unsupported"
  );
});

test("the engine unpacked from a release reads as ready, and a stale version does not", async () => {
  const home = nest();
  const paths = sttPaths(home, { platform: "linux", arch: "x64" });
  mkdirSync(paths.engineDir, { recursive: true });
  writeFileSync(paths.libPath, "so");
  writeFileSync(paths.contractPath, JSON.stringify({ version: "0.2.3" }));
  assert.equal(engineOnDisk(home, { platform: "linux", arch: "x64" }), "ready");
  writeFileSync(paths.contractPath, JSON.stringify({ version: "0.9.9" }));
  assert.equal(engineOnDisk(home, { platform: "linux", arch: "x64" }), "none");
});

test("the model reads as ready only at its full size, and the leftovers read as a part", () => {
  const home = nest();
  const paths = sttPaths(home);
  const elsewhere = { env: { HF_HUB_CACHE: join(home, "no-handy") }, home: join(home, "nobody") };
  assert.equal(modelOnDisk(home, elsewhere), "none");
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.modelPartial, Buffer.alloc(64));
  assert.equal(modelOnDisk(home, elsewhere), "partial");
  modelSized(paths.modelPath, STT_MODEL.bytes);
  assert.equal(modelOnDisk(home, elsewhere), "ready");
});

test("the model the handy already downloaded counts, and is never written to", () => {
  const home = nest();
  const cache = join(home, "hf");
  const folder = join(cache, "models--handy-computer--whisper-medium-gguf", "snapshots", STT_MODEL.revision);
  mkdirSync(folder, { recursive: true });
  modelSized(join(folder, STT_MODEL.file), STT_MODEL.bytes);
  const elsewhere = { env: { HF_HUB_CACHE: cache }, home: join(home, "nobody") };
  assert.equal(modelOnDisk(home, elsewhere), "handy");
  removeStt(home);
  assert.equal(existsSync(join(folder, STT_MODEL.file)), true);
  rmSync(home, { recursive: true, force: true });
});

test("each model has a file of its own, and deleting one leaves the other and the engine alone", () => {
  const home = nest();
  const elsewhere = { env: { HF_HUB_CACHE: join(home, "no-handy") }, home: join(home, "nobody") };
  const whisper = sttPaths(home, { platform: "linux", arch: "x64" });
  const parakeet = sttPaths(home, { platform: "linux", arch: "x64", model: "parakeet-v3" });
  assert.notEqual(whisper.modelPath, parakeet.modelPath);
  assert.equal(whisper.engineDir, parakeet.engineDir, "one engine serves every model");
  mkdirSync(whisper.engineDir, { recursive: true });
  writeFileSync(whisper.contractPath, "{}");
  modelSized(whisper.modelPath, STT_MODEL.bytes);
  modelSized(parakeet.modelPath, sttModel("parakeet-v3").bytes);
  assert.equal(modelOnDisk(home, { ...elsewhere, model: "parakeet-v3" }), "ready");
  removeModel(home, "parakeet-v3");
  assert.equal(modelOnDisk(home, { ...elsewhere, model: "parakeet-v3" }), "none");
  assert.equal(modelOnDisk(home, elsewhere), "ready");
  assert.equal(existsSync(whisper.contractPath), true);
});

test("parakeet borrowed from the handy counts too, from its own folder in the cache", () => {
  const home = nest();
  const cache = join(home, "hf");
  const parakeet = sttModel("parakeet-v3");
  const folder = join(cache, "models--handy-computer--parakeet-tdt-0.6b-v3-gguf", "snapshots", parakeet.revision);
  mkdirSync(folder, { recursive: true });
  modelSized(join(folder, parakeet.file), parakeet.bytes);
  const elsewhere = { env: { HF_HUB_CACHE: cache }, home: join(home, "nobody") };
  assert.equal(modelOnDisk(home, { ...elsewhere, model: "parakeet-v3" }), "handy");
  assert.equal(modelOnDisk(home, elsewhere), "none", "whisper is not there just because parakeet is");
});

test("a model id nobody knows reads as the first model, never as a path", () => {
  assert.equal(sttModel("../../etc/passwd").id, "whisper-medium");
  assert.equal(sttModel(undefined).id, "whisper-medium");
});

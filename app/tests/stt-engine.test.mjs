import test from "node:test";
import assert from "node:assert/strict";
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STT_ERR_BACKEND, STT_BACKEND_CPU, STT_OK, createSttEngine } from "../lib/stt-engine.mjs";
import { STT_MODEL, sttModel, sttPaths } from "../lib/stt-download.mjs";

const AS = { platform: "linux", arch: "x64" };

const noHandy = (home) => ({ env: { HF_HUB_CACHE: join(home, "no-handy") }, userHome: join(home, "nobody") });

const nests = [];

function modelSized(path, bytes) {
  const handle = openSync(path, "w");
  ftruncateSync(handle, bytes);
  closeSync(handle);
}

test.after(() => { for (const nest of nests) rmSync(nest, { recursive: true, force: true }); });

function machineWithEngine({ model = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), "hive-engine-"));
  const paths = sttPaths(home, AS);
  mkdirSync(paths.engineDir, { recursive: true });
  writeFileSync(paths.libPath, "pretend");
  writeFileSync(paths.contractPath, JSON.stringify({ version: "0.2.3" }));
  if (model) modelSized(paths.modelPath, STT_MODEL.bytes);
  nests.push(home);
  return home;
}

function fakeLibrary({ openStatus = () => STT_OK, runStatus = () => STT_OK, text = "o que eu falei" } = {}) {
  const calls = { open: [], files: [], run: [], freed: 0, atOnce: 0, mostAtOnce: 0 };
  const lib = {
    version: () => "0.2.3",
    statusString: (code) => (code === STT_OK ? "ok" : `status ${code}`),
    initBackends: () => STT_OK,
    fullText: () => text,
    freeSession: () => { calls.freed++; },
    backendOf: () => (calls.open.at(-1) === STT_BACKEND_CPU ? "CPU" : "Vulkan1"),
    open(modelPath, backend) {
      calls.open.push(backend);
      calls.files.push(modelPath);
      const status = openStatus(backend, calls.open.length);
      return { status, session: status === STT_OK ? { id: calls.open.length } : null };
    },
    async run(session, pcm, language) {
      calls.run.push({ samples: pcm.length, language, at: Date.now() });
      calls.atOnce += 1;
      calls.mostAtOnce = Math.max(calls.mostAtOnce, calls.atOnce);
      await new Promise((done) => setTimeout(done, 5));
      calls.atOnce -= 1;
      return runStatus(calls.run.length);
    }
  };
  return { lib, calls, bindings: () => lib };
}

const saying = (seconds = 1) => new Float32Array(16000 * seconds).fill(0.1);

test("a machine without the engine says so instead of loading nothing", async () => {
  const home = mkdtempSync(join(tmpdir(), "hive-bare-"));
  nests.push(home);
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fakeLibrary().bindings });
  assert.deepEqual(engine.status(), { engine: "none", active: "whisper-medium", model: "none", loaded: false, backend: null, loadMs: 0 });
  await assert.rejects(engine.load(), (wrong) => wrong.code === "no-engine");
});

test("the engine without its model refuses to load, and says which piece is missing", async () => {
  const home = machineWithEngine({ model: false });
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fakeLibrary().bindings });
  assert.equal(engine.status().engine, "ready");
  await assert.rejects(engine.load(), (wrong) => wrong.code === "no-model");
});

test("the model loads once and stays in memory for the next thing said", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  const first = await engine.transcribe(saying(2), { language: "pt" });
  const second = await engine.transcribe(saying(1), { language: "pt" });
  assert.equal(first.text, "o que eu falei");
  assert.equal(second.backend, "Vulkan1");
  assert.equal(fake.calls.open.length, 1);
  assert.deepEqual(fake.calls.run.map((one) => one.samples), [32000, 16000]);
  assert.deepEqual(fake.calls.run.map((one) => one.language), ["pt", "pt"]);
  assert.equal(engine.status().loaded, true);
});

test("two people talking at once are written down one after the other, never at the same time", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  const both = await Promise.all([engine.transcribe(saying(1)), engine.transcribe(saying(3))]);
  assert.equal(both.length, 2);
  assert.deepEqual(fake.calls.run.map((one) => one.samples), [16000, 48000]);
  assert.equal(fake.calls.mostAtOnce, 1, "the library was asked to write down two things at the same time");
});

test("a run that fails does not wedge the queue for what comes next", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary({ runStatus: (nth) => (nth === 1 ? 3 : STT_OK) });
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  await assert.rejects(engine.transcribe(saying(1)), (wrong) => wrong.code === "run");
  assert.equal((await engine.transcribe(saying(1))).text, "o que eu falei");
});

test("a graphics backend that refuses the model is retried on the processor", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary({ openStatus: (backend) => (backend === STT_BACKEND_CPU ? STT_OK : STT_ERR_BACKEND) });
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  const out = await engine.transcribe(saying(1));
  assert.deepEqual(fake.calls.open, [0, STT_BACKEND_CPU]);
  assert.equal(out.backend, "CPU");
});

test("a graphics backend that gives out mid-run reloads on the processor and finishes the job", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary({ runStatus: (nth) => (nth === 1 ? STT_ERR_BACKEND : STT_OK) });
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  const out = await engine.transcribe(saying(1));
  assert.deepEqual(fake.calls.open, [0, STT_BACKEND_CPU]);
  assert.equal(fake.calls.freed, 1);
  assert.equal(out.text, "o que eu falei");
});

test("silence never reaches the model", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  await assert.rejects(engine.transcribe(new Float32Array(0)), (wrong) => wrong.code === "empty");
  await assert.rejects(engine.transcribe(null), (wrong) => wrong.code === "empty");
  assert.deepEqual(fake.calls.open, []);
});

test("the model leaves memory after sitting idle, and comes back when someone talks", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 30 });
  await engine.transcribe(saying(1));
  assert.equal(engine.status().loaded, true);
  await new Promise((done) => setTimeout(done, 70));
  assert.equal(engine.status().loaded, false);
  assert.equal(fake.calls.freed, 1);
  await engine.transcribe(saying(1));
  assert.equal(fake.calls.open.length, 2);
  engine.close();
});

test("closing lets the model go", async () => {
  const home = machineWithEngine();
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  await engine.transcribe(saying(1));
  engine.close();
  assert.equal(fake.calls.freed, 1);
  assert.equal(engine.status().loaded, false);
});

const realHome = process.env.HIVE_STT_REAL_HOME || "";

const realSound = process.env.HIVE_STT_REAL_WAV || "";

test("the real library writes down a real recording", { skip: !realHome || !realSound ? "set HIVE_STT_REAL_HOME and HIVE_STT_REAL_WAV to run this against the engine on disk" : false }, async () => {
  const { readFileSync } = await import("node:fs");
  const engine = createSttEngine({ home: realHome, idleMs: 0 });
  assert.equal(engine.status().engine, "ready");
  const wav = readFileSync(realSound);
  const shorts = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1);
  const out = await engine.transcribe(Float32Array.from(shorts, (one) => one / 32768), { language: "pt" });
  assert.ok(out.text.length > 0, "the engine came back with nothing to write");
  assert.ok(out.ms > 0);
  assert.ok(out.backend);
  engine.close();
});

test("switching the model lets the old one out of memory and opens the new one on the next thing said", async () => {
  const home = machineWithEngine();
  const parakeet = sttPaths(home, { ...AS, model: "parakeet-v3" });
  modelSized(parakeet.modelPath, sttModel("parakeet-v3").bytes);
  const fake = fakeLibrary();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fake.bindings, idleMs: 0 });
  await engine.transcribe(saying(1));
  assert.equal(engine.choose("whisper-medium"), false, "choosing the model already in use changes nothing");
  assert.equal(engine.choose("parakeet-v3"), true);
  assert.equal(fake.calls.freed, 1);
  assert.equal(engine.status().active, "parakeet-v3");
  await engine.transcribe(saying(1), { language: "pt" });
  assert.deepEqual(fake.calls.files, [sttPaths(home, AS).modelPath, parakeet.modelPath]);
});

test("switching to a model that is not on the machine says so instead of loading the old one", async () => {
  const home = machineWithEngine();
  const engine = createSttEngine({ home, ...AS, ...noHandy(home), bindings: fakeLibrary().bindings, idleMs: 0 });
  engine.choose("parakeet-v3");
  assert.equal(engine.status().model, "none");
  await assert.rejects(engine.load(), (wrong) => wrong.code === "no-model");
});

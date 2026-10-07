import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { SOUND_CEILING, createSttInstaller, registerSttRoutes, soundBody } from "../routes/stt.mjs";

function sttHarness({ config = { stt: true, sttLanguage: "" }, status, transcribe, platform = "linux", arch = "x64", onThePod = () => false } = {}) {
  const routes = [];
  const calls = { transcribe: [], removed: [], started: [], cancelled: 0, unloaded: 0, chosen: [] };
  const installer = {
    start: (model) => { calls.started.push(model); return { started: true }; },
    cancel: () => { calls.cancelled++; return { cancelled: true }; },
    download: null,
    trouble: "",
    busy: false
  };
  const engine = {
    status: () => status || { engine: "ready", model: "ready", loaded: true, backend: "CPU", loadMs: 12 },
    unload: () => { calls.unloaded++; return true; },
    choose: (model) => { calls.chosen.push(model); },
    transcribe: async (pcm, opts) => {
      calls.transcribe.push({ samples: pcm.length, ...opts });
      if (transcribe) return transcribe(pcm, opts);
      return { text: "o que eu falei", ms: 900, backend: "CPU" };
    }
  };
  registerSttRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    readConfig: async () => ({ config }),
    engine,
    installer,
    home: "/tmp/hive-fake",
    platform,
    arch,
    onThePod,
    env: {},
    userHome: "/tmp/hive-fake",
    bodyOf: async (req) => {
      const pieces = [];
      for await (const piece of req) pieces.push(Buffer.from(piece));
      return pieces.length ? JSON.parse(Buffer.concat(pieces).toString("utf8")) : {};
    },
    remove: (home, model) => { calls.removed.push(model); return { removed: `/tmp/hive-fake/stt/${model}.gguf` }; }
  });
  const call = async (method, path, { body = null, query = "" } = {}) => {
    const route = routes.find((one) => one.path === path && (one.method === null || one.method === method));
    assert.ok(route, `no route for ${method} ${path}`);
    const answers = [];
    const req = body ? Readable.from([body]) : Readable.from([]);
    req.body = {};
    await route.handler(req, {}, new URL(`http://hive${path}${query}`), (value, code = 200) => answers.push({ value, code }));
    return answers[0];
  };
  return { routes, calls, installer, call };
}

const soundOf = (samples) => Buffer.from(new Float32Array(samples).fill(0.2).buffer);

test("dictation offers exactly the five things the screen needs", () => {
  const { routes } = sttHarness();
  assert.deepEqual(routes.map((one) => `${one.method} ${one.path}`), [
    "GET /api/stt/status",
    "POST /api/stt/install",
    "POST /api/stt/cancel",
    "POST /api/stt/remove",
    "POST /api/stt/transcribe"
  ]);
});

test("the status says whether it is on, what the model weighs and how it is going", async () => {
  const { value } = await sttHarness().call("GET", "/api/stt/status");
  assert.equal(value.enabled, true);
  assert.equal(value.engine, "ready");
  assert.equal(value.backend, "CPU");
  assert.equal(value.sampleRate, 16000);
  assert.equal(value.model.bytes, 831538144);
  assert.equal(value.model.state, "ready");
  assert.equal(value.unsupported, null);
  assert.equal(value.download, null);
});

test("a machine with no engine built for it says so in the status, and refuses to install", async () => {
  const hive = sttHarness({ platform: "sunos", arch: "sparc" });
  const said = await hive.call("GET", "/api/stt/status");
  assert.match(said.value.unsupported, /no engine built for sunos sparc/);
  const tried = await hive.call("POST", "/api/stt/install");
  assert.equal(tried.code, 409);
  assert.deepEqual(hive.calls.started, []);
});

test("a chat in the fleet is told where dictation does work", async () => {
  const hive = sttHarness({ onThePod: () => true });
  const said = await hive.call("GET", "/api/stt/status");
  assert.match(said.value.unsupported, /fleet has no microphone/);
});

test("nothing is downloaded while the key is off", async () => {
  const hive = sttHarness({ config: { stt: false } });
  const tried = await hive.call("POST", "/api/stt/install");
  assert.equal(tried.code, 403);
  assert.match(tried.value.error, /dictation is off/);
  assert.deepEqual(hive.calls.started, []);
});

test("the key on lets the download start, once", async () => {
  const hive = sttHarness();
  assert.deepEqual((await hive.call("POST", "/api/stt/install")).value, { started: true });
  assert.deepEqual(hive.calls.started, ["whisper-medium"], "with no model named, the one in use comes down");
});

test("the download brings down the model it was asked for, and a model nobody knows falls back to the one in use", async () => {
  const hive = sttHarness({ config: { stt: true, sttModel: "whisper-medium" } });
  await hive.call("POST", "/api/stt/install", { body: JSON.stringify({ model: "parakeet-v3" }) });
  await hive.call("POST", "/api/stt/install", { body: JSON.stringify({ model: "../../etc" }) });
  assert.deepEqual(hive.calls.started, ["parakeet-v3", "whisper-medium"]);
});

test("removing the model in use stops its download, lets it out of memory and deletes only that file", async () => {
  const hive = sttHarness({ config: { stt: true, sttModel: "parakeet-v3" } });
  hive.installer.busy = true;
  hive.installer.download = { what: "model", model: "parakeet-v3", downloaded: 1, total: 2 };
  const out = await hive.call("POST", "/api/stt/remove", { body: JSON.stringify({ model: "parakeet-v3" }) });
  assert.equal(hive.calls.cancelled, 1);
  assert.equal(hive.calls.unloaded, 1);
  assert.deepEqual(hive.calls.removed, ["parakeet-v3"]);
  assert.equal(out.value.removed, "/tmp/hive-fake/stt/parakeet-v3.gguf");
});

test("removing a model that is not in use leaves the one in use loaded and its download running", async () => {
  const hive = sttHarness({ config: { stt: true, sttModel: "whisper-medium" } });
  hive.installer.busy = true;
  hive.installer.download = { what: "model", model: "whisper-medium", downloaded: 1, total: 2 };
  await hive.call("POST", "/api/stt/remove", { body: JSON.stringify({ model: "parakeet-v3" }) });
  assert.equal(hive.calls.cancelled, 0);
  assert.equal(hive.calls.unloaded, 0);
  assert.deepEqual(hive.calls.removed, ["parakeet-v3"]);
});

test("the status lists every model, says which one is in use and hands the choice to the engine", async () => {
  const hive = sttHarness({ config: { stt: true, sttModel: "parakeet-v3" } });
  const { value } = await hive.call("GET", "/api/stt/status");
  assert.deepEqual(value.models.map((one) => [one.id, one.active]), [["whisper-medium", false], ["parakeet-v3", true]]);
  assert.equal(value.model.id, "parakeet-v3");
  assert.equal(value.model.detectsLanguage, false);
  assert.deepEqual(hive.calls.chosen, ["parakeet-v3"]);
});

test("a model in the settings that the hive does not know is treated as the first one", async () => {
  const hive = sttHarness({ config: { stt: true, sttModel: "whisper-gigante" } });
  const { value } = await hive.call("GET", "/api/stt/status");
  assert.equal(value.model.id, "whisper-medium");
});

test("a model that cannot work the language out gets the hive's language when none was picked", async () => {
  const hive = sttHarness({ config: { stt: true, sttLanguage: "", sttModel: "parakeet-v3", language: "pt-BR" } });
  await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(hive.calls.transcribe[0].language, "pt");
  const whisper = sttHarness({ config: { stt: true, sttLanguage: "", sttModel: "whisper-medium", language: "pt-BR" } });
  await whisper.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(whisper.calls.transcribe[0].language, "", "whisper keeps working it out on its own");
});

test("a language picked by hand reaches parakeet untouched", async () => {
  const hive = sttHarness({ config: { stt: true, sttLanguage: "es", sttModel: "parakeet-v3", language: "pt-BR" } });
  await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(hive.calls.transcribe[0].language, "es");
});

test("speech turns into words, and the answer says how long it was", async () => {
  const hive = sttHarness();
  const out = await hive.call("POST", "/api/stt/transcribe", { body: soundOf(32000) });
  assert.equal(out.code, 200);
  assert.equal(out.value.text, "o que eu falei");
  assert.equal(out.value.seconds, 2);
  assert.deepEqual(hive.calls.transcribe, [{ samples: 32000, language: "" }]);
});

test("the language asked for in the address wins over the one in the settings", async () => {
  const hive = sttHarness({ config: { stt: true, sttLanguage: "en" } });
  await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000), query: "?lang=pt" });
  assert.equal(hive.calls.transcribe[0].language, "pt");
  await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(hive.calls.transcribe[1].language, "en");
});

test("speech sent while dictation is off never reaches the model", async () => {
  const hive = sttHarness({ config: { stt: false } });
  const out = await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(out.code, 503);
  assert.deepEqual(hive.calls.transcribe, []);
});

test("speech sent before the model is on the machine says so instead of failing oddly", async () => {
  for (const status of [
    { engine: "none", model: "ready", loaded: false, backend: null, loadMs: 0 },
    { engine: "ready", model: "none", loaded: false, backend: null, loadMs: 0 },
    { engine: "ready", model: "partial", loaded: false, backend: null, loadMs: 0 }
  ]) {
    const hive = sttHarness({ status });
    const out = await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
    assert.equal(out.code, 409);
    assert.deepEqual(hive.calls.transcribe, []);
  }
});

test("a body that is not whole samples is refused instead of read crooked", async () => {
  const hive = sttHarness();
  const out = await hive.call("POST", "/api/stt/transcribe", { body: Buffer.from([1, 2, 3]) });
  assert.equal(out.code, 400);
  assert.deepEqual(hive.calls.transcribe, []);
});

test("more sound than dictation takes at once is refused, not buffered", async () => {
  const hive = sttHarness();
  const out = await hive.call("POST", "/api/stt/transcribe", { body: Buffer.alloc(SOUND_CEILING + 4) });
  assert.equal(out.code, 413);
  assert.deepEqual(hive.calls.transcribe, []);
});

test("an engine that fails mid-word answers with the reason, not a blank", async () => {
  const hive = sttHarness({ transcribe: async () => { throw Object.assign(new Error("the words did not come out"), { code: "run" }); } });
  const out = await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(out.code, 500);
  assert.equal(out.value.code, "run");
});

test("silence comes back as a plain no, not a server fault", async () => {
  const hive = sttHarness({ transcribe: async () => { throw Object.assign(new Error("there was no sound"), { code: "empty" }); } });
  const out = await hive.call("POST", "/api/stt/transcribe", { body: soundOf(16000) });
  assert.equal(out.code, 400);
});

test("sound on the wire is read back as the samples that were sent", async () => {
  const sent = new Float32Array([0.5, -0.25, 1, -1]);
  const { pcm, oversized } = await soundBody(Readable.from([Buffer.from(sent.buffer)]));
  assert.equal(oversized, false);
  assert.deepEqual(Array.from(pcm), Array.from(sent));
});

test("the installer runs one download at a time and reports where it is", async () => {
  const steps = [];
  let letGo = null;
  const installer = createSttInstaller({
    home: "/tmp/hive-fake",
    engine: { status: () => ({ active: "whisper-medium" }), load: async () => ({ loaded: true }) },
    install: async ({ onProgress }) => { onProgress({ what: "engine", downloaded: 10, total: 24 }); await new Promise((done) => { letGo = done; }); },
    model: async ({ onProgress }) => { onProgress({ what: "model", downloaded: 1, total: 831 }); steps.push("model"); }
  });
  assert.deepEqual(installer.start(), { started: true });
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(installer.download, { what: "engine", model: "whisper-medium", name: "Whisper Medium", downloaded: 10, total: 24 });
  assert.deepEqual(installer.start(), { started: false, reason: "it is already downloading" });
  letGo();
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(steps, ["model"]);
  assert.equal(installer.busy, false);
  assert.equal(installer.download, null);
});

test("cancelling the install stops before the model and keeps the reason quiet", async () => {
  const steps = [];
  const installer = createSttInstaller({
    home: "/tmp/hive-fake",
    engine: { load: async () => { steps.push("warm"); } },
    install: async ({ signal }) => { await new Promise((done) => setTimeout(done, 5)); signal.aborted; },
    model: async () => { steps.push("model"); }
  });
  installer.start();
  assert.deepEqual(installer.cancel(), { cancelled: true });
  await new Promise((done) => setTimeout(done, 30));
  assert.deepEqual(steps, []);
  assert.equal(installer.busy, false);
});

test("a model that finishes coming down only warms up if it is still the one in use", async () => {
  const warmed = [];
  const asked = [];
  const installer = createSttInstaller({
    home: "/tmp/hive-fake",
    engine: { status: () => ({ active: "whisper-medium" }), load: async () => { warmed.push("warm"); } },
    install: async () => ({}),
    model: async ({ model }) => { asked.push(model); }
  });
  installer.start("parakeet-v3");
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(asked, ["parakeet-v3"]);
  assert.deepEqual(warmed, [], "the person moved back to whisper while parakeet came down, so parakeet stays on disk");
});

test("a download that breaks leaves the reason where the screen can read it", async () => {
  const installer = createSttInstaller({
    home: "/tmp/hive-fake",
    engine: { load: async () => ({}) },
    install: async () => { throw new Error("the file that arrived is not the one we asked for"); },
    model: async () => ({})
  });
  installer.start();
  await new Promise((done) => setTimeout(done, 20));
  assert.match(installer.trouble, /not the one we asked for/);
  assert.equal(installer.busy, false);
});

test("turning dictation off lets the model out of memory at the next look", async () => {
  const hive = sttHarness({ config: { stt: false } });
  await hive.call("GET", "/api/stt/status");
  assert.equal(hive.calls.unloaded, 1);
});

test("dictation left on keeps the model where it is", async () => {
  const hive = sttHarness();
  await hive.call("GET", "/api/stt/status");
  assert.equal(hive.calls.unloaded, 0);
});

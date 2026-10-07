import { createRequire } from "node:module";
import { STT_DEFAULT_MODEL, engineOnDisk, modelFileToLoad, modelOnDisk, sttModel, sttPaths } from "./stt-download.mjs";

export const STT_OK = 0;

export const STT_ERR_BACKEND = 8;

export const STT_BACKEND_AUTO = 0;

export const STT_BACKEND_CPU = 1;

export const STT_IDLE_MS = 10 * 60 * 1000;

export const STT_SAMPLE_RATE = 16000;

const RUN_PARAMS = {
  struct_size: "uint64",
  task: "int32",
  timestamps: "int32",
  pnc: "int32",
  itn: "int32",
  diarize: "int32",
  language: "void *",
  target_language: "void *",
  keep_special_tags: "bool",
  family: "void *",
  spec_k_drafts: "int32"
};

const LOAD_PARAMS = { struct_size: "uint64", backend: "int32", device: "void *" };

export function koffiBindings(libPath) {
  const koffi = createRequire(import.meta.url)("koffi");
  const lib = koffi.load(libPath);
  const runParams = koffi.struct(`transcribe_run_params_${process.pid}`, RUN_PARAMS);
  const loadParams = koffi.struct(`transcribe_model_load_params_${process.pid}`, LOAD_PARAMS);
  const runParamsInit = lib.func(`void transcribe_run_params_init(${runParams.name} *p)`);
  const loadParamsInit = lib.func(`void transcribe_model_load_params_init(${loadParams.name} *p)`);
  const openSession = lib.func(`int transcribe_open(const char *path, ${loadParams.name} *lp, void *sp, _Out_ void **out)`);
  const runOne = lib.func(`int transcribe_run(void *s, float *pcm, int n, ${runParams.name} *p)`);
  const getModel = lib.func("void *transcribe_get_model(void *s)");

  return {
    version: lib.func("const char *transcribe_version()"),
    statusString: lib.func("const char *transcribe_status_string(int s)"),
    initBackends: lib.func("int transcribe_init_backends(const char *dir)"),
    fullText: lib.func("const char *transcribe_full_text(void *s)"),
    freeSession: lib.func("void transcribe_session_free(void *s)"),
    backendOf: (session) => lib.func("const char *transcribe_model_backend(void *m)")(getModel(session)),
    open(modelPath, backend) {
      const params = koffi.alloc(loadParams, 1);
      loadParamsInit(params);
      if (backend !== STT_BACKEND_AUTO) koffi.encode(params, loadParams, { ...koffi.decode(params, loadParams), backend });
      const out = [null];
      const status = openSession(modelPath, params, null, out);
      return { status, session: out[0] };
    },
    run(session, pcm, language) {
      const params = koffi.alloc(runParams, 1);
      runParamsInit(params);
      const tongue = language ? Buffer.from(`${language}\0`, "utf8") : null;
      if (tongue) koffi.encode(params, runParams, { ...koffi.decode(params, runParams), language: tongue });
      return new Promise((done, fail) => {
        runOne.async(session, pcm, pcm.length, params, (wrong, status) => {
          void tongue;
          void pcm;
          if (wrong) fail(wrong);
          else done(status);
        });
      });
    }
  };
}

export function createSttEngine({
  home,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  userHome,
  bindings = koffiBindings,
  log = () => {},
  idleMs = STT_IDLE_MS,
  now = Date.now
} = {}) {
  const where = { env, ...(userHome ? { home: userHome } : {}) };
  let lib = null;
  let session = null;
  let backend = "";
  let asked = STT_BACKEND_AUTO;
  let loadedAt = 0;
  let idleTimer = null;
  let queue = Promise.resolve();
  let chosen = STT_DEFAULT_MODEL;

  const paths = () => sttPaths(home, { platform, arch });

  function wake() {
    clearTimeout(idleTimer);
    if (!idleMs) return;
    idleTimer = setTimeout(() => unload("it sat idle"), idleMs);
    idleTimer.unref?.();
  }

  function unload(why = "asked to") {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!session) return false;
    try { lib.freeSession(session); } catch (wrong) { log(`stt: the session did not close cleanly (${wrong.message})`); }
    session = null;
    backend = "";
    log(`stt: the model left memory — ${why}`);
    return true;
  }

  function openWith(modelPath, want) {
    const { status, session: born } = lib.open(modelPath, want);
    if (status !== STT_OK) return { status, session: null };
    return { status, session: born };
  }

  function choose(model) {
    const wanted = sttModel(model).id;
    if (wanted === chosen) return false;
    unload(`the model changed to ${wanted}`);
    chosen = wanted;
    asked = STT_BACKEND_AUTO;
    return true;
  }

  async function load() {
    if (session) { wake(); return { loaded: true, backend }; }
    if (engineOnDisk(home, { platform, arch }) !== "ready") {
      throw Object.assign(new Error("the dictation engine is not on this machine yet"), { code: "no-engine" });
    }
    const modelPath = modelFileToLoad(home, { ...where, model: chosen });
    if (!modelPath) {
      throw Object.assign(new Error("the dictation model is not on this machine yet"), { code: "no-model" });
    }
    if (!lib) {
      lib = bindings(paths().libPath);
      const started = lib.initBackends(paths().engineDir);
      if (started !== STT_OK) log(`stt: the backends started with ${lib.statusString(started)}`);
    }
    const startedAt = now();
    let out = openWith(modelPath, asked);
    if (out.status === STT_ERR_BACKEND && asked !== STT_BACKEND_CPU) {
      log("stt: the graphics backend refused the model — falling back to the processor");
      asked = STT_BACKEND_CPU;
      out = openWith(modelPath, asked);
    }
    if (out.status !== STT_OK) {
      throw Object.assign(new Error(`the model did not open: ${lib.statusString(out.status)}`), { code: "open" });
    }
    session = out.session;
    loadedAt = now() - startedAt;
    backend = (() => { try { return lib.backendOf(session); } catch { return "unknown"; } })();
    log(`stt: ${chosen} is in memory on ${backend}, ${loadedAt}ms to load`);
    wake();
    return { loaded: true, backend, ms: loadedAt };
  }

  async function runOnce(pcm, language) {
    await load();
    const startedAt = now();
    let status = await lib.run(session, pcm, language);
    if (status === STT_ERR_BACKEND && asked !== STT_BACKEND_CPU) {
      log("stt: the graphics backend gave out mid-run — falling back to the processor");
      unload("the backend gave out");
      asked = STT_BACKEND_CPU;
      await load();
      status = await lib.run(session, pcm, language);
    }
    if (status !== STT_OK) {
      throw Object.assign(new Error(`the words did not come out: ${lib.statusString(status)}`), { code: "run" });
    }
    const text = String(lib.fullText(session) || "").trim();
    wake();
    return { text, ms: now() - startedAt, backend };
  }

  function transcribe(pcm, { language = "" } = {}) {
    if (!(pcm instanceof Float32Array) || pcm.length === 0) {
      return Promise.reject(Object.assign(new Error("there was no sound to write down"), { code: "empty" }));
    }
    const mine = queue.then(() => runOnce(pcm, language), () => runOnce(pcm, language));
    queue = mine.catch(() => {});
    return mine;
  }

  function status() {
    return {
      engine: engineOnDisk(home, { platform, arch }),
      active: chosen,
      model: modelOnDisk(home, { ...where, model: chosen }),
      loaded: !!session,
      backend: backend || null,
      loadMs: session ? loadedAt : 0
    };
  }

  return {
    status,
    choose,
    load,
    transcribe,
    unload: () => unload("asked to"),
    close() { unload("the hive is closing"); lib = null; }
  };
}

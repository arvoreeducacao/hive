import { STT_MODELS, engineAssetFor, installEngine, installModel, modelOnDisk, removeModel, sttModel } from "../lib/stt-download.mjs";
import { STT_SAMPLE_RATE } from "../lib/stt-engine.mjs";

export const SOUND_CEILING = 30 << 20;

export async function soundBody(req, ceiling = SOUND_CEILING) {
  const pieces = [];
  let size = 0;
  for await (const piece of req) {
    size += piece.length;
    if (size > ceiling) { req.destroy(); return { oversized: true, pcm: null }; }
    pieces.push(piece);
  }
  const whole = Buffer.concat(pieces);
  if (whole.length < 4 || whole.length % 4 !== 0) return { oversized: false, pcm: null };
  const aligned = whole.byteOffset % 4 === 0 ? whole : Buffer.from(whole);
  return { oversized: false, pcm: new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4) };
}

export function createSttInstaller({ home, engine, log = () => {}, install = installEngine, model = installModel }) {
  let running = null;
  let progress = null;
  let stopper = null;
  let trouble = "";

  async function all(wanted) {
    const onProgress = (step) => { progress = { ...step, model: wanted, name: sttModel(wanted).name }; };
    await install({ home, onProgress, signal: stopper.signal });
    if (stopper.signal.aborted) return;
    await model({ home, model: wanted, onProgress, signal: stopper.signal });
    if (stopper.signal.aborted) return;
    if (engine.status().active !== wanted) return;
    await engine.load().catch((wrong) => log(`stt: the model did not warm up (${wrong.message})`));
  }

  return {
    start(wanted = STT_MODELS[0].id) {
      if (running) return { started: false, reason: "it is already downloading" };
      trouble = "";
      progress = { what: "engine", model: wanted, downloaded: 0, total: 0 };
      stopper = new AbortController();
      running = all(wanted)
        .catch((wrong) => { trouble = wrong.message; log(`stt: the download stopped — ${wrong.message}`); })
        .finally(() => { running = null; progress = null; stopper = null; });
      return { started: true };
    },
    cancel() {
      if (!running) return { cancelled: false };
      stopper.abort();
      return { cancelled: true };
    },
    get download() { return running ? progress : null; },
    get trouble() { return trouble; },
    get busy() { return !!running; }
  };
}

export function registerSttRoutes(on, context) {
  const {
    readConfig,
    engine,
    installer,
    home,
    platform = process.platform,
    arch = process.arch,
    onThePod = () => false,
    remove = removeModel,
    bodyOf = async () => ({}),
    env = process.env,
    userHome,
    log = () => {}
  } = context;

  const where = { env, ...(userHome ? { home: userHome } : {}) };

  const unsupported = () => {
    if (onThePod()) return "a chat in the fleet has no microphone of its own — turn dictation on in a chat on your machine";
    if (!engineAssetFor(platform, arch)) return `dictation has no engine built for ${platform} ${arch} yet`;
    return null;
  };

  const known = (id) => STT_MODELS.some((one) => one.id === id);

  const settings = async () => {
    const { config } = await readConfig();
    const model = known(config.sttModel) ? config.sttModel : STT_MODELS[0].id;
    engine.choose?.(model);
    return {
      on: config.stt === true,
      language: config.sttLanguage || "",
      mic: typeof config.sttMic === "string" ? config.sttMic : "",
      model,
      spoken: String(config.language || "en").slice(0, 2).toLowerCase()
    };
  };

  const languageFor = (said, asked) => {
    const language = asked || said.language;
    if (language || sttModel(said.model).detectsLanguage) return language;
    return said.spoken;
  };

  const catalog = (said) => STT_MODELS.map((one) => ({
    id: one.id,
    name: one.name,
    quant: one.quant,
    bytes: one.bytes,
    detectsLanguage: one.detectsLanguage,
    active: one.id === said.model,
    state: modelOnDisk(home, { ...where, model: one.id })
  }));

  const wantedModel = async (req, said) => {
    const body = await bodyOf(req).catch(() => ({}));
    return known(body?.model) ? body.model : said.model;
  };

  on("GET", "/api/stt/status", async (req, res, url, json) => {
    const said = await settings();
    if (!said.on && engine.status().loaded) {
      engine.unload();
      log("stt: dictation was turned off, so the model left memory");
    }
    const live = engine.status();
    return json({
      enabled: said.on,
      language: said.language,
      mic: said.mic,
      unsupported: unsupported(),
      sampleRate: STT_SAMPLE_RATE,
      engine: live.engine,
      model: {
        id: said.model,
        state: live.model,
        name: sttModel(said.model).name,
        quant: sttModel(said.model).quant,
        bytes: sttModel(said.model).bytes,
        detectsLanguage: sttModel(said.model).detectsLanguage
      },
      models: catalog(said),
      loaded: live.loaded,
      backend: live.backend,
      loadMs: live.loadMs,
      download: installer.download,
      trouble: installer.trouble
    });
  });

  on("POST", "/api/stt/install", async (req, res, url, json) => {
    const said = await settings();
    if (!said.on) return json({ error: "dictation is off — turn it on first" }, 403);
    const why = unsupported();
    if (why) return json({ error: why }, 409);
    return json(installer.start(await wantedModel(req, said)));
  });

  on("POST", "/api/stt/cancel", async (req, res, url, json) => json(installer.cancel()));

  on("POST", "/api/stt/remove", async (req, res, url, json) => {
    const said = await settings();
    const model = await wantedModel(req, said);
    if (installer.busy && installer.download?.model === model) installer.cancel();
    if (model === said.model) engine.unload();
    const gone = remove(home, model);
    log(`stt: ${model} was removed from ${gone.removed}`);
    return json({ ...gone, model: modelOnDisk(home, { ...where, model }) });
  });

  on("POST", "/api/stt/transcribe", async (req, res, url, json) => {
    const said = await settings();
    if (!said.on) return json({ error: "dictation is off" }, 503);
    const live = engine.status();
    if (live.engine !== "ready" || live.model === "none" || live.model === "partial") {
      return json({ error: "dictation is not ready on this machine yet" }, 409);
    }
    const { oversized, pcm } = await soundBody(req);
    if (oversized) return json({ error: "that is more sound than dictation takes at once" }, 413);
    if (!pcm) return json({ error: "that was not sound the way we send it" }, 400);
    const language = String(languageFor(said, url.searchParams.get("lang")) || "");
    try {
      const out = await engine.transcribe(pcm, { language });
      return json({ ...out, seconds: pcm.length / STT_SAMPLE_RATE });
    } catch (wrong) {
      const code = wrong.code === "empty" ? 400 : 500;
      return json({ error: wrong.message, code: wrong.code || "run" }, code);
    }
  });
}

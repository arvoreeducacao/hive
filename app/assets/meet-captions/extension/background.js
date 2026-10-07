const ext = globalThis.browser || globalThis.chrome;
if (typeof importScripts === "function" && !globalThis.AveiaDestinations) importScripts("aveia-origin.js", "destinations.js", "caption-language.js");
const HOST = "dev.hive.captions";
const LOCAL_SCRIPT = "aveia-connect-local";
let port = null;
let seq = 0;
let localScript = null;
const waiting = new Map();

function open() {
  if (port) return port;
  try { port = ext.runtime.connectNative(HOST); } catch { port = null; return null; }
  port.onMessage.addListener((said) => {
    const done = waiting.get(said && said.id);
    if (!done) return;
    waiting.delete(said.id);
    done(said);
  });
  port.onDisconnect.addListener(() => {
    void ext.runtime.lastError;
    port = null;
    for (const done of waiting.values()) done({ error: "no-host" });
    waiting.clear();
  });
  return port;
}

function ask(body) {
  return new Promise((done) => {
    const line = open();
    if (!line) return done({ error: "no-host" });
    const id = ++seq;
    const giveUp = setTimeout(() => { waiting.delete(id); done({ error: "timeout" }); }, 8000);
    waiting.set(id, (said) => { clearTimeout(giveUp); done(said); });
    try { line.postMessage({ id, ...body }); } catch { clearTimeout(giveUp); waiting.delete(id); port = null; done({ error: "no-host" }); }
  });
}

const area = (name) => ({ get: (key) => ext.storage[name].get(key), set: (items) => ext.storage[name].set(items) });
const router = globalThis.AveiaDestinations.createRouter({
  askHive: ask,
  fetch: (url, init) => fetch(url, init),
  storage: area("local"),
  memory: area(ext.storage.session ? "session" : "local")
});

async function watchLocal() {
  const origins = globalThis.AveiaOrigin.LOCAL_PATTERNS;
  let allowed = false;
  try { allowed = await ext.permissions.contains({ origins }); } catch {}
  const files = ["aveia-origin.js", "aveia-connect.js"];
  if (ext.scripting && ext.scripting.registerContentScripts) {
    let known = [];
    try { known = await ext.scripting.getRegisteredContentScripts({ ids: [LOCAL_SCRIPT] }); } catch {}
    if (allowed && !known.length) await ext.scripting.registerContentScripts([{ id: LOCAL_SCRIPT, matches: origins, js: files, runAt: "document_start" }]).catch(() => {});
    if (!allowed && known.length) await ext.scripting.unregisterContentScripts({ ids: [LOCAL_SCRIPT] }).catch(() => {});
    return allowed;
  }
  if (ext.contentScripts && ext.contentScripts.register) {
    if (allowed && !localScript) localScript = await ext.contentScripts.register({ matches: origins, js: files.map((file) => ({ file })), runAt: "document_start" }).catch(() => null);
    if (!allowed && localScript) { await localScript.unregister().catch(() => {}); localScript = null; }
  }
  return allowed;
}

const tongue = globalThis.AveiaCaptionLanguage;

async function withLanguage(said) {
  if (!said || said.error) return said;
  let kept;
  try { kept = (await ext.storage.local.get("captionLanguage")).captionLanguage; } catch {}
  return { ...said, captionLanguage: tongue.prefOf(kept) };
}

const here = (message, sender) => ({ captions: !!message.captions, inCall: !!message.inCall, tab: sender.tab ? sender.tab.id : 0 });

const ACTS = {
  "aveia-captions": async (message, sender) => withLanguage(await router.beat({ captions: !!message.captions, inCall: !!message.inCall, lines: Array.isArray(message.lines) ? message.lines : [], sentAt: message.sentAt, command: message.command || "", title: message.title || "", tab: sender.tab ? sender.tab.id : 0 })),
  "aveia-targets": async (message, sender) => withLanguage(await router.setTargets(message.targets || {}, { ...here(message, sender), title: message.title || "" })),
  "aveia-state": async (message, sender) => withLanguage(await router.look({ refresh: message.refresh === true, ...here(message, sender) })),
  "aveia-language": async (message, sender) => {
    await ext.storage.local.set({ captionLanguage: tongue.prefOf(message.language) });
    return withLanguage(await router.look(here(message, sender)));
  },
  "aveia-sign-out": () => router.signOut(),
  "aveia-local": async () => ({ local: await watchLocal() })
};

ext.runtime.onMessage.addListener((message, sender, respond) => {
  const act = message && ACTS[message.type];
  if (!act || sender.id !== ext.runtime.id) return false;
  Promise.resolve().then(() => act(message, sender)).then(respond, (wrong) => respond({ error: String(wrong && wrong.message || wrong) }));
  return true;
});

ext.storage.onChanged.addListener((changes, name) => { if (name === "local" && changes.aveia) router.accountChanged(); });
if (ext.permissions && ext.permissions.onAdded) { ext.permissions.onAdded.addListener(watchLocal); ext.permissions.onRemoved.addListener(watchLocal); }
watchLocal();

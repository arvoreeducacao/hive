(function (root) {
  const TOKEN_MIN = 16;
  const TOKEN_MAX = 4096;

  function readHandoff(event, page, originOf) {
    const origin = originOf(page.location.origin);
    if (!origin || !event || event.source !== page || event.origin !== origin) return null;
    const data = event.data;
    if (!data || typeof data !== "object" || data.type !== "aveia-extension-token") return null;
    const token = typeof data.token === "string" ? data.token.trim() : "";
    if (token.length < TOKEN_MIN || token.length > TOKEN_MAX || /\s/.test(token)) return null;
    if (data.baseUrl != null && originOf(data.baseUrl) !== origin) return null;
    return { baseUrl: origin, token, email: typeof data.email === "string" ? data.email.trim().slice(0, 200) : "" };
  }

  function listen({ page, storage, originOf, now = Date.now }) {
    const origin = originOf(page.location.origin);
    if (!origin) return null;
    const heard = async (event) => {
      const handed = readHandoff(event, page, originOf);
      if (!handed) return false;
      try { await storage.set({ aveia: { ...handed, connectedAt: now() } }); } catch { return false; }
      page.postMessage({ type: "aveia-extension-connected" }, origin);
      return true;
    };
    const announce = () => page.postMessage({ type: "aveia-extension-ready" }, origin);
    page.addEventListener("message", heard);
    announce();
    const doc = page.document;
    if (doc && doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", announce, { once: true });
    if (doc && doc.readyState !== "complete") page.addEventListener("load", announce, { once: true });
    return heard;
  }

  const api = { readHandoff, listen };
  root.AveiaConnect = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  const ext = root.browser || root.chrome;
  if (ext && ext.storage && root.AveiaOrigin && typeof root.addEventListener === "function") listen({ page: root.window || root, storage: ext.storage.local, originOf: root.AveiaOrigin.originOf });
})(typeof globalThis !== "undefined" ? globalThis : this);

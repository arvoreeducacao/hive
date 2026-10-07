(function (root) {
  const BUILT_FOR = "__AVEIA_ORIGIN__";
  const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  const LOCAL_PATTERNS = ["http://localhost/*", "http://127.0.0.1/*"];

  function at(address) {
    const DEFAULT_BASE = /^https:\/\/[^\/\s]+$/.test(String(address || "")) ? address : "";

    function originOf(url) {
      let parsed;
      try { parsed = new URL(String(url || "")); } catch { return ""; }
      if (parsed.username || parsed.password) return "";
      if (DEFAULT_BASE && parsed.origin === DEFAULT_BASE) return DEFAULT_BASE;
      if (parsed.protocol === "http:" && LOCAL_HOSTS.includes(parsed.hostname)) return parsed.origin;
      return "";
    }

    const isLocal = (url) => { const origin = originOf(url); return !!origin && origin !== DEFAULT_BASE; };

    return { DEFAULT_BASE, LOCAL_PATTERNS, originOf, isLocal, at };
  }

  const api = at(BUILT_FOR);
  root.AveiaOrigin = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

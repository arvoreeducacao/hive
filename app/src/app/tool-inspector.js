const JSON_READ_MAX = 60000;
const JSON_SHOWN_MAX = 12000;
const ARG_SHOWN_MAX = 4000;
const LINKS_MAX = 30;
const ARGS_HIDDEN = new Set(["run", "write", "agent", "plan", "ask"]);
const JSON_TOKEN = /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b|([{}[\],])/g;
const WEB_QUERY = /^Web search results for query: "([\s\S]*?)"\s*$/m;
const WEB_LINKS = /^Links: (\[[\s\S]*?\])\s*$/m;

const cut = (text, max) => (text.length > max ? `${text.slice(0, max)}\n… (${text.length} chars)` : text);

function jsonOf(text) {
  const said = String(text ?? "").trim();
  if (said.length < 2 || said.length > JSON_READ_MAX || !/^[[{]/.test(said)) return undefined;
  try {
    const value = JSON.parse(said);
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

function prettyJson(text) {
  const value = jsonOf(text);
  return value === undefined ? "" : cut(JSON.stringify(value, null, 2), JSON_SHOWN_MAX);
}

function jsonSpans(text) {
  const said = String(text ?? "");
  const spans = [];
  let last = 0;
  const push = (piece, cls) => {
    if (!piece) return;
    const prev = spans.at(-1);
    if (prev && prev.cls === cls) prev.text += piece;
    else spans.push({ text: piece, cls });
  };
  for (const hit of said.matchAll(JSON_TOKEN)) {
    push(said.slice(last, hit.index), "");
    if (hit[1] !== undefined) {
      push(hit[1], hit[2] ? "json-key" : "json-str");
      if (hit[2]) push(hit[2], "json-punct");
    } else if (hit[3] !== undefined) push(hit[3], "json-num");
    else if (hit[4] !== undefined) push(hit[4], "json-lit");
    else push(hit[5], "json-punct");
    last = hit.index + hit[0].length;
  }
  push(said.slice(last), "");
  return spans;
}

function toolArgs(face, input, server = "", tool = "") {
  if (ARGS_HIDDEN.has(face) || !input || typeof input !== "object" || Array.isArray(input)) return [];
  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (face === "mcp") {
    const rows = [{ key: "server", text: server, json: false }, { key: "tool", text: tool, json: false }];
    if (entries.length) rows.push({ key: "arguments", text: cut(JSON.stringify(input), ARG_SHOWN_MAX), json: true });
    return rows.filter((row) => row.text);
  }
  return entries.map(([key, value]) => {
    const json = typeof value === "object";
    return { key, text: cut(json ? JSON.stringify(value) : String(value), ARG_SHOWN_MAX), json };
  });
}

function safeLink(url) {
  try {
    const parsed = new URL(String(url ?? ""));
    return /^https?:$/.test(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function webResults(text) {
  const said = String(text ?? "");
  const query = WEB_QUERY.exec(said);
  const links = WEB_LINKS.exec(said);
  if (!query || !links) return null;
  let parsed = [];
  try {
    parsed = JSON.parse(links[1]);
  } catch {
    return null;
  }
  const found = (Array.isArray(parsed) ? parsed : []).map((one) => ({
    title: String(one?.title || "").trim(),
    url: safeLink(one?.url),
    snippet: String(one?.snippet || one?.description || "").trim()
  })).filter((one) => one.url).slice(0, LINKS_MAX);
  const rest = said.slice(links.index + links[0].length).trim();
  return { query: query[1], links: found.map((one) => ({ ...one, title: one.title || new URL(one.url).host })), rest };
}

const BROWSER_TOOL = /^mcp__[\w-]*(?:browser|chrome|playwright)[\w-]*__|^mcp__[\w-]+__browser_|^webfetch$/i;
const PRIVATE_HOST = /^(?:localhost|.*\.(?:local|localhost|internal|lan|home|test))$/i;

const isBrowserTool = (name) => BROWSER_TOOL.test(String(name || ""));

function pageOfInput(input) {
  const url = input && typeof input === "object" ? input.url : "";
  return typeof url === "string" ? safeLink(url) : "";
}

function faviconOf(page) {
  const url = safeLink(page);
  if (!url) return "";
  const { hostname, origin } = new URL(url);
  if (!hostname.includes(".") || PRIVATE_HOST.test(hostname) || /^[\d.]+$/.test(hostname) || hostname.includes(":") || hostname.startsWith("[")) return "";
  return `${origin}/favicon.ico`;
}

export { faviconOf, isBrowserTool, jsonSpans, pageOfInput, prettyJson, toolArgs, webResults };

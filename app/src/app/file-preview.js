const TEXT_PREVIEW_BYTES = 1024 * 1024;

const TABLE_COLUMNS = 1024;

const TABLE_ROWS = 2000;

const ARCHIVE_EXTENSIONS = new Set(["zip", "jar"]);

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "ico", "svg"]);

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "ogv"]);

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac"]);

const TEXT_EXTENSIONS = new Set([
  "txt", "log", "json", "jsonc", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "conf", "config", "env", "csv", "tsv", "xml",
  "css", "scss", "sass", "less", "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "py", "pyi", "rb", "go", "rs", "swift",
  "kt", "kts", "java", "c", "h", "cc", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "fish", "sql", "graphql", "gql", "vue",
  "svelte", "r", "lua", "ex", "exs", "erl", "hs", "clj", "dart", "diff", "patch", "lock", "properties", "gradle", "mmd", "mermaid", "rtf"
]);

const TEXT_NAMES = new Set(["dockerfile", "makefile", "gemfile", "rakefile", "license", "readme", ".gitignore", ".gitattributes", ".editorconfig", ".env"]);

const TEXT_MIMES = /^application\/(json|.*\+json|xml|.*\+xml|javascript|x-javascript|yaml|x-yaml|toml|sql)$/;

const GENERIC_MIMES = /^(|application\/octet-stream|binary\/octet-stream|application\/x-download|text\/plain)$/;

const HIGHLIGHT_LANGUAGE = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  py: "python", pyi: "python", rb: "ruby", go: "go", rs: "rust", swift: "swift", kt: "kotlin", kts: "kotlin", java: "java", c: "c", h: "c",
  cc: "cpp", cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash", fish: "bash", sql: "sql",
  graphql: "graphql", gql: "graphql", json: "json", jsonc: "json", jsonl: "json", ndjson: "json", yaml: "yaml", yml: "yaml", toml: "ini",
  ini: "ini", conf: "ini", env: "ini", xml: "xml", html: "xml", htm: "xml", vue: "xml", svelte: "xml", svg: "xml", css: "css", scss: "scss",
  less: "less", md: "markdown", markdown: "markdown", diff: "diff", patch: "diff", r: "r", lua: "lua", ex: "elixir", exs: "elixir",
  erl: "erlang", hs: "haskell", dart: "dart", dockerfile: "dockerfile", makefile: "makefile", gradle: "gradle"
};

const baseNameOf = (name) => String(name || "").split(/[\\/]/).pop() || "";

function extensionOfName(name) {
  const base = baseNameOf(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

function kindByExtension(name) {
  const base = baseNameOf(name).toLowerCase();
  const ext = extensionOfName(name);
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (ext === "pdf") return "pdf";
  if (ext === "htm" || ext === "html") return "html";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (ext === "csv" || ext === "tsv") return "table";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (TEXT_EXTENSIONS.has(ext) || TEXT_NAMES.has(base)) return "text";
  return "";
}

function filePreviewKind(name, mime = "") {
  const type = String(mime || "").toLowerCase().split(";")[0].trim();
  if (/^application\/(zip|x-zip-compressed|java-archive)$/.test(type)) return "archive";
  const byName = kindByExtension(name);
  if (GENERIC_MIMES.test(type)) return byName || (type === "text/plain" ? "text" : "unsupported");
  if (byName === "table" || byName === "archive") return byName;
  if (type === "application/pdf") return "pdf";
  if (type === "text/html") return "html";
  if (type === "text/markdown" || type === "text/x-markdown") return "markdown";
  if (type === "text/csv" || type === "text/tab-separated-values") return "table";
  if (type === "image/svg+xml") return "image";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || TEXT_MIMES.test(type)) return byName && byName !== "unsupported" ? byName : "text";
  return byName || "unsupported";
}

const rendersByDefault = (kind) => kind === "markdown" || kind === "html" || kind === "table";

const highlightLanguageOf = (name) => HIGHLIGHT_LANGUAGE[extensionOfName(name)] || HIGHLIGHT_LANGUAGE[baseNameOf(name).toLowerCase()] || "";

function decodePreviewText(bytes, { cut = false } = {}) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (view.includes(0)) return { error: "binary" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(view, { stream: cut }) };
  } catch {
    return { error: "not-utf8" };
  }
}

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

const withoutFrontMatter = (text) => String(text || "").replace(FRONT_MATTER, "");

function delimiterOf(name, mime, firstLines) {
  const type = String(mime || "").toLowerCase();
  if (type === "text/tab-separated-values" || extensionOfName(name) === "tsv") return "\t";
  const [first = "", second] = String(firstLines || "").split(/\r?\n/);
  const count = (line, mark) => line.split(mark).length - 1;
  const semis = count(first, ";");
  if (semis <= count(first, ",")) return ",";
  if (second === undefined) return ";";
  const commasConsistent = count(second, ",") === count(first, ",") && count(first, ",") > 0;
  return count(second, ";") === semis && !commasConsistent ? ";" : ",";
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const said = String(text || "");
  for (let at = 0; at < said.length; at += 1) {
    const ch = said[at];
    if (quoted) {
      if (ch === "\"" && said[at + 1] === "\"") { cell += "\""; at += 1; }
      else if (ch === "\"") quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === "\"" && !cell) { quoted = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && said[at + 1] === "\n") at += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function previewTable(text, name, mime) {
  const rows = parseDelimited(text, delimiterOf(name, mime, String(text || "").slice(0, 4096)));
  const columns = rows.reduce((most, row) => Math.max(most, row.length), 0);
  return {
    rows: rows.slice(0, TABLE_ROWS).map((row) => row.slice(0, TABLE_COLUMNS)),
    total: rows.length,
    columns,
    cutColumns: columns > TABLE_COLUMNS,
    cutRows: rows.length > TABLE_ROWS
  };
}

export { TABLE_COLUMNS, TABLE_ROWS, TEXT_PREVIEW_BYTES, baseNameOf, decodePreviewText, delimiterOf, extensionOfName, filePreviewKind, highlightLanguageOf, parseDelimited, previewTable, rendersByDefault, withoutFrontMatter };

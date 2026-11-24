import { phrase } from "./i18n.mjs";

const escapeHtml = (s) => String(s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const escapeDecoded = (s) => s
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const decodeHtml = (s) => String(s)
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");

const IMAGE_TARGET = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const SHELF_LINK = /hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)/g;
const SHELF_ALONE = /^hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)$/;
const SHELF_TABS = ["documento", "telas", "plano", "lente"];
const SHELF_TRAIL = /(?:&(?:quot|#39|gt|lt|amp);|[.,;:!?)\]…*~])+$/;
const SEAT_LINK = /hive:\/\/seat\/([A-Za-z0-9._-]{1,80})/g;
const SEAT_ALONE = /^hive:\/\/seat\/([A-Za-z0-9._-]{1,80})\/?$/;

const ICONS = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  wrap: '<path d="m16 16-3 3 3 3"/><path d="M3 12h14.5a1 1 0 0 1 0 7H13"/><path d="M3 19h6"/><path d="M3 5h18"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  diagram: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  important: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 15h.01"/><path d="M12 7v4"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
  insight: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  terminal: '<rect width="20" height="18" x="2" y="3" rx="2"/><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  diff: '<path d="M12 3v14"/><path d="M5 10h14"/><path d="M5 21h14"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  markup: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
};

const icon = (name, cls = "") => `<svg class="md-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const copyIcons = () => `${icon("copy", "md-i-copy")}${icon("check", "md-i-done")}`;

const LANGUAGE_GLYPHS = [
  ["terminal", "green", ["sh", "bash", "zsh", "shell", "console", "shellsession", "fish", "powershell", "ps1", "ps", "bat", "cmd"]],
  ["braces", "yellow", ["json", "jsonc", "json5", "jsonl", "ndjson"]],
  ["database", "blue", ["sql", "mysql", "postgres", "postgresql", "psql", "pgsql", "sqlite", "plsql", "clickhouse"]],
  ["hash", "blue", ["css", "scss", "sass", "less", "stylus", "pcss"]],
  ["markup", "accent", ["html", "htm", "xml", "svg", "vue", "svelte", "astro", "xhtml", "erb", "ejs", "hbs", "handlebars"]],
  ["settings", "", ["yaml", "yml", "toml", "ini", "env", "dotenv", "properties", "conf", "cfg", "editorconfig", "nginx"]],
  ["diff", "", ["diff", "patch", "udiff"]],
  ["box", "blue", ["dockerfile", "docker", "containerfile"]],
  ["diagram", "violet", ["mermaid"]]
];

const LANGUAGE_BADGES = [
  ["TS", "blue", ["ts", "typescript", "tsx", "mts", "cts"]],
  ["JS", "yellow", ["js", "javascript", "jsx", "mjs", "cjs", "node"]],
  ["PY", "blue", ["py", "python", "python3", "ipython", "pyi"]],
  ["GO", "blue", ["go", "golang"]],
  ["RS", "accent", ["rs", "rust"]],
  ["RB", "red", ["rb", "ruby", "rake", "gemspec"]],
  ["EX", "violet", ["ex", "exs", "elixir", "heex", "eex", "leex"]],
  ["JV", "red", ["java"]],
  ["KT", "violet", ["kt", "kts", "kotlin"]],
  ["SW", "accent", ["swift"]],
  ["C", "blue", ["c", "h"]],
  ["C+", "blue", ["cpp", "c++", "cc", "cxx", "hpp", "hh", "hxx"]],
  ["C#", "violet", ["cs", "csharp", "c#"]],
  ["PHP", "violet", ["php"]],
  ["LUA", "blue", ["lua"]],
  ["DT", "blue", ["dart"]],
  ["SC", "red", ["scala", "sc"]],
  ["R", "blue", ["r"]],
  ["ZIG", "yellow", ["zig"]],
  ["HS", "violet", ["hs", "haskell"]],
  ["MD", "", ["md", "markdown", "mdx"]],
  ["GQ", "red", ["graphql", "gql"]],
  ["TF", "violet", ["tf", "hcl", "terraform"]],
  ["ML", "accent", ["ocaml", "ml", "fsharp", "fs"]]
];

const LANGUAGE_LOOKS = new Map([
  ...LANGUAGE_GLYPHS.flatMap(([glyph, tone, names]) => names.map((name) => [name, { glyph, tone }])),
  ...LANGUAGE_BADGES.flatMap(([badge, tone, names]) => names.map((name) => [name, { badge, tone }]))
]);

const FILE_LANGUAGE = { Dockerfile: "dockerfile", Containerfile: "dockerfile", Makefile: "make" };

export function languageLook(lang, title = "") {
  const named = String(lang || "").toLowerCase();
  if (LANGUAGE_LOOKS.has(named)) return LANGUAGE_LOOKS.get(named);
  const base = decodeHtml(String(title || "")).split("/").pop();
  const extension = FILE_LANGUAGE[base] || (/\.([\w+#-]+)$/.exec(base)?.[1] || "").toLowerCase();
  return LANGUAGE_LOOKS.get(extension) || null;
}

function languageIcon(lang, title) {
  const look = languageLook(lang, title);
  if (!look) return title ? icon("file") : "";
  const tone = look.tone ? ` data-tone="${look.tone}"` : "";
  if (look.glyph) return `<svg class="md-i md-lang" data-glyph="${look.glyph}"${tone} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[look.glyph]}</svg>`;
  const size = look.badge.length > 2 ? 6 : 7.5;
  return `<svg class="md-i md-lang md-lang-badge" data-badge="${escapeHtml(look.badge)}"${tone} viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3.5"/><text x="8" y="${look.badge.length > 2 ? 10.4 : 10.9}" text-anchor="middle" font-size="${size}" font-weight="700">${escapeHtml(look.badge)}</text></svg>`;
}

const shelfAnchor = (slug, tail, shown) => {
  const raw = String(tail || "");
  const cut = raw.indexOf("#");
  const at = cut < 0 ? "" : raw.slice(cut + 1).replace(/[^\w-]/g, "");
  const asked = new URLSearchParams((cut < 0 ? raw : raw.slice(0, cut)).replace(/^\?/, "").replaceAll("&amp;", "&"));
  const tab = SHELF_TABS.includes(asked.get("tab")) ? asked.get("tab") : "";
  const version = Number(asked.get("v")) > 0 ? String(Number(asked.get("v"))) : "";
  return `<a href="#" class="md-shelf" data-slug="${slug}" data-tab="${tab}" data-v="${version}" data-at="${at}" title="${phrase("opens the page in a seat of its own")}">${shown}</a>`;
};

const seatAnchor = (name, shown) => `<a href="#" class="md-seat" data-seat="${name}">${shown}</a>`;

const fileAnchor = (target, shown) => `<a href="#" class="md-file" data-path="${target}">${shown}</a>`;

const POSITION_SUFFIX = /:\d+(?::\d+)?$/;
const LINE_ANCHOR = /#L(\d+)(?:C\d+)?(?:-L?\d+)?$/;
const HOST_TLDS = /^(?:com|net|org|io|dev|app|ai|co|edu|gov|info|biz|xyz|me|tv|cc|gg|chat|cloud|site|online|tech|store|link|uk|de|fr|nl|eu|us|ca|au|jp|br|ru|cn)$/i;
const VERSION_TAIL = /\d\.\d[^.]*$/;
const BARE_FILES = new Set(["Makefile", "Dockerfile", "Containerfile", "Justfile", "Gemfile", "Procfile", "Brewfile", "Rakefile", "Jenkinsfile", "LICENSE", "README", "CHANGELOG", "CODEOWNERS"]);
const PATH_SHAPE = /^(?:[~.]{0,2}(?:\/[\p{L}\p{N}_@.+-]+)+|[\p{L}\p{N}_@.+-]+(?:\/[\p{L}\p{N}_@.+-]+)*)$/u;

const looksLikeHost = (segment) => {
  if (segment === "localhost" || /^\d+(?:\.\d+)+$/.test(segment)) return true;
  const labels = segment.toLowerCase().split(".");
  return labels.length >= 2 && HOST_TLDS.test(labels.at(-1));
};

export function filePathCandidate(raw) {
  const said = String(raw ?? "").trim().replace(LINE_ANCHOR, (m, line) => `:${line}`);
  const bare = said.replace(POSITION_SUFFIX, "");
  if (!bare || /[\s`<>"'|*$\\]/.test(said) || /^[A-Za-z][\w+.-]*:/.test(bare)) return null;
  if (!bare.includes("/") && bare === said) return null;
  if (bare.endsWith("/") || bare.includes("//") || !PATH_SHAPE.test(bare)) return null;
  const base = bare.split("/").pop();
  if (!BARE_FILES.has(base) && (!/\.[\p{L}\p{N}_-]+$/u.test(base) || VERSION_TAIL.test(base))) return null;
  const explicit = bare.startsWith("/") || /^(?:~|\.{1,2})\//.test(bare);
  if (!explicit && looksLikeHost(bare.split("/")[0])) return null;
  return said;
}

const emphasis = (s) => s
  .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
  .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
  .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

function codeSpan(text) {
  const chip = `<code>${text}</code>`;
  const alone = SHELF_ALONE.exec(String(text).trim());
  if (alone) return shelfAnchor(alone[1], alone[2], chip);
  const seat = SEAT_ALONE.exec(String(text).trim());
  if (seat) return seatAnchor(seat[1], chip);
  const path = filePathCandidate(decodeHtml(text));
  return path ? `<code class="md-pathish" data-path="${escapeDecoded(path)}">${text}</code>` : chip;
}

const mathSpan = (tex, display) => {
  const source = display ? `$$${tex}$$` : `$${tex}$`;
  return `<span class="md-math" data-tex="${tex}" data-md-copy="${source}">${source}</span>`;
};

const INLINE_MATH = /\$\$([^$\n]+?)\$\$|(^|[^\\$\w])\$(?=[^\s$])([^$\n]*?[^\s\\$])\$(?![\w$])/g;
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|~$>])/g;

function inline(text) {
  const kept = [];
  const hold = (html, mark) => {
    kept.push(html);
    return `${mark}${kept.length - 1}${mark}`;
  };
  let out = text
    .replace(/``\s?([^\n]+?)\s?``|`([^`\n]+)`/g, (m, wide, narrow) => hold(codeSpan(wide ?? narrow), "\x00"))
    .replace(ESCAPED, (m, one) => hold(one, "\x03"))
    .replace(INLINE_MATH, (m, wide, lead, narrow) => wide !== undefined ? hold(mathSpan(wide, true), "\x02") : `${lead}${hold(mathSpan(narrow, false), "\x02")}`);
  const keep = (html) => hold(html, "\x01");
  out = out
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, target) => {
      if (/^https?:\/\//i.test(target)) return keep(`<a href="${target}" target="_blank" rel="noreferrer">${alt || target}</a>`);
      if (IMAGE_TARGET.test(target)) return keep(`<a href="#" class="md-shot" data-path="${target}" title="${target}">${alt || target.split("/").pop()}</a>`);
      return m;
    })
    .replace(/\[([^\]\n]+)\]\(hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})((?:\?[\w=&;-]*)?(?:#[\w-]+)?)\)/g, (m, label, slug, tail) =>
      keep(shelfAnchor(slug, tail, emphasis(label))))
    .replace(/\[([^\]\n]+)\]\(hive:\/\/seat\/([A-Za-z0-9._-]{1,80})\/?\)/g, (m, label, name) => keep(seatAnchor(name, emphasis(label))))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) =>
      keep(`<a href="${url}" target="_blank" rel="noreferrer">${emphasis(label)}</a>`))
    .replace(/(^|[^!])\[([^\]\n]+)\]\((?:&lt;([^)\n]+?)&gt;|([^)\s]+))\)/g, (m, lead, label, angled, target) => {
      const wanted = decodeHtml(angled ?? target).replace(/^file:\/\//i, "");
      let path = wanted;
      try { path = decodeURIComponent(wanted); } catch {}
      const file = filePathCandidate(path);
      return file ? lead + keep(fileAnchor(escapeDecoded(file), emphasis(label))) : m;
    })
    .replace(SHELF_LINK, (whole, slug) => {
      const clean = whole.replace(SHELF_TRAIL, "");
      const trimmed = clean.slice(`hive://shelf/${slug}`.length);
      return keep(shelfAnchor(slug, trimmed, clean)) + whole.slice(clean.length);
    })
    .replace(SEAT_LINK, (whole, name) => {
      const clean = name.replace(/[.]+$/, "");
      return keep(seatAnchor(clean, `hive://seat/${clean}`)) + name.slice(clean.length);
    })
    .replace(/file:\/\/(\/[^\s<>"'\x00\x01)\]]+\.(?:png|jpe?g|gif|webp|bmp|avif|svg))\b/gi, (m, target) => {
      let path = target;
      try { path = escapeDecoded(decodeURIComponent(target)); } catch {}
      return keep(`<a href="#" class="md-shot" data-path="${path}" title="${path}">${path.split("/").pop()}</a>`);
    })
    .replace(/file:\/\/(\/[^\s<>"'\x00\x01\x02)\]]+)/gi, (m, target) => {
      const clean = target.replace(/[.,;:!?)\]…*~]+$/, "");
      let path = clean;
      try { path = decodeURIComponent(decodeHtml(clean)); } catch {}
      const file = filePathCandidate(path);
      return file ? keep(fileAnchor(escapeDecoded(file), `file://${clean}`)) + target.slice(clean.length) : m;
    })
    .replace(/https?:\/\/[^\s\x00\x01\x02\x03]+/g, (url) => {
      const clean = url.replace(/(?:&(?:quot|#39|gt|lt|amp);|[.,;:!?)\]…*~])+$/, "");
      if (!clean.slice(8).length) return url;
      return keep(`<a href="${clean}" target="_blank" rel="noreferrer">${clean}</a>`) + url.slice(clean.length);
    });
  out = emphasis(out);
  for (let round = 0; round < 3 && /[\x00-\x03]\d+[\x00-\x03]/.test(out); round++) {
    out = out.replace(/([\x00-\x03])(\d+)\1/g, (m, mark, i) => kept[Number(i)]);
  }
  return out;
}

const DIFF_LANG = /^(?:diff|patch|udiff)$/i;
const DIFF_FRAME = /^(?:\+\+\+|---|@@|diff |index |new file|deleted file|rename |similarity )/;

const diffClass = (line) => {
  if (DIFF_FRAME.test(line)) return "ctx";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
};

const diffBody = (code) => code
  .map((line) => `<span class="${diffClass(line)}">${line || "&#8203;"}</span>`)
  .join("");

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const TITLE_ATTR = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i;
const FILE_TOKEN = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/;

function fenceInfo(raw) {
  const info = decodeHtml(raw).trim();
  const [first = "", ...rest] = info.split(/\s+/);
  const lang = first.replace(/^\{?\.?/, "").replace(/\}$/, "").replace(/[^\w#+.-]/g, "");
  const meta = rest.join(" ");
  const attr = TITLE_ATTR.exec(meta);
  const title = attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? rest.find((one) => FILE_TOKEN.test(one)) ?? "";
  return { lang, title: escapeDecoded(title) };
}

const widthOf = (lead) => lead.replace(/\t/g, "    ").length;

const dedent = (line, width) => {
  let at = 0;
  let taken = 0;
  while (at < line.length && taken < width && (line[at] === " " || line[at] === "\t")) {
    taken += line[at] === "\t" ? 4 : 1;
    at++;
  }
  return line.slice(at);
};

const isShellBox = (code) => {
  const lines = code.filter((line) => line.trim());
  return lines.length === 1 && /^!{1,2}\s*[^\s!]/.test(lines[0].trim());
};

const shellTools = () => `<button type="button" class="md-tochat" title="${phrase("put it in the box, ! included, to edit before running")}">${phrase("copy to chat")}</button>`
  + `<button type="button" class="md-run" title="${phrase("run it in this chat, as if you typed it")}">${phrase("run")}</button>`;

const codeTools = (mermaid, open, shell = false) => {
  const wrap = `<button type="button" class="md-wrap" aria-pressed="true" title="${phrase("Disable line wrap")}" aria-label="${phrase("Disable line wrap")}">${icon("wrap")}</button>`;
  const view = mermaid && !open ? `<button type="button" class="md-view" title="${phrase("Show code")}" aria-label="${phrase("Show code")}">${icon("code", "md-i-code")}${icon("diagram", "md-i-diagram")}</button>` : "";
  const copy = `<button type="button" class="md-copy" title="${phrase("Copy code")}" aria-label="${phrase("Copy code")}">${copyIcons()}</button>`;
  return `<span class="md-codeacts" role="toolbar" aria-label="${phrase("Code block actions")}">${wrap}${view}${copy}${shell ? shellTools() : ""}</span>`;
};

function codeBox({ lang, title, code, open }) {
  const diff = DIFF_LANG.test(lang);
  const mermaid = /^mermaid$/i.test(lang);
  const shown = title || lang || "text";
  const name = `<span class="md-codetitle">${languageIcon(lang, title)}<span class="md-codename">${shown}</span></span>`;
  const shell = !diff && !open && isShellBox(code);
  const flags = `${title ? ` data-title="${title}"` : ""}${mermaid ? " data-mermaid" : ""}${open ? " data-open" : ""}${shell ? " data-shell" : ""}`;
  const pre = `<pre class="md-code${diff ? " md-diff" : ""}" data-lang="${lang}">${diff ? diffBody(code) : code.join("\n")}</pre>`;
  return `<div class="md-codebox" data-lang="${lang}" data-wrap="true"${flags}><div class="md-codehead">${name}${codeTools(mermaid, open, shell)}</div>${pre}</div>`;
}

const mathBlock = (tex, open) => `<div class="md-math md-math-display" data-tex="${tex}" data-display${open ? " data-open" : ""} data-md-copy="$$\n${tex}\n$$"><span class="md-math-src">$$\n${tex}\n$$</span></div>`;

const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const isTableRule = (line) => TABLE_RULE.test(line) && line.includes("|") || /^\s*\|\s*:?-+:?\s*\|\s*$/.test(line);
const isTableRow = (line) => /\|/.test(line) && !!line.trim();
const cells = (line) => line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
const alignOf = (rule) => cells(rule).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
const alignAttr = (align) => (align ? ` data-align="${align}"` : "");

const tableHtml = (head, aligns, rows) => {
  const width = head.length;
  const row = (one, tag) => Array.from({ length: width }, (_, at) => `<${tag}${alignAttr(aligns[at])}>${inline(one[at] ?? "")}</${tag}>`).join("");
  const body = rows.map((one) => `<tr>${row(one, "td")}</tr>`).join("");
  const copy = `<button type="button" class="md-table-copy" aria-haspopup="menu" title="${phrase("Copy table")}" aria-label="${phrase("Copy table")}">${copyIcons()}</button>`;
  return `<div class="md-table"><div class="md-table-scroll"><table><thead><tr>${row(head, "th")}</tr></thead><tbody>${body}</tbody></table></div><div class="md-tablebar">${copy}</div></div>`;
};

const ALERTS = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};
const ALERT_MARK = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;
const INSIGHT_OPEN = /^ {0,3}(`?)★ Insight[ \t]+─{3,}\1[ \t]*$/;
const INSIGHT_CLOSE = /^ {0,3}(`?)─{3,}\1[ \t]*$/;

const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^[ \t]*&gt;[ \t]?/;
const DETAILS_OPEN = /^[ \t]*&lt;details(\s+open(?:=(?:&quot;)?\w*(?:&quot;)?)?)?\s*&gt;(.*)$/i;
const DETAILS_CLOSE = /&lt;\/details\s*&gt;\s*$/i;
const SUMMARY = /^[ \t]*&lt;summary&gt;(.*?)&lt;\/summary&gt;\s*$/i;
const SUMMARY_TAGS = { code: "`", b: "**", strong: "**", i: "*", em: "*" };
const summaryMarkdown = (text) => text.replace(/&lt;\/?(code|b|strong|i|em)&gt;/gi, (tag, name) => SUMMARY_TAGS[name.toLowerCase()]);
const MATH_FENCE = /^[ \t]*\$\$/;

function startsBlock(lines, i) {
  const line = lines[i];
  return FENCE_OPEN.test(line) && fenceAt(line)
    || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST_ITEM.test(line)
    || MATH_FENCE.test(line) || DETAILS_OPEN.test(line) || INSIGHT_OPEN.test(line)
    || (isTableRow(line) && isTableRule(lines[i + 1] || ""));
}

function fenceAt(line) {
  const hit = FENCE_OPEN.exec(line);
  if (!hit) return null;
  if (hit[2][0] === "`" && hit[3].includes("`")) return null;
  return { lead: widthOf(hit[1]), mark: hit[2], info: hit[3] };
}

const closesFence = (line, mark) => {
  const hit = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!hit && hit[1][0] === mark[0] && hit[1].length >= mark.length;
};

function readList(lines, i) {
  const first = LIST_ITEM.exec(lines[i]);
  const base = widthOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const sameList = (hit) => !!hit && widthOf(hit[1]) <= base + 1 && /\d/.test(hit[2]) === ordered;
  const items = [];
  let loose = false;
  let at = i;
  while (at < lines.length) {
    const hit = LIST_ITEM.exec(lines[at]);
    if (!sameList(hit)) break;
    const indent = widthOf(hit[1]);
    const contentAt = indent + hit[2].length + 1;
    const body = [hit[3]];
    let next = at + 1;
    while (next < lines.length) {
      const line = lines[next];
      if (line.trim()) {
        if (widthOf(/^[ \t]*/.exec(line)[0]) <= indent) break;
        body.push(dedent(line, contentAt));
        next++;
        continue;
      }
      let ahead = next + 1;
      while (ahead < lines.length && !lines[ahead].trim()) ahead++;
      if (ahead >= lines.length) break;
      if (widthOf(/^[ \t]*/.exec(lines[ahead])[0]) > indent) {
        for (let blank = next; blank < ahead; blank++) body.push("");
        loose = true;
        next = ahead;
        continue;
      }
      if (sameList(LIST_ITEM.exec(lines[ahead]))) {
        loose = true;
        next = ahead;
      }
      break;
    }
    items.push({ n: ordered ? parseInt(hit[2], 10) : 0, body });
    at = next;
  }
  return { end: at, ordered, loose, items, start: items[0]?.n ?? 1 };
}

const TASK_MARK = /^\[([ xX])\](?:[ \t]+|$)/;

function taskOf(body) {
  const hit = TASK_MARK.exec(body[0] || "");
  if (!hit) return null;
  return { done: hit[1] !== " ", body: [body[0].slice(hit[0].length), ...body.slice(1)] };
}

function listHtml(list) {
  const tag = list.ordered ? "ol" : "ul";
  const start = list.ordered && list.start !== 1 ? ` start="${list.start}"` : "";
  const items = list.items.map((item) => {
    const task = taskOf(item.body);
    const blocks = blocksOf(task ? task.body : item.body);
    const html = blocks.map((one, at) => (!list.loose && at === 0 && one.kind === "p" ? one.inner : one.html)).join("");
    if (!task) return `<li>${html}</li>`;
    const box = `<input type="checkbox" class="md-check" disabled${task.done ? " checked" : ""} data-md-copy="${task.done ? "[x]" : "[ ]"}">`;
    return `<li class="md-task">${box}${html}</li>`;
  });
  const tasks = list.items.some((item) => taskOf(item.body)) ? ' class="md-tasks"' : "";
  return `<${tag}${start}${tasks}>${items.join("")}</${tag}>`;
}

function readQuote(lines, i) {
  const body = [];
  let at = i;
  while (at < lines.length && QUOTE.test(lines[at])) body.push(lines[at++].replace(QUOTE, ""));
  const mark = ALERT_MARK.exec(body[0] || "");
  if (!mark) return { end: at, html: `<blockquote>${blocksOf(body).map((one) => one.html).join("")}</blockquote>` };
  const kind = mark[1].toLowerCase();
  const inner = blocksOf(body.slice(1)).map((one) => one.html).join("");
  return { end: at, html: `<div class="md-alert" data-alert="${kind}" role="note"><p class="md-alert-title">${icon(kind)}${phrase(ALERTS[kind])}</p>${inner}</div>` };
}

function readInsight(lines, i) {
  const body = [];
  let at = i + 1;
  let fence = null;
  let closed = false;
  while (at < lines.length) {
    const line = lines[at++];
    if (fence) {
      if (closesFence(line, fence.mark)) fence = null;
      body.push(line);
      continue;
    }
    if (INSIGHT_CLOSE.test(line)) {
      closed = true;
      break;
    }
    fence = fenceAt(line);
    body.push(line);
  }
  const inner = blocksOf(body).map((one) => one.html).join("");
  return { end: at, closed, html: `<div class="md-alert" data-alert="insight" role="note"><p class="md-alert-title">${icon("insight")}${phrase("Insight")}</p>${inner}</div>` };
}

function readDetails(lines, i) {
  const opened = DETAILS_OPEN.exec(lines[i]);
  const rest = [];
  let depth = 1;
  let at = i + 1;
  let tail = opened[2].trim();
  let closed = false;
  if (tail && DETAILS_CLOSE.test(tail)) {
    tail = tail.replace(DETAILS_CLOSE, "").trim();
    closed = true;
  }
  if (tail) rest.push(tail);
  while (!closed && at < lines.length) {
    const line = lines[at++];
    if (DETAILS_OPEN.test(line)) depth++;
    if (DETAILS_CLOSE.test(line) && --depth === 0) {
      const before = line.replace(DETAILS_CLOSE, "");
      if (before.trim()) rest.push(before);
      closed = true;
      break;
    }
    rest.push(line);
  }
  let summary = phrase("Details");
  const head = rest.findIndex((line) => line.trim());
  if (head >= 0) {
    const named = SUMMARY.exec(rest[head]) || /^[ \t]*&lt;summary&gt;(.*?)&lt;\/summary&gt;(.*)$/i.exec(rest[head]);
    if (named) {
      summary = inline(summaryMarkdown(named[1].trim()));
      rest.splice(head, 1, ...(named[2]?.trim() ? [named[2]] : []));
    }
  }
  const inner = blocksOf(rest).map((one) => one.html).join("");
  return {
    end: at,
    closed,
    html: `<details class="md-details"${opened[1] ? " open" : ""}><summary>${icon("chevron", "md-i-chev")}<span>${summary}</span></summary><div class="md-details-body">${inner}</div></details>`
  };
}

function blocksOf(lines) {
  const html = [];
  const paragraph = [];
  let opened = 0;

  const flush = () => {
    if (!paragraph.length) return;
    const inner = paragraph.map(inline).join("<br>");
    html.push({ at: opened, kind: "p", inner, html: `<p>${inner}</p>` });
    paragraph.length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = fenceAt(line);
    if (fence) {
      flush();
      const code = [];
      const from = i;
      i++;
      while (i < lines.length && !closesFence(lines[i], fence.mark)) code.push(dedent(lines[i++], fence.lead));
      const open = i >= lines.length;
      const { lang, title } = fenceInfo(fence.info);
      if (/^(?:math|latex|tex|katex)$/i.test(lang)) {
        html.push({ at: from, hard: !open, kind: "math", html: mathBlock(code.join("\n").trim(), open) });
      } else {
        html.push({ at: from, hard: !open, kind: "code", html: codeBox({ lang, title, code, open }) });
      }
      continue;
    }

    if (MATH_FENCE.test(line)) {
      flush();
      const from = i;
      const first = line.replace(MATH_FENCE, "");
      const inLine = /^(.*?)\$\$\s*$/.exec(first);
      if (inLine && inLine[1].trim()) {
        html.push({ at: from, hard: true, kind: "math", html: mathBlock(inLine[1].trim(), false) });
        continue;
      }
      const tex = first.trim() ? [first] : [];
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) tex.push(lines[i++]);
      const open = i >= lines.length;
      if (!open) tex.push(lines[i].replace(/\$\$\s*$/, ""));
      html.push({ at: from, hard: !open, kind: "math", html: mathBlock(tex.join("\n").trim(), open) });
      continue;
    }

    if (INSIGHT_OPEN.test(line)) {
      flush();
      const from = i;
      const insight = readInsight(lines, i);
      i = insight.end - 1;
      html.push({ at: from, hard: insight.closed, kind: "insight", html: insight.html });
      continue;
    }

    if (DETAILS_OPEN.test(line)) {
      flush();
      const from = i;
      const details = readDetails(lines, i);
      i = details.end - 1;
      html.push({ at: from, hard: details.closed, kind: "details", html: details.html });
      continue;
    }

    if (isTableRow(line) && isTableRule(lines[i + 1] || "")) {
      flush();
      const from = i;
      const head = cells(line);
      const aligns = alignOf(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i]) && !startsBlock(lines, i)) rows.push(cells(lines[i++]));
      i--;
      html.push({ at: from, kind: "table", html: tableHtml(head, aligns, rows) });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const depth = Math.min(4, heading[1].length);
      html.push({ at: i, hard: true, kind: "h", html: `<div class="md-h md-h${depth}">${inline(heading[2])}</div>` });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      html.push({ at: i, hard: true, kind: "hr", html: "<hr>" });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      flush();
      const from = i;
      const list = readList(lines, i);
      i = list.end - 1;
      html.push({ at: from, kind: "list", html: listHtml(list) });
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const from = i;
      const quote = readQuote(lines, i);
      i = quote.end - 1;
      html.push({ at: from, kind: "quote", html: quote.html });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    if (!paragraph.length) opened = i;
    paragraph.push(line);
  }
  flush();
  return html;
}

export function markedBlocks(raw) {
  return blocksOf(escapeHtml(String(raw ?? "").replace(/\r\n/g, "\n")).split("\n"));
}

export function renderMarkdownBlocks(raw) {
  return markedBlocks(raw).map((one) => one.html);
}

export const renderMarkdown = (raw) => renderMarkdownBlocks(raw).join("");

const BLOCK_LEAD = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s?)?)([\s\S]*)$/;
const LINK_TYPING = /!?\[[^\]\n]*$|!?\[[^\]\n]*\]\([^)\s]*$/;
const OPENS_AFTER = /[\s(]/;
const CLOSES_BEFORE = /[\s).,;:!?]/;

function softInline(body) {
  const opens = [];
  let inCode = false;
  let i = 0;
  while (i < body.length) {
    const one = body[i];
    if (one === "`") {
      if (inCode) opens.pop();
      else opens.push({ mark: "`", at: i });
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) { i++; continue; }
    const pair = body.slice(i, i + 2);
    if (pair === "**" || pair === "~~") {
      if (opens[opens.length - 1]?.mark === pair) opens.pop();
      else opens.push({ mark: pair, at: i });
      i += 2;
      continue;
    }
    if (one === "*" || one === "_") {
      const top = opens[opens.length - 1];
      const after = body[i + 1] ?? " ";
      const before = i === 0 ? " " : body[i - 1];
      if (top?.mark === one && CLOSES_BEFORE.test(after)) opens.pop();
      else if (OPENS_AFTER.test(before)) opens.push({ mark: one, at: i });
      i++;
      continue;
    }
    i++;
  }
  if (!opens.length) return body;
  const bare = opens.findIndex((one) => one.at + one.mark.length >= body.length);
  const kept = bare < 0 ? opens : opens.slice(0, bare);
  const said = bare < 0 ? body : body.slice(0, opens[bare].at);
  return said + kept.map((one) => one.mark).reverse().join("");
}

const insideFence = (lines) => {
  let mark = "";
  let math = false;
  for (const line of lines) {
    if (mark) {
      if (closesFence(line, mark)) mark = "";
      continue;
    }
    if (math) {
      if (/\$\$\s*$/.test(line)) math = false;
      continue;
    }
    const fence = fenceAt(line);
    if (fence) { mark = fence.mark; continue; }
    if (MATH_FENCE.test(line) && !/^[ \t]*\$\$.*\S.*\$\$\s*$/.test(line)) math = true;
  }
  return !!mark || math;
};

export function liveMarked(raw) {
  const lines = String(raw ?? "").replace(/\r\n/g, "\n").split("\n");
  const last = lines.length - 1;
  if (!insideFence(lines) && !fenceAt(lines[last])) {
    const [, lead, body] = BLOCK_LEAD.exec(lines[last]);
    lines[last] = lead + softInline(body.replace(LINK_TYPING, ""));
  }
  return markedBlocks(lines.join("\n"));
}

export function liveMarkdown(raw) {
  return liveMarked(raw).map((one) => one.html);
}

/* the whole stream is re-parsed on every chunk, and a long answer is parsed once per character it
   grows by. only the tail can still change — a block the writing has already walked past is
   finished for good — so the settled ones are kept as they came out and each chunk parses the open
   block alone. `sealed` is what has been kept, `open` is the source of the block still being
   written, and the two together read exactly like liveMarkdown of everything said so far. */
export const liveStart = () => ({ sealed: [], open: "" });

export function liveStep(held, chunk) {
  const open = (held?.open || "") + String(chunk ?? "").replace(/\r\n/g, "\n");
  const marked = liveMarked(open);
  const lines = open.split("\n");
  let seal = 0;
  for (let i = 0; i + 1 < marked.length; i++) {
    if (!marked[i].hard && String(lines[marked[i + 1].at - 1] ?? "x").trim()) break;
    seal = i + 1;
  }
  const sealed = seal ? (held?.sealed || []).concat(marked.slice(0, seal).map((one) => one.html)) : (held?.sealed || []);
  const rest = seal ? lines.slice(marked[seal].at).join("\n") : open;
  return { sealed, open: rest, blocks: sealed.concat(marked.slice(seal).map((one) => one.html)) };
}

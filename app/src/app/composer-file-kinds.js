const KIND_BY_EXTENSION = [
  [/\.(ts|tsx|mts|cts)$/, "typescript"],
  [/\.(js|jsx|mjs|cjs)$/, "javascript"],
  [/\.(json|jsonc|json5)$/, "json"],
  [/\.(md|mdx|markdown)$/, "markdown"],
  [/\.(css|pcss)$/, "css"],
  [/\.(scss|sass|less)$/, "sass"],
  [/\.(html|htm)$/, "html"],
  [/\.(py|pyi)$/, "python"],
  [/\.(rb|erb|rake)$/, "ruby"],
  [/\.go$/, "go"],
  [/\.rs$/, "rust"],
  [/\.swift$/, "swift"],
  [/\.(c|h)$/, "c"],
  [/\.(cc|cpp|cxx|hpp|hh)$/, "cpp"],
  [/\.(sh|bash|zsh|fish)$/, "bash"],
  [/\.(yml|yaml)$/, "yml"],
  [/\.svg$/, "svg"],
  [/\.(png|jpe?g|gif|webp|heic|ico|bmp|avif)$/, "image"],
  [/\.(sql|db|sqlite|prisma)$/, "database"],
  [/\.(csv|tsv|xlsx?)$/, "table"],
  [/\.(graphql|gql)$/, "graphql"],
  [/\.vue$/, "vue"],
  [/\.svelte$/, "svelte"],
  [/\.(tf|tfvars)$/, "terraform"],
  [/\.(zip|tar|gz|tgz|rar|7z)$/, "zip"],
  [/\.(txt|log)$/, "text"],
  [/(^|\/)dockerfile$|\.dockerfile$/, "docker"],
  [/(^|\/)\.git(ignore|attributes|modules)$/, "git"]
];

const ICON_BY_KIND = { folder: "i-folder", image: "i-image", database: "i-db", table: "i-db", markdown: "i-doc", text: "i-doc", bash: "i-term" };

function fileKindOf(path) {
  const said = String(path ?? "");
  if (said.endsWith("/")) return "folder";
  const lower = said.toLowerCase();
  return KIND_BY_EXTENSION.find(([shape]) => shape.test(lower))?.[1] || "default";
}

function fileParts(path) {
  const said = String(path ?? "").replace(/\/+$/, "");
  const cut = said.lastIndexOf("/");
  return { name: said.slice(cut + 1), folder: cut < 0 ? "" : said.slice(0, cut) };
}

const fileIconOf = (kind) => ICON_BY_KIND[kind] || "i-file";

export { fileIconOf, fileKindOf, fileParts };

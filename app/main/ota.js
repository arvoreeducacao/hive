const { createHash, createPublicKey, verify } = require("node:crypto");
const { join } = require("node:path");

const SHELL_FILES = [
  "app/main.js",
  "app/boot.html",
  "app/package.json",
  "app/package-lock.json",
  "app/assets/icon.icns",
  "app/assets/icon.png",
  "server/package.json",
  "server/package-lock.json"
];

const SHELL_TREES = ["app/main"];

const RELEASE_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVRQski+6+sDquuybPg7pxrGJrAhz3h38CmgWuwF8d8g=
-----END PUBLIC KEY-----
`;

const posix = (path) => String(path).split(/[\\/]/).join("/");

function treeUnder(root, tree, fs) {
  const found = [];
  const walk = (rel) => {
    let entries = [];
    try { entries = fs.readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const entry of entries.slice().sort((one, other) => (one.name < other.name ? -1 : 1))) {
      const next = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) found.push(next);
    }
  };
  walk(tree);
  return found;
}

function shellTree(root, fs) {
  const files = SHELL_FILES.filter((rel) => {
    try { return fs.statSync(join(root, rel)).isFile(); } catch { return false; }
  });
  for (const tree of SHELL_TREES) files.push(...treeUnder(root, tree, fs));
  return files.map(posix).sort();
}

function shellPrint(root, fs) {
  const digest = createHash("sha256");
  for (const rel of shellTree(root, fs)) {
    digest.update(rel);
    digest.update("\0");
    digest.update(fs.readFileSync(join(root, rel)));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 12);
}

const packOf = (print) => (print ? `hive-js-${print}.tar.gz` : "");

const signatureOf = (pack) => (pack ? `${pack}.sig` : "");

function verifyPack({ bytes, signature, key = RELEASE_KEY }) {
  if (!key || !bytes?.length || !signature?.length) return false;
  try { return verify(null, bytes, createPublicKey(key), signature); } catch { return false; }
}

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

function lockedSdkVersion(root, read) {
  try {
    const lock = JSON.parse(read(join(root, "server", "package-lock.json"), "utf8"));
    return String(lock.packages?.[`node_modules/${SDK_PACKAGE}`]?.version || "");
  } catch { return ""; }
}

function shippedSdkVersion(root, read) {
  try { return String(JSON.parse(read(join(root, "server", "node_modules", SDK_PACKAGE, "package.json"), "utf8")).version || ""); } catch { return ""; }
}

function sdkAgreement(root, read) {
  const locked = lockedSdkVersion(root, read);
  const shipped = shippedSdkVersion(root, read);
  return { locked, shipped, agrees: !!locked && locked === shipped };
}

const jsHome = (home) => join(home, "js");

const jsRootOf = (home, tag) => join(jsHome(home), String(tag).replace(/[^A-Za-z0-9_-]/g, "_") || "_");

function readCurrent(file, read) {
  try {
    const held = JSON.parse(read(file, "utf8"));
    return { tag: String(held.tag || ""), print: String(held.print || ""), sha: String(held.sha || "") };
  } catch { return { tag: "", print: "", sha: "" }; }
}

function stampOf(root, read) {
  try { return JSON.parse(read(join(root, "build.json"), "utf8")); } catch { return {}; }
}

function signingTeam({ here, shipped, read }) {
  const mine = String(stampOf(here, read).team || "");
  if (mine) return mine;
  if (!shipped || shipped === here) return "";
  return String(stampOf(shipped, read).team || "");
}

function releaseOfRoot(root, read) {
  try { return Number(JSON.parse(read(join(root, "app", "build.json"), "utf8")).release) || 0; } catch { return 0; }
}

function pickJsRoot({ home, print, current, exists, shipped = 0, read = null }) {
  if (!home || !print || !current?.tag || current.print !== print) return "";
  const root = jsRootOf(home, current.tag);
  if (!exists(join(root, "app", "server.mjs"))) return "";
  const packed = shipped && read ? releaseOfRoot(root, read) : 0;
  return packed && packed < shipped ? "" : root;
}

const quoted = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function unpackPackScript({ pack, into, shipped }) {
  const dir = quoted(into);
  return [
    `rm -rf ${dir}`,
    `mkdir -p ${dir}`,
    `tar -xzf ${quoted(pack)} -C ${dir}`,
    `test -f ${quoted(join(into, "app", "server.mjs"))}`,
    `ln -sfn ${quoted(join(shipped, "node_modules"))} ${quoted(join(into, "app", "node_modules"))}`,
    `ln -sfn ${quoted(join(shipped, "..", "server", "node_modules"))} ${quoted(join(into, "server", "node_modules"))}`
  ].join("\n");
}

function sweepJsScript({ home, keep }) {
  const dir = quoted(jsHome(home));
  const kept = keep.map((tag) => `-name ${quoted(tag)}`).join(" -o ");
  return [
    `test -d ${dir} || exit 0`,
    `find ${dir} -mindepth 1 -maxdepth 1 ${kept ? `! \\( ${kept} \\) ` : ""}-print | while IFS= read -r root; do`,
    `  pgrep -f "$root/server/engine/" >/dev/null 2>&1 || rm -rf "$root"`,
    "done",
    "true"
  ].join("\n");
}

module.exports = {
  SHELL_FILES,
  SHELL_TREES,
  RELEASE_KEY,
  SDK_PACKAGE,
  sdkAgreement,
  shellTree,
  shellPrint,
  packOf,
  signatureOf,
  verifyPack,
  jsHome,
  jsRootOf,
  stampOf,
  signingTeam,
  readCurrent,
  pickJsRoot,
  unpackPackScript,
  sweepJsScript
};

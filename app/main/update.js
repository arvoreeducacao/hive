const { dirname, join, resolve } = require("node:path");

const MAC_BUNDLE = /^(.*\.app)[/\\]Contents[/\\]MacOS[/\\][^/\\]+$/;

function pickRepo(candidates, isRepo) {
  for (const candidate of candidates) {
    if (candidate && isRepo(resolve(candidate))) return resolve(candidate);
  }
  return "";
}

function runsFromBundle(here, repo) {
  return !repo || resolve(here) !== resolve(join(repo, "app"));
}

function bundleOf(execPath) {
  const found = MAC_BUNDLE.exec(String(execPath || ""));
  return found ? found[1] : "";
}

function builtBundle(distDir, entries, exists) {
  for (const entry of entries) {
    const guess = join(distDir, entry, "Hive.app");
    if (exists(guess)) return guess;
  }
  return "";
}

const quoted = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const forgetBundle = (path) => `${quoted(LSREGISTER)} -u ${path} 2>/dev/null || true`;

const registerBundle = (path) => `${quoted(LSREGISTER)} -f ${path} 2>/dev/null || true`;

const isBundlePath = (path) => /\.app$/.test(String(path || ""));

function swapScript({ from, to, pid, patience = 240 }) {
  const source = quoted(from);
  const target = quoted(to);
  const parked = quoted(`${to}.hive-old`);
  const alive = Number.isInteger(Number(pid)) && Number(pid) > 0 ? Number(pid) : 0;
  const clearSource = isBundlePath(from) ? ` ${forgetBundle(source)}; rm -rf ${source};` : "";
  return [
    alive ? `for _ in $(seq 1 ${patience}); do kill -0 ${alive} 2>/dev/null || break; sleep 0.5; done` : "sleep 1",
    `rm -rf ${parked}`,
    `mv ${target} ${parked} || exit 1`,
    `if ditto ${source} ${target}; then rm -rf ${parked};${clearSource} else rm -rf ${target}; mv ${parked} ${target}; fi`,
    registerBundle(target),
    `open ${target}`
  ].join("\n");
}

const TAGGED_SHA = /-([0-9a-f]{7,40})$/;

const shaOfTag = (tag) => (TAGGED_SHA.exec(String(tag || "")) || ["", ""])[1];

function sameCommit(one, other) {
  if (!one || !other) return false;
  const cut = Math.min(one.length, other.length);
  return one.slice(0, cut) === other.slice(0, cut);
}

const TYPED = /^([a-zA-Z]+)(\([^)]*\))?(!)?:\s*(.+)$/;
const MERGED = /^Merge pull request #(\d+) /;
const TRAILING_PR = /\s*\(#(\d+)\)\s*$/;
const HOUSEKEEPING = new Set(["chore", "docs", "test", "tests", "ci", "style", "build", "refactor", "revert"]);
const KIND_OF_TYPE = { feat: "new", feature: "new", fix: "fixed", perf: "faster" };
const HEADS = ["new", "fixed", "faster", "changed"];

function kindOf(subject) {
  const line = String(subject || "").trim();
  if (!line) return "quiet";
  if (/^Revert\s/i.test(line) || MERGED.test(line)) return "quiet";
  const typed = TYPED.exec(line);
  if (!typed) return "changed";
  const type = typed[1].toLowerCase();
  if (HOUSEKEEPING.has(type)) return "quiet";
  return KIND_OF_TYPE[type] || "changed";
}

function sentence(subject) {
  const typed = TYPED.exec(String(subject || "").trim());
  let text = (typed ? typed[4] : String(subject || "")).trim().replace(TRAILING_PR, "");
  if (!text) return "";
  text = text[0].toUpperCase() + text.slice(1);
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

const prOf = (subject) => {
  const found = TRAILING_PR.exec(String(subject || ""));
  return found ? `#${found[1]}` : "";
};

const mergedPr = (subject) => {
  const found = MERGED.exec(String(subject || "").trim());
  return found ? `#${found[1]}` : "";
};

function noteOf(entry) {
  const kind = kindOf(entry.subject);
  return { kind, text: kind === "quiet" ? "" : sentence(entry.subject), pr: entry.pr || prOf(entry.subject) };
}

function notesFromSubjects(entries) {
  const seen = new Set();
  const notes = [];
  let quiet = 0;
  for (const entry of entries || []) {
    const note = noteOf(entry);
    const key = note.text.toLowerCase();
    if (note.kind === "quiet" || !note.text || seen.has(key)) { quiet += 1; continue; }
    seen.add(key);
    notes.push(note);
  }
  return { notes, quiet };
}

function writeNotes(entries) {
  const { notes, quiet } = notesFromSubjects(entries);
  const lines = [];
  for (const head of HEADS) {
    const group = notes.filter((note) => note.kind === head);
    if (!group.length) continue;
    lines.push(`### ${head}`);
    for (const note of group) lines.push(`- ${note.text}${note.pr ? ` (${note.pr})` : ""}`);
    lines.push("");
  }
  if (!notes.length) lines.push("_Housekeeping only — nothing changed on your screen._", "");
  if (quiet > 0) lines.push(`_${quiet} housekeeping commit${quiet === 1 ? "" : "s"}._`);
  return `${lines.join("\n").trim()}\n`;
}

const NOTE_KINDS = new Set(["new", "fixed", "faster", "changed"]);
const HEADING = /^#{2,4}\s+(.+?)\s*$/;
const NOTE_PR = /\s*\(#(\d+)\)\s*$/;
const QUIET_LINE = /^_(\d+) housekeeping commits?\._$/;
const NOT_A_NOTE = /^(Merge (pull request|branch|remote-tracking) |Revert ")/i;

function notesOf(body) {
  const out = [];
  let kind = "";
  for (const raw of String(body || "").split("\n")) {
    const line = raw.trim();
    const head = HEADING.exec(line);
    if (head) {
      const word = head[1].toLowerCase();
      kind = NOTE_KINDS.has(word) ? word : "";
      continue;
    }
    if (!line.startsWith("- ")) continue;
    const text = line.slice(2).trim();
    if (!text || NOT_A_NOTE.test(text)) continue;
    const pr = NOTE_PR.exec(text);
    out.push({ kind, text: pr ? text.slice(0, pr.index).trim() : text, pr: pr ? `#${pr[1]}` : "" });
  }
  return out;
}

function quietOf(body) {
  for (const raw of String(body || "").split("\n")) {
    const found = QUIET_LINE.exec(raw.trim());
    if (found) return Number(found[1]);
  }
  return 0;
}

const RELEASE_NUMBER = /^Hive (\d+)$/;

const numberOf = (release) => Number((RELEASE_NUMBER.exec(String(release?.name || "").trim()) || ["", 0])[1]) || 0;

function assetIn(release, name) {
  const found = (release?.assets || []).find((asset) => asset?.name === name);
  return { asset: found ? name : "", assetUrl: found?.url || "", assetSize: Number(found?.size || 0) };
}

const publishedAt = (release) => Date.parse(release?.published_at || release?.created_at || "") || 0;

const liveReleases = (releases) => (releases || [])
  .filter((r) => r && r.tag_name && !r.draft && !r.prerelease)
  .sort((one, other) => publishedAt(other) - publishedAt(one));

const readSpan = (span) => ({
  notes: span.flatMap((r) => notesOf(r.body)),
  quiet: span.reduce((sum, r) => sum + quietOf(r.body), 0)
});

function spanAfterMine(live, at, mine, since) {
  const mineAt = live.findIndex((r) => sameCommit(shaOfTag(r.tag_name), mine));
  if (mineAt > at) return live.slice(at, mineAt);
  const numbered = since > 0 ? live.slice(at).filter((r) => numberOf(r) > since) : [];
  return numbered.length ? numbered : [live[at]];
}

function updateFromReleases(releases, mine, wanted, since = 0) {
  const live = liveReleases(releases);
  const at = live.findIndex((release) => assetIn(release, wanted).asset);
  if (at < 0) return null;
  const takeable = live[at];
  const found = { tag: takeable.tag_name, number: numberOf(takeable), ...assetIn(takeable, wanted) };
  if (sameCommit(shaOfTag(takeable.tag_name), mine)) return { ...found, behind: 0, commits: [], notes: [], quiet: 0 };
  const span = spanAfterMine(live, at, mine, Number(since) || 0);
  const { notes, quiet } = readSpan(span);
  return {
    ...found,
    behind: notes.length || span.length,
    notes: notes.slice(0, 40),
    commits: notes.map((note) => note.text).slice(0, 12),
    quiet
  };
}

function releasesQuery(slug) {
  const named = String(slug || "").trim();
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(named) ? `repos/${named}/releases?per_page=100` : "";
}

function updatePicked(releases, mine, { pack, bundle, number = 0 }) {
  const live = liveReleases(releases);
  const packAt = pack ? live.findIndex((r) => assetIn(r, pack).asset && assetIn(r, `${pack}.sig`).asset) : -1;
  const bundleAt = bundle ? live.findIndex((r) => assetIn(r, bundle).asset) : -1;
  if (packAt < 0 && bundleAt < 0) return null;
  const takePack = packAt >= 0 && (bundleAt < 0 || packAt <= bundleAt);
  const found = updateFromReleases(releases, mine, takePack ? pack : bundle, number);
  if (!found) return null;
  if (number > 0 && found.number > 0 && found.number < number) return null;
  if (found.behind === 0 && live.length && !sameCommit(shaOfTag(live[0].tag_name), mine)) return null;
  if (!takePack) return { ...found, via: "release" };
  const signed = assetIn(live[packAt], `${pack}.sig`);
  return { ...found, via: "pack", signature: signed.asset, signatureUrl: signed.assetUrl };
}

function releaseOf(releases, mine) {
  const found = mine ? liveReleases(releases).find((r) => sameCommit(shaOfTag(r.tag_name), mine)) : null;
  return found ? { tag: found.tag_name, number: numberOf(found), at: found.published_at || found.created_at || "" } : null;
}

function notesBetween(releases, from, to) {
  const live = liveReleases(releases);
  const toAt = live.findIndex((r) => sameCommit(shaOfTag(r.tag_name), to));
  if (toAt < 0) return null;
  const fromAt = live.findIndex((r) => sameCommit(shaOfTag(r.tag_name), from));
  const span = fromAt > toAt ? live.slice(toAt, fromAt) : [live[toAt]];
  const { notes, quiet } = readSpan(span);
  return {
    tag: live[toAt].tag_name,
    number: numberOf(live[toAt]),
    from: fromAt > toAt ? live[fromAt].tag_name : "",
    fromNumber: fromAt > toAt ? numberOf(live[fromAt]) : 0,
    at: live[toAt].published_at || live[toAt].created_at || "",
    releases: span.length,
    notes: notes.slice(0, 40),
    quiet
  };
}

function downloadScript({ url, zip }) {
  return [
    `mkdir -p ${quoted(dirname(zip))}`,
    `rm -f ${quoted(zip)}`,
    `gh api ${quoted(url)} -H 'Accept: application/octet-stream' > ${quoted(zip)}`
  ].join("\n");
}

function verifyScript({ bundle, team }) {
  const rule = `=anchor apple generic and certificate leaf[subject.OU] = "${String(team).replace(/[^A-Za-z0-9]/g, "")}"`;
  return `codesign --verify --deep --strict -R ${quoted(rule)} ${quoted(bundle)}`;
}

function unpackScript({ zip, into }) {
  const file = quoted(zip);
  const dir = quoted(into);
  return [
    `rm -rf ${dir}`,
    `mkdir -p ${dir}`,
    `ditto -x -k ${file} ${dir}`,
    `xattr -dr com.apple.quarantine ${dir} 2>/dev/null || true`
  ].join("\n");
}

function appImageOf(env) {
  const path = String(env?.APPIMAGE || "");
  return path.endsWith(".AppImage") ? path : "";
}

const RPM_INSTALL = /^\/opt\/Hive\/[^/]+$/;

function rpmInstallOf(execPath) {
  const path = String(execPath || "");
  return RPM_INSTALL.test(path) ? path : "";
}

function swapRpm({ from, exe, pid, patience = 240 }) {
  const source = quoted(from);
  const binary = quoted(exe);
  const alive = Number.isInteger(Number(pid)) && Number(pid) > 0 ? Number(pid) : 0;
  return [
    alive ? `for _ in $(seq 1 ${patience}); do kill -0 ${alive} 2>/dev/null || break; sleep 0.5; done` : "sleep 1",
    `pkexec rpm -U --replacepkgs --oldpackage --replacefiles ${source} || true`,
    `setsid ${binary} >/dev/null 2>&1 &`
  ].join("\n");
}

const INSTALLED_EXE = /\\Hive\.exe$/i;

function installedExeOf(execPath) {
  const path = String(execPath || "");
  return INSTALLED_EXE.test(path) ? path : "";
}

const installerArgs = () => ["/S"];

function swapAppImage({ from, to, pid, patience = 240 }) {
  const source = quoted(from);
  const target = quoted(to);
  const parked = quoted(`${to}.hive-old`);
  const alive = Number.isInteger(Number(pid)) && Number(pid) > 0 ? Number(pid) : 0;
  return [
    alive ? `for _ in $(seq 1 ${patience}); do kill -0 ${alive} 2>/dev/null || break; sleep 0.5; done` : "sleep 1",
    `rm -f ${parked}`,
    `mv ${target} ${parked} || exit 1`,
    `if cp ${source} ${target}; then chmod +x ${target}; rm -f ${parked}; else rm -f ${target}; mv ${parked} ${target}; fi`,
    `setsid ${target} >/dev/null 2>&1 &`
  ].join("\n");
}

function unpackedBundle(dir, entries, exists) {
  for (const entry of entries) {
    if (!entry.endsWith(".app")) continue;
    const guess = join(dir, entry);
    if (exists(guess)) return guess;
  }
  return builtBundle(dir, entries, exists);
}

module.exports = { pickRepo, runsFromBundle, bundleOf, builtBundle, swapScript, appImageOf, swapAppImage, rpmInstallOf, swapRpm, installedExeOf, installerArgs, shaOfTag, sameCommit, numberOf, kindOf, sentence, prOf, mergedPr, noteOf, notesFromSubjects, writeNotes, notesOf, quietOf, updateFromReleases, updatePicked, releasesQuery, releaseOf, notesBetween, downloadScript, verifyScript, unpackScript, unpackedBundle };

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SHELF_KEPT = 12;
export const THUMB_WAIT_MS = 10 * 60 * 1000;
export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const PNG_DATA_URL = /^data:image\/png;base64,/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PUSH_TRIES = 3;
export const TABS = ["documento", "telas", "plano", "lente", "prints"];
const SLUG_MAX = 60;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const TAB_FILENAME = [["telas", /canvas|telas|mockup|screens/], ["lente", /lente/], ["prints", /prints/]];
const TAB_ALIAS = { canvas: "telas", mockup: "telas", screens: "telas" };

export const SHELF_STATES = ["draft", "in-review", "decided", "delivered", "closed"];

export const STATE_WAS = {
  rascunho: "draft",
  "em-revisao": "in-review",
  "em-revisão": "in-review",
  decidido: "decided",
  entregue: "delivered",
  encerrado: "closed"
};

function cutState(label) {
  const named = String(label || "").trim().toLowerCase();
  const known = SHELF_STATES.map((state) => [state, state]).concat(Object.entries(STATE_WAS));
  for (const [head, state] of known) {
    if (named === head) return { state, rest: "" };
    if (named.startsWith(`${head}-`)) return { state, rest: named.slice(head.length) };
  }
  return { state: "", rest: "" };
}

export const stateOfLabel = (label) => cutState(label).state;

export function canonicalLabel(label) {
  const { state, rest } = cutState(label);
  return state ? `${state}${rest}` : String(label || "").trim().toLowerCase();
}

export function slugOf(title, fallback = "") {
  const source = String(title || fallback || "");
  const slug = source
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return slug || createHash("sha1").update(source).digest("hex").slice(0, 10);
}

export function askedTab(hint) {
  const asked = String(hint || "").trim().toLowerCase();
  if (!asked) return { tab: "" };
  const named = TAB_ALIAS[asked] || asked;
  if (TABS.includes(named)) return { tab: named };
  return { tab: "", error: `there is no tab called "${asked}" — the shelf keeps ${TABS.join(", ")}` };
}

export function tabOf(path, hint = "") {
  const { tab } = askedTab(hint);
  if (tab) return tab;
  const filename = String(path || "").split("/").pop().toLowerCase();
  const named = TAB_FILENAME.find(([, pattern]) => pattern.test(filename));
  return named ? named[0] : "documento";
}

export const pageDir = (home, slug) => join(home, "a", slug);
export const pageFile = (home, slug, tab, n) => join(pageDir(home, slug), `${tab}.v${n}.html`);
export const metaFile = (home, slug) => join(pageDir(home, slug), "meta.json");
export const thumbFile = (home, slug, tab, n) => join(pageDir(home, slug), `${tab}.v${n}.png`);

export function readMeta(home, slug) {
  try { return JSON.parse(readFileSync(metaFile(home, slug), "utf8")); } catch { return null; }
}

function keptTabs(meta) {
  const tabs = {};
  for (const [name, kept] of Object.entries(meta?.tabs || {})) {
    if (!Array.isArray(kept?.versions)) continue;
    tabs[name] = { versions: kept.versions, ...(kept.leafId ? { leafId: String(kept.leafId) } : {}) };
  }
  return tabs;
}

function newestVersion(tabs) {
  return Object.values(tabs)
    .flatMap((tab) => tab.versions || [])
    .reduce((best, v) => (!best || (v.at || 0) > (best.at || 0) ? v : best), null);
}

function nextVersions(kept, coming) {
  const last = kept[kept.length - 1];
  if (last && last.hash === coming.hash) {
    const relabelled = kept.slice(0, -1).concat([{ ...last, label: coming.label || last.label, at: coming.at || last.at }]);
    return { versions: relabelled, wrote: 0 };
  }
  const n = (last?.n || 0) + 1;
  return { versions: kept.concat([{ ...coming, n }]).slice(-SHELF_KEPT), wrote: n };
}

export const leafIdOf = (meta, tab) => String(meta?.tabs?.[tab]?.leafId || "");

export function shelve({ home, slug, tab, html, title, kind, description, owner, seat, label, url, at, leafId }) {
  if (!home) return { error: "the shelf has no repo on this machine yet" };
  if (!slug) return { error: "a page needs a slug" };
  if (typeof html !== "string" || !html.trim()) return { error: "there is nothing to shelve" };

  const was = readMeta(home, slug) || {};
  const tabs = keptTabs(was);
  const hash = createHash("sha1").update(html).digest("hex").slice(0, 16);
  const stamp = at || 0;
  const { versions, wrote } = nextVersions(tabs[tab]?.versions || [], {
    hash, label: canonicalLabel(label), at: stamp, bytes: Buffer.byteLength(html)
  });
  tabs[tab] = { versions, ...(leafId || tabs[tab]?.leafId ? { leafId: String(leafId || tabs[tab].leafId) } : {}) };

  mkdirSync(pageDir(home, slug), { recursive: true });
  if (wrote) writeFileSync(pageFile(home, slug, tab, wrote), html);
  const dropped = (was.tabs?.[tab]?.versions || []).filter((v) => !versions.some((kept) => kept.n === v.n));
  for (const gone of dropped) {
    try { rmSync(pageFile(home, slug, tab, gone.n)); } catch {}
    try { rmSync(thumbFile(home, slug, tab, gone.n)); } catch {}
  }

  const head = newestVersion(tabs);
  const meta = {
    slug,
    title: String(title || was.title || slug),
    kind: String(kind || was.kind || "documento"),
    description: String(description ?? was.description ?? ""),
    owner: String(owner || was.owner || ""),
    seat: String(seat || was.seat || ""),
    label: head?.label || canonicalLabel(label) || String(was.label || ""),
    url: String(url || was.url || ""),
    at: head?.at || stamp,
    tabs
  };
  writeFileSync(metaFile(home, slug), `${JSON.stringify(meta, null, 2)}\n`);
  return { meta, wrote, tab, dropped: dropped.map((v) => v.n) };
}

export function shelfIndex(home) {
  let slugs = [];
  try {
    slugs = readdirSync(join(home, "a"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch { return { pages: [] }; }
  const pages = slugs
    .map((slug) => readMeta(home, slug))
    .filter(Boolean)
    .map((meta) => ({ ...meta, thumbs: thumbsOf(home, meta) }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  return { pages };
}

export function thumbsOf(home, meta) {
  const thumbs = {};
  for (const [tab, kept] of Object.entries(meta?.tabs || {})) {
    const shot = [...(kept?.versions || [])].reverse().find((v) => existsSync(thumbFile(home, meta.slug, tab, v.n)));
    if (shot) thumbs[tab] = shot.n;
  }
  return thumbs;
}

const isPng = (bytes) => Buffer.isBuffer(bytes) && bytes.length > PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);

function versionOf(home, slug, tab, n) {
  if (!TABS.includes(tab)) return null;
  const meta = readMeta(home, slug);
  return meta?.tabs?.[tab]?.versions?.find((v) => v.n === Number(n)) || null;
}

export function keepThumb(home, slug, tab, n, bytes) {
  if (!versionOf(home, slug, tab, n)) return { error: "that version is not on the shelf" };
  if (!isPng(bytes)) return { error: "a thumbnail is a png" };
  if (bytes.length > THUMB_MAX_BYTES) return { error: "that thumbnail is too big" };
  const file = thumbFile(home, slug, tab, Number(n));
  writeFileSync(file, bytes);
  return { file };
}

export function readThumb(home, slug, tab, n) {
  if (!versionOf(home, slug, tab, n)) return { error: "that version is not on the shelf" };
  try { return { data: readFileSync(thumbFile(home, slug, tab, Number(n))) }; } catch { return { error: "that version has no thumbnail yet" }; }
}

export function thumbQueue({ now = Date.now, wait = THUMB_WAIT_MS, newId = randomUUID } = {}) {
  const jobs = [];
  const forget = () => {
    const at = now();
    for (let i = jobs.length - 1; i >= 0; i--) if (at - jobs[i].at > wait) jobs.splice(i, 1);
  };
  return {
    want(slug, tab, v) {
      if (!slug || !TABS.includes(tab) || !(Number(v) > 0)) return null;
      const known = jobs.find((job) => job.slug === slug && job.tab === tab && job.v === Number(v));
      if (known) return known.id;
      const job = { id: newId(), slug, tab, v: Number(v), at: now() };
      jobs.push(job);
      return job.id;
    },
    next() {
      forget();
      return jobs.slice(0, 1).map(({ id, slug, tab, v }) => ({ id, slug, tab, v }));
    },
    take(id) {
      const at = jobs.findIndex((job) => job.id === id);
      return at < 0 ? null : jobs.splice(at, 1)[0];
    }
  };
}

export function pickVersion(meta, tab, wanted) {
  const name = meta?.tabs?.[tab] ? tab : Object.keys(meta?.tabs || {})[0];
  const versions = meta?.tabs?.[name]?.versions || [];
  const pick = versions.find((v) => v.n === Number(wanted)) || versions[versions.length - 1];
  return pick ? { tab: name, version: pick } : null;
}

export function readPage(home, slug, tab, wanted) {
  const meta = readMeta(home, slug);
  if (!meta) return { error: "no page with that name on the shelf" };
  const pick = pickVersion(meta, tab, wanted);
  if (!pick) return { error: "nothing kept for that page" };
  const file = pageFile(home, slug, pick.tab, pick.version.n);
  if (!existsSync(file)) return { error: "that version only exists in the git history now" };
  return { html: readFileSync(file, "utf8"), meta, tab: pick.tab, version: pick.version };
}

export const commitLine = (meta, tab, n, wrote = n) =>
  `estante: ${meta.slug} · ${tab} v${n}${wrote ? "" : " (relabel)"}${meta.label ? ` · ${meta.label}` : ""}`;

const short = (text) => String(text || "").trim().slice(0, 160);

export function oneAtATime() {
  let queue = Promise.resolve();
  return (job) => {
    const mine = queue.then(job, job);
    queue = mine.then(() => {}, () => {});
    return mine;
  };
}

export async function catchUp({ git, branch = "main" }) {
  await git(["fetch", "origin", "--quiet"]);
  const ff = await git(["merge", "--ff-only", `origin/${branch}`]);
  if (ff.ok) return { ok: true, how: "fast-forward" };
  const rebased = await git(["rebase", `origin/${branch}`]);
  if (rebased.ok) return { ok: true, how: "rebase" };
  await git(["rebase", "--abort"]);
  return { ok: false, error: short(rebased.error) || "this clone and the shelf have gone different ways" };
}

export async function sendToShelf({ git, message, branch = "main", tries = PUSH_TRIES, paths = ["a"] }) {
  const added = await git(["add", "-A", ...paths]);
  if (!added.ok) return { error: `git add refused: ${short(added.error)}` };
  const staged = await git(["diff", "--cached", "--quiet"]);
  if (staged.ok) return { committed: false, pushed: false };
  const made = await git(["commit", "-m", message]);
  if (!made.ok) return { error: `git commit refused: ${short(made.error)}` };

  for (let round = 1; round <= tries; round += 1) {
    const sent = await git(["push", "origin", "HEAD"]);
    if (sent.ok) return { committed: true, pushed: true, rounds: round };
    if (round === tries) return { committed: true, pushed: false, rounds: round, error: short(sent.error) || "the shelf refused the push" };
    const again = await catchUp({ git, branch });
    if (!again.ok) return { committed: true, pushed: false, rounds: round, error: again.error };
  }
  return { committed: true, pushed: false, rounds: tries, error: "the shelf moved faster than this clone could push" };
}

export const COMMENT_MAX = 2000;
const PIN_PLACES = 10000;

export const commentsFile = (home, slug) => join(pageDir(home, slug), "comments.json");

export function readComments(home, slug) {
  try {
    const kept = JSON.parse(readFileSync(commentsFile(home, slug), "utf8"));
    return { comments: Array.isArray(kept?.comments) ? kept.comments : [] };
  } catch { return { comments: [] }; }
}

function writeComments(home, slug, comments) {
  mkdirSync(pageDir(home, slug), { recursive: true });
  writeFileSync(commentsFile(home, slug), `${JSON.stringify({ comments }, null, 2)}\n`);
}

const fraction = (value) => Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * PIN_PLACES) / PIN_PLACES;

export function pinOf(pin) {
  if (!pin || typeof pin !== "object") return null;
  if (pin.x === undefined || pin.y === undefined) return null;
  const el = String(pin.el || "").slice(0, 300);
  const named = String(pin.elAt || "").slice(0, 120);
  return {
    frame: String(pin.frame || "").slice(0, 80),
    name: String(pin.name || "").slice(0, 120),
    ...(el ? { el } : {}),
    ...(named ? { elAt: named } : {}),
    x: fraction(pin.x),
    y: fraction(pin.y)
  };
}

export function addComment(home, slug, { tab, v, who, text, pin, re, agent, at }) {
  if (!home) return { error: "the shelf has no repo on this machine yet" };
  const said = String(text || "").trim();
  if (!said) return { error: "a comment needs some words" };
  if (said.length > COMMENT_MAX) return { error: `a comment stops at ${COMMENT_MAX} characters` };
  if (!readMeta(home, slug)) return { error: "no page with that name on the shelf" };
  const { comments } = readComments(home, slug);
  const stamp = Number(at) || Date.now();
  const placed = pinOf(pin);
  const parent = String(re || "");
  if (parent && !comments.some((one) => one.id === parent)) {
    return { error: "no conversation with that id on this page — answer the one the question came from" };
  }
  const comment = {
    id: `c-${createHash("sha1").update(`${slug}|${who}|${stamp}|${said}|${comments.length}`).digest("hex").slice(0, 10)}`,
    tab: String(tab || ""),
    v: Number(v) || 0,
    who: String(who || ""),
    at: stamp,
    text: said,
    ...(placed ? { pin: placed } : {}),
    ...(parent ? { re: parent } : {}),
    ...(agent ? { agent: true } : {}),
    done: false
  };
  const kept = comments.concat([comment]);
  writeComments(home, slug, kept);
  return { comment, comments: kept };
}

export function settleComment(home, slug, { id, done, who, at }) {
  const { comments } = readComments(home, slug);
  const found = comments.find((one) => one.id === String(id || ""));
  if (!found) return { error: "no comment with that id on this page" };
  found.done = !!done;
  if (done) {
    found.doneBy = String(who || "");
    found.doneAt = Number(at) || Date.now();
  } else {
    delete found.doneBy;
    delete found.doneAt;
  }
  writeComments(home, slug, comments);
  return { comment: found, comments };
}

export const commentCommitLine = (slug, comment) =>
  `estante: ${slug} · ${comment.agent ? "resposta do agente" : "comentário"} de ${comment.who || "alguém"}${comment.tab ? ` em ${comment.tab}` : ""}${comment.v ? ` v${comment.v}` : ""}`;

export const settleCommitLine = (slug, comment) =>
  `estante: ${slug} · comentário ${comment.done ? "atendido" : "reaberto"}`;

export const PRINT_CEILING = 300 * 1024;
export const PRINT_CAPTION_MAX = 200;
export const PRINT_KINDS = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const printsDir = (home, slug) => join(pageDir(home, slug), "prints");
export const printsFile = (home, slug) => join(pageDir(home, slug), "prints.json");

export function readPrints(home, slug) {
  try { return JSON.parse(readFileSync(printsFile(home, slug), "utf8")).prints || []; } catch { return []; }
}

export function afterOf(asked, prints) {
  const last = prints[prints.length - 1]?.n || 0;
  if (asked === undefined || asked === null || asked === "" || asked === "last") return last || null;
  const n = Number(asked);
  if (!Number.isInteger(n) || n <= 0) return null;
  return prints.some((one) => one.n === n) ? n : null;
}

export function keepPrint(home, slug, { bytes, ext, caption, who, seat, from, after, at }) {
  if (!home) return { error: "the shelf has no repo on this machine yet" };
  if (!slug) return { error: "a print needs a page to live on" };
  const kind = String(ext || "").toLowerCase().replace("jpeg", "jpg");
  if (!PRINT_KINDS[kind]) return { error: "a print goes up as jpg, png or webp" };
  if (!bytes?.length) return { error: "that print came in empty" };
  if (bytes.length > PRINT_CEILING) return { error: `a print stays under ${Math.round(PRINT_CEILING / 1024)} KB; this one has ${Math.round(bytes.length / 1024)}` };
  const said = String(caption || "").trim().replace(/\s+/g, " ").slice(0, PRINT_CAPTION_MAX);
  if (!said) return { error: "every print carries a one-line caption saying what it shows" };

  const prints = readPrints(home, slug);
  const n = (prints[prints.length - 1]?.n || 0) + 1;
  const file = `${String(n).padStart(2, "0")}-${slugOf(said).slice(0, 40).replace(/-+$/, "") || "print"}.${kind}`;
  mkdirSync(printsDir(home, slug), { recursive: true });
  writeFileSync(join(printsDir(home, slug), file), bytes);
  const print = { n, file, caption: said, who: String(who || ""), seat: String(seat || ""), from: String(from || "").split("/").pop(), after: afterOf(after, prints), at: at || Date.now(), bytes: bytes.length };
  const kept = [...prints, print];
  writeFileSync(printsFile(home, slug), `${JSON.stringify({ prints: kept }, null, 2)}\n`);
  return { prints: kept, print };
}

const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dayOf = (at) => {
  const d = new Date(at || 0);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export function printsFlow(prints) {
  const byN = new Map(prints.map((one) => [one.n, one]));
  const taken = new Set();
  const rows = [];
  const follow = (head, from) => {
    const row = { from, prints: [] };
    let at = head;
    while (at && !taken.has(at.n)) {
      taken.add(at.n);
      row.prints.push(at);
      const next = prints.filter((one) => one.after === at.n && !taken.has(one.n));
      at = next[0] || null;
    }
    rows.push(row);
  };
  for (const one of prints) {
    if (taken.has(one.n)) continue;
    const parent = one.after ? byN.get(one.after) : null;
    follow(one, parent && parent.n !== one.n ? parent.n : null);
  }
  return rows;
}

const figureOf = (print, src) => `<figure id="p${print.n}">
        <a href="${esc(src(print))}" target="_blank" rel="noreferrer"><img src="${esc(src(print))}" alt="${esc(print.caption)}" loading="lazy"></a>
        <figcaption><span class="n">#${print.n}</span> ${esc(print.caption)} <span class="when">${dayOf(print.at)}${print.who ? ` · ${esc(print.who)}` : ""}</span></figcaption>
      </figure>`;

export function printsPage({ title, slug, prints, src = (print) => `prints/${print.file}` }) {
  const rows = printsFlow(prints);
  const isFlow = rows.some((row) => row.prints.length > 1 || row.from);
  const figures = rows.map((row) => `    <div class="row${isFlow ? " flow" : ""}">${row.from ? `<a class="branch" href="#p${row.from}">↳ de #${row.from}</a>` : ""}
      ${row.prints.map((print) => figureOf(print, src)).join("\n      <span class=\"arrow\" aria-hidden=\"true\">→</span>\n      ")}
    </div>`).join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg: #FAF9F7; --ink: #1A1917; --ink-3: #7A756C; --rule: #DCD8D0; --raise: #F2F0EC; --key: #A8482A; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0C0C0C; --ink: #EDEBE7; --ink-3: #9C988F; --rule: #262626; --raise: #131313; --key: #E5866A; } }
  :root[data-theme="dark"] { --bg: #0C0C0C; --ink: #EDEBE7; --ink-3: #9C988F; --rule: #262626; --raise: #131313; --key: #E5866A; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; padding: 28px 24px 80px; }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font: 700 22px/1.2 ui-monospace, "Hack", Menlo, monospace; margin: 0 0 4px; }
  p.sub { color: var(--ink-3); margin: 0 0 28px; font-size: 13px; }
  .row { margin: 0 0 32px; }
  .row.flow { display: flex; align-items: flex-start; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
  .row.flow figure { flex: 0 0 min(360px, 78vw); margin: 0; }
  .row .arrow { align-self: center; color: var(--key); font-size: 28px; line-height: 1; flex: none; }
  .row .branch { flex: none; align-self: center; font: 12px ui-monospace, "Hack", Menlo, monospace; color: var(--key); text-decoration: none; border: 1px dashed var(--key); border-radius: 4px; padding: 4px 8px; }
  figure { margin: 0 0 32px; background: var(--raise); border: 1px solid var(--rule); border-radius: 6px; padding: 10px; }
  img { display: block; max-width: 100%; height: auto; border-radius: 4px; }
  figcaption { margin-top: 10px; font-size: 14px; }
  figcaption .n { font-family: ui-monospace, "Hack", Menlo, monospace; color: var(--key); margin-right: 6px; }
  figcaption .when { color: var(--ink-3); font-size: 12px; margin-left: 8px; white-space: nowrap; }
  .empty { color: var(--ink-3); border: 1px dashed var(--rule); padding: 32px; text-align: center; border-radius: 6px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <p class="sub">prints · ${prints.length} ${prints.length === 1 ? "imagem" : "imagens"}${isFlow ? ` · ${rows.length} ${rows.length === 1 ? "fluxo" : "fluxos"}` : ""} · o que a tela virou depois de construída; a aba telas é o que se pretendia</p>
${figures || '    <div class="empty">nenhum print guardado ainda</div>'}
</div>
</body>
</html>
`;
}

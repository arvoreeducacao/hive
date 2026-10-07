import { randomUUID } from "node:crypto";
import { prKey, readPrRegistry, writePrRegistry, readPrNotes, writePrNotes, retirePrs } from "../lib/prs.mjs";
import { addNote, batchText, cleanNote, editNote, openNotes, removeNote } from "../assets/review-notes.mjs";
import { attributeFiles, linesWrittenIn } from "../lib/attribution.mjs";
import { readFile } from "node:fs/promises";
import { isPrPageSlug, prPageFailed, prPageRest, prPageSlug, prPageStart } from "../assets/pr-page.mjs";

const PR_FRESH_OPEN = 60000;
const PR_FRESH_RUNNING = 20000;
const PR_FRESH_SETTLED = 6 * 60 * 60 * 1000;
const PR_RETIRE_AFTER = 24 * 60 * 60 * 1000;
const PR_LANES = 4;
const PR_FIELDS = "number,title,url,state,isDraft,author,headRefName,baseRefName,additions,deletions,changedFiles,reviewDecision,mergeable,autoMergeRequest,statusCheckRollup,updatedAt,body,isCrossRepository";
const CHECK_GOOD = ["SUCCESS", "NEUTRAL", "SKIPPED"];
const CHECK_ABANDONED = ["CANCELLED", "STALE", "EXPECTED"];
const PR_NOT_THERE = /could not resolve to (a|an) (repository|pullrequest)|no pull requests found|could not find|\b404\b/i;
const REVIEW_SAID = { APPROVED: "approved", CHANGES_REQUESTED: "asked for changes", DISMISSED: "review dismissed" };
const SPEAKS_ALONE = ["APPROVED", "CHANGES_REQUESTED"];
const HTML_NOTE = /<!--[\s\S]*?-->/g;
const LOG_LINE_CAP = 400;
const ANSI = /(?:\u001b|\^\[)\[[0-9;]*[a-zA-Z]/g;
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const LOG_MARK = /^(?:##)?\[(group|endgroup|error|warning|notice|command|debug|section)\](.*)$/;
const NOISE = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock|mix\.lock|\.min\.(js|css)$|\.snap$|\.icns$|\.woff2?$|\.map$|(^|\/)(dist|build|vendor|__generated__)\/)/i;
const PICTURE_KIND = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml"
};
const PICTURE = new RegExp(`\\.(${Object.keys(PICTURE_KIND).join("|")})$`, "i");
const FILE_LINE_CAP = 1200;
const PICTURE_CAP = 12 << 20;
const PR_SHAS_FRESH = 60000;

const pictureKind = (path) => PICTURE_KIND[String(path).split(".").pop().toLowerCase()] || "";
const prSettled = (state) => state === "merged" || state === "closed";
const prFreshFor = (data) => {
  if (prSettled(data?.state)) return PR_FRESH_SETTLED;
  return data?.ci === "running" ? PR_FRESH_RUNNING : PR_FRESH_OPEN;
};
const clockAt = (ms) => new Date(ms).toTimeString().slice(0, 5);
const branchRef = (branch) => String(branch).split("/").map(encodeURIComponent).join("/");
const BRANCH_ALREADY_GONE = /reference does not exist/i;

function checkState(check) {
  if (check.status && check.status !== "COMPLETED") return "running";
  const done = check.conclusion || check.state || "";
  if (CHECK_GOOD.includes(done)) return "passed";
  if (CHECK_ABANDONED.includes(done)) return "skipped";
  return "failed";
}

function jobInUrl(url) {
  const found = String(url || "").match(/\/actions\/runs\/(\d+)\/job\/(\d+)/);
  return found ? { run: Number(found[1]), job: Number(found[2]) } : { run: 0, job: 0 };
}

function oneCheck(check) {
  const where = jobInUrl(check.detailsUrl);
  const from = Date.parse(check.startedAt || "") || 0;
  const to = Date.parse(check.completedAt || "") || 0;
  return {
    name: check.name || check.context || "check",
    workflow: check.workflowName || "",
    state: checkState(check),
    took: from && to > from ? to - from : 0,
    url: check.detailsUrl || check.targetUrl || "",
    run: where.run,
    job: where.job
  };
}

function checksSummary(rollup) {
  const checks = (rollup || []).filter((check) => check && (check.status || check.state)).map(oneCheck);
  if (!checks.length) return { ci: "none", detail: "", checks };
  const count = (state) => checks.filter((check) => check.state === state).length;
  const broken = checks.filter((check) => check.state === "failed");
  if (broken.length) return { ci: "failed", detail: broken.slice(0, 3).map((check) => check.name).join(", "), checks };
  const running = count("running");
  if (running) return { ci: "running", detail: `${running} of ${checks.length}`, checks };
  return { ci: "passed", detail: `${count("passed")} checks`, checks };
}

function oneCommit(commit) {
  return {
    sha: String(commit.oid || "").slice(0, 7),
    title: commit.messageHeadline || "",
    body: String(commit.messageBody || "").slice(0, 400),
    who: commit.authors?.[0]?.login || commit.authors?.[0]?.name || "",
    when: commit.committedDate || commit.authoredDate || ""
  };
}

function said(who, when, body, kind, extra = {}) {
  const text = String(body || "").replace(HTML_NOTE, "").trim();
  return { who: who || "someone", when: when || "", body: text.slice(0, 6000), kind, ...extra };
}

function oneLogLine(raw) {
  const parts = raw.split("\t");
  const wide = parts.length >= 3;
  const step = wide ? parts[1] : "";
  const text = (wide ? parts.slice(2).join("\t") : raw)
    .replace(ANSI, "")
    .replace(/^\uFEFF/, "")
    .replace(STAMP, "")
    .replace(/\r$/, "");
  const marked = text.match(LOG_MARK);
  if (!marked) return { step, kind: "line", text };
  const [, what, rest] = marked;
  if (what === "endgroup") return null;
  if (what === "group") return { step, kind: "group", text: rest };
  if (what === "error") return { step, kind: "bad", text: rest };
  return { step, kind: "line", text: rest };
}

function readJobLog(raw, cap = LOG_LINE_CAP) {
  const all = String(raw || "").split("\n").filter((line) => line.trim());
  const cut = Math.max(0, all.length - cap);
  return { cut, lines: all.slice(cut).map(oneLogLine).filter(Boolean) };
}

function diffMap(raw) {
  const before = [];
  const after = [];
  const map = [];
  let oldLine = 0;
  let newLine = 0;
  let newEnd = 0;
  let first = true;
  for (const line of raw) {
    const head = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (head) {
      oldLine = Number(head[1]);
      newLine = Number(head[2]);
      const gap = newEnd ? newLine - newEnd : newLine - 1;
      if (!(first && gap <= 0)) map.push({ t: "gap", n: gap });
      first = false;
      continue;
    }
    if (line.startsWith("\\")) {
      map.push({ t: "note" });
      continue;
    }
    const text = line.slice(1);
    if (line.startsWith("+")) {
      after.push(text);
      map.push({ t: "added", d: newLine, i: after.length - 1 });
      newLine++;
      newEnd = newLine;
      continue;
    }
    if (line.startsWith("-")) {
      before.push(text);
      map.push({ t: "removed", a: oldLine, i: before.length - 1 });
      oldLine++;
      continue;
    }
    before.push(text);
    after.push(text);
    map.push({ t: "same", a: oldLine, d: newLine, i: after.length - 1 });
    oldLine++;
    newLine++;
    newEnd = newLine;
  }
  return { map, before, after };
}

function sliceRaw(raw) {
  const files = [];
  let current = null;
  for (const line of raw.split("\n")) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      current = { path: header[2], added: 0, removed: 0, mode: "changed", binary: false, raw: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file")) {
      current.mode = "new";
      continue;
    }
    if (line.startsWith("deleted file")) {
      current.mode = "deleted";
      continue;
    }
    if (line.startsWith("rename to")) {
      current.mode = "renamed";
      continue;
    }
    if (line.startsWith("Binary files")) {
      current.binary = true;
      continue;
    }
    if (/^(index |--- |\+\+\+ |similarity |rename |old mode|new mode|GIT binary)/.test(line)) continue;
    if (line.startsWith("+")) current.added++;
    else if (line.startsWith("-")) current.removed++;
    current.raw.push(line);
  }
  return files;
}

export function createPrDomain({
  sh,
  shr,
  extractJson,
  languageOf,
  paintLines,
  liveSessions = () => [],
  readRegistry = readPrRegistry,
  writeRegistry = writePrRegistry,
  retire = retirePrs,
  readNotes = readPrNotes,
  writeNotes = writePrNotes,
  newId = randomUUID,
  now = Date.now,
  transcriptOf = async () => ({ text: "", seat: "" }),
  fetchImpl = fetch,
  markdownCss = () => readFile(new URL("../assets/github-markdown-dark.css", import.meta.url), "utf8")
}) {
  const prCache = new Map();
  const prFetching = new Map();
  const prShas = new Map();
  let ghPausedUntil = 0;
  let meOnGithub = "";
  let ghToken = null;

  async function whoAmIOnGithub() {
    if (meOnGithub) return meOnGithub;
    const out = (await sh("gh", ["api", "user", "-q", ".login"], { timeout: 12000 })).trim();
    if (/^[A-Za-z0-9-]{1,39}$/.test(out)) meOnGithub = out;
    return meOnGithub || "";
  }

  async function pauseGithub() {
    if (Date.now() < ghPausedUntil) return;
    const raw = (await sh("gh", ["api", "rate_limit", "--jq", ".resources.graphql.reset"], { timeout: 8000 })).trim();
    const reset = Number(raw) * 1000;
    ghPausedUntil = reset > Date.now() ? reset + 5000 : Date.now() + 600000;
  }

  function prHeld(key, saved, reason) {
    if (saved?.data && !saved.data.error) return { ...saved.data, stale: reason };
    const [repo, number] = key.split("#");
    const data = { key, repo, number: Number(number), state: "?", ci: "none", error: reason };
    prCache.set(key, { at: Date.now(), data });
    return data;
  }

  async function branchLeft(repo, raw) {
    if (raw.state === "OPEN" || raw.isCrossRepository || !raw.headRefName) return false;
    const result = await shr("gh", ["api", `repos/${repo}/git/ref/heads/${branchRef(raw.headRefName)}`], { timeout: 15000 });
    return result.ok;
  }

  async function fetchPr(key, saved) {
    const [repo, number] = key.split("#");
    const result = await shr("gh", ["pr", "view", number, "-R", repo, "--json", PR_FIELDS], { timeout: 25000 });
    const raw = result.out ? extractJson(result.out) : null;
    if (!raw) {
      if (/rate limit|\b429\b|secondary rate|abuse detection/i.test(result.error)) {
        await pauseGithub();
        return prHeld(key, saved, `GitHub rate limit until ${clockAt(ghPausedUntil)}`);
      }
      const gone = PR_NOT_THERE.test(result.error);
      const reason = gone
        ? "GitHub says this pull request does not exist"
        : /503|502|timeout/i.test(result.error) ? "GitHub is down" : (result.error.split("\n").filter(Boolean).pop() || "gh did not return this PR").slice(0, 90);
      const held = { at: Date.now() - PR_FRESH_OPEN + 5000 };
      if (saved?.data && !saved.data.error) {
        const data = { ...saved.data, stale: reason };
        prCache.set(key, { ...held, data });
        return data;
      }
      const data = { key, repo, number: Number(number), state: "?", ci: "none", error: reason, missing: gone };
      prCache.set(key, { ...held, data });
      return data;
    }
    const rollup = checksSummary(raw.statusCheckRollup);
    const data = {
      key,
      repo,
      number: raw.number,
      title: raw.title,
      url: raw.url,
      state: raw.state === "OPEN" ? (raw.isDraft ? "draft" : "open") : raw.state.toLowerCase(),
      author: raw.author?.login || "",
      mine: (await whoAmIOnGithub()) === (raw.author?.login || ""),
      branch: raw.headRefName,
      branchLeft: await branchLeft(repo, raw),
      base: raw.baseRefName,
      added: raw.additions,
      removed: raw.deletions,
      files: raw.changedFiles,
      review: (raw.reviewDecision || "").toLowerCase(),
      mergeable: (raw.mergeable || "").toLowerCase(),
      autoMerge: !!raw.autoMergeRequest,
      ci: rollup.ci,
      ciDetail: rollup.detail,
      checks: rollup.checks,
      body: String(raw.body || "").slice(0, 8000),
      updatedAt: raw.updatedAt
    };
    prCache.set(key, { at: Date.now(), data });
    return data;
  }

  async function prData(key) {
    const saved = prCache.get(key);
    if (saved && Date.now() - saved.at < prFreshFor(saved.data)) return saved.data;
    if (Date.now() < ghPausedUntil) return prHeld(key, saved, `GitHub rate limit until ${clockAt(ghPausedUntil)}`);
    const running = prFetching.get(key);
    if (running) return running;
    const job = fetchPr(key, saved).finally(() => prFetching.delete(key));
    prFetching.set(key, job);
    return job;
  }

  async function prTalk(key) {
    const [repo, number] = key.split("#");
    const [own, inline] = await Promise.all([
      sh("gh", ["pr", "view", number, "-R", repo, "--json", "comments,reviews"], { timeout: 25000 }),
      sh("gh", ["api", `repos/${repo}/pulls/${number}/comments?per_page=100`], { timeout: 25000 })
    ]);
    const mine = extractJson(own) || {};
    const talk = [];
    for (const comment of mine.comments || []) talk.push(said(comment.author?.login, comment.createdAt, comment.body, "comment", { url: comment.url || "" }));
    for (const review of mine.reviews || []) {
      if (!String(review.body || "").trim() && !SPEAKS_ALONE.includes(review.state)) continue;
      talk.push(said(review.author?.login, review.submittedAt, review.body, "review", { verdict: REVIEW_SAID[review.state] || "reviewed" }));
    }
    for (const comment of extractJson(inline) || []) {
      talk.push(said(comment.user?.login, comment.created_at, comment.body, "inline", {
        path: comment.path || "",
        line: comment.line || comment.original_line || 0,
        hunk: String(comment.diff_hunk || "").split("\n").slice(-4).join("\n"),
        url: comment.html_url || ""
      }));
    }
    return talk.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  }

  function buildFile(file) {
    const language = languageOf(file.path);
    const { map, before, after } = diffMap(file.raw);
    const paintedAfter = paintLines(after.join("\n"), language);
    const paintedBefore = paintLines(before.join("\n"), language);
    const lines = map.slice(0, FILE_LINE_CAP).map((line) => {
      if (line.t === "gap" || line.t === "note") return line;
      const html = line.t === "removed" ? paintedBefore[line.i] : paintedAfter[line.i];
      return { t: line.t, a: line.a ?? null, d: line.d ?? null, h: html ?? "" };
    });
    return {
      path: file.path,
      added: file.added,
      removed: file.removed,
      mode: file.mode,
      binary: file.binary,
      picture: PICTURE.test(file.path),
      language,
      noise: NOISE.test(file.path),
      lines,
      truncated: Math.max(0, map.length - FILE_LINE_CAP)
    };
  }

  const sliceDiff = (raw) => sliceRaw(raw).map(buildFile);

  const rawDiffs = new Map();

  async function diffOf(key) {
    const held = rawDiffs.get(key);
    if (held && now() - held.at < 30000) return held.files;
    const [repo, number] = key.split("#");
    const raw = await sh("gh", ["pr", "diff", number, "-R", repo], { timeout: 40000 });
    const files = sliceDiff(raw);
    rawDiffs.set(key, { at: now(), files });
    return files;
  }

  async function shasOfPr(key) {
    const saved = prShas.get(key);
    if (saved && Date.now() - saved.at < PR_SHAS_FRESH) return saved.shas;
    const [repo, number] = key.split("#");
    const raw = extractJson(await sh("gh", ["api", `repos/${repo}/pulls/${number}`], { timeout: 25000 }));
    const shas = { after: raw?.head?.sha || "", before: raw?.base?.sha || "" };
    if (shas.after) prShas.set(key, { at: Date.now(), shas });
    return shas;
  }

  async function tokenForGithub() {
    if (ghToken !== null) return ghToken;
    ghToken = (await sh("gh", ["auth", "token"], { timeout: 10000 })).trim();
    return ghToken;
  }

  async function prPicture(key, path, side) {
    const kind = pictureKind(path);
    if (!kind) return { error: "that file is not an image", code: 400 };
    if (path.startsWith("/") || path.split("/").includes("..")) return { error: "that is not a path in a diff", code: 400 };
    const [repo] = key.split("#");
    const ref = (await shasOfPr(key))[side];
    if (!ref) return { error: "GitHub did not say which commit this side of the diff is", code: 502 };
    const token = await tokenForGithub();
    if (!token) return { error: "gh is not logged in on this machine", code: 502 };
    const where = `https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`;
    let result;
    try {
      result = await fetchImpl(where, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github.raw", "user-agent": "hive" },
        signal: AbortSignal.timeout(25000)
      });
    } catch {
      return { error: "GitHub did not answer in time", code: 504 };
    }
    if (result.status === 404) return { error: "this image is not on that side of the diff", code: 404 };
    if (!result.ok) return { error: `GitHub answered ${result.status}`, code: 502 };
    if (Number(result.headers.get("content-length") || 0) > PICTURE_CAP) return { error: "that image is too heavy to open here", code: 413 };
    const bytes = Buffer.from(await result.arrayBuffer());
    if (bytes.length > PICTURE_CAP) return { error: "that image is too heavy to open here", code: 413 };
    return { ok: true, kind, bytes };
  }

  const pageKeys = new Map();

  async function keyOfPage(slug) {
    if (pageKeys.has(slug)) return pageKeys.get(slug);
    const registry = await readRegistry();
    const keys = [...registry.map((pr) => pr.key), ...liveSessions().flatMap((session) => (session.prs || []).map(prKey))];
    const key = keys.find((one) => one && prPageSlug(one) === slug);
    if (key) pageKeys.set(slug, key);
    return key || "";
  }

  async function pullPage(slug) {
    if (!isPrPageSlug(slug)) return null;
    const key = await keyOfPage(slug);
    if (!key) return null;
    const [repo, number] = key.split("#");
    const where = { repo, number, url: `https://github.com/${repo}/pull/${number}` };
    return { start: prPageStart(where), rest: () => restOfPage(key, where) };
  }

  async function restOfPage(key, where) {
    try {
      const [raw, files, css] = await Promise.all([
        sh("gh", ["api", `repos/${where.repo}/pulls/${where.number}`, "-H", "Accept: application/vnd.github.full+json"], { timeout: 25000 }),
        diffOf(key),
        markdownCss()
      ]);
      const pull = extractJson(raw);
      if (!pull?.number) return prPageFailed(where);
      const state = pull.merged_at ? "merged" : pull.draft && pull.state === "open" ? "draft" : pull.state;
      return prPageRest({
        pr: {
          key,
          repo: where.repo,
          number: pull.number,
          title: pull.title || "",
          author: pull.user?.login || "",
          state,
          url: pull.html_url || where.url,
          head: pull.head?.ref || "",
          base: pull.base?.ref || "",
          bodyHtml: pull.body_html || ""
        },
        files: [...files.filter((file) => !file.noise), ...files.filter((file) => file.noise)],
        markdownCss: css
      });
    } catch {
      return prPageFailed(where);
    }
  }

  async function collectPrs() {
    const registry = await readRegistry();
    const retired = new Set(registry.filter((pr) => pr.retired).map((pr) => pr.key));
    const chosen = new Set(registry.filter((pr) => pr.chosen && !pr.retired).map((pr) => pr.key));
    const fromHive = new Map();
    for (const pr of registry) if (!pr.retired) fromHive.set(pr.key, pr.session || "");
    for (const session of liveSessions()) {
      for (const link of session.prs) {
        const key = prKey(link);
        if (key && !retired.has(key) && !fromHive.has(key)) fromHive.set(key, session.name);
      }
    }
    const keys = [...fromHive.keys()];
    const found = [];
    let taken = 0;
    await Promise.all(Array.from({ length: Math.min(PR_LANES, keys.length) }, async () => {
      for (let index = taken++; index < keys.length; index = taken++) {
        const key = keys[index];
        found.push({ ...(await prData(key)), session: fromHive.get(key) });
      }
    }));
    const me = await whoAmIOnGithub();
    const borrowed = me ? found.filter((pr) => pr.session && pr.author && pr.author !== me && !chosen.has(pr.key)) : [];
    const done = found.filter((pr) => pr.missing || (prSettled(pr.state) && pr.updatedAt && Date.now() - Date.parse(pr.updatedAt) > PR_RETIRE_AFTER));
    const gone = [...new Set([...done, ...borrowed])];
    if (gone.length) await retire(gone.map((pr) => pr.key));
    const list = found.filter((pr) => !gone.includes(pr));
    const order = { failed: 0, running: 1, passed: 2, none: 3 };
    return list.sort((a, b) => {
      const open = (pr) => (pr.state === "open" || pr.state === "draft" ? 0 : 1);
      return open(a) - open(b) || (order[a.ci] ?? 9) - (order[b.ci] ?? 9) || String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  }

  function register(on, bodyOf) {
    on(null, "/api/prs", async (req, res, url, json) => json({ prs: await collectPrs(), me: await whoAmIOnGithub() }));

    on("POST", "/api/prs/register", async (req, res, url, json) => {
      const { url: link, session } = await bodyOf(req);
      const key = prKey(link);
      if (!key) return json({ error: "send the PR url or owner/repo#number" }, 400);
      const registry = await readRegistry();
      const known = registry.find((pr) => pr.key === key);
      if (!known) registry.push({ key, session: session || "", chosen: true, at: new Date().toISOString() });
      else {
        delete known.retired;
        known.chosen = true;
        known.at = new Date().toISOString();
      }
      await writeRegistry(registry);
      prCache.delete(key);
      return json({ ok: true, key });
    });

    on("POST", "/api/prs/forget", async (req, res, url, json) => {
      const { key } = await bodyOf(req);
      await retire([String(key || "")].filter(Boolean));
      prCache.delete(key);
      return json({ ok: true });
    });

    on(null, "/api/prs/notes", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      if (!key) return json({ error: "missing key" }, 400);
      return json({ notes: (await readNotes())[key] || [] });
    });

    on("POST", "/api/prs/notes", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const key = prKey(body.key);
      if (!key) return json({ error: "missing key" }, 400);
      const note = cleanNote(body);
      if (note.error) return json({ error: note.error }, 400);
      const all = await readNotes();
      const said = addNote(all[key], note, { id: newId(), at: now() });
      if (said.error) return json({ error: said.error }, 400);
      all[key] = said.notes;
      await writeNotes(all);
      return json({ ok: true, note: said.note, notes: said.notes });
    });

    on("POST", "/api/prs/notes/edit", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const key = prKey(body.key);
      if (!key) return json({ error: "missing key" }, 400);
      const all = await readNotes();
      const said = editNote(all[key], String(body.id || ""), { text: body.text, resolved: body.resolved });
      if (said.error) return json({ error: said.error }, 400);
      all[key] = said.notes;
      await writeNotes(all);
      return json({ ok: true, note: said.note, notes: said.notes });
    });

    on("POST", "/api/prs/notes/remove", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const key = prKey(body.key);
      if (!key) return json({ error: "missing key" }, 400);
      const all = await readNotes();
      const said = removeNote(all[key], String(body.id || ""));
      if (said.error) return json({ error: said.error }, 400);
      all[key] = said.notes;
      if (!said.notes.length) delete all[key];
      await writeNotes(all);
      return json({ ok: true, notes: said.notes });
    });

    on("POST", "/api/prs/notes/batch", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const key = prKey(body.key);
      if (!key) return json({ error: "missing key" }, 400);
      const all = await readNotes();
      const open = openNotes(all[key]);
      if (!open.length) return json({ error: "every note on this PR is resolved — nothing to send" }, 400);
      const text = batchText({ key, url: String(body.url || ""), notes: open });
      const sentAt = now();
      all[key] = (all[key] || []).map((one) => (one.resolved ? one : { ...one, sentAt }));
      await writeNotes(all);
      return json({ ok: true, text, count: open.length, notes: all[key] });
    });

    on(null, "/api/prs/diff", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      if (!key) return json({ error: "missing key" }, 400);
      const files = await diffOf(key);
      return json({ files: [...files.filter((file) => !file.noise), ...files.filter((file) => file.noise)] });
    });

    on(null, "/api/prs/attribution", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      if (!key) return json({ error: "missing key" }, 400);
      const registry = await readRegistry();
      const session = String(url.searchParams.get("session") || registry.find((pr) => pr.key === key)?.session || "");
      if (!session) return json({ ok: true, seat: "", files: {}, added: 0, mine: 0, why: "no chat owns this PR" });
      const held = await transcriptOf(session);
      if (!held.text) return json({ ok: true, seat: session, files: {}, added: 0, mine: 0, why: held.why || "no transcript of that chat on this machine" });
      const files = await diffOf(key);
      const { written } = linesWrittenIn(held.text);
      return json({ ok: true, seat: session, ...attributeFiles(files, written) });
    });

    on(null, "/api/prs/picture", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      const path = String(url.searchParams.get("path") || "");
      const side = url.searchParams.get("side") === "before" ? "before" : "after";
      if (!key || !path) return json({ error: "missing pr or path" }, 400);
      const out = await prPicture(key, path, side);
      if (!out.ok) return json({ error: out.error }, out.code || 404);
      res.writeHead(200, { "content-type": out.kind, "cache-control": "private, max-age=600", "content-length": out.bytes.length });
      return res.end(out.bytes);
    });

    on(null, "/api/prs/joblog", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      const job = Number(url.searchParams.get("job") || 0);
      if (!key || !job) return json({ error: "missing pr or job" }, 400);
      const [repo] = key.split("#");
      const onlyFailed = url.searchParams.get("failed") === "1";
      const args = ["run", "view", "-R", repo, "--job", String(job), onlyFailed ? "--log-failed" : "--log"];
      const result = await shr("gh", args, { timeout: 45000 });
      if (result.out && result.out.trim()) return json(readJobLog(result.out));
      const why = /log not found|no logs|404/i.test(result.error)
        ? "GitHub did not keep a log for this job — it died before running any step"
        : (result.error.split("\n").filter(Boolean).pop() || "this job has no log to show").slice(0, 120);
      return json({ cut: 0, lines: [], empty: why });
    });

    on("POST", "/api/prs/rerun", async (req, res, url, json) => {
      const asked = await bodyOf(req);
      const key = prKey(asked.key);
      const run = Number(asked.run || 0);
      if (!key || !run) return json({ error: "missing pr or run" }, 400);
      const [repo] = key.split("#");
      const args = ["run", "rerun", String(run), "-R", repo];
      if (asked.failedOnly) args.push("--failed");
      const result = await shr("gh", args, { timeout: 40000 });
      prCache.delete(key);
      if (!result.ok) return json({ error: result.error.split("\n").filter(Boolean).pop() || "gh refused the rerun" }, 400);
      return json({ ok: true });
    });

    on(null, "/api/prs/talk", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      if (!key) return json({ error: "missing key" }, 400);
      try {
        return json({ talk: await prTalk(key) });
      } catch (error) {
        return json({ error: String(error.message || error) }, 502);
      }
    });

    on(null, "/api/prs/commits", async (req, res, url, json) => {
      const key = prKey(url.searchParams.get("key"));
      if (!key) return json({ error: "missing key" }, 400);
      const [repo, number] = key.split("#");
      const raw = extractJson(await sh("gh", ["pr", "view", number, "-R", repo, "--json", "commits"], { timeout: 25000 }));
      return json({ commits: (raw?.commits || []).map(oneCommit).reverse() });
    });

    on("POST", "/api/prs/merge", async (req, res, url, json) => {
      const { key: rawKey, whenGreen, force } = await bodyOf(req);
      const key = prKey(rawKey);
      if (!key) return json({ error: "missing key" }, 400);
      const [repo, number] = key.split("#");
      const args = ["pr", "merge", number, "-R", repo, "--merge"];
      if (whenGreen) args.push("--auto");
      if (force) args.push("--admin");
      const result = await shr("gh", args, { timeout: 60000 });
      prCache.delete(key);
      if (!result.ok) return json({ error: result.error.split("\n").filter(Boolean).slice(-2).join(" ") || "gh refused the merge" }, 400);
      return json({ ok: true, scheduled: !!whenGreen });
    });

    on("POST", "/api/prs/branch", async (req, res, url, json) => {
      const key = prKey((await bodyOf(req)).key);
      if (!key) return json({ error: "missing key" }, 400);
      const [repo, number] = key.split("#");
      const raw = extractJson(await sh("gh", ["pr", "view", number, "-R", repo, "--json", "state,headRefName,isCrossRepository"], { timeout: 25000 }));
      if (!raw?.headRefName) return json({ error: "gh did not return this PR" }, 502);
      if (raw.state === "OPEN") return json({ error: "the PR is still open: deleting its branch would close it" }, 400);
      if (raw.isCrossRepository) return json({ error: "the branch lives in a fork" }, 400);
      const result = await shr("gh", ["api", "-X", "DELETE", `repos/${repo}/git/refs/heads/${branchRef(raw.headRefName)}`], { timeout: 25000 });
      prCache.delete(key);
      if (!result.ok && !BRANCH_ALREADY_GONE.test(result.error)) return json({ error: result.error.split("\n").filter(Boolean).pop() || "gh refused to delete the branch" }, 400);
      return json({ ok: true });
    });

    on("POST", "/api/prs/review", async (req, res, url, json) => {
      const { key: rawKey, action, text } = await bodyOf(req);
      const key = prKey(rawKey);
      if (!key) return json({ error: "missing key" }, 400);
      const [repo, number] = key.split("#");
      const flags = { comment: "--comment", approve: "--approve", changes: "--request-changes" };
      if (!flags[action]) return json({ error: "unknown action" }, 400);
      if (action !== "approve" && !String(text || "").trim()) return json({ error: "write the comment" }, 400);
      const args = ["pr", "review", number, "-R", repo, flags[action]];
      if (String(text || "").trim()) args.push("-b", String(text));
      const result = await shr("gh", args, { timeout: 30000 });
      prCache.delete(key);
      if (!result.ok) return json({ error: result.error.split("\n").filter(Boolean).pop() || "gh refused" }, 400);
      return json({ ok: true });
    });
  }

  return {
    register,
    prData,
    collectPrs,
    checksSummary,
    readJobLog,
    prTalk,
    oneCommit,
    prPicture,
    pictureKind,
    pullPage,
    prCache,
    paused: () => ghPausedUntil
  };
}

export function registerPrRoutes(on, context) {
  const domain = createPrDomain(context);
  domain.register(on, context.bodyOf);
  return domain;
}

export { NOISE, PICTURE };

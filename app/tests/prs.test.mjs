import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrDomain, NOISE, PICTURE } from "../routes/prs.mjs";

const extractJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const hive = () => {
  const asked = [];
  let live = 0;
  let peak = 0;
  let iAm = "jonas";
  let registry = [];
  let sessions = [];
  let answer = () => ({ ok: true, out: "{}", error: "" });
  const readRegistry = async () => JSON.parse(JSON.stringify(registry));
  const writeRegistry = async (list) => { registry = list; };
  const retire = async (keys) => {
    const list = await readRegistry();
    let changed = false;
    for (const key of keys) {
      const known = list.find((pr) => pr.key === key);
      if (!known) {
        list.push({ key, retired: true, at: new Date().toISOString() });
        changed = true;
      } else if (!known.retired) {
        known.retired = true;
        changed = true;
      }
    }
    if (changed) await writeRegistry(list);
  };
  const shr = async (command, args) => {
    asked.push(args.join(" "));
    live++;
    peak = Math.max(peak, live);
    await new Promise((done) => setTimeout(done, 1));
    live--;
    return answer(args);
  };
  const sh = async (command, args) => {
    asked.push(args.join(" "));
    if (args.join(" ") === "api user -q .login") return iAm;
    return answer(args).out || "";
  };
  const domain = createPrDomain({
    sh,
    shr,
    extractJson,
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    liveSessions: () => sessions,
    readRegistry,
    writeRegistry,
    retire
  });
  return {
    ...domain,
    asked,
    viewsAsked: () => asked.filter((request) => request.startsWith("pr view")),
    peak: () => peak,
    registry: () => registry,
    seed: (list) => { registry = list; },
    nameless: () => { iAm = ""; },
    onScreen: (list) => { sessions = list; },
    reply: (fn) => { answer = fn; }
  };
};

const prJson = (over = {}) => JSON.stringify({
  number: 1,
  title: "a pull request",
  url: "https://github.com/o/r/pull/1",
  state: "OPEN",
  isDraft: false,
  author: { login: "jonas" },
  headRefName: "branch",
  baseRefName: "main",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  reviewDecision: "",
  mergeable: "MERGEABLE",
  statusCheckRollup: [],
  updatedAt: new Date(Date.now() - 60000).toISOString(),
  body: "",
  ...over
});

const merged = (agoMs) => prJson({ state: "MERGED", updatedAt: new Date(Date.now() - agoMs).toISOString() });

test("a merged PR is not asked about again for hours, an open one is", async () => {
  const h = hive();
  h.reply(() => ({ ok: true, out: prJson(), error: "" }));
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  h.prCache.set("o/r#1", { at: fiveMinutesAgo, data: { key: "o/r#1", state: "merged" } });
  h.prCache.set("o/r#2", { at: fiveMinutesAgo, data: { key: "o/r#2", state: "open" } });

  await h.prData("o/r#1");
  assert.deepEqual(h.viewsAsked(), []);

  await h.prData("o/r#2");
  assert.equal(h.viewsAsked().length, 1);
});

test("two requests for the same PR at once ask GitHub once", async () => {
  const h = hive();
  h.reply(() => ({ ok: true, out: prJson(), error: "" }));
  await Promise.all([h.prData("o/r#1"), h.prData("o/r#1"), h.prData("o/r#1")]);
  assert.equal(h.viewsAsked().length, 1);
});

test("a rate limit holds every other question until the window resets", async () => {
  const h = hive();
  const reset = Math.floor((Date.now() + 900000) / 1000);
  h.reply((args) => args[0] === "api"
    ? { ok: true, out: String(reset), error: "" }
    : { ok: false, out: "", error: "API rate limit exceeded for user ID 1" });

  const first = await h.prData("o/r#1");
  assert.match(first.error, /rate limit/i);
  assert.ok(h.paused() > Date.now());

  const asksBefore = h.viewsAsked().length;
  const second = await h.prData("o/r#2");
  assert.equal(h.viewsAsked().length, asksBefore);
  assert.match(second.error, /rate limit/i);
});

test("the panel keeps what it read before when GitHub answers 502", async () => {
  const h = hive();
  h.prCache.set("o/r#1", { at: 0, data: { key: "o/r#1", state: "open", title: "read before" } });
  h.reply(() => ({ ok: false, out: "", error: "HTTP 502" }));
  const data = await h.prData("o/r#1");
  assert.equal(data.title, "read before");
  assert.match(data.stale, /GitHub is down/);
});

test("a PR merged yesterday leaves the panel and is retired in the registry", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", session: "a-chat" }]);
  h.reply(() => ({ ok: true, out: merged(3 * 24 * 60 * 60 * 1000), error: "" }));
  const list = await h.collectPrs();
  assert.deepEqual(list, []);
  assert.equal(h.registry()[0].retired, true);
});

test("a retired PR still on a chat's screen is not asked about again", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", retired: true }]);
  h.onScreen([{ name: "a-chat", prs: ["https://github.com/o/r/pull/1"] }]);
  h.reply(() => ({ ok: true, out: prJson(), error: "" }));
  const list = await h.collectPrs();
  assert.deepEqual(list, []);
  assert.deepEqual(h.viewsAsked(), []);
});

test("a PR someone else opened, seen on a chat's screen, does not become that chat's", async () => {
  const h = hive();
  h.onScreen([{ name: "a-chat", prs: ["https://github.com/o/r/pull/1"] }]);
  h.reply(() => ({ ok: true, out: prJson({ author: { login: "rafael" } }), error: "" }));
  const list = await h.collectPrs();
  assert.deepEqual(list, []);
  assert.equal(h.registry()[0].retired, true);
});

test("a PR someone else opened that you pasted yourself stays on the panel", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", session: "a-chat", chosen: true }]);
  h.reply(() => ({ ok: true, out: prJson({ author: { login: "rafael" } }), error: "" }));
  const list = await h.collectPrs();
  assert.equal(list.length, 1);
  assert.ok(!h.registry()[0].retired);
});

test("a PR with no chat behind it is left alone, whoever opened it", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", session: "" }]);
  h.reply(() => ({ ok: true, out: prJson({ author: { login: "rafael" } }), error: "" }));
  const list = await h.collectPrs();
  assert.equal(list.length, 1);
  assert.ok(!h.registry()[0].retired);
});

test("when GitHub will not say who you are, no PR is taken off the panel", async () => {
  const h = hive();
  h.nameless();
  h.seed([{ key: "o/r#1", session: "a-chat" }]);
  h.reply(() => ({ ok: true, out: prJson({ author: { login: "rafael" } }), error: "" }));
  const list = await h.collectPrs();
  assert.equal(list.length, 1);
  assert.ok(!h.registry()[0].retired);
});

test("a wide registry is asked in lanes, not all at once", async () => {
  const h = hive();
  h.seed(Array.from({ length: 12 }, (_, i) => ({ key: `o/r#${i + 1}` })));
  h.reply(() => ({ ok: true, out: prJson(), error: "" }));
  const list = await h.collectPrs();
  assert.equal(list.length, 12);
  assert.equal(h.viewsAsked().length, 12);
  assert.ok(h.peak() <= 4, `asked ${h.peak()} at once`);
});

const ROLLUP = [
  {
    __typename: "CheckRun",
    name: "tests",
    workflowName: "ci",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-08-20T19:47:58Z",
    completedAt: "2026-08-20T19:49:10Z",
    detailsUrl: "https://github.com/o/r/actions/runs/32410608825/job/96559891864"
  },
  {
    __typename: "CheckRun",
    name: "build",
    workflowName: "release",
    status: "IN_PROGRESS",
    startedAt: "2026-08-20T19:47:57Z",
    detailsUrl: "https://github.com/o/r/actions/runs/32410608825/job/96559892197"
  },
  { __typename: "StatusContext", context: "CodeRabbit", state: "SUCCESS", targetUrl: "" }
];

test("every check keeps its own name, workflow and how long it took", () => {
  const { checks } = hive().checksSummary(ROLLUP);
  assert.deepEqual(checks.map((c) => c.name), ["tests", "build", "CodeRabbit"]);
  assert.deepEqual(checks.map((c) => c.state), ["failed", "running", "passed"]);
  assert.equal(checks[0].workflow, "ci");
  assert.equal(checks[0].took, 72000);
});

test("a check run carries the ids the log and the rerun need, a status context does not", () => {
  const { checks } = hive().checksSummary(ROLLUP);
  assert.deepEqual({ run: checks[0].run, job: checks[0].job }, { run: 32410608825, job: 96559891864 });
  assert.deepEqual({ run: checks[2].run, job: checks[2].job }, { run: 0, job: 0 });
});

test("a running check does not count as failed while it has not finished", () => {
  const h = hive();
  assert.equal(h.checksSummary(ROLLUP).ci, "failed");
  assert.equal(h.checksSummary(ROLLUP.slice(1)).ci, "running");
  assert.equal(h.checksSummary([]).ci, "none");
  assert.deepEqual(h.checksSummary([]).checks, []);
});

test("a PR with CI still running is asked about again sooner than a settled one", async () => {
  const h = hive();
  h.reply(() => ({ ok: true, out: prJson(), error: "" }));
  const halfAMinuteAgo = Date.now() - 30000;
  h.prCache.set("o/r#1", { at: halfAMinuteAgo, data: { key: "o/r#1", state: "open", ci: "passed" } });
  h.prCache.set("o/r#2", { at: halfAMinuteAgo, data: { key: "o/r#2", state: "open", ci: "running" } });

  await h.prData("o/r#1");
  assert.deepEqual(h.viewsAsked(), []);

  await h.prData("o/r#2");
  assert.equal(h.viewsAsked().length, 1);
});

const ESC = String.fromCharCode(27);
const BOM = String.fromCharCode(0xfeff);
const LOG = [
  `Lint\tRun linting\t${BOM}2026-08-20T18:57:37.1871592Z [group]Run pnpm lint:check`,
  `Lint\tRun linting\t2026-08-20T18:57:37.1871965Z ${ESC}[36;1mpnpm lint:check${ESC}[0m`,
  "Lint\tRun linting\t2026-08-20T18:57:37.1878359Z ^[[36mshell^[[0m: /usr/bin/bash -e {0}",
  "Lint\tRun linting\t2026-08-20T18:57:37.1878839Z [endgroup]",
  "Lint\tRun linting\t2026-08-20T18:57:46.0013920Z src/foo.spec.ts format",
  "Lint\tRun linting\t2026-08-20T18:57:47.0000000Z [error]Process completed with exit code 1."
].join("\n");

test("a job log loses the job, step and timestamp columns, and the escape codes with them", () => {
  const { lines } = hive().readJobLog(LOG);
  assert.equal(lines[1].text, "pnpm lint:check");
  assert.equal(lines[1].step, "Run linting");
  assert.deepEqual(lines.map((l) => l.kind), ["group", "line", "line", "line", "bad"]);
  assert.equal(lines[0].text, "Run pnpm lint:check");
  assert.equal(lines[2].text, "shell: /usr/bin/bash -e {0}");
  assert.equal(lines[4].text, "Process completed with exit code 1.");
});

test("a log longer than the cap keeps the end, where the error is, and says how much it dropped", () => {
  const many = Array.from({ length: 900 }, (_, i) => `tests\tRun npm test\t2026-08-20T18:57:37Z line ${i}`).join("\n");
  const { lines, cut } = hive().readJobLog(many, 400);
  assert.equal(cut, 500);
  assert.equal(lines.length, 400);
  assert.equal(lines[lines.length - 1].text, "line 899");
});

test("an empty log is not an error, it is just no lines", () => {
  assert.deepEqual(hive().readJobLog(""), { cut: 0, lines: [] });
});

const TALK_OWN = JSON.stringify({
  comments: [{ author: { login: "jonas" }, createdAt: "2026-08-20T12:00:00Z", body: "does it reproduce?", url: "u1" }],
  reviews: [
    { author: { login: "vini" }, submittedAt: "2026-08-20T13:00:00Z", body: "", state: "APPROVED" },
    { author: { login: "ana" }, submittedAt: "2026-08-20T14:00:00Z", body: "", state: "COMMENTED" }
  ]
});

const TALK_INLINE = JSON.stringify([{
  user: { login: "vini" },
  created_at: "2026-08-20T11:00:00Z",
  body: "extract this into a constant",
  path: "app/doctor/doctor-core.mjs",
  line: 67,
  diff_hunk: "@@ -1 +1 @@\n a\n b\n c\n+d",
  html_url: "u2"
}]);

test("the conversation puts comments, reviews and diff threads on one line, oldest first", async () => {
  const h = hive();
  h.reply((args) => ({ ok: true, out: args[0] === "api" ? TALK_INLINE : TALK_OWN, error: "" }));
  const talk = await h.prTalk("o/r#1");
  assert.deepEqual(talk.map((t) => t.kind), ["inline", "comment", "review"]);
  assert.equal(talk[0].path, "app/doctor/doctor-core.mjs");
  assert.equal(talk[0].line, 67);
  assert.equal(talk[2].verdict, "approved");
});

test("an empty review that only carries inline notes does not become a message of its own", async () => {
  const h = hive();
  h.reply((args) => ({ ok: true, out: args[0] === "api" ? "[]" : TALK_OWN, error: "" }));
  const talk = await h.prTalk("o/r#1");
  assert.equal(talk.filter((t) => t.who === "ana").length, 0);
});

test("a commit keeps the short sha, the headline and who wrote it", () => {
  const c = hive().oneCommit({
    oid: "a3f9c21b8e4d5f6a7b8c9d0e1f2a3b4c5d6e7f80",
    messageHeadline: "fix(cli): doctor stops when Canopy is down",
    messageBody: "why",
    authors: [{ login: "umaArtemis" }],
    committedDate: "2026-08-20T10:00:00Z"
  });
  assert.deepEqual(c, {
    sha: "a3f9c21",
    title: "fix(cli): doctor stops when Canopy is down",
    body: "why",
    who: "umaArtemis",
    when: "2026-08-20T10:00:00Z"
  });
});

test("a pull request GitHub says does not exist drops off the list on its own", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", session: "a-chat" }]);
  h.reply(() => ({ ok: false, out: "", error: "GraphQL: Could not resolve to a Repository with the name 'o/r'. (repository)" }));
  const list = await h.collectPrs();
  assert.deepEqual(list, []);
  assert.equal(h.registry()[0].retired, true);
});

test("one the panel could not read for a passing reason stays, and says why", async () => {
  const h = hive();
  h.seed([{ key: "o/r#1", session: "a-chat" }]);
  h.reply(() => ({ ok: false, out: "", error: "HTTP 502" }));
  const list = await h.collectPrs();
  assert.equal(list.length, 1);
  assert.match(list[0].error, /GitHub is down/);
  assert.ok(!list[0].missing);
  assert.ok(!h.registry()[0].retired);
});

const pictures = () => {
  const asked = [];
  let answer = () => ({ status: 200, headers: new Map(), body: Buffer.from("") });
  const sh = async (command, args) => {
    asked.push(args.join(" "));
    if (args[0] === "auth") return "gho_test\n";
    return JSON.stringify({ head: { sha: "headsha" }, base: { sha: "basesha" } });
  };
  const fetchImpl = async (where) => {
    asked.push(where);
    const response = answer(where);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: (name) => response.headers.get(name) ?? null },
      arrayBuffer: async () => response.body
    };
  };
  const domain = createPrDomain({
    sh,
    shr: async () => ({ ok: true, out: "{}", error: "" }),
    extractJson,
    languageOf: () => "",
    paintLines: (text) => text.split("\n"),
    fetchImpl
  });
  return {
    NOISE,
    PICTURE,
    pictureKind: domain.pictureKind,
    prPicture: domain.prPicture,
    asked,
    reply: (fn) => { answer = fn; }
  };
};

const answered = (status, body = Buffer.from("png"), headers = {}) => () => ({
  status,
  headers: new Map(Object.entries(headers)),
  body
});

test("an image is a file to look at, not noise to bury at the end of the list", () => {
  const h = pictures();
  for (const path of ["docs/tela.png", "app/assets/icon.jpg", "web/logo.svg", "a/frame.gif"]) {
    assert.equal(h.NOISE.test(path), false, `${path} was filed as noise`);
    assert.ok(h.PICTURE.test(path), `${path} was not recognised as an image`);
  }
  for (const path of ["package-lock.json", "app/assets/icon.icns", "web/f.woff2", "dist/app.js"]) {
    assert.equal(h.NOISE.test(path), true, `${path} stopped being noise`);
  }
});

test("the kind the browser is told matches the extension, not what GitHub answers", () => {
  const h = pictures();
  assert.equal(h.pictureKind("a/b.PNG"), "image/png");
  assert.equal(h.pictureKind("a/b.jpeg"), "image/jpeg");
  assert.equal(h.pictureKind("a/b.svg"), "image/svg+xml");
  assert.equal(h.pictureKind("a/b.mjs"), "");
});

test("each side of the diff is read from its own commit", async () => {
  const h = pictures();
  h.reply(answered(200));

  const now = await h.prPicture("o/r#7", "docs/tela.png", "after");
  assert.equal(now.ok, true);
  assert.equal(now.kind, "image/png");
  assert.ok(h.asked.some((a) => a.includes("/contents/docs/tela.png?ref=headsha")));

  const was = await h.prPicture("o/r#7", "docs/tela.png", "before");
  assert.equal(was.ok, true);
  assert.ok(h.asked.some((a) => a.includes("/contents/docs/tela.png?ref=basesha")));

  assert.equal(h.asked.filter((a) => a.startsWith("api repos/")).length, 1, "GitHub was asked twice for the same two commits");
});

test("a path that climbs out of the repo never reaches GitHub", async () => {
  const h = pictures();
  const out = await h.prPicture("o/r#7", "../../../etc/secret.png", "after");
  assert.equal(out.ok, undefined);
  assert.equal(out.code, 400);
  assert.deepEqual(h.asked, []);
});

test("a file that is not an image is refused before GitHub is asked", async () => {
  const h = pictures();
  const out = await h.prPicture("o/r#7", "app/server.mjs", "after");
  assert.equal(out.code, 400);
  assert.deepEqual(h.asked, []);
});

test("an image that only exists on one side says so instead of hanging on a broken picture", async () => {
  const h = pictures();
  h.reply(answered(404));
  const out = await h.prPicture("o/r#7", "docs/tela.png", "before");
  assert.equal(out.code, 404);
  assert.match(out.error, /not on that side/);
});

test("an image too heavy to open is refused before it is read", async () => {
  const h = pictures();
  h.reply(answered(200, Buffer.from("png"), { "content-length": String(64 << 20) }));
  const out = await h.prPicture("o/r#7", "docs/tela.png", "after");
  assert.equal(out.code, 413);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const mem = await app("memories");
const { MAC_KEYS, CTRL_KEYS, DEFAULT_CHORDS } = await app("core");

const el = (sel) => document.querySelector(sel);
const all = (sel) => [...document.querySelectorAll(sel)];
const settle = () => new Promise((done) => setTimeout(done, 30));

const MINE = [
  { id: "-hub/deploy.md", project: "-hub", file: "deploy.md", name: "deploy", title: "Deploy em PR é preview", hook: "não é produção", description: "Deploy de PR sobe um preview", type: "project", scope: "team", proposed: null, at: 3, text: "corpo" },
  { id: "-hub/ptbr.md", project: "-hub", file: "ptbr.md", name: "ptbr", title: "Responder em pt-BR", hook: "", description: "Sempre em português", type: "feedback", scope: "personal", proposed: null, at: 2, text: "" },
  { id: "-hub/sales.md", project: "-hub", file: "sales.md", name: "sales", title: "Sales é o lead-engine", hook: "", description: "Pipeline", type: "reference", scope: "", proposed: null, at: 1, text: "" },
  { id: "-side/lixo.md", project: "-side", file: "lixo.md", name: "lixo", title: "", hook: "", description: "Projeto pessoal", type: "user", scope: "team", proposed: { number: 12, url: "https://github.com/acme/hub/pull/12", repo: "acme/hub" }, at: 0, text: "" }
];

function serve(over = {}) {
  const answers = {
    mine: { state: "ok", projects: [{ id: "-hub", label: "~/hub", count: 3 }, { id: "-side", label: "~/side", count: 1 }], memories: MINE, settled: null },
    proposals: { state: "ok", repo: "acme/hub", me: "jonas", proposals: [] },
    team: { state: "ok", repo: "acme/hub", found: true, index: "", memories: [] },
    ...over
  };
  const posted = [];
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, "http://hive");
    if (init.method === "POST") {
      const sent = JSON.parse(init.body || "{}");
      posted.push({ path: url.pathname, body: sent });
      const said = answers.post ? answers.post(url.pathname, sent) : { status: 200, body: { state: "ok" } };
      return { ok: said.status >= 200 && said.status < 300, status: said.status, json: async () => said.body };
    }
    let body = {};
    if (url.pathname === "/api/memories/mine") body = answers.mine;
    if (url.pathname === "/api/memories/mine/one") body = { state: "ok", memory: { body: "Roda em **preview**.\n\n<script>alert(1)</script>" } };
    if (url.pathname === "/api/memories/proposals") body = answers.proposals;
    if (url.pathname === "/api/memories/team") body = answers.team;
    return { ok: true, status: 200, json: async () => body };
  };
  return posted;
}

function reset() {
  mem.closeMemories();
  Object.assign(st.mem, { tab: "mine", mine: null, project: "all", filter: "all", query: "", pick: "", detail: {}, chosen: [], classify: null, undo: null, notice: null, error: null, busy: "", proposals: null, pickPr: 0, prBusy: 0, prError: null, team: null, pickTeam: "", teamQuery: "", teamEdit: null, teamConfirm: "", teamBusy: "" });
}

async function open() {
  mem.openMemories();
  await settle();
  await settle();
}

test("the shortcut is option shift M, with a chord and a palette line", () => {
  assert.deepEqual(MAC_KEYS.memories, { alt: true, shift: true, code: "KeyM" });
  assert.deepEqual(CTRL_KEYS.memories, { ctrl: true, alt: true, code: "KeyM" });
  assert.equal(DEFAULT_CHORDS.memories, "shift+m");
  assert.match(page, /<button class="ghost" id="btn-memories">memories <kbd id="k-memories">/);
  assert.match(readFileSync(join(HERE, "src/app/palette.js"), "utf8"), /keyHint\("memories"\), go: \(\) => run\("memories"\)/);
});

test("the filters split team candidates, personal, without scope and all, and a proposed one is no longer a candidate", () => {
  assert.deepEqual(mem.shownMine(MINE, { filter: "candidates" }).map((one) => one.id), ["-hub/deploy.md"]);
  assert.deepEqual(mem.shownMine(MINE, { filter: "personal" }).map((one) => one.id), ["-hub/ptbr.md"]);
  assert.deepEqual(mem.shownMine(MINE, { filter: "none" }).map((one) => one.id), ["-hub/sales.md"]);
  assert.deepEqual(mem.shownMine(MINE, { project: "-side" }).map((one) => one.id), ["-side/lixo.md"]);
  assert.deepEqual(mem.filterCounts(MINE), { candidates: 1, personal: 1, none: 1, all: 4 });
});

test("search finds a memory by any word of its title, description or body, without caring for accents or case", () => {
  assert.deepEqual(mem.shownMine(MINE, { query: "PRODUCAO" }).map((one) => one.id), ["-hub/deploy.md"]);
  assert.deepEqual(mem.shownMine(MINE, { query: "portugues sempre" }).map((one) => one.id), ["-hub/ptbr.md"]);
  assert.deepEqual(mem.shownMine(MINE, { query: "corpo" }).map((one) => one.id), ["-hub/deploy.md"]);
});

test("the pull request text names each memory with its description", () => {
  const one = mem.proposalText([MINE[0]]);
  assert.equal(one.title, "Team memory: Deploy em PR é preview");
  assert.match(one.body, /- \*\*Deploy em PR é preview\*\*: Deploy de PR sobe um preview/);
  assert.equal(mem.proposalText(MINE.slice(0, 2)).title, "Team memory: 2 memories");
});

test("a check problem reads as a sentence, the secret named in words", () => {
  assert.equal(mem.problemSay({ file: "x.md", kind: "secret", what: "GitHub token" }), "x.md looks like it has a GitHub token");
  assert.equal(mem.problemSay({ file: "x.md", kind: "exists" }), "x.md already exists in the team memory");
  assert.equal(mem.problemSay({ file: "x.md", kind: "nobody-knows" }), "x.md did not pass the check");
});

test("Mine lists every folder, each row with its scope label, the proposed one with its PR, and the body as markdown that cannot run", async () => {
  reset();
  serve();
  await open();
  assert.equal(el("#memories").hidden, false);
  assert.equal(el("[data-mem-tab='mine']").getAttribute("aria-selected"), "true");
  assert.deepEqual(all("#memories [data-mem-project]").map((one) => one.dataset.memProject), ["all", "-hub", "-side"]);
  const rows = all("#memories .mem-row[data-memory]");
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((one) => one.querySelector(".mem-scope").dataset.scope), ["team", "personal", "none", "team"]);
  assert.deepEqual(rows.map((one) => one.querySelector(".mem-scope").textContent), ["Team", "Personal", "no scope", "Team"]);
  assert.equal(rows[3].querySelector(".mem-pr").textContent, "in PR #12");
  assert.equal(rows[3].querySelector("[data-mem-choose]").disabled, true, "a proposed memory cannot be proposed again");
  assert.equal(el("[data-mem-filter='candidates'] .mem-n").textContent, "1");
  assert.match(el("[data-mem-classify-start]").textContent, /Classify 1 without scope/);
  assert.equal(el("[data-mem-propose]").disabled, true, "nothing chosen, nothing to propose");
  const body = el("#memories .mem-body");
  assert.match(body.innerHTML, /<b>preview<\/b>/);
  assert.equal(body.querySelector("script"), null);
});

test("clicking a scope label writes the other scope, and the label follows", async () => {
  reset();
  const posted = serve();
  await open();
  el("#memories .mem-row[data-memory='-hub/sales.md'] .mem-scope").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/scope", body: { id: "-hub/sales.md", scope: "team" } });
  assert.equal(el("#memories .mem-row[data-memory='-hub/sales.md'] .mem-scope").dataset.scope, "team");
  el("#memories .mem-row[data-memory='-hub/deploy.md'] .mem-scope").click();
  await settle();
  assert.deepEqual(posted.at(-1).body, { id: "-hub/deploy.md", scope: "personal" });
});

test("deleting is at once and offers undo, which asks the server to put it back", async () => {
  reset();
  const posted = serve({ post: (path) => ({ status: 200, body: path.endsWith("/delete") ? { state: "ok", entry: "123-abc" } : { state: "ok" } }) });
  await open();
  el("#memories .mem-row[data-memory='-hub/ptbr.md']").click();
  await settle();
  el("[data-mem-delete]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/delete", body: { id: "-hub/ptbr.md" } });
  assert.equal(el("#memories .mem-row[data-memory='-hub/ptbr.md']"), null);
  assert.match(el("[data-mem-undo-bar]").textContent, /“Responder em pt-BR” was deleted/);
  el("[data-mem-undo]").click();
  await settle();
  assert.deepEqual(posted.find((one) => one.path === "/api/memories/mine/undo").body, { entry: "123-abc" });
});

test("classifying asks the judge for the ones without scope, shows each verdict to switch or untick, and saves only what was kept", async () => {
  reset();
  const posted = serve({ post: (path, sent) => {
    if (path.endsWith("/classify")) return { status: 200, body: { state: "ok", verdicts: sent.ids.map((id) => ({ id, scope: "team", reason: "nome de produto" })), failures: [] } };
    return { status: 200, body: { state: "ok", entry: "9-x" } };
  } });
  await open();
  el("[data-mem-classify-start]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/classify", body: { ids: ["-hub/sales.md"] } });
  const verdict = el("[data-mem-verdict='-hub/sales.md']");
  assert.match(verdict.textContent, /nome de produto/);
  verdict.querySelector(".mem-scope").click();
  await settle();
  assert.equal(el("[data-mem-verdict='-hub/sales.md'] .mem-scope").dataset.scope, "personal");
  el("[data-mem-classify-save]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/scope", body: { scopes: [{ id: "-hub/sales.md", scope: "personal" }] } });
  assert.equal(el("[data-mem-classify]"), null);
  assert.equal(el("#memories .mem-row[data-memory='-hub/sales.md'] .mem-scope").dataset.scope, "personal");
});

test("proposing sends the chosen ones with the PR text, and a blocked proposal lists what the check found", async () => {
  reset();
  let blocked = true;
  const posted = serve({ post: () => (blocked
    ? { status: 422, body: { state: "blocked", problems: [{ file: "deploy.md", kind: "secret", what: "AWS key" }] } }
    : { status: 200, body: { state: "ok", pr: { number: 30, url: "https://github.com/acme/hub/pull/30", repo: "acme/hub" } } }) });
  await open();
  el("#memories .mem-row[data-memory='-hub/deploy.md'] [data-mem-choose]").click();
  await settle();
  assert.match(el("[data-mem-propose]").textContent, /Propose 1 to the team/);
  el("[data-mem-propose]").click();
  await settle();
  assert.deepEqual(posted.at(-1).body.ids, ["-hub/deploy.md"]);
  assert.equal(posted.at(-1).body.title, "Team memory: Deploy em PR é preview");
  assert.match(el("[data-mem-error]").textContent, /deploy\.md looks like it has a AWS key/);
  blocked = false;
  el("[data-mem-propose]").click();
  await settle();
  assert.match(el("[data-mem-notice]").textContent, /Proposal open in PR #30/);
  assert.equal(el("#memories .mem-row[data-memory='-hub/deploy.md'] .mem-pr").textContent, "in PR #30");
});

test("a merged proposal comes back as a notice that the personal copies left, with undo", async () => {
  reset();
  serve({ mine: { state: "ok", projects: [], memories: [], settled: { entry: "77-z", merged: [{ number: 12, count: 2 }] } } });
  await open();
  assert.match(el("[data-mem-notice]").textContent, /2 memories came into the team through #12/);
  assert.ok(el("[data-mem-undo]"));
});

const PROPOSALS = { state: "ok", repo: "acme/hub", me: "jonas", proposals: [
  { number: 41, title: "Memória do time: deploy", url: "https://github.com/acme/hub/pull/41", author: "Jonas", checks: "passing", problems: [], memories: [{ file: "deploy.md", change: "added", name: "deploy", description: "preview", body: "corpo **forte**" }] },
  { number: 42, title: "Memória do time: sales", url: "https://github.com/acme/hub/pull/42", author: "bruno", checks: "failing", problems: [{ file: "sales.md", kind: "unlisted" }], memories: [{ file: "sales.md", change: "added", name: "sales", description: "", body: "x" }] }
] };

test("Proposals shows each PR with its memories and checks, and the author cannot approve their own", async () => {
  reset();
  serve({ proposals: PROPOSALS });
  await open();
  el("[data-mem-tab='proposals']").click();
  await settle();
  assert.equal(el("[data-mem-tab='proposals'] .mem-n").textContent, "2");
  assert.deepEqual(all("[data-mem-pr]").map((one) => one.dataset.memPr), ["41", "42"]);
  assert.match(el("[data-mem-piece='deploy.md'] .mem-body").innerHTML, /<b>forte<\/b>/);
  assert.equal(el("[data-mem-approve]").disabled, true);
  assert.match(el("[data-mem-approve-hint]").textContent, /someone else has to approve/);
  el("[data-mem-pr='42']").click();
  await settle();
  assert.equal(el("[data-mem-approve]").disabled, false);
  assert.match(el("[data-mem-problems]").textContent, /sales\.md is not in the MEMORY\.md index/);
});

test("approving someone else's proposal posts the number and says when GitHub held the merge", async () => {
  reset();
  const posted = serve({ proposals: PROPOSALS, post: () => ({ status: 202, body: { state: "approved", why: "required checks pending" } }) });
  st.mem.tab = "proposals";
  await open();
  el("[data-mem-pr='42']").click();
  await settle();
  el("[data-mem-approve]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/proposals/approve", body: { number: 42 } });
  assert.match(el("[data-mem-proposal='42'] .mem-err").textContent, /Approved, but GitHub did not merge yet: required checks pending/);
});

test("The team's lists main, and editing or deleting opens a PR instead of writing", async () => {
  reset();
  const team = { state: "ok", repo: "acme/hub", found: true, index: "", memories: [{ file: "deploy.md", name: "deploy", description: "preview", type: "project", body: "corpo" }] };
  const posted = serve({ team, post: () => ({ status: 200, body: { state: "ok", pr: { number: 50, url: "https://github.com/acme/hub/pull/50" } } }) });
  st.mem.tab = "team";
  await open();
  assert.ok(el("[data-mem-team='deploy.md']"));
  el("[data-mem-team-edit]").click();
  await settle();
  const body = el("[data-mem-edit='body']");
  body.value = "corpo novo";
  body.dispatchEvent(new Event("input", { bubbles: true }));
  el("[data-mem-team-save]").click();
  await settle();
  assert.equal(posted.at(-1).path, "/api/memories/team/edit");
  assert.deepEqual({ file: posted.at(-1).body.file, body: posted.at(-1).body.body, description: posted.at(-1).body.description }, { file: "deploy.md", body: "corpo novo", description: "preview" });
  assert.match(el("[data-mem-notice]").textContent, /PR #50 is open with the change/);
  el("[data-mem-team-delete]").click();
  await settle();
  el("[data-mem-confirm-yes]").click();
  await settle();
  assert.equal(posted.at(-1).path, "/api/memories/team/delete");
});

test("before the first merge the team tab says the folder is not on main yet", async () => {
  reset();
  serve({ team: { state: "ok", repo: "acme/hub", found: false, index: "", memories: [] } });
  st.mem.tab = "team";
  await open();
  assert.match(el("#memories [data-mem-state='empty']").textContent, /not on main yet/);
});

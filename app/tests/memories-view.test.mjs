import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";
import { demoMemories, demoStats } from "../lib/memories-demo.mjs";
import { PT_BR } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const mem = await app("memories");
const { MAC_KEYS, CTRL_KEYS, DEFAULT_CHORDS } = await app("core");

const NOW = new Date(2026, 9, 3, 15, 0).getTime();
const DAY = 86400000;
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const el = (sel) => document.querySelector(sel);
const settle = () => new Promise((done) => setTimeout(done, 30));

function serve(over = {}) {
  const all = demoMemories(NOW);
  const answers = {
    active: { state: "ok", demo: true, source: "memory.example.dev", at: NOW, memories: all.filter((one) => one.status === "active").map(({ content, ...rest }) => rest) },
    archived: { state: "ok", demo: true, source: "memory.example.dev", at: NOW, memories: all.filter((one) => one.status === "archived").map(({ content, ...rest }) => rest) },
    stats: { state: "ok", demo: true, source: "memory.example.dev", at: NOW, stats: demoStats(NOW, 12) },
    ...over
  };
  const posted = [];
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, "http://hive");
    let body = {};
    if (init.method === "POST") {
      const sent = JSON.parse(init.body || "{}");
      posted.push({ path: url.pathname, body: sent });
      const said = answers.post ? answers.post(url.pathname, sent) : { status: 200, body: {} };
      return { ok: said.status >= 200 && said.status < 300, status: said.status, json: async () => said.body };
    }
    if (url.pathname === "/api/memories/login") body = answers.login || { state: "out", reach: "here" };
    if (url.pathname === "/api/memories") body = answers[url.searchParams.get("status")];
    if (url.pathname === "/api/memories/stats") body = answers.stats;
    if (url.pathname === "/api/memories/one") body = { state: "ok", memory: answers.one || all.find((one) => one.id === url.searchParams.get("id")) || null };
    return { ok: true, status: 200, json: async () => body };
  };
  return posted;
}

function fresh() {
  st.memNow = NOW;
  st.mem = { tab: "memories", active: null, archived: null, stats: null, folder: "all", origin: "all", query: "", pick: "", detail: {}, asked: false, login: null, edit: null, confirm: "", busy: "", actError: null };
}

test("the shortcut is option shift M, free of the composer's option M, with a chord and a palette line", () => {
  assert.deepEqual(MAC_KEYS.memories, { alt: true, shift: true, code: "KeyM" });
  assert.deepEqual(MAC_KEYS.compose, { alt: true, code: "KeyM" }, "option M stays the composer's");
  assert.deepEqual(CTRL_KEYS.memories, { ctrl: true, alt: true, code: "KeyM" });
  const taken = (keys) => Object.entries(keys).filter(([name, one]) => name !== "memories" && one && one.code === "KeyM" && !!one.alt === true && !!one.shift === true && !one.ctrl && !one.meta);
  assert.deepEqual(taken(MAC_KEYS), []);
  assert.equal(DEFAULT_CHORDS.memories, "shift+m");
  assert.equal(Object.values(DEFAULT_CHORDS).filter((one) => one === "shift+m").length, 1);
  assert.match(page, /<button class="ghost" id="btn-memories">memories <kbd id="k-memories">/);
  assert.match(readFileSync(join(HERE, "src/app/palette.js"), "utf8"), /keyHint\("memories"\), go: \(\) => run\("memories"\)/);
});

test("an automatic memory nobody used is counted down to its archiving, 60 days after it was born", () => {
  assert.equal(mem.daysUntilArchive({ origin: "automatica", retrieved_count: 0, date: iso(48), status: "active" }, NOW), 12);
  assert.equal(mem.daysUntilArchive({ origin: "automatica", retrieved_count: 0, date: iso(75), status: "active" }, NOW), 0);
  assert.equal(mem.daysUntilArchive({ origin: "automatica", retrieved_count: 1, date: iso(48), status: "active" }, NOW), null, "one use saves it");
  assert.equal(mem.daysUntilArchive({ origin: "manual", retrieved_count: 0, date: iso(48), status: "active" }, NOW), null, "a hand-written one never fades");
  assert.equal(mem.daysUntilArchive({ origin: "automatica", retrieved_count: 0, date: iso(48), status: "archived" }, NOW), null);
  assert.equal(mem.soonArchived([{ origin: "automatica", retrieved_count: 0, date: iso(48) }, { origin: "automatica", retrieved_count: 0, date: iso(20) }], NOW), 1);
});

test("folders count by repository, put the memories with no repository under General, and keep the archived apart", () => {
  const active = [{ repo: "api" }, { repo: "api" }, { repo: "acme" }, { repo: null }];
  const folders = mem.memoryFolders(active, [{ repo: "acme" }]);
  assert.deepEqual(folders.map((one) => [one.key, one.n]), [["all", 4], ["api", 2], ["acme", 1], ["-", 1], ["archived", 1]]);
});

test("the list filters by folder, origin and words, and the most used come first", () => {
  const active = [
    { id: "a", title: "Deploy só na main", repo: "api", origin: "automatica", retrieved_count: 3, date: iso(1), tags: ["deploy"] },
    { id: "b", title: "reader_id é perfil", repo: "api", origin: "manual", retrieved_count: 9, date: iso(2), tags: [] },
    { id: "c", title: "Lint é ultracite", repo: "frontend", origin: "automatica", retrieved_count: 1, date: iso(3), tags: [] }
  ];
  assert.deepEqual(mem.shownMemories(active, [], { folder: "all" }).map((one) => one.id), ["b", "a", "c"]);
  assert.deepEqual(mem.shownMemories(active, [], { folder: "api", origin: "automatica" }).map((one) => one.id), ["a"]);
  assert.deepEqual(mem.shownMemories(active, [], { query: "DEPLOY" }).map((one) => one.id), ["a"]);
  assert.deepEqual(mem.shownMemories(active, [{ id: "z" }], { folder: "archived" }).map((one) => one.id), ["z"]);
});

test("the week starts on monday, and only what was born since then counts as new", () => {
  const monday = mem.weekStart(NOW);
  assert.equal(new Date(monday).getDay(), 1);
  assert.equal(mem.newThisWeek([{ date: new Date(monday + 3600000).toISOString() }, { date: new Date(monday - 3600000).toISOString() }], NOW), 1);
});

test("the weekly chart stacks the hand-written on top of the automatic, scales to a round top and marks when the bridge came on", () => {
  const chart = mem.weeklyChart([
    { week: "2026-W30", automatica: 0, manual: 2 },
    { week: "2026-W31", automatica: 0, manual: 3 },
    { week: "2026-W32", automatica: 4, manual: 1 },
    { week: "2026-W33", automatica: 7, manual: 1 }
  ]);
  assert.deepEqual(chart.ticks.map((one) => one.value), [0, 5, 10]);
  const [first, , third, last] = chart.bars;
  assert.equal(first.autoH, 0);
  assert.equal(Math.round(first.handY + first.handH), chart.floor);
  assert.equal(Math.round(third.handY + third.handH), Math.round(third.autoY), "the hand-written sit on top of the automatic");
  assert.equal(Math.round(last.autoH + last.handH), Math.round(((7 + 1) / 10) * (chart.floor - 20)));
  assert.ok(chart.bridgeX > first.x && chart.bridgeX < third.x);
  assert.equal(first.label, "W30");
  assert.equal(mem.weeklyChart([{ week: "2026-W30", automatica: 3, manual: 0 }]).bridgeX, null, "with no week before it, there is no bridge to mark");
  assert.equal(mem.weeklyChart([{ week: "x", automatica: 30, manual: 4 }]).ticks.at(-1).value, 40);
});

test("the funnel adds what the bridge brought, and the search cut reads as a share", () => {
  const funnel = mem.judgeFunnel({ searches: 100, candidates_judged: 9120, cut_by_judge: 7387, duplicates_blocked: 31, bridge_created: 44, bridge_updated: 26, bridge_discarded: 111 });
  assert.equal(funnel.came, 212);
  assert.deepEqual(funnel.rows.map((one) => one.n), [212, 111, 31, 44, 26]);
  assert.equal(funnel.rows.find((one) => one.on).key, "created");
  assert.equal(funnel.cutShare, 81);
  assert.equal(funnel.helped, 1733);
  assert.equal(mem.judgeFunnel(null).came, 0);
  assert.equal(mem.lastWeeksAdded([{ automatica: 9, manual: 9 }, { automatica: 1, manual: 1 }, { automatica: 2, manual: 0 }], 2), 4);
  assert.equal(mem.bridgeCeilingHeld([{ bridge_created: 9 }, { bridge_created: 3 }]), true);
  assert.equal(mem.bridgeCeilingHeld([{ bridge_created: 10 }]), false);
  assert.deepEqual(mem.repoBars([{ repo: "a", count: 4 }, { repo: null, count: 8 }]).map((one) => [one.say, one.share, one.on]), [["General", 100, true], ["a", 50, false]]);
});

test("time reads in words, and a date in day and month", () => {
  assert.equal(mem.agoSay(new Date(NOW - 3 * 3600000).toISOString(), NOW), "3 h ago");
  assert.equal(mem.agoSay(iso(2), NOW), "2 days ago");
  assert.equal(mem.agoSay(iso(15), NOW), "2 weeks ago");
  assert.equal(mem.agoSay(iso(40), NOW), "a month ago");
  assert.equal(mem.dateSay(new Date(2026, 9, 1, 12).toISOString()), "01/10");
});

test("the memories tab draws folders, rows with their origin and use, and the picked memory as markdown that cannot run", async () => {
  fresh();
  serve({ one: { id: "demo-001", title: "Deploy da API só dispara por push na main", origin: "automatica", repo: "api", author: "@bruno", date: iso(2), retrieved_count: 23, status: "active", content: "# Deploy da API só dispara por push na main\n\nRoda em **main**.\n\n<img src=x onerror=alert(1)><script>alert(2)</script>" } });
  mem.openMemories();
  await settle();
  await settle();
  assert.equal(el("#memories").hidden, false);
  assert.equal(el("#memories [data-mem-folder='all'] .n").textContent, String(demoMemories(NOW).filter((one) => one.status === "active").length));
  assert.ok(el("#memories [data-mem-folder='-']"), "the General folder is there");
  assert.ok(el("#memories [data-mem-folder='archived']"));
  const rows = [...document.querySelectorAll("#memories .mem-row")];
  assert.ok(rows.length > 10);
  assert.match(rows[0].textContent, /23 uses/);
  assert.equal(rows[0].getAttribute("aria-selected"), "true");
  assert.ok(el("#memories .mem-row [data-mem-origin='auto']"));
  assert.ok(el("#memories .mem-row [data-mem-origin='hand']"));
  assert.match(el("#memories").textContent, /archives in \d+ days if nobody uses it/);
  assert.match(el("[data-mem-fresh]").textContent, /new this week/);
  assert.match(el("#memories .mem-demo").textContent, /sample data/);
  const body = el("#memories .mem-body");
  assert.match(body.innerHTML, /<b>main<\/b>/);
  assert.equal(body.querySelector("script"), null, "a script in a memory stays text");
  assert.equal(body.querySelector("img"), null, "an image tag in a memory stays text");
  assert.ok(!/<h1/.test(body.innerHTML), "the title is not repeated as a heading");
  assert.equal(el("[data-mem-archive]").disabled, true);
  assert.equal(el("[data-mem-edit-open]").disabled, true);
  assert.match(el("#memories .mem-lock").textContent, /sign in with your Google account/);
  assert.ok(el("#memories [data-mem-signin-here]"), "the lock offers the sign-in right where it is needed");
  assert.ok(el("#memories .mem-top [data-mem-signin]"));

  el("#memories [data-mem-filter='manual']").click();
  await settle();
  assert.ok([...document.querySelectorAll("#memories .mem-row [data-mem-origin]")].every((one) => one.dataset.memOrigin === "hand"));
  el("#memories [data-mem-folder='hub']").click();
  await settle();
  assert.ok(document.querySelectorAll("#memories .mem-row").length >= 1);
  mem.closeMemories();
  assert.equal(el("#memories").hidden, true);
  assert.equal(el("#memories .mem-row"), null, "the rows do not stay mounted behind a hidden panel");
});

test("the detail keeps the original author and lists who changed the memory, newest first, with where it happened", async () => {
  await openOn({ one: {
    id: "demo-001", title: "Deploy da API só dispara por push na main", origin: "automatica", repo: "api", author: "bruno", date: iso(9), retrieved_count: 23, status: "active", content: "x",
    updated_by: "ana@example.com",
    history: [
      { at: "2026-09-28", action: "edited", by: "ana@example.com", via: "painel" },
      { at: "2026-10-01", action: "merged", by: "renato", via: "ponte" },
      { at: "2026-10-02", action: "hacked", by: "x", via: "chat" }
    ]
  } });
  const facts = [...document.querySelectorAll("#memories .mem-kv dt")].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]);
  assert.match(facts[0][1], /^bruno, from a conversation in api/);
  const changes = facts.filter(([say]) => say === "added to" || say === "edited");
  assert.deepEqual(changes, [
    ["added to", "by renato on 01/10 · by the team memory bridge"],
    ["edited", "by ana@example.com on 28/09 · in the panel"]
  ]);
  mem.closeMemories();
});

test("a folder with nothing in it explains how memories arrive and offers the way back", async () => {
  fresh();
  serve();
  mem.openMemories();
  await settle();
  st.mem.query = "nothing-will-match-this";
  mem.paintMemories();
  await settle();
  assert.ok(el("#memories [data-mem-state='empty']"));
  el("#memories [data-mem-state='empty'] button").click();
  await settle();
  assert.equal(st.mem.query, "");
  assert.ok(document.querySelectorAll("#memories .mem-row").length > 0);
  mem.closeMemories();
});

test("the summary tab draws the four numbers, the stacked weeks, the funnel and the cleanup, and never invents a cost", async () => {
  fresh();
  const { spend, unanswered, ...bare } = demoStats(NOW, 12);
  serve({ stats: { state: "ok", demo: false, source: "memory.example.dev", at: NOW, stats: { ...bare, judge: { ...bare.judge, health: { calls: 0, fallbacks: 0, avg_ms: 0 } }, spend: null } } });
  mem.openMemories();
  await settle();
  el("#memories [data-mem-tab='summary']").click();
  await settle();
  await settle();
  const kpis = [...document.querySelectorAll("#memories [data-mem-kpi]")];
  assert.deepEqual(kpis.map((one) => one.dataset.memKpi), ["active", "auto", "helped", "cost"]);
  assert.equal(el("[data-mem-kpi='cost'] .mem-kv-big").textContent, "—");
  assert.match(el("[data-mem-kpi='cost']").textContent, /ai-costs/);
  assert.equal(el("[data-mem-kpi='cost'] .mem-cap-bar"), null);
  assert.equal(el("#memories [data-mem-health]"), null, "with no call to Jev there is no health line");
  assert.equal(el("#memories [data-mem-unanswered]"), null);
  assert.ok(document.querySelectorAll("#memories [data-mem-chart] rect.mem-auto").length > 3);
  assert.ok(document.querySelectorAll("#memories [data-mem-chart] rect.mem-hand").length > 3);
  assert.equal(document.querySelectorAll("#memories [data-mem-funnel] .mem-fr").length, 5);
  assert.ok(document.querySelectorAll("#memories [data-mem-repos] .mem-hb").length > 3);
  assert.equal(document.querySelectorAll("#memories [data-mem-top] .mem-li").length, 5);
  assert.match(el("#memories [data-mem-clean]").textContent, /archived because nobody used them in 60 days/);
  el("#memories [data-mem-top] .mem-li").click();
  await settle();
  assert.equal(st.mem.tab, "memories", "a most-used line opens that memory");
  mem.closeMemories();
});

test("no token shows the no-access card that points at the doctor, and a dead server with a kept list shows the list under a warning", async () => {
  fresh();
  serve({ active: { state: "no-token", source: "memory.example.dev", key: "MEMORY_MCP_READ_TOKEN", at: NOW }, archived: { state: "no-token", source: "memory.example.dev", key: "MEMORY_MCP_READ_TOKEN", at: NOW } });
  mem.openMemories();
  await settle();
  const card = el("#memories [data-mem-state='no-token']");
  assert.ok(card);
  assert.equal(card.querySelector("code").textContent, "MEMORY_MCP_READ_TOKEN");
  assert.match(card.textContent, /hive doctor/);
  mem.closeMemories();

  fresh();
  const kept = demoMemories(NOW).filter((one) => one.status === "active").slice(0, 3);
  serve({ active: { state: "down", source: "memory.example.dev", at: NOW, why: "timeout", keptAt: new Date(2026, 9, 3, 14, 2).getTime(), memories: kept } });
  mem.openMemories();
  await settle();
  assert.match(el("#memories .mem-trouble").textContent, /memory\.example\.dev did not answer/);
  assert.match(el("#memories .mem-trouble").textContent, /from 14:02/);
  assert.equal(document.querySelectorAll("#memories .mem-row").length, 3);
  mem.closeMemories();
});

test("the panel paints only with the theme's own colours", () => {
  const css = page.split("\n").filter((line) => line.includes("#memories")).join("\n");
  assert.ok(css.length > 1000);
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g) || [], [], "no hard-coded colour — every theme has to read it");
});

async function openOn(over = {}) {
  fresh();
  const posted = serve(over);
  mem.openMemories();
  await settle();
  await settle();
  return posted;
}

test("signed out, the header offers Google; signed in, it names the person and lets them out", async () => {
  let posted = await openOn();
  const button = el("#memories .mem-top [data-mem-signin]");
  assert.match(button.textContent, /Sign in with Google/);
  assert.match(el("#memories .mem-source").textContent, /read only/);
  mem.closeMemories();

  posted = await openOn({ login: { state: "in", email: "ana@example.com", canEdit: true, reach: "here" }, post: () => ({ status: 200, body: { state: "out", reach: "here" } }) });
  assert.match(el("#memories [data-mem-login='in']").textContent, /ana@example\.com/);
  assert.doesNotMatch(el("#memories .mem-source").textContent, /read only/);
  assert.equal(el("[data-mem-archive]").disabled, false);
  assert.equal(el("#memories .mem-lock"), null);
  el("#memories [data-mem-signout]").click();
  await settle();
  assert.equal(posted.at(-1).path, "/api/memories/logout");
  assert.ok(el("#memories .mem-top [data-mem-signin]"));
  mem.closeMemories();
});

test("on a Hive that runs in the pod there is no sign-in button, only the reason", async () => {
  await openOn({ login: { state: "out", reach: "pod" } });
  assert.equal(el("#memories [data-mem-signin]"), null);
  assert.match(el("#memories [data-mem-nologin]").textContent, /only works in the Hive on your machine/);
  assert.match(el("#memories .mem-lock").textContent, /only works in the Hive on your machine/);
  mem.closeMemories();
});

test("an account with no e-mail is signed in but cannot edit, and says why", async () => {
  await openOn({ login: { state: "in", email: "", canEdit: false, reach: "here" } });
  assert.equal(el("[data-mem-archive]").disabled, true);
  assert.match(el("#memories .mem-lock").textContent, /no e-mail/);
  mem.closeMemories();
});

test("the editor opens with the memory, keeps what is typed, and sends only what changed", async () => {
  const saved = { id: "demo-001", title: "Deploy só na main", updated_by: "ana@example.com", updated: new Date(NOW).toISOString() };
  const posted = await openOn({
    login: { state: "in", email: "ana@example.com", canEdit: true, reach: "here" },
    post: (path) => (path === "/api/memories/edit" ? { status: 200, body: { state: "ok", memory: saved } } : { status: 200, body: {} })
  });
  el("[data-mem-edit-open]").click();
  await settle();
  const editor = el("#memories [data-mem-editor]");
  assert.ok(editor);
  assert.ok(el("#memories .mem-wrap.editing"));
  const title = el("[data-mem-edit='title']");
  assert.equal(title.value, "Deploy da API só dispara por push na main");
  assert.equal(el("[data-mem-edit='category']").value, "gotchas");
  assert.deepEqual([...document.querySelectorAll("[data-mem-tag]")].map((one) => one.dataset.memTag), ["deploy", "github-actions"]);
  assert.match(el("[data-mem-edit='content']").value, /startup_failure/);
  assert.match(editor.textContent, /editing as/);

  title.value = "Deploy só na main";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  const tag = el("[data-mem-edit='tag']");
  tag.value = "ci";
  tag.dispatchEvent(new Event("input", { bubbles: true }));
  tag.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
  assert.deepEqual([...document.querySelectorAll("[data-mem-tag]")].map((one) => one.dataset.memTag), ["deploy", "github-actions", "ci"]);
  assert.equal(el("[data-mem-edit='tag']").value, "", "the typed tag leaves the box once it became a chip");
  tag.value = "infra,";
  tag.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  assert.equal(el("[data-mem-edit='tag']").value, "");
  el("[data-mem-tag='infra'] button").click();
  await settle();
  assert.equal(el("[data-mem-edit='title']").value, "Deploy só na main", "a repaint keeps what was typed");

  el("[data-mem-view='preview']").click();
  await settle();
  assert.match(el("[data-mem-preview]").innerHTML, /<b>main<\/b>/);
  el("[data-mem-view='write']").click();
  await settle();

  el("[data-mem-save]").click();
  await settle();
  const sent = posted.find((one) => one.path === "/api/memories/edit");
  assert.deepEqual(sent.body, { id: "demo-001", title: "Deploy só na main", tags: ["deploy", "github-actions", "ci"] });
  assert.equal(el("#memories [data-mem-editor]"), null);
  assert.equal(el("#memories .mem-dt").textContent, "Deploy só na main");
  assert.match(el("#memories .mem-kv").textContent, /by ana@example\.com on 03\/10/);
  mem.closeMemories();
});

test("a refusal from the memory server shows inside the form, and a blank title never leaves", async () => {
  const posted = await openOn({
    login: { state: "in", email: "ana@example.com", canEdit: true, reach: "here" },
    post: () => ({ status: 403, body: { state: "forbidden" } })
  });
  el("[data-mem-edit-open]").click();
  await settle();
  const title = el("[data-mem-edit='title']");
  title.value = "   ";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  el("[data-mem-save]").click();
  await settle();
  assert.match(el("[data-mem-edit-error]").textContent, /title cannot be empty/);
  assert.equal(posted.length, 0);
  title.value = "Outro";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  el("[data-mem-save]").click();
  await settle();
  assert.match(el("[data-mem-edit-error]").textContent, /your account cannot edit this memory/);
  assert.ok(el("#memories [data-mem-editor]"), "the form stays open with the text");
  assert.equal(mem.memoryEscape(), true, "escape leaves the editor before it closes the panel");
  assert.equal(el("#memories [data-mem-editor]"), null);
  mem.closeMemories();
});

test("archiving asks first, and an archived memory offers to come back", async () => {
  const posted = await openOn({
    login: { state: "in", email: "ana@example.com", canEdit: true, reach: "here" },
    post: (path, sent) => ({ status: 200, body: { state: "ok", memory: { id: sent.id, status: path.endsWith("unarchive") ? "active" : "archived", updated_by: "ana@example.com" } } })
  });
  const first = st.mem.pick;
  el("[data-mem-archive]").click();
  await settle();
  assert.match(el("#memories [data-mem-confirm]").textContent, /Archive this memory\?/);
  assert.equal(posted.length, 0, "nothing goes before the confirmation");
  el("[data-mem-confirm-yes]").click();
  await settle();
  assert.deepEqual(posted[0], { path: "/api/memories/archive", body: { id: first } });
  assert.equal(st.mem.detail[first].memory.status, "archived");
  assert.equal(el("#memories [data-mem-confirm]"), null);
  mem.closeMemories();

  await openOn({ login: { state: "in", email: "ana@example.com", canEdit: true, reach: "here" } });
  el("#memories [data-mem-folder='archived']").click();
  await settle();
  assert.equal(el("[data-mem-archive]"), null);
  assert.match(el("[data-mem-unarchive]").textContent, /Unarchive/);
  assert.equal(el("[data-mem-edit-open]"), null);
  mem.closeMemories();
});

test("the summary shows the real spend against the cap, Jev's health and the questions nobody answered, as text", async () => {
  const stats = demoStats(NOW, 12);
  stats.spend = { ...stats.spend, updated_at: new Date(NOW - 42 * 60000).toISOString() };
  stats.unanswered.top[0] = { topic: "<img src=x onerror=alert(1)> como rodar", count: 14, last_at: new Date(NOW - 26 * 3600000).toISOString() };
  await openOn({ stats: { state: "ok", demo: false, source: "memory.example.dev", at: NOW, stats } });
  el("#memories [data-mem-tab='summary']").click();
  await settle();
  await settle();
  const cost = el("[data-mem-kpi='cost']");
  assert.equal(cost.querySelector(".mem-kv-big").textContent, "US$ 6.40");
  assert.match(cost.textContent, /of US\$ 20/);
  assert.match(cost.textContent, /4,310 calls|4\.310 calls/);
  assert.match(cost.textContent, /updated 42 min ago/);
  assert.equal(cost.querySelector(".mem-cap-bar i").style.width, "32%");
  assert.match(el("[data-mem-health]").textContent, /Jev answered in 99\.6% of the searches · \+0\.5 s on average/);
  const card = el("[data-mem-unanswered]");
  assert.match(card.textContent, /146/);
  assert.match(card.textContent, /the memory does not know yet/);
  const rows = [...card.querySelectorAll("[data-mem-question]")];
  assert.equal(rows.length, 5);
  assert.equal(card.querySelector("img"), null, "a question stays text");
  assert.match(rows[0].textContent, /<img src=x/);
  assert.match(rows[0].textContent, /14 times · yesterday/);
  mem.closeMemories();
});

test("a spend from an earlier month reads as no number", () => {
  assert.equal(mem.spendModel({ month_usd: 3, cap_usd: 20, requests: 9, updated_at: new Date(2026, 8, 20).toISOString() }, NOW), null);
  assert.equal(mem.spendModel(null, NOW), null);
  assert.equal(mem.judgeHealth({ calls: 0, fallbacks: 0, avg_ms: 0 }), null);
  assert.equal(mem.judgeHealth({ calls: 100, fallbacks: 20, avg_ms: 900 }).good, false);
});

test("with no memory address the Google button is off and the panel says how to fix it", async () => {
  const posted = await openOn({ login: { state: "out", reach: "here", configured: false } });
  const button = el("#memories .mem-top [data-mem-signin]");
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute("aria-describedby"), "mem-login-err");
  const said = el("#memories [data-mem-login-err='missing']");
  const fix = "The memory address is not set up in this Hive. Run infra/scripts/setup.sh again and reopen the Hive.";
  assert.equal(said.textContent.trim(), fix);
  assert.equal(PT_BR[fix], "O endereço da memória não está configurado neste Hive. Rode o infra/scripts/setup.sh de novo e reabra o Hive.");
  assert.equal(said.getAttribute("role"), "status");
  assert.match(el("#memories .mem-lock").textContent, /setup\.sh/);
  assert.equal(el("#memories .mem-lock [data-mem-signin-here]"), null);
  button.click();
  await settle();
  assert.deepEqual(posted, [], "a switched-off button never reaches the server");
  mem.closeMemories();
});

test("a sign-in that fails to start says why next to the button, in words", async () => {
  await openOn({ post: () => ({ status: 502, body: { state: "out", reach: "here", configured: false, why: "HIVE_MEMORY_URL is not set" } }) });
  el("#memories [data-mem-signin]").click();
  await settle();
  assert.match(el("#memories [data-mem-login-err]").textContent, /The memory address is not set up in this Hive/);
  assert.equal(el("#memories [data-mem-signin]").disabled, true);
  mem.closeMemories();

  await openOn({ post: () => ({ status: 502, body: { state: "out", reach: "here", configured: true, why: "the memory server answered 503 for its oauth metadata" } }) });
  el("#memories [data-mem-signin]").click();
  await settle();
  const failed = el("#memories [data-mem-login-err='failed']");
  assert.equal(failed.getAttribute("role"), "alert");
  assert.match(failed.textContent, /The sign-in did not start\. Try again in a moment \(the memory server answered 503 for its oauth metadata\)\./);
  assert.equal(el("#memories [data-mem-signin]").disabled, false, "a passing failure lets the person try again");
  mem.closeMemories();

  await openOn({ post: () => ({ status: 409, body: { state: "out", reach: "here", configured: true, why: "busy" } }) });
  el("#memories [data-mem-signin]").click();
  await settle();
  assert.match(el("#memories [data-mem-login-err]").textContent, /\(busy\)/);
  mem.closeMemories();

  fresh();
  serve();
  const working = globalThis.fetch;
  globalThis.fetch = async (path, init = {}) => {
    if (init.method === "POST") throw new TypeError("Failed to fetch");
    return working(path, init);
  };
  mem.openMemories();
  await settle();
  await settle();
  el("#memories [data-mem-signin]").click();
  await settle();
  assert.match(el("#memories [data-mem-login-err]").textContent, /The Hive did not answer the sign-in/);
  mem.closeMemories();
});

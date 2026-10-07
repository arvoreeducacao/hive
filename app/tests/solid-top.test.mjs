import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const st = await state();
const { $, phrase, solidMounts } = await app("core");
const { blocksViewModel, paintBlocks, teamRailViewModel } = await app("mirror");
const { paintStrip, stripViewModel } = await app("arrange");
const { knocksViewModel, paintNudge } = await app("team");
const { limPopViewModel, limitChipViewModel, paintLimitChip } = await app("limit-chip");
const { prButtonViewModel, prPopViewModel } = await app("seat-menu");
const { paintComposerTo } = await app("seat-layout");
const { paintHold } = await app("hold-numbers");
await app("worktrees");
await app("new-chat");

const seat = (name, over = {}) => ({ name, state: "idle", where: "local", ...over });

function world(over = {}) {
  st.space = "w1";
  st.spaces = over.spaces || [{ id: "w1", tint: "#111", name: "one" }];
  st.blocks = over.blocks || [];
  st.block = over.block === undefined ? 0 : over.block;
  st.holding = over.holding || null;
  st.mirrorDev = over.mirrorDev || "";
  st.mirrorKey = over.mirrorKey || "";
  st.team = over.team || { devs: [] };
  st.data = { sessions: over.sessions || [], spawning: [] };
  st.knocksOpen = over.knocks || [];
  st.nudgeQueue = [];
  st.prs = over.prs || [];
  st.limits = over.limits || { accounts: [], tightest: "" };
  st.keys.arrange = { alt: true, code: "KeyA" };
  return st;
}

const SHORTCUT = /^(⌥|Alt\+)A$/;

const A_FACE = /^<span class="team-av face av-alive"><svg/;

test("the workspace chip carries the floor it is on, and the held row carries every floor numbered", () => {
  const over = {
    spaces: [{ id: "w1", tint: "#111", name: "one" }, { id: "w2", tint: "#222", name: "two" }],
    blocks: [{ ws: "w1", keys: ["a"], label: "the block", manual: true }],
    sessions: [seat("a", { state: "needs" })]
  };
  world(over);
  const shut = blocksViewModel();
  assert.equal(shut.open, null);
  assert.equal(shut.chip.tint, "#111");
  assert.equal(shut.chip.name, "one");
  assert.equal(shut.chip.count, 1);
  assert.equal(shut.chip.expanded, "false");
  assert.match(shut.chip.hint, SHORTCUT, "the chip has to carry the shortcut that opens the pile");
  assert.equal(shut.chip.title, "one — every workspace is a floor, and this opens the pile of them");
  world({ ...over, holding: "space" });
  const held = blocksViewModel();
  assert.equal(held.chip, null);
  assert.deepEqual(held.open.map((one) => [one.n, one.id, one.on, one.count]), [[1, "w1", true, 1], [2, "w2", false, 0]]);
});

test("a block tab says its number, its label, how full it is and whether anyone is calling", () => {
  world({
    blocks: [{ ws: "w1", keys: ["a", "b"], label: "the block", manual: true }, { ws: "other", keys: [] }],
    sessions: [seat("a", { state: "needs" }), seat("b")]
  });
  const model = blocksViewModel();
  assert.equal(model.tabs.length, 1, "a block of another floor is not a tab here");
  assert.deepEqual(model.tabs[0], {
    key: "b0", i: 0, n: 1, name: "the block", tally: "2/4", calls: true, pressed: "true", title: "block 1: the block"
  });
  world({ blocks: [{ ws: "w1", keys: ["b"] }], sessions: [seat("b", { title: "the reader" })], block: 9 });
  const quiet = blocksViewModel();
  assert.equal(quiet.tabs[0].calls, false);
  assert.equal(quiet.tabs[0].pressed, "false");
  assert.equal(quiet.tabs[0].name, "the reader", "a block nobody named borrows the name of the chat inside it");
  world({ blocks: [{ ws: "w1", keys: [] }] });
  assert.equal(blocksViewModel().tabs[0].name, "unnamed");
});

test("mirroring somebody hides the workspace chip and puts their face on the bar", () => {
  world({ mirrorDev: "jott4", team: { devs: [{ dev: "jott4", up: true, seats: [1, 2, 3] }] } });
  const model = blocksViewModel();
  assert.equal(model.chip, null);
  assert.equal(model.open, null);
  assert.equal(model.mirror.dev, "jott4");
  assert.equal(model.mirror.count, 3);
  assert.equal(model.mirror.title, "jott4's hive — read-only");
  assert.match(model.mirror.avatar, A_FACE);
});

test("the strip says which block you are on and what is waiting, with the bold part apart from the text", () => {
  world({ blocks: [{ ws: "w1", keys: ["a", "b"] }], sessions: [seat("a", { state: "needs" }), seat("b", { errand: "e1" })] });
  const model = stripViewModel(st.blocks[0], [seat("a", { state: "needs" }), seat("b", { errand: "e1" })]);
  assert.equal(model.num, "block 1 of 1");
  assert.equal(model.seats, "2 of 4 seats · 1 errand of yours · ");
  assert.equal(model.bold, "1 waiting on you");
  assert.equal(model.mirrorOf, false);
});

test("with nothing to say the strip is a dash, and a mirror says whose hive it is", () => {
  world();
  assert.deepEqual(stripViewModel(null, []), { key: "strip", mirrorOf: false, num: "—", seats: "", bold: "" });
  world({ mirrorDev: "jott4", team: { devs: [{ dev: "jott4", up: true, seats: [seat("a", { state: "needs" }), seat("b")] }] } });
  const mirror = stripViewModel(null, []);
  assert.equal(mirror.mirrorOf, true);
  assert.equal(mirror.num, "mirror · jott4");
  assert.equal(mirror.seats, "2 seats · read-only · ");
  assert.equal(mirror.bold, "1 need jott4");
});

test("a row is keyed by the machine, so two computers of one person never share a line", () => {
  world({
    mirrorKey: "k-rafa",
    team: { devs: [
      { dev: "jott4", key: "k-jott4", machine: "air", up: true, seats: [1, 2] },
      { dev: "rafa", key: "k-rafa", machine: "studio", up: true, seats: [] },
      { dev: "ana", key: "k-ana", machine: "mini", up: false, seats: [] }
    ] }
  });
  const model = teamRailViewModel();
  assert.deepEqual(model.groups.map((g) => g.key), ["team"], "nothing of mine is running, so there is no group of mine");
  const [team] = model.groups;
  assert.equal(team.count, 1);
  assert.deepEqual(team.devs.map((one) => one.key), ["k-jott4", "k-rafa", "k-ana"]);
  assert.deepEqual(team.devs.map((one) => one.name), ["jott4", "rafa", "ana"],
    "one machine each, so the label says the person and never the hardware");
  assert.deepEqual(team.devs.map((one) => one.tally), ["2", "—", "zzz"]);
  assert.deepEqual(team.devs.map((one) => one.hint), ["jott4 — 2 seats", "rafa — nothing running", "ana — server asleep"]);
  assert.deepEqual(team.devs.map((one) => one.here), [false, true, false]);
  assert.deepEqual(team.devs.map((one) => one.quiet), [false, true, true]);
  assert.match(team.devs[0].avatar, A_FACE);
});

test("my machines sit in a group of my own, and the team group goes back to meaning other people", () => {
  world({
    team: { devs: [
      { dev: "pedro", key: "k-aqui", machine: "aqui", up: true, seats: [1, 2, 3], mine: true },
      { dev: "pedro", key: "k-studio", machine: "studio", up: true, seats: [1], mine: true },
      { dev: "pedro", key: "k-macbook", machine: "macbook", up: true, seats: [1, 2], mine: true },
      { dev: "art", key: "k-art", machine: "air", up: true, seats: [1] },
      { dev: "ana", key: "k-um", machine: "um", up: true, seats: [] },
      { dev: "ana", key: "k-dois", machine: "dois", up: true, seats: [1] }
    ], here: "k-aqui" }
  });
  const model = teamRailViewModel();
  assert.deepEqual(model.groups.map((g) => g.key), ["mine", "team"], "my own machines were filed under the team");
  assert.ok(!model.groups[0].devs.some((one) => one.key === "k-aqui"),
    "the machine I am sitting at is listed among my OTHER machines, and its seats are already the rail above");
  const [mine, team] = model.groups;
  assert.deepEqual(mine.devs.map((one) => one.name), ["studio", "macbook"],
    "my own row repeats my name, which I already know");
  assert.equal(mine.count, 2);
  assert.deepEqual(team.devs.map((one) => one.name), ["art", "ana · um", "ana · dois"],
    "art has one computer and still had to read its name; ana has two and needs to tell them apart");
  assert.equal(team.count, 2, "the count is the machines with something running — art's one and the one of ana's two that is busy");
  assert.equal(mine.devs[1].hint, "macbook — 2 seats");

  st.team.devs[4].seats = [1];
  assert.equal(teamRailViewModel().groups[1].count, 3,
    "the number counts machines, not people: ana busy on both computers counts twice, and that is the price of the rail listing machines");
});

test("every knock in the dock names who asked, for which seat, and both answers", () => {
  const at = Date.now() - 120000;
  world({ knocks: [{ from: "jott4", seat: "hive-3", at }], sessions: [seat("hive-3", { title: "the reader" })] });
  const model = knocksViewModel();
  assert.equal(model.title, "wants the keyboard");
  const one = model.knocks[0];
  assert.equal(one.key, `jott4:hive-3:${at}`, "two knocks from the same mate for the same seat are still two rows");
  assert.equal(one.from, "jott4");
  assert.equal(one.seat, "hive-3");
  assert.match(one.avatar, A_FACE);
  assert.equal(one.line, "the reader · 2 min");
  assert.equal(one.hint, "jott4 asked for the keyboard of the reader — 2 min ago");
  assert.equal(one.yes, "lend it");
  assert.equal(one.no, "not now");
  world({ knocks: [{ from: "a", seat: "s1" }, { from: "b", seat: "s2" }] });
  const many = knocksViewModel();
  assert.equal(many.title, "2 want the keyboard");
  assert.equal(many.knocks[0].line, "s1", "a knock with no moment says only the seat");
});

test("the bar meters the two windows that can stop you, and the popover blocks every window", () => {
  const roomy = { account: "default", provider: "claude", signedIn: true, label: "Claude", color: "#D97757", limits: [
    { kind: "session", percent: 27, resets_at: "" },
    { kind: "weekly_all", percent: 96 },
    { kind: "weekly_scoped", percent: 23, model: "Fable" }
  ] };
  world({ limits: { accounts: [roomy], tightest: "default" }, sessions: [seat("a", { account: "" })] });
  const foot = limitChipViewModel();
  const pop = limPopViewModel();
  assert.equal(foot.hidden, false);
  assert.equal(foot.accounts.length, 1);
  assert.equal(foot.accounts[0].who, "", "with one login of this agent there is no name to disambiguate");
  assert.equal(foot.accounts[0].icon, "i-claude");
  assert.equal(foot.accounts[0].color, "#D97757");
  assert.deepEqual(foot.accounts[0].parts, [
    { key: "session", k: "5h", heat: "", pct: "27%", width: "27%" },
    { key: "weekly_all", k: "week", heat: "full", pct: "96%", width: "96%" }
  ]);
  assert.equal(pop.empty, "");
  assert.equal(pop.accounts[0].named, false);
  assert.deepEqual(pop.accounts[0].limits.map((one) => one.label), ["current session", "current week · all models", "current week · Fable"]);
  assert.equal(pop.accounts[0].limits[0].pct, "27% used");
  assert.equal(pop.accounts[0].limits[0].resets, "", "no reset, no line");
  assert.equal(pop.accounts[0].limits[2].pct, "23% used", "the model-scoped week is read here, where there is room to say it");
  assert.equal(pop.accounts[0].limits[2].sub, true, "it hangs off the week it is part of");
});

test("a meter never fills past the end of the track, and no login signed in keeps the bar away", () => {
  world({ limits: { accounts: [{ account: "default", signedIn: true, limits: [{ kind: "session", percent: 140 }] }], tightest: "default" }, sessions: [seat("a", { account: "" })] });
  assert.equal(limitChipViewModel().accounts[0].parts[0].width, "100%");
  world({ limits: { accounts: [{ account: "arvore", signedIn: false, limits: [], error: "not signed in" }], tightest: "" }, sessions: [seat("a", { account: "" })] });
  const away = limitChipViewModel();
  assert.equal(away.hidden, true);
  assert.deepEqual(away.accounts, []);
  assert.equal(limPopViewModel().empty, "no login is signed in on this machine");
});

test("a login the plan refused keeps its place, with a dash and the hour it comes back", () => {
  const until = Date.parse("2026-08-29T11:20:00Z");
  world({
    limits: { accounts: [{ account: "arvore", provider: "claude", signedIn: true, limits: [], until }], tightest: "" },
    sessions: [seat("a", { account: "" })]
  });
  const foot = limitChipViewModel();
  assert.equal(foot.hidden, false, "a login that is signed in never falls off the bar");
  assert.equal(foot.accounts[0].quiet, true);
  assert.deepEqual(foot.accounts[0].parts, [{ key: "quiet", k: "", heat: "", pct: "—", width: "0%" }]);
  assert.match(limPopViewModel().accounts[0].note, /^the plan is not answering — back .+/);
});

test("the button counts what is broken first, what is ready next, and otherwise only how many there are", () => {
  let n = 0;
  const open = (over) => ({ key: `o/r#${++n}`, repo: "own/repo", number: n, state: "open", ci: "running", ...over });
  world({ prs: [] });
  assert.deepEqual(prButtonViewModel(), { key: "prbtn", lead: "", word: "", count: "0 PRs" });
  world({ prs: [open()] });
  assert.deepEqual(prButtonViewModel(), { key: "prbtn", lead: "", word: "", count: "1 PR" });
  world({ prs: [open({ ci: "failed" }), open()] });
  assert.deepEqual(prButtonViewModel(), { key: "prbtn", lead: "1", word: " failing ", count: "· 2 PRs" });
  world({ prs: [open({ mergeable: "conflicting" }), open()] });
  assert.deepEqual(prButtonViewModel(), { key: "prbtn", lead: "1", word: " ready ", count: "· 2 PRs" });
});

test("the popover shelves the pull requests, and each row carries its marks, its seat and its buttons", () => {
  world({
    sessions: [seat("a-chat", { title: "the reader" })],
    prs: [
      { key: "o/r#1", repo: "own/repo", number: 1, state: "open", ci: "failed", session: "a-chat", title: "a fix", updatedAt: new Date(Date.now() - 120000).toISOString(), checks: [{ state: "failed", name: "build", run: 7 }] },
      { key: "o/r#2", repo: "own/repo", number: 2, state: "merged", ci: "passed" }
    ]
  });
  const pop = prPopViewModel();
  assert.equal(pop.empty, false);
  assert.deepEqual(pop.rows.map((one) => one.kind), ["sec", "pr", "sec", "pr"]);
  assert.equal(pop.rows[0].text, "waiting on you");
  assert.equal(pop.rows[2].text, "landed — they leave on their own");
  assert.equal(pop.count, "1 failing");
  assert.equal(pop.bad, true);
  const row = pop.rows[1];
  assert.equal(row.prKey, "o/r#1");
  assert.equal(row.ci, "failed");
  assert.match(row.mark, /#i-x/);
  assert.equal(row.where, "repo#1");
  assert.equal(row.flag, "");
  assert.equal(row.seat, "the reader");
  assert.equal(row.seatNone, false);
  assert.equal(row.when, "2 min ago");
  assert.equal(row.why, "build failed");
  assert.deepEqual(row.acts, [
    { key: "o/r#1/log", act: "log", tone: "warn", busy: false, check: "build", label: "see the log" },
    { key: "o/r#1/rerun", act: "rerun", tone: "", busy: false, check: "", label: "rerun" }
  ]);
  const landed = pop.rows[3];
  assert.equal(landed.gone, true);
  assert.equal(landed.flag, "merged");
  assert.equal(landed.seatNone, true);
  assert.equal(landed.seat, "no chat");
  assert.equal(landed.why, "", "a landed one has nothing left to say");
});

test("an empty popover says so and counts nothing", () => {
  world({ prs: [] });
  const pop = prPopViewModel();
  assert.equal(pop.empty, true);
  assert.equal(pop.count, "");
  assert.deepEqual(pop.rows.map((one) => one.kind), ["empty"]);
});

const shown = new Map();

test("each host of the bar is handed to the solid view that owns it", () => {
  const handed = [];
  const view = (name) => {
    const held = { last: null, show(model) { held.last = model; shown.set(name, model); }, dispose() {} };
    return held;
  };
  const hive = new Proxy({}, {
    get: (_, name) => (typeof name !== "string" ? undefined : (host) => {
      handed.push([name, host]);
      return view(name);
    })
  });
  world();
  for (const mount of solidMounts) mount(hive);
  const where = new Map(handed.map(([name, host]) => [name, host && host.id]));
  for (const [mount, host] of [
    ["mountBlocks", "blocks"], ["mountStrip", "strip"], ["mountTeamRail", "rail-team"], ["mountKnocks", "knock-dock"],
    ["mountNudge", "nudge"], ["mountWorktreeRail", "rail-wt"], ["mountLimitChip", "btn-lim"], ["mountLimPop", "limpop"],
    ["mountPrButton", "btn-prs"], ["mountPrPop", "prpop"], ["mountRailToggle", "rail-toggle"], ["mountHold", "mode"],
    ["mountComposerTo", "cmp-to"]
  ]) {
    assert.equal(where.get(mount), host, `${mount} must be given #${host}`);
  }
});

test("the label of the block is written into the real input, and left alone while somebody types in it", () => {
  world({ blocks: [{ ws: "w1", keys: ["a"] }], sessions: [seat("a", { title: "the reader" })] });
  const b = st.blocks[0];
  const inp = $("f-label");
  inp.blur();
  paintStrip(b, [{ kind: "session", name: "a", title: "the reader" }]);
  assert.equal(inp.disabled, false);
  assert.equal(inp.value, "the reader");
  assert.equal(inp.title, "click to name the block");
  assert.deepEqual(shown.get("mountStrip"), stripViewModel(b, [{ kind: "session", name: "a", title: "the reader" }]));
  inp.focus();
  inp.value = "o que eu estou escrevendo";
  paintStrip(b, [{ kind: "session", name: "a", title: "outro nome" }]);
  assert.equal(inp.value, "o que eu estou escrevendo", "the paint stepped on what the person was typing");
  inp.blur();
  paintStrip(null, []);
  assert.equal(inp.disabled, true);
  assert.equal(inp.value, "");
});

test("a mirrored hive hands the label over to whoever owns it", () => {
  world({ mirrorDev: "jott4", team: { devs: [{ dev: "jott4", up: true, seats: [] }] } });
  const inp = $("f-label");
  inp.blur();
  paintStrip(null, []);
  assert.equal(inp.disabled, true);
  assert.equal(inp.value, "jott4's hive");
  assert.equal(inp.title, "another hive — the label is theirs to write");
});

test("what the bar does besides handing the model over is still done", () => {
  world({ spaces: [{ id: "w1", tint: "#2e7d32", name: "one" }] });
  paintBlocks();
  assert.equal(document.documentElement.style.getPropertyValue("--tint"), "#2e7d32");

  st.missionMode = true;
  paintComposerTo();
  assert.equal($("cmp-in").getAttribute("aria-label"), phrase("enter opens a new chat"));
  st.missionMode = false;

  st.holding = "seat";
  paintHold();
  assert.equal(document.body.classList.contains("hold-seat"), true);
  st.holding = null;
  paintHold();
  assert.equal(document.body.classList.contains("hold-seat"), false);

  world({ limits: { accounts: [{ account: "default", limits: [{ kind: "session", percent: 30 }] }], tightest: "default" }, sessions: [seat("a", { account: "" })] });
  $("limpop").hidden = false;
  shown.delete("mountLimPop");
  paintLimitChip();
  assert.deepEqual(shown.get("mountLimPop"), limPopViewModel(), "an open popover must follow the chip that fed it");
  $("limpop").hidden = true;
});

test("the nudge fills the picker with the chats that can answer, and hides it for a plain knock", () => {
  world({ sessions: [seat("a", { title: "the reader" }), seat("sh", { kind: "shell" })] });
  const knock = { from: "jott4", seat: "a", at: Date.now(), kind: "ask", text: "posso?" };
  st.knocksOpen = [knock];
  st.nudgeQueue = [knock];
  paintNudge();
  assert.equal($("nudge").hidden, false);
  assert.equal($("nudge-asked").hidden, false);
  assert.equal($("nudge-asked").textContent, "posso?");
  assert.equal($("nudge-seat").innerHTML, '<option value="a">the reader</option>', "a shell is not a chat that can answer");
  assert.equal($("nudge-yes").disabled, false);
  assert.equal($("nudge-yes").textContent, phrase("let it in"));
  const plain = { from: "jott4", seat: "a", at: Date.now() };
  st.knocksOpen = [plain];
  st.nudgeQueue = [plain];
  paintNudge();
  assert.equal($("nudge-asked").hidden, true);
  assert.equal($("nudge-yes").textContent, phrase("lend it"));
  st.knocksOpen = [];
  st.nudgeQueue = [];
  paintNudge();
  assert.equal($("nudge").hidden, true);
});

const canBuild = existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/solid-js"));

test("the bar builds into the one bundle, with every mount it owns", { skip: !canBuild && "esbuild and solid-js are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-top-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const built = await readFile(join(outdir, "hive.mjs"), "utf8");
    for (const mount of ["mountBlocks", "mountStrip", "mountLimitChip", "mountLimPop", "mountPrButton", "mountPrPop", "mountComposerTo", "mountHold", "mountTeamRail", "mountKnocks", "mountWorktreeRail", "mountRailToggle", "mountNudge"]) {
      assert.match(built, new RegExp(`\\b${mount}: \\(\\) => ${mount}\\b`), `the bundle lost ${mount}`);
    }
    for (const piece of ["ws-one", "ws-btn", "mirror-btn", "item team", "kn-acts", "wt-track", "pp-sec", "t-act", "nd-seat"]) {
      assert.ok(built.includes(piece), `the built bar lost ${piece}`);
    }
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

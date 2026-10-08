import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const source = (name) => readFileSync(join(HERE, "src/app", `${name}.js`), "utf8");

const st = await state();
await views();
const { $, stateColor } = await app("core");
const { dayViewModel } = await app("day");
const { diffs, markCurrent, prListViewModel, prMidViewModel, seen, toggleSeen, unmarkLast } = await app("thread");
const { CI_LABEL } = await app("prs");
const { shelfFiltersViewModel, shelfGalleryViewModel } = await app("shelf");
const { worktreesViewModel } = await app("worktrees");
const { portariaViewModel, ptLeft, workspaceViewModel } = await app("pod");
const { historyViewModel, shortDir, syncAgo, syncStripViewModel } = await app("history");
const { localHour, usageViewModel } = await app("usage");
const { limitHeat, limitLabel, limitWhen } = await app("limit-chip");
const { providersViewModel } = await app("providers");
const { palPreviewViewModel } = await app("palette");
const { artClock } = await app("subagents-dock");
const { ago } = await app("pod");

/* ── the day ───────────────────────────────────────── */

const dayModel = (day, over = {}) => {
  st.dayBoardOpen = false;
  for (const [key, value] of Object.entries(over)) st[key] = value;
  return dayViewModel(day);
};

const errand = (name, over = {}) => ({
  errand: name, asked: "", prs: [], closed: false,
  seats: [{ name: `${name}-1`, title: name, state: "needs", now: "asking you", asks: [] }],
  ...over
});

const emptyDay = { needsYou: [], cameBack: [], onTheWay: [], byHand: [] };

test("a day with nothing open has no brief, no fold and no zone — the screen falls back to the empty state", () => {
  const model = dayModel({ ...emptyDay });
  assert.equal(model.brief, null);
  assert.equal(model.fold, null);
  assert.deepEqual(model.zones, []);
  assert.equal(model.count, "");
});

test("the count says how many things you asked for, and adds the ones you opened by hand", () => {
  assert.equal(dayModel({ ...emptyDay, needsYou: [errand("a")] }).count, "1 thing you asked for");
  const both = dayModel({ ...emptyDay, needsYou: [errand("a"), errand("b")], byHand: [errand("c")] });
  assert.equal(both.count, "2 things you asked for · 1 chat you opened by hand");
  assert.equal(dayModel({ ...emptyDay, byHand: [errand("c")] }).count, "1 chat you opened by hand");
  assert.equal(dayModel({ ...emptyDay, byHand: [errand("c"), errand("d")] }).count, "2 chats you opened by hand");
});

test("a request waiting on you carries its cap, the name you can rename, and what the seat is saying", () => {
  const [line] = dayModel({ ...emptyDay, needsYou: [errand("ship it", { asked: "faz aí" })] }).brief.lines;
  assert.equal(line.kind, "needs");
  assert.equal(line.cap, "waiting on you");
  assert.equal(line.errand, "ship it");
  assert.equal(line.name, "ship it");
  assert.equal(line.said, "asking you");
  assert.equal(line.asked, "you asked: “faz aí”");
  assert.equal(line.fronts, "");
});

test("a request with one seat and no question offers the button that opens the chat", () => {
  const [line] = dayModel({ ...emptyDay, needsYou: [errand("solo")] }).brief.lines;
  assert.deepEqual(line.slots, []);
  assert.equal(line.acts.kind, "goto");
  assert.equal(line.acts.goto, "solo-1");
});

test("a seat that is asking gets a slot the question card can land in, named when there is more than one front", () => {
  const two = errand("many", {
    seats: [
      { name: "a", title: "Ana", state: "needs", now: "", asks: [{ id: "q1" }] },
      { name: "b", title: "Bea", state: "needs", now: "", asks: [] }
    ]
  });
  const [line] = dayModel({ ...emptyDay, needsYou: [two] }).brief.lines;
  assert.deepEqual(line.slots.map((s) => [s.ask, s.seat]), [["q1", "a"]]);
  assert.match(line.slots[0].head, /<div class="daskw">Ana is asking<\/div>/);
  assert.equal(line.acts.kind, "none");
  assert.equal(line.fronts, "· 2 fronts");
});

test("what came back offers I saw this, and says so even when there is no PR to open", () => {
  const [line] = dayModel({ ...emptyDay, cameBack: [errand("done", { prs: [] })] }).brief.lines;
  assert.equal(line.acts.kind, "back");
  assert.equal(line.acts.errand, "done");
  assert.deepEqual(line.acts.links, []);
  assert.equal(line.acts.nothing, "nothing to open yet");
});

test("a PR link is shortened to repo#number, and anything else keeps its url", () => {
  const one = errand("pr", { prs: ["https://github.com/acme/hive/pull/702", "https://x/y"] });
  const [line] = dayModel({ ...emptyDay, cameBack: [one] }).brief.lines;
  assert.deepEqual(line.acts.links.map((l) => l.say), ["hive#702", "https://x/y"]);
});

test("the greeting counts everything and bolds what is waiting on you", () => {
  const model = dayModel({ ...emptyDay, needsYou: [errand("a")], onTheWay: [errand("b")] });
  assert.equal(model.brief.hi.lead, "2 things of yours are up.");
  assert.equal(model.brief.hi.bold, "One is waiting on you.");
  const calm = dayModel({ ...emptyDay, onTheWay: [errand("b")] });
  assert.equal(calm.brief.hi.bold, "");
  assert.equal(calm.brief.hi.lead, "Nothing is waiting on you.");
});

test("the fold counts requests, chats and the ones you opened by hand — bolding only the requests", () => {
  const model = dayModel({ ...emptyDay, needsYou: [errand("a")], byHand: [errand("c")] });
  assert.deepEqual(model.fold.bits.map((b) => [b.bold, b.say]), [[true, "1 request"], [false, "1 chat open"], [false, "1 you opened by hand"]]);
  assert.equal(model.fold.say, "open the board");
  assert.equal(model.fold.up, false);
  assert.equal(model.boardOpen, false);
});

test("the board carries one zone per kind, and only the kinds that have something", () => {
  const model = dayModel({ ...emptyDay, needsYou: [errand("a")], byHand: [errand("c")] });
  assert.deepEqual(model.zones.map((z) => z.key), ["needs", "hand"]);
  assert.equal(model.zones[1].hand, true);
  const [row] = model.zones[0].errands;
  assert.equal(row.fronts, "1 front");
  assert.equal(row.seats[0].glyph, "g-needs");
  assert.equal(row.seats[0].colour, stateColor("needs"));
  assert.equal(row.seats[0].state, "needs you");
  assert.equal(row.foot, null);
});

test("in the board, what came back always shows its foot with I saw this", () => {
  const model = dayModel({ ...emptyDay, cameBack: [errand("done")] });
  const [row] = model.zones[0].errands;
  assert.equal(row.foot.seen, "done");
  assert.equal(row.foot.seenSay, "I saw this");
});

test("a seat with something running says how many instead of its state", () => {
  const one = errand("live", { seats: [{ name: "a", title: "Ana", state: "working", now: "", asks: [], live: [1, 2] }] });
  const model = dayModel({ ...emptyDay, onTheWay: [one] });
  assert.equal(model.zones[0].errands[0].seats[0].state, "2 running");
  assert.equal(model.zones[0].errands[0].seats[0].live, true);
});

/* ── the pr list ───────────────────────────────────── */

const prList = (over = {}) => {
  st.prs = over.prs || [];
  st.openPr = over.openPr ?? null;
  st.data = { sessions: (over.seats || []).map((name) => ({ name, title: `seat ${name}`, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = over.blocks || [];
  st.space = "w0";
  st.spaces = [{ id: "w0", name: "", tint: "#CD694A" }];
  return prListViewModel();
};

const pull = (over = {}) => ({ key: "k1", repo: "acme/api", number: 7, title: "a pr", state: "open", ci: "passed", ...over });

test("an empty queue says so instead of drawing an empty list", () => {
  const model = prList({ prs: [] });
  assert.deepEqual(model.rows, []);
  assert.match(model.blank, /No PR in the list/);
});

test("a row carries the repo and number, the ci chip, and marks the one that is open", () => {
  const model = prList({ prs: [pull(), pull({ key: "k2", number: 8 })], openPr: "k2" });
  assert.equal(model.rows[0].where, "api#7");
  assert.equal(model.rows[0].here, false);
  assert.equal(model.rows[1].here, true);
  assert.deepEqual(model.rows[0].chips, [{ key: "ci", ci: "passed", say: CI_LABEL.passed }]);
});

test("a pr that is not open wears its state, and a review adds its own chip", () => {
  const model = prList({ prs: [pull({ state: "merged", review: "approved" })] });
  assert.deepEqual(model.rows[0].chips.map((c) => c.key), ["state", "ci", "review"]);
  assert.equal(model.rows[0].chips[0].state, "merged");
  assert.equal(model.rows[0].chips[2].rev, "approved");
});

test("a pr that could not be read shows only what went wrong, cut short", () => {
  const model = prList({ prs: [pull({ error: "this url is not a pull request at all" })] });
  assert.deepEqual(model.rows[0].chips.map((c) => c.key), ["error"]);
  assert.equal(model.rows[0].chips[0].say.length, 22);
  assert.equal(model.rows[0].title, "a pr");
});

test("a stale pr says it was not refreshed, keeping why in the hint", () => {
  const model = prList({ prs: [pull({ stale: "github said no" })] });
  const chip = model.rows[0].chips.find((c) => c.key === "stale");
  assert.equal(chip.say, "not refreshed");
  assert.equal(chip.hint, "github said no");
});

test("the seat of a pr is a button only when the review can be opened inside that chat", () => {
  const open = prList({ prs: [pull({ session: "ada" })], seats: ["ada"], blocks: [{ id: "b1", ws: "w0", keys: ["ada"] }] });
  assert.equal(open.rows[0].seat.go, "ada");
  const noChat = prList({ prs: [pull({ session: "ada" })], seats: ["ada"], blocks: [] });
  assert.equal(noChat.rows[0].seat.go, "");
  assert.equal(noChat.rows[0].seat.cls, "go");
  const none = prList({ prs: [pull()] });
  assert.equal(none.rows[0].seat.say, "· no chat");
  assert.equal(none.rows[0].seat.cls, "");
});

/* ── the pr middle ─────────────────────────────────── */

const prMid = (over = {}) => {
  st.prs = over.prs || [];
  st.openPr = over.openPr ?? null;
  st.openFile = over.openFile ?? null;
  st.reviewingSince = over.reviewingSince || 0;
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = [];
  diffs.clear();
  if (over.files) diffs.set(st.openPr, over.files);
  return prMidViewModel();
};

const forgetSeen = () => { for (const key of Object.keys(seen)) delete seen[key]; };

test("with no pr picked the middle is blank, and the blank line breaks in two", () => {
  const model = prMid({});
  assert.equal(model.head, null);
  assert.match(model.blank, /Nothing in the queue\.<br>/);
});

test("a pr that could not be read shows its head and the trouble, and nothing else", () => {
  const model = prMid({ prs: [pull({ error: "gone", state: "?" })], openPr: "k1" });
  assert.equal(model.head.title, "api#7");
  assert.equal(model.head.chip, "unreadable");
  assert.equal(model.head.link, null);
  assert.equal(model.head.branches, "");
  assert.equal(model.trouble, "gone");
});

test("the head links to the pr, says who wrote it and how much it moves", () => {
  const model = prMid({
    prs: [pull({ url: "https://github.com/acme/api/pull/7", author: "ada", files: 3, added: 10, removed: 2, branch: "x", base: "main" })],
    openPr: "k1"
  });
  assert.deepEqual(model.head.link, { href: "https://github.com/acme/api/pull/7", say: "api#7" });
  assert.equal(model.head.notes[0].say, "by ada");
  assert.match(model.head.notes[1].html, /\+10/);
  assert.match(model.head.notes[1].html, /-2/);
  assert.equal(model.head.branches, "x → main");
  assert.equal(model.head.conflict, "");
});

test("a pr that conflicts wears the chip, and a pr with no description says so instead of an empty box", () => {
  const clash = prMid({ prs: [pull({ mergeable: "conflicting" })], openPr: "k1" });
  assert.equal(clash.head.conflict, "conflict");
  assert.equal(clash.body.open, false);
  assert.match(clash.body.html, /PR with no description/);
  const said = prMid({ prs: [pull({ body: "hello" })], openPr: "k1" });
  assert.equal(said.body.open, true);
  assert.match(said.body.html, /hello/);
});

test("while the diff has not landed the queue says it is reading, and no file row is invented", () => {
  const model = prMid({ prs: [pull()], openPr: "k1" });
  assert.equal(model.queue.files, null);
  assert.match(model.queue.reading, /reading the diff/);
  assert.equal(model.queue.caption, "files ");
});

test("every file says what it weighs, which one is open and which were already seen", () => {
  forgetSeen();
  const files = [
    { path: "a.js", added: 3, removed: 1 },
    { path: "b.lock", added: 900, removed: 900, noise: true },
    { path: "c.png", binary: true, picture: true }
  ];
  seen.k1 = ["b.lock"];
  const model = prMid({ prs: [pull()], openPr: "k1", openFile: "a.js", files });
  assert.equal(model.queue.caption, "files · 1 of 3 seen");
  const [a, b, c] = model.queue.files;
  assert.equal(a.here, true);
  assert.match(a.weight, /\+3/);
  assert.equal(b.seen, true);
  assert.equal(b.noise, true);
  assert.match(b.hint, /noise, does not ask to be read/);
  assert.match(b.mark, /i-check/);
  assert.equal(c.weight, "image");
  forgetSeen();
});

test("v marks the file and moves on, shift v walks back to the last one marked and unmarks it", () => {
  forgetSeen();
  const files = [
    { path: "a.js", added: 1, removed: 0 },
    { path: "b.js", added: 1, removed: 0 },
    { path: "c.js", added: 1, removed: 0 }
  ];
  prMid({ prs: [pull()], openPr: "k1", openFile: "a.js", files });
  markCurrent();
  assert.equal(st.openFile, "b.js");
  markCurrent();
  assert.equal(st.openFile, "c.js");
  assert.deepEqual(seen.k1, ["a.js", "b.js"]);
  unmarkLast();
  assert.equal(st.openFile, "b.js");
  assert.deepEqual(seen.k1, ["a.js"]);
  unmarkLast();
  assert.equal(st.openFile, "a.js");
  assert.deepEqual(seen.k1, []);
  unmarkLast();
  assert.equal(st.openFile, "a.js");
  forgetSeen();
});

test("the gauge fills with what you read and speaks up once the sitting is long enough", () => {
  forgetSeen();
  const p = pull();
  const calm = prMid({ prs: [p], openPr: "k1" });
  assert.equal(calm.gauge.slice, 0);
  toggleSeen(p, { path: "a.js", added: 60, removed: 40 });
  const read = prMid({ prs: [p], openPr: "k1" });
  assert.equal(read.gauge.slice, 25);
  assert.equal(read.gauge.full, false);
  assert.equal(read.gauge.message, "");
  toggleSeen(p, { path: "b.js", added: 300, removed: 100 });
  const spent = prMid({ prs: [p], openPr: "k1" });
  assert.equal(spent.gauge.slice, 100);
  assert.equal(spent.gauge.full, true);
  assert.match(spent.gauge.message, /Past 400 lines/);
  forgetSeen();
});

/* ── the shelf ─────────────────────────────────────── */

const PAGE = {
  slug: "publicar-sem-claude-ai", title: "Publicar sem claude.ai", label: "in-review",
  owner: "jonas", at: 1787428353481, description: "como a estante publica",
  tabs: { documento: { versions: [{ n: 1, label: "draft" }, { n: 2, label: "in-review" }] } }
};

const shelfWorld = (over = {}) => {
  st.shelf = over.shelf || { me: "jonas", repo: "https://github.com/acme/artifacts", pages: [PAGE] };
  st.shelfWho = over.shelfWho ?? "team";
  st.shelfState = over.shelfState ?? "";
  st.shelfShut = over.shelfShut || new Set();
};

const filters = (over) => { shelfWorld(over); return shelfFiltersViewModel(st.shelf.pages || []); };
const gallery = (over) => { shelfWorld(over); return shelfGalleryViewModel(); };

test("the filter chips count what is mine, what is the team's and how many wear each state", () => {
  const model = filters();
  assert.deepEqual(model.chips.map((c) => c.key), ["who:mine", "who:team", "state:draft", "state:in-review", "state:decided", "state:delivered", "state:closed"]);
  assert.equal(model.chips[0].n, 1);
  assert.equal(model.chips[1].on, true);
  assert.equal(model.chips.find((c) => c.key === "state:in-review").n, 1);
});

test("a shelf with no repo explains how to point it at one, in html so the code tag survives", () => {
  const model = gallery({ shelf: { pages: [] } });
  assert.match(model.blank.html, /<code>shelf<\/code>/);
  assert.deepEqual(model.bands, []);
});

test("filters that match nothing are told apart from a shelf nobody has published to", () => {
  const filtered = gallery({ shelfState: "decided" });
  assert.match(filtered.blank.say, /Nothing here with those filters/);
  const fresh = gallery({ shelf: { me: "jonas", repo: "https://github.com/x/y", pages: [] } });
  assert.match(fresh.blank.say, /the first page you publish lands here/);
});

test("a card points at the newest version of the tab it opens, and says which state it is in", () => {
  const [band] = gallery().bands;
  assert.equal(band.key, "waiting");
  assert.equal(band.open, true);
  assert.equal(band.caret, "▾");
  const [card] = band.cards;
  assert.equal(card.slug, "publicar-sem-claude-ai");
  assert.equal(card.tab, "documento");
  assert.equal(card.thumb.src, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=2");
  assert.equal(card.thumb.say, "v2");
  assert.equal(card.thumb.img, "", "no picture yet: the card shows the empty well");
  assert.equal(card.shut, "no");
  assert.equal(card.hint, `Publicar sem claude.ai · ${artClock(PAGE.at)}`);
  assert.equal(card.sub, "como a estante publica");
  assert.deepEqual(card.chips.map((c) => c.state), ["in-review"]);
});

test("a band that is folded shut keeps its count and paints no card", () => {
  const model = gallery({ shelfShut: new Set(["waiting"]) });
  const [band] = model.bands;
  assert.equal(band.key, "waiting");
  assert.equal(band.open, false);
  assert.equal(band.caret, "▸");
  assert.equal(band.count, 1);
  assert.deepEqual(band.cards, []);
});

test("a page that was closed is marked shut so the card can grey itself out", () => {
  const model = gallery({ shelf: { me: "jonas", repo: "https://github.com/x/y", pages: [{ ...PAGE, label: "closed" }] } });
  assert.equal(model.bands[0].cards[0].shut, "yes");
});

/* ── the worktrees ─────────────────────────────────── */

const worktrees = (over = {}) => {
  st.wt = over.wt ?? null;
  st.wtHours = over.wtHours ?? 1;
  st.wtBusy = over.wtBusy ?? "";
  return worktreesViewModel();
};

const tree = (over = {}) => ({ path: "/w/one", repo: "acme/api", branch: "b1", bytes: 1000, touched: 1, idle: true, ...over });

test("before the first read the worktree screen says it is asking, with no numbers to show", () => {
  const model = worktrees();
  assert.equal(model.top, null);
  assert.match(model.note, /asking every repo/);
});

test("a machine with no worktree says so instead of drawing an empty group", () => {
  const model = worktrees({ wt: { hub: "/hub", at: 0, trees: [] } });
  assert.ok(model.top);
  assert.equal(model.tiles, null);
  assert.match(model.none, /every repo is a single checkout/);
});

test("the idle-after picker marks the hours in use", () => {
  const model = worktrees({ wt: { hub: "/hub", at: 0, trees: [] }, wtHours: 6 });
  assert.deepEqual(model.top.hours.map((h) => [h.value, h.on]), [["1", false], ["3", false], ["6", true], ["24", false]]);
});

test("a worktree row says what is holding it and how much of the biggest one it takes", () => {
  const model = worktrees({
    wt: { hub: "/hub", at: 0, trees: [tree({ seat: "ada", loose: 2 }), tree({ path: "/w/two", bytes: 500 })], idle: 1, sweep: 1, sized: true, bytes: 1500, idleBytes: 500 }
  });
  const [big, small] = model.groups[0].rows;
  assert.equal(big.live, "yes");
  assert.equal(big.share, 100);
  assert.deepEqual(big.badges.map((b) => b.key), ["seat", "loose"]);
  assert.match(big.badges[1].say, /2 files nobody committed/);
  assert.equal(small.share, 50);
  assert.equal(small.badges.length, 0);
});

test("the row being deleted says it is going and refuses another click", () => {
  const model = worktrees({ wt: { hub: "/hub", at: 0, trees: [tree()], idle: 0, sweep: 0 }, wtBusy: "/w/one" });
  assert.equal(model.groups[0].rows[0].busy, true);
  assert.equal(model.groups[0].rows[0].delSay, "going…");
});

test("with nothing to sweep the sweep button says so and stays out of reach", () => {
  const model = worktrees({ wt: { hub: "/hub", at: 0, trees: [tree()], idle: 0, sweep: 0, sized: true, bytes: 1, idleBytes: 0 } });
  assert.equal(model.sweep.off, true);
  assert.equal(model.sweep.say, "nothing to sweep");
});

/* ── the workspace ─────────────────────────────────── */

const workspace = (over = {}) => {
  st.wsState = over.wsState ?? null;
  return workspaceViewModel();
};

test("before the hub is read the workspace says it is reading", () => {
  const model = workspace();
  assert.equal(model.top, null);
  assert.match(model.note, /reading the hub/);
});

test("a checkout with no hub config lists what it found on disk", () => {
  const model = workspace({ wsState: { state: "none", hub: "/hub", repos: [{ name: "api", cloned: true, branch: "main" }] } });
  assert.equal(model.state, "none");
  assert.equal(model.reposCount, 1);
  assert.equal(model.repos[0].shape, "");
  assert.equal(model.repos[0].mark, "main");
});

test("a repo nobody cloned, and one holding work, are told apart by shape and by mark", () => {
  const model = workspace({
    wsState: { state: "none", repos: [{ name: "gone", cloned: false }, { name: "busy", cloned: true, loose: 2, ahead: 1 }] }
  });
  assert.equal(model.repos[0].shape, "gone");
  assert.equal(model.repos[0].mark, "not cloned");
  assert.equal(model.repos[1].shape, "loose");
  assert.match(model.repos[1].mark, /i-pen/);
  assert.match(model.repos[1].mark, /<b>2<\/b>/);
  assert.match(model.repos[1].mark, /<b>1<\/b>/);
});

test("a config that did not load says where it is and what went wrong", () => {
  const model = workspace({ wsState: { state: "unreadable", path: "/hub/hub.json", said: "bad json", repos: [] } });
  assert.equal(model.state, "unreadable");
  assert.equal(model.path, "/hub/hub.json");
  assert.equal(model.said, "bad json");
});

test("a manifest that read carries its counts, and every skill and mcp says which side it is missing from", () => {
  const model = workspace({
    wsState: {
      state: "read", name: "acme-hub", path: "hive.json",
      repos: [{ name: "extra", declared: false, cloned: true, branch: "main" }, { name: "api", declared: true, cloned: true, branch: "main" }],
      skills: [
        { name: "delivery", declared: true, onDisk: true, scoped: false },
        { name: "mobile-app", declared: true, onDisk: false, scoped: true },
        { name: "pr-lens", declared: false, onDisk: true, scoped: false }
      ],
      mcps: [
        { name: "linear", declared: true, wired: true, gateway: false, remote: true, scoped: false },
        { name: "acme-mysql", declared: true, wired: true, gateway: true, remote: false, scoped: true },
        { name: "criar-postgresql", declared: true, wired: false, gateway: false, remote: false, scoped: true },
        { name: "sentry", declared: false, wired: true, gateway: true, remote: false, scoped: false }
      ],
      counts: {
        declared: 3, cloned: 2, missing: 1, undeclared: 1,
        skills: { declared: 2, onDisk: 2, onlyDeclared: 1, onlyOnDisk: 1 },
        mcps: { declared: 3, wired: 3, onlyDeclared: 1, onlyWired: 1, gateway: 2 }
      },
      issues: [{ path: "/repos/1", message: "a repository is written as org/name" }]
    }
  });
  assert.equal(model.declared, 3);
  assert.equal(model.counts, "1 cloned");
  assert.deepEqual(model.issues.map((i) => i.message), ["a repository is written as org/name"]);
  assert.deepEqual(model.repos.map((r) => [r.name, r.shape]), [["api", ""]]);

  assert.equal(model.skillsLine, "1 in step");
  assert.deepEqual(model.skills.map((s) => [s.name, s.shape, s.scoped]), [["delivery", "", false]]);
  assert.equal(model.mcpsLine, "2 through the gateway · 1 remote");
  assert.deepEqual(model.mcps.map((m) => m.name), ["linear", "acme-mysql"]);
  assert.match(model.mcps[0].html, /^linear<svg[\s\S]*#i-cloud/);
  assert.doesNotMatch(model.mcps[0].html, /<em>/);
  assert.match(model.mcps[1].html, /i-swap/);
  assert.match(model.legend, /through the gateway/);

  assert.equal(model.attention.count, 5);
  assert.equal(model.attention.title, "needs attention");
  assert.equal(model.attention.fixAll, "adjust everything");
  assert.deepEqual(model.attention.rows.map((r) => [r.what, r.name, r.type, r.say, r.act]), [
    ["repo-line", "extra", "repository", "extra is on disk, but not in hive.json", "write it into hive.json"],
    ["skill-line", "", "skills", "1 folder(s) in .claude/skills, but not in hive.json: pr-lens", "write it into hive.json"],
    ["skill-file", "mobile-app", "skill", "mobile-app is in hive.json, but .claude/skills/mobile-app/SKILL.md does not exist", "create the SKILL.md"],
    ["mcp-serve", "criar-postgresql", "mcp", "1 in hive.json with no url and no command, so the hive knows where they are worth but not how to reach them: criar-postgresql", "set it up"],
    ["mcp-line", "", "mcp", "1 reachable (in .mcp.json or servers.json), but not in hive.json, so the hive does not know where they are worth: sentry", "write it into hive.json"]
  ]);
});

test("a workspace in step draws no attention card, and one that was just adjusted says what was written", () => {
  const read = { state: "read", name: "hub", repos: [{ name: "api", declared: true, cloned: true, branch: "main" }], skills: [], mcps: [], counts: { cloned: 1 }, issues: [] };
  assert.equal(workspace({ wsState: read }).attention, null);
  st.wsSaid = { what: "fix", text: "3 line(s) written" };
  const calm = workspace({ wsState: read }).attention;
  assert.equal(calm.title, "in step");
  assert.equal(calm.count, 0);
  assert.equal(calm.said, "3 line(s) written");
  assert.equal(calm.fixAll, "");
  st.wsSaid = null;
});

test("many divergences fold their names, the clone queue is a live row with stop, and a queued repo wears its mark", () => {
  const repos = ["a", "b", "c", "d", "e"].map((name) => ({ name, entry: `o/${name}`, declared: true, cloned: false }));
  const skills = ["s1", "s2", "s3", "s4", "s5"].map((name) => ({ name, declared: false, onDisk: true }));
  const model = workspace({ wsState: { state: "read", name: "hub", repos, skills, mcps: [{ name: "m1", declared: true, wired: false, repos: ["a", "b"] }, { name: "m2", declared: true, wired: false, repos: [] }], counts: { missing: 5, skills: { onlyOnDisk: 5 }, mcps: { onlyDeclared: 2 } }, issues: [] } });
  assert.deepEqual(model.attention.rows.map((r) => [r.what, r.say, r.act]), [
    ["clone-all", "5 in hive.json, but not on disk: a, b, c, +2", "clone them all"],
    ["skill-line", "5 folder(s) in .claude/skills, but not in hive.json: s1, s2, s3, +2", "write them into hive.json"],
    ["mcp-serve", "2 in hive.json with no url and no command, so the hive knows where they are worth but not how to reach them: m1, m2", "set them up one by one"]
  ]);
  assert.equal(model.attention.rows[2].scope, "a, b");
  assert.equal(model.attention.count, 12);
  assert.deepEqual(model.repos, []);

  repos[0].job = { state: "cloning" };
  repos[1].job = { state: "queued" };
  repos[2].job = { state: "failed", error: "no access" };
  const live = workspace({ wsState: { state: "read", name: "hub", repos, skills: [], mcps: [], counts: { missing: 5 }, issues: [] } });
  assert.deepEqual(live.attention.rows.map((r) => [r.what, r.say, r.act, r.live]), [["clone-stop", "cloning one at a time: 1 now, 1 queued, 1 failed", "stop", true]]);
  assert.equal(live.attention.fixAll, "");
  assert.deepEqual(live.repos.map((r) => [r.name, r.shape, r.mark]), [["a", "cloning", "cloning…"], ["b", "queued", "queued"], ["c", "failed", "clone failed"]]);
});

test("lists in step fold after twelve and open on request, and the card says how many are folded", () => {
  const repos = Array.from({ length: 15 }, (_, at) => ({ name: `r${at}`, declared: true, cloned: true, branch: "main" }));
  const skills = Array.from({ length: 13 }, (_, at) => ({ name: `s${at}`, declared: true, onDisk: true }));
  const read = { state: "read", name: "hub", repos, skills, mcps: [], counts: { cloned: 15 }, issues: [] };
  st.wsShowAll = {};
  const folded = workspace({ wsState: read });
  assert.equal(folded.repos.length, 12);
  assert.equal(folded.reposMore, "+3 show all");
  assert.equal(folded.counts, "15 cloned, 3 folded because they are in step");
  assert.equal(folded.skills.length, 12);
  assert.equal(folded.skillsMore, "+1 show all");
  assert.equal(folded.mcpsMore, "");
  st.wsShowAll = { repos: true };
  const open = workspace({ wsState: read });
  assert.equal(open.repos.length, 15);
  assert.equal(open.reposMore, "fold");
  assert.equal(open.counts, "15 cloned");
  st.wsShowAll = {};
});

test("the adjust preview groups the files by item, counts what changes, and holds while a block is still asked", () => {
  const read = { state: "read", name: "hub", repos: [{ name: "x", declared: false, cloned: true }], skills: [], mcps: [], counts: { undeclared: 1 }, issues: [] };
  st.wsFix = { what: "all", name: "", busy: false, error: "", block: {}, plan: { asks: true, items: [
    { what: "repo-line", name: "x", asks: true, files: [{ file: "hive.json", verdict: "changes", say: "+1 line", excerpt: "+ x" }, { file: "CLAUDE.md", verdict: "no-block", say: "the hive block is missing", asks: true }] },
    { what: "skill-line", name: "brah", asks: false, files: [{ file: "hive.json", verdict: "changes", say: "+1 line" }, { file: "AGENTS.md", verdict: "changes", say: "+1 line in the skills block" }] },
    { what: "clone-all", name: "", clone: 2, files: [{ file: "a/", verdict: "new", say: "git clone" }, { file: "b/", verdict: "new", say: "git clone" }] },
    { what: "repo-line", name: "y", error: "y has no GitHub remote", files: [] }
  ] } };
  const model = workspace({ wsState: read });
  assert.equal(model.attention.fixAll, "");
  const plan = model.attention.fix.plan;
  assert.equal(plan.head, "adjusting 4 item(s)");
  assert.equal(plan.sum, "2 file(s) change · 2 clone(s) · no commit");
  assert.deepEqual(plan.items.map((i) => [i.head, i.error, i.files.length]), [["repository x", "", 2], ["skill brah", "", 2], ["2 clone(s)", "", 2], ["repository y", "y has no GitHub remote", 0]]);
  assert.equal(plan.items[0].files[0].excerpt, "");
  assert.equal(plan.items[0].files[1].ask, "the hive block is missing from CLAUDE.md: where does it go?");
  assert.deepEqual(plan.items[0].files[1].choices.map((c) => c.key), ["top", "end", "skip"]);
  assert.equal(plan.canApply, false);
  st.wsFix.plan.asks = false;
  assert.equal(workspace({ wsState: read }).attention.fix.plan.canApply, true);
  st.wsFix = null;
});

test("a repo without a line is listed as is on a hub with no hive.json, and moves to the attention card once the manifest was read", () => {
  const disk = { name: "loose", declared: false, cloned: true, branch: "main" };
  const none = workspace({ wsState: { state: "none", repos: [disk] } });
  assert.equal(none.repos[0].shape, "");
  assert.equal(none.attention, undefined);
  const read = workspace({ wsState: { state: "read", repos: [disk], skills: [], mcps: [], counts: {}, issues: [] } });
  assert.deepEqual(read.repos, []);
  assert.deepEqual(read.attention.rows.map((r) => [r.what, r.name]), [["repo-line", "loose"]]);
});

/* ── the door ──────────────────────────────────────── */

const NOW = Date.now();

const door = (over = {}) => {
  st.portaria = over.portaria ?? null;
  st.portariaLink = over.portariaLink ?? "";
  st.portariaSaid = over.portariaSaid ?? "";
  return portariaViewModel();
};

const phone = (over = {}) => ({ fingerprint: "SHA256:aaaa", name: "iPhone", kind: "phone", behind: 0, ...over });

test("before the door answers there is nothing to draw, and a door that is shut says why", () => {
  assert.equal(door().zones, false);
  assert.equal(door().count, "reading…");
  const shut = door({ portaria: { error: "no key here" } });
  assert.equal(shut.zones, false);
  assert.equal(shut.error, "no key here");
  assert.match(shut.shutSay, /the door is shut/);
});

test("the count adds the devices, the people who came in, and where the door listens", () => {
  const model = door({
    portaria: {
      door: "cloud", devices: [phone()], peers: [{ fingerprint: "SHA256:vini", name: "vini", fromFile: false }, { fingerprint: "SHA256:f", fromFile: true }],
      invites: [], used: []
    }
  });
  assert.equal(model.count, "1 device · 1 person · on the machine that stays online");
  assert.equal(model.peopleCount, 1);
});

test("a phone offers only the way out; anything else is simply always in", () => {
  const model = door({ portaria: { devices: [phone(), { fingerprint: "SHA256:m", name: "mac", kind: "mac" }], peers: [], invites: [], used: [], phone: {} } });
  const [one, two] = model.devices;
  assert.equal(one.icon, "i-screen");
  assert.equal(one.ghost, "");
  assert.deepEqual(one.acts.map((a) => a.pt), ["revoke"]);
  assert.equal(one.acts[0].dataKey, "SHA256:aaaa");
  assert.equal(two.ghost, "always");
  assert.deepEqual(two.acts, []);
});

test("a phone that is reading right now says so, and one that is not says when it last woke", () => {
  const reading = door({ portaria: { devices: [phone({ online: true })], peers: [], invites: [], used: [], phone: {} } });
  assert.equal(reading.devices[0].pill.cls, "pt-pill ok");
  assert.equal(reading.devices[0].pill.say, "reading");
  assert.match(reading.devices[0].said, /reading now/);
  const asleep = door({ portaria: { devices: [phone({ online: false })], peers: [], invites: [], used: [], phone: {} } });
  assert.equal(asleep.devices[0].pill.cls, "pt-pill wait");
  assert.match(asleep.devices[0].said, /last awake/);
  assert.deepEqual(asleep.devices[0].acts.map((a) => a.pt), ["revoke"]);
  const broken = door({ portaria: { devices: [], peers: [], invites: [], used: [], phone: { error: "no server to pair the phone with" } } });
  assert.match(broken.behind, /no server to pair the phone with/);
});

test("an open pairing code shows with its countdown, and vanishes when there is none", () => {
  const until = NOW + 277000;
  const model = door({ portaria: { devices: [], peers: [], invites: [], used: [], pairing: { code: "KRQ7F2MJ", expiresAt: until } } });
  assert.equal(model.code.num, "KRQ7F2MJ");
  assert.match(model.code.say, new RegExp(`${ptLeft(until)} left`), "the code never says how long it has");
  assert.equal(door({ portaria: { devices: [], peers: [], invites: [], used: [] } }).code, null);
});

test("a key only the signers file knows shows its key and says it never came in", () => {
  const model = door({ portaria: { devices: [], peers: [{ fingerprint: "SHA256:abcdefghijklm", name: "peer", fromFile: true }], invites: [], used: [] } });
  assert.equal(model.people[0].title, "abcdefghijkl");
  assert.match(model.people[0].said, /allowed by the signers file/);
  assert.equal(model.people[0].pill.cls, "pt-pill wait");
});

test("an open invite carries its link on both the copy and the cancel", () => {
  const link = "https://pod/join?key=k&token=t";
  const model = door({ portaria: { devices: [], peers: [], invites: [{ at: NOW, expiresAt: NOW, link }], used: [] } });
  assert.deepEqual(model.people[0].acts.map((a) => [a.pt, a.dataLink]), [["copy", link], ["cancel", link]]);
  assert.equal(model.people[0].pill.say, "invite");
});

test("a door nobody has ever come through says so, and the box keeps the link that arrived", () => {
  const model = door({ portaria: { devices: [], peers: [], invites: [], used: [] }, portariaLink: "hive://join?x=1" });
  assert.match(model.never.head, /nobody has come in this way yet/);
  assert.equal(model.link, "hive://join?x=1");
  const used = door({ portaria: { devices: [], peers: [], invites: [], used: [{ at: NOW }] } });
  assert.equal(used.never, null);
});

/* ── the archives ──────────────────────────────────── */

const history = (over = {}) => {
  st.histLoading = !!over.histLoading;
  st.histSessions = over.histSessions || [];
  $("hist-search").value = over.query || "";
  return historyViewModel();
};

const kept = (over = {}) => ({ id: "abc", where: "local", at: 0, cwd: "/x", prompt: "do the thing", title: "The thing", ...over });

test("while the archives are being read the count and the list both say so", () => {
  const model = history({ histLoading: true });
  assert.equal(model.count, "reading…");
  assert.match(model.hint, /reading the archives/);
  assert.deepEqual(model.rows, []);
});

test("an empty archive and a search that matches nothing say different things", () => {
  assert.match(history().hint, /nothing in the archives yet/);
  assert.match(history({ histSessions: [kept()], query: "zzz" }).hint, /nothing matches/);
});

test("the count says how many matched out of how many there are", () => {
  assert.equal(history({ histSessions: [kept(), kept({ id: "d" })] }).count, "2 sessions");
  assert.equal(history({ histSessions: [kept(), kept({ id: "d", title: "other" })], query: "other" }).count, "1 of 2");
});

test("a row keeps its place in the whole archive so reviving picks the right one", () => {
  const model = history({ histSessions: [kept({ id: "a", title: "one" }), kept({ id: "b", title: "two" })], query: "two" });
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].at, 1);
  assert.equal(model.rows[0].sub.map((part) => part.text).join(""), `${shortDir("/x")} · do the thing`);
});

test("only a session that lives on the server offers to be brought local", () => {
  const model = history({ histSessions: [kept(), kept({ id: "c", where: "cloud" })] });
  assert.equal(model.rows[0].down, false);
  assert.equal(model.rows[1].down, true);
  assert.equal(model.rows[1].whereSay, "cloud");
});

test("each row wears its own sync dot, and none when sync says nothing", () => {
  const model = history({ histSessions: [kept({ sync: "ok" }), kept({ id: "b", sync: "behind" }), kept({ id: "c" })] });
  assert.equal(model.rows[0].sync.glyph, "g-working");
  assert.equal(model.rows[1].sync.tone, "behind");
  assert.equal(model.rows[2].sync, null);
});

const strip = (over = {}) => {
  st.histSync = over.histSync ?? null;
  st.histSyncEditing = !!over.histSyncEditing;
  return syncStripViewModel();
};

test("with no sync engine the strip stays out of the way", () => {
  assert.equal(strip().mode, "off");
  assert.equal(strip({ histSync: { engine: "git" } }).mode, "off");
});

test("an unconfigured sync offers the repo box with whatever the hive suggests", () => {
  const model = strip({ histSync: { engine: "git", local: { repo: "" }, suggestion: "https://github.com/me/x.git" } });
  assert.equal(model.mode, "edit");
  assert.equal(model.typed, "https://github.com/me/x.git");
  assert.equal(model.cancelSay, "");
  assert.match(model.hint, /only where they were born/);
});

test("a configured sync names the repo without its host, says when each side last synced, and offers sync now", () => {
  const when = NOW - 2 * 60 * 1000;
  const model = strip({
    histSync: { engine: "git", local: { repo: "https://github.com/me/sessions.git", lastSync: when }, cloud: { repo: "x", lastSync: when } }
  });
  assert.equal(model.mode, "set");
  assert.equal(model.repo, "me/sessions");
  assert.equal(model.pod, `pod ${syncAgo(when)}`);
  assert.equal(model.nowSay, "sync now");
});

test("a server that is asleep, checking, or never set up each say their own thing", () => {
  const base = { engine: "git", local: { repo: "https://github.com/me/s.git", lastSync: 1 } };
  assert.equal(strip({ histSync: { ...base, cloud: null } }).pod, "server asleep");
  assert.equal(strip({ histSync: { ...base, cloud: "probing" } }).pod, "server checking…");
  assert.equal(strip({ histSync: { ...base, cloud: { repo: "" } } }).pod, "server not set up yet");
});

test("asking to change the repo opens the box on the one already in use, with a way back", () => {
  const model = strip({ histSync: { engine: "git", local: { repo: "https://github.com/me/s.git" } }, histSyncEditing: true });
  assert.equal(model.mode, "edit");
  assert.equal(model.typed, "https://github.com/me/s.git");
  assert.equal(model.cancelSay, "cancel");
});

/* ── usage ─────────────────────────────────────────── */

const usageModel = (raw, over = {}) => {
  st.limits = over.limits ?? { accounts: [] };
  st.usage = over.usage ?? null;
  return usageViewModel(raw);
};

test("before the transcripts are read the screen says what it is doing, and shows an error if it got one", () => {
  assert.match(usageModel({}).note, /reading the Claude Code transcripts/);
  assert.equal(usageModel({ error: "no home" }).note, "no home");
  assert.equal(usageModel({}).top, null);
});

test("with no account the plan-limits box is not drawn at all", () => {
  assert.equal(usageModel({}).limits, null);
});

test("an account that answered nothing says so instead of drawing an empty meter", () => {
  const model = usageModel({}, { limits: { accounts: [{ account: "default", limits: [], error: "" }] } });
  assert.equal(model.limits.held, null);
  assert.equal(model.limits.note, "default: nothing came back");
});

test("a meter carries its heat, how full it is and when it resets", () => {
  const resets = NOW + 2 * 3600 * 1000;
  const model = usageModel({}, { limits: { accounts: [{ account: "default", limits: [{ name: "weekly", percent: 95, resets_at: resets }] }] } });
  const [one] = model.limits.held;
  assert.equal(one.account, "");
  assert.equal(one.meters[0].key, 0);
  assert.equal(one.meters[0].heat, limitHeat(95));
  assert.equal(one.meters[0].name, limitLabel({ name: "weekly", percent: 95 }));
  assert.equal(one.meters[0].pct, "95% used");
  assert.equal(one.meters[0].fill, 95);
  assert.equal(one.meters[0].resets, `resets ${limitWhen(resets)}`);
});

test("the week of a single model is a meter of its own, hanging off the week above it", () => {
  const model = usageModel({}, { limits: { accounts: [{ account: "default", limits: [
    { kind: "session", percent: 34 },
    { kind: "weekly_all", percent: 29 },
    { kind: "weekly_scoped", model: "Fable", percent: 14 }
  ] }] } });
  const [one] = model.limits.held;
  assert.deepEqual(one.meters.map((meter) => meter.name), ["current session", "current week · all models", "current week · Fable"]);
  assert.deepEqual(one.meters.map((meter) => meter.sub), [false, false, true]);
  assert.equal(one.meters[2].pct, "14% used");
});

test("with more than one login each meter block says which account it belongs to", () => {
  const model = usageModel({}, {
    limits: { accounts: [
      { account: "one", limits: [{ name: "weekly", percent: 10 }] },
      { account: "two", limits: [{ name: "weekly", percent: 20 }] }
    ] }
  });
  assert.deepEqual(model.limits.held.map((h) => h.account), ["one", "two"]);
});

const USAGE = {
  person: "ada", machine: "mac", window: { from: "01-01", to: "01-31", calendar_days: 31 },
  totals: {
    sessions_with_activity: 10, active_hours: 20, active_days: 5, current_streak_days: 1, longest_streak_days: 3,
    top_model: "claude-opus", tokens: { total: 100 }, subagents_spawned: 2, prs_touched: 3, interruptions: 4,
    automation: { runs: 1, tokens: { total: 5 } }
  },
  concurrency: { peak: 4, at: 0, mean_when_active: 2, minutes_with_2_plus: 30, active_minutes: 100, distribution: { 1: 60, 2: 30 } },
  heatmap: [{ date: "2026-01-05", active_minutes: 100, sessions: 3, peak_concurrency: 2 }, { date: "2026-01-06", active_minutes: 0, sessions: 0, peak_concurrency: 0 }],
  hour_of_day: [{ hour_utc: 9, active_minutes: 40, mean_concurrency: 2 }, { hour_utc: 12, active_minutes: 10, mean_concurrency: 1 }],
  limits_insights: { window_hours: 24, items: [{ kind: "skill", name: "delivery", percent: 30 }, { kind: "cron", percent: 10 }] }
};

test("the hero says the peak and how much of the time was spent with more than one chat", () => {
  const model = usageModel({}, { usage: USAGE });
  assert.equal(model.hero.peak, 4);
  assert.equal(model.hero.mean, "2");
  assert.equal(model.hero.minutes, "30");
  assert.match(model.hero.tail, /of the 100 active minutes/);
});

test("every tile has a label and a value, and the model tile drops the claude- prefix", () => {
  const model = usageModel({}, { usage: USAGE });
  assert.equal(model.tiles.length, 11);
  assert.equal(model.tiles.find((t) => t.key === "model").value, "opus");
  assert.match(model.tiles.find((t) => t.key === "active days").value, /<small>of 31<\/small>/);
});

test("the calendar starts on a monday, pads the last week and marks the intensity of each day", () => {
  const model = usageModel({}, { usage: USAGE });
  const [week] = model.calendar.weeks;
  assert.equal(week.cells.length, 7);
  const busy = week.cells.find((c) => c.key === "2026-01-05");
  assert.equal(busy.n, 4);
  assert.match(busy.hint, /100 active min · 3 chats · peak of 2 at once/);
  assert.equal(week.cells.find((c) => c.key === "2026-01-06").n, 0);
  assert.equal(week.cells[6].hint, undefined, "a day the window never reached has nothing to say");
});

test("the bars are drawn against the tallest one, and only the tallest carries its number", () => {
  const model = usageModel({}, { usage: USAGE });
  assert.deepEqual(model.atOnce.cols.map((c) => c.height), [100, 50]);
  assert.deepEqual(model.atOnce.cols.map((c) => c.top), ["60", ""]);
  assert.match(model.atOnce.cols[0].hint, /60 min with 1 chat at once/);
});

test("the hour ribbon warms with mean concurrency and labels every third hour", () => {
  const model = usageModel({}, { usage: USAGE });
  const axis = USAGE.hour_of_day.map((h) => (localHour(h.hour_utc) % 3 === 0 ? String(localHour(h.hour_utc)).padStart(2, "0") : ""));
  assert.deepEqual(model.hourly.cols.map((c) => c.axis), axis);
  assert.ok(axis.every(Boolean), "the sample hours stopped landing on a labelled column");
  assert.equal(model.hourly.ribbon[0].tint, "rgba(205,105,74,1.00)");
  assert.equal(model.hourly.ribbon[1].tint, "rgba(205,105,74,0.56)");
});

test("what is contributing names the skill, the mcp server and the plain traits apart", () => {
  const model = usageModel({}, { usage: USAGE });
  assert.deepEqual(model.insights.rows.map((r) => r.say), ["from /delivery", "in sessions active for 8+ hours"]);
  assert.equal(model.insights.rows[0].percent, "30%");
  assert.equal(usageModel({}, { usage: { ...USAGE, limits_insights: null } }).insights, null);
});

test("the footer says it is recomputing only while it is", () => {
  assert.match(usageModel({ computing: true }, { usage: USAGE }).foot, / · recomputing…\.$/);
  assert.doesNotMatch(usageModel({}, { usage: USAGE }).foot, /recomputing/);
});

/* ── the providers ─────────────────────────────────── */

const provider = (over = {}) => ({
  id: "codex", label: "Codex", name: "Codex", color: "#10A37F", version: "0.153.1", enabled: true, installed: true, ready: true, why: "",
  accounts: [{ name: "default", loggedIn: true, email: "a@b.c", tier: "team" }], order: ["default"], ...over
});

const providers = (list, over = {}) => {
  st.providers = list;
  st.providersTrouble = over.trouble || "";
  st.providerOpen = over.open ?? (list[0]?.id || "");
  st.providerTab = over.tab || "accounts";
  return providersViewModel();
};

test("a list that could not be read says so instead of listing nothing", () => {
  const model = providers([], { trouble: "the config file is broken" });
  assert.match(model.trouble, /config file/);
  assert.deepEqual(model.rows, []);
});

test("a provider signed in says so with its plan, one signed out or missing says that instead", () => {
  const model = providers([
    provider(),
    provider({ id: "kimi", name: "Kimi", accounts: [{ name: "default", loggedIn: false }] }),
    provider({ id: "kiro", name: "Kiro", installed: false, accounts: [] }),
    provider({ id: "opencode", name: "OpenCode", enabled: false }),
  ]);
  assert.deepEqual(model.rows.map((r) => [r.id, r.status, r.tone]), [
    ["codex", "authenticated · team", "ok"], ["kimi", "signed out", "warn"], ["kiro", "not installed", "dim"], ["opencode", "turned off", "dim"],
  ]);
  assert.equal(model.rows[0].here, true);
});

test("the open provider's header says who is signed in, and its logins keep the fallback order", () => {
  const model = providers([provider({ accounts: [
    { name: "default", loggedIn: true, email: "a@b.c", tier: "team" },
    { name: "work", loggedIn: false },
    { name: "blind", loggedIn: false, blind: true },
  ], order: ["work", "default", "blind"] })]);
  assert.equal(model.detail.who, "authenticated as a@b.c · team");
  assert.deepEqual(model.detail.accounts.rows.map((r) => r.name), ["work", "default", "blind"]);
  const [work, dflt, blind] = model.detail.accounts.rows;
  assert.equal(work.first, true);
  assert.equal(work.canSignIn, true);
  assert.match(work.said, /the login never finished/);
  assert.equal(dflt.said, "a@b.c · team");
  assert.equal(dflt.canRemove, false);
  assert.equal(dflt.defaultSay, "the CLI's own login");
  assert.equal(blind.canSignIn, false);
  assert.match(blind.said, /could not ask this login/);
  assert.deepEqual(model.detail.tabs.map((t) => [t.key, t.count]), [["accounts", "3"], ["configuration", ""], ["models", ""]]);
});

test("an agent with no binary on this machine reads off and its switch refuses the click", () => {
  const model = providers([
    provider(),
    provider({ id: "kimi", name: "Kimi", installed: false, enabled: true, accounts: [] }),
  ], { open: "kimi" });
  const [here, gone] = model.rows;
  assert.deepEqual([here.toggleOn, here.canToggle], [true, true]);
  assert.deepEqual([gone.toggleOn, gone.canToggle], [false, false], "enabled in the config means nothing with nothing to run");
  assert.equal(gone.enabled, true, "the config is not rewritten behind the person's back");
  assert.match(gone.toggleSay, /Kimi is not installed/);
  assert.equal(model.detail.toggleOn, false);
  assert.equal(model.detail.canToggle, false);
});

test("an account out of room says until when, and a sign-out mid-answer says that instead", () => {
  const until = NOW + 60000;
  const out = providers([provider({ accounts: [{ name: "default", loggedIn: true, email: "e", spent: { until } }] })]);
  assert.equal(out.detail.accounts.rows[0].room, `out of room until ${artClock(until)}`);
  const gone = providers([provider({ accounts: [{ name: "default", loggedIn: false, spent: { why: "login" } }] })]);
  assert.match(gone.detail.accounts.rows[0].room, /signed out mid-answer/);
  const fine = providers([provider({ accounts: [{ name: "default", loggedIn: true, email: "e", spent: { until: 1 } }] })]);
  assert.equal(fine.detail.accounts.rows[0].room, "");
});

/* ── the palette preview ───────────────────────────── */

const preview = (over = {}) => {
  st.palMode = over.palMode ?? "file";
  st.palPrev = over.palPrev ?? { loading: false, error: "", lines: [], from: 1, at: 0 };
  return palPreviewViewModel();
};

test("with no palette mode the preview draws nothing at all", () => {
  assert.equal(preview({ palMode: "" }).mode, "off");
});

test("reading, failing and having nothing to show are three different notes", () => {
  assert.equal(preview({ palPrev: { loading: true, lines: [] } }).note, "reading…");
  assert.equal(preview({ palPrev: { loading: false, error: "no such file", lines: [] } }).note, "no such file");
  assert.match(preview().note, /the preview shows up here/);
});

test("every line is numbered from where the file was read, and the line asked for is marked", () => {
  const model = preview({ palPrev: { loading: false, error: "", from: 10, at: 11, lines: ["one", "", "three"] } });
  assert.equal(model.mode, "lines");
  assert.deepEqual(model.lines.map((l) => l.n), [10, 11, 12]);
  assert.deepEqual(model.lines.map((l) => l.on), [false, true, false]);
  assert.equal(model.lines[1].html, "&nbsp;", "an empty line still takes its own row");
});

/* ── the wiring ────────────────────────────────────── */

const HOOKS = [
  ["day", "paintDay(force = false) {", "daySolid.show("],
  ["shelf", "paintShelf() {", "shelfGallerySolid.show("],
  ["shelf", "paintShelf() {", "shelfFiltersSolid.show("],
  ["thread", "paintPrList() {", "prListSolid.show("],
  ["thread", "paintPrMid() {", "prMidSolid.show("],
  ["worktrees", "paintWorktrees() {", "worktreesSolid.show("],
  ["pod", "paintWorkspace() {", "workspaceSolid.show("],
  ["usage", "paintUsage(raw) {", "usageSolid.show("],
  ["providers", "paintProviders() {", "providersSolid.show("],
  ["pod", "paintPortaria() {", "portariaSolid.show("],
  ["history", "renderHistory() {", "historySolid.show("],
  ["history", "renderSyncStrip(data) {", "syncStripSolid.show("],
  ["palette", "paintPalPreview() {", "palPreviewSolid.show("]
];

function body(module, head) {
  const text = source(module);
  const a = text.indexOf(`function ${head}`);
  assert.ok(a >= 0, `${module}.js has no ${head}`);
  const b = text.indexOf("\n}\n", a);
  assert.ok(b > a, `${module}.js: ${head} never closes`);
  return text.slice(a, b);
}

test("every panel is painted by its solid view, and by nothing else", () => {
  for (const [module, head, hook] of HOOKS) {
    assert.ok(body(module, head).includes(hook), `${head} does not paint through ${hook})`);
  }
});

const MOUNTS = [
  ["day", "mountDay", "day-body"], ["shelf", "mountShelfFilters", "sh-filters"], ["shelf", "mountShelfGallery", "sh-gal"],
  ["thread", "mountPrList", "pr-items"], ["thread", "mountPrMid", "pr-mid"], ["worktrees", "mountWorktrees", "worktrees"],
  ["pod", "mountWorkspace", "ws-scroll"], ["usage", "mountUsage", "usage"], ["providers", "mountProviders", "providers"],
  ["pod", "mountPortaria", "pt-body"], ["history", "mountHistory", "hist-list"], ["history", "mountSyncStrip", "hist-sync"],
  ["palette", "mountPalPreview", "pal-prev"]
];

test("each panel is mounted on the host the manual painter wrote into, and that host is in the page", () => {
  for (const [module, mount, host] of MOUNTS) {
    assert.ok(source(module).includes(`hive.${mount}($("${host}")`), `${mount} is not mounted on ${host}`);
    assert.ok(page.includes(`id="${host}"`), `the page has no ${host}`);
    assert.ok($(host), `the page never built ${host}`);
  }
});

const KEPT_BY_SOLID = {
  "day-body": "day",
  "sh-gal": "shelf",
  "sh-filters": "shelf",
  "pr-items": "thread",
  "pr-mid": "thread",
  worktrees: "worktrees",
  "ws-scroll": "pod",
  usage: "usage",
  providers: "providers",
  "pt-body": "pod",
  "hist-list": "history",
  "hist-sync": "history",
  "pal-prev": "palette"
};

const PANEL_MODULES = ["day", "shelf", "thread", "worktrees", "pod", "usage", "new-chat", "providers", "history", "palette"];

test("nothing writes straight into a host solid owns — solid would lose the page there", () => {
  for (const host of Object.keys(KEPT_BY_SOLID)) {
    for (const module of PANEL_MODULES) {
      assert.ok(!source(module).includes(`$("${host}").innerHTML`), `${module}.js writes into ${host}, a host solid owns`);
      assert.ok(!source(module).includes(`$("${host}").replaceChildren`), `${module}.js replaces the children of ${host}, a host solid owns`);
    }
  }
  for (const [module, say, mount] of [["usage", "sayUsageTrouble(", "usageSolid"], ["worktrees", "sayWorktreeTrouble(", "worktreesSolid"], ["history", "sayArchivesTrouble(", "historySolid"]]) {
    assert.match(body(module, say), new RegExp(`${mount}\\.show`), `${say}) must go through solid`);
  }
});

const canBuild = existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/solid-js"));

test("the panels build into the one bundle, keeping the markup the css and the handlers reach for", { skip: !canBuild && "esbuild and solid-js are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-panels-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const built = await readFile(join(outdir, "hive.mjs"), "utf8");
    for (const [, mount] of MOUNTS) {
      assert.ok(built.includes(mount), `the bundle does not carry ${mount}`);
    }
    for (const piece of [
      "day-brief", "dfold", "dboard", "day-zone", "eseat", "dask", "drow",
      "sh-card", "sh-band", "sh-f", "sh-lab", "sh-th",
      "pr-item", "pr-head", "pr-queue", "gauge", "pr-blank",
      "wt-group", "wt-del", "ws-repo", "ws-chip", "pt-row", "pt-code", "pt-join",
      "hist-row", "hist-sync", "sync-repo", "tile-n", "limit-account", "insights-box", "pv-line", "acc-row"
    ]) {
      assert.ok(built.includes(piece), `the built panels lost ${piece}`);
    }
    const outside = built.split("\n").filter((line) => /^import\s.*from\s+["'](?!\.)/.test(line)).map((line) => /from\s+["']([^"']+)["']/.exec(line)[1]);
    assert.deepEqual(outside.filter((where) => !where.startsWith("/assets/") && !where.startsWith("/vendor/")), [], "the bundle reaches for something the page does not serve");
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

test("the repositories card offers to add one, and a repository being cloned or whose clone failed says so on its card", () => {
  st.wsAdd = null;
  const model = workspace({
    wsState: {
      state: "read", name: "hub", repos: [
        { name: "delta", entry: "o/delta", declared: true, cloned: false, job: { state: "cloning" } },
        { name: "epsilon", entry: "o/epsilon", declared: true, cloned: false, job: { state: "failed", error: "gh: could not clone" } },
        { name: "gone", entry: "o/gone", declared: true, cloned: false }
      ], skills: [], mcps: [], counts: {}, issues: []
    }
  });
  assert.equal(model.addSay, "+ add");
  assert.equal(model.add, null);
  assert.deepEqual(model.repos.map((r) => [r.shape, r.mark, r.retry]), [
    ["cloning", "cloning…", ""],
    ["failed", "clone failed", "try again"]
  ]);
  assert.deepEqual(model.attention.rows.map((r) => [r.what, r.say]), [["clone-stop", "cloning one at a time: 1 now, 0 queued, 1 failed"]]);
  assert.equal(model.repos[1].entry, "o/epsilon");
  assert.equal(model.repos[1].why, "the clone failed: gh: could not clone");
});

test("the add form tells where the clone lands as the person types, and the preview says what changes file by file", () => {
  st.wsAdd = { what: "repo", typed: "https://github.com/o/edital-review.git", plan: null, error: "bad", busy: false, block: {} };
  const typing = workspace({ wsState: { state: "read", name: "hub", repos: [], skills: [], mcps: [], counts: {}, issues: [] } });
  assert.equal(typing.add.where, "where: ./edital-review (the root of the hub)");
  assert.equal(typing.add.error, "bad");
  assert.equal(typing.add.plan, null);
  assert.equal(typing.add.planSay, "see what changes");

  st.wsAdd = {
    what: "repo", typed: "o/edital-review", busy: false, block: { "AGENTS.md": "end" },
    plan: {
      entry: "o/edital-review", clone: true, asks: true,
      files: [
        { file: "hive.json", verdict: "changes", say: "+1 line", excerpt: '+     "o/edital-review",' },
        { file: "CLAUDE.md", verdict: "no-block", say: "the hive block is missing", asks: true },
        { file: "AGENTS.md", verdict: "changes", say: "+1 line, in a new hive block" },
        { file: "edital-review/", verdict: "new", say: "git clone" }
      ]
    }
  };
  const preview = workspace({ wsState: { state: "read", name: "hub", repos: [], skills: [], mcps: [], counts: {}, issues: [] } }).add.plan;
  assert.equal(preview.head, "adding o/edital-review");
  assert.equal(preview.sum, "2 file(s) change · 1 clone · no commit");
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.files.map((f) => [f.shape, f.verdict, f.say]), [
    ["changes", "changes", "+1 line"], ["no-block", "no block", "the hive block is missing"], ["changes", "changes", "+1 line, in a new hive block"], ["new", "new", "git clone"]
  ]);
  assert.equal(preview.files[1].ask, "the hive block is missing from CLAUDE.md: where does it go?");
  assert.deepEqual(preview.files[1].choices.map((c) => [c.key, c.on]), [["top", false], ["end", false], ["skip", false]]);
  assert.equal(preview.files[2].choices.length, 0);
  assert.equal(workspace({ wsState: { state: "read", name: "hub", repos: [], skills: [], mcps: [], counts: {}, issues: [] } }).add.applySay, "write and clone");
  st.wsAdd = null;
});

test("the mcp form switches between url and command, and the skill form asks for name, one line and where it is worth", () => {
  const read = { state: "read", name: "hub", repos: [], skills: [], mcps: [], counts: {}, issues: [] };
  st.wsAdd = { what: "mcp", kind: "remote", name: "notion", url: "https://mcp.notion.com/mcp", plan: null, error: "", busy: false, block: {} };
  const remote = workspace({ wsState: read }).add;
  assert.equal(remote.what, "mcp");
  assert.deepEqual(remote.kinds.map((k) => [k.key, k.on]), [["remote", true], ["stdio", false]]);
  assert.deepEqual(remote.fields.map((f) => f.field), ["name", "url", "env", "scope"]);
  assert.equal(remote.fields[1].value, "https://mcp.notion.com/mcp");
  st.wsAdd.kind = "stdio";
  assert.deepEqual(workspace({ wsState: read }).add.fields.map((f) => f.field), ["name", "command", "env", "scope"]);

  st.wsAdd = { what: "skill", name: "copy-check-mobile", description: "Copy no app.", scope: "mobile-app", plan: null, error: "", busy: false, block: {} };
  const skill = workspace({ wsState: read }).add;
  assert.equal(skill.kinds, null);
  assert.deepEqual(skill.fields.map((f) => [f.field, f.value]), [["name", "copy-check-mobile"], ["description", "Copy no app."], ["scope", "mobile-app"]]);
  assert.equal(skill.applySay, "write");

  st.wsAdd.plan = { name: "copy-check-mobile", asks: false, files: [
    { file: "hive.json", verdict: "changes", say: "+1 line" },
    { file: ".claude/skills/copy-check-mobile/SKILL.md", verdict: "new", say: "a SKILL.md to write" },
    { file: ".env", verdict: "missing", say: "X not set", missing: ["SENTRY_ACCESS_TOKEN"] }
  ] };
  const preview = workspace({ wsState: read }).add.plan;
  assert.equal(preview.head, "adding copy-check-mobile");
  assert.equal(preview.sum, "2 file(s) change · no commit");
  assert.match(preview.files[2].missing, /set SENTRY_ACCESS_TOKEN in the \.env of the hub/);
  assert.equal(preview.canApply, true);

  st.wsAdd = null;
  st.wsSaid = { what: "mcp", text: "sentry is in" };
  assert.equal(workspace({ wsState: read }).mcpSaid, "sentry is in");
  assert.equal(workspace({ wsState: read }).addSaid, "");
  st.wsSaid = null;
});

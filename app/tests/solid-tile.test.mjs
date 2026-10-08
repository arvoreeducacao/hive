import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const seatMenu = readFileSync(join(HERE, "src", "app", "seat-menu.js"), "utf8");
const filesEditor = readFileSync(join(HERE, "src", "app", "files-editor.js"), "utf8");
const arranged = readFileSync(join(HERE, "src", "app", "arrange.js"), "utf8");

function slice(from, to, src = seatMenu) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

const PHRASE = `const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split("{" + k + "}").join(x), String(t));`;

function tile(world = {}) {
  return new Function("world", "seat", `
    ${PHRASE}
    const esc = (t) => String(t);
    const LABEL = { idle: "idle", needs: "needs you", working: "working" };
    const PILL_LABEL = { idle: "idle", needs: "needs input", working: "working" };
    const experienceNext = () => !!world.next;
    const drivingNow = (name) => (world.driving || []).includes(name);
    const GLYPH = { idle: "g-idle", needs: "g-needs", working: "g-working" };
    const WHERE_ICON = { local: "#i-local", cloud: "#i-cloud" };
    const shortBranch = (b) => (String(b || "").split("/").filter(Boolean).pop() || "").replace(/^-+/, "");
    const lentFace = (dev) => "<span class=\\"team-av\\">" + dev + "</span>";
    const prIsGone = (p) => p.state === "merged" || p.state === "closed";
    const prsOnCard = () => world.prs || [];
    const memoryChip = (s) => (world.memory || {})[s.name] || null;
    const prSays = (p) => p.says || "";
    const prTone = (p) => p.tone || "";
    const prActions = (p) => p.acts || [];
    const mergeTrouble = new Map(world.mergeTrouble || []);
    const freshOf = (t) => t.fresh || [];
    const previewOf = (m) => m.text || "";
    const threadsOfChat = () => world.threads || [];
    const threadOfChat = () => (world.threads || [])[0] || null;
    const pagesOfChat = () => world.pages || [];
    const showingArtifact = () => !!world.showing;
    const artifactTabOf = () => ({ slug: world.showing || "" });
    const artFileOf = (one) => one.path;
    const liveOf = (s) => s.live || [];
    const liveBadge = (s) => String((s.live || []).length || "");
    const liveTitle = (s) => (s.live || []).length ? "two running" : "";
    const keyLabel = () => "⌘R";
    const canGiveBack = () => !!world.inAWindowOfItsOwn;
    const st = {
      keys: { reconnect: {} },
      lentHere: world.lentHere || [],
      open: world.open || null,
      typing: world.typing || null,
      threadChat: world.threadChat || null,
      reviewChat: world.reviewChat || null,
      openPr: world.openPr || ""
    };
    ${slice("function tileChipsModel(s) {", "function tileActions(s) {")}
    return tileViewModel(seat);
  `)(world, { name: "ana", where: "local", state: "idle", when: "2m", ...(world.seat || {}) });
}

test("the head says the seat and its model, and an errand says what it is part of", () => {
  const plain = tile({ seat: { model: "opus" } });
  assert.equal(plain.sub.text, "ana · opus");
  assert.equal(plain.sub.ofErrand, false);
  assert.equal(plain.sub.hint, "");
  const errand = tile({ seat: { errand: "the rail in solid", asked: "put the hive in solid" } });
  assert.equal(errand.sub.text, "the rail in solid · ana");
  assert.equal(errand.sub.ofErrand, true);
  assert.equal(errand.sub.hint, "part of what you asked: put the hive in solid");
});

test("the state pill carries the glyph and the word of the state, and typing wins over both", () => {
  assert.equal(tile({ seat: { state: "needs" } }).glyph, "#g-needs");
  assert.equal(tile({ seat: { state: "needs" } }).label, "needs input");
  assert.equal(tile({ typing: "ana", seat: { state: "needs" } }).label, "you're typing");
  assert.equal(tile({ typing: "ana", seat: { state: "needs" } }).glyph, "#g-typing");
});

test("the live badge is hidden with nothing running and titled with what runs", () => {
  const quiet = tile();
  assert.deepEqual(quiet.live, { on: false, badge: "", title: "" });
  const busy = tile({ seat: { live: [1, 2] } });
  assert.deepEqual(busy.live, { on: true, badge: "2", title: "two running" });
});

test("a local seat carries no where chip, a cloud one does", () => {
  assert.equal(tile().whereChip, null);
  assert.deepEqual(tile({ seat: { where: "cloud" } }).whereChip,
    { key: "cloud", cls: "cloud", title: "cloud", icon: "#i-cloud", text: "cloud" });
});

test("the summary falls back to the description, then to the line that says only the terminal speaks", () => {
  assert.deepEqual(tile({ seat: { summary: "reading the rail" } }).summary, { text: "reading the rail", empty: false });
  assert.deepEqual(tile({ seat: { description: "the mission" } }).summary, { text: "the mission", empty: false });
  assert.equal(tile().summary.empty, true);
});

test("the chips are the worktrees, then account, the lent keyboard and the pull request — the model and the kind of seat are already on the screen", () => {
  const model = tile({
    seat: { trees: [{ repo: "leaf", path: "/w/leaf", branch: "renato/-/solid", main: false }], model: "opus", account: "ana@acme", structured: true },
    lentHere: [{ seat: "ana", with: "jonas" }],
    prs: [{ key: "hive#9", state: "open", repo: "acme/hive", number: 9 }]
  });
  assert.deepEqual(model.chips.map((c) => c.key), ["tree:/w/leaf", "acc", "lent", "repo", "pr"]);
  const tree = model.chips[0];
  assert.equal(tree.cls, "tree apart");
  assert.equal(tree.text, "leaf");
  assert.equal(tree.twig, "solid");
  assert.equal(tree.title, "/w/leaf\nrenato/-/solid\nworktree");
  assert.equal(model.chips[2].take, "ana");
  assert.match(model.chips[2].html, /team-av.*jonas.*jonas at the keyboard/);
  assert.equal(model.chips[4].text, "pr #9");
});

test("a worktree the pull request already names does not get a second repo chip", () => {
  const model = tile({
    seat: { trees: [{ repo: "hive", path: "/w/hive", branch: "main", main: true }] },
    prs: [{ key: "hive#9", state: "open", repo: "acme/hive", number: 9 }]
  });
  assert.deepEqual(model.chips.map((c) => c.key), ["tree:/w/hive", "pr"]);
});

test("a shut seat shows one pull request and says how many more, an open one shows them all", () => {
  const prs = [1, 2, 3].map((n) => ({ key: `hive#${n}`, state: "open", repo: "acme/hive", number: n, title: `pr ${n}` }));
  const shut = tile({ prs });
  assert.equal(shut.prs.cards.length, 1);
  assert.equal(shut.prs.more, "2 more pull requests — open the seat to see them");
  const wide = tile({ prs, open: "ana" });
  assert.equal(wide.prs.cards.length, 3);
  assert.equal(wide.prs.more, "");
});

test("a pull request card carries the repo, the scale, what it says and one key per action", () => {
  const card = tile({
    prs: [{
      key: "hive#9", state: "open", repo: "acme/hive", number: 9, title: "the rail in solid",
      additions: 12, deletions: 3, says: "checks running",
      acts: [{ act: "merge", label: "merge", tone: "ready" }, { act: "force", label: "force merge", tone: "warn" }]
    }],
    reviewChat: "ana", openPr: "hive#9"
  }).prs.cards[0];
  assert.equal(card.repo, "hive");
  assert.equal(card.here, true);
  assert.equal(card.landed, false);
  assert.deepEqual(card.scale, { added: "+12", gone: "−3" });
  assert.equal(card.says, "checks running");
  assert.deepEqual(card.acts.map((a) => a.key), ["hive#9:merge", "hive#9:force"]);
  assert.deepEqual(card.acts[0], { key: "hive#9:merge", pr: "hive#9", act: "merge", label: "merge", tone: "ready", busy: false, check: "" });
});

test("a landed pull request is marked landed, a broken one bad", () => {
  assert.equal(tile({ prs: [{ key: "a", state: "merged", repo: "o/r", number: 1 }] }).prs.cards[0].landed, true);
  assert.equal(tile({ prs: [{ key: "a", state: "open", repo: "o/r", number: 1, ci: "failed" }] }).prs.cards[0].bad, true);
  assert.equal(tile({ prs: [{ key: "a", state: "open", repo: "o/r", number: 1, error: "no token" }] }).prs.cards[0].bad, true);
});

test("a slack card says the channel, who asked, what is new and the last line", () => {
  const card = tile({
    threads: [{
      key: "t1", link: "https://slack/t1", channel: "#eng-prs", private: false, opener: "Rita",
      fresh: [1], ask: { text: "can you look?" }, last: { who: "Rita", text: "still there?" }
    }],
    threadChat: "ana"
  }).threads.cards[0];
  assert.equal(card.glyph, "#i-hash");
  assert.equal(card.channel, "eng-prs");
  assert.equal(card.opener, "Rita asked");
  assert.equal(card.news, "1 new");
  assert.equal(card.fresh, true);
  assert.equal(card.here, true);
  assert.equal(card.asked, "can you look?");
  assert.deepEqual(card.last, { who: "Rita", said: "still there?" });
});

test("a private channel wears the lock, a quiet thread says nothing new, and a broken read says why", () => {
  const card = tile({ threads: [{ key: "t1", channel: "secret", private: true, error: "no token", stale: "2h" }] }).threads.cards[0];
  assert.equal(card.glyph, "#i-lock");
  assert.equal(card.news, "nothing new");
  assert.equal(card.fresh, false);
  assert.equal(card.error, "could not read it: no token");
  assert.equal(card.stale, "showing what was read before — 2h");
});

test("a page card carries the file, the version with its label and what the page is called", () => {
  const card = tile({
    pages: [{ key: "p1", slug: "rfc-solid", n: 3, label: "draft", path: "a/rfc-solid/documento", title: "O hive em Solid" }],
    showing: "rfc-solid"
  }).pages.cards[0];
  assert.equal(card.name, "a/rfc-solid/documento");
  assert.equal(card.version, "v3 · draft");
  assert.equal(card.here, true);
  assert.equal(card.subject, "O hive em Solid");
  assert.equal(card.open, "open");
});

test("a shut seat holds one page back and counts the rest", () => {
  const pages = [1, 2].map((n) => ({ key: `p${n}`, slug: `s${n}`, n, path: `p${n}`, title: `page ${n}` }));
  assert.equal(tile({ pages }).pages.more, "1 more page — open the seat to see them");
  assert.equal(tile({ pages, open: "ana" }).pages.more, "");
});

function job(it) {
  return new Function("it", `
    ${PHRASE}
    const sinceStart = () => "12s";
    ${slice("function jobViewModel(it) {", "function jobSideOf(")}
    return jobViewModel(it);
  `)(it);
}

test("a job on its first flight says what it is doing, and a failed one says it did not start", () => {
  const flying = job({ name: "the rail", where: "local", mission: "put the rail in solid", model: "opus", repo: "hive" });
  assert.equal(flying.label, "starting");
  assert.equal(flying.glyph, "#g-flight");
  assert.equal(flying.sub, "opening the chat");
  assert.deepEqual(flying.summary, { text: "put the rail in solid", empty: false });
  assert.deepEqual(flying.chips.map((c) => c.key), ["model", "where", "repo"]);
  const broken = job({ where: "cloud", error: "no pod" });
  assert.equal(broken.label, "failed to start");
  assert.equal(broken.glyph, "#g-needs");
  assert.equal(broken.name, "naming the mission…");
  assert.equal(broken.whereIcon, "#i-cloud");
  assert.equal(broken.summary.empty, true);
});

function editor(ed) {
  return new Function("ed", `
    ${PHRASE}
    const baseName = (p) => String(p).split("/").pop();
    ${slice("function fileViewModel(ed) {", "function fileActions(", filesEditor)}
    return fileViewModel(ed);
  `)(ed);
}

test("the editor bar names every open tab and marks the one being read and the ones not saved", () => {
  const model = editor({
    active: 1,
    tabs: [
      { key: "a", name: "hive", path: "app/app.html" },
      { key: "b", name: "hive", path: "app/src/tile.jsx", branch: "renato/-/solid", dirty: true, where: "local" }
    ]
  });
  assert.deepEqual(model.bar.tabs.map((t) => [t.name, t.on, t.dirty]), [["app.html", false, false], ["tile.jsx", true, true]]);
  assert.equal(model.bar.tabs[0].hint, "hive · app/app.html");
  assert.equal(model.bar.dirty, true);
  assert.deepEqual(model.status.where.map((p) => p.text), ["this machine", "hive · renato/-/solid", "app/src/tile.jsx"]);
  assert.deepEqual(model.status.at.map((p) => p.text), ["not saved"]);
});

test("an editor with nothing open says so, and a file on the pod says where it lives", () => {
  assert.deepEqual(editor({ active: 0, tabs: [] }).status.where.map((p) => p.text), ["nothing open"]);
  const pod = editor({ active: 0, tabs: [{ key: "a", name: "hive", path: "server.mjs", where: "cloud" }] });
  assert.equal(pod.status.where[0].text, "pod");
  assert.deepEqual(pod.status.at, []);
});

test("saving wins over anything the editor had to say, and an error speaks when nothing else does", () => {
  assert.equal(editor({ active: 0, saving: true, said: "saved", tabs: [] }).status.said, "saving…");
  assert.equal(editor({ active: 0, said: "saved", tabs: [] }).status.said, "saved");
  assert.equal(editor({ active: 0, tabs: [{ key: "a", name: "n", path: "p", error: "gone" }] }).status.said, "gone");
});

function blank(pod) {
  return new Function("pod", `
    ${PHRASE}
    const st = { data: { pod }, keys: { new: {} } };
    const keyLabel = () => "⌘N";
    ${slice("function blankViewModel() {", "\nexport {", arranged)}
    return blankViewModel();
  `)(pod);
}

test("the empty canvas says whether the server is up and which key opens the first chat", () => {
  assert.equal(blank({ up: true, name: "pod-1" }).server, "server pod-1 up");
  assert.equal(blank({ up: false }).server, "server asleep");
  assert.equal(blank({ up: false }).opens, "⌘N opens a new chat");
  assert.equal(blank({ up: false }).head, "No worker alive");
});

test("every side is the solid one — the tile, the job and the editor all hand it their model", () => {
  assert.match(slice("function update(el, s, pos) {", "\nst.tileSide = null;"),
    /const side = tileSides\.get\(el\);[\s\S]*?side\.show\(tileViewModel\(s\)\);/);
  assert.match(slice("function updateJob(el, it, pos) {", "\nst.jobSide = null;"),
    /const side = jobSideOf\(el, it\);[\s\S]*?side\.show\(jobViewModel\(it\)\);/);
  assert.match(slice("function paintEditor(ed) {", "\nst.fileSide = null;", filesEditor),
    /const side = fileSideOf\(el, ed\);[\s\S]*?side\.show\(fileViewModel\(ed\)\);/);
  assert.match(slice("solidMounts.push((hive) => {\n  st.tileSide", "\n});"),
    /st\.tileSide = hive\.mountTileSide;[\s\S]*st\.jobSide = hive\.mountJobSide;[\s\S]*st\.fileSide = hive\.mountFileSide;[\s\S]*st\.blankSide = hive\.mountBlank;/);
});

test("what the solid side does not draw stays drawn by hand — the name, the fold, the chips of the panes and the panes themselves", () => {
  const solid = slice("function update(el, s, pos) {", "\nst.tileSide = null;");
  for (const painter of [
    "paintFold(s.name, el)", "paintName(el, s)",
    "paintCanopyOfChat(el, s)", "paintDeviceChipOfChat(el, s)", "paintWebChipOfChat(el, s)",
    "paintPrOfChat(el, s)", "markArtRows(s.name)", "paintCockpitOfChat(el, s)",
    "paintWebOfChat(el, s)", "paintDeviceOfChat(el, s)", "paintSlim(s.name, el)"
  ]) {
    assert.ok(solid.includes(painter), `the solid path stopped calling ${painter}`);
  }
  assert.match(solid, /if \(s\.structured\) mountStructured\(s, well\);\s*else mount\(getTerminal\(s\), well\);/);
  assert.ok(solid.indexOf("markArtRows") < solid.indexOf('el.classList.remove("arting")'), "the arting flag must be cleared after the rows are marked");
  assert.ok(solid.indexOf('el.classList.remove("arting")') < solid.indexOf("paintCockpitOfChat"), "the panes must set the arting flag after it was cleared");
});

test("the card is drawn by solid before the seat is made draggable, so the head keeps its grip", () => {
  const made = slice("function createTile(s) {", "\nfunction sinceStart(");
  assert.ok(made.includes("tileSideOf(el, s);"), "createTile never mounts the solid side");
  assert.ok(made.indexOf("tileSideOf(el, s);") < made.indexOf("seatDrag(el, s.name);"), "seatDrag would wire a head the solid view then throws away");
  assert.match(slice("for (const [key, el] of tiles) {", "\n  if (!shown.length) {", arranged), /vanish\(el\); tiles\.delete\(key\);/);
});

test("the solid side never takes the well or the panes' anchor away from the imperative code", () => {
  const view = readFileSync(join(HERE, "src/tile.jsx"), "utf8");
  assert.ok(view.includes('class="t-art-wrap"'), "the panes look for the artifact wrap inside the side");
  assert.equal(view.includes('class="well"'), false, "the terminal well is not the solid view's to draw");
  assert.equal(view.includes('class="cover"'), false, "the keyboard cover is not the solid view's to draw");
});

const canBuild = existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/solid-js"));

test("the tile builds into the same bundle and hands the card every mount it needs", { skip: !canBuild && "esbuild and solid-js are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-tile-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const built = await readFile(join(outdir, "hive.mjs"), "utf8");
    for (const [mount, worn] of [["mountTileSide", "tileSide"], ["mountJobSide", "jobSide"], ["mountFileSide", "fileSide"], ["mountBlank", "blankSide"]]) {
      assert.match(built, new RegExp(`function ${mount}\\(`), `the bundle lost ${mount}`);
      assert.match(built, new RegExp(`st\\.${worn} = \\w+\\.${mount};`), `the bundle stopped handing ${mount} to the card`);
    }
    for (const piece of ["t-tags", "t-pill", "t-chips", "t-slack-wrap", "t-pr-wrap", "t-art-wrap", "t-more", "b-reconnect", "ed-tabs", "ed-said"]) {
      assert.ok(built.includes(piece), `the built tile lost ${piece}`);
    }
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

test("the place is an icon before the name: a cloud seat is told apart from a local one", () => {
  assert.deepEqual({ ...tile().place }, { cls: "local", icon: "#i-local", title: "local" });
  assert.deepEqual({ ...tile({ seat: { where: "cloud" } }).place }, { cls: "cloud", icon: "#i-cloud", title: "cloud" });
});

test("the browser or phone sign shows only while the seat is using it, and the browser wins when it uses both", () => {
  assert.equal(tile().using, null);
  assert.equal(tile({ seat: { device: { booted: true, busy: false } } }).using, null, "a phone that is only on is not in use");
  assert.equal(tile({ seat: { device: { booted: true, busy: true } } }).using.kind, "phone");
  assert.equal(tile({ driving: ["ana"] }).using.kind, "browser");
  assert.equal(tile({ driving: ["ana"], seat: { device: { busy: true } } }).using.kind, "browser");
});

test("in the new hive the lent keyboard says who has it in two words, the old one keeps the long line", () => {
  const lent = (next) => tile({ next, lentHere: [{ seat: "ana", with: "jonas" }] }).chips.find((c) => c.key === "lent").html;
  assert.match(lent(true), /jonas · take back$/);
  assert.match(lent(false), /jonas at the keyboard · take it back$/);
});

test("the grip opens the chat from the grid and takes it back to the grid from full screen", () => {
  assert.equal(tile().tags.grip, "open this chat — drag to reorder");
  assert.equal(tile({ open: "ana" }).tags.grip, "Back to all chats (esc)");
});

test("only the seat in a window of its own carries the button that puts it back", () => {
  assert.equal(tile().tags.home, "");
  assert.equal(tile({ inAWindowOfItsOwn: true }).tags.home, "put this seat back in the grid");
});

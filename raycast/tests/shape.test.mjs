import test from "node:test";
import assert from "node:assert/strict";
import { answersOf, bucketed, engines, groupChats, labelState, missionWith, pageMatches, seatLink, shelfLink, shelfRows, spawnBody } from "../src/shape.mjs";

test("chats are grouped the way the day reads them: waiting on you, working, quiet", () => {
  const sections = groupChats({
    sessions: [
      { name: "quiet-one", title: "Quiet one", state: "idle" },
      { name: "asks", title: "Asks", state: "idle", asks: [{ id: "q1", questions: [{ question: "Fix or warn?", options: [{ label: "Fix" }] }] }] },
      { name: "busy", title: "", state: "working", description: "Find the zeroed report" }
    ],
    spawning: [
      { id: "n1", name: "fresh", mission: "Look at the CI", step: "starting" },
      { id: "n2", name: "busy", step: "up" }
    ]
  });
  assert.deepEqual(sections.map((one) => [one.key, one.chats.map((chat) => chat.name)]), [
    ["waiting", ["asks"]],
    ["working", ["fresh", "busy"]],
    ["quiet", ["quiet-one"]]
  ]);
  assert.equal(sections[0].chats[0].questions[0].ask, "q1");
  assert.equal(sections[1].chats[1].title, "busy", "a chat with no title is named by its seat");
  assert.equal(sections[1].chats[0].state, "starting");
});

test("an empty hive has no sections at all", () => {
  assert.deepEqual(groupChats({}), []);
  assert.deepEqual(groupChats(null), []);
});

test("shelf pages come newest first, with their state and the leaf link when there is one", () => {
  const rows = shelfRows({
    leaf: "https://leaf.example.org/",
    pages: [
      { slug: "old", title: "Old", kind: "documento", label: "in-review-after-team", at: 1, tabs: { documento: { leafId: "abc" } } },
      { slug: "new", title: "New", kind: "lente", label: "delivered", at: 2, tabs: { lente: {} } },
      { title: "no slug" }
    ]
  });
  assert.deepEqual(rows.map((one) => [one.slug, one.state, one.leaf]), [
    ["new", "delivered", ""],
    ["old", "in-review", "https://leaf.example.org/doc/abc"]
  ]);
});

test("a hive with no leaf set gives no leaf link, even for a page that was mirrored", () => {
  const rows = shelfRows({ pages: [{ slug: "old", title: "Old", at: 1, tabs: { documento: { leafId: "abc" } } }] });
  assert.equal(rows[0].leaf, "");
});

test("labels read as their state, suffix or not", () => {
  assert.equal(labelState("draft-sem-subtitulo"), "draft");
  assert.equal(labelState("decided"), "decided");
  assert.equal(labelState("drafty"), "");
  assert.equal(labelState(""), "");
});

test("links are the ones the Hive app opens", () => {
  assert.equal(seatLink("fix-the-report"), "hive://seat/fix-the-report");
  assert.equal(shelfLink("a-page", "telas"), "hive://shelf/a-page?tab=telas");
  assert.equal(shelfLink("a-page"), "hive://shelf/a-page");
});

test("the selected text travels quoted under the mission", () => {
  assert.equal(missionWith("Look at this", "line one\nline two"), "Look at this\n\n> line one\n> line two");
  assert.equal(missionWith("Only the mission", ""), "Only the mission");
  assert.equal(missionWith("", "just the text"), "> just the text");
});

test("answers are keyed by the question, written text wins over the picked option", () => {
  const questions = [{ question: "Fix or warn?" }, { question: "Which ones?", multiSelect: true }, { question: "Skipped?" }];
  assert.deepEqual(answersOf(questions, { "pick-0": "Fix", "other-0": "Warn the school", "pick-1": ["A"], "other-1": "C" }), {
    "Fix or warn?": "Warn the school",
    "Which ones?": ["A", "C"]
  });
  assert.deepEqual(answersOf(questions, { "pick-0": "Fix" }), { "Fix or warn?": "Fix" });
});

test("pages fall into today, this week and earlier", () => {
  const now = new Date(2026, 9, 6, 18, 0).getTime();
  const rows = [{ at: new Date(2026, 9, 6, 9).getTime() }, { at: new Date(2026, 9, 2).getTime() }, { at: new Date(2026, 8, 1).getTime() }];
  assert.deepEqual(bucketed(rows, now).map((one) => [one.title, one.rows.length]), [["Today", 1], ["This week", 1], ["Earlier", 1]]);
});

test("the shelf filter keeps mine, the ones waiting for review, or the drafts", () => {
  const page = (state, owner = "ana") => ({ state, owner });
  assert.equal(pageMatches(page("delivered", "joao"), "mine", "joao"), true);
  assert.equal(pageMatches(page("delivered"), "mine", ""), false);
  assert.equal(pageMatches(page("decided"), "open"), true);
  assert.equal(pageMatches(page("delivered"), "open"), false);
  assert.equal(pageMatches(page("draft"), "draft"), true);
  assert.equal(pageMatches(page("closed"), "all"), true);
});

test("a page shows the thumbnail of the tab it opens on", () => {
  const [row] = shelfRows({ pages: [{ slug: "p", kind: "lente", thumbs: { documento: 2, lente: 1 }, tabs: { lente: { versions: [{}, {}] }, documento: { versions: [{}] } } }] });
  assert.deepEqual(row.thumb, { tab: "lente", version: 1 });
  assert.equal(row.versions, 3);
  assert.equal(shelfRows({ pages: [{ slug: "q", tabs: {} }] })[0].thumb, null);
});

test("only engines that are installed, on and signed in are offered", () => {
  const list = engines([
    { id: "claude", label: "Claude", installed: true, enabled: true, accounts: [{ name: "default", loggedIn: true }, { name: "work", loggedIn: false }] },
    { id: "cursor", label: "Cursor", installed: true, enabled: true, accounts: [{ name: "default", loggedIn: false }] },
    { id: "codex", installed: false, enabled: true, accounts: [] }
  ]);
  assert.deepEqual(list, [{ id: "claude", title: "Claude", accounts: ["default"] }]);
});

test("the defaults travel as empty, the way the Hive screen sends them", () => {
  assert.deepEqual(spawnBody({ prompt: "go", agent: "claude", model: "default", effort: "", account: "default" }), {
    name: "", prompt: "go", where: "local", agent: "claude", structured: true, model: "", account: ""
  });
  assert.equal(spawnBody({ prompt: "go", model: "opus", effort: "high", account: "work" }).effort, "high");
});

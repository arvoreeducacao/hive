import test from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const {
  MERGE_ARMED, branchTrouble, chatOfPr, landedSeen, markSeatLandedSeen, mergeTrouble, merging,
  prActions, prCardModel, prIsGone, prOfChat, prSays, prsOfChat, prsOnCard, tileViewModel
} = await app("seat-menu");
const { prRowModel } = await app("thread");
const { mountTileSide } = await import(new URL("../src/views.js", import.meta.url).href);

const pr = (over = {}) => ({
  key: "o/r#1", repo: "o/r", number: 1, session: "a-chat",
  state: "open", ci: "passed", ciDetail: "3 checks", review: "", mergeable: "mergeable",
  checks: [], ...over
});

function hive({ prs = [], open = null, blocks = [], reviewChat = null, openPr = null, seats = [] } = {}) {
  merging.clear();
  mergeTrouble.clear();
  for (const key of Object.keys(landedSeen)) delete landedSeen[key];
  localStorage.removeItem("hive.prs.landed.seen");
  st.prs = prs;
  st.open = open;
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: st.space, label: "", manual: true, keys }));
  st.reviewChat = reviewChat;
  st.openPr = openPr;
  st.data = { sessions: seats, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
}

test("a merged pull request stays in the seat, behind the ones still open", () => {
  hive({ prs: [pr({ key: "o/r#1", number: 1, state: "merged" }), pr({ key: "o/r#2", number: 2 })] });
  assert.deepEqual(prsOfChat("a-chat").map((p) => p.number), [2, 1]);
});

test("a closed pull request stays too — the seat keeps what it landed", () => {
  hive({ prs: [pr({ state: "closed" })] });
  assert.deepEqual(prsOfChat("a-chat").map((p) => p.key), ["o/r#1"]);
  assert.equal(prOfChat("a-chat").key, "o/r#1");
});

test("a landed pull request leaves the card once the seat has been looked at", () => {
  hive({ prs: [pr({ key: "o/r#387", number: 387, state: "closed" })] });
  assert.deepEqual(prsOnCard("a-chat").map((p) => p.number), [387], "before anyone looked it is the news of the seat");

  st.open = "a-chat";
  markSeatLandedSeen("a-chat");
  assert.deepEqual(prsOnCard("a-chat").map((p) => p.number), [387], "it does not vanish under the person reading it");

  st.open = null;
  assert.deepEqual(prsOnCard("a-chat"), [], "with the seat closed again the dead pull request is gone");
  assert.deepEqual(prsOfChat("a-chat").map((p) => p.number), [387], "the pull request screen still holds it");
});

test("a pull request still open is never taken off the card, looked at or not", () => {
  hive({ prs: [pr({ key: "o/r#9", number: 9 })] });
  markSeatLandedSeen("a-chat");
  assert.deepEqual(prsOnCard("a-chat").map((p) => p.number), [9]);
});

test("what was already seen is remembered, so a reopened app does not bring the dead ones back", () => {
  hive({ prs: [pr({ key: "o/r#387", state: "merged" })] });
  markSeatLandedSeen("a-chat");
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.prs.landed.seen")), { "o/r#387": true });
});

test("merging the one you are reading does not empty the seat under you", () => {
  hive({ prs: [pr({ key: "o/r#1", state: "merged" })], reviewChat: "a-chat", openPr: "o/r#1" });
  assert.deepEqual(prsOfChat("a-chat").map((p) => p.key), ["o/r#1"]);
});

test("a landed pull request offers the way out of the list, and nothing else", () => {
  hive();
  assert.deepEqual(prActions(pr({ state: "merged" })).map((a) => a.act), ["forget"]);
  assert.deepEqual(prActions(pr({ state: "closed" })).map((a) => a.act), ["forget"]);
  assert.deepEqual(prActions(pr({ state: "merged", error: "GitHub is down" })), []);
});

test("the card of a landed pull request comes dimmed and says how it ended", () => {
  hive();
  const card = prCardModel(pr({ state: "merged" }), false);
  assert.equal(card.landed, true);
  assert.equal(card.says, "merged");
  assert.deepEqual(card.acts.map((a) => a.act), ["forget"]);
});

test("only a PR whose chat is still on the screen can be reviewed inside it", () => {
  hive({ blocks: [["a-chat"]] });
  assert.equal(chatOfPr(pr()), "a-chat");
  hive({ blocks: [["another-chat"]] });
  assert.equal(chatOfPr(pr()), "", "the seat that opened it is gone — there is nowhere to go");
  assert.equal(chatOfPr(pr({ session: "" })), "");
});

test("a pull request the panel could not read keeps showing, with the reason", () => {
  hive({ prs: [pr({ state: "?", error: "GitHub is down" })] });
  assert.equal(prsOfChat("a-chat").length, 1);
  assert.equal(prSays(prsOfChat("a-chat")[0]), "GitHub is down");
  assert.deepEqual(prActions(prsOfChat("a-chat")[0]), []);
});

test("a failed check offers the log and the rerun, never the merge", () => {
  hive();
  const broken = pr({ ci: "failed", checks: [{ name: "tests", state: "failed", run: 42, job: 7 }] });
  assert.deepEqual(prActions(broken).map((a) => a.act), ["log", "rerun"]);
  assert.equal(prActions(broken)[0].check, "tests");
  assert.equal(prSays(broken), "tests failed");
});

test("an external status that failed has no run, so it offers the log alone", () => {
  hive();
  const broken = pr({ ci: "failed", checks: [{ name: "CodeRabbit", state: "failed", run: 0, job: 0 }] });
  assert.deepEqual(prActions(broken).map((a) => a.act), ["log"]);
});

test("green and clean offers the merge", () => {
  hive();
  const acts = prActions(pr());
  assert.deepEqual(acts.map((a) => a.act), ["merge"]);
  assert.equal(acts[0].tone, "ready");
});

test("still running offers the merge that waits for CI, and the one that does not", () => {
  hive();
  const acts = prActions(pr({ ci: "running", ciDetail: "2 of 4" }));
  assert.deepEqual(acts.map((a) => a.label), ["merge when CI passes", "force merge"]);
  assert.equal(acts[0].tone, "");
  assert.equal(acts[1].tone, "warn");
});

test("a green pull request has nothing to force — CI already answered", () => {
  hive();
  assert.deepEqual(prActions(pr()).map((a) => a.act), ["merge"]);
});

test("while the merge is in the air the button spins and takes no second click", () => {
  hive();
  merging.set("o/r#1", "now");
  const acts = prActions(pr());
  assert.deepEqual(acts.map((a) => a.act), ["merge"]);
  assert.equal(acts[0].busy, true);
  assert.equal(prSays(pr()), "merging…");
  assert.equal(prCardModel(pr(), false).acts[0].busy, true);
});

test("a merge that only got scheduled says so instead of pretending to work", () => {
  hive();
  merging.set("o/r#1", "auto");
  assert.equal(prActions(pr({ ci: "running" }))[0].label, "scheduling…", "short on the button");
  assert.equal(prSays(pr({ ci: "running" })), "scheduling the merge…", "spelled out on the state line");
});

test("a merge already armed on GitHub is never offered again — only the way past it", () => {
  hive();
  const armed = pr({ ci: "running", autoMerge: true });
  assert.equal(prSays(armed), MERGE_ARMED);
  assert.deepEqual(prActions(armed).map((a) => a.act), ["force"]);
});

test("an armed merge whose CI went red has nothing left to wait for", () => {
  hive();
  const armed = pr({ ci: "failed", autoMerge: true, checks: [{ name: "tests", state: "failed", run: 42 }] });
  assert.deepEqual(prActions(armed).map((a) => a.act), ["log", "rerun"], "the broken check speaks first");
});

test("a merge that did not go through says why, in the place the state would be", () => {
  hive();
  mergeTrouble.set("o/r#1", "Protected branch update failed");
  assert.equal(prSays(pr()), "Protected branch update failed");
  assert.equal(prCardModel(pr(), false).bad, true);
});

test("a landed pull request says it landed, even after an attempt that failed", () => {
  hive();
  mergeTrouble.set("o/r#1", "Protected branch update failed");
  assert.equal(prSays(pr({ state: "merged" })), "merged");
  assert.equal(prIsGone(pr({ state: "merged" })), true);
});

test("a landed pull request whose branch is still on GitHub offers to delete it", () => {
  hive();
  assert.deepEqual(prActions(pr({ state: "merged", branchLeft: true })).map((a) => a.act), ["branch", "forget"]);
  assert.deepEqual(prActions(pr({ state: "merged", branchLeft: false })).map((a) => a.act), ["forget"]);
  assert.deepEqual(prActions(pr({ state: "closed", branchLeft: true })).map((a) => a.act), ["branch", "forget"]);
});

test("a branch that would not go says why, where the landed state would be", () => {
  hive();
  branchTrouble.set("o/r#1", "gh refused to delete the branch");
  assert.equal(prSays(pr({ state: "merged", branchLeft: true })), "gh refused to delete the branch");
  branchTrouble.clear();
});

test("draft, conflict and changes requested get no button at all", () => {
  hive();
  assert.deepEqual(prActions(pr({ state: "draft" })), []);
  assert.deepEqual(prActions(pr({ mergeable: "conflicting" })), []);
  assert.deepEqual(prActions(pr({ review: "changes_requested" })), []);
});

test("what each state says in one line", () => {
  hive();
  assert.equal(prSays(pr({ state: "draft" })), "draft");
  assert.equal(prSays(pr({ mergeable: "conflicting" })), "conflict with the base");
  assert.equal(prSays(pr({ ci: "running", ciDetail: "2 of 4" })), "2 of 4 running");
  assert.equal(prSays(pr({ review: "changes_requested" })), "changes requested");
  assert.equal(prSays(pr()), "3 checks");
  assert.equal(prSays(pr({ ci: "none", ciDetail: "" })), "no ci");
});

test("the row of a PR whose chat is still open offers the chat, and only the chat, as a way out", () => {
  hive({ blocks: [["a-chat"]], seats: [{ name: "a-chat", title: "a-chat", where: "local", state: "idle" }] });
  const row = prRowModel(pr());
  assert.equal(row.seat.go, "a-chat", "the seat is the button that goes to the chat");
  assert.equal(row.seat.say, "· a-chat");
  assert.ok(!JSON.stringify(row.chips).includes("go"), "nothing else in the row goes anywhere");
});

test("the row of a PR whose chat is gone names the seat without offering to go there", () => {
  hive({ blocks: [[]], seats: [] });
  const row = prRowModel(pr());
  assert.equal(row.seat.go, "", "there is no chat left to open");
  assert.equal(row.seat.say, "· a-chat", "the seat that opened it is still named");
});

test("a PR nobody opened from a chat says so", () => {
  hive({ blocks: [[]] });
  assert.equal(prRowModel(pr({ session: "" })).seat.say, "· no chat");
});

test("a broken check turns the card red and hands over the log", () => {
  hive();
  const card = prCardModel(pr({ ci: "failed", checks: [{ name: "lint", state: "failed", run: "42" }] }), false);
  assert.equal(card.bad, true);
  assert.equal(card.says, "lint failed");
  assert.equal(card.acts[0].act, "log");
  assert.equal(card.acts[0].check, "lint");
});

test("a card of a pull request ready to land offers the merge, not the log", () => {
  hive();
  const card = prCardModel(pr(), false);
  assert.deepEqual(card.acts.map((a) => a.act), ["merge"]);
});

test("the card says how big the change is", () => {
  hive();
  const card = prCardModel(pr({ additions: 61, deletions: 18 }), false);
  assert.deepEqual(card.scale, { added: "+61", gone: "−18" });
  assert.equal(prCardModel(pr(), false).scale, null);
});

test("only the pull request open in the review comes marked", () => {
  hive();
  assert.equal(prCardModel(pr(), true).here, true);
  assert.equal(prCardModel(pr(), false).here, false);
});

test("a title with html in it lands escaped, never as markup", () => {
  const seat = { name: "a-chat", title: "a-chat", where: "local", state: "idle", trees: [] };
  hive({ prs: [pr({ title: 'fix: <img src=x onerror="boom">' })], open: "a-chat", blocks: [["a-chat"]], seats: [seat] });
  const host = document.createElement("div");
  const side = mountTileSide(host, tileViewModel(seat), {});
  const subject = host.querySelector(".t-pr .subject");
  assert.equal(subject.querySelector("img"), null, "the title is text, never markup");
  assert.equal(subject.textContent, 'fix: <img src=x onerror="boom">');
  side.dispose();
});

test("the card says the tone of its status: running, fine, in trouble or quiet", () => {
  hive();
  const toneOf = (over) => prCardModel(pr(over), false).tone;
  assert.equal(toneOf({ ci: "running", ciDetail: "4 of 7" }), "running");
  assert.equal(toneOf({ ci: "passed" }), "ok");
  assert.equal(toneOf({ ci: "failed" }), "bad");
  assert.equal(toneOf({ mergeable: "conflicting" }), "bad");
  assert.equal(toneOf({ state: "merged" }), "quiet");
  assert.equal(toneOf({ state: "draft", ci: "none" }), "quiet");
});

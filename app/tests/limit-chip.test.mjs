import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const {
  accountSaid, accountTag, accountsOnTheBar, limPopViewModel, limitChipTitle, limitChipViewModel
} = await app("limit-chip");

function bar(rows, tightest = "") {
  st.limits = { accounts: rows, tightest };
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  return limitChipViewModel();
}

const roomy = {
  account: "default",
  provider: "claude",
  signedIn: true,
  label: "Claude",
  color: "#D97757",
  limits: [
    { kind: "session", percent: 27, resets_at: "2026-08-29T05:00:00Z" },
    { kind: "weekly_all", percent: 55, resets_at: "2026-09-01T17:00:00Z" },
    { kind: "weekly_scoped", percent: 23, model: "Fable", resets_at: "2026-09-01T17:00:00Z" }
  ]
};

const dry = {
  account: "acme",
  provider: "claude",
  signedIn: true,
  label: "Claude",
  color: "#D97757",
  limits: [
    { kind: "session", percent: 100, resets_at: "2026-08-29T04:00:00Z" },
    { kind: "weekly_all", percent: 77, resets_at: "2026-08-30T17:00:00Z" }
  ]
};

const codex = {
  account: "default",
  provider: "codex",
  signedIn: true,
  label: "Codex",
  color: "#10A37F",
  limits: [
    { kind: "session", percent: 52 },
    { kind: "weekly_all", percent: 37 }
  ]
};

test("one login paints the two windows that can stop you, and nothing else", () => {
  const foot = bar([roomy], "default");
  assert.equal(foot.hidden, false);
  assert.equal(foot.accounts.length, 1);
  assert.deepEqual(foot.accounts[0].parts.map((one) => one.k), ["5h", "week"]);
  assert.deepEqual(foot.accounts[0].parts.map((one) => one.pct), ["27%", "55%"]);
  assert.ok(!foot.accounts[0].parts.some((one) => one.pct === "23%"), "the model-scoped week is not one of the meters");
  assert.equal(foot.accounts[0].who, "", "with one login of this agent there is no name to disambiguate");
});

test("every login signed in gets its own meter, whatever is running on it", () => {
  const foot = bar([roomy, codex], "default");
  assert.deepEqual(foot.accounts.map((one) => one.icon), ["i-claude", "i-codex"]);
  assert.deepEqual(foot.accounts.map((one) => one.color), ["#D97757", "#10A37F"]);
  assert.deepEqual(foot.accounts.map((one) => one.parts.map((part) => part.pct)), [["27%", "55%"], ["52%", "37%"]]);
  assert.deepEqual(foot.accounts.map((one) => one.who), ["", ""], "the mark already says which agent it is");
});

test("two logins of the same agent are told apart by name", () => {
  const foot = bar([roomy, dry, codex], "acme");
  assert.deepEqual(foot.accounts.map((one) => one.who), ["default", "acme", ""]);
  assert.deepEqual(foot.accounts.map((one) => one.key), ["claude/default", "claude/acme", "codex/default"]);
});

test("every number carries its own track, filled to that number and nothing else", () => {
  const foot = bar([roomy, dry], "acme");
  assert.deepEqual(foot.accounts.map((one) => one.parts.map((part) => [part.pct, part.width])), [
    [["27%", "27%"], ["55%", "55%"]],
    [["100%", "100%"], ["77%", "77%"]]
  ]);
  assert.ok(!("width" in foot.accounts[0]), "there is no single bar standing for the whole login any more");
  const over = bar([{ account: "default", signedIn: true, limits: [{ kind: "session", percent: 140 }] }], "default");
  assert.equal(over.accounts[0].parts[0].width, "100%", "a meter never fills past the end of the track");
});

test("the colour lives in the meter that is closing, never in the whole bar", () => {
  const warming = bar([{ account: "default", signedIn: true, limits: [{ kind: "session", percent: 81 }, { kind: "weekly_all", percent: 96 }] }], "default");
  assert.deepEqual(warming.accounts[0].parts.map((one) => [one.k, one.heat]), [["5h", "hot"], ["week", "full"]]);
  assert.ok(!("heat" in warming), "the whole bar no longer turns");
});

test("a login nobody signed into never shows up, and with none signed in the bar stays away", () => {
  const nobody = { account: "spare", signedIn: false, limits: [], error: "not signed in" };
  bar([roomy, nobody], "default");
  assert.deepEqual(accountsOnTheBar().map((row) => row.account), ["default"]);

  const empty = bar([nobody], "");
  assert.equal(empty.hidden, true);
  assert.deepEqual(empty.accounts, []);
});

const refused = { account: "acme", provider: "claude", signedIn: true, label: "Claude", limits: [], until: Date.parse("2026-08-29T11:20:00Z") };

test("a login the plan will not answer for keeps its place on the bar, with a dash where the number was", () => {
  const foot = bar([roomy, refused], "default");
  assert.deepEqual(foot.accounts.map((one) => one.who), ["default", "acme"], "the login is still there to be seen");
  const quiet = foot.accounts[1];
  assert.equal(quiet.quiet, true);
  assert.deepEqual(quiet.parts, [{ key: "quiet", k: "", heat: "", pct: "—", width: "0%" }]);
});

test("numbers the server remembered are shown, dimmed, and say when they were read", () => {
  const kept = { ...roomy, account: "acme", stale: Date.parse("2026-08-29T09:12:00Z"), until: Date.parse("2026-08-29T11:20:00Z") };
  const foot = bar([roomy, kept], "default");
  const old = foot.accounts[1];
  assert.equal(old.quiet, true, "remembered numbers are not fresh ones");
  assert.deepEqual(old.parts.map((one) => one.pct), ["27%", "55%"], "and they are still the numbers, not a dash");
  assert.match(accountSaid(kept), /^current session 27%.+ — last answer .+/);
});

test("a login with nothing to show says why, and when it comes back", () => {
  assert.match(accountSaid(refused), /^the plan is not answering — back .+/);
  assert.equal(accountSaid({ ...refused, until: 0 }), "the plan is not answering");
});

test("a login is named by its agent only when there is more than one agent on the bar", () => {
  assert.equal(accountTag(roomy, [roomy]), "default");
  assert.equal(accountTag(roomy, [roomy, codex]), "Claude");
  assert.equal(accountTag(roomy, [roomy, dry]), "default");
  assert.equal(accountTag(roomy, [roomy, dry, codex]), "Claude · default");
  assert.equal(accountTag(codex, [roomy, dry, codex]), "Codex");
});

test("the tooltip names every login, its windows and when they come back", () => {
  const foot = bar([roomy, dry], "acme");
  const said = limitChipTitle([roomy, dry]).split("\n");
  assert.equal(said.length, 3);
  assert.match(said[0], /^default — current session 27% \(resets .+\) · current week · all models 55%/);
  assert.match(said[1], /^acme — current session 100%/);
  assert.ok(!said.join("\n").includes("Fable"), "the model-scoped week does not belong on the bar");
  assert.equal(said[2], "click for the whole picture");
  assert.equal(foot.title, said.join("\n"));
});

test("the popover carries one block per login, each window with its meter and its reset", () => {
  bar([roomy, dry], "acme");
  const pop = limPopViewModel();
  assert.deepEqual(pop.accounts.map((one) => one.account), ["default", "acme"]);
  assert.ok(pop.accounts.every((one) => one.named));
  assert.deepEqual(pop.accounts[0].limits.map((one) => one.label), ["current session", "current week · all models", "current week · Fable"]);
  assert.equal(pop.accounts[0].limits[0].pct, "27% used");
  assert.equal(pop.accounts[1].limits[0].pct, "100% used");
  assert.match(pop.accounts[0].limits[0].resets, /^resets .+/);
  assert.equal(pop.accounts[0].limits[2].pct, "23% used", "the model-scoped week is a window of its own here");
  assert.deepEqual(pop.accounts[0].limits.map((one) => one.sub), [false, false, true], "only the model-scoped week hangs off the week above it");
});

test("the popover names no login when only one is signed in, and says so when nobody is", () => {
  bar([roomy], "default");
  const pop = limPopViewModel();
  assert.equal(pop.accounts.length, 1);
  assert.equal(pop.accounts[0].named, false);
  assert.equal(pop.accounts[0].note, "", "a fresh answer needs no note");
  assert.equal(pop.empty, "");

  bar([{ account: "spare", signedIn: false, limits: [], error: "not signed in" }], "");
  const nothing = limPopViewModel();
  assert.deepEqual(nothing.accounts, []);
  assert.equal(nothing.empty, "no login is signed in on this machine");
});

test("the popover carries the reason a login is quiet, and the age of what it kept", () => {
  bar([roomy, refused], "default");
  const quiet = limPopViewModel().accounts[1];
  assert.deepEqual(quiet.limits, []);
  assert.match(quiet.note, /^the plan is not answering — back .+/);

  bar([roomy, { ...roomy, account: "acme", stale: Date.parse("2026-08-29T09:12:00Z") }], "default");
  const kept = limPopViewModel().accounts[1];
  assert.equal(kept.limits.length, 3);
  assert.match(kept.note, /^last answer .+/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bySeverity, countByState, shortTime, worstState } from "../doctor/doctor-core.mjs";
import { phrase } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(HERE, "assets/status-strip.mjs"), "utf8");

const from = source.indexOf("export const SLOT_OF");
const to = source.indexOf("const STYLE = ");
assert.ok(from >= 0 && to > from, "could not cut the helpers with no DOM out of status-strip.mjs");

const strip = new Function("bySeverity", "countByState", "shortTime", "worstState", "phrase",
  source.slice(from, to).replaceAll("export ", "")
  + "return { slotOf, headlineOf, fuse, findings, cardsOf, settledOf, autoFixable, lineOf, keepResult, resultFor, forgetResult, seatNameOf, missionOf, markOf, canSilence, silence, silenced, unsilence, silencedOf, silencedEntries, loadSilenced, loadIgnored, ignoredUntil, ignored };"
)(bySeverity, countByState, shortTime, worstState, phrase);

const item = (id, state, extra) => ({ id, title: id, state, detail: `${id} says something`, fix: null, ...(extra || {}) });
const contract = (state, kind) => item(
  state === "hub-context" ? "hub-context" : "hub-contract",
  state === "hub-context" ? "warn" : "fail",
  { group: "hub-checkout", fix: { label: `label ${kind}`, command: `cmd ${kind}`, kind } }
);

const report = (...items) => ({ dev: "rafael", pod: "ws-rafael-0", ranWith: "/opt/hive/doctor.mjs", generatedAt: "2026-08-25T14:11:53Z", automatic: [], items });

test("the doctor's ids know which card of the pod screen they belong to", () => {
  assert.equal(strip.slotOf("disk"), "diskCard");
  assert.equal(strip.slotOf("credential"), "claudeCard");
  assert.equal(strip.slotOf("remote-control"), "claudeCard");
  assert.equal(strip.slotOf("cloud-sessions"), "syncCard");
  assert.equal(strip.slotOf("pod"), "hero");
  assert.equal(strip.slotOf("gh"), "", "everything else falls into the list of findings");
});

test("the two halves of the hub checkout are one card, with the worst state and the fix of the pair", () => {
  const found = strip.findings(report(contract("hub-context", "copy"), contract("hub-contract", "fix"), item("gh", "warn")));
  const fused = found.filter((m) => m.group === "hub-checkout");
  assert.equal(fused.length, 1, "two checks about one checkout are one thing to do");
  assert.deepEqual(fused[0].ids, ["hub-context", "hub-contract"]);
  assert.equal(fused[0].state, "fail", "the pair carries the worse of the two");
  assert.equal(fused[0].fix.kind, "fix", "and the recipe that actually fixes it, not the one you copy");
  assert.equal(fused[0].fixId, "hub-contract");
});

test("the findings come out worst first, whatever order the runner declared them in", () => {
  const found = strip.findings(report(item("gh", "warn"), item("disk", "ok"), item("remote-control", "fail"), item("repos", "warn")));
  assert.deepEqual(found.map((m) => m.id), ["remote-control", "gh", "repos"]);
  assert.equal(found.some((m) => m.state === "ok"), false, "a green check is not a finding");
});

test("the line carries the headline of the worst finding, not a count", () => {
  const said = strip.lineOf(report(item("gh", "warn"), item("remote-control", "fail")));
  assert.equal(said.state, "fail");
  assert.equal(said.title, phrase("the remote control is not up"));
  assert.match(said.rest, /remote-control says something/);
});

test("with warnings only the line counts them and still names the worst", () => {
  const said = strip.lineOf(report(item("gh", "warn"), item("repos", "warn"), item("disk", "ok")));
  assert.equal(said.state, "warn");
  assert.equal(said.count, 2);
  assert.match(said.rest, /gh on the server is not signed in|não está logado/);
});

test("a clean environment says so, instead of showing nothing at all", () => {
  const said = strip.lineOf(report(item("gh", "ok"), item("disk", "ok")));
  assert.equal(said.state, "ok");
  assert.equal(said.title, phrase("Environment ok"));
  assert.match(said.rest, /2/);
});

test("the result of a click survives the redraw the next poll brings", () => {
  strip.forgetResult("remote-control");
  const before = strip.findings(report(item("remote-control", "fail")));
  assert.equal(strip.resultFor(before[0]), null);
  strip.keepResult("remote-control", { kind: "fix", ok: false, text: "ran, and the check is still red" });
  const after = strip.findings(report(item("remote-control", "fail")));
  assert.notEqual(after[0], before[0], "a poll hands the page brand new objects");
  assert.equal(strip.resultFor(after[0]).text, "ran, and the check is still red", "and the answer to the click has to survive them");
  strip.forgetResult("remote-control");
});

test("a check that went green keeps its card while the result is on it", () => {
  strip.forgetResult("remote-control");
  strip.keepResult("remote-control", { kind: "fix", ok: true, text: "the check went green" });
  const cards = strip.cardsOf(report(item("remote-control", "ok"), item("gh", "warn")));
  assert.deepEqual(cards.map((m) => m.id), ["gh", "remote-control"], "the settled one stays, at the bottom");
  assert.equal(strip.findings(report(item("remote-control", "ok"), item("gh", "warn"))).length, 1, "but it is no longer a finding");
  strip.forgetResult("remote-control");
});

test("the result of the pair is found from either of its two ids", () => {
  strip.forgetResult("hub-contract");
  strip.keepResult("hub-contract", { kind: "fix", ok: true, text: "pulled" });
  const found = strip.findings(report(contract("hub-context", "copy"), contract("hub-contract", "fix")));
  assert.equal(strip.resultFor(found[0]).text, "pulled");
  strip.forgetResult("hub-contract");
});

test("the seat the card opens has a name the spawn guard accepts, and a new one every time", () => {
  const name = strip.seatNameOf({ ids: ["remote-control"] }, "2026-08-25T14:11:53Z");
  assert.match(name, /^[a-z0-9-]+$/, "a shell metacharacter in the name is refused by assertSpawnArgs");
  assert.notEqual(name, strip.seatNameOf({ ids: ["remote-control"] }, "2026-08-25T14:12:07Z"), "a fixed name collides on the second click");
});

test("the mission tells the seat to distrust the recipe before running it", () => {
  const found = strip.findings(report(item("remote-control", "fail", { fix: { label: "restart it", command: "kubectl exec …", kind: "fix" } })));
  const said = strip.missionOf(found[0], report());
  assert.match(said, /kubectl exec …/, "the recipe travels with the mission");
  assert.match(said, /distrust|desconfie/, "and the warning not to trust it");
  assert.match(said, /\/opt\/hive\/doctor\.mjs --json/, "and how the seat knows it is done — by the doctor the app carries, not a command on a PATH");
});

test("a check that went green leaves the queue of what is open", () => {
  strip.forgetResult("remote-control");
  strip.keepResult("remote-control", { kind: "fix", ok: true, text: "the check went green" });
  const said = report(item("remote-control", "ok"), item("gh", "warn"));
  assert.deepEqual(strip.findings(said).map((m) => m.id), ["gh"], "the panel lists what is open, and this one is not");
  assert.deepEqual(strip.settledOf(said).map((m) => m.id), ["remote-control"], "it moves to the group of what was solved in this session");
  strip.forgetResult("remote-control");
});

test("nothing reaches the settled group without a receipt to show", () => {
  strip.forgetResult("remote-control");
  const said = report(item("remote-control", "ok"), item("gh", "warn"));
  assert.deepEqual(strip.settledOf(said), [], "a check that was already green when the doctor woke up was never solved by anybody");
  strip.forgetResult("remote-control");
});

test("a receipt is stamped when it lands, so the group can say since when", () => {
  strip.forgetResult("gh");
  const kept = strip.keepResult("gh", { kind: "fix", ok: true, text: "green" });
  assert.ok(kept.at > 0, "without a stamp the group has nothing to count from");
  strip.forgetResult("gh");
});

test("only a recipe that really fixes goes into the batch the strip runs", () => {
  const fix = (id, kind) => item(id, "warn", { fix: { label: `run ${id}`, command: `cmd ${id}`, kind } });
  const said = report(fix("remote-control", "fix"), fix("cloud-sessions", "copy"), fix("last-death", "investigate"), item("gh", "warn"));
  assert.deepEqual(
    strip.autoFixable(said),
    ["remote-control"],
    "a command you paste yourself and a log that only gets read would be a lie in a button that says it resolves"
  );
  assert.deepEqual(strip.autoFixable(report(item("gh", "ok"))), [], "nothing open, nothing to run");
});

test("a warning you chose to live with leaves the list, and the strip stops counting it", () => {
  strip.loadSilenced([]);
  const said = report(item("cloud-sessions", "warn"), item("gh", "warn"));
  const before = strip.findings(said);
  assert.equal(before.length, 2);
  assert.equal(strip.silence(before.find((m) => m.id === "cloud-sessions")), true);
  assert.deepEqual(strip.findings(said).map((m) => m.id), ["gh"], "the silenced one is still in the panel's list");
  assert.deepEqual(strip.silencedOf(said).map((m) => m.id), ["cloud-sessions"], "and it is nowhere to be brought back from");
  assert.equal(strip.lineOf(said).count, 1, "the strip kept shouting about what you silenced");
  strip.loadSilenced([]);
});

test("the silence dies on its own the moment the warning says something new", () => {
  strip.loadSilenced([]);
  const before = { id: "cloud-sessions", state: "warn", detail: "sessions live only on the volume", ids: ["cloud-sessions"] };
  strip.silence(before);
  assert.equal(strip.silenced(before), true);
  assert.equal(
    strip.silenced({ ...before, detail: "sessions live only on the volume, and the volume is full" }),
    false,
    "a silence that outlives what it was about is how a real problem goes unseen"
  );
  assert.equal(strip.silenced({ ...before, state: "fail" }), false, "the same check going from warning to failure is news");
  strip.loadSilenced([]);
});

test("a failure cannot be silenced — a pod that is down is not something to live with", () => {
  strip.loadSilenced([]);
  const down = { id: "pod", state: "fail", detail: "no pod answers", ids: ["pod"] };
  assert.equal(strip.canSilence(down), false);
  assert.equal(strip.silence(down), false);
  assert.equal(strip.silenced(down), false);
  strip.loadSilenced([]);
});

test("the line never says everything is fine while something is silenced", () => {
  strip.loadSilenced([]);
  const said = report(item("cloud-sessions", "warn"), item("gh", "ok"));
  strip.silence(strip.findings(said)[0]);
  const line = strip.lineOf(said);
  assert.equal(line.state, "ok");
  assert.match(line.rest, /1/, "silencing something is not the same as it not being there");
  strip.loadSilenced([]);
});

test("the silence survives a restart, and comes back keyed to what it was about", () => {
  strip.loadSilenced([]);
  const said = report(item("cloud-sessions", "warn"));
  strip.silence(strip.findings(said)[0]);
  const saved = strip.silencedEntries();
  assert.deepEqual(saved.map(([key]) => key), ["cloud-sessions"]);
  strip.loadSilenced([]);
  assert.equal(strip.findings(said).length, 1, "nothing was restored yet");
  strip.loadSilenced(saved);
  assert.equal(strip.findings(said).length, 0, "what was silenced yesterday shouts again today");
  strip.loadSilenced([{ key: "not a pair" }, ["cloud-sessions", 7]]);
  assert.deepEqual(strip.silencedEntries(), [], "a corrupted store has to be ignored, not crash the strip");
  strip.loadSilenced([]);
});

test("what you silenced is not swept up by the batch the strip runs", () => {
  strip.loadSilenced([]);
  const fix = (id) => item(id, "warn", { fix: { label: `run ${id}`, command: `cmd ${id}`, kind: "fix" } });
  const said = report(fix("hub-context"), fix("gh"));
  assert.deepEqual(strip.autoFixable(said).sort(), ["gh", "hub-context"]);
  strip.silence(strip.findings(said).find((m) => m.id === "hub-context"));
  assert.deepEqual(strip.autoFixable(said), ["gh"], "resolving in bulk what you asked not to hear about is the opposite of silence");
  strip.loadSilenced([]);
});

test("a warning ignored for good stays out of the list even when its words change", () => {
  strip.loadIgnored({ "cloud-sessions": 0 });
  const said = report(item("cloud-sessions", "warn", { detail: "a detail that moves every run" }), item("gh", "warn"));
  assert.deepEqual(strip.findings(said).map((m) => m.id), ["gh"]);
  assert.deepEqual(strip.silencedOf(said).map((m) => m.id), ["cloud-sessions"], "an ignored check still needs a way back");
  assert.equal(strip.lineOf(said).count, 1);
  strip.loadIgnored({});
});

test("a warning ignored for good comes back the moment it turns into a failure", () => {
  strip.loadIgnored({ "cloud-sessions": 0 });
  const said = report(item("cloud-sessions", "fail"));
  assert.equal(strip.ignored(strip.fuse(said.items)[0]), false, "a for-good ignore on a warning would hide a real failure forever");
  strip.loadIgnored({});
});

test("a failure ignored for a while comes back when the while is over", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const down = { id: "pod", state: "fail", ids: ["pod"] };
  strip.loadIgnored({ pod: now + 1000 });
  assert.equal(strip.ignoredUntil(down, now), now + 1000);
  assert.equal(strip.ignored(down, now + 1001), false);
  strip.loadIgnored({});
});

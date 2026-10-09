import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountRanDry } from "../engine/protocol.mjs";
import { accountUnder, accountsRoot, hasRoom, noteBack, noteSpent, readLedger, DEFAULT_ACCOUNT, GUESSED_WAIT_MS } from "../engine/accounts.mjs";
import { accountFailover } from "../engine/failover.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

function machineWith(accounts, provider = "claude") {
  const base = mkdtempSync(join(tmpdir(), "hive-accounts-"));
  for (const one of accounts) mkdirSync(join(accountsRoot(base, provider), one), { recursive: true });
  return base;
}

function bench({ bornOn = "", home = "", busy = false, accounts = ["work", "spare"], provider = "claude" } = {}) {
  const base = machineWith(accounts, provider);
  const applied = [];
  const emitted = [];
  const persisted = [];
  const said = [];
  let lastSaid = null;
  const logins = accountFailover({
    base,
    provider,
    bornIn: bornOn ? join(accountsRoot(base, provider), bornOn) : "",
    home,
    emit: (e) => emitted.push(e),
    persist: (p) => persisted.push(p),
    apply: (move) => applied.push(move),
    redo: () => { if (lastSaid) said.push(lastSaid); return !!lastSaid; },
    busy: () => busy,
  });
  return {
    logins, base, applied, emitted, persisted, said,
    remember: (item) => { lastSaid = item; },
    theTurnEnded: (message) => logins.turnEnded(accountRanDry(message)),
  };
}

const changed = (emitted) => emitted.filter((e) => e.subtype === "account_changed");

test("moving to another account hands the child the folder that login lives in", () => {
  const b = bench();
  assert.equal(b.logins.moveTo("work"), "work");
  assert.equal(b.logins.name, "work");
  assert.deepEqual(b.applied, [{ name: "work", dir: join(b.base, "accounts", "work"), why: "asked" }]);
  assert.deepEqual(changed(b.emitted).map((e) => e.account), ["work"]);
  assert.equal(b.persisted.filter((p) => "account" in p).at(-1).account, "work");
});

test("going back to the account everybody starts with hands the child no folder at all", () => {
  const b = bench({ bornOn: "work" });
  assert.equal(b.logins.moveTo(""), "");
  assert.equal(b.logins.dir, "");
  assert.deepEqual(b.applied.at(-1), { name: "", dir: "", why: "asked" });
});

test("an account this machine does not hold leaves the seat where it was", () => {
  const b = bench({ bornOn: "work" });
  assert.throws(() => b.logins.moveTo("spare2"), /no account called spare2/);
  assert.equal(b.logins.name, "work");
  assert.deepEqual(b.applied, []);
  assert.deepEqual(changed(b.emitted), []);
});

test("a name that could climb out of the accounts folder never reaches the filesystem", () => {
  for (const account of ["../../.ssh", "work/../..", "Work", "-work"]) {
    const b = bench();
    assert.throws(() => b.logins.moveTo(account), /goes by that name/, `${account} was taken`);
    assert.equal(b.logins.name, "");
  }
});

test("picking the account the seat already runs on costs it nothing", () => {
  const b = bench({ bornOn: "work" });
  assert.equal(b.logins.moveTo("work"), "work");
  assert.deepEqual(b.applied, []);
  assert.deepEqual(changed(b.emitted), []);
});

test("a seat mid-turn keeps its login until the turn lets go", () => {
  assert.match(driver, /setAccount: async \(\) => \{\s*if \(gate\.busy\) throw new Error\("this chat is mid-turn/);
});

test("the seat says which login it is on, and starting says it too", () => {
  assert.match(driver, /current: \{ model: currentModel, effort, from: [^}]*account: logins\.name \}/);
  assert.match(driver, /subtype: "started"[^}]*account: logins\.name/);
});

test("the claude driver moves the session in place: new env, fresh input, the old stream closed", () => {
  assert.match(driver, /function sessionTakesLogin\(dir\) \{\s*const inherited = \{ \.\.\.process\.env \};\s*if \(dir\) inherited\.CLAUDE_CONFIG_DIR = dir;\s*else delete inherited\.CLAUDE_CONFIG_DIR;\s*options\.env = inherited;\s*options\.mcpServers = seatMcpServers\(dir\);\s*const stale = input;\s*openSession\(true\);\s*stale\.close\(\);\s*effortRestored = false;/);
});

const SOMEWHERE = "/home/someone/.hive";

test("only a folder the hive handed out counts as an account", () => {
  assert.equal(accountUnder(SOMEWHERE, "claude", ""), "");
  assert.equal(accountUnder(SOMEWHERE, "claude", join(SOMEWHERE, "accounts", "work")), "work");
  assert.equal(accountUnder(SOMEWHERE, "claude", join(SOMEWHERE, "accounts", "work") + "/"), "work");
  assert.equal(accountUnder(SOMEWHERE, "claude", "/home/someone/.claude-work"), null);
  assert.equal(accountUnder(SOMEWHERE, "codex", join(SOMEWHERE, "providers", "codex", "accounts", "work")), "work");
  assert.equal(accountUnder(SOMEWHERE, "codex", join(SOMEWHERE, "accounts", "work")), null);
});

test("a seat born on a folder the hive did not hand out never rotates", async () => {
  const b = bench();
  const logins = accountFailover({ base: b.base, bornIn: "/home/someone/.claude-work" });
  assert.equal(logins.name, null);
  assert.equal(logins.dir, "/home/someone/.claude-work");
  assert.equal(await logins.turnEnded({ why: "spent", says: "no room", until: 0 }), false);
  assert.equal(await logins.goHome(), false);
});

const ranOut = (says) => ({
  type: "result", subtype: "success", is_error: true,
  terminal_reason: "api_error", api_error_status: 429, result: says,
});

const SPENT = "You've hit your org's monthly spend limit · run /usage-credits to raise it";
const OVERLOADED = "API Error: 529 Overloaded. This is a server-side issue, usually temporary";

test("a turn that dies with no room left is carried on by another login", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  b.remember({ text: "finish the migration", images: [] });
  assert.equal(await b.theTurnEnded(ranOut(SPENT)), true);
  assert.equal(b.logins.name, "", "the login everybody starts with is the first one tried");
  assert.deepEqual(b.said.map((i) => i.text), ["finish the migration"]);
  const took = b.emitted.find((e) => e.subtype === "account_took_over");
  assert.equal(took.from, "work");
  assert.equal(took.account, DEFAULT_ACCOUNT);
});

test("a login already written down as spent is stepped over, not walked into", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  await noteSpent(b.base, DEFAULT_ACCOUNT, { until: Date.now() + 3600000 });
  assert.equal(await b.theTurnEnded(ranOut(SPENT)), true);
  assert.equal(b.logins.name, "spare");
});

test("the login that ran out is written down for every other seat on the machine", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  await b.theTurnEnded(ranOut("You've hit your session limit · resets 11:30pm (America/Sao_Paulo)"));
  const ledger = await readLedger(b.base);
  assert.ok(ledger.work.until > Date.now(), "the hour it comes back is kept, not guessed");
  assert.equal(hasRoom(ledger, "work"), false);
  assert.equal(hasRoom(ledger, "spare"), true);
});

test("a limit with no hour on it still parks the login, for a guessed while", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  await b.theTurnEnded(ranOut(SPENT));
  const ledger = await readLedger(b.base);
  assert.ok(ledger.work.until > Date.now(), "an unreadable clock is a short wait, never no wait");
  assert.ok(ledger.work.until <= Date.now() + GUESSED_WAIT_MS + 1000);
});

test("a busy minute on the other end is not a spent account, and moves nobody", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  assert.equal(await b.theTurnEnded(ranOut(OVERLOADED)), false);
  assert.equal(b.logins.name, "work");
  assert.deepEqual(await readLedger(b.base), {});
});

test("a turn that simply ended leaves every login where it was", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  const done = { type: "result", subtype: "success", is_error: false, terminal_reason: "completed", result: "done" };
  assert.equal(await b.theTurnEnded(done), false);
  assert.equal(b.logins.name, "work");
  assert.deepEqual(b.emitted.filter((e) => e.subtype === "account_took_over"), []);
});

test("with nowhere left to go the seat stays put and says so", async () => {
  const b = bench({ bornOn: "work", home: "work", accounts: ["work"] });
  await noteSpent(b.base, DEFAULT_ACCOUNT, { until: Date.now() + 3600000 });
  assert.equal(await b.theTurnEnded(ranOut(SPENT)), false);
  assert.equal(b.logins.name, "work");
  const stuck = b.emitted.find((e) => e.subtype === "every_account_spent");
  assert.equal(stuck.account, "work");
  assert.deepEqual(b.said, [], "nothing is said twice when there is no fresh login to say it on");
});

const EXPIRED = "Failed to authenticate: OAuth session expired and could not be refreshed";

test("a login that answers expired is read again once, on the same account, before anything is written down", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  b.remember({ text: "teste", images: [] });
  assert.equal(await b.theTurnEnded(ranOut(EXPIRED)), true);
  assert.equal(b.logins.name, "work", "the seat stays on its own login");
  assert.equal(b.applied.length, 1, "the child is opened again, so it reads the login from disk");
  assert.equal(b.applied[0].why, "relogin");
  assert.equal(b.applied[0].dir, join(accountsRoot(b.base), "work"));
  assert.deepEqual(b.said.map((i) => i.text), ["teste"]);
  assert.ok(b.emitted.some((e) => e.subtype === "login_reread" && e.account === "work"));
  assert.deepEqual(await readLedger(b.base), {}, "a login another process already refreshed is never parked");
});

test("the seat on the login everybody starts with is read again too", async () => {
  const b = bench({ accounts: [] });
  b.remember({ text: "teste", images: [] });
  assert.equal(await b.theTurnEnded(ranOut(EXPIRED)), true);
  assert.equal(b.applied[0].dir, "");
  assert.deepEqual(await readLedger(b.base), {});
});

test("a second expired answer in a row is a login that really needs a person, and says so", async () => {
  const b = bench({ accounts: [] });
  b.remember({ text: "teste", images: [] });
  await b.theTurnEnded(ranOut(EXPIRED));
  assert.equal(await b.theTurnEnded(ranOut(EXPIRED)), false);
  assert.equal(b.said.length, 1, "read again once, never in a loop");
  const stuck = b.emitted.find((e) => e.subtype === "every_account_spent");
  assert.equal(stuck.why, "login");
});

test("a turn that goes through earns the seat a fresh re-read for the next time the login lapses", async () => {
  const b = bench({ accounts: [] });
  b.remember({ text: "teste", images: [] });
  await b.theTurnEnded(ranOut(EXPIRED));
  await b.theTurnEnded({ type: "result", subtype: "success", is_error: false, terminal_reason: "completed", result: "ok" });
  assert.equal(await b.theTurnEnded(ranOut(EXPIRED)), true);
  assert.equal(b.applied.length, 2);
});

test("a login that needs a person back is parked with no hour, so nobody walks into it", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  await b.theTurnEnded(ranOut(EXPIRED));
  await b.theTurnEnded(ranOut(EXPIRED));
  const ledger = await readLedger(b.base);
  assert.equal(ledger.work.why, "login");
  assert.equal(ledger.work.until, 0);
  assert.equal(hasRoom(ledger, "work"), false);
  assert.equal(hasRoom(ledger, "work", Date.now() + 30 * 24 * 3600000), false);
});

test("a ring of spent logins ends in a stop, never in a spin", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  b.remember({ text: "keep going", images: [] });
  for (let round = 0; round < 12; round += 1) await b.theTurnEnded(ranOut(SPENT));
  assert.ok(b.emitted.some((e) => e.subtype === "every_account_spent"), "the seat says the machine is out");
  assert.equal(b.said.length, 2, "one try on each of the other two logins, and no more");
  const ledger = await readLedger(b.base);
  assert.deepEqual(Object.keys(ledger).sort(), ["default", "spare", "work"]);
});

test("the seat walks home once the login it was opened on is past its hour", async () => {
  const b = bench({ bornOn: "work", home: "work" });
  await b.theTurnEnded(ranOut("You've hit your session limit · resets 11:30pm (America/Sao_Paulo)"));
  assert.equal(b.logins.name, "");
  assert.equal(await b.logins.goHome(), false);
  assert.equal(b.logins.name, "", "not while the hour has not come");
  await noteSpent(b.base, "work", { until: Date.now() - 1000 });
  assert.equal(await b.logins.goHome(), true);
  assert.equal(b.logins.name, "work");
  assert.equal(b.emitted.at(-1).subtype, "account_came_home");
  assert.deepEqual(await readLedger(b.base), {}, "the mark is torn up on the way back in");
});

test("nobody is moved home in the middle of an answer", async () => {
  const b = bench({ bornOn: "work", home: "work", busy: true });
  await b.theTurnEnded(ranOut(SPENT));
  assert.equal(b.logins.name, "");
  await noteBack(b.base, "work");
  assert.equal(await b.logins.goHome(), false);
  assert.equal(b.logins.name, "");
});

test("the login the seat was opened on survives a restart as the one it goes back to", () => {
  assert.match(driver, /if \(storedSession\.home\) logins\.setHome\(storedSession\.home\);/);
  assert.match(driver, /persistSession\(\{ home: logins\.home \}\);/);
});

test("another provider keeps its logins, its ledger and its order in a folder of its own", async () => {
  const b = bench({ bornOn: "work", home: "work", provider: "codex" });
  b.remember({ text: "carry on", images: [] });
  assert.equal(b.logins.dir, join(b.base, "providers", "codex", "accounts", "work"));
  assert.equal(await b.theTurnEnded(ranOut(SPENT)), true);
  assert.equal(b.logins.name, "");
  assert.deepEqual(Object.keys(await readLedger(b.base, "codex")), ["work"]);
  assert.deepEqual(await readLedger(b.base, "claude"), {}, "the claude ledger never hears about a codex login");
  assert.deepEqual(b.applied.at(-1), { name: "", dir: "", why: "spent" });
});

test("with every login spent the seat waits for the earliest reset and runs the refused turn again by itself", async () => {
  const base = machineWith(["work"]);
  const emitted = [];
  const said = [];
  const timers = [];
  let busy = false;
  const logins = accountFailover({
    base,
    bornIn: join(accountsRoot(base, "claude"), "work"),
    home: "work",
    emit: (e) => emitted.push(e),
    redo: () => { said.push("again"); return true; },
    busy: () => busy,
    later: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    forget: () => {},
  });
  await noteSpent(base, DEFAULT_ACCOUNT, { until: Date.now() + 2 * 3600000 });
  assert.equal(await logins.turnEnded(accountRanDry(ranOut("You've hit your session limit · resets 11:30pm (America/Sao_Paulo)"))), false);
  assert.ok(emitted.some((e) => e.subtype === "resume_planned"));
  assert.equal(timers.length, 1);
  assert.ok(timers[0].ms > 0);
  busy = true;
  await timers[0].fn();
  assert.deepEqual(said, [], "a seat that is busy again is left alone");
  busy = false;
  await noteSpent(base, "work", { until: Date.now() - 1000 });
  await logins.resumeAfterSpent();
  assert.deepEqual(said, ["again"]);
  assert.ok(emitted.some((e) => e.subtype === "resumed_after_limit"));
});

test("a new turn from the person cancels the planned resume", async () => {
  const base = machineWith(["work"]);
  const timers = [];
  const forgotten = [];
  const logins = accountFailover({
    base, bornIn: join(accountsRoot(base, "claude"), "work"), home: "work",
    later: (fn, ms) => { timers.push(fn); return "t1"; },
    forget: (timer) => forgotten.push(timer),
  });
  await noteSpent(base, DEFAULT_ACCOUNT, { until: Date.now() + 3600000 });
  await logins.turnEnded(accountRanDry(ranOut(SPENT)));
  assert.equal(logins.resumeArmed, true);
  await logins.turnEnded(null);
  assert.equal(logins.resumeArmed, false);
  assert.deepEqual(forgotten, ["t1"]);
});

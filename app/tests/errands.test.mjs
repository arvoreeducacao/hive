import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { byErrand, closedErrands, errandOf, errandsFile, forgetOldKin, goneKin, keepErrands, noteErrand, raceOf, readErrands, renameErrand, seatsOfErrand, seenFile, withErrands } from "../lib/errands.mjs";

const home = () => mkdtemp(join(tmpdir(), "hive-errands-"));

test("a seat remembers which errand of yours it belongs to", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "crm-audio-mudo", errand: "áudio mudo no CRM", asked: "descobre por que o áudio do CRM fica mudo em produção", at: 5 });
  const all = readErrands(dir);
  assert.equal(all["crm-audio-mudo"].errand, "áudio mudo no CRM");
  assert.match(all["crm-audio-mudo"].asked, /^descobre por que/);
  assert.equal(all["crm-audio-mudo"].at, 5);
  await rm(dir, { recursive: true, force: true });
});

test("the errand line is one tidy line, cut to fit the card", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "seat", errand: "  áudio   mudo\n  no CRM  " });
  assert.equal(readErrands(dir)["seat"].errand, "áudio mudo no CRM");
  noteErrand(dir, { seat: "seat", errand: "e".repeat(200) });
  assert.equal(readErrands(dir)["seat"].errand.length, 60);
  await rm(dir, { recursive: true, force: true });
});

test("no seat or no line is not an errand", async () => {
  const dir = await home();
  assert.match(noteErrand(dir, { seat: "", errand: "algo" }).error, /seat/);
  assert.match(noteErrand(dir, { seat: "SEAT/1", errand: "algo" }).error, /seat/);
  assert.match(noteErrand(dir, { seat: "seat", errand: "   " }).error, /line/);
  assert.deepEqual(readErrands(dir), {});
  await rm(dir, { recursive: true, force: true });
});

test("a seat opened by another chat is written down even with no request line", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "biblion-capas", by: "chat-abre-chat", at: 7 });
  const all = readErrands(dir);
  assert.equal(all["biblion-capas"].by, "chat-abre-chat");
  assert.equal(all["biblion-capas"].errand, "");
  await rm(dir, { recursive: true, force: true });
});

test("who opened it rides to the fleet row, and a seat nobody opened has no by", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "biblion-capas", errand: "acervo do biblion", by: "chat-abre-chat" });
  noteErrand(dir, { seat: "chat-abre-chat", errand: "acervo do biblion" });
  const rows = withErrands([{ name: "biblion-capas" }, { name: "chat-abre-chat" }], readErrands(dir));
  assert.equal(rows[0].by, "chat-abre-chat");
  assert.equal("by" in rows[1], false);
  await rm(dir, { recursive: true, force: true });
});

test("the parent's request is what a child inherits when the caller wrote none", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "chat-abre-chat", errand: "acervo do biblion" });
  assert.equal(errandOf(readErrands(dir), "chat-abre-chat"), "acervo do biblion");
  assert.equal(errandOf(readErrands(dir), "no-such-seat"), "");
  await rm(dir, { recursive: true, force: true });
});

test("a chat cannot say it opened itself, and the opener is a seat name", async () => {
  const dir = await home();
  assert.match(noteErrand(dir, { seat: "biblion-capas", by: "biblion-capas" }).error, /another seat/);
  assert.match(noteErrand(dir, { seat: "biblion-capas", by: "NOT/A/NAME" }).error, /another seat/);
  assert.deepEqual(readErrands(dir), {});
  await rm(dir, { recursive: true, force: true });
});

test("a chat that closed stays visible while the chat that opened it is alive", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "chat-abre-chat", errand: "acervo" });
  noteErrand(dir, { seat: "biblion-capas", errand: "acervo", by: "chat-abre-chat" });
  noteErrand(dir, { seat: "biblion-onix", errand: "acervo", by: "chat-abre-chat" });
  const all = readErrands(dir);
  all["biblion-capas"].endedAt = 1000;
  all["biblion-capas"].prs = ["https://github.com/acme/hive/pull/833"];

  const kin = goneKin(all, [{ name: "chat-abre-chat" }, { name: "biblion-onix" }]);
  assert.deepEqual(kin.map((one) => one.name), ["biblion-capas"]);
  assert.equal(kin[0].by, "chat-abre-chat");
  assert.equal(kin[0].prs.length, 1);

  assert.deepEqual(goneKin(all, [{ name: "biblion-onix" }]), []);
  await rm(dir, { recursive: true, force: true });
});

test("a name that is born again does not inherit the kin of the one that died", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "olha-o-acervo", errand: "acervo" });
  noteErrand(dir, { seat: "capas", errand: "acervo", by: "olha-o-acervo" });
  const all = readErrands(dir);
  all["capas"].endedAt = 1000;
  await writeFile(errandsFile(dir), JSON.stringify(all));

  forgetOldKin(dir, "olha-o-acervo");
  assert.deepEqual(Object.keys(readErrands(dir)).sort(), ["olha-o-acervo"]);
  assert.deepEqual(goneKin(readErrands(dir), [{ name: "olha-o-acervo" }]), []);
  await rm(dir, { recursive: true, force: true });
});

test("a chat that is still running keeps its line when the name it hangs from is reused", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "pai", errand: "acervo" });
  noteErrand(dir, { seat: "vivo", errand: "acervo", by: "pai" });
  forgetOldKin(dir, "pai");
  assert.deepEqual(Object.keys(readErrands(dir)).sort(), ["pai", "vivo"]);
  await rm(dir, { recursive: true, force: true });
});

test("a chat nobody opened leaves no ghost behind", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "sozinho", errand: "acervo" });
  const all = readErrands(dir);
  all["sozinho"].endedAt = 1000;
  assert.deepEqual(goneKin(all, [{ name: "outro" }]), []);
  await rm(dir, { recursive: true, force: true });
});

test("a file that is not an errand index reads as empty instead of throwing", async () => {
  const dir = await home();
  await writeFile(errandsFile(dir), "not json at all");
  assert.deepEqual(readErrands(dir), {});
  await writeFile(errandsFile(dir), JSON.stringify(["a", "b"]));
  assert.deepEqual(readErrands(dir), {});
  await rm(dir, { recursive: true, force: true });
});

const alive = (...names) => names.map((name) => ({ name, prs: [] }));

test("a seat that closed does not take the request with it — it is stamped, not deleted", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "ped-42", errand: "PED-42" });
  noteErrand(dir, { seat: "crm-audio", errand: "áudio mudo" });
  const left = keepErrands(dir, alive("crm-audio"), { now: 1000 });
  assert.equal(left.dropped, 0);
  assert.deepEqual(Object.keys(left.errands).sort(), ["crm-audio", "ped-42"], "the closed request was forgotten");
  assert.equal(left.errands["ped-42"].endedAt, 1000, "the closed one is not stamped with when it ended");
  assert.equal(left.errands["crm-audio"].endedAt, 0, "a living seat was stamped as closed");
  await rm(dir, { recursive: true, force: true });
});

test("the request keeps the PR its seat had, so what came back survives the chat closing", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "ped-42", errand: "PED-42" });
  keepErrands(dir, [{ name: "ped-42", prs: ["https://github.com/a/b/pull/812"] }], { now: 500, prsOf: (n) => (n === "ped-42" ? ["https://github.com/a/b/pull/812"] : []) });
  const gone = keepErrands(dir, [], { now: 900 });
  assert.deepEqual(gone.errands["ped-42"].prs, ["https://github.com/a/b/pull/812"]);
  assert.equal(gone.errands["ped-42"].endedAt, 900);
  await rm(dir, { recursive: true, force: true });
});

test("a request closed two weeks ago is let go, so the file does not grow forever", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "velho", errand: "coisa de agosto" });
  keepErrands(dir, [], { now: 1000 });
  const later = keepErrands(dir, [], { now: 1000 + 15 * 24 * 60 * 60 * 1000 });
  assert.equal(later.dropped, 1);
  assert.deepEqual(Object.keys(later.errands), []);
  await rm(dir, { recursive: true, force: true });
});

test("nothing to stamp and nothing to drop is not a write", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "ped-42", errand: "PED-42" });
  keepErrands(dir, alive("ped-42"), { now: 10 });
  const again = keepErrands(dir, alive("ped-42"), { now: 20 });
  assert.equal(again.dropped, 0);
  assert.equal(again.errands["ped-42"].endedAt, 0);
  await rm(dir, { recursive: true, force: true });
});

test("what closed is grouped by request, with the PRs of every front in it", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "ped-42", errand: "PED-42", asked: "toca o PED-42", at: 5 });
  noteErrand(dir, { seat: "ped-42-teste", errand: "PED-42" });
  noteErrand(dir, { seat: "vivo", errand: "áudio mudo" });
  keepErrands(dir, [{ name: "ped-42", prs: ["u/1"] }, { name: "ped-42-teste", prs: ["u/2"] }, { name: "vivo", prs: [] }], {
    now: 100, prsOf: (n) => (n === "ped-42" ? ["u/1"] : n === "ped-42-teste" ? ["u/2"] : [])
  });
  const shut = closedErrands(keepErrands(dir, alive("vivo"), { now: 300 }).errands);
  assert.equal(shut.length, 1, "the living request leaked into what closed");
  assert.equal(shut[0].errand, "PED-42");
  assert.deepEqual(shut[0].prs.sort(), ["u/1", "u/2"]);
  assert.equal(shut[0].asked, "toca o PED-42");
  await rm(dir, { recursive: true, force: true });
});

test("renaming a request moves every front of it, and only it", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "a", errand: "áudio mudo", asked: "olha o áudio" });
  noteErrand(dir, { seat: "b", errand: "áudio mudo" });
  noteErrand(dir, { seat: "c", errand: "PED-42" });
  const moved = renameErrand(dir, "áudio mudo", "áudio do WhatsApp no CRM");
  assert.equal(moved.moved, 2);
  const all = readErrands(dir);
  assert.equal(all.a.errand, "áudio do WhatsApp no CRM");
  assert.equal(all.b.errand, "áudio do WhatsApp no CRM");
  assert.equal(all.c.errand, "PED-42", "another request was dragged along");
  assert.equal(all.a.asked, "olha o áudio", "the sentence you said was lost in the rename");
  await rm(dir, { recursive: true, force: true });
});

test("a request you had already marked as seen stays seen under the new name", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "a", errand: "áudio mudo" });
  await writeFile(seenFile(dir), JSON.stringify({ "áudio mudo": 42 }));
  renameErrand(dir, "áudio mudo", "áudio do CRM");
  const seen = JSON.parse(await readFile(seenFile(dir), "utf8"));
  assert.deepEqual(seen, { "áudio do CRM": 42 }, "renaming brought a request you had already cleared back to the screen");
  await rm(dir, { recursive: true, force: true });
});

test("renaming refuses what it cannot do instead of writing nonsense", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "a", errand: "áudio mudo" });
  assert.match(renameErrand(dir, "áudio mudo", "   ").error, /name/);
  assert.match(renameErrand(dir, "não existe", "outro").error, /no request/);
  assert.equal(renameErrand(dir, "áudio mudo", "áudio mudo").moved, 0);
  assert.equal(readErrands(dir).a.errand, "áudio mudo");
  await rm(dir, { recursive: true, force: true });
});

test("a long name is cut to one line on the way in, rename included", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "a", errand: "x" });
  renameErrand(dir, "x", "y".repeat(200));
  assert.equal(readErrands(dir).a.errand.length, 60);
  await rm(dir, { recursive: true, force: true });
});

test("the fleet carries the errand on each seat, and leaves the others alone", () => {
  const seats = [{ name: "ped-42" }, { name: "solto" }];
  const carried = withErrands(seats, { "ped-42": { errand: "PED-42", asked: "toca o PED-42" } });
  assert.equal(carried[0].errand, "PED-42");
  assert.equal(carried[0].asked, "toca o PED-42");
  assert.equal(carried[1].errand, undefined);
});

test("fifteen seats become four errands, and what has no errand stays loose", () => {
  const seats = [
    { name: "a", errand: "áudio mudo no CRM", asked: "descobre o áudio" },
    { name: "b", errand: "áudio mudo no CRM" },
    { name: "c", errand: "PED-42" },
    { name: "d" },
    { name: "e" }
  ];
  const { errands, loose } = byErrand(seats);
  assert.equal(errands.length, 2);
  assert.deepEqual(errands.map((one) => one.seats.length), [2, 1]);
  assert.equal(errands[0].asked, "descobre o áudio", "the sentence comes from whichever seat carries it");
  assert.deepEqual(loose.map((s) => s.name), ["d", "e"]);
});

test("no seats at all is no errands, not a crash", () => {
  assert.deepEqual(byErrand(undefined), { errands: [], loose: [] });
  assert.deepEqual(withErrands(undefined, {}), []);
});

import { markSeen, readSeen, zonesOf } from "../lib/errands.mjs";

const seat = (name, state, errand = "", extra = {}) => ({ name, state, errand, ...extra });

test("a request with a seat waiting on you goes to the top, whatever else it has", () => {
  const { needsYou, cameBack, onTheWay } = zonesOf({
    sessions: [
      seat("crm-audio", "needs", "áudio mudo no CRM"),
      seat("crm-teste", "working", "áudio mudo no CRM")
    ]
  });
  assert.equal(needsYou.length, 1);
  assert.equal(needsYou[0].seats.length, 2, "the whole request comes along, not just the waiting seat");
  assert.deepEqual(needsYou[0].waiting.map((s) => s.name), ["crm-audio"]);
  assert.deepEqual([cameBack.length, onTheWay.length], [0, 0]);
});

test("work that finished with a PR is what came back for you", () => {
  const { cameBack, onTheWay } = zonesOf({
    sessions: [seat("ped-42", "done", "PED-42")],
    prsOf: (name) => (name === "ped-42" ? [{ repo: "a/b", number: 812 }] : [])
  });
  assert.equal(cameBack.length, 1);
  assert.equal(cameBack[0].prs[0].number, 812);
  assert.equal(onTheWay.length, 0);
});

test("finished with nothing to show is not something that came back", () => {
  const { cameBack, onTheWay } = zonesOf({ sessions: [seat("ped-42", "done", "PED-42")] });
  assert.equal(cameBack.length, 0);
  assert.equal(onTheWay.length, 1, "it stays on the way instead of claiming a delivery");
});

test("a request only counts as back when every seat of it stopped", () => {
  const { cameBack, onTheWay } = zonesOf({
    sessions: [seat("a", "done", "duas frentes"), seat("b", "working", "duas frentes")],
    prsOf: () => [{ number: 1 }]
  });
  assert.equal(cameBack.length, 0);
  assert.equal(onTheWay.length, 1);
});

test("once you say you saw it, it stops asking for your eyes", () => {
  const sessions = [seat("ped-42", "done", "PED-42")];
  const prsOf = () => [{ number: 812 }];
  assert.equal(zonesOf({ sessions, prsOf, seen: {} }).cameBack.length, 1);
  assert.equal(zonesOf({ sessions, prsOf, seen: { "PED-42": 123 } }).cameBack.length, 0);
  assert.equal(zonesOf({ sessions, prsOf, seen: { "PED-42": 123 } }).onTheWay.length, 1);
});

test("a seat with no request of its own shows up as a chat by hand", () => {
  const { onTheWay, byHand } = zonesOf({ sessions: [seat("solto", "working")] });
  assert.equal(onTheWay.length, 0, "it never claims to be something you asked for");
  assert.equal(byHand.length, 1);
  assert.equal(byHand[0].seats[0].name, "solto");
});

test("what you already saw is remembered by request, not by seat", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hive-seen-"));
  markSeen(dir, "  PED-42  ", 7);
  assert.deepEqual(readSeen(dir), { "PED-42": 7 });
  assert.match(markSeen(dir, "   ").error, /nothing/);
  await rm(dir, { recursive: true, force: true });
});

test("a chat you opened by hand is not something you asked for", () => {
  const zones = zonesOf({
    sessions: [
      seat("terminal", "idle"),
      seat("crm-audio", "working", "áudio mudo no CRM")
    ]
  });
  assert.deepEqual(zones.byHand.map((one) => one.seats[0].name), ["terminal"]);
  assert.deepEqual(zones.onTheWay.map((one) => one.errand), ["áudio mudo no CRM"]);
  assert.equal(zones.cameBack.length, 0);
});

test("but a chat by hand waiting on you still comes first", () => {
  const zones = zonesOf({ sessions: [seat("terminal", "needs")] });
  assert.equal(zones.needsYou.length, 1);
  assert.equal(zones.byHand.length, 0);
});

test("a chat by hand that finished with a PR is not a delivery of yours", () => {
  const zones = zonesOf({ sessions: [seat("terminal", "done")], prsOf: () => [{ number: 9 }] });
  assert.equal(zones.cameBack.length, 0);
  assert.equal(zones.byHand.length, 1);
});

test("a request whose chats all closed still shows what came back, with no seat to open", () => {
  const { cameBack, onTheWay } = zonesOf({
    sessions: [],
    closed: [{ errand: "PED-42", asked: "toca o PED-42", at: 5, endedAt: 900, prs: ["u/812"] }]
  });
  assert.equal(cameBack.length, 1);
  assert.equal(cameBack[0].closed, true);
  assert.deepEqual(cameBack[0].seats, []);
  assert.deepEqual(cameBack[0].prs, ["u/812"]);
  assert.equal(cameBack[0].at, 900);
  assert.equal(onTheWay.length, 0);
});

test("a closed request you already cleared, or that never opened a PR, stays off the screen", () => {
  const shut = [{ errand: "PED-42", asked: "", at: 0, endedAt: 900, prs: ["u/812"] }];
  assert.equal(zonesOf({ sessions: [], closed: shut, seen: { "PED-42": 1 } }).cameBack.length, 0);
  assert.equal(zonesOf({ sessions: [], closed: [{ ...shut[0], prs: [] }] }).cameBack.length, 0);
});

test("a request still open is not shown twice because one of its seats closed", () => {
  const { cameBack, onTheWay } = zonesOf({
    sessions: [seat("ped-42-teste", "working", "PED-42")],
    closed: [{ errand: "PED-42", asked: "", at: 0, endedAt: 900, prs: ["u/812"] }]
  });
  assert.equal(cameBack.length, 0, "the closed half of a live request came back as its own row");
  assert.equal(onTheWay.length, 1);
});

test("what closed is offered newest first, so the agent reads the recent past", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "velho", errand: "coisa de manhã" });
  noteErrand(dir, { seat: "novo", errand: "coisa de agora" });
  keepErrands(dir, [], { now: 1000 });
  const all = readErrands(dir);
  all.velho.endedAt = 1000;
  all.novo.endedAt = 9000;
  await writeFile(errandsFile(dir), JSON.stringify(all));
  const shut = closedErrands(readErrands(dir)).sort((a, b) => b.endedAt - a.endedAt);
  assert.deepEqual(shut.map((one) => one.errand), ["coisa de agora", "coisa de manhã"]);
  await rm(dir, { recursive: true, force: true });
});

test("a seat born in a race remembers the size of the race, and a lone seat remembers nothing of the kind", async () => {
  const dir = await home();
  noteErrand(dir, { seat: "login-1", errand: "fix the login", at: 1, race: { i: 1, of: 3 } });
  noteErrand(dir, { seat: "login-2", errand: "fix the login", at: 1, race: 3 });
  noteErrand(dir, { seat: "alone", errand: "something else", at: 1 });
  const all = readErrands(dir);
  assert.equal(all["login-1"].race, 3);
  assert.equal(all["login-2"].race, 3);
  assert.equal("race" in all["alone"], false);

  const carried = withErrands([{ name: "login-1" }, { name: "alone" }], all);
  assert.equal(carried[0].race, 3);
  assert.equal("race" in carried[1], false);

  assert.deepEqual(seatsOfErrand(all, "fix the login").sort(), ["login-1", "login-2"]);
  assert.deepEqual(seatsOfErrand(all, "nothing"), []);
  await rm(dir, { recursive: true, force: true });
});

test("a race is a group where every seat carries the same size, and it shows up on the day", () => {
  assert.equal(raceOf([{ race: 3 }, { race: 3 }]), 3);
  assert.equal(raceOf([{ race: 3 }]), 0, "one seat left is no longer a race to compare");
  assert.equal(raceOf([{ race: 3 }, {}]), 0);
  const { onTheWay } = zonesOf({ sessions: [
    seat("login-1", "working", "fix the login", { race: 3 }),
    seat("login-2", "working", "fix the login", { race: 3 })
  ] });
  assert.equal(onTheWay[0].race, 3);
  const { onTheWay: plain } = zonesOf({ sessions: [seat("x", "working", "plain"), seat("y", "working", "plain")] });
  assert.equal(plain[0].race, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

import { shelfDeepLink } from "../../server/door.mjs";

const { SHELF_HOST, JOIN_HOST, SEAT_HOST, shelfLinkOf, joinLinkOf, seatLinkOf, linkOf, deliverLink } = createRequire(import.meta.url)("../main/deeplink.js");
const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const SRC = new URL("../src/app/", import.meta.url);
const app = readdirSync(SRC).filter((one) => one.endsWith(".js")).map((one) => readFileSync(new URL(one, SRC), "utf8")).join("\n");

test("every kind of link the app understands has a door on the page", () => {
  const openers = /const OPENER = \{([^}]*)\}/.exec(main);
  assert.ok(openers, "main.js lost the table that says which page function opens which link");
  for (const kind of [SHELF_HOST, JOIN_HOST, SEAT_HOST]) {
    const named = new RegExp(`\\b${kind}: "(hive\\w+)"`).exec(openers[1]);
    assert.ok(named, `a ${kind} link arrives and nothing opens it`);
    assert.match(app, new RegExp(`window\\.${named[1]}\\s*=`), `${named[1]} is promised in main.js and missing from the app`);
  }
});

test("the link the driver hands out names the page, and the app can open it", () => {
  const raw = shelfDeepLink("publicar-sem-claude-ai", "documento", 2);
  assert.equal(raw, "hive://shelf/publicar-sem-claude-ai?tab=documento", "never frozen at the version being published");
  assert.deepEqual(shelfLinkOf(raw), { slug: "publicar-sem-claude-ai", tab: "documento", at: "", version: 0 });
});

test("a link that does name a version is still honoured — the ones already in Slack keep working", () => {
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina?tab=documento&v=2"), { slug: "uma-pagina", tab: "documento", at: "", version: 2 });
});

test("the lens of a pr opens on its own tab", () => {
  assert.deepEqual(shelfLinkOf("hive://shelf/lente-do-pr?tab=lente&v=2"), { slug: "lente-do-pr", tab: "lente", at: "", version: 2 });
});

test("the anchor survives the trip, so #d5 lands on the decision", () => {
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina?tab=documento#d5"), { slug: "uma-pagina", tab: "documento", at: "d5", version: 0 });
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina#d5"), { slug: "uma-pagina", tab: "", at: "d5", version: 0 });
  assert.equal(shelfLinkOf("hive://shelf/uma-pagina#../etc/passwd").at, "etcpasswd", "an anchor is a name, never a path");
});

test("a link with pieces missing is no link at all", () => {
  assert.equal(shelfDeepLink("", "documento", 2), "");
  assert.equal(shelfDeepLink("uma-pagina", "", 2), "");
  assert.equal(shelfDeepLink("uma-pagina", "documento", 0), "");
});

test("the app opens the shelf and nothing else", () => {
  assert.equal(shelfLinkOf("hive://app/api/shelf"), null);
  assert.equal(shelfLinkOf("https://github.com/acme/artifacts"), null);
  assert.equal(shelfLinkOf("hive://shelf/"), null);
  assert.equal(shelfLinkOf("hive://shelf/../../etc/passwd"), null);
  assert.equal(shelfLinkOf("hive://shelf/UPPER-case"), null);
  assert.equal(shelfLinkOf(""), null);
  assert.equal(shelfLinkOf(null), null);
});

test("a page with no tab or version still opens, on what the shelf has", () => {
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina"), { slug: "uma-pagina", tab: "", at: "", version: 0 });
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina?tab=inventada&v=-3"), { slug: "uma-pagina", tab: "", at: "", version: 0 });
  assert.deepEqual(shelfLinkOf("hive://shelf/uma-pagina?tab=telas&v=1.5"), { slug: "uma-pagina", tab: "telas", at: "", version: 0 });
});

const KEY = `SHA256:${"a".repeat(43)}`;
const INVITE = `hive://join?at=${encodeURIComponent("https://hive-ada.hive.example")}&key=${encodeURIComponent(KEY)}&token=t1`;

test("an invite link opens the door screen with the invite in hand", () => {
  assert.deepEqual(joinLinkOf(INVITE), { link: INVITE, at: "https://hive-ada.hive.example" });
  assert.deepEqual(linkOf(INVITE), { kind: "join", asked: { link: INVITE, at: "https://hive-ada.hive.example" } });
});

test("an invite missing a piece opens nothing", () => {
  assert.equal(joinLinkOf(`hive://join?key=${encodeURIComponent(KEY)}&token=t1`), null);
  assert.equal(joinLinkOf(`hive://join?at=${encodeURIComponent("https://hive-ada.hive.example")}&token=t1`), null);
  assert.equal(joinLinkOf(`hive://join?at=${encodeURIComponent("https://hive-ada.hive.example")}&key=${encodeURIComponent(KEY)}`), null);
  assert.equal(joinLinkOf(`hive://join?at=not-a-url&key=${encodeURIComponent(KEY)}&token=t1`), null);
  assert.equal(joinLinkOf(`hive://join?at=${encodeURIComponent("file:///etc/passwd")}&key=${encodeURIComponent(KEY)}&token=t1`), null);
  assert.equal(joinLinkOf(`hive://join/anything?at=${encodeURIComponent("https://hive-ada.hive.example")}&key=${encodeURIComponent(KEY)}&token=t1`), null);
  assert.equal(joinLinkOf(`hive://join?at=${encodeURIComponent("https://hive-ada.hive.example")}&key=not-a-key&token=t1`), null);
  assert.equal(joinLinkOf("hive://shelf/uma-pagina"), null);
  assert.equal(joinLinkOf(`https://hive-ada.hive.example/join?key=${encodeURIComponent(KEY)}&token=t1`), null);
});

test("the shelf and the pedido do not answer for each other", () => {
  assert.equal(shelfLinkOf("hive://pedido/PED-448"), null);
  assert.deepEqual(linkOf("hive://shelf/uma-pagina?tab=telas&v=2"), {
    kind: "shelf",
    asked: { slug: "uma-pagina", tab: "telas", at: "", version: 2 }
  });
});

test("a seat link names the chat to bring forward", () => {
  assert.equal(seatLinkOf("hive://seat/fix-the-report"), "fix-the-report");
  assert.equal(seatLinkOf("hive://seat/Fix_the.report"), "Fix_the.report");
  assert.deepEqual(linkOf("hive://seat/fix-the-report"), { kind: "seat", asked: "fix-the-report" });
});

test("a seat link that is not a seat name opens nothing", () => {
  assert.equal(seatLinkOf("hive://seat/"), null);
  assert.equal(seatLinkOf("hive://seat/.."), null);
  assert.equal(seatLinkOf("hive://seat/a/b"), null);
  assert.equal(seatLinkOf("hive://seat/a%22%29%3Balert(1)"), null);
  assert.equal(seatLinkOf(`hive://seat/${"a".repeat(81)}`), null);
  assert.equal(seatLinkOf("hive://shelf/uma-pagina"), null);
});

function pageThatWakesUp(after) {
  let asked = 0;
  return {
    offer: async () => { asked += 1; return asked > after; },
    tries: () => asked
  };
}

test("a link waits for the page to wake up, then is taken once", async () => {
  const page = pageThatWakesUp(3);
  const taken = await deliverLink({ asked: { slug: "uma-pagina" }, offer: page.offer, again: (retry) => retry() });
  assert.equal(taken, true);
  assert.equal(page.tries(), 4);
});

test("a page that never wakes up stops being asked", async () => {
  const page = pageThatWakesUp(Infinity);
  const taken = await deliverLink({ asked: { slug: "uma-pagina" }, offer: page.offer, again: (retry) => retry(), max: 5 });
  assert.equal(taken, false);
  assert.equal(page.tries(), 6);
});

test("a window that throws is a page not ready, not a lost link", async () => {
  let asked = 0;
  const offer = async () => { asked += 1; if (asked < 3) throw new Error("no window yet"); return true; };
  const taken = await deliverLink({ asked: { slug: "uma-pagina" }, offer, again: (retry) => retry() });
  assert.equal(taken, true);
  assert.equal(asked, 3);
});

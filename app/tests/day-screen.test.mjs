import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { dayBriefModel, dayFoldModel, dayLineModel, dayZoneModel } = await app("day");
const { mountDay } = await import(new URL("../src/views.js", import.meta.url).href);

const ACTIONS = { seen() {}, goto() {}, rename() {}, board() {} };

const BARE = { count: "", brief: null, fold: null, boardOpen: false, zones: [], emptyHead: "", emptySay: "" };
const QUIET = { hi: { lead: "", bold: "" }, lines: [] };

function paintHost(model) {
  const host = document.createElement("div");
  mountDay(host, { actions: ACTIONS }).show({ ...BARE, ...model });
  return host;
}

const paint = (model) => paintHost(model).innerHTML;

const zone = (title, groups, kind) => {
  const one = dayZoneModel(title, groups, kind);
  return one ? paint({ brief: QUIET, boardOpen: true, zones: [one] }) : "";
};

const dayLine = (one, kind) => paint({ brief: { hi: { lead: "", bold: "" }, lines: [dayLineModel(one, kind)] } });

const dayBrief = (day) => {
  const brief = dayBriefModel(day);
  return brief ? paint({ brief }) : "";
};

const dayFold = (day, byHand) => {
  const fold = dayFoldModel(day, byHand);
  return fold ? paint({ brief: QUIET, fold }) : "";
};

const group = (extra = {}) => ({
  errand: "áudio mudo no CRM",
  asked: "descobre por que o áudio do CRM fica mudo em produção",
  prs: [],
  seats: [{ name: "crm-audio", state: "needs", title: "áudio mudo", now: "achou a causa: o S3 responde *" }],
  ...extra
});

test("an empty zone renders nothing at all, not a lonely heading", () => {
  assert.equal(zone("waiting on you", [], "needs"), "");
});

test("the request leads with your own sentence, and the seat carries its last line", () => {
  const html = zone("waiting on you", [group()], "needs");
  assert.match(html, /waiting on you/);
  assert.match(html, /áudio mudo no CRM/);
  assert.match(html, /você pediu|you asked/);
  assert.match(html, /achou a causa/);
  assert.match(html, /data-goto="crm-audio"/);
});

test("what came back offers the PR and the way to clear it", () => {
  const html = zone("came back", [group({
    prs: ["https://github.com/arvoreeducacao/dev-workspaces/pull/359"],
    seats: [{ name: "ped-42", state: "done", title: "PED-42", now: "abriu o PR" }]
  })], "back");
  assert.match(html, /dev-workspaces#359/, "the link reads as repo#number, not a raw url");
  assert.match(html, /data-seen="áudio mudo no CRM"/);
});

test("a delivery with no link says so instead of showing an empty line", () => {
  const html = zone("came back", [group({ prs: [], seats: [{ name: "x", state: "done", title: "x", now: "" }] })], "back");
  assert.match(html, /nada pra abrir ainda|nothing to open yet/);
});

test("on the way carries no button — there is nothing for you to do there", () => {
  const html = zone("on the way", [group({ seats: [{ name: "load", state: "working", title: "load test", now: "600 mil VUs" }] })], "way");
  assert.doesNotMatch(html, /data-seen=/);
  assert.match(html, /600 mil VUs/);
});

test("a seat with no request of its own is titled by itself", () => {
  const html = zone("on the way", [{ errand: "", asked: "", prs: [], seats: [{ name: "solto", state: "working", title: "sem pedido", now: "" }] }], "way");
  assert.match(html, /sem pedido/);
  assert.doesNotMatch(html, /you asked|você pediu/);
});

test("two fronts of one request are counted as fronts, not as chats", () => {
  const html = zone("waiting on you", [group({
    seats: [
      { name: "a", state: "needs", title: "a", now: "" },
      { name: "b", state: "working", title: "b", now: "" }
    ]
  })], "needs");
  assert.match(html, /2 frentes|2 fronts/);
});

test("a sentence with html in it is escaped, not rendered", () => {
  const html = zone("waiting on you", [group({ asked: '<img src=x onerror=alert(1)>' })], "needs");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

const line = (kind, extra = {}) => dayLine({ ...group(), ...extra }, kind);
const day = (over = {}) => ({ needsYou: [], cameBack: [], onTheWay: [], byHand: [], ...over });

test("the message carries your own sentence, so a delivery does not need remembering", () => {
  const html = line("back");
  assert.match(html, /you asked|você pediu/);
  assert.match(html, /descobre por que o áudio do CRM fica mudo/);
});

test("a request with no sentence of yours shows no empty quote", () => {
  const html = line("way", { asked: "" });
  assert.doesNotMatch(html, /you asked|você pediu/);
  assert.doesNotMatch(html, /“”/);
});

test("your sentence is escaped like everything else", () => {
  const html = line("needs", { asked: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("the message says the state in words, then the request, then what happened", () => {
  const html = line("needs");
  assert.match(html, /esperando você|waiting on you/);
  assert.match(html, /áudio mudo no CRM/);
  assert.match(html, /achou a causa/);
});

test("what came back leads with the PR, and the way to clear it", () => {
  const html = dayLine({
    errand: "PED-42", asked: "toca o PED-42", prs: ["https://github.com/arvoreeducacao/dev-workspaces/pull/812"],
    seats: [{ name: "ped-42", state: "done", title: "PED-42", now: "abriu o PR" }]
  }, "back");
  assert.match(html, /dev-workspaces#812/, "the link reads as repo#number, not a raw url");
  assert.match(html, /data-seen="PED-42"/);
});

test("a request whose chats are gone says so, instead of showing a chat to open", () => {
  const html = dayLine({
    errand: "PED-42", asked: "", closed: true, prs: ["https://github.com/a/b/pull/812"], seats: []
  }, "back");
  assert.match(html, /fechad|closed/);
  assert.doesNotMatch(html, /data-goto=/);
  assert.match(html, /data-seen="PED-42"/);
});

test("the name of the request is what you click to correct it", () => {
  assert.match(line("needs"), /data-rename="áudio mudo no CRM"/);
});

test("a request with two fronts counts fronts in the same line, not two lines", () => {
  const html = line("way", { seats: [
    { name: "a", state: "working", title: "a", now: "primeira" },
    { name: "b", state: "working", title: "b", now: "segunda" }
  ] });
  assert.match(html, /2 frentes|2 fronts/);
  assert.equal((html.match(/class="dl"/g) || []).length, 1);
});

test("the opening line counts what is up and what stopped on you", () => {
  const html = dayBrief(day({
    needsYou: [group()],
    onTheWay: [{ errand: "load test", asked: "", prs: [], seats: [{ name: "load", state: "working", title: "load", now: "600 mil" }] }]
  }));
  assert.match(html, /2 things of yours are up|2 coisas suas/);
  assert.match(html, /One is waiting on you|Uma está esperando/);
});

test("a day with nothing stopped on you says exactly that", () => {
  const html = dayBrief(day({ onTheWay: [group({ seats: [{ name: "a", state: "working", title: "a", now: "" }] })] }));
  assert.match(html, /Nothing is waiting on you|Nada está esperando/);
  assert.doesNotMatch(html, /are waiting on you|estão esperando/);
});

test("nothing at all is no message, so the empty state can speak instead", () => {
  assert.equal(dayBrief(day()), "");
  assert.equal(dayFold(day(), []), "");
});

test("the fold counts requests and chats, and the chats you opened by hand apart", () => {
  const html = dayFold(day({
    needsYou: [group({ seats: [{ name: "a" }, { name: "b" }] })],
    onTheWay: [group({ errand: "load", seats: [{ name: "c" }] })]
  }), [{ errand: "", seats: [{ name: "solto" }] }]);
  assert.match(html, /2 requests|2 pedidos/);
  assert.match(html, /3 chats open|3 chats de pé/);
  assert.match(html, /1 you opened by hand|1 aberto à mão/);
  assert.match(html, /data-board="1"/);
});

test("a sentence with html in it is escaped in the message too", () => {
  const said = '<img src=x onerror=alert(1)>';
  const host = paintHost({ brief: { hi: { lead: "", bold: "" }, lines: [dayLineModel({ ...group(), errand: said }, "needs")] } });
  assert.equal(host.querySelectorAll("img").length, 0, "the name of the request was rendered as markup");
  assert.equal(host.querySelector(".dname").textContent, said, "the name of the request is shown as the characters the person typed");
  assert.match(host.innerHTML, /&lt;img/);
});

test("a seat with work alive says what is running instead of a resting state", () => {
  const html = zone("on the way", [group({ seats: [{ name: "mobi-release-ios", state: "idle", now: "build interno na nuvem", live: [{ id: "a1", kind: "local_bash", said: "eas build" }], liveSince: new Date(Date.now() - 8 * 60 * 1000).toISOString() }] })], "way");
  assert.match(html, /estate live/);
  assert.match(html, /1 running · 8 min/);
  assert.doesNotMatch(html, />idle</);
});

test("a race shows its size, the PR of every chat, and the button that keeps one", () => {
  const html = zone("on the way", [group({
    race: 3,
    seats: [
      { name: "login-1", state: "done", title: "login 1", now: "abriu o PR", prs: ["https://github.com/o/r/pull/11"] },
      { name: "login-2", state: "working", title: "login 2", now: "testando", prs: [] },
      { name: "login-3", state: "done", title: "login 3", now: "abriu o PR", prs: ["https://github.com/o/r/pull/13"] }
    ]
  })], "way");
  assert.match(html, /corrida de 3|race of 3/);
  assert.match(html, /r#11/);
  assert.match(html, /r#13/);
  assert.equal((html.match(/data-keep=/g) || []).length, 3);
  assert.match(html, /class="errand way racing"|racing/);
});

test("a race with a chat already gone still compares the ones left, and says how many are in", () => {
  const html = zone("on the way", [group({
    race: 3,
    seats: [
      { name: "login-1", state: "done", title: "login 1", now: "", prs: [] },
      { name: "login-3", state: "done", title: "login 3", now: "", prs: [] }
    ]
  })], "way");
  assert.match(html, /2 ainda na disputa|2 still in/);
  assert.equal((html.match(/data-keep=/g) || []).length, 2);
});

test("a plain request with several fronts is not a race and offers no keep button", () => {
  const html = zone("on the way", [group({
    seats: [
      { name: "a", state: "working", title: "a", now: "" },
      { name: "b", state: "working", title: "b", now: "" }
    ]
  })], "way");
  assert.doesNotMatch(html, /data-keep=/);
  assert.match(html, /2 frentes|2 fronts/);
});

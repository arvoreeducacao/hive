import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { speak } from "../assets/i18n.mjs";

const st = await state();
await views();
const { closeHistory, historyViewModel, openHistory, pullHistory, renderHistory, renderSyncStrip, syncStripViewModel } = await app("history");

let served = { sessions: [] };
let syncServed = () => null;
let answer = null;
const waiting = [];
const asked = [];

globalThis.fetch = (url, init) => {
  asked.push({ url: String(url), method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : null });
  if (String(url).startsWith("/api/session-sync")) return Promise.resolve({ json: async () => syncServed(String(url), init) });
  return new Promise((keep) => {
    const one = () => keep({ json: async () => served });
    waiting.push(one);
    answer = one;
  });
};

const answerAll = () => { while (waiting.length) waiting.shift()(); };

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
const seen = () => historyViewModel();
const plain = (parts) => parts.map((part) => part.text).join("");
const search = (q) => { st.histQuery = q; };
const strip = () => syncStripViewModel();
const CONFIGURED = "https://github.com/ada/claude-sessions.git";

test("typing while the archives are still being read does not claim they are empty", async () => {
  openHistory();
  assert.match(seen().hint, /reading the archives/);

  search("refactor");
  assert.doesNotMatch(seen().hint, /nothing in the archives yet/);
  assert.match(seen().hint, /reading the archives/);
  assert.equal(seen().count, "reading…");

  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x/y", prompt: "refactor the thing", title: "Refactor the thing" }] };
  answer();
  await settle();

  assert.deepEqual(seen().rows.map((r) => plain(r.title)), ["Refactor the thing"]);
  assert.equal(seen().count, "1 of 1");
});

test("while the archives are being reread the count says so instead of going quiet", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x/y", prompt: "one", title: "One" }], stale: "scanning", watch: { done: 120, total: 800 } };
  openHistory();
  answer();
  await settle();
  assert.match(seen().count, /1 sessions/);
  assert.match(seen().count, /looking for new chats/);
  assert.match(seen().count, /120 of 800/);
  assert.equal(seen().scanning, true);
});

test("a long archive renders a first page instead of every row at once", async () => {
  served = { sessions: Array.from({ length: 300 }, (one, n) => ({ id: "id-" + n, where: "local", at: Date.now() - n, cwd: "/x/y", prompt: "", title: "chat " + n })) };
  openHistory();
  answer();
  await settle();
  assert.equal(seen().rows.length, 80);
  assert.match(seen().count, /300 sessions/);
  assert.match(seen().count, /showing the first 80/);
  assert.equal(seen().rows[0].at, 0, "the first row still points at the first session of the list");
});

test("an archive that really is empty still says so", async () => {
  served = { sessions: [] };
  openHistory();
  answer();
  await settle();
  assert.match(seen().hint, /nothing in the archives yet/);
  assert.deepEqual(seen().rows, []);
});

test("the sync strip offers the GitHub button only while nothing is configured", async () => {
  const { toggleSyncEdit } = await app("history");
  renderSyncStrip({ engine: true, suggestion: CONFIGURED, local: { repo: "", lastSync: 0 }, cloud: null });
  assert.equal(strip().mode, "edit");
  assert.match(strip().goSay, /sync to a private GitHub repo/);
  assert.equal(strip().typed, CONFIGURED);

  renderSyncStrip({ engine: true, suggestion: "", local: { repo: CONFIGURED, lastSync: Date.now() }, cloud: { repo: CONFIGURED, lastSync: Date.now() } });
  assert.equal(strip().mode, "set");
  assert.equal(strip().repo, "ada/claude-sessions");
  assert.equal(strip().changeSay, "change");

  toggleSyncEdit(true);
  assert.equal(strip().mode, "edit");
  assert.equal(strip().typed, CONFIGURED);
  assert.match(strip().goSay, /sync to a private GitHub repo/);
  assert.equal(strip().cancelSay, "cancel");

  toggleSyncEdit(false);
  assert.equal(strip().mode, "set");
  assert.equal(strip().repo, "ada/claude-sessions");

  renderSyncStrip({ engine: true, suggestion: "", local: { repo: CONFIGURED, lastSync: Date.now() }, cloud: null });
  assert.match(strip().pod, /server asleep/);
  renderSyncStrip({ engine: true, suggestion: "", local: { repo: CONFIGURED, lastSync: Date.now() }, cloud: "probing" });
  assert.match(strip().pod, /server checking/);

  toggleSyncEdit(true);
  renderSyncStrip({ engine: true, suggestion: "", local: { repo: CONFIGURED, lastSync: Date.now() }, cloud: { repo: "", lastSync: 0 } });
  assert.equal(strip().cancelSay, "cancel", "the same repo does not throw away what is being typed");

  renderSyncStrip({ engine: true, suggestion: "", local: { repo: "https://github.com/rafael/other.git", lastSync: Date.now() }, cloud: null });
  assert.equal(strip().mode, "set", "a repo that changed underneath ends the edit");
  assert.equal(strip().repo, "rafael/other");

  renderSyncStrip({ engine: false, suggestion: "", local: { repo: "", lastSync: 0 }, cloud: null });
  assert.equal(strip().mode, "off");
  renderSyncStrip(null);
  assert.equal(strip().mode, "off");
});

test("a configured strip offers sync now — and hides it while editing or unconfigured", async () => {
  const { toggleSyncEdit } = await app("history");
  renderSyncStrip({ engine: true, suggestion: "", local: { repo: CONFIGURED, lastSync: Date.now() }, cloud: null });
  assert.equal(strip().nowSay, "sync now");
  toggleSyncEdit(true);
  assert.equal(strip().nowSay, undefined);
  toggleSyncEdit(false);
  renderSyncStrip({ engine: true, suggestion: "", local: { repo: "", lastSync: 0 }, cloud: null });
  assert.equal(strip().nowSay, undefined);
});

test("every row offers a preview of the conversation", async () => {
  served = { sessions: [
    { id: "abcd1234", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "Here" },
    { id: "abcd5678", where: "cloud", at: Date.now(), cwd: "/x", prompt: "", title: "There" }
  ] };
  openHistory();
  answer();
  await settle();
  assert.deepEqual(seen().rows.map((r) => r.at), [0, 1]);
  for (const row of seen().rows) assert.match(row.peekHint, /read the conversation before reviving it/);
  assert.deepEqual(seen().rows.map((r) => r.down), [false, true], "only a cloud session can be brought local");
});

test("each row wears its own sync dot — and none when sync is not configured", async () => {
  served = { sessions: [
    { id: "abcd1234", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "Synced", sync: "ok" },
    { id: "abcd5678", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "Waiting", sync: "behind" },
    { id: "abcd9012", where: "cloud", at: Date.now(), cwd: "/x", prompt: "", title: "Unmarked" }
  ] };
  openHistory();
  answer();
  await settle();
  assert.deepEqual(seen().rows.map((r) => r.sync?.tone ?? null), ["ok", "behind", null]);
});

test("a quiet refresh that changes only the dots still repaints", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: 5, cwd: "/x", prompt: "", title: "One" }] };
  openHistory();
  answer();
  await settle();
  assert.equal(seen().rows[0].sync, null);

  served = { sessions: [{ id: "abcd1234", where: "local", at: 5, cwd: "/x", prompt: "", title: "One", sync: "ok" }] };
  assert.equal(document.querySelector("#hist-list .hist-synced"), null);
  pullHistory(true);
  answer();
  await settle();
  assert.equal(seen().rows[0].sync.tone, "ok");
  assert.ok(document.querySelector("#hist-list .hist-synced.ok"), "the screen was painted again, not left without the dot");
  assert.equal(document.querySelector("#hist-list .hist-sync"), null, "the row dot wears the sync strip's class, and its size with it");
});

test("a quiet refresh that changes nothing leaves the screen alone", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: 5, cwd: "/x", prompt: "", title: "One" }] };
  openHistory();
  answer();
  await settle();
  const view = (await app("history")).historySolid;
  const show = view.show;
  let paints = 0;
  view.show = (model) => { paints++; return show(model); };
  try {
    pullHistory(true);
    answer();
    await settle();
  } finally {
    view.show = show;
  }
  assert.equal(paints, 0, "a refresh with the same sessions painted the screen again");
});

test("a search that matches nothing is told apart from an empty archive", async () => {
  served = { sessions: [{ id: "abcd1234", where: "cloud", at: Date.now(), cwd: "/x/y", prompt: "something else", title: "Something else" }] };
  openHistory();
  answer();
  await settle();
  search("refactor");
  assert.match(seen().hint, /nothing matches/);
  assert.equal(st.histSessions.length, 1);
});

test("a row of another agent says which one, and cannot be brought local — its conversation lives in that agent's store", async () => {
  openHistory();
  served = { sessions: [
    { id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9", where: "cloud", at: Date.now(), cwd: "/x/y", prompt: "bom dia", title: "saudacao matinal", agent: "kimi", seat: "bom-dia-kimi" },
    { id: "3f1c9a2e-1111-4222-8333-444455556666", where: "cloud", at: Date.now() - 1000, cwd: "/x/y", prompt: "refactor", title: "Refactor" }
  ] };
  answer();
  await settle();
  const [kimi, claude] = seen().rows;
  assert.equal(kimi.agent, "kimi");
  assert.equal(kimi.agentSay, "kimi");
  assert.equal(kimi.down, false, "bring-local offered for a conversation that only kimi's own store holds");
  assert.equal(claude.agent, "claude");
  assert.equal(claude.agentSay, "", "claude is the default and needs no badge");
  assert.equal(claude.down, true);
});

test("a chat found by the name it wore before shows its seat and the old title on the row", async () => {
  const { renderHistory } = await app("history");
  st.histLoading = false;
  st.histSessions = [
    { id: "noise1", where: "local", at: 3, cwd: "/x/y", prompt: "", title: "Fluxo de caixa" },
    { id: "real", where: "local", at: 2, cwd: "/x/y", prompt: "segue", title: "Planos com IA", seat: "como-estamos-com-o", was: ["Fluxo de telas do backoffice"] }
  ];
  search("fluxo de telas");
  const model = seen();
  assert.deepEqual(model.rows.map((r) => plain(r.title)), ["Planos com IA"]);
  assert.equal(plain(model.rows[0].formerly), "was called Fluxo de telas do backoffice");
  assert.match(plain(model.rows[0].sub), /^como-estamos-com-o · /);
  renderHistory();
  await settle();
  const list = document.getElementById("hist-list").textContent;
  assert.match(list, /was called Fluxo de telas do backoffice/);
  assert.match(list, /como-estamos-com-o/);
});

test("the seat's own name finds it from the search box", async () => {
  st.histSessions = [
    { id: "a", where: "local", at: 3, cwd: "/x/y", prompt: "", title: "Outro assunto", seat: "por-favor-ver-o-2" },
    { id: "b", where: "local", at: 2, cwd: "/x/y", prompt: "", title: "Fluência de reader", seat: "por-favor-ver-o" }
  ];
  search("por-favor-ver-o");
  assert.deepEqual(seen().rows.map((r) => plain(r.title)), ["Fluência de reader", "Outro assunto"]);
});

test("typing a new search repaints the highlighted title whole, with no piece left from the search before", async () => {
  const { renderHistory } = await app("history");
  st.histSessions = [{ id: "a", where: "local", at: 3, cwd: "/x/y", prompt: "", title: "Planos com IA a partir de notas" }];
  search("");
  renderHistory();
  await settle();
  search("de notas");
  renderHistory();
  await settle();
  const title = document.querySelector("#hist-list .hist-row .hist-title b");
  assert.equal(title.textContent, "Planos com IA a partir de notas");
  assert.deepEqual([...title.querySelectorAll("mark")].map((one) => one.textContent), ["de", "notas"]);
});


test("the window, the preview and the revive question open and close through their own buttons", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x/y", prompt: "", title: "Openable" }] };
  openHistory();
  answer();
  await settle();
  const on = (id) => document.getElementById(id).classList.contains("on");
  assert.ok(on("history"));
  assert.equal(document.activeElement, document.getElementById("hist-search"), "the search box does not take the keyboard");

  document.querySelector("#hist-list [data-peek='0']").click();
  assert.ok(on("hist-preview"));
  assert.equal(document.getElementById("hp-title").textContent, "Openable");
  assert.match(document.getElementById("hp-msgs").textContent, /reading the conversation/);
  served = { ok: true, messages: [{ role: "user", text: "hello" }, { role: "assistant", text: "hi there" }] };
  answer();
  await settle();
  assert.deepEqual([...document.querySelectorAll("#hp-msgs .hp-msg")].map((m) => [m.className, m.textContent]), [["hp-msg user", "youhello"], ["hp-msg assistant", "claudehi there"]]);

  document.getElementById("hp-revive").click();
  assert.ok(!on("hist-preview"));
  assert.ok(on("revive-how"));
  assert.equal(document.getElementById("rh-title").textContent, "Openable");
  document.getElementById("revive-how").click();
  assert.ok(!on("revive-how"), "a click on the backdrop leaves the question open");

  document.querySelector("#hist-list [data-i='0']").click();
  assert.ok(on("revive-how"));
  document.querySelector("#revive-how .box").click();
  assert.ok(on("revive-how"), "a click inside the box closed the question");

  document.getElementById("hist-ok").click();
  assert.ok(!on("history"));
  const { closeReviveHow } = await app("history");
  closeReviveHow();
});

test("a session being brought local holds its button shut until the copy answers", async () => {
  served = { sessions: [{ id: "abcd5678", where: "cloud", at: Date.now(), cwd: "/x", prompt: "", title: "There" }] };
  openHistory();
  answer();
  await settle();
  const down = () => document.querySelector("#hist-list [data-down='0']");
  down().click();
  assert.equal(down().disabled, true);
  assert.equal(down().textContent, "copying it here…");
  served = { ok: false, error: "nope" };
  answer();
  await settle();
  assert.equal(down().disabled, false);
  assert.equal(down().textContent, "continue here");
});

test("a revive the server refuses says why on the count, instead of the panel just sitting there", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x/y", prompt: "", title: "Refused" }] };
  openHistory();
  answer();
  await settle();
  document.querySelector("#hist-list [data-i='0']").click();
  document.getElementById("rh-native").click();
  assert.ok(!document.getElementById("revive-how").classList.contains("on"));
  served = { ok: false, error: "the box is asleep" };
  answer();
  await settle();
  assert.equal(document.getElementById("hist-count").textContent, "could not revive it — the box is asleep");
  assert.ok(document.getElementById("history").classList.contains("on"));
});

test("two sessions brought local at once each hold their own button until their own copy answers", async () => {
  served = { sessions: [
    { id: "abcd1111", where: "cloud", at: Date.now(), cwd: "/x", prompt: "", title: "First" },
    { id: "abcd2222", where: "cloud", at: Date.now() - 1, cwd: "/x", prompt: "", title: "Second" }
  ] };
  openHistory();
  answer();
  await settle();
  const down = (at) => document.querySelector(`#hist-list [data-down='${at}']`);
  down(0).click();
  down(1).click();
  assert.deepEqual([down(0).disabled, down(1).disabled], [true, true]);
  served = { ok: false, error: "nope" };
  answer();
  await settle();
  assert.deepEqual([down(0).disabled, down(1).disabled], [true, false], "the second copy's answer let go of the first one's button");
  assert.equal(down(0).textContent, "copying it here…");
  answerAll();
  await settle();
  assert.equal(down(0).disabled, false);
});

test("a revive asks the server for the agent and the model the conversation ran on", async () => {
  served = { sessions: [{ id: "abcd1234", where: "cloud", at: Date.now(), cwd: "/x/y", prompt: "", title: "Kimi talk", agent: "kimi", model: "k2" }] };
  openHistory();
  answer();
  await settle();
  asked.length = 0;
  document.querySelector("#hist-list [data-i='0']").click();
  document.getElementById("rh-tui").click();
  const revive = asked.find((one) => one.url === "/api/revive");
  assert.deepEqual(revive.body, { id: "abcd1234", where: "cloud", cwd: "/x/y", title: "Kimi talk", structured: false, agent: "kimi", model: "k2" });
  answerAll();
  await settle();
});

test("the sync button asks the archive for a scan, holds itself shut until the list lands, and says when the sync did not run", async () => {
  syncServed = (url) => (url.endsWith("/run") ? { ok: false, error: "no remote named origin" } : { engine: true, local: { repo: CONFIGURED, lastSync: 0 }, cloud: null });
  try {
    served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "One" }] };
    openHistory();
    answer();
    await settle();
    const now = () => document.getElementById("sync-now");
    asked.length = 0;
    now().click();
    now().click();
    assert.equal(now().disabled, true);
    assert.equal(now().textContent, "syncing…");
    await settle();
    assert.equal(asked.filter((one) => one.url === "/api/session-sync/run").length, 1, "the button ran the sync again while the first press was still running");
    assert.equal(asked.at(-1).url, "/api/archive?fresh=1", "the button refreshed from the cache it just invalidated");
    assert.equal(now().disabled, true, "the button let go before the list it promised to rebuild");
    answer();
    await settle();
    assert.equal(now().disabled, false);
    assert.equal(now().textContent, "sync now");
    assert.match(document.getElementById("hist-sync").textContent, /the sync did not run — no remote named origin/, "a sync that failed looks exactly like one that worked");
  } finally {
    syncServed = () => null;
    st.histSyncTrouble = "";
    renderSyncStrip(null);
  }
});

test("setting up the sync holds its button until its own setup answers, whatever status lands meanwhile", async () => {
  const unset = { engine: true, suggestion: CONFIGURED, local: { repo: "", lastSync: 0 }, cloud: null };
  let release = null;
  syncServed = (url, init) => (init?.method === "POST" ? new Promise((keep) => { release = () => keep({ ok: true }); }) : unset);
  try {
    served = { sessions: [] };
    openHistory();
    answer();
    await settle();
    const go = () => document.getElementById("sync-go");
    asked.length = 0;
    go().click();
    assert.equal(go().disabled, true);
    assert.equal(go().textContent, "setting it up — the first push takes a minute…");
    renderSyncStrip(unset);
    assert.equal(go().disabled, true, "a status that landed during the setup let go of the button");
    go().click();
    document.getElementById("sync-repo").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    assert.deepEqual(asked.filter((one) => one.method === "POST").map((one) => one.body), [{ repo: CONFIGURED }], "the setup was posted again while the first one was still running");
    let statusRead = null;
    syncServed = (url) => new Promise((keep) => { statusRead = () => keep(unset); });
    release();
    await settle();
    assert.equal(go().disabled, true, "the old form came back before the status after the setup landed");
    statusRead();
    await settle();
    assert.equal(go().disabled, false);
    assert.equal(go().textContent, "sync to a private GitHub repo");
  } finally {
    syncServed = () => null;
    renderSyncStrip(null);
  }
});

test("opening the window again keeps the rows it already had instead of saying it is reading", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "Kept row" }] };
  openHistory();
  answer();
  await settle();
  closeHistory();
  openHistory();
  assert.match(document.getElementById("hist-list").textContent, /Kept row/, "opening the window blanks the list it already had");
  assert.notEqual(seen().count, "reading…");
  answer();
  await settle();
});

test("the count and the window's own words speak the language of the app", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: Date.now(), cwd: "/x", prompt: "", title: "One" }] };
  openHistory();
  answer();
  await settle();
  const was = st.language;
  try {
    st.language = speak("pt-BR");
    renderHistory();
    assert.equal(document.getElementById("hist-count").textContent, "1 sessões");
    assert.equal(document.querySelector("#history h2").textContent, "Sessões passadas");
    assert.equal(document.getElementById("hist-ok").textContent, "fechar");
  } finally {
    st.language = speak(was || "en");
    renderHistory();
  }
  assert.equal(document.querySelector("#history h2").textContent, "Past sessions");
  closeHistory();
});

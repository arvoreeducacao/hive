import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { historyViewModel, openHistory, pullHistory, renderSyncStrip, syncStripViewModel } = await app("history");

let served = { sessions: [] };
let answer = null;

globalThis.fetch = (url) => {
  if (String(url).startsWith("/api/session-sync")) return Promise.resolve({ json: async () => null });
  return new Promise((keep) => { answer = () => keep({ json: async () => served }); });
};

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
const seen = () => historyViewModel();
const plain = (parts) => parts.map((part) => part.text).join("");
const search = (q) => { document.getElementById("hist-search").value = q; };
const strip = () => { document.getElementById("hist-sync").innerHTML = ""; return syncStripViewModel(); };
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
  document.getElementById("hist-count").textContent = "stale";
  pullHistory(true);
  answer();
  await settle();
  assert.equal(seen().rows[0].sync.tone, "ok");
  assert.equal(document.getElementById("hist-count").textContent, "1 sessions", "the screen was painted again, not left on the old count");
});

test("a quiet refresh that changes nothing leaves the screen alone", async () => {
  served = { sessions: [{ id: "abcd1234", where: "local", at: 5, cwd: "/x", prompt: "", title: "One" }] };
  openHistory();
  answer();
  await settle();
  document.getElementById("hist-count").textContent = "stale";
  pullHistory(true);
  answer();
  await settle();
  assert.equal(document.getElementById("hist-count").textContent, "stale");
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

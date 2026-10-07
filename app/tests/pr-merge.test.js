import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { SPINNER, merging, mergeTrouble } = await app("seat-menu");
const { mergeButton, mergePr } = await app("thread");

const sent = [];
let serve = () => ({ ok: true });

globalThis.fetch = async (where, how) => {
  if (String(where).startsWith("/api/prs/merge")) {
    sent.push(JSON.parse(how.body));
    const said = serve();
    if (said.throws) throw new Error(said.throws);
    return { ok: true, text: async () => JSON.stringify(said), json: async () => said };
  }
  const body = JSON.stringify({ prs: st.prs });
  return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
};

const pr = (over = {}) => ({
  key: "o/r#1", repo: "o/r", number: 1, state: "open", ci: "passed",
  review: "", mergeable: "mergeable", ...over
});

const fresh = (list) => {
  merging.clear();
  mergeTrouble.clear();
  sent.length = 0;
  serve = () => ({ ok: true });
  st.prs = list;
  st.blocks = [];
  st.openPr = null;
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
};

const button = () => $("c-yes");

const answer = async (yes) => {
  for (let i = 0; i < 200 && !st.confirmResolve; i++) await new Promise((done) => setTimeout(done, 5));
  assert.ok(st.confirmResolve, "nothing was asked before the merge went in");
  $(yes ? "c-yes" : "c-no").click();
};

test("the button goes busy the moment it is clicked, and lets go only once the PR landed", async () => {
  const p = pr();
  fresh([p]);
  const going = mergePr(p, button(), false);
  assert.equal(merging.get("o/r#1"), "now", "busy before the request even answers");
  assert.ok(mergeButton(p).includes(`${SPINNER}merging…`));
  assert.match(mergeButton(p), /disabled aria-busy="true"/);
  st.prs = [{ ...p, state: "merged" }];
  await going;
  assert.equal(merging.has("o/r#1"), false, "the spinner let go");
  assert.equal(mergeButton({ ...p, state: "merged" }), "", "and there is no merge button left to press");
  assert.deepEqual(sent[0], { key: "o/r#1", whenGreen: false, force: false });
});

test("a second click while the first merge is in the air does nothing", async () => {
  const p = pr();
  fresh([p]);
  const going = mergePr(p, button(), false);
  await mergePr(p, button(), false);
  assert.equal(sent.length, 1, "only one merge left the app");
  st.prs = [{ ...p, state: "merged" }];
  await going;
});

test("a merge the server refused stops the spinner and says why", async () => {
  const p = pr();
  fresh([p]);
  serve = () => ({ error: "Protected branch update failed" });
  await mergePr(p, button(), false);
  assert.equal(merging.has("o/r#1"), false);
  assert.equal(mergeTrouble.get("o/r#1"), "Protected branch update failed");
});

test("a network that died mid-merge does not leave the button spinning forever", async () => {
  const p = pr();
  fresh([p]);
  serve = () => ({ throws: "Failed to fetch" });
  await mergePr(p, button(), false);
  assert.equal(merging.has("o/r#1"), false);
  assert.match(mergeTrouble.get("o/r#1"), /Failed to fetch/);
});

test("a merge only scheduled does not wait for a landing that is not coming", async () => {
  const p = pr({ ci: "running" });
  fresh([p]);
  serve = () => ({ ok: true, scheduled: true });
  await mergePr(p, button(), false);
  assert.deepEqual(sent[0], { key: "o/r#1", whenGreen: true, force: false });
  assert.equal(merging.has("o/r#1"), false, "it let go without the PR ever being merged");
  assert.equal(mergeTrouble.has("o/r#1"), false);
});

test("a merge already armed on GitHub refuses to be asked for twice", async () => {
  const p = pr({ ci: "running", autoMerge: true });
  fresh([p]);
  await mergePr(p, button(), false);
  assert.equal(sent.length, 0, "nothing left the app");
  assert.match(mergeButton(p), /merge armed/);
});

test("forcing past an armed merge is still allowed, and asks first", async () => {
  const p = pr({ ci: "running", autoMerge: true });
  fresh([p]);
  const going = mergePr(p, button(), true);
  await answer(true);
  st.prs = [{ ...p, state: "merged" }];
  await going;
  assert.deepEqual(sent[0], { key: "o/r#1", whenGreen: false, force: true });
});

test("saying no to the confirmation never starts the spinner", async () => {
  const p = pr({ ci: "failed" });
  fresh([p]);
  const going = mergePr(p, button(), false);
  await answer(false);
  await going;
  assert.equal(sent.length, 0);
  assert.equal(merging.has("o/r#1"), false);
});

test("a merge that takes a round to show up keeps the button busy until it does", async () => {
  const p = pr();
  fresh([p]);
  const going = mergePr(p, button(), false);
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(merging.get("o/r#1"), "now", "GitHub answered but the list still shows it open");
  st.prs = [{ ...p, state: "merged" }];
  await going;
  assert.equal(merging.has("o/r#1"), false);
});

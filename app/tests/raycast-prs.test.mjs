import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { merging, mergeTrouble } = await app("seat-menu");
const { mergePr, movePrPanel, openPrs, closePrs, prListWindowModel, prListViewModel, prRowModel } = await app("thread");

const sent = [];

globalThis.fetch = async (where, how) => {
  if (String(where).startsWith("/api/prs/merge")) {
    sent.push(JSON.parse(how.body));
    return { ok: true, text: async () => "{\"ok\":true,\"scheduled\":true}", json: async () => ({ ok: true, scheduled: true }) };
  }
  const body = JSON.stringify({ prs: st.prs });
  return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
};

const flag = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new dom.CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

const withFlag = async (fn) => {
  flag(true);
  try { return await fn(); } finally { flag(false); }
};

const pr = (over = {}) => ({ key: "o/r#1", repo: "o/r", number: 1, state: "open", ci: "passed", review: "", mergeable: "mergeable", ...over });

const button = () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) });

const fresh = (list) => {
  merging.clear();
  mergeTrouble.clear();
  sent.length = 0;
  st.prs = list;
  st.blocks = [];
  st.openPr = null;
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
};

const asked = async () => {
  for (let i = 0; i < 200 && !st.confirmResolve; i++) await new Promise((done) => setTimeout(done, 5));
  return !!st.confirmResolve;
};

test("with the flag off a green merge goes in without a question, as it always did", async () => {
  const p = pr();
  fresh([p]);
  await mergePr(p, button(), false);
  assert.equal(st.confirmResolve, null);
  assert.equal(sent.length, 1);
});

test("with the flag on even a green merge asks first, naming the repo, the number and where it lands", async () => {
  await withFlag(async () => {
    const p = pr({ base: "main" });
    fresh([p]);
    const going = mergePr(p, button(), false);
    assert.ok(await asked(), "nothing was asked before the merge went in");
    assert.equal($("c-title").textContent, "Merge r#1 into main?");
    assert.match($("c-yes").textContent, /^Merge #1/, "the button repeats the number");
    $("c-no").click();
    await going;
    assert.equal(sent.length, 0);
  });
});

test("with the flag on a red merge names the check that failed and the branch it goes over", async () => {
  await withFlag(async () => {
    const p = pr({ ci: "failed", base: "main", checks: [{ name: "test / vitest", state: "failed" }] });
    fresh([p]);
    const going = mergePr(p, button(), false);
    assert.ok(await asked());
    assert.equal($("c-title").textContent, "Merge r#1 with CI red?");
    assert.match($("c-text").innerHTML, /<code>test \/ vitest<\/code> failed\. The merge goes into <code>main<\/code> over the check\./);
    $("c-yes").click();
    await going;
    assert.equal(sent.length, 1);
  });
});

test("the PR list splits into needs you, yours and the team's only with the flag on", async () => {
  fresh([pr({ ci: "failed" }), pr({ key: "o/r#2", number: 2, mine: true }), pr({ key: "o/r#3", number: 3, review: "approved" })]);
  assert.equal(prListViewModel().sections, undefined);
  assert.equal(prRowModel(st.prs[0]).status, undefined);
  await withFlag(() => {
    const model = prListWindowModel();
    assert.deepEqual(model.sections.map((one) => [one.key, one.count]), [["asks", 1], ["mine", 1], ["team", 1]]);
    assert.deepEqual(model.sections[0].rows[0].status, { say: "CI failed", dot: "needs" });
  });
});

test("the PR panel is dressed as a window with the flag on and undressed, nodes in place, with it off", async () => {
  fresh([pr()]);
  const url = $("pr-url");
  const items = $("pr-items");
  const mid = $("pr-mid");
  const detail = $("pr-detail");
  const order = [...$("prs").children].map((one) => one.id || one.className);
  await withFlag(() => {
    openPrs();
    assert.ok($("prs").classList.contains("pw"));
    assert.equal($("pr-url"), url);
    assert.ok(url.closest(".pw-head"));
    assert.ok(mid.closest(".pr-side") && detail.closest(".pr-side"), "mid and detail sit beside the list");
    assert.equal(detail.getAttribute("tabindex"), "-1");
    assert.ok($("pr-filter") && $("pr-count") && $("pr-foot") && $("pr-close"));
    closePrs();
  });
  assert.equal($("prs").classList.contains("pw"), false);
  assert.deepEqual([...$("prs").children].map((one) => one.id || one.className), order);
  assert.equal(items.parentElement.className, "pr-list");
  assert.equal(url.getAttribute("placeholder"), "paste a PR url");
  assert.equal(detail.hasAttribute("tabindex"), false);
  movePrPanel($("prs"));
  assert.equal(mid.parentElement, $("prs"));
});

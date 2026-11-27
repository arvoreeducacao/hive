import test from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const { openPrSide, closePrSide, prSideAct, prSideHtml } = await app("pr-side");
const { mergeTrouble, merging } = await app("seat-menu");

const icon = (name) => `<i data-icon="${name}"></i>`;

const pr = (over = {}) => ({
  key: "o/r#7", repo: "o/r", number: 7, url: "https://github.com/o/r/pull/7", title: "Lote consignado", author: "maria",
  state: "open", ci: "passed", review: "", mergeable: "mergeable", base: "main", branch: "maria/lote",
  checks: [{ name: "tests", state: "passed" }], ...over
});

function panel(over = {}) {
  merging.clear();
  mergeTrouble.clear();
  closePrSide();
  const p = pr(over);
  st.prs = [p];
  openPrSide(p.key);
  return p;
}

function painted() {
  const { main, bar } = prSideHtml(icon, () => {});
  const host = document.createElement("div");
  host.innerHTML = `<div class="main">${main}</div><div class="bar">${bar}</div>`;
  const barNode = host.querySelector(".bar .tp-bar");
  const words = (el) => (el?.textContent || "").trim();
  return {
    host,
    bar: barNode,
    first: words(barNode?.firstElementChild),
    end: [...(barNode?.querySelector(".tp-bar-end")?.children || [])].map(words),
    merge: host.querySelector('.bar [data-act="pr-merge"]'),
    more: host.querySelector('.bar [data-act="pr-merge-more"]'),
    force: host.querySelector('.bar [data-act="pr-force"]')
  };
}

test("green CI shows the merge button at the right edge, with Comment at the left", () => {
  panel();
  const seen = painted();
  assert.equal(seen.first, "Comment");
  assert.equal(seen.merge.textContent.trim(), "merge");
  assert.ok(seen.merge.classList.contains("go"));
  assert.equal(seen.more, null, "nothing to force when CI already passed");
});

test("running CI offers to merge when CI passes, with force merge behind the arrow", () => {
  panel({ ci: "running", checks: [{ name: "tests", state: "running" }] });
  let seen = painted();
  assert.equal(seen.merge.textContent.trim(), "merge when CI passes");
  assert.equal(seen.more.getAttribute("aria-expanded"), "false");
  assert.equal(seen.force, null);
  prSideAct({ dataset: { act: "pr-merge-more" } }, () => {});
  seen = painted();
  assert.equal(seen.more.getAttribute("aria-expanded"), "true");
  assert.equal(seen.force.textContent.trim(), "force merge");
  prSideAct({ dataset: { act: "pr-tab", tab: "code" } }, () => {});
  assert.equal(painted().force, null, "any other click closes the arrow's menu");
});

test("red CI keeps the merge in reach, marked as red", () => {
  panel({ ci: "failed", checks: [{ name: "tests", state: "failed" }] });
  const seen = painted();
  assert.equal(seen.merge.textContent.trim(), "merge with CI red");
  assert.ok(seen.merge.classList.contains("bad"));
});

test("an armed merge says it lands when CI passes and still offers to force it", () => {
  panel({ ci: "running", autoMerge: true, checks: [{ name: "tests", state: "running" }] });
  const seen = painted();
  assert.equal(seen.first, "merge armed — it lands when CI passes");
  assert.deepEqual(seen.end, ["Comment", "force merge"]);
  assert.equal(seen.merge, null);
});

test("a conflict or a draft shows only the reason, never a merge button", () => {
  panel({ mergeable: "conflicting" });
  let seen = painted();
  assert.equal(seen.merge, null);
  assert.deepEqual(seen.end, ["resolve the conflict first"]);
  panel({ state: "draft" });
  seen = painted();
  assert.equal(seen.merge, null);
  assert.deepEqual(seen.end, ["leave draft first"]);
});

test("while the merge goes out the button turns busy and takes no second click", () => {
  const p = panel();
  merging.set(p.key, "now");
  const busy = painted().bar.querySelector('[aria-busy="true"]');
  assert.equal(busy.textContent.trim(), "merging…");
  assert.equal(busy.disabled, true);
  assert.equal(busy.dataset.act, undefined);
});

test("a refused merge says why and leaves the button to try again", () => {
  const p = panel();
  mergeTrouble.set(p.key, "Pull request is not mergeable");
  const seen = painted();
  assert.deepEqual(seen.end, ["Pull request is not mergeable", "merge"]);
});

test("a merged PR says where it went and offers to delete the branch it left", () => {
  panel({ state: "merged", branchLeft: true });
  const seen = painted();
  assert.equal(seen.first, "merged into main");
  assert.deepEqual(seen.end, ["Comment", "delete branch"]);
});

test("the ⋯ menu no longer carries the merge, the bar does", () => {
  panel();
  prSideAct({ dataset: { act: "pr-menu" } }, () => {});
  const menu = painted().host.querySelector(".main .tp-menu");
  assert.ok(menu);
  assert.equal(menu.querySelector('[data-act="pr-merge"]'), null);
  assert.ok(menu.querySelector('[data-act="pr-github"]'));
});

test("the comment box opens from the bar's Comment button", () => {
  panel();
  assert.equal(prSideHtml(icon, () => {}).compose, "");
  prSideAct({ dataset: { act: "pr-compose" } }, () => {});
  const { compose, bar } = prSideHtml(icon, () => {});
  assert.match(compose, /class="tp-compose"/);
  assert.match(bar, /data-act="pr-compose" aria-pressed="true"/);
});

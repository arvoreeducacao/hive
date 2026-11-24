import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { cleanPatch } from "../lib/config.mjs";

const st = await state();
await views();
const {
  adoptLimitsFoot, closeLimPop, limitsAlertModel, markHiveReach, openLimPop, paintLimitChip
} = await app("limit-chip");

const $ = (id) => document.getElementById(id);

const login = (account, limits) => ({ account, provider: "claude", signedIn: true, label: "Claude", limits });

const calm = login("default", [
  { kind: "session", percent: 12, resets_at: "2026-11-24T05:00:00Z" },
  { kind: "weekly_all", percent: 31, resets_at: "2026-11-27T17:00:00Z" }
]);

const warm = login("work", [
  { kind: "session", percent: 84, resets_at: "2026-11-24T05:00:00Z" },
  { kind: "weekly_all", percent: 43, resets_at: "2026-11-27T17:00:00Z" }
]);

const spent = login("default", [
  { kind: "session", percent: 100, resets_at: "2026-11-24T05:00:00Z" },
  { kind: "weekly_all", percent: 96, resets_at: "2026-11-27T17:00:00Z" }
]);

function limits(rows, { foot = false } = {}) {
  st.limits = { accounts: rows, tightest: rows[0]?.account || "" };
  adoptLimitsFoot({ config: { limitsFoot: foot } });
  paintLimitChip();
}

test("with every plan below 80% nothing about the plans is on the screen", () => {
  limits([calm]);
  assert.equal(limitsAlertModel().hidden, true);
  assert.equal($("foot").hidden, true, "the footer is gone");
  assert.equal($("btn-lim-alert").hidden, true, "and no icon takes its place");
});

test("a plan past 80% shows one icon at the top, and its hint names only the windows that are closing", () => {
  limits([calm, warm]);
  const alert = limitsAlertModel();
  assert.equal(alert.heat, "hot");
  const lines = alert.title.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^work — current session 84% \(resets .+\)$/);
  assert.equal(lines[1], "click for the whole picture");
  assert.equal($("foot").hidden, true);
  assert.equal($("btn-lim-alert").hidden, false);
  assert.ok($("btn-lim-alert").classList.contains("hot"));
  assert.ok(!$("btn-lim-alert").classList.contains("full"));
  assert.equal($("btn-lim-alert").title, alert.title);
});

test("a plan past 95% turns the icon red", () => {
  limits([spent]);
  assert.equal(limitsAlertModel().heat, "full");
  assert.ok($("btn-lim-alert").classList.contains("full"));
  assert.equal(limitsAlertModel().title.split("\n").length, 3, "both closing windows are named");
});

test("a week that counts only one model never raises the icon", () => {
  limits([login("default", [{ kind: "session", percent: 10 }, { kind: "weekly_scoped", model: "Fable", percent: 92 }])]);
  assert.equal(limitsAlertModel().hidden, true);
});

test("the icon opens the same popover under itself, and closing sends it back to the footer", () => {
  limits([warm]);
  openLimPop();
  assert.ok($("limpop").parentNode === $("top"), "the popover hangs from the top bar");
  assert.equal($("limpop").hidden, false);
  assert.equal($("btn-lim-alert").getAttribute("aria-expanded"), "true");
  closeLimPop();
  assert.ok($("limpop").parentNode === $("foot"));
  assert.equal($("limpop").hidden, true);
  assert.equal($("btn-lim-alert").getAttribute("aria-expanded"), "false");
});

test("closing the popover from inside it hands the focus back to the icon that opened it", () => {
  limits([warm]);
  openLimPop();
  $("lp-again").focus();
  closeLimPop();
  assert.ok(document.activeElement === $("btn-lim-alert"));
});

test("when the icon went away while the popover was open, closing it leaves the focus on the search next to it", () => {
  limits([warm]);
  openLimPop();
  limits([calm]);
  $("lp-again").focus();
  closeLimPop();
  assert.equal($("btn-lim-alert").hidden, true);
  assert.ok(document.activeElement === $("btn-pal"));
});

test("an open popover stays put and follows the new numbers when the plan cools down", () => {
  limits([warm]);
  openLimPop();
  limits([calm]);
  assert.equal($("btn-lim-alert").hidden, true);
  assert.equal($("limpop").hidden, false, "it does not vanish under the cursor");
  assert.ok($("limpop").parentNode === $("top"));
  closeLimPop();
});

test("the setting brings the footer back with every plan, and the icon steps aside", () => {
  limits([calm, warm], { foot: true });
  assert.equal($("foot").hidden, false);
  assert.equal($("btn-lim").hidden, false);
  assert.equal($("btn-lim-alert").hidden, true);
  assert.equal($("t-limits-foot").textContent, "on");
  assert.equal($("t-limits-foot").getAttribute("aria-pressed"), "true");
  openLimPop();
  assert.ok($("limpop").parentNode === $("foot"), "the popover opens from the footer as before");
  closeLimPop();
  limits([calm, warm]);
  assert.equal($("t-limits-foot").textContent, "off");
});

test("in the raycast look the footer comes back only to say the hive is not answering", () => {
  document.body.classList.add("experience-raycast");
  try {
    limits([warm]);
    assert.equal($("foot").hidden, true);
    markHiveReach(false);
    assert.equal($("foot").hidden, false, "the clock in the footer says there is no connection");
    assert.equal($("btn-lim").hidden, true, "the plans stay out of it");
    assert.equal($("lim-again").hidden, true);
    markHiveReach(true);
    assert.equal($("foot").hidden, true);
  } finally {
    markHiveReach(true);
    document.body.classList.remove("experience-raycast");
  }
});

test("new numbers from the plans are announced to whoever listens", async () => {
  const { pullLimits } = await app("limit-chip");
  const heard = [];
  const hear = () => heard.push(st.limits.accounts.length);
  document.addEventListener("hive:limits", hear);
  const was = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ accounts: [warm], tightest: "work" }), { headers: { "content-type": "application/json" } });
  try {
    await pullLimits();
  } finally {
    globalThis.fetch = was;
    document.removeEventListener("hive:limits", hear);
  }
  assert.deepEqual(heard, [1], "the event comes once, after st.limits holds the new numbers");
});

test("the config keeps the choice only as true or false, off by default", () => {
  assert.equal(cleanPatch({ limitsFoot: true }).clean.limitsFoot, true);
  const odd = cleanPatch({ limitsFoot: "yes" });
  assert.equal(odd.clean.limitsFoot, false);
  assert.ok(odd.problems.some((one) => one.includes("limitsFoot")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { speak } from "../assets/i18n.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { elapsedShare, evenPacePercent, paceOf, paceRemainingPercent, spanSaid, windowLength } = await app("limit-pace");
const { accountMeterModel, adoptLimitsFoot, closeLimPop, limPopOpen, limPopViewModel, limitPace, openLimPop, paintLimitChip } = await app("limit-chip");
const { closeUsage, limitBlockModel, usageDetailModel, usageListModel, usageOnScreen } = await app("usage");
await app("hold-numbers");

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-23T12:00:00Z");
const at = (ms) => new Date(ms).toISOString();
const inPortuguese = (run) => { speak("pt-BR"); try { return run(); } finally { speak("en"); } };
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 5)); };

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

const session = (percent, leftMs) => ({ kind: "session", percent, resets_at: at(NOW + leftMs) });
const live = (percent, leftMs) => ({ kind: "session", percent, resets_at: at(Date.now() + leftMs) });

test("the window length comes from the kind, and from the agent when it says its own", () => {
  assert.equal(windowLength({ kind: "session" }), 5 * HOUR);
  assert.equal(windowLength({ kind: "weekly_all" }), 7 * DAY);
  assert.equal(windowLength({ kind: "weekly_scoped", model: "Fable" }), 7 * DAY);
  assert.equal(windowLength({ kind: "monthly", resets_at: "2026-03-01T00:00:00Z" }), 28 * DAY, "a month is the calendar month before the reset");
  assert.equal(windowLength({ kind: "monthly", resets_at: "2026-04-01T00:00:00Z" }), 31 * DAY);
  assert.equal(windowLength({ kind: "monthly" }), null, "a month with no reset has no length");
  assert.equal(windowLength({ kind: "session", window_minutes: 1440 }), DAY, "codex says how long its window is, and that wins");
  assert.equal(windowLength({ kind: "session", window_minutes: 0 }), 5 * HOUR);
  assert.equal(windowLength({ kind: "something_new" }), null);
});

test("the pace is the share used against the share of the window gone, with five points either way", () => {
  assert.equal(elapsedShare(session(0, 2 * HOUR), NOW), 0.6);
  assert.equal(paceRemainingPercent(session(0, 2 * HOUR), NOW), 40);
  assert.equal(evenPacePercent(session(0, 2 * HOUR), NOW), 60);
  assert.equal(paceOf(session(70, 2 * HOUR), NOW), "ahead");
  assert.equal(paceOf(session(65, 2 * HOUR), NOW), "on", "five points over is still on pace");
  assert.equal(paceOf(session(60, 2 * HOUR), NOW), "on");
  assert.equal(paceOf(session(55, 2 * HOUR), NOW), "on", "five points under is still on pace");
  assert.equal(paceOf(session(54, 2 * HOUR), NOW), "under");
  const week = { kind: "weekly_all", percent: 20, resets_at: at(NOW + 3.5 * DAY) };
  assert.equal(paceRemainingPercent(week, NOW), 50);
  assert.equal(paceOf(week, NOW), "under");
});

test("a reset that already passed, or never came, has no pace", () => {
  const passed = session(90, -MINUTE);
  assert.equal(elapsedShare(passed, NOW), null);
  assert.equal(paceOf(passed, NOW), null);
  assert.equal(paceRemainingPercent(passed, NOW), null);
  assert.equal(paceOf({ kind: "session", percent: 50, resets_at: "" }, NOW), null);
  assert.equal(paceOf({ kind: "session", percent: 50, resets_at: "not a date" }, NOW), null);
  assert.equal(elapsedShare(session(0, 9 * HOUR), NOW), 0, "a reset further than one window away counts as a window just begun");
});

test("the time to the reset reads in days and hours, hours and minutes, or minutes", () => {
  assert.equal(spanSaid(2 * DAY + 3 * HOUR + 20 * MINUTE), "2d 3h");
  assert.equal(spanSaid(4 * HOUR + 5 * MINUTE), "4h 5m");
  assert.equal(spanSaid(59 * 1000), "0m");
  assert.equal(spanSaid(-HOUR), "0m");
});

test("a limit row says its pace, the window left, and when it renews", () => {
  const ahead = limitPace(session(70, 2 * HOUR), NOW);
  assert.equal(ahead.tick, "60%");
  assert.equal(ahead.pace, "Ahead of pace · 40% of the window left");
  assert.match(ahead.resets, /^Resets in 2h 0m · \d{2}:\d{2}$/);
  assert.equal(limitPace(session(60, 2 * HOUR), NOW).pace, "On pace · 40% of the window left");
  assert.equal(limitPace(session(10, 2 * HOUR), NOW).pace, "Under pace · 40% of the window left");
  const later = limitPace({ kind: "weekly_all", percent: 20, resets_at: at(NOW + 3 * DAY) }, NOW);
  assert.match(later.resets, /^Resets in 3d 0h · \S+ \d{2}:\d{2}$/, "a reset more than a day away names its weekday");
  assert.deepEqual(limitPace(session(90, -MINUTE), NOW), { tick: "", pace: "", resets: "" });
  assert.deepEqual(limitPace({ kind: "session", percent: 10 }, NOW), { tick: "", pace: "", resets: "" });
});

test("the row speaks portuguese when the app does", () => {
  const said = inPortuguese(() => limitPace(session(70, 2 * HOUR), NOW));
  assert.equal(said.pace, "Acima do ritmo · 40% da janela restante");
  assert.match(said.resets, /^Renova em 2h 0m · \d{2}:\d{2}$/);
  assert.equal(inPortuguese(() => limitPace(session(60, 2 * HOUR), NOW)).pace, "No ritmo · 40% da janela restante");
  assert.equal(inPortuguese(() => limitPace(session(10, 2 * HOUR), NOW)).pace, "Abaixo do ritmo · 40% da janela restante");
});

const login = (limits, over = {}) => ({ account: "default", provider: "claude", signedIn: true, label: "Claude", limits, ...over });

test("the popover, the meter on the bar and the usage panel all carry the pace", () => {
  const row = login([session(70, 2 * HOUR), { kind: "weekly_all", percent: 20, resets_at: at(NOW + 3.5 * DAY) }]);
  st.limits = { accounts: [row], tightest: "default" };
  const pop = limPopViewModel(NOW);
  assert.equal(pop.opensSay, "Open usage");
  assert.deepEqual(pop.accounts[0].limits.map((one) => [one.pct, one.tick, one.pace]), [
    ["70% used", "60%", "Ahead of pace · 40% of the window left"],
    ["20% used", "50%", "Under pace · 50% of the window left"]
  ]);
  const meter = limitBlockModel(row.limits[0], 0, NOW);
  assert.equal(meter.tick, "60%");
  assert.equal(meter.pace, "Ahead of pace · 40% of the window left");
  assert.match(meter.resets, /^Resets in /);
  const now = login([live(70, 2 * HOUR), { kind: "weekly_all", percent: 20, resets_at: at(Date.now() + 3.5 * DAY) }]);
  assert.deepEqual(accountMeterModel(now, [now]).parts.map((part) => part.tick), ["60%", "50%"], "every meter on the bar marks where even pace is");
});

function showPopover(limits) {
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.limits = { accounts: [login(limits)], tightest: "default" };
  paintLimitChip();
  openLimPop();
}

test("each limit in the popover is a button that opens the usage panel on that login", async () => {
  showPopover([live(70, 2 * HOUR)]);
  await settle();
  const rows = [...$("limpop").querySelectorAll("button.limit")];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].getAttribute("type"), "button");
  assert.equal(rows[0].title, "Open usage");
  assert.ok(rows[0].querySelector(".pace-tick"), "the bar carries the even-pace tick");
  assert.match(rows[0].querySelector(".pace").textContent, /^Ahead of pace · \d+% of the window left$/);
  assert.match(rows[0].querySelector(".resets").textContent, /^Resets in /);
  assert.equal(rows[0].tabIndex, 0, "tab reaches every row");
  rows[0].focus();
  assert.ok(document.activeElement === rows[0], "the row takes the keyboard");
  paintLimitChip();
  await settle();
  assert.ok(document.activeElement === rows[0], "a fresh answer from the plan repaints the popover without taking the focus away");
  rows[0].click();
  await settle();
  assert.equal(limPopOpen(), false, "opening the usage panel closes the popover");
  assert.equal(usageOnScreen(), true);
  assert.equal(st.usagePick, "acc:claude/default");
  assert.ok(usageListModel().length >= 1);
  assert.equal(usageDetailModel(usageListModel().flatMap((one) => one.rows))?.kind, "account");
  closeUsage();
});

test("esc closes the popover and gives the keyboard back to the chip", async () => {
  adoptLimitsFoot({ config: { limitsFoot: true } });
  showPopover([live(30, 2 * HOUR)]);
  await settle();
  const row = $("limpop").querySelector("button.limit");
  row.focus();
  row.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  await settle();
  assert.equal(limPopOpen(), false);
  assert.ok(document.activeElement === $("btn-lim"), "focus lands on the chip that opened the popover");
  closeLimPop();
  adoptLimitsFoot({ config: { limitsFoot: false } });
});

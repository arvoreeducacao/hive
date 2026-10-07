import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { inSay, lastRunModel, routineFormHtml, routineRowModel, routinesViewModel } = await app("routines");

const at = (h, m = 0) => new Date(2026, 8, 1, h, m).getTime();

const NIGHTLY = {
  id: "r1", name: "Nightly status", prompt: "summarize", trigger: "daily", time: "18:00", weekday: 0, cron: "", where: "cloud", agent: "claude",
  repo: "hive", precheck: "gh pr list -q .[0]", enabled: true, nextAt: at(18), runs: [{ at: at(9), outcome: "skipped", why: "no PRs open" }]
};

test("the clock ahead reads in minutes, hours or days", () => {
  assert.equal(inSay(-5), "now");
  assert.equal(inSay(12 * 60000), "in 12 min");
  assert.equal(inSay(125 * 60000), "in 2h 05");
  assert.equal(inSay(72 * 3600000), "in 3 days");
});

test("a row says when it runs, what runs first, and how the last round went", () => {
  const row = routineRowModel(NIGHTLY, at(10));
  assert.equal(row.schedule, "every day at 18:00");
  assert.equal(row.next, "next in 8h 00");
  assert.equal(row.where, "cloud");
  assert.equal(row.precheck, "gh pr list -q .[0]");
  assert.match(row.last.say, /skipped — no PRs open/);
  assert.equal(row.last.cls, "skipped");
  assert.equal(row.toggleSay, "turn off");

  const off = routineRowModel({ ...NIGHTLY, enabled: false }, at(10));
  assert.equal(off.next, "", "a routine turned off has no next run to show");
  assert.equal(off.toggleSay, "turn on");

  const ran = lastRunModel({ runs: [{ at: at(9), outcome: "ran", seat: "nightly-status-0900" }] });
  assert.equal(ran.seat, "nightly-status-0900");
  assert.equal(ran.cls, "ran");
  assert.equal(lastRunModel({ runs: [] }), null);
  assert.equal(routineRowModel({ ...NIGHTLY, trigger: "weekly", weekday: 5, time: "08:00" }, at(10)).schedule, "every friday at 08:00");
  assert.equal(routineRowModel({ ...NIGHTLY, trigger: "cron", cron: "0 18 * * 1-5" }, at(10)).schedule, "cron 0 18 * * 1-5");
});

test("the panel is empty with a reason, then lists what it has", () => {
  st.routines = null;
  st.routineTrouble = "";
  assert.match(routinesViewModel().none, /reading the routines/);
  st.routines = [];
  assert.match(routinesViewModel().none, /No routine yet/);
  st.routines = [NIGHTLY, { ...NIGHTLY, id: "r2", name: "Hourly ping", trigger: "hourly", time: "" }];
  st.routinesNow = at(10);
  const model = routinesViewModel();
  assert.equal(model.rows.length, 2);
  assert.equal(model.top.read, "2 routines");
  assert.equal(model.rows[1].schedule, "every hour, on the hour");
  st.routineTrouble = "could not reach the server";
  assert.equal(routinesViewModel().trouble, true);
  st.routineTrouble = "";
});

test("the editor disables the fields the trigger does not use, and keeps what was typed", () => {
  const box = document.createElement("div");
  box.innerHTML = routineFormHtml({ id: "", error: "", draft: { ...NIGHTLY, trigger: "hourly" } });
  assert.equal(box.querySelector("#rt-time").disabled, true);
  assert.equal(box.querySelector("#rt-cron").disabled, true);
  assert.equal(box.querySelector("#rt-weekday").disabled, true);
  assert.equal(box.querySelector("#rt-repo").disabled, false, "a cloud routine names its repo");
  assert.equal(box.querySelector("#rt-name").value, "Nightly status");
  assert.equal(box.querySelector("#rt-save").textContent, "create the routine");

  box.innerHTML = routineFormHtml({ id: "r1", error: "the time reads HH:MM, like 09:00", draft: { ...NIGHTLY, trigger: "cron", where: "local" } });
  assert.equal(box.querySelector("#rt-cron").disabled, false);
  assert.equal(box.querySelector("#rt-repo").disabled, true);
  assert.equal(box.querySelector("#rt-save").textContent, "save the routine");
  assert.match(box.querySelector("#rt-error").textContent, /HH:MM/);
  assert.ok(box.querySelector("#rt-error").classList.contains("armed"));
});

import { spokenNow } from "/assets/i18n.mjs";
import { $, apiGet, phrase, raycastOn, solidMounts, st } from "./core.js";
import { paintUsage, usageOnScreen } from "./usage.js";

const LIMIT_BEAT = 120000;

st.limits = { accounts: [], tightest: "" };

const limitHeat = (percent) => (percent >= 95 ? "full" : percent >= 80 ? "hot" : "");

const limitsThatCount = (row) => (row?.limits || []).filter((one) => one.kind !== "weekly_scoped");

const limitsShown = (row) => row?.limits || [];

const insideTheWeek = (one) => one.kind === "weekly_scoped";

const accountsOnTheBar = () => (st.limits.accounts || []).filter((row) => row.signedIn !== false);

const providerOf = (row) => row?.provider || "claude";

const providerLabel = (row) => row?.label || providerOf(row);

const sharesProvider = (row, rows) => rows.filter((one) => providerOf(one) === providerOf(row)).length > 1;

function accountTag(row, rows) {
  const said = [];
  if (new Set(rows.map(providerOf)).size > 1) said.push(providerLabel(row));
  if (sharesProvider(row, rows) || !said.length) said.push(row.account);
  return said.join(" · ");
}

const limitLabel = (one) =>
  one.kind === "session" ? phrase("current session")
    : one.kind === "weekly_all" ? phrase("current week · all models")
    : one.kind === "monthly" ? (one.model ? phrase("current month · {model}", { model: one.model }) : phrase("current month · credits"))
    : phrase("current week · {model}", { model: one.model || "scoped" });

const windowWord = (one) => (one.kind === "session" ? "5h" : one.kind === "monthly" ? phrase("month") : phrase("week"));

const momentOf = (ms) => (ms ? limitWhen(new Date(ms).toISOString()) : "");

function quietSaid(row) {
  const back = momentOf(row.until);
  return back ? phrase("the plan is not answering — back {n}", { n: back }) : phrase("the plan is not answering");
}

function accountSaid(row) {
  const windows = limitsThatCount(row);
  if (!windows.length) return quietSaid(row);
  const said = windows
    .map((one) => `${limitLabel(one)} ${one.percent}%${one.resets_at ? ` (${phrase("resets {n}", { n: limitWhen(one.resets_at) })})` : ""}`)
    .join(" · ");
  return row.stale ? `${said} — ${phrase("last answer {n}", { n: momentOf(row.stale) })}` : said;
}

function limitWhen(iso) {
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime())
    ? at.toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
}

function limitChipTitle(rows) {
  const lines = rows.map((row) => (rows.length > 1 ? `${accountTag(row, rows)} — ${accountSaid(row)}` : accountSaid(row)));
  return [...lines, phrase("click for the whole picture")].join("\n");
}

function paintLimitChip() {
  const model = limitChipViewModel();
  if (raycastOn()) paintRaycastFoot(model);
  else $("foot").hidden = model.hidden;
  limitChipSolid.show(model);
  if (limPopOpen()) paintLimPop();
}

let limitChipSolid = null;

let limitResetsSolid = null;

let limitResetsMount = null;

function paintRaycastFoot(model) {
  $("foot").hidden = false;
  const again = $("lim-again");
  again.hidden = model.hidden;
  const age = $("lim-age");
  if (age) age.textContent = model.age;
  const host = $("lim-resets");
  if (!host || !limitResetsMount) return;
  limitResetsSolid ||= limitResetsMount(host);
  limitResetsSolid.show({ key: "limresets", resets: model.resets });
}

const SOON = 20 * 60 * 60 * 1000;

const weekdayOf = (at) => at.toLocaleDateString(spokenNow(), { weekday: "short" }).replace(/\.$/, "");

const clockOf = (at) => at.toLocaleTimeString(spokenNow(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function renewsAt(iso, now = Date.now()) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  if (at.getTime() - now < SOON) return clockOf(at);
  return `${weekdayOf(at)} ${clockOf(at)}`;
}

function limitAge(seen, now = Date.now()) {
  if (!seen) return "";
  const mins = Math.floor((now - seen) / 60000);
  if (mins < 1) return phrase("just now");
  if (mins < 60) return phrase("{n} min ago", { n: mins });
  return phrase("{n} h ago", { n: Math.floor(mins / 60) });
}

function limitResets(rows) {
  const row = rows.find((one) => one.account === st.limits.tightest) || rows[0];
  return limitsThatCount(row)
    .filter((one) => renewsAt(one.resets_at) && limitHeat(one.percent) !== "full")
    .map((one) => ({ key: one.kind, text: phrase("{window} renews {n}", { window: windowWord(one), n: renewsAt(one.resets_at) }) }));
}

const trackWidth = (percent) => `${Math.max(0, Math.min(100, percent))}%`;

function accountMeterModel(row, rows) {
  const windows = limitsThatCount(row);
  return {
    key: `${providerOf(row)}/${row.account}`,
    icon: `i-${providerOf(row)}`,
    color: row.color || "",
    who: sharesProvider(row, rows) ? row.account : "",
    quiet: !windows.length || !!row.stale,
    parts: windows.length
      ? windows.map((one) => ({
        key: one.kind,
        k: windowWord(one),
        heat: limitHeat(one.percent),
        pct: `${one.percent}%`,
        width: trackWidth(one.percent)
      }))
      : [{ key: "quiet", k: "", heat: "", pct: "—", width: "0%" }]
  };
}

function limitChipViewModel() {
  if (raycastOn()) return raycastChip();
  const rows = accountsOnTheBar();
  if (!rows.length) return { key: "lim", hidden: true, title: "", accounts: [] };
  return { key: "lim", hidden: false, title: limitChipTitle(rows), accounts: rows.map((row) => accountMeterModel(row, rows)) };
}

function raycastMeter(row, rows) {
  const meter = accountMeterModel(row, rows);
  const windows = limitsThatCount(row);
  if (!windows.length) return meter;
  return {
    ...meter,
    parts: meter.parts.map((part, at) => {
      const one = windows[at];
      return limitHeat(one.percent) === "full" && renewsAt(one.resets_at) ? { ...part, k: phrase("back {n}", { n: renewsAt(one.resets_at) }) } : part;
    })
  };
}

function raycastChip() {
  const rows = accountsOnTheBar();
  if (!rows.length) return { key: "lim", rc: true, hidden: true, title: "", accounts: [], resets: [], age: "" };
  return {
    key: "lim", rc: true, hidden: false, title: limitChipTitle(rows), accounts: rows.map((row) => raycastMeter(row, rows)),
    resets: limitResets(rows), age: limitAge(st.limits.seen)
  };
}

const limPopOpen = () => !$("limpop").hidden;

function placeLimPop() {
  const pop = $("limpop");
  const host = pop.offsetParent;
  if (!host) return;
  const seat = $("btn-lim").getBoundingClientRect();
  const edge = Math.max(6, Math.min(seat.left, innerWidth - pop.offsetWidth - 6));
  pop.style.left = `${Math.round(edge - host.getBoundingClientRect().left)}px`;
}

function paintLimPop() {
  limPopSolid.show(limPopViewModel());
}

let limPopSolid = null;

function limPopViewModel() {
  const rows = accountsOnTheBar();
  if (!rows.length) return { key: "limpop", empty: phrase("no login is signed in on this machine"), accounts: [] };
  return {
    key: "limpop", empty: "",
    accounts: rows.map((row) => ({
      key: `${providerOf(row)}/${row.account}`, account: accountTag(row, rows), named: rows.length > 1,
      note: limitsShown(row).length
        ? (row.stale ? phrase("last answer {n}", { n: momentOf(row.stale) }) : "")
        : quietSaid(row),
      limits: limitsShown(row).map((one) => {
        const when = limitWhen(one.resets_at);
        return {
          key: `${one.kind}/${one.model || ""}`, label: limitLabel(one), heat: limitHeat(one.percent),
          sub: insideTheWeek(one),
          pct: phrase("{percent}% used", { percent: one.percent }),
          width: `${Math.min(100, one.percent)}%`,
          resets: when ? phrase("resets {n}", { n: when }) : ""
        };
      })
    }))
  };
}

solidMounts.push((hive) => {
  limitChipSolid = hive.mountLimitChip($("btn-lim"));
  limitResetsMount = hive.mountLimitResets;
  limPopSolid = hive.mountLimPop($("limpop"));
});

function openLimPop() {
  paintLimPop();
  $("limpop").hidden = false;
  placeLimPop();
  $("btn-lim").setAttribute("aria-expanded", "true");
  pullLimits();
}

document.addEventListener("hive:screen", () => closeLimPop());

function closeLimPop() {
  $("limpop").hidden = true;
  $("limpop").style.left = "";
  $("btn-lim").setAttribute("aria-expanded", "false");
}

function toggleLimPop() {
  if (limPopOpen()) return closeLimPop();
  openLimPop();
}

async function pullLimits(force) {
  try {
    const said = await apiGet(`/api/limits${force ? "?force=1" : ""}`);
    st.limits = { accounts: said?.accounts || [], tightest: said?.tightest || "", seen: Date.now() };
    st.limitsAt = Date.now();
  } catch { return; }
  paintLimitChip();
  if (usageOnScreen() && st.usage) paintUsage({});
}

export { LIMIT_BEAT, SOON, accountMeterModel, accountSaid, accountTag, accountsOnTheBar, closeLimPop, insideTheWeek, limPopOpen, limPopSolid, limPopViewModel, limitChipSolid, limitAge, limitChipTitle, limitChipViewModel, limitHeat, limitLabel, limitResets, limitWhen, limitsShown, limitsThatCount, openLimPop, paintLimPop, paintLimitChip, placeLimPop, pullLimits, renewsAt, toggleLimPop, windowWord };

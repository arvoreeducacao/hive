import { $, esc, phrase, raycastOn, screenOpens, solidMounts, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { accountTag, insideTheWeek, limitHeat, limitLabel, limitWhen, limitsShown, pullLimits, windowWord } from "./limit-chip.js";
import { closeActions, followRaycast, footModel, openActions, panelOf, registerPanel, runAction } from "./panel-window.js";
import { ago, closePortaria, portariaOnScreen } from "./pod.js";
import { openProviders } from "./providers.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

st.usage = null;

st.usageAsked = false;

st.usagePick = "";

st.usageQuery = "";

st.limitsAt = 0;

const WEEKDAYS = ["mon", "", "wed", "", "fri", "", "sun"];

const usageOnScreen = () => !$("usage").hidden;

const number = (n) => Number(n || 0).toLocaleString();

function shortTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return number(n);
}

function localHour(utcHour) {
  return new Date(Date.UTC(2026, 0, 5, utcHour)).getHours();
}

async function pullUsage() {
  try {
    const r = await fetch("/api/usage");
    const d = await r.json();
    if (d.totals) st.usage = d;
    if (usageOnScreen()) paintUsage(d);
    if (d.computing && usageOnScreen()) setTimeout(pullUsage, 5000);
  } catch {
    if (usageOnScreen()) sayUsageTrouble(phrase("could not reach the server"));
  }
}

const INSIGHT_TEXT = {
  cache_miss: "hit a >100k-token cache miss",
  long_context: "at more than 150k of context",
  subagent_heavy: "in subagent-heavy sessions",
  high_parallel: "while 4+ sessions ran in parallel",
  cron: "in sessions active for 8+ hours"
};

function paintUsage(raw) {
  if (raycastOn()) return usageSolid.show(usageWindowModel(raw));
  usageSolid.show(usageViewModel(raw));
}

let usageSolid = null;

function limitBlockModel(one, at) {
  const when = limitWhen(one.resets_at);
  return {
    key: at, heat: limitHeat(one.percent), name: limitLabel(one), sub: insideTheWeek(one),
    pct: phrase("{percent}% used", { percent: one.percent }),
    fill: Math.min(100, one.percent),
    resets: when ? phrase("resets {n}", { n: when }) : ""
  };
}

function limitsPanelModel() {
  const held = st.limits.accounts || [];
  if (!held.length) return null;
  const rows = held.filter((row) => (row.limits || []).length);
  const title = phrase("Plan limits");
  const sub = phrase("Straight from each plan — the whole account, every machine, not just this one.");
  if (!rows.length) {
    return { title, sub, held: null, note: held.map((row) => `${row.account}: ${row.error || phrase("nothing came back")}`).join(" · ") };
  }
  return {
    title, sub, note: "",
    held: rows.map((row) => ({
      key: `${row.provider || "claude"}/${row.account}`,
      account: held.length > 1 ? accountTag(row, rows) : "",
      meters: limitsShown(row).map(limitBlockModel)
    }))
  };
}

function insightsPanelModel(insights) {
  if (!insights?.items?.length) return null;
  return {
    title: phrase("What's contributing"),
    sub: phrase("The last {window_hours}h of this machine, the same accounting as the CLI's /usage — independent traits of your usage, not a breakdown.", { window_hours: insights.window_hours }),
    rows: insights.items.map((i, at) => ({
      key: at, percent: `${i.percent}%`,
      say: i.kind === "skill" ? phrase("from /{name}", { name: i.name })
        : i.kind === "mcp" ? phrase("from the MCP server “{name}”", { name: i.name })
        : phrase(INSIGHT_TEXT[i.kind] || i.kind)
    }))
  };
}

function usageWeeksModel(heatmap) {
  const byDay = new Map(heatmap.map((d) => [d.date, d]));
  const top = Math.max(...heatmap.map((d) => d.active_minutes), 1);
  const start = new Date(`${heatmap[0].date}T12:00:00`);
  const end = new Date(`${heatmap[heatmap.length - 1].date}T12:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const today = new Date().toISOString().slice(0, 10);
  const weeks = [];
  let current = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = byDay.get(iso);
    const min = day?.active_minutes || 0;
    current.push({
      key: iso, n: min ? Math.min(4, Math.ceil((min / top) * 4)) : 0, today: iso === today,
      hint: day
        ? phrase("{iso} · {min} active min · {chats} chats · peak of {peak} at once", { iso, min, chats: day.sessions, peak: day.peak_concurrency })
        : phrase("{iso} · no use", { iso })
    });
    if (current.length === 7) { weeks.push({ key: current[0].key, cells: current }); current = []; }
  }
  if (current.length) {
    while (current.length < 7) current.push({ key: `pad-${current.length}`, n: 0, today: false, hint: undefined });
    weeks.push({ key: current[0].key, cells: current });
  }
  return weeks;
}

function usageBarsModel(items, axisLabel, hint) {
  const top = Math.max(...items.map((i) => i.value), 1);
  const biggest = items.reduce((a, b) => (b.value > a.value ? b : a), items[0]);
  return items.map((i, at) => ({
    key: at, hint: hint(i), axis: axisLabel(i),
    top: i === biggest && i.value ? number(i.value) : "",
    height: Math.round((i.value / top) * 100)
  }));
}

function usageViewModel(raw) {
  const title = phrase("Usage and concurrency");
  const limitsBox = limitsPanelModel();
  if (!st.usage) {
    return {
      top: null, title, limits: limitsBox,
      note: raw?.error || phrase("reading the Claude Code transcripts — takes about ten seconds the first time.")
    };
  }
  const t = st.usage.totals;
  const p = st.usage.concurrency;
  const peak = new Date(p.at);
  const distribution = Object.entries(p.distribution).map(([n, min]) => ({ n: Number(n), value: min })).sort((a, b) => a.n - b.n);
  const hours = [...st.usage.hour_of_day]
    .map((h) => ({ ...h, local: localHour(h.hour_utc), value: h.active_minutes }))
    .sort((a, b) => a.local - b.local);
  const topConcurrency = Math.max(...hours.map((h) => h.mean_concurrency), 1);
  return {
    title, limits: limitsBox, insights: insightsPanelModel(st.usage.limits_insights),
    top: {
      when: `${st.usage.person} · ${st.usage.machine} · ${phrase("{from} to {to}", { from: st.usage.window.from, to: st.usage.window.to })}`,
      refresh: phrase("recompute"),
      closeSay: phrase("close")
    },
    hero: {
      peak: p.peak,
      lead: phrase("chats at once at your peak, on {when}.", { when: peak.toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }),
      average: phrase("On average you hold"), mean: number(p.mean_when_active),
      active: phrase("while active, and"), minutes: number(p.minutes_with_2_plus),
      tail: phrase("of the {n} active minutes had two or more running.", { n: number(p.active_minutes) })
    },
    tiles: [
      ["chats", number(t.sessions_with_activity)],
      ["active hours", String(t.active_hours)],
      ["active days", `${t.active_days} <small>${phrase("of {n}", { n: st.usage.window.calendar_days })}</small>`],
      ["current streak", `${t.current_streak_days} <small>${phrase("day{n}", { n: t.current_streak_days === 1 ? "" : "s" })}</small>`],
      ["longest streak", `${t.longest_streak_days} <small>${phrase("days")}</small>`],
      ["model", esc((t.top_model || "—").replace("claude-", ""))],
      ["tokens", shortTokens(t.tokens.total)],
      ["subagents", number(t.subagents_spawned)],
      ["PRs touched", number(t.prs_touched)],
      ["interruptions", number(t.interruptions)],
      ["background runs", `${number(t.automation?.runs ?? 0)} <small>${shortTokens(t.automation?.tokens?.total ?? 0)}</small>`]
    ].map(([label, value]) => ({ key: label, label: phrase(label), value })),
    calendar: {
      title: phrase("Day by day"),
      sub: phrase("Intensity is active minutes in the day. Hover to see chats and peak concurrency."),
      weekdays: WEEKDAYS.map((say, at) => ({ key: at, say: say ? phrase(say) : "" })),
      weeks: usageWeeksModel(st.usage.heatmap),
      less: phrase("less"), more: phrase("more"),
      steps: [0, 1, 2, 3, 4].map((n) => ({ key: n, n }))
    },
    atOnce: {
      title: phrase("How many chats at once"),
      sub: phrase("Minutes you spent with exactly N chats working. This is the number that says whether the hive is up or you are running one at a time."),
      cols: usageBarsModel(distribution, (i) => i.n, (i) => (i.n === 1
        ? phrase("{min} min with {n} chat at once", { min: number(i.value), n: i.n })
        : phrase("{min} min with {n} chats at once", { min: number(i.value), n: i.n })))
    },
    hourly: {
      title: phrase("Hour of the day"),
      sub: phrase("Bars are active minutes; the ribbon below is mean concurrency at that hour — warmer means more of the hive in parallel. Your local time."),
      cols: usageBarsModel(hours, (h) => (h.local % 3 === 0 ? String(h.local).padStart(2, "0") : ""),
        (h) => phrase("{hour}h · {min} min · {n} chats on average", { hour: String(h.local).padStart(2, "0"), min: number(h.active_minutes), n: h.mean_concurrency })),
      ribbon: hours.map((h, at) => ({
        key: at,
        tint: `rgba(205,105,74,${(0.12 + 0.88 * (h.mean_concurrency / topConcurrency)).toFixed(2)})`,
        hint: phrase("{hour}h · {n} on average", { hour: String(h.local).padStart(2, "0"), n: h.mean_concurrency })
      }))
    },
    foot: `<b>${phrase("Chats")}</b> ${phrase("are the ones you opened — the app's own headless calls (titles, block labels) count as background runs, never as chats. This is")} <b>${phrase("this machine")}</b> ${phrase("only, and the window is {n} days because that is all Claude Code keeps on disk — whatever came before is gone. Seeing the team side by side depends on the shared chat repo, drafted in the chat sync RFC", { n: st.usage.window.calendar_days })}${raw?.computing ? phrase(" · recomputing…") : ""}.`
  };
}

function sayUsageTrouble(said) {
  if (raycastOn()) return usageSolid.show({ ...usageChrome({ error: said }), raycast: true, trouble: true, note: said, top: null, title: "", limits: null });
  usageSolid.show({ trouble: true, note: said, top: null, title: "", limits: null });
}

const meterModel = (one, at) => ({ ...limitBlockModel(one, at), n: one.percent, badge: windowWord(one), hotSay: phrase("over 80%") });

const accountKey = (row) => `acc:${row.provider || "claude"}/${row.account}`;

const PROVIDER_ICONS = ["claude", "codex", "kimi", "kiro", "cursor", "opencode"];

function weekOf(row) {
  const limits = limitsShown(row);
  const week = limits.find((one) => one.kind === "weekly_all") || limits.find((one) => one.kind === "monthly") || limits[0];
  return week ? week.percent : null;
}

function accountRowModel(row) {
  const share = row.signedIn === false || row.error ? null : weekOf(row);
  return {
    key: accountKey(row), kind: "account",
    icon: PROVIDER_ICONS.includes(row.provider) ? `i-${row.provider}` : "i-agent",
    name: row.label || row.provider || "claude",
    sub: row.signedIn === false ? phrase("not signed in") : row.account,
    off: share === null, share, hot: share !== null && share >= 80,
    pct: share === null ? "—" : `${share}%`,
    hint: [row.label, row.account, row.error].filter(Boolean).join(" · ")
  };
}

function machineRowsModel() {
  const u = st.usage;
  return [
    { key: "m:atOnce", kind: "atOnce", icon: "i-flow", name: phrase("Concurrency"), sub: u ? phrase("peak of {n}", { n: u.concurrency.peak }) : "" },
    { key: "m:hours", kind: "hours", icon: "i-clock", name: phrase("Hour of the day"), sub: u ? phrase("peak at {hour}h", { hour: String(localHour([...u.hour_of_day].sort((a, b) => b.active_minutes - a.active_minutes)[0]?.hour_utc ?? 0)).padStart(2, "0") }) : "" },
    { key: "m:days", kind: "days", icon: "i-cal", name: phrase("Day by day"), sub: u ? phrase("{n} of {m} days", { n: u.totals.active_days, m: u.window.calendar_days }) : "" }
  ].map((row) => ({ ...row, off: false, share: null, hot: false, pct: "", hint: row.name }));
}

function usageListModel() {
  const q = st.usageQuery.trim().toLowerCase();
  const keep = (row) => !q || `${row.name} ${row.sub}`.toLowerCase().includes(q);
  const accounts = (st.limits.accounts || []).map(accountRowModel).filter(keep);
  const machine = machineRowsModel().filter(keep);
  const all = [...accounts, ...machine];
  if (!all.some((row) => row.key === st.usagePick)) st.usagePick = (accounts.find((row) => !row.off) || all[0])?.key || "";
  const mark = (row) => ({ ...row, here: row.key === st.usagePick });
  return [
    { key: "plan", say: phrase("Plan limits · week"), count: accounts.length === 1 ? phrase("1 account") : phrase("{n} accounts", { n: accounts.length }), rows: accounts.map(mark) },
    { key: "machine", say: phrase("This machine"), count: "", rows: machine.map(mark) }
  ].filter((section) => section.rows.length);
}

function usageDetailModel(rows) {
  const row = rows.find((one) => one.key === st.usagePick);
  if (!row) return null;
  if (row.kind !== "account") {
    const sub = { atOnce: phrase("Minutes you spent with exactly N chats working."), hours: phrase("Active minutes by hour, in your local time."), days: phrase("Active minutes in every day of the window.") }[row.kind];
    return { kind: row.kind, title: row.name, strip: [st.usage ? `${st.usage.machine}` : phrase("this machine"), sub] };
  }
  const held = (st.limits.accounts || []).find((one) => accountKey(one) === row.key);
  return {
    kind: "account",
    title: held.account && held.account !== "default" ? `${row.name} · ${held.account}` : row.name,
    strip: [held.account, phrase("the whole account, every machine"), st.limitsAt ? phrase("read {when} ago", { when: ago(new Date(st.limitsAt).toISOString()) }) : ""].filter(Boolean),
    quiet: held.signedIn === false ? phrase("This account is not signed in on this machine.") : held.error || phrase("nothing came back"),
    meters: limitsShown(held).map(meterModel)
  };
}

function usageStatsModel() {
  if (!st.usage) return null;
  const t = st.usage.totals;
  const p = st.usage.concurrency;
  return [
    { key: "peak", label: phrase("peak"), value: String(p.peak), small: ` ${phrase("chats")}` },
    { key: "mean", label: phrase("mean while active"), value: number(p.mean_when_active), small: ` ${phrase("chats")}` },
    { key: "days", label: phrase("active days"), value: String(t.active_days), small: ` ${phrase("of {n}", { n: st.usage.window.calendar_days })}` },
    { key: "streak", label: phrase("current streak"), value: String(t.current_streak_days), small: ` ${phrase("days")}` }
  ];
}

function usageChrome(raw) {
  const title = phrase("Usage and concurrency");
  const sections = usageListModel();
  const rows = sections.flatMap((section) => section.rows);
  const picked = rows.find((row) => row.key === st.usagePick);
  return {
    head: {
      icon: "i-chart", title, closeId: "usage-close", closeSay: phrase("close"),
      count: st.usage ? `${st.usage.machine} · ${phrase("{from} to {to}", { from: st.usage.window.from, to: st.usage.window.to })}` : "",
      search: { placeholder: phrase("Search a provider or account"), value: st.usageQuery },
      hints: []
    },
    sections,
    detail: usageDetailModel(rows),
    blank: raw?.error
      ? { icon: "i-warn", warn: true, head: phrase("The usage did not load"), say: phrase("The server did not answer while reading this machine."), detail: raw.error, copySay: phrase("copy") }
      : { icon: "i-chart", head: phrase("Nothing to show"), say: st.usageQuery ? phrase("No provider or account by that name.") : phrase("No account answered yet.") },
    stats: usageStatsModel(),
    waitHint: phrase("Takes about ten seconds the first time. The plan limits arrive before."),
    bar: footModel(panelOf("usage"), { icon: "i-chart", title: phrase("Usage"), trail: [picked?.name || ""] })
  };
}

function usageWindowModel(raw) {
  const model = usageViewModel(raw);
  const chrome = { ...model, ...usageChrome(raw), raycast: true };
  if (!st.usage) return chrome;
  const hours = [...st.usage.hour_of_day].map((h) => ({ ...h, local: localHour(h.hour_utc) })).sort((a, b) => a.local - b.local);
  const topConcurrency = Math.max(...hours.map((h) => h.mean_concurrency), 1);
  return {
    ...chrome,
    note: "",
    atOnce: { ...model.atOnce, unit: phrase("minutes") },
    hourly: {
      ...model.hourly,
      unit: phrase("active minutes · your time"),
      ribbon: model.hourly.ribbon.map((one, at) => ({ ...one, tint: `color-mix(in srgb, var(--accent) ${Math.round(12 + 88 * (hours[at].mean_concurrency / topConcurrency))}%, transparent)` }))
    }
  };
}

function recomputeUsage() {
  st.usage = null;
  paintUsage({ computing: true });
  pullLimits(true);
  fetch("/api/usage?force=1").then(() => setTimeout(pullUsage, 1500));
}

const usageRows = () => usageListModel().flatMap((section) => section.rows);

function pickUsage(key) {
  st.usagePick = key;
  paintUsage({});
  $("usage").querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepUsage(step) {
  const rows = usageRows();
  if (!rows.length) return;
  const at = rows.findIndex((row) => row.key === st.usagePick);
  pickUsage(rows[(at + step + rows.length) % rows.length].key);
}

function usageActions() {
  const row = usageRows().find((one) => one.key === st.usagePick);
  const held = row?.kind === "account" ? (st.limits.accounts || []).find((one) => accountKey(one) === row.key) : null;
  return [
    held ? { key: "agents", say: phrase("Open in Agents"), icon: "i-agent", primary: true, go: () => { closeUsage(); openProviders(held.provider || "claude"); } } : null,
    { key: "recompute", say: phrase("Recompute"), icon: "i-reload", combo: { alt: true, shift: true, code: "KeyR" }, foot: true, go: recomputeUsage }
  ];
}

registerPanel("usage", {
  el: () => $("usage"),
  search: () => $("usage").querySelector("[data-pw-search]"),
  list: () => $("usage").querySelector(".pw-list"),
  actions: usageActions,
  step: stepUsage,
  subject: () => usageRows().find((one) => one.key === st.usagePick)?.name || phrase("Usage")
});

solidMounts.push((hive) => {
  usageSolid = hive.mountUsage($("usage"), {
    actions: {
      close: () => closeUsage(),
      recompute: () => {
        st.usage = null;
        paintUsage({ computing: true });
        pullLimits(true);
        fetch("/api/usage?force=1").then(() => setTimeout(pullUsage, 1500));
      },
      pick: (key) => { pickUsage(key); $("usage").querySelector("[data-pw-search]")?.focus(); },
      search: (text) => { st.usageQuery = text; paintUsage({}); },
      act: (key) => runAction(panelOf("usage"), key),
      more: () => openActions(panelOf("usage"))
    }
  });
});

function openUsage() {
  screenOpens();
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  $("usage").hidden = false;
  paintUsage({ computing: !st.usage });
  if (raycastOn()) $("usage").querySelector("[data-pw-search]")?.focus();
  pullLimits();
  if (!st.usageAsked || !st.usage) { st.usageAsked = true; pullUsage(); }
}

function closeUsage() {
  if (raycastOn()) closeActions();
  $("usage").hidden = true;
}

followRaycast((on) => {
  $("usage").classList.toggle("pw", on);
  if (usageSolid && usageOnScreen()) paintUsage({});
});

$("btn-usage").addEventListener("click", () => (usageOnScreen() ? closeUsage() : openUsage()));

export { accountRowModel, machineRowsModel, pickUsage, recomputeUsage, stepUsage, usageActions, usageDetailModel, usageListModel, usageStatsModel, usageWindowModel, INSIGHT_TEXT, WEEKDAYS, closeUsage, insightsPanelModel, limitBlockModel, limitsPanelModel, localHour, number, openUsage, paintUsage, pullUsage, sayUsageTrouble, shortTokens, usageBarsModel, usageOnScreen, usageSolid, usageViewModel, usageWeeksModel };

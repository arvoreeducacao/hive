import { blockNumber, labelOf, ofBlock } from "./blocks.js";
import { $, experienceNext, phrase, solidMounts, st, stateColor } from "./core.js";
import { goToBlock } from "./focus-navigation.js";
import { myOpenTaskCount } from "./tasks.js";
import { avatar, goToTeam } from "./team.js";
import { run } from "./themes.js";

const RAIL_MIN_KEY = "hive-rail-min";

const TEAM_SHOWN_MAX = 7;

function groupRow(b, i) {
  const items = ofBlock(b);
  const seats = items.filter((it) => it.kind === "session");
  const needs = seats.some((s) => s.state === "needs");
  const label = labelOf(b, items).txt || phrase("new chat");
  return {
    key: b.id || `b${i}`,
    i,
    n: blockNumber(i),
    label,
    here: i === st.block,
    needs,
    hint: needs ? phrase("{name} — someone here needs you", { name: label }) : label,
    dots: items.map((it, at) => ({ key: `${it.key || it.name || at}`, colour: it.kind === "session" ? stateColor(it.state) : "" }))
  };
}

function teamRows() {
  const devs = st.team?.devs || [];
  const machines = new Map();
  for (const d of devs) machines.set(d.dev, (machines.get(d.dev) || 0) + 1);
  const rowOf = (d) => {
    const alone = (machines.get(d.dev) || 1) < 2;
    const name = d.mine ? d.machine : alone ? d.dev : `${d.dev} · ${d.machine}`;
    const n = d.seats.length;
    return {
      key: d.key, dev: d.dev, name, avatar: avatar(d.dev), here: d.key === st.mirrorKey,
      said: n === 1 ? phrase("1 chat") : phrase("{n} chats", { n }),
      status: n ? phrase("{n} seats", { n }) : d.up ? phrase("nothing running") : phrase("server asleep"),
      hint: `${name} — ${n ? phrase("{n} seats", { n }) : d.up ? phrase("nothing running") : phrase("server asleep")}`
    };
  };
  const others = devs.filter((d) => !(d.mine && d.key === st.team.here));
  const active = others.filter((d) => d.seats.length).map(rowOf);
  const away = others.filter((d) => !d.seats.length).map(rowOf);
  return { active, away };
}

function healthRow() {
  const alerts = st.alerts || { count: 0, state: "ok", items: [] };
  const total = alerts.total || 0;
  const worst = alerts.items?.[0]?.headline || "";
  if (!alerts.count) {
    return { state: "ok", title: phrase("Environment ok"), said: total ? phrase("{n} checks up to date", { n: total }) : phrase("no diagnosis yet"), hint: phrase("open the environment panel") };
  }
  return {
    state: alerts.state === "fail" ? "fail" : "warn",
    title: alerts.count === 1 ? phrase("1 warning") : phrase("{n} warnings", { n: alerts.count }),
    said: worst,
    hint: `${phrase("open the environment panel")} — ${worst}`
  };
}

function worktreeRow() {
  const brief = st.data.worktrees;
  if (!brief?.count) return null;
  return {
    title: phrase("{n} worktrees here", { n: brief.count }),
    said: brief.idle ? phrase("{n} idle", { n: brief.idle }) : phrase("all alive"),
    hint: brief.idle
      ? phrase("{n} worktrees on this machine, {idle} untouched — click to see them", { n: brief.count, idle: brief.idle })
      : phrase("{n} worktrees on this machine, every one of them alive", { n: brief.count })
  };
}

function nextRailViewModel() {
  const groups = st.blocks.map((b, i) => (b.ws === st.space ? groupRow(b, i) : null)).filter((g) => g && g.dots.length);
  const team = teamRows();
  const tasks = myOpenTaskCount();
  return {
    key: "next-rail",
    newChat: phrase("New chat"),
    groupsSaid: phrase("Groups"),
    groups,
    shortcutsSaid: phrase("Shortcuts"),
    shortcuts: [
      { key: "tasks", icon: "i-list", label: phrase("Tasks"), tail: tasks ? String(tasks) : "" },
      { key: "shelf", icon: "i-book", label: phrase("Shelf"), tail: "" }
    ],
    teamSaid: phrase("Team"),
    teamTally: team.active.length ? phrase("{n} active · {all}", { n: team.active.length, all: team.active.length + team.away.length }) : "",
    team: team.active,
    teamScrolls: team.active.length > TEAM_SHOWN_MAX,
    away: team.away.length ? { open: !!st.teamAwayOpen, said: phrase("{n} away", { n: team.away.length }), rows: st.teamAwayOpen ? team.away : [], faces: team.away.slice(0, 2).map((one) => ({ key: one.key, avatar: one.avatar })) } : null,
    worktrees: worktreeRow(),
    health: healthRow(),
    toggleSaid: $("shell").classList.contains("rail-min") ? phrase("expand the sidebar") : phrase("collapse the sidebar"),
    toggleLabel: phrase("Collapse")
  };
}

let nextRailTop = null;

let nextRailFoot = null;

function paintNextRail() {
  if (!nextRailTop || !experienceNext()) return;
  const model = nextRailViewModel();
  nextRailTop.show(model);
  nextRailFoot.show(model);
}

function closedByDefault() {
  try {
    if (localStorage.getItem(RAIL_MIN_KEY) === null && experienceNext()) $("shell").classList.add("rail-min");
  } catch {}
}

const nextRailActions = {
  newChat: () => run("new"),
  group: (i) => goToBlock(i),
  shortcut: (key) => run(key),
  mate: (key) => goToTeam(key),
  away: () => { st.teamAwayOpen = !st.teamAwayOpen; paintNextRail(); },
  worktrees: () => run("worktrees"),
  health: () => window.hiveDoctorOpen?.(),
  toggle: () => { $("rail-toggle").click(); paintNextRail(); }
};

solidMounts.push((hive) => {
  closedByDefault();
  nextRailTop = hive.mountNextRail($("rail-next"), { actions: nextRailActions });
  nextRailFoot = hive.mountNextRailFoot($("rail-next-foot"), { actions: nextRailActions });
});

document.addEventListener("hive:experience", () => { closedByDefault(); paintNextRail(); });

export { TEAM_SHOWN_MAX, groupRow, healthRow, nextRailViewModel, paintNextRail, teamRows, worktreeRow };

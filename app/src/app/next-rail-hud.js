import { ofBlock } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { $, experienceNext, phrase, solidMounts, st, stateColor } from "./core.js";
import { groupRow, healthRow, teamRows, worktreeRow } from "./next-rail.js";
import { myOpenTasks, openTasks, pickTask, taskBrief } from "./tasks.js";

const HUD_GAP = 56;

const HUD_LINE_RUN = 30;

const HUD_EDGE = 8;

const HUD_LINE_DROP = 21;

const HUD_LINGER = 500;

const HUD_TASKS_SHOWN = 5;

const HUD_HIDDEN = { key: "rail-hud", on: false, tone: "", x: 0, y: 0, line: "", big: false, title: "", meta: "", said: "", rows: [], seg: [], tasks: [], foot: null };

const pad = (n) => String(n).padStart(2, "0");

const plain = { tone: "", big: false, meta: "", said: "", rows: [], seg: [], tasks: [], foot: null };

function groupHud(i) {
  const b = st.blocks[i];
  if (!b) return null;
  const row = groupRow(b, i);
  const seats = ofBlock(b).filter((it) => it.kind === "session");
  return {
    ...plain,
    tone: row.needs ? "acc" : "",
    title: row.label,
    meta: [phrase("group {n}", { n: pad(row.n) }), keyLabel(st.keys.block, String(row.n)), seats.length === 1 ? phrase("1 chat") : phrase("{n} chats", { n: seats.length })].join(" · "),
    rows: seats.map((s, at) => ({ key: s.key || String(at), k: pad(at + 1), label: s.title || s.name || "", colour: stateColor(s.state) || "", needs: s.state === "needs" }))
  };
}

function healthHud() {
  const health = healthRow();
  const total = st.alerts?.total || 0;
  const count = st.alerts?.count || 0;
  const ok = health.state === "ok";
  return {
    ...plain,
    tone: ok ? "" : health.state,
    title: ok ? health.title : `${phrase("Environment")} · ${health.title}`,
    said: ok ? "" : health.said,
    seg: Array.from({ length: total }, (_, at) => ({ key: String(at), bad: at >= total - count })),
    foot: { left: total ? phrase("{ok} of {all} up to date", { ok: total - count, all: total }) : health.said, right: phrase("diagnosis"), act: "health" }
  };
}

function tasksHud() {
  const all = myOpenTasks().map(taskBrief).sort((a, b) => Number(b.live) - Number(a.live));
  const passed = all.filter((one) => one.passed).length;
  const rest = all.length - HUD_TASKS_SHOWN;
  return {
    ...plain,
    big: true,
    title: phrase("Tasks"),
    meta: [all.length ? phrase("{n} open", { n: all.length }) : phrase("nothing open"), passed ? phrase("{n} with you", { n: passed }) : "", keyLabel(st.keys.tasks)].filter(Boolean).join(" · "),
    tasks: all.slice(0, HUD_TASKS_SHOWN).map((one, at) => ({ key: one.id, k: pad(at + 1), label: one.text, say: one.say, colour: one.colour })),
    foot: { left: rest > 0 ? phrase("+{n} tasks", { n: rest }) : "", right: phrase("see all"), act: "tasks" }
  };
}

function hudContent(key) {
  const [kind, ...rest] = String(key).split(":");
  const arg = rest.join(":");
  if (kind === "new") return { ...plain, title: phrase("New chat"), meta: keyLabel(st.keys.new) };
  if (kind === "group") return groupHud(Number(arg));
  if (kind === "short" && arg === "tasks") return tasksHud();
  if (kind === "short") return { ...plain, big: true, title: phrase("Shelf"), meta: keyLabel(st.keys.shelf) };
  if (kind === "mate" || kind === "off") {
    const { active, away } = teamRows();
    const one = [...active, ...away].find((row) => row.key === arg);
    return one ? { ...plain, title: one.name, meta: one.status } : null;
  }
  if (kind === "away") {
    const { away } = teamRows();
    return away.length ? { ...plain, title: phrase("{n} away", { n: away.length }), said: away.map((one) => one.name).join(", ") } : null;
  }
  if (kind === "wt") {
    const wt = worktreeRow();
    return wt ? { ...plain, title: wt.title, meta: wt.said } : null;
  }
  if (kind === "health") return healthHud();
  if (kind === "toggle") return { ...plain, title: $("shell").classList.contains("rail-min") ? phrase("expand the sidebar") : phrase("collapse the sidebar") };
  return null;
}

function anchorOf(el) {
  if (el.classList.contains("nr-card") || !$("shell").classList.contains("rail-min")) return el;
  return el.querySelector(".nr-cell") || el;
}

function hudPlace(anchor, rail, height, viewport) {
  const cy = Math.round(anchor.top + anchor.height / 2) + 0.5;
  const x = Math.round(rail.right + HUD_GAP);
  const y = Math.max(HUD_EDGE, Math.min(cy - HUD_LINE_DROP, viewport - height - HUD_EDGE));
  const ly = y + HUD_LINE_DROP;
  return { x, y, line: `${Math.round(anchor.right)},${cy} ${x - HUD_LINE_RUN},${ly} ${x},${ly}` };
}

let hudView = null;

let lit = null;

let leaving = 0;

const holdHud = () => clearTimeout(leaving);

const lingerHud = () => { holdHud(); leaving = setTimeout(hideHud, HUD_LINGER); };

function hideHud() {
  holdHud();
  if (!lit) return;
  lit.classList.remove("lit");
  lit = null;
  document.body.classList.remove("rail-hud-on");
  hudView?.show(HUD_HIDDEN);
}

function showHud(el) {
  const content = hudView && hudContent(el.dataset.hud);
  if (!content) return hideHud();
  holdHud();
  lit?.classList.remove("lit");
  lit = el;
  el.classList.add("lit");
  document.body.classList.add("rail-hud-on");
  const draw = (height) => hudView.show({ key: "rail-hud", on: true, ...content, ...hudPlace(anchorOf(el).getBoundingClientRect(), $("rail").getBoundingClientRect(), height, innerHeight) });
  draw(0);
  draw($("rail-hud").querySelector(".rh-box")?.offsetHeight || 0);
}

function onRailOver(ev) {
  if (!experienceNext()) return;
  const el = ev.target.closest?.("[data-hud]");
  if (!el) return hideHud();
  if (el === lit) holdHud();
  else showHud(el);
}

const hudActions = {
  task: (id) => { hideHud(); openTasks(); pickTask(id); },
  foot: (act) => { hideHud(); if (act === "tasks") openTasks(); else window.hiveDoctorOpen?.(); }
};

solidMounts.push((hive) => {
  hudView = hive.mountNextRailHud($("rail-hud"), { actions: hudActions });
});

$("rail-list").addEventListener("pointerover", onRailOver);
$("rail-list").addEventListener("pointerleave", lingerHud);
$("rail-hud").addEventListener("pointerover", (ev) => { if (ev.target.closest?.(".rh-box")) holdHud(); });
$("rail-hud").addEventListener("pointerout", (ev) => { if (lit && !ev.relatedTarget?.closest?.(".rh-box")) lingerHud(); });
$("rail-list").addEventListener("click", hideHud);
$("rail-list").addEventListener("scroll", hideHud, true);
document.addEventListener("keydown", hideHud, true);
window.addEventListener("blur", hideHud);
document.addEventListener("hive:experience", hideHud);

export { hudContent, hudPlace };

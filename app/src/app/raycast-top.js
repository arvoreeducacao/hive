import { activeItems } from "./blocks.js";
import { paintAgentUpdates } from "./agent-updates.js";
import { paintStrip, render } from "./arrange.js";
import { paintNodes } from "/assets/i18n.mjs";
import { $, paintStatic, phrase, raycastOn, st } from "./core.js";
import { paintLimitChip } from "./limit-chip.js";
import { paintBlocks } from "./mirror.js";
import { placeWindowButtons, windowButtonsMovable } from "./preferences.js";
import { paintPrButton } from "./seat-menu.js";
import { paintTasks } from "./tasks.js";


const META_BUTTONS = ["btn-calls", "btn-tasks", "btn-prs", "btn-alerts"];

const RESAID = ["btn-calls", "btn-tasks", "btn-alerts", "btn-update", "btn-agents", "btn-plane"];

let undo = [];

let made = null;

function said(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html.trim();
  paintStatic(holder);
  return holder.firstElementChild;
}

function pieces() {
  if (made) return made;
  const update = said("<span data-t>Update Hive </span>");
  made = {
    lights: said('<span class="lights" id="lights" aria-hidden="true" hidden></span>'),
    meta: said('<div class="meta" id="meta"></div>'),
    callsDot: said('<i class="rc-dot needs" aria-hidden="true"></i>'),
    callsSay: said('<span id="calls-say" data-no-t></span>'),
    tasksSay: said('<span id="tasks-say" data-no-t></span>'),
    alertsDot: said('<i class="rc-dot working" aria-hidden="true"></i>'),
    alertsSay: said('<span id="alerts-say" data-no-t></span>'),
    updateSaid: update.firstChild,
    agentsDot: said('<i class="rc-dot answered" aria-hidden="true"></i>'),
    plane: said('<svg aria-hidden="true"><use href="#i-grid"/></svg>'),
    age: said('<span id="lim-age"></span>'),
    grow: said('<span class="grow"></span>'),
    resets: said('<span id="lim-resets" data-no-t></span>')
  };
  return made;
}

function move(node, parent, before = null) {
  const home = node.parentNode;
  const next = node.nextSibling;
  parent.insertBefore(node, before);
  undo.push(() => home.insertBefore(node, next));
}

function put(node, parent, before = null) {
  parent.insertBefore(node, before);
  undo.push(() => node.remove());
}

function kids(el, list) {
  const old = [...el.childNodes];
  el.replaceChildren(...list);
  undo.push(() => el.replaceChildren(...old));
}

function classes(el, change) {
  const had = el.getAttribute("class");
  change(el.classList);
  undo.push(() => {
    if (had === null) el.removeAttribute("class");
    else el.setAttribute("class", had);
  });
}

function attr(el, name, value) {
  const had = el.getAttribute(name);
  el.setAttribute(name, value);
  undo.push(() => {
    if (had === null) el.removeAttribute(name);
    else el.setAttribute(name, had);
  });
}

function after(fn) {
  undo.push(fn);
}

function dressBar(top, p) {
  const brand = top.querySelector(".brand");
  const right = top.querySelector(".right");
  put(p.lights, top, top.firstChild);
  p.lights.hidden = !windowButtonsMovable();
  move($("rail-toggle"), top, brand);
  move($("strip"), top, right);
  put(p.meta, right, right.firstChild);
  for (const id of META_BUTTONS) {
    const btn = $(id);
    move(btn, p.meta);
    classes(btn, (list) => list.replace("ghost", "it"));
  }
  const calls = $("btn-calls");
  kids(calls, [p.callsDot, $("n-calls"), p.callsSay]);
  classes(calls, (list) => list.remove("calls"));
  after(() => calls.removeAttribute("title"));
  const tasks = $("btn-tasks");
  const pip = tasks.querySelector(".pip");
  classes(pip, (list) => list.add("rc-dot", "answered"));
  kids(tasks, [pip, tasks.querySelector("b"), p.tasksSay]);
  after(() => { tasks.hidden = false; });
  const prs = $("btn-prs");
  classes(prs, (list) => list.remove("hot"));
  after(() => { prs.title = phrase("the pull requests the hive is watching"); });
  const alerts = $("btn-alerts");
  kids(alerts, [p.alertsDot, $("n-alerts"), p.alertsSay]);
  after(() => { alerts.hidden = false; });
  kids($("btn-update").querySelector(".lbl"), [p.updateSaid, $("n-update")]);
  const agents = $("btn-agents");
  move(agents, $("more"), $("more").firstChild);
  kids(agents, [p.agentsDot, $("agents-say")]);
  classes($("k-pal"), (list) => list.add("rc-key"));
  const plane = $("btn-plane");
  kids(plane, [p.plane, $("k-plane")]);
  classes($("k-plane"), (list) => list.add("rc-key"));
  attr(plane, "aria-label", phrase("the plane — every seat on one field, and you place them"));
}

function dressFoot(foot, p) {
  const again = $("lim-again");
  put(p.age, again);
  after(() => { again.hidden = false; });
  const pop = $("limpop");
  put(p.grow, foot, pop);
  put(p.resets, foot, pop);
  const clock = $("clock");
  move(clock, foot, pop);
  classes(clock, (list) => list.remove("ghost"));
}

function dress() {
  if (undo.length) return;
  const top = $("top");
  const foot = $("foot");
  if (!top || !foot) return;
  const p = pieces();
  dressBar(top, p);
  dressFoot(foot, p);
}

function undress() {
  while (undo.length) undo.pop()();
}

function repaint() {
  paintBlocks();
  paintStrip(st.mirrorDev ? null : st.blocks[st.block], st.mirrorDev ? [] : activeItems());
  paintLimitChip();
  paintPrButton();
  paintTasks();
  paintAgentUpdates();
  if (st.alerts) document.dispatchEvent(new CustomEvent("hive-alerts", { detail: st.alerts }));
  if (st.seatsKnown) render({ animate: false });
  placeWindowButtons();
}

function wear() {
  const was = undo.length > 0;
  if (raycastOn()) dress();
  else undress();
  if (was !== undo.length > 0) paintNodes(RESAID.map((id) => $(id)).filter(Boolean));
}

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  wear();
  repaint();
});

wear();

const topDressed = () => undo.length > 0;

export { dress, topDressed, undress };

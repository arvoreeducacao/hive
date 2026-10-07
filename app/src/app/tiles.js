import { render } from "./arrange.js";
import { activeItems, detachSeat, giveSeatBack, saveBlocks, soloSeat } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { $, esc, experienceNext, phrase, raycastOn, saveSidesShut, saveUnfolded, sidesShut, st, unfolded } from "./core.js";
import { hiveMark, openDraft } from "./draft-seat.js";
import { closeTile, pull, releaseKeyboard } from "./focus-navigation.js";
import { disarmLeader, keyCaps, keyHint, keyParts, tiles } from "./leader-key.js";
import { closeTrade, reviveArchived } from "./mirror.js";
import { openPal } from "./palette.js";
import { ago, ask } from "./pod.js";
import { run } from "./themes.js";
import { appendLeftovers, leftoversOf, worktreesThatStayed, worktreesToDrop } from "./seat-leftovers.js";

st.dragSeat = null;

st.dragTook = false;

st.dragOutside = false;

const canDetach = () => !soloSeat && !st.mirrorDev && !!window.hiveSeatWindow;

function detachToWindow(name) {
  if (!canDetach()) return false;
  if (!st.data.sessions.some((x) => x.name === name)) return false;
  window.hiveSeatWindow.detach(name);
  if (st.open === name) closeTile();
  detachSeat(name);
  return true;
}

window.addEventListener("dragover", () => { if (st.dragSeat) st.dragOutside = false; }, true);

window.addEventListener("dragleave", (ev) => { if (st.dragSeat && !ev.relatedTarget) st.dragOutside = true; }, true);

function carrySeatOut(name) {
  return giveSeatBack(name) || detachToWindow(name);
}

function swapSeats(a, b, animate = true) {
  const from = st.blocks.find((x) => x.keys.includes(a));
  const to = st.blocks.find((x) => x.keys.includes(b));
  if (!from || !to) return;
  const held = activeItems()[st.focus]?.key;
  const i = from.keys.indexOf(a);
  const j = to.keys.indexOf(b);
  from.keys[i] = b;
  to.keys[j] = a;
  const back = activeItems().findIndex((it) => it.key === held);
  if (back >= 0) st.focus = back;
  saveBlocks();
  render({ animate });
}

function seatDrag(el, name) {
  const head = el.querySelector(".t-head");
  const holdByTheHead = () => { head.draggable = !st.planeOn; };
  holdByTheHead();
  head.addEventListener("pointerdown", (ev) => { head.draggable = !st.planeOn && (experienceNext() ? !!ev.target.closest(".t-grip") && !el.classList.contains("open") : !ev.target.closest(".t-name")); });
  head.addEventListener("pointerup", holdByTheHead);
  head.addEventListener("pointerleave", holdByTheHead);
  head.addEventListener("click", (ev) => { if (st.dragSeat) ev.stopPropagation(); });
  head.addEventListener("dragstart", (ev) => {
    releaseKeyboard(false);
    disarmLeader();
    st.dragSeat = name;
    st.dragTook = false;
    st.dragOutside = false;
    document.body.classList.add("seat-dragging");
    el.classList.add("lifting");
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", name);
  });
  head.addEventListener("dragend", () => {
    const left = !st.dragTook && st.dragOutside;
    st.dragSeat = null;
    st.dragOutside = false;
    document.body.classList.remove("seat-dragging");
    for (const t of tiles.values()) t.classList.remove("lifting", "landing");
    $("blocks").querySelectorAll("button").forEach((b) => b.classList.remove("drop"));
    closeTrade();
    if (left) carrySeatOut(name);
  });
  el.addEventListener("dragover", (ev) => {
    if (!st.dragSeat || st.dragSeat === name) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    el.classList.add("landing");
  });
  el.addEventListener("dragleave", (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove("landing"); });
  el.addEventListener("drop", (ev) => {
    if (!st.dragSeat || st.dragSeat === name) return;
    ev.preventDefault();
    ev.stopPropagation();
    el.classList.remove("landing");
    st.dragTook = true;
    swapSeats(st.dragSeat, name);
  });
}

async function closeSeat(s, at) {
  const pending = leftoversOf(s);
  const settle = appendLeftovers(pending);
  const ok = await ask(
    raycastOn() ? phrase("Close “{name}”?", { name: s.title || s.name }) : phrase("Close this seat?"),
    `${phrase("The window closes and whatever runs in it stops.")} ` +
    `${phrase("A chat keeps its transcript:")} ${raycastOn() ? keyCaps(keyLabel(st.keys.history)) : `<b>${keyLabel(st.keys.history)}</b>`} ${phrase("brings it back with its whole context.")}`,
    phrase("close the seat"),
    { who: s.title || s.name, at }
  );
  settle();
  if (!ok) return;
  const dropWorktrees = worktreesToDrop(await pending);
  unfolded.delete(s.name);
  saveUnfolded();
  sidesShut.delete(s.name);
  saveSidesShut();
  const answer = await fetch("/api/kill", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: s.name, where: s.where, ...(dropWorktrees.length ? { dropWorktrees } : {}) })
  }).catch(() => null);
  const said = answer ? await answer.json().catch(() => null) : null;
  if (!answer || said?.error) {
    ask(
      phrase("The seat did not close"),
      esc(said?.error || phrase("the app could not reach its own server — try again")),
      phrase("understood"),
      { who: s.title || s.name, at }
    );
    pull();
    return;
  }
  const stayed = worktreesThatStayed(said);
  if (stayed) ask(phrase("The seat closed, but a worktree stayed"), stayed, phrase("understood"), { who: s.title || s.name, at });
  if (st.open === s.name) closeTile();
  pull();
}

const WALL_ARCHIVED = 2;

function emptyWallModel() {
  const linear = (st.extensions || []).some((one) => one.name === "linear" && one.on);
  const parked = [...(st.data.archived || [])].sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)).slice(0, WALL_ARCHIVED);
  return {
    mark: hiveMark(),
    head: st.data.sessions.length ? phrase("Nothing in this block") : phrase("No seat open"),
    lead: phrase("Open a chat and it sits here. {n} fit in a block; the rest of the team stays on the rail.", { n: st.LIMIT }),
    server: st.data.pod.up ? phrase("server {name} up", { name: st.data.pod.name }) : phrase("server asleep"),
    rows: [
      { key: "new", act: "new", icon: "i-bolt", name: phrase("New chat"), say: phrase("pick the agent and the model, the first message opens it"), keys: keyParts(keyLabel(st.keys.new)) },
      { key: "term", act: "term", icon: "i-term", name: phrase("New terminal"), say: phrase("a shell in the seat"), keys: keyParts(keyHint("term")) },
      ...(linear ? [{ key: "linear", act: "linear", icon: "i-list", name: phrase("From a Linear issue"), say: phrase("PED-661 and the mission"), keys: [] }] : []),
      { key: "find", act: "find", icon: "i-mag", name: phrase("Search everything"), say: phrase("seats, PRs, files"), keys: keyParts(keyLabel(st.keys.palette)) }
    ],
    parkedHead: parked.length ? phrase("Recently archived") : "",
    parkedKeys: keyParts(keyHint("history")),
    parked: parked.map((a) => ({
      key: `arch:${a.where}:${a.name}`, act: "revive", name: a.name, where: a.where,
      title: a.title || a.name,
      say: [a.archivedAt ? phrase("{when} ago", { when: ago(new Date(a.archivedAt).toISOString()) }) : "", a.model || ""].filter(Boolean).join(" · "),
      note: phrase("revive")
    }))
  };
}

function wallAct(hit) {
  if (hit.dataset.act === "new") return openDraft();
  if (hit.dataset.act === "term") return run("term");
  if (hit.dataset.act === "linear") return openPal("linear");
  if (hit.dataset.act === "find") return openPal();
  if (hit.dataset.act === "revive") return reviveArchived(hit.dataset.name, hit.dataset.where);
}

$("canvas").addEventListener("click", (ev) => {
  const hit = raycastOn() && ev.target.closest(".blank [data-act]");
  if (hit) wallAct(hit);
});

export { canDetach, carrySeatOut, closeSeat, detachToWindow, emptyWallModel, seatDrag, swapSeats };

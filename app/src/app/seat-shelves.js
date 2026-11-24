import { isShelved, seatMark, seatSection, unsettleSeats, wakeSaid, wakeSeats } from "./seat-marks.js";
import { esc, phrase, st, svgIcon } from "./core.js";
import { ago } from "./pod.js";

const SETTLED_SHOWN = 5;

let open = false;
let more = false;

const inBlock = (name) => st.blocks.some((b) => b.keys.includes(name));

function shelvedSeats() {
  return (st.data?.sessions || []).filter((s) => s.name && !s.anon && isShelved(s.name) && !inBlock(s.name));
}

function shelvesModel() {
  const seats = shelvedSeats();
  const of = (id) => seats.filter((s) => seatSection(s.name) === id);
  const snoozed = of("snoozed").sort((a, b) => seatMark(a.name).snoozeUntil - seatMark(b.name).snoozeUntil);
  const settled = of("settled").sort((a, b) => (seatMark(b.name).settledAt || 0) - (seatMark(a.name).settledAt || 0));
  return { snoozed, settled, count: seats.length };
}

function rowHtml(s, id) {
  const mark = seatMark(s.name);
  const title = s.title || s.name;
  const when = id === "snoozed"
    ? phrase("back {when}", { when: wakeSaid(mark.snoozeUntil) })
    : phrase("settled {when}", { when: ago(new Date(mark.settledAt || Date.now()).toISOString()) });
  const act = id === "snoozed" ? ["wake", phrase("Wake")] : ["unsettle", phrase("Reopen")];
  return `<li class="shv-row" data-shelves-open="${esc(s.name)}" role="button" tabindex="0" title="${esc(title)}">
    <span class="shv-t">${esc(title)}</span><span class="shv-w">${esc(when)}</span>
    <button type="button" class="shv-act" data-shelves-act="${act[0]}" data-of="${esc(s.name)}">${esc(act[1])}</button></li>`;
}

function shelfHtml(id, label, seats) {
  if (!seats.length) return "";
  const shown = id === "settled" && !more ? seats.slice(0, SETTLED_SHOWN) : seats;
  const rest = seats.length - shown.length;
  return `<section class="shv-shelf" data-shelf-of="${id}"><h3><span>${esc(label)}</span><i></i><b>${seats.length}</b></h3>
    <ul>${shown.map((s) => rowHtml(s, id)).join("")}</ul>
    ${rest ? `<button type="button" class="shv-more" data-shelves-more>${esc(phrase("Show {n} more", { n: rest }))}</button>` : ""}</section>`;
}

function shelvesHtml(model = shelvesModel()) {
  if (!model.count) return "";
  return `<div class="seat-shelves">${shelfHtml("snoozed", phrase("Snoozed"), model.snoozed)}${shelfHtml("settled", phrase("Settled"), model.settled)}</div>`;
}

function dockHtml(model) {
  const parts = [];
  if (model.snoozed.length) parts.push(`${svgIcon("i-alarm")}<span>${esc(phrase("{n} snoozed", { n: model.snoozed.length }))}</span>`);
  if (model.settled.length) parts.push(`${svgIcon("i-check")}<span>${esc(phrase("{n} settled", { n: model.settled.length }))}</span>`);
  return `<button type="button" class="shv-pill" data-shelves-toggle aria-expanded="${open}">${parts.join('<span class="shv-dot"></span>')}</button>${open ? `<div class="shv-pop" role="dialog" aria-label="${esc(phrase("Snoozed and settled chats"))}">${shelvesHtml(model)}</div>` : ""}`;
}

function dock() {
  let el = document.getElementById("shelves-dock");
  if (!el) {
    el = document.createElement("div");
    el.id = "shelves-dock";
    el.dataset.noT = "";
    document.body.append(el);
  }
  return el;
}

function paintShelvesDock(on) {
  const model = on ? shelvesModel() : null;
  const el = document.getElementById("shelves-dock") || (model?.count ? dock() : null);
  if (!el) return;
  el.hidden = !model?.count;
  if (el.hidden) {
    open = false;
    el.replaceChildren();
    return;
  }
  const html = dockHtml(model);
  if (el.dataset.h !== html) {
    el.dataset.h = html;
    el.innerHTML = html;
  }
}

function shelvesAct(target, goTo) {
  const act = target.closest("[data-shelves-act]");
  if (act) {
    if (act.dataset.shelvesAct === "wake") wakeSeats([act.dataset.of]);
    else unsettleSeats([act.dataset.of]);
    return true;
  }
  if (target.closest("[data-shelves-more]")) {
    more = true;
    document.dispatchEvent(new CustomEvent("hive:marks"));
    return true;
  }
  if (target.closest("[data-shelves-toggle]")) {
    open = !open;
    document.dispatchEvent(new CustomEvent("hive:marks"));
    return true;
  }
  const row = target.closest("[data-shelves-open]");
  if (!row) return false;
  open = false;
  goTo(row.dataset.shelvesOpen);
  return true;
}

function closeShelvesDock() {
  if (!open) return false;
  open = false;
  document.dispatchEvent(new CustomEvent("hive:marks"));
  return true;
}

export { closeShelvesDock, paintShelvesDock, shelvedSeats, shelvesAct, shelvesHtml, shelvesModel };

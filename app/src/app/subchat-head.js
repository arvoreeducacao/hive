import { blockNumber, subchatOf } from "./blocks.js";
import { esc, phrase, st } from "./core.js";
import { closeTile, goTo, openTile } from "./focus-navigation.js";
import { seatSection } from "./seat-marks.js";

const clean = (text) => String(text || "").replace(/\s+/g, " ").trim();

const titleOf = (seat, name) => seat?.title || name;

function subchatAlone(s) {
  const by = subchatOf(s.name);
  if (!by || st.open !== s.name || st.blocks.some((b) => b.keys.includes(s.name))) return "";
  return by;
}

function siblingsOf(by, name) {
  return st.data.sessions.filter((one) => one.by === by && (one.name === name || seatSection(one.name) !== "settled"));
}

function headHtml(s, by) {
  const opener = titleOf(st.data.sessions.find((one) => one.name === by), by);
  const back = phrase("block {n}", { n: blockNumber(st.block) });
  const sibs = siblingsOf(by, s.name).map((one) => `<button type="button" class="sh-sib${one.name === s.name ? " on" : ""}" data-sub-open="${esc(one.name)}" title="${esc(titleOf(one, one.name))}"><i class="rc-dot ${esc(one.state)}" aria-hidden="true"></i><span>${esc(titleOf(one, one.name))}</span></button>`).join("");
  return `<div class="sh-crumb">`
    + `<svg class="sh-fork" aria-hidden="true"><use href="#i-fork"/></svg>`
    + `<button type="button" class="sh-opener" data-sub-go="${esc(by)}" title="${esc(phrase("{who} opened this chat — click to go back to it", { who: opener }))}">${esc(opener)}</button>`
    + `<span class="sh-sep" aria-hidden="true">/</span>`
    + `<span class="sh-me">${esc(titleOf(s, s.name))}</span>`
    + `<span class="sh-chip">${esc(phrase("subchat"))}</span>`
    + `</div>`
    + `<div class="sh-sibs" role="group" aria-label="${esc(phrase("subchats of {who}", { who: opener }))}">${sibs}</div>`
    + `<button type="button" class="sh-back" data-sub-back title="${esc(phrase("Back to {block} (esc)", { block: back }))}"><svg class="sh-back-ic" aria-hidden="true"><use href="#i-chev"/></svg><span>${esc(back)}</span><kbd>Esc</kbd></button>`;
}

function headClick(ev) {
  const go = ev.target.closest("[data-sub-go]");
  const open = ev.target.closest("[data-sub-open]");
  const back = ev.target.closest("[data-sub-back]");
  if (!go && !open && !back) return;
  ev.stopPropagation();
  if (back) return closeTile();
  if (open) return openTile(open.dataset.subOpen);
  closeTile();
  goTo(go.dataset.subGo);
}

function paintNote(el) {
  const sv = el.querySelector(".well .sv");
  if (!sv) return;
  let note = sv.querySelector(":scope > .sub-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "sub-note";
    note.innerHTML = `<svg aria-hidden="true"><use href="#i-fork"/></svg><span></span>`;
    const place = sv.querySelector(":scope > .cp-place");
    if (place) place.before(note);
    else sv.append(note);
  }
  const said = phrase("You talk to this subchat directly. The chat that opened it only hears back on the turns it asked for.");
  const text = note.querySelector("span");
  if (text.textContent !== said) text.textContent = said;
}

function markMission(el, s, by) {
  const asked = clean(s.asked).slice(0, 60);
  const opener = titleOf(st.data.sessions.find((one) => one.name === by), by);
  el.style.setProperty("--opener-said", JSON.stringify(phrase("{who} opened this chat", { who: opener })));
  let found = false;
  for (const bubble of el.querySelectorAll(".sv-scroll .sv-user:not(.peer)")) {
    const mission = !found && !!asked && clean(bubble.textContent).startsWith(asked);
    if (mission) found = true;
    bubble.classList.toggle("from-opener", mission);
  }
}

function paintSubchatHead(el, s) {
  const by = subchatAlone(s);
  el.classList.toggle("subchat-alone", !!by);
  let head = el.querySelector(":scope > .sub-head");
  if (!by) {
    if (head) head.hidden = true;
    for (const bubble of el.querySelectorAll(".sv-user.from-opener")) bubble.classList.remove("from-opener");
    return;
  }
  if (!head) {
    head = document.createElement("div");
    head.className = "sub-head";
    head.addEventListener("click", headClick);
    head.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    el.prepend(head);
  }
  head.hidden = false;
  const html = headHtml(s, by);
  if (head.dataset.h !== html) {
    head.innerHTML = html;
    head.dataset.h = html;
  }
  paintNote(el);
  markMission(el, s, by);
}

export { paintSubchatHead };

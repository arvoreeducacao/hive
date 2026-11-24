import { esc, phrase, st, svgIcon } from "./core.js";
import { seatLabel } from "./pure-helpers.js";
import { TIP_DELAY, TIP_WARM, fitMiddles, prsOf, tipHtml, treeOf } from "../structures/inbox.js";

const CHAT_CHIP = ".ctx-chip[data-kind=chat]";
const CARD_ID = "seat-hover-card";
const GAP = 6;
const EDGE = 8;

const held = { card: null, chip: null, timer: 0, closedAt: 0 };

const seatNamed = (name) => (name ? (st.data?.sessions || []).find((one) => one.name === name) || null : null);

function cardRow(seat) {
  const tree = treeOf(seat);
  return {
    key: seat.key || seat.name,
    name: seat.name,
    title: seatLabel(seat),
    repo: tree?.repo || String(seat.cwd || "").split("/").filter(Boolean).pop() || "",
    branch: tree?.branch || "",
    where: seat.where || "",
    model: seat.model || "",
    account: seat.account || "",
    agent: seat.agent || "",
    kind: seat.kind || "",
    prs: prsOf(seat.name, st.prs)
  };
}

function quietTitle(chip, seat) {
  if (seat && chip.hasAttribute("title")) {
    chip.dataset.title = chip.getAttribute("title");
    chip.removeAttribute("title");
  } else if (!seat && chip.dataset.title && !chip.hasAttribute("title")) {
    chip.setAttribute("title", chip.dataset.title);
  }
}

function hideSeatCard() {
  clearTimeout(held.timer);
  held.timer = 0;
  if (held.card) {
    held.chip?.removeAttribute("aria-describedby");
    held.card.remove();
    held.closedAt = Date.now();
  }
  held.card = null;
  held.chip = null;
}

function place(card, chip) {
  const box = chip.getBoundingClientRect();
  const wide = document.documentElement.clientWidth || window.innerWidth || 0;
  const tall = document.documentElement.clientHeight || window.innerHeight || 0;
  const above = box.top - card.offsetHeight - GAP;
  const top = above >= EDGE ? above : Math.min(box.bottom + GAP, tall - card.offsetHeight - EDGE);
  card.style.top = `${Math.round(Math.max(EDGE, top))}px`;
  card.style.left = `${Math.round(Math.max(EDGE, Math.min(box.left, wide - card.offsetWidth - EDGE)))}px`;
}

function showSeatCard(chip) {
  const seat = seatNamed(chip.dataset.seat);
  if (!seat || !chip.isConnected) return void hideSeatCard();
  hideSeatCard();
  const card = document.createElement("div");
  card.id = CARD_ID;
  card.className = "tx-tip seat-card";
  card.setAttribute("role", "tooltip");
  card.innerHTML = tipHtml(cardRow(seat), { esc, phrase, svgIcon });
  (chip.closest("#structure-root") || document.body).append(card);
  place(card, chip);
  fitMiddles(card);
  chip.setAttribute("aria-describedby", CARD_ID);
  held.card = card;
  held.chip = chip;
}

function armSeatCard(chip) {
  const seat = seatNamed(chip.dataset.seat);
  quietTitle(chip, seat);
  const warm = !!held.card || Date.now() - held.closedAt < TIP_WARM;
  hideSeatCard();
  if (!seat) return;
  held.chip = chip;
  held.timer = setTimeout(() => showSeatCard(chip), warm ? 0 : TIP_DELAY);
}

const chatChipOf = (target) => target?.closest?.(CHAT_CHIP) || null;

function onOver(ev) {
  const chip = chatChipOf(ev.target);
  if (!chip || chip === held.chip) return;
  armSeatCard(chip);
}

function onOut(ev) {
  const chip = chatChipOf(ev.target);
  if (chip && chip === held.chip && !chip.contains(ev.relatedTarget)) hideSeatCard();
}

function onFocusIn(ev) {
  const chip = chatChipOf(ev.target);
  if (!chip || chip !== ev.target || chip === held.chip || !chip.matches(":focus-visible")) return;
  armSeatCard(chip);
}

function onFocusOut(ev) {
  if (held.chip && ev.target === held.chip) hideSeatCard();
}

function onKey(ev) {
  if (ev.key === "Escape" && held.card) {
    ev.preventDefault();
    ev.stopPropagation();
    hideSeatCard();
    return;
  }
  if (ev.key === "Escape") onAway();
  if ((ev.key === "Enter" || ev.key === " ") && ev.target?.matches?.(CHAT_CHIP)) {
    ev.preventDefault();
    hideSeatCard();
    ev.target.click();
  }
}

function onAway() {
  if (held.card || held.timer) hideSeatCard();
}

if (typeof document !== "undefined") {
  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("mouseout", onOut, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onAway, true);
  document.addEventListener("scroll", onAway, { capture: true, passive: true });
}

export { hideSeatCard, showSeatCard };

import { SV_ASK, SV_ASK_SLIM, esc, phrase, composerShaped } from "./core.js";
import { advanceAsk, askPlaceholder, askPrimary, stepAsk } from "./composer-ask.js";
import { composerIcon } from "./composer-icons.js";
import { boxHasContent, onComposerMode } from "./composer-modes.js";
import { implementInNewChat, implementPlan } from "./composer-plan.js";

const COMPOSER_ASK = "Ask anything. @ files, / commands";

const placeholders = [];

function addPlaceholder(rule) {
  placeholders.push(rule);
}

addPlaceholder((e, mode) => (mode === "question" ? askPlaceholder(e) : ""));
addPlaceholder((e, mode) => (mode === "plan" ? phrase("Add feedback to refine the plan, or leave this blank to implement it") : ""));
addPlaceholder((e, mode) => (mode === "edit" ? phrase("Edit the queued message") : ""));

function placeholderOf(e, mode) {
  for (const rule of placeholders) {
    const said = rule(e, mode);
    if (said) return said;
  }
  if (composerShaped()) return phrase(COMPOSER_ASK);
  return phrase(e.host.closest(".tile")?.matches(":not(.focused, .open)") ? SV_ASK_SLIM : SV_ASK);
}

function paintPlaceholder(e, form, mode) {
  const box = form.querySelector("textarea");
  if (!box) return;
  const want = placeholderOf(e, mode);
  if (box.placeholder !== want) box.placeholder = want;
}

function ensureActs(e, form) {
  const btns = form.querySelector(".sv-btns");
  if (!btns) return null;
  let acts = btns.querySelector(":scope > .cp-acts");
  if (acts) return acts;
  acts = document.createElement("span");
  acts.className = "cp-acts";
  acts.hidden = true;
  acts.innerHTML = `<button type="button" class="cp-prev"></button><button type="button" class="cp-pill"></button>`
    + `<span class="cp-impl"><button type="button" class="cp-impl-go"></button><button type="button" class="cp-impl-more" aria-haspopup="menu">${composerIcon("chevronDown")}</button>`
    + `<span class="cp-impl-menu" role="menu" hidden><button type="button" role="menuitem" class="cp-impl-new"></button></span></span>`;
  acts.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
  acts.querySelector(".cp-prev").addEventListener("click", () => stepAsk(e, -1));
  acts.querySelector(".cp-pill").addEventListener("click", () => {
    if (e.ask && !e.ask.waiting) return advanceAsk(e);
    if (e.planAsk) e.box?.say(false);
  });
  acts.querySelector(".cp-impl-go").addEventListener("click", () => implementPlan(e));
  acts.querySelector(".cp-impl-more").addEventListener("click", (ev) => {
    ev.stopPropagation();
    const menu = acts.querySelector(".cp-impl-menu");
    menu.hidden = !menu.hidden;
    if (!menu.hidden) document.addEventListener("pointerdown", (out) => { if (!acts.querySelector(".cp-impl").contains(out.target)) menu.hidden = true; }, { once: true, capture: true });
  });
  acts.querySelector(".cp-impl-new").addEventListener("click", () => {
    acts.querySelector(".cp-impl-menu").hidden = true;
    implementInNewChat(e);
  });
  const send = btns.querySelector(".sv-send");
  if (send) send.before(acts);
  else btns.append(acts);
  return acts;
}

function paintActs(e, form, mode) {
  const pending = mode === "question" || mode === "plan";
  const acts = pending ? ensureActs(e, form) : form.querySelector(".sv-btns > .cp-acts");
  if (!acts) return;
  acts.hidden = !pending;
  if (!pending) return;
  const prev = acts.querySelector(".cp-prev");
  const pill = acts.querySelector(".cp-pill");
  const impl = acts.querySelector(".cp-impl");
  const go = acts.querySelector(".cp-impl-go");
  const more = acts.querySelector(".cp-impl-more");
  prev.textContent = phrase("Previous");
  go.textContent = e.planAsk?.sending ? phrase("Sending...") : phrase("Implement");
  go.disabled = !!e.planAsk?.sending;
  more.disabled = !!e.planAsk?.sending;
  more.setAttribute("aria-label", phrase("Implementation actions"));
  acts.querySelector(".cp-impl-new").textContent = phrase("Implement in a new chat");
  if (mode === "question") {
    const said = askPrimary(e);
    prev.hidden = !said.previous;
    prev.disabled = said.previousDisabled;
    pill.hidden = false;
    pill.textContent = said.label;
    pill.disabled = said.disabled;
    impl.hidden = true;
    return;
  }
  acts.querySelector(".cp-impl-menu").hidden = !impl.querySelector(".cp-impl-menu:not([hidden])");
  const refining = boxHasContent(e);
  prev.hidden = true;
  pill.hidden = !refining;
  pill.textContent = phrase("Refine");
  pill.disabled = false;
  impl.hidden = refining;
}

onComposerMode({
  paint(e, form, mode) {
    paintPlaceholder(e, form, mode);
    paintActs(e, form, mode);
  }
});

export { COMPOSER_ASK, addPlaceholder, placeholderOf };

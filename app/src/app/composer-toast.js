import { esc, phrase } from "./core.js";
import { attachmentIcon } from "./attachment-icons.js";

const TOAST_STAYS_MS = 6000;

const TOASTS_SHOWN = 4;

function toastStack() {
  let stack = document.getElementById("cp-toasts");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.id = "cp-toasts";
  stack.className = "cp-toasts";
  stack.setAttribute("role", "region");
  stack.setAttribute("aria-live", "polite");
  document.body.appendChild(stack);
  return stack;
}

function toast({ title, description = "", tone = "error", stays = TOAST_STAYS_MS } = {}) {
  const stack = toastStack();
  const card = document.createElement("div");
  card.className = `cp-toast ${tone}`;
  card.setAttribute("role", tone === "error" ? "alert" : "status");
  card.innerHTML = `<div class="cp-toast-text"><b>${esc(title || "")}</b>${description ? `<span>${esc(description)}</span>` : ""}</div>`
    + `<button type="button" class="cp-toast-x" aria-label="${esc(phrase("Dismiss"))}">${attachmentIcon("x")}</button>`;
  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    card.remove();
  };
  const update = (next = {}) => {
    if (next.tone) card.className = `cp-toast ${next.tone}`;
    if (next.title !== undefined) card.querySelector("b").textContent = next.title;
    const text = card.querySelector(".cp-toast-text");
    text.querySelector("span")?.remove();
    if (next.description) text.insertAdjacentHTML("beforeend", `<span>${esc(next.description)}</span>`);
    clearTimeout(timer);
    if (next.stays !== 0) timer = setTimeout(close, next.stays || TOAST_STAYS_MS);
  };
  card.querySelector(".cp-toast-x").addEventListener("click", close);
  stack.appendChild(card);
  while (stack.children.length > TOASTS_SHOWN) stack.firstElementChild.remove();
  if (stays) timer = setTimeout(close, stays);
  return { close, update, el: card };
}

export { toast };

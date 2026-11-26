import { toastStackView } from "../views.js";
import { phrase } from "./core.js";
import { attachmentIcon } from "./attachment-icons.js";

const TOAST_STAYS_MS = 6000;

const TOASTS_SHOWN = 4;

const shown = [];

let stack = null;

let made = 0;

const stackModel = () => ({
  dismiss: phrase("Dismiss"),
  icon: attachmentIcon("x"),
  toasts: shown.map(({ key, tone, role, title, description }) => ({ key, tone, role, title, description }))
});

function paint() {
  stack ||= toastStackView(stackModel(), { close: (key) => shown.find((one) => one.key === key)?.close() });
  stack.show(stackModel());
}

function toast({ title, description = "", tone = "error", stays = TOAST_STAYS_MS } = {}) {
  made += 1;
  const one = { key: `t${made}`, tone, role: tone === "error" ? "alert" : "status", title: title || "", description: description || "", timer: 0 };
  one.close = () => {
    clearTimeout(one.timer);
    const at = shown.indexOf(one);
    if (at < 0) return;
    shown.splice(at, 1);
    paint();
  };
  const update = (next = {}) => {
    if (next.tone) one.tone = next.tone;
    if (next.title !== undefined) one.title = next.title;
    one.description = next.description || "";
    clearTimeout(one.timer);
    if (next.stays !== 0) one.timer = setTimeout(one.close, next.stays || TOAST_STAYS_MS);
    if (shown.includes(one)) paint();
  };
  shown.push(one);
  while (shown.length > TOASTS_SHOWN) shown.shift();
  paint();
  if (stays) one.timer = setTimeout(one.close, stays);
  return { close: one.close, update, get el() { return stack.cardOf(one.key); } };
}

export { toast };

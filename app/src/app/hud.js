import { $, IS_MAC, esc, phrase } from "./core.js";

const HUD_STAYS = 2400;

const HUD_ACT_STAYS = 6000;

const HUD_LEAVES = 120;

const UNDO_KEY = IS_MAC ? "⌘Z" : "ctrl+Z";

let shown = null;
let leaving = 0;

const editable = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

function hudMarkup({ icon, text, mono, more, act, busy }) {
  const mark = busy ? '<span class="hud-spin" aria-hidden="true"></span>' : `<svg class="hud-i" aria-hidden="true"><use href="#${icon}"/></svg>`;
  const tail = more ? `<span class="hud-more">+${more}</span>` : "";
  const button = act ? `<span class="hud-sep"></span><button type="button" class="hud-act">${esc(act.label)}${act.key ? `<kbd class="rc-key">${esc(act.key)}</kbd>` : ""}</button>` : "";
  return `${mark}<span class="hud-t">${esc(text)}</span>${mono ? `<span class="hud-m">${esc(mono)}</span>` : ""}${tail}${button}<i class="hud-time"></i>`;
}

function arm(stays) {
  clearTimeout(shown.timer);
  const box = $("hud");
  box.style.setProperty("--hud-stays", `${stays}ms`);
  box.classList.remove("timing");
  void box.offsetWidth;
  box.classList.add("timing");
  shown.timer = stays ? setTimeout(() => dismissHud(), stays) : 0;
}

function hud({ icon = "i-check", text, mono = "", tone = "ok", act = null, busy = false, stays } = {}) {
  const box = $("hud");
  if (!box || !text) return null;
  clearTimeout(leaving);
  const more = shown && !box.hidden ? shown.more + 1 : 0;
  if (shown) clearTimeout(shown.timer);
  shown = { act, more, stays: stays ?? (busy ? 0 : act ? HUD_ACT_STAYS : HUD_STAYS), timer: 0 };
  box.innerHTML = hudMarkup({ icon, text, mono, more, act, busy });
  box.dataset.tone = tone;
  box.classList.toggle("solo", !act);
  box.classList.remove("out");
  box.hidden = false;
  box.querySelector(".hud-act")?.addEventListener("click", () => runHud());
  arm(shown.stays);
  return shown;
}

function dismissHud() {
  const box = $("hud");
  if (!box || box.hidden) return;
  if (shown) clearTimeout(shown.timer);
  shown = null;
  box.classList.add("out");
  clearTimeout(leaving);
  leaving = setTimeout(() => { box.hidden = true; box.classList.remove("out"); }, HUD_LEAVES);
  if (box.contains(document.activeElement)) document.activeElement.blur();
}

function runHud() {
  const act = shown?.act;
  if (!act) return false;
  shown.act = null;
  const said = act.run?.();
  if (act.done) hud({ text: act.done, icon: "i-check" });
  else dismissHud();
  return said !== false;
}

const hudOnScreen = () => !!shown && !$("hud")?.hidden;

const hudUndoes = () => hudOnScreen() && shown.act?.key === UNDO_KEY;

document.addEventListener("keydown", (ev) => {
  if (!hudOnScreen()) return;
  const box = $("hud");
  if (ev.key === "F6" && shown.act) {
    ev.preventDefault();
    box.querySelector(".hud-act")?.focus();
    return;
  }
  if (ev.key === "Escape" && box.contains(document.activeElement)) {
    ev.preventDefault();
    ev.stopPropagation();
    dismissHud();
    return;
  }
  const undo = IS_MAC ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey && !ev.metaKey;
  if (undo && !ev.altKey && !ev.shiftKey && ev.code === "KeyZ" && hudUndoes() && !editable(document.activeElement)) {
    ev.preventDefault();
    ev.stopPropagation();
    runHud();
  }
}, true);

$("hud")?.addEventListener("pointerenter", () => {
  if (!shown) return;
  clearTimeout(shown.timer);
  $("hud").classList.add("held");
});

$("hud")?.addEventListener("pointerleave", () => {
  if (!shown) return;
  $("hud").classList.remove("held");
  if (shown.stays) arm(shown.stays);
});

function hudUndo({ icon = "i-swap", text, mono = "", run, done = phrase("Undone") }) {
  return hud({ icon, text, mono, act: { label: phrase("Undo"), key: UNDO_KEY, run, done } });
}

function hudCopied(text, ok, again) {
  const said = String(text || "").replace(/\s+/g, " ").trim();
  const mono = said.length > 40 ? `${said.slice(0, 39)}…` : said;
  if (ok) return hud({ text: phrase("Copied"), mono });
  return hud({ icon: "i-warn", tone: "warn", text: phrase("Could not copy"), act: again ? { label: phrase("Select it"), run: again } : null });
}

export { HUD_ACT_STAYS, HUD_STAYS, UNDO_KEY, dismissHud, hud, hudCopied, hudOnScreen, hudUndo, hudUndoes, runHud };

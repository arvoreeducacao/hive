import { saveConfig } from "./brand-face.js";
import { $, IS_MAC, esc, phrase, st } from "./core.js";

const QUIT_CHOICES = ["hold", "twice", "direct"];
const QUIT_DEFAULT = "hold";
const QUIT_NAMES = { hold: "Hold", twice: "Press twice", direct: "Quit right away" };
const LINGER_MS = 1200;

st.quitShortcut = QUIT_DEFAULT;

let lingering = 0;

const quitKeys = () => (IS_MAC ? ["⌘", "Q"] : ["Ctrl", "Q"]);

const quitSaid = () => (IS_MAC ? "⌘Q" : "Ctrl+Q");

function quitHintHtml(hint) {
  const shortcut = quitSaid();
  const hold = hint.mode === "hold";
  const title = hold ? phrase("Hold {shortcut} to quit", { shortcut }) : phrase("Press {shortcut} again to quit", { shortcut });
  const keys = quitKeys().map((one) => `<kbd>${esc(one)}</kbd>`).join("");
  const sub = hold ? `<span class="qh-sub">${esc(phrase("or press it twice"))}</span>` : "";
  const bar = hold ? `<i class="qh-bar" style="--qh-ms:${Math.max(200, Number(hint.holdMs) || 1200)}ms"><b></b></i>` : "";
  return `<div class="qh-keys" aria-hidden="true">${keys}</div><b class="qh-title">${esc(title)}</b>${sub}${bar}`;
}

function showQuitHint(hint) {
  const box = $("quit-hint");
  if (!box) return;
  clearTimeout(lingering);
  if (hint?.state === "down" && (hint.mode === "hold" || hint.mode === "twice")) {
    box.innerHTML = quitHintHtml(hint);
    box.dataset.mode = hint.mode;
    box.hidden = false;
    return;
  }
  if (box.hidden) return;
  if (box.dataset.mode === "twice") {
    box.hidden = true;
    return;
  }
  lingering = setTimeout(() => { box.hidden = true; }, LINGER_MS);
}

function paintQuitChoice() {
  const row = $("quit-row");
  const pick = $("f-quit");
  if (!row || !pick) return;
  const shown = !!window.hiveQuit;
  row.hidden = !shown;
  if (!shown) return;
  const options = QUIT_CHOICES.map((one) => [one, phrase(QUIT_NAMES[one])]);
  if (pick.options.length !== options.length || options.some(([value, label], at) => pick.options[at].value !== value || pick.options[at].text !== label)) {
    pick.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  }
  pick.value = st.quitShortcut;
}

function setQuitShortcut(choice, quiet) {
  st.quitShortcut = QUIT_CHOICES.includes(choice) ? choice : QUIT_DEFAULT;
  paintQuitChoice();
  if (quiet) return;
  saveConfig({ quitShortcut: st.quitShortcut }).catch(() => {});
}

function adoptQuitShortcut(r) {
  setQuitShortcut(r.config?.quitShortcut, true);
}

$("f-quit")?.addEventListener("change", (ev) => setQuitShortcut(ev.target.value));

window.hiveQuit?.hear?.(showQuitHint);

paintQuitChoice();

export { QUIT_CHOICES, QUIT_DEFAULT, QUIT_NAMES, adoptQuitShortcut, paintQuitChoice, quitHintHtml, setQuitShortcut, showQuitHint };

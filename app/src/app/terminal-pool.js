import { FitAddon, THEME, Terminal, WebLinksAddon, phrase, raycastOn } from "./core.js";
import { GhosttyTerm } from "/assets/ghostty/term.mjs";
import { pool } from "./leader-key.js";
import { imageLinks } from "./session-images.js";
import { openShot } from "./picture-preview.js";
import { refit, toClipboard } from "./terminal-history.js";

const MOUSE_MOTION_ONLY = /\x1b\[<(?:35|39|43|47|51|55|59|63);\d+;\d+[Mm]/g;

const NEWLINE = "\x1b\r";

const openLink = (ev, uri) => { window.open(uri, "_blank", "noopener,noreferrer"); };

const linkAddon = () => new WebLinksAddon(openLink);

const TERM_LOOK = {
  fontFamily: 'Hack, ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1,
  cursorBlink: false,
  allowProposedApi: true,
  linkHandler: { activate: openLink },
  theme: THEME
};

const MIRROR_ECHO_MS = 1500;

let lastClipboard = { text: "", at: 0 };

function clipboardFromSession(text) {
  const now = Date.now();
  if (text === lastClipboard.text && now - lastClipboard.at < MIRROR_ECHO_MS) return;
  lastClipboard = { text, at: now };
  toClipboard(text);
}

const SELECTION_SETTLE_MS = 200;

const COPIED_SHOWN_MS = 1600;

const RAYCAST_TERM_LINE = 1.5;

function sayCopied(term, text) {
  const well = term.element?.closest(".well, .sh-term, .hist") || term.element?.parentElement;
  if (!well) return;
  const lines = text.replace(/\n+$/, "").split("\n").length;
  let pill = well.querySelector(":scope > .term-copied");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "term-copied";
    pill.setAttribute("role", "status");
    well.appendChild(pill);
  }
  pill.innerHTML = `<svg aria-hidden="true"><use href="#i-check"/></svg><b>${phrase("copied")}</b> · ${lines > 1 ? phrase("{n} lines", { n: lines }) : phrase("1 line")}`;
  pill.classList.add("on");
  clearTimeout(pill.hideAt);
  pill.hideAt = setTimeout(() => pill.classList.remove("on"), COPIED_SHOWN_MS);
}

function copyOnSelect(term) {
  let settling = 0;
  term.onSelectionChange(() => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      const text = term.getSelection();
      if (text) toClipboard(text);
      if (text && raycastOn()) sayCopied(term, text);
    }, SELECTION_SETTLE_MS);
  });
}

function wearTerminalLine() {
  const line = raycastOn() ? RAYCAST_TERM_LINE : 1;
  if (TERM_LOOK.lineHeight === line) return;
  TERM_LOOK.lineHeight = line;
  for (const e of pool.values()) {
    e.term.options.lineHeight = line;
    if (e.hist) e.hist.term.options.lineHeight = line;
    refit(e);
  }
}

document.addEventListener("hive:experience", wearTerminalLine);

let termEngine = "ghostty";

function adoptTerminalEngine(r) {
  termEngine = r.config.terminal || "ghostty";
}

function newTerm(look, session) {
  if (termEngine === "xterm") {
    const term = new Terminal(look);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(linkAddon());
    term.registerLinkProvider(imageLinks(term, session));
    return { term, fit };
  }
  const term = new GhosttyTerm({ ...look, linkHandler: { activate: openLink } });
  term.onImage = (path) => openShot(path, session.where, session.name);
  return { term, fit: { fit: () => term.fit() } };
}

const hostClass = (base, term) => (term instanceof GhosttyTerm ? `${base} ghost` : base);

function getTerminal(s) {
  let e = pool.get(s.name);
  if (e) return e;

  const host = document.createElement("div");
  const { term, fit } = newTerm({ ...TERM_LOOK, scrollback: 5000 }, s);
  host.className = hostClass("host", term);
  copyOnSelect(term);
  term.parser.registerOscHandler(52, (payload) => {
    const b64 = String(payload).split(";").pop() || "";
    if (!b64 || b64 === "?") return true;
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      clipboardFromSession(new TextDecoder().decode(bytes));
    } catch {}
    return true;
  });

  e = { term, fit, host, attached: false, ws: null, size: "", where: s.where, name: s.name, root: !!s.root, hist: null, lookingBack: false, loadingBack: false };
  pool.set(s.name, e);
  term.onData((d) => {
    const clean = d.replace(MOUSE_MOTION_ONLY, "");
    if (clean && e.ws?.readyState === 1) e.ws.send(clean);
  });
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown" || ev.key !== "Enter") return true;
    if (!ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return true;
    ev.preventDefault();
    if (e.ws?.readyState === 1) e.ws.send(NEWLINE);
    return false;
  });
  return e;
}

export { adoptTerminalEngine, hostClass, newTerm, MIRROR_ECHO_MS, MOUSE_MOTION_ONLY, NEWLINE, SELECTION_SETTLE_MS, TERM_LOOK, clipboardFromSession, copyOnSelect, getTerminal, lastClipboard, linkAddon, openLink };

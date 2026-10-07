import { GhosttyTerminalSurface } from "/assets/ghostty/ghostty.mjs";

/* The rest of the app speaks the small xterm.js dialect it always spoke —
   write, onData, focus, fit, getSelection. This class answers in that dialect
   with a GhosttyTerminalSurface behind it, so swapping renderers is a config
   flag and not a rewrite. The surface loads WASM asynchronously; everything
   asked before it exists is queued and replayed in order. */

const IMAGE_LINK = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const OSC52_CEILING = 512 * 1024;

const hexColor = (hex) => {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const PALETTE_KEYS = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"
];

/* the surface only takes fg/bg/cursor — the 16 ANSI colors travel as OSC 4,
   the same escape any program would use, straight into the VT parser. */
function paletteSequence(theme) {
  let seq = "";
  PALETTE_KEYS.forEach((key, i) => {
    if (theme[key]) seq += `\x1b]4;${i};${theme[key]}\x1b\\`;
  });
  return seq;
}

const surfaceTheme = (theme) => ({
  foreground: hexColor(theme.foreground),
  background: hexColor(theme.background),
  cursor: hexColor(theme.cursor),
  selectionBackground: theme.selectionBackground || "rgba(120,120,120,0.35)"
});

const RGB = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/;

const toHex = (r, g, b) => "#" + [r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();

function solidColor(css) {
  const m = RGB.exec(String(css || ""));
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return toHex(m[1], m[2], m[3]);
}

function panelBackground(host) {
  for (let el = host; el && el.nodeType === 1; el = el.parentElement) {
    const color = solidColor(getComputedStyle(el).backgroundColor);
    if (color) return color;
  }
  return null;
}

function panelLook(host, theme) {
  const vars = getComputedStyle(host);
  const read = (name) => vars.getPropertyValue(name).trim() || null;
  return {
    ...theme,
    background: panelBackground(host) || theme.background,
    foreground: read("--txt") || theme.foreground,
    cursor: read("--accent") || theme.cursor,
    selectionBackground: read("--accent-bg") || theme.selectionBackground,
    brightBlack: read("--txt-3") || theme.brightBlack
  };
}

export class GhosttyTerm {
  constructor(look = {}) {
    this.look = look;
    this.surface = null;
    this.disposed = false;
    this.onImage = null;
    this.element = null;
    this.worn = "";
    this.pending = [];
    this.decoder = new TextDecoder();
    this.oscCarry = "";
    this.dataCb = null;
    this.selectionCb = null;
    this.keyHandler = null;
    this.oscHandlers = new Map();
    this.parser = { registerOscHandler: (code, cb) => this.oscHandlers.set(code, cb) };
    const term = this;
    this.options = {
      get theme() { return term.look.theme; },
      set theme(t) { term.look.theme = t; term.applyTheme(); },
      get fontFamily() { return term.look.fontFamily; },
      set fontFamily(f) { term.look.fontFamily = f; term.applyFont(); },
      get fontSize() { return term.look.fontSize; },
      set fontSize(s) { term.look.fontSize = s; term.applyFont(); },
      get lineHeight() { return term.look.lineHeight; },
      set lineHeight(h) { term.look.lineHeight = h; }
    };
  }

  open(host) {
    if (this.surface || this.disposed) return;
    this.element = host;
    const mount = document.createElement("div");
    mount.className = "ghost-mount";
    host.append(mount);
    const look = this.look;
    const theme = this.wornTheme();
    GhosttyTerminalSurface.create(mount, {
      theme: surfaceTheme(theme),
      font: { family: look.fontFamily, size: look.fontSize },
      onData: (data) => { if (!look.disableStdin) this.dataCb?.(data); },
      onResize: () => {},
      onSelectionChange: () => this.selectionCb?.(),
      beforeKey: (ev) => (look.disableStdin ? false : this.keyHandler ? this.keyHandler(ev) : true),
      onLinkActivate: (text, ev) => this.activateLink(text, ev)
    }).then((surface) => {
      if (this.disposed) return surface.dispose();
      this.surface = surface;
      const seq = paletteSequence(this.wornTheme());
      if (seq) surface.write(seq);
      const queued = this.pending;
      this.pending = [];
      for (const run of queued) run();
    }).catch((error) => console.error("the ghostty terminal never woke up", error));
  }

  ready(run) {
    if (this.disposed) return;
    if (this.surface) run();
    else this.pending.push(run);
  }

  activateLink(text, ev) {
    if (IMAGE_LINK.test(text)) return this.onImage?.(text, ev);
    if (/^https?:\/\//i.test(text)) return this.look.linkHandler?.activate?.(ev, text);
  }

  wornTheme() {
    const theme = this.look.theme || {};
    const worn = this.element ? panelLook(this.element, theme) : theme;
    this.worn = JSON.stringify(worn);
    return worn;
  }

  applyTheme() {
    this.ready(() => {
      const theme = this.wornTheme();
      this.surface.setTheme(surfaceTheme(theme));
      const seq = paletteSequence(theme);
      if (seq) this.surface.write(seq);
    });
  }

  followPanel() {
    if (!this.surface || !this.element) return;
    const before = this.worn;
    const theme = this.look.theme || {};
    if (JSON.stringify(panelLook(this.element, theme)) !== before) this.applyTheme();
  }

  applyFont() {
    this.ready(() => void this.surface.setFont({ family: this.look.fontFamily, size: this.look.fontSize }));
  }

  /* OSC 52 never reaches the WASM parser's clipboard — the app owns the
     clipboard, so the sequence is fished out of the stream here, split
     chunks included, and handed to whoever registered for it. */
  siftOsc52(text) {
    const handler = this.oscHandlers.get(52);
    if (!handler) return text;
    let s = this.oscCarry + text;
    this.oscCarry = "";
    let out = "";
    for (;;) {
      const at = s.indexOf("\x1b]52;");
      if (at < 0) { out += s; break; }
      out += s.slice(0, at);
      const bel = s.indexOf("\x07", at);
      const st = s.indexOf("\x1b\\", at);
      const end = bel < 0 ? st : st < 0 ? bel : Math.min(bel, st);
      if (end < 0) {
        if (s.length - at <= OSC52_CEILING) this.oscCarry = s.slice(at);
        else out += s.slice(at);
        break;
      }
      handler(s.slice(at + 5, end));
      s = s.slice(end + (end === bel ? 1 : 2));
    }
    return out;
  }

  write(data, done) {
    const text = typeof data === "string" ? data : this.decoder.decode(data, { stream: true });
    const sifted = this.siftOsc52(text);
    this.ready(() => { this.surface.write(sifted); done?.(); });
  }

  reset() {
    this.oscCarry = "";
    this.ready(() => {
      this.surface.resetAndWrite("");
      const seq = paletteSequence(this.wornTheme());
      if (seq) this.surface.write(seq);
    });
  }

  onData(cb) { this.dataCb = cb; }
  onSelectionChange(cb) { this.selectionCb = cb; }
  attachCustomKeyEventHandler(cb) { this.keyHandler = cb; }
  registerLinkProvider() {}
  loadAddon() {}

  fit() {
    if (!this.surface) return;
    this.followPanel();
    this.surface.fit();
  }
  focus() { this.surface?.focus(); }
  blur() { this.surface?.input.blur(); }
  getSelection() { return this.surface?.getSelection() || ""; }
  hasSelection() { return !!this.getSelection(); }
  scrollToBottom() { this.surface?.scrollToBottom(); }

  scrollLines(rows) {
    const surface = this.surface;
    if (!surface) return;
    surface.core.scroll(rows);
    surface.scrollbarDirty = true;
    surface.forceFullRender = true;
    surface.requestRender();
  }

  atBottom() {
    try { return this.surface ? this.surface.core.isViewportActive() : true; } catch { return true; }
  }

  get cols() { return this.surface?.cols || 0; }
  get rows() { return this.surface?.rows || 0; }

  get modes() {
    let tracking = false;
    try { tracking = !!this.surface?.core.isMouseTracking(); } catch {}
    return { mouseTrackingMode: tracking ? "any" : "none" };
  }

  dispose() {
    this.disposed = true;
    this.pending = [];
    this.surface?.dispose();
    this.surface = null;
  }
}

import { $, fontFromPanel, phrase, st, withTail } from "./core.js";
import { saveConfig } from "./brand-face.js";
import { applyFonts, applyTheme } from "./shared.js";
import { paintAppearanceChoice, setAppearance } from "./themes.js";
import { adoptTuning } from "./appearance.js";

const AREA_FIELDS = { "f-font-prompt": "prompt", "f-font-code": "code", "f-font-terminal": "terminal" };

const AREA_SIZES = { "f-font-prompt-size": "promptSize", "f-font-code-size": "codeSize" };

st.fontAreasOpen = false;

const hasAreas = (font) => !!font && ["prompt", "code", "terminal", "promptSize", "codeSize"].some((field) => font[field] !== undefined);

function paintFlip(id, sayId, on, words) {
  const flip = $(id);
  if (!flip) return;
  flip.textContent = on ? "on" : "off";
  flip.classList.toggle("on", on);
  flip.setAttribute("aria-pressed", on ? "true" : "false");
  if ($(sayId)) $(sayId).textContent = phrase(on ? words[0] : words[1]);
}

const fill = (id, value) => {
  const el = $(id);
  if (el && el !== document.activeElement) el.value = value;
};

function paintAppearancePanel() {
  if (!$("f-contrast")) return;
  paintAppearanceChoice();
  fill("f-contrast", String(st.contrast || 0));
  $("f-contrast-n").textContent = st.contrast ? `+${st.contrast}%` : "0";
  fill("f-glass", st.glass === null || st.glass === undefined ? "auto" : String(st.glass));
  fill("f-chat-width", String(st.chatWidth ?? "auto"));
  fill("f-panel-speed", String(st.panelMotion || 0));
  $("f-panel-speed-n").textContent = `${st.panelMotion || 0} ms`;
  const font = st.fontPrefs || {};
  const open = st.fontAreasOpen || hasAreas(font);
  paintFlip("t-font-areas", "s-font-areas-say", open, ["one font for each area", "one monospace for all"]);
  $("font-areas").hidden = !open;
  for (const [id, field] of Object.entries(AREA_FIELDS)) fill(id, font[field] || "");
  for (const [id, field] of Object.entries(AREA_SIZES)) fill(id, font[field] ? String(font[field]) : "");
  paintFlip("t-font-thin", "s-font-thin-say", font.smoothing === "thin", ["thinner text", "the system's text"]);
  paintFontPreview(font);
}

function paintFontPreview(font) {
  const box = $("font-preview");
  if (!box) return;
  const area = (cls, family, size) => {
    const el = box.querySelector(cls);
    el.style.fontFamily = family ? withTail(family, "mono") : "";
    el.style.fontSize = size ? `${size}px` : "";
  };
  area(".fp-prompt", font.prompt, font.promptSize);
  area(".fp-code", font.code, font.codeSize);
  area(".fp-term", font.terminal, 0);
  box.classList.toggle("thin", font.smoothing === "thin");
}

function tune(patch) {
  adoptTuning({ contrast: st.contrast, glass: st.glass, panelMotion: st.panelMotion, chatWidth: st.chatWidth, ...patch });
  applyTheme();
  paintAppearancePanel();
  saveConfig(patch).catch(() => {});
}

function saveFonts(change) {
  if (!st.fontPrefs || !st.fontDefaults) return;
  const next = { ...st.fontPrefs };
  change(next);
  for (const field of Object.keys(next)) if (next[field] === undefined || next[field] === "") delete next[field];
  st.fontPrefs = next;
  const font = fontFromPanel();
  for (const field of ["prompt", "code", "terminal", "promptSize", "codeSize", "smoothing"]) {
    if (next[field] === undefined) delete font[field];
    else font[field] = next[field];
  }
  applyFonts(font);
  paintAppearancePanel();
  saveConfig({ font }).catch(() => {});
}

$("f-appearance")?.addEventListener("change", (event) => setAppearance(event.target.value));

$("f-contrast")?.addEventListener("input", (event) => {
  st.contrast = Number(event.target.value) || 0;
  $("f-contrast-n").textContent = st.contrast ? `+${st.contrast}%` : "0";
  adoptTuning({ contrast: st.contrast, glass: st.glass, panelMotion: st.panelMotion, chatWidth: st.chatWidth });
  applyTheme();
});

$("f-contrast")?.addEventListener("change", (event) => tune({ contrast: Number(event.target.value) || 0 }));

$("f-glass")?.addEventListener("change", (event) => tune({ glass: event.target.value === "auto" ? null : Number(event.target.value) }));

$("f-chat-width")?.addEventListener("change", (event) => {
  const raw = event.target.value;
  tune({ chatWidth: raw === "auto" || raw === "full" ? raw : Number(raw) });
});

$("f-panel-speed")?.addEventListener("input", (event) => { $("f-panel-speed-n").textContent = `${Number(event.target.value) || 0} ms`; });

$("f-panel-speed")?.addEventListener("change", (event) => tune({ panelMotion: Number(event.target.value) || 0 }));

$("t-font-areas")?.addEventListener("click", () => {
  const open = st.fontAreasOpen || hasAreas(st.fontPrefs);
  st.fontAreasOpen = !open;
  if (!open) {
    paintAppearancePanel();
    $("f-font-prompt")?.focus();
    return;
  }
  saveFonts((font) => { for (const field of ["prompt", "code", "terminal", "promptSize", "codeSize"]) delete font[field]; });
});

$("t-font-thin")?.addEventListener("click", () => saveFonts((font) => { font.smoothing = font.smoothing === "thin" ? undefined : "thin"; }));

for (const [id, field] of Object.entries(AREA_FIELDS)) {
  $(id)?.addEventListener("change", (event) => saveFonts((font) => { font[field] = event.target.value.trim() || undefined; }));
}

for (const [id, field] of Object.entries(AREA_SIZES)) {
  $(id)?.addEventListener("change", (event) => {
    const size = Number(event.target.value);
    const [low, high] = [Number(event.target.min), Number(event.target.max)];
    saveFonts((font) => { font[field] = event.target.value !== "" && size >= low && size <= high ? Math.round(size) : undefined; });
  });
}

export { paintAppearancePanel };

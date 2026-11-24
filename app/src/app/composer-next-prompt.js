import { seatAgent } from "./chat-and-panes.js";
import { saveConfig } from "./brand-face.js";
import { $, phrase, st } from "./core.js";
import { addPlaceholder } from "./composer-actions.js";
import { composerMode, onComposerMode, paintComposer } from "./composer-modes.js";
import { onSeatEvent } from "./seat-events.js";
import { structPool } from "./structured-seats.js";

const TAB_HINT = "⇥ Tab";

const IME_KEY_CODE = 229;

const dismissed = new Set();

const suggestionsOn = () => st.promptSuggestions === true;

function touchOnly() {
  try {
    return matchMedia("(any-pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  } catch {
    return false;
  }
}

function hasChips(e) {
  const snap = e.box?.snapshot?.();
  return !!snap && (snap.images.length > 0 || snap.quotes.length > 0);
}

function offeredNextPrompt(e, mode = composerMode(e)) {
  const said = e?.nextPrompt;
  if (!said?.text || mode !== "idle" || e.sending || !suggestionsOn() || touchOnly()) return "";
  if (dismissed.has(said.key) || hasChips(e)) return "";
  return said.text;
}

const startsATurn = (ev) => (ev.type === "user" && ev.subtype === "say") || (ev.type === "driver" && ev.subtype === "turn_started");

function seatIsAnonymous(e) {
  return !!(st.data?.sessions || []).find((one) => one.name === e.name)?.anon;
}

function guessable(e) {
  return suggestionsOn() && !!e.host?.isConnected && !e.mirror && !e.draft && (e.where || "local") === "local"
    && seatAgent(e) !== "claude" && !seatIsAnonymous(e);
}

async function guessNextPrompt(e) {
  const ticket = e.nextPromptTicket;
  const answer = await fetch("/api/next-prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: e.name, where: e.where || "local" })
  }).then((r) => r.json()).catch(() => null);
  const text = String(answer?.text || "").trim();
  if (!text || ticket !== e.nextPromptTicket || e.turnOpen) return;
  e.nextPrompt = { text, key: `${e.name}:guess:${ticket}` };
  paintComposer(e);
}

function noteNextPrompt(e, ev) {
  if (!e || !ev) return;
  if (ev.type === "prompt_suggestion") {
    const text = String(ev.suggestion || "").trim();
    if (!text || (e.turnOpen && !ev.replayed)) return;
    e.nextPrompt = { text, key: `${e.name}:${ev.seq || ev.uuid || text}` };
    return void paintComposer(e);
  }
  if (startsATurn(ev)) {
    e.nextPromptTicket = (e.nextPromptTicket || 0) + 1;
    if (!ev.replayed) e.nextPromptLive = true;
    if (!e.nextPrompt) return;
    e.nextPrompt = null;
    return void paintComposer(e);
  }
  if (ev.type !== "result" || ev.replayed || !e.nextPromptLive) return;
  e.nextPromptLive = false;
  if (guessable(e)) guessNextPrompt(e);
}

function acceptNextPrompt(e) {
  const text = offeredNextPrompt(e);
  const textarea = e?.box?.textarea;
  if (!text || !textarea || textarea.value) return false;
  textarea.focus();
  textarea.setSelectionRange(0, 0);
  let typed = false;
  try { typed = document.execCommand?.("insertText", false, text) === true && textarea.value === text; } catch {}
  if (!typed) {
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  textarea.setSelectionRange(text.length, text.length);
  return true;
}

function dismissNextPrompt(e) {
  if (!offeredNextPrompt(e)) return false;
  dismissed.add(e.nextPrompt.key);
  paintComposer(e);
  return true;
}

function ghostOf(e, form) {
  const well = form.querySelector(".sv-well");
  if (!well) return null;
  const held = well.querySelector(":scope > .cp-ghost");
  if (held) return held;
  const ghost = document.createElement("div");
  ghost.className = "sv-ink cp-ghost";
  ghost.innerHTML = `<span class="cp-ghost-text" aria-hidden="true"></span><button type="button" class="cp-ghost-tab" tabindex="-1"><kbd></kbd></button>`;
  const tab = ghost.querySelector(".cp-ghost-tab");
  tab.addEventListener("pointerdown", (ev) => ev.preventDefault());
  tab.addEventListener("mousedown", (ev) => ev.preventDefault());
  tab.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    acceptNextPrompt(e);
  });
  well.append(ghost);
  well.querySelector("textarea")?.addEventListener("input", () => paintGhost(e, form, composerMode(e)));
  return ghost;
}

function paintGhost(e, form, mode) {
  const text = offeredNextPrompt(e, mode);
  const textarea = form.querySelector(".sv-well textarea");
  const shown = !!text && !!textarea && !textarea.value;
  const held = form.querySelector(".sv-well > .cp-ghost");
  if (!shown) {
    if (held) held.hidden = true;
    return;
  }
  const ghost = held || ghostOf(e, form);
  if (!ghost) return;
  ghost.hidden = false;
  ghost.querySelector(".cp-ghost-text").textContent = text;
  const tab = ghost.querySelector(".cp-ghost-tab");
  const label = phrase("Use suggested prompt");
  if (tab.getAttribute("aria-label") !== label) {
    tab.setAttribute("aria-label", label);
    tab.title = label;
  }
  tab.querySelector("kbd").textContent = TAB_HINT;
}

function seatOfBox(target) {
  if (!target || target.tagName !== "TEXTAREA") return null;
  for (const e of structPool.values()) if (e.box?.textarea === target) return e;
  return null;
}

const menuOpen = (e) => !!e.host?.querySelector(".sv-suggest:not([hidden])");

function nextPromptKeys(ev) {
  if (ev.isComposing || ev.keyCode === IME_KEY_CODE) return;
  if (ev.key !== "Tab" && ev.key !== "Escape") return;
  if (ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey) return;
  const e = seatOfBox(ev.target);
  if (!e || e.box.textarea.value || menuOpen(e) || !offeredNextPrompt(e)) return;
  const took = ev.key === "Tab" ? acceptNextPrompt(e) : dismissNextPrompt(e);
  if (!took) return;
  ev.preventDefault();
  ev.stopPropagation();
}

function paintPromptSuggestions() {
  const flip = $("t-prompt-suggestions");
  if (!flip) return;
  const on = suggestionsOn();
  flip.textContent = on ? "on" : "off";
  flip.classList.toggle("on", on);
  flip.setAttribute("aria-pressed", on ? "true" : "false");
  const said = $("s-prompt-suggestions-say");
  if (said) said.textContent = on ? phrase("a guess of your next message waits in the empty composer") : phrase("the empty composer waits for you");
}

function repaintSeats() {
  for (const e of structPool.values()) if (e.host?.isConnected) paintComposer(e);
}

function adoptPromptSuggestions(r) {
  st.promptSuggestions = r?.config?.promptSuggestions === true;
  paintPromptSuggestions();
  repaintSeats();
}

function setPromptSuggestions(on) {
  st.promptSuggestions = on === true;
  paintPromptSuggestions();
  repaintSeats();
  saveConfig({ promptSuggestions: st.promptSuggestions }).then((r) => adoptPromptSuggestions(r)).catch(() => {});
}

function promptSuggestionRows() {
  return [{
    icon: "i-answered",
    name: phrase("Suggest next prompt"),
    on: suggestionsOn(),
    ctx: phrase("after each answer, a guess of your next message in the empty composer — Tab takes it, Esc drops it, nothing is sent on its own"),
    search: "suggest next prompt sugerir próximo prompt tab autocomplete ghost",
    go: () => setPromptSuggestions(!suggestionsOn())
  }];
}

onSeatEvent(noteNextPrompt);

queueMicrotask(() => {
  addPlaceholder((e, mode) => offeredNextPrompt(e, mode));
  onComposerMode({ paint: paintGhost });
});

if (typeof window !== "undefined") window.addEventListener("keydown", nextPromptKeys, true);

if (typeof document !== "undefined") document.getElementById("t-prompt-suggestions")?.addEventListener("click", () => setPromptSuggestions(!suggestionsOn()));

export { acceptNextPrompt, adoptPromptSuggestions, dismissNextPrompt, noteNextPrompt, offeredNextPrompt, paintPromptSuggestions, promptSuggestionRows, setPromptSuggestions };

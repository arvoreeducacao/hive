import { phrase, st } from "./core.js";
import { hud } from "./hud.js";
import { captureKey } from "./leader-key.js";
import { run } from "./themes.js";
import { openRelnotes, pullUpdate, versionOf } from "./tour.js";

let told = "";

function menuSaid() {
  const help = st.keys?.help || null;
  return {
    words: { settings: phrase("Settings…"), updates: phrase("Check for Updates…") },
    settingsKey: help && !help.then ? { code: help.code, meta: !!help.meta, ctrl: !!help.ctrl, alt: !!help.alt, shift: !!help.shift } : null
  };
}

function tellMenu() {
  if (!window.hiveMenu?.words) return false;
  const said = menuSaid();
  const text = JSON.stringify(said);
  if (text === told) return false;
  told = text;
  window.hiveMenu.words(said);
  return true;
}

function pressOf(binding) {
  return new KeyboardEvent("keydown", { key: binding.code, code: binding.code, metaKey: !!binding.meta, ctrlKey: !!binding.ctrl, altKey: !!binding.alt, shiftKey: !!binding.shift, cancelable: true });
}

async function checkForUpdates() {
  await pullUpdate(true);
  const now = st.updateState || {};
  if ((now.behind || 0) > 0 || st.held) return openRelnotes();
  const mine = now.mine || {};
  return hud({ icon: "i-check", text: phrase("Hive is up to date"), mono: versionOf(mine.tag, mine.number) || (mine.sha || "").slice(0, 7) });
}

function menuAct(what) {
  if (what === "settings") {
    if (st.capturing && st.keys?.help) return captureKey(pressOf(st.keys.help));
    return run("help");
  }
  if (what === "updates") return checkForUpdates();
  return null;
}

window.hiveMenu?.hear?.((what) => { menuAct(what); });

export { checkForUpdates, menuAct, menuSaid, tellMenu };

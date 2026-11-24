import { saveConfig } from "./brand-face.js";
import { $, IS_MAC, esc, phrase } from "./core.js";
import { FOLLOW_UPS, SEND_SHORTCUTS, followUp, sendShortcut, setFollowUp, setSendShortcut } from "./composer-modes.js";

const SEND_SHORTCUT_KEY = "hive.sendShortcut";

const FOLLOW_UP_KEY = "hive.followUp";

const MODIFIER = IS_MAC ? "⌘" : "Ctrl";

const SEND_SHORTCUT_NAMES = {
  enter: () => phrase("Enter"),
  "mod-enter-multiline": () => phrase("{modifierLabel} + Enter for multiline prompts", { modifierLabel: MODIFIER }),
  "mod-enter": () => phrase("{modifierLabel} + Enter always", { modifierLabel: MODIFIER })
};

const FOLLOW_UP_NAMES = { queue: () => phrase("Queue"), steer: () => phrase("Steer the current run") };

function followUpSaid(shortcut = sendShortcut()) {
  if (shortcut === "mod-enter") return phrase("Queue follow-ups while the agent runs or steer the current run. Press {modifier} + Shift + Enter to do the opposite for one message.", { modifier: MODIFIER });
  if (shortcut === "mod-enter-multiline") return phrase("Queue follow-ups while the agent runs or steer the current run. Press {modifier} + Enter for single-line prompts or {modifier} + Shift + Enter for multiline prompts to do the opposite for one message.", { modifier: MODIFIER });
  return phrase("Queue follow-ups while the agent runs or steer the current run. Press {modifier} + Enter to do the opposite for one message.", { modifier: MODIFIER });
}

const options = (ids, names, worn) => ids.map((id) => `<option value="${esc(id)}"${id === worn ? " selected" : ""}>${esc(names[id]())}</option>`).join("");

function paintComposerPrefs() {
  const shortcut = $("f-send-shortcut");
  const follow = $("f-follow-up");
  if (shortcut) {
    shortcut.innerHTML = options(SEND_SHORTCUTS, SEND_SHORTCUT_NAMES, sendShortcut());
    shortcut.value = sendShortcut();
  }
  if (follow) {
    follow.innerHTML = options(FOLLOW_UPS, FOLLOW_UP_NAMES, followUp());
    follow.value = followUp();
  }
  const said = $("f-follow-up-say");
  if (said) said.textContent = followUpSaid();
}

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function chooseSendShortcut(value, quiet = false) {
  setSendShortcut(value);
  remember(SEND_SHORTCUT_KEY, sendShortcut());
  paintComposerPrefs();
  if (!quiet) saveConfig({ sendShortcut: sendShortcut() }).catch(() => {});
}

function chooseFollowUp(value, quiet = false) {
  setFollowUp(value);
  remember(FOLLOW_UP_KEY, followUp());
  paintComposerPrefs();
  if (!quiet) saveConfig({ followUp: followUp() }).catch(() => {});
}

function bootComposerPrefs() {
  let shortcut = "";
  let follow = "";
  try {
    shortcut = localStorage.getItem(SEND_SHORTCUT_KEY) || "";
    follow = localStorage.getItem(FOLLOW_UP_KEY) || "";
  } catch {}
  if (shortcut) setSendShortcut(shortcut);
  if (follow) setFollowUp(follow);
  paintComposerPrefs();
}

function adoptComposerPrefs(r) {
  if (r?.has?.sendShortcut && r.config.sendShortcut !== sendShortcut()) chooseSendShortcut(r.config.sendShortcut, true);
  if (r?.has?.followUp && r.config.followUp !== followUp()) chooseFollowUp(r.config.followUp, true);
}

$("f-send-shortcut")?.addEventListener("change", (ev) => chooseSendShortcut(ev.target.value));
$("f-follow-up")?.addEventListener("change", (ev) => chooseFollowUp(ev.target.value));

queueMicrotask(bootComposerPrefs);

export { FOLLOW_UP_KEY, SEND_SHORTCUT_KEY, adoptComposerPrefs, bootComposerPrefs, chooseFollowUp, chooseSendShortcut, followUpSaid, paintComposerPrefs };

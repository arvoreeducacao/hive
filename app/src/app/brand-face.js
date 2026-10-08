import { render } from "./arrange.js";
import { saveAvatar } from "./avatars.js";
import { adoptNotices, setAnswered, setKnocks, setSound } from "./chimes-and-notices.js";
import { $, BLOB_FACE, CODE_NAME, IS_MAC, WEAR, nearestFree, overrides, paintFonts, parseWear, phrase, solidMounts, st } from "./core.js";
import { literalOf, paintKeys } from "./leader-key.js";
import { paintRail } from "./mirror.js";
import { adoptExperience } from "./experience.js";
import { adoptBrandFace, adoptGaze, adoptLanguage, adoptLook, adoptPet } from "./preferences.js";
import { adoptStructure } from "./structure.js";
import { adoptAutocompact, adoptCalm, adoptDiaryDays, adoptPrefs, adoptQuietDays } from "./pure-helpers.js";
import { adoptBlockSize, adoptLayout } from "./seat-layout.js";
import { adoptTerminalEngine } from "./terminal-pool.js";
import { adoptAvatar, adoptTheme, applyBindings, applyFonts, migrateStoredSound } from "./shared.js";
import { takenSlots } from "./team.js";
import { facePickerViewModel, myFaceSvg, ownerOfSlot, paintAvatar, rollAvatar, wAvatar } from "./welcome.js";

st.faceAsked = false;

st.configRead = false;

st.configHas = {};

st.gateSaid = "";

const faceIsSettled = () => !!st.configHas.avatar;

/* a piece is written the moment it is picked. the settings used to change the face on screen and
   write nothing, so the next launch read the old config back — what people called the face
   "resetting". while the gate is up the keep button is the one write, so nothing lands early. */
function pickWear(slot, value) {
  const worn = { ...(st.myWear || {}) };
  if (value === "none") delete worn[slot];
  else worn[slot] = value;
  st.myWear = parseWear(worn);
  return wearChanged();
}

function stripWear() {
  st.myWear = {};
  return wearChanged();
}

async function wearChanged() {
  paintAvatar();
  paintGate();
  if (!$("face-gate")?.hidden) return false;
  const written = await saveAvatar({ quiet: true });
  /* the write carries the face too, so a piece of clothing is what settles it as well */
  if (written) st.configHas.avatar = true;
  return written;
}

function pickFace(part, value) {
  if (!part || !value) return;
  if (WEAR[part]) return pickWear(part, value);
  if (part === "style") {
    st.myBlob = value === BLOB_FACE;
    if (!st.myBlob && !st.myFace) st.myFace = nearestFree(wAvatar(), takenSlots());
  } else {
    const next = { ...wAvatar(), [part]: value };
    if (part !== "face" && ownerOfSlot(next)) return;
    st.myFace = next;
  }
  paintAvatar();
  paintGate();
  if (!$("face-gate")?.hidden || !$("face-sheet")?.hidden) return;
  return saveAvatar();
}

function offerFace() {
  if (st.faceAsked || !st.configRead || faceIsSettled() || !st.team.me) return;
  if (!$("welcome")?.hidden) return;
  st.faceAsked = true;
  const box = $("face-gate");
  box.hidden = false;
  gateClicks(box);
  paintGate();
}

function paintGate() {
  const box = $("face-gate");
  if (!box || box.hidden) return;
  gateSolid.show(gateViewModel());
}

let gateSolid = null;

function gateViewModel() {
  return {
    mug: myFaceSvg("gate"),
    head: phrase("Pick the face the team will know you by"),
    say: phrase("It is yours alone — nobody else can take the same body and colour; what it wears is free. Asked once: after this, the face at the top of the window is where you change it."),
    rows: facePickerViewModel(),
    keep: phrase("This one is me"),
    roll: phrase("Another"),
    bad: st.gateSaid || ""
  };
}

solidMounts.push((hive) => {
  const box = $("face-gate");
  if (box) gateSolid = hive.mountGate(box);
});

function gateClicks(box) {
  if (box.dataset.bound === "1") return;
  box.dataset.bound = "1";
  box.addEventListener("click", onGateClick);
}

async function onGateClick(e) {
  const b = e.target.closest("[data-fg], [data-w]");
  if (!b) return;
  if (b.dataset.fg === "roll") { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); paintAvatar(); return paintGate(); }
  if (b.dataset.w === "face-set") return pickFace(b.dataset.part, b.dataset.value);
  if (b.dataset.fg !== "keep") return;
  b.disabled = true;
  st.myFace = wAvatar();
  /* the gate used to close on the click and mark itself settled whether or not the write landed.
     a write that never landed leaves nothing in the config, so the next launch asks again — and
     the person has already answered, so being asked again reads as the app not listening. the
     answer counts once it is in the file, and until then the gate stays and says so. */
  if (!(await saveAvatar())) {
    st.gateSaid = phrase("your face could not be saved to {n} — nothing changed", { n: st.configPath });
    b.disabled = false;
    return paintGate();
  }
  st.gateSaid = "";
  st.configHas.avatar = true;
  $("face-gate").hidden = true;
  paintRail();
}

async function reloadConfig() {
  try {
    const r = await (await fetch("/api/config")).json();
    if (r.file) st.configPath = r.file;
    if (r.error) return;
    st.configIgnored = r.ignored || "";
    st.fontDefaults = r.defaults.font;
    adoptExperience(r);
    adoptLook(r);
    applyFonts(r.config.font);
    applyBindings(r.config.keys);
    if (r.config.sound !== st.sound) setSound(r.config.sound, true);
    if (r.config.answered !== st.answeredAlert) setAnswered(r.config.answered, true);
    if (r.config.knocks !== st.teamKnocks) setKnocks(r.config.knocks, true);
    adoptNotices(r);
    migrateStoredSound(r);
    adoptLayout(r);
    adoptTerminalEngine(r);
    adoptStructure(r);
    adoptBlockSize(r);
    adoptPrefs(r);
    adoptCalm(r);
    adoptAutocompact(r);
    adoptQuietDays(r);
    adoptDiaryDays(r);
    adoptTheme(r);
    adoptLanguage(r);
    adoptPet(r);
    adoptBrandFace(r);
    adoptGaze(r);
    adoptAvatar(r);
    paintKeys();
    paintFonts();
    render();
  } catch {}
}

function saveConfig(patch) {
  return fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: patch })
  }).then((r) => r.json());
}

const saveBindings = () => saveConfig({ keys: overrides() });

function keyLabel(b, digit, many) {
  if (!b) return "—";
  const mods = [];
  if (b.ctrl) mods.push(IS_MAC ? "⌃" : "Ctrl");
  if (b.alt) mods.push(IS_MAC ? "⌥" : "Alt");
  if (b.shift) mods.push(IS_MAC ? "⇧" : "Shift");
  if (b.meta) mods.push(IS_MAC ? "⌘" : "Win");
  let key;
  if (b.code === "Digit") key = digit ?? `1…${many ?? st.LIMIT}`;
  else if (b.code.startsWith("Key")) key = b.code.slice(3);
  else if (/^Digit\d$/.test(b.code)) key = b.code.slice(5);
  else key = CODE_NAME[b.code] || b.code;
  return IS_MAC ? mods.join("") + key : [...mods, key].join("+");
}

const modsMatch = (b, e) => e.altKey === !!b.alt && e.ctrlKey === !!b.ctrl && e.shiftKey === !!b.shift && e.metaKey === !!b.meta;

const codeOf = (e) => (e.code === "NumpadEnter" ? "Enter" : e.code);

const hasMod = (b) => !!(b && (b.alt || b.ctrl || b.meta));

const isLeader = (e) => !!st.leader && codeOf(e) === st.leader.code && modsMatch(st.leader, e);

const silenced = (a) => !!st.leader && st.directMode === "off" && !!st.chords[a] && hasMod(st.keys[a]) && !!literalOf(st.keys[a]);

const shiftPicksCase = (b) => /^Key[A-Z]$/.test(b.code || "");

const chordMods = (b, e) => e.altKey === !!b.alt && e.ctrlKey === !!b.ctrl && e.metaKey === !!b.meta
  && (shiftPicksCase(b) ? e.shiftKey === !!b.shift : (!b.shift || e.shiftKey));

function whichChord(e) {
  const shiftedFirst = Object.entries(st.chords).sort(([, x], [, y]) => !!y?.shift - !!x?.shift);
  for (const [a, b] of shiftedFirst) {
    if (!b) continue;
    if (b.code === "Digit") {
      const m = codeOf(e).match(/^Digit([1-9])$/);
      if (m && chordMods(b, e)) return { action: a, digit: Number(m[1]) };
    } else if (codeOf(e) === b.code && chordMods(b, e)) return { action: a };
  }
  return null;
}

function whichAction(e) {
  for (const [a, b] of Object.entries(st.keys)) {
    if (!b || silenced(a)) continue;
    if (b.code === "Digit") {
      const m = codeOf(e).match(/^Digit([1-9])$/);
      if (m && modsMatch(b, e)) return { action: a, digit: Number(m[1]) };
    } else if (codeOf(e) === b.code && modsMatch(b, e)) return { action: a };
  }
  return null;
}

export { chordMods, codeOf, faceIsSettled, gateClicks, gateSolid, gateViewModel, hasMod, isLeader, keyLabel, modsMatch, offerFace, onGateClick, paintGate, pickFace, pickWear, reloadConfig, saveBindings, saveConfig, shiftPicksCase, silenced, stripWear, whichAction, whichChord };

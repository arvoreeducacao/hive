import { paintExperience } from "./experience.js";
import { render } from "./arrange.js";
import { mugFace } from "./avatars.js";
import { saveConfig } from "./brand-face.js";
import { $, DEFAULT_LANGUAGE, IS_MAC, LANGUAGES, mountPet, paintFonts, paintStatic, phrase, raycastOn, solidMounts, speak, st } from "./core.js";
import { paintKeys } from "./leader-key.js";
import { calmly, paintCalm, paintPrefs, visualWorn, whenMotionChanges } from "./pure-helpers.js";
import { LAYOUTS, LAYOUT_NAMES } from "./seat-layout.js";
import { paintStructureChoices } from "./structure.js";
import { paintThemes } from "./themes.js";
import { paintBrandAvatar } from "./welcome.js";

const LANG_KEY = "hive.lang";

const PET_KEY = "hive.littleYou";

const PET_OFF = "off";

const PET_ON = "blob";

const PET_NAMES = { [PET_ON]: "the little you", [PET_OFF]: "none, thanks" };

const BRAND_KEY = "hive.brandFace";

const BRAND_DEFAULT = "auto";

const BRAND_NAMES = { always: "always", auto: "not when the rail wears it", never: "never" };

const GAZE_KEY = "hive.gaze";

const GAZE_DEFAULT = "screen";

const GAZE_NAMES = { off: "no, let it be", window: "inside this window", screen: "anywhere on the screen" };

const PET_SWITCH = [
  { on: true, name: "the little you, on" },
  { on: false, name: "the little you, off" }
];

st.language = DEFAULT_LANGUAGE;

st.petChoice = "";

let brandFace = BRAND_DEFAULT;

st.gazeMode = GAZE_DEFAULT;

let farAt = null;

if (window.hiveGaze) window.hiveGaze.hear((point) => { farAt = point; });

const brandWanted = () => brandFace === "always" || (brandFace === "auto" && st.petChoice === PET_OFF);

const gazeReach = () => {
  if (st.gazeMode === "off") return 0;
  if (st.gazeMode === "screen") return Math.hypot(screen.width, screen.height) / 2;
  return Math.hypot(innerWidth, innerHeight) / 2;
};

function watchFarCursor() {
  const wants = st.gazeMode === "screen" && st.petChoice !== PET_OFF && !calmly();
  if (!wants) farAt = null;
  window.hiveGaze?.watch(wants);
}

function bootBrandFace() {
  let saved = "";
  try { saved = localStorage.getItem(BRAND_KEY) || ""; } catch {}
  setBrandFace(BRAND_NAMES[saved] ? saved : BRAND_DEFAULT, true);
}

function setBrandFace(choice, quiet) {
  brandFace = BRAND_NAMES[choice] ? choice : BRAND_DEFAULT;
  try { localStorage.setItem(BRAND_KEY, brandFace); } catch {}
  paintBrandAvatar();
  paintChoices();
  if (quiet) return;
  saveConfig({ brandFace }).catch(() => {});
}

const LOOK_DEFAULT = "classic";

const LOOK_NAMES = { classic: "classic, as it was", dimension: "dimension, the new one" };

const VISUAL_NAMES = { lean: "lean: nothing moves, no blur", full: "full: motion and blur, costs memory and battery" };

const WINDOW_BUTTON_SIZE = 12;

const WINDOW_BUTTON_INSET = 12;

function windowButtonsSpot(look, top) {
  if (look !== "dimension" || !top || !(top.height > 0)) return null;
  return { x: Math.round(top.left + WINDOW_BUTTON_INSET), y: Math.round(top.top + (top.height - WINDOW_BUTTON_SIZE) / 2) };
}

let windowButtonsSent;

function placeWindowButtons() {
  if (!IS_MAC || !window.hiveWindow?.placeButtons) return;
  const spot = raycastOn() ? raycastButtonsSpot($("top")?.getBoundingClientRect()) : windowButtonsSpot(st.look, $("top")?.getBoundingClientRect());
  const said = JSON.stringify(spot);
  if (said === windowButtonsSent) return;
  windowButtonsSent = said;
  window.hiveWindow.placeButtons(spot);
}

const RAYCAST_BUTTON_INSET = 16;

function raycastButtonsSpot(top) {
  if (!top || !(top.height > 0)) return null;
  return { x: Math.round(top.left + RAYCAST_BUTTON_INSET), y: Math.round(top.top + (top.height - WINDOW_BUTTON_SIZE) / 2) };
}

const windowButtonsMovable = () => IS_MAC && !!window.hiveWindow?.placeButtons;

function setLook(choice, quiet) {
  st.look = LOOK_NAMES[choice] ? choice : LOOK_DEFAULT;
  document.body.classList.toggle("look-dimension", st.look === "dimension");
  placeWindowButtons();
  paintChoices();
  if (quiet) return;
  saveConfig({ look: st.look }).catch(() => {});
}

function adoptLook(r) {
  const wanted = r.config.look || LOOK_DEFAULT;
  if (wanted !== st.look) setLook(wanted, true);
}

/* a config that never held the key is not a config that says "the default": until these were
   read back out of the file, the only place the choice lived was localStorage on this machine,
   and handing it the default here is what wiped it on every reload. */
function adoptBrandFace(r) {
  if (!r.has?.brandFace) return;
  const wanted = r.config.brandFace || BRAND_DEFAULT;
  if (wanted !== brandFace) setBrandFace(wanted, true);
}

function bootGaze() {
  let saved = "";
  try { saved = localStorage.getItem(GAZE_KEY) || ""; } catch {}
  setGaze(GAZE_NAMES[saved] ? saved : GAZE_DEFAULT, true);
}

function setGaze(choice, quiet) {
  st.gazeMode = GAZE_NAMES[choice] ? choice : GAZE_DEFAULT;
  try { localStorage.setItem(GAZE_KEY, st.gazeMode); } catch {}
  watchFarCursor();
  paintChoices();
  if (quiet) return;
  saveConfig({ gaze: st.gazeMode }).catch(() => {});
}

function adoptGaze(r) {
  if (!r.has?.gaze) return;
  const wanted = r.config.gaze || GAZE_DEFAULT;
  if (wanted !== st.gazeMode) setGaze(wanted, true);
}

function bootLanguage() {
  let saved = "";
  try { saved = localStorage.getItem(LANG_KEY) || ""; } catch {}
  st.language = speak(saved);
  document.documentElement.lang = st.language;
  paintStatic(document);
}

function repaintEverything() {
  paintExperience();
  paintStatic(document);
  paintKeys();
  paintFonts();
  paintPrefs();
  paintCalm();
  paintThemes();
  paintChoices();
  render();
}

function setLanguage(id, quiet) {
  st.language = speak(id);
  try { localStorage.setItem(LANG_KEY, st.language); } catch {}
  document.documentElement.lang = st.language;
  repaintEverything();
  if (quiet) return;
  saveConfig({ language: st.language }).catch(() => {});
}

function adoptLanguage(r) {
  const wanted = r.config.language || DEFAULT_LANGUAGE;
  if (wanted !== st.language) setLanguage(wanted, true);
}

function bootPet() {
  let saved = "";
  try { saved = localStorage.getItem(PET_KEY) || ""; } catch {}
  setPet(saved, true);
}

function setPet(choice, quiet) {
  st.petChoice = choice === PET_ON ? PET_ON : PET_OFF;
  try { localStorage.setItem(PET_KEY, st.petChoice); } catch {}
  if (st.petChoice === PET_OFF) {
    st.pet?.destroy();
    st.pet = null;
  } else if (!st.pet) {
    st.pet = mountPet($("shell"), {
      face: () => mugFace(),
      reach: gazeReach,
      farPointer: () => farAt,
      reducedMotion: () => calmly()
    });
    st.pet.setSessions(st.data.sessions);
  }
  watchFarCursor();
  paintBrandAvatar();
  paintChoices();
  if (quiet) return;
  saveConfig({ pet: st.petChoice }).catch(() => {});
}

function adoptPet(r) {
  const wanted = r.config.pet === PET_ON ? PET_ON : PET_OFF;
  if (wanted !== st.petChoice) setPet(wanted, true);
}

function paintChoices() {
  if (!choiceSolids) return;
  const said = choicesViewModel();
  choiceSolids.look.show({ options: said.look });
  $("f-look").value = said.lookWorn;
  choiceSolids.visual.show({ options: said.visual });
  $("f-visual").value = said.visualWorn;
  choiceSolids.lang.show({ options: said.lang });
  $("f-lang").value = said.langWorn;
  choiceSolids.pet.show({ options: said.pet });
  $("f-pet").value = said.petWorn;
  choiceSolids.brand.show({ options: said.brand });
  $("f-brand").value = said.brandWorn;
  choiceSolids.gaze.show({ options: said.gaze });
  $("f-gaze").value = said.gazeWorn;
  $("f-gaze").disabled = said.gazeOff;
  choiceSolids.layout.show({ options: said.layout });
  $("f-layout").value = said.layoutWorn;
  const size = $("f-size");
  if (size && size !== document.activeElement) size.value = said.size;
  paintStructureChoices();
}

let choiceSolids = null;

function choicesViewModel() {
  const named = (names) => Object.entries(names).map(([id, name]) => ({ key: id, value: id, label: phrase(name) }));
  return {
    lang: LANGUAGES.map((one) => ({ key: one.id, value: one.id, label: `${one.short} · ${one.name}` })),
    pet: named(PET_NAMES),
    brand: named(BRAND_NAMES),
    gaze: named(GAZE_NAMES),
    layout: LAYOUTS.map((id) => ({ key: id, value: id, label: phrase(LAYOUT_NAMES[id]) })),
    look: named(LOOK_NAMES),
    lookWorn: st.look || LOOK_DEFAULT,
    visual: named(VISUAL_NAMES),
    visualWorn: visualWorn(),
    langWorn: st.language,
    petWorn: st.petChoice || PET_OFF,
    brandWorn: brandFace,
    gazeWorn: st.gazeMode,
    gazeOff: st.petChoice === PET_OFF,
    layoutWorn: st.seatLayout,
    size: st.LIMIT
  };
}

solidMounts.push((hive) => {
  whenMotionChanges.push(watchFarCursor);
  document.fonts?.ready?.then(placeWindowButtons);
  const bar = $("top");
  if (IS_MAC && bar) new ResizeObserver(placeWindowButtons).observe(bar);
  const hosts = { look: $("f-look"), visual: $("f-visual"), lang: $("f-lang"), pet: $("f-pet"), brand: $("f-brand"), gaze: $("f-gaze"), layout: $("f-layout") };
  if (Object.values(hosts).some((one) => !one)) return;
  choiceSolids = Object.fromEntries(Object.entries(hosts).map(([which, host]) => [which, hive.mountOptions(host)]));
  paintChoices();
});

export { BRAND_DEFAULT, BRAND_KEY, BRAND_NAMES, GAZE_DEFAULT, GAZE_KEY, GAZE_NAMES, LANG_KEY, LOOK_DEFAULT, LOOK_NAMES, VISUAL_NAMES, PET_KEY, PET_NAMES, PET_OFF, PET_ON, PET_SWITCH, adoptBrandFace, adoptLook, adoptGaze, adoptLanguage, adoptPet, bootBrandFace, bootGaze, bootLanguage, bootPet, brandFace, brandWanted, choiceSolids, choicesViewModel, farAt, gazeReach, paintChoices, placeWindowButtons, raycastButtonsSpot, windowButtonsMovable, repaintEverything, setBrandFace, setGaze, setLook, setLanguage, setPet, watchFarCursor, windowButtonsSpot };

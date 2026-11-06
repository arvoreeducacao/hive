import { render } from "./arrange.js";
import { activeItems, labelOf, saveBlocks } from "./blocks.js";
import { saveAvatar } from "./avatars.js";
import { pickFace, stripWear } from "./brand-face.js";
import { pullProviders } from "./providers.js";
import { askDeviceFrame, stopDeviceFrames } from "./chat-and-panes.js";
import { $, IS_MAC, nearestFree, phrase, solidMounts, st } from "./core.js";
import { faceSheetOpen, toggleFaceSheet } from "./face-door.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { setBrandFace, setGaze, setLook } from "./preferences.js";
import { answerNudge, nudge, takenSlots } from "./team.js";
import { openHelp } from "./themes.js";
import { paintAvatar, rollAvatar, toggleSettingsFace } from "./welcome.js";

$("f-label").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("f-label").blur(); }
  if (e.key === "Escape") { e.preventDefault(); $("f-label").value = ""; $("f-label").blur(); }
  e.stopPropagation();
});

$("f-label").addEventListener("blur", () => {
  const b = st.blocks[st.block];
  if (!b) return;
  const written = $("f-label").value.trim();
  const auto = labelOf({ ...b, manual: false, label: "" }, activeItems()).txt;
  b.manual = !!written && written !== auto;
  b.label = b.manual ? written : "";
  saveBlocks();
  render();
});

pullProviders();

const RAIL_MIN_KEY = "hive-rail-min";

function paintRailToggle() {
  railToggleSolid.show(railToggleViewModel());
}

let railToggleSolid = null;

function railToggleViewModel() {
  const min = $("shell").classList.contains("rail-min");
  return { key: "railtoggle", out: min, say: min ? phrase("expand the sidebar") : phrase("collapse the sidebar") };
}

solidMounts.push((hive) => {
  railToggleSolid = hive.mountRailToggle($("rail-toggle"));
  paintRailToggle();
});

$("knock-dock").addEventListener("click", () => {
  if ($("shell").classList.contains("rail-min")) $("rail-toggle").click();
});

$("nudge-yes").addEventListener("click", () => answerNudge(true));

$("nudge-no").addEventListener("click", () => answerNudge(false));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopDeviceFrames();
  else if (st.deviceChat) askDeviceFrame(st.deviceChat);
  if (document.hidden || !st.nudgeHeld) return;
  st.nudgeHeld = false;
  nudge([]);
});

$("rail-toggle").addEventListener("click", () => {
  const min = $("shell").classList.toggle("rail-min");
  try { localStorage.setItem(RAIL_MIN_KEY, min ? "1" : ""); } catch {}
  paintRailToggle();
});

try { if (localStorage.getItem(RAIL_MIN_KEY) === "1") $("shell").classList.add("rail-min"); } catch {}

document.addEventListener("hive:screen", () => closeMore());

function closeMore() {
  $("more").classList.remove("on");
  $("btn-more").setAttribute("aria-expanded", "false");
}

$("btn-more").addEventListener("click", (e) => {
  e.stopPropagation();
  const on = $("more").classList.toggle("on");
  $("btn-more").setAttribute("aria-expanded", String(on));
});

$("more").addEventListener("click", (e) => { if (e.target.closest("button")) closeMore(); });

document.addEventListener("click", (e) => {
  if ($("more").classList.contains("on") && !e.target.closest("#more") && !e.target.closest("#btn-more")) closeMore();
  if (faceSheetOpen() && !e.target.closest("#face-sheet") && !e.target.closest("#brand-mug")) toggleFaceSheet(false);
});

$("brand-mug").addEventListener("click", (e) => { e.stopPropagation(); toggleFaceSheet(); });

$("face-sheet").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fs], [data-w]");
  if (!b) return;
  e.stopPropagation();
  if (b.dataset.w === "face-set") return pickFace(b.dataset.part, b.dataset.value);
  if (b.dataset.fs === "roll") { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); return paintAvatar(); }
  if (b.dataset.fs === "strip") return stripWear();
  if (b.dataset.fs === "done") toggleFaceSheet(false);
});

$("cfg-face").addEventListener("click", (e) => {
  const b = e.target.closest("[data-w]");
  if (b && b.dataset.w === "face-set") pickFace(b.dataset.part, b.dataset.value);
});

$("cfg-open").addEventListener("click", () => toggleSettingsFace());

$("cfg-roll").addEventListener("click", () => { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); paintAvatar(); saveAvatar(); });

$("cfg-strip").addEventListener("click", () => stripWear());

$("f-brand").addEventListener("change", (e) => setBrandFace(e.target.value));

$("f-gaze").addEventListener("change", (e) => setGaze(e.target.value));
$("f-look").addEventListener("change", (e) => setLook(e.target.value));
if (window.hiveWindow && !IS_MAC) {
  $("win-btns").hidden = false;
  for (const b of $("win-btns").querySelectorAll(".wb")) b.addEventListener("click", () => window.hiveWindow.act(b.dataset.act));
}

$("btn-help").addEventListener("click", () => { releaseKeyboard(); openHelp(); });

export { RAIL_MIN_KEY, closeMore, paintRailToggle, railToggleSolid, railToggleViewModel };

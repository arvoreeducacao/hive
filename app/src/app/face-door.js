import { saveAvatar } from "./avatars.js";
import { $, phrase, solidMounts, st } from "./core.js";
import { faceChoiceKey, facePickerViewModel, myFaceSvg } from "./welcome.js";

st.faceSheetFrom = "";

const faceSheetOpen = () => !!$("face-sheet") && !$("face-sheet").hidden;

function paintFaceSheet() {
  const box = $("face-sheet");
  if (!box || box.hidden) return;
  const wasEmptied = !box.firstChild;
  if (wasEmptied) faceSheetSolid.show(FACE_SHEET_SHUT);
  faceSheetSolid.show(faceSheetViewModel());
}

let faceSheetSolid = null;

const FACE_SHEET_SHUT = { rows: [], mug: "", head: "", say: "", roll: "", strip: "", done: "" };

function faceSheetViewModel() {
  return {
    mug: myFaceSvg("sheet"),
    head: phrase("your face in the hive"),
    say: phrase("the body and the colour are yours alone — the screen is free, and so is what it wears"),
    rows: facePickerViewModel(),
    roll: phrase("Another"),
    strip: phrase("take it all off"),
    done: phrase("done")
  };
}

solidMounts.push((hive) => {
  const box = $("face-sheet");
  if (box) faceSheetSolid = hive.mountFaceSheet(box);
});

function toggleFaceSheet(on) {
  const box = $("face-sheet");
  const btn = $("brand-mug");
  if (!box || !btn) return;
  const want = on === undefined ? box.hidden : on;
  if (want === !box.hidden) return;
  box.hidden = !want;
  btn.setAttribute("aria-expanded", String(want));
  if (want) { st.faceSheetFrom = faceChoiceKey(); return paintFaceSheet(); }
  box.innerHTML = "";
  /* the clothes were written as they were picked; only a face that moved is written here */
  if (faceChoiceKey() === st.faceSheetFrom) return;
  st.configHas.avatar = true;
  saveAvatar();
}

export { FACE_SHEET_SHUT, faceSheetOpen, faceSheetSolid, faceSheetViewModel, paintFaceSheet, toggleFaceSheet };

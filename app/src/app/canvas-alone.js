import { $, st } from "./core.js";
import { giveTheScreenBack, takeTheScreen, whenTheScreenGoesBack } from "./screen-alone.js";

st.alone = false;

const aloneOn = () => st.alone;

function paintAlone() {
  document.body.classList.toggle("alone", st.alone);
  $("btn-alone")?.setAttribute("aria-pressed", st.alone ? "true" : "false");
  const out = $("btn-narrow");
  if (out) out.hidden = !st.alone;
}

function setAlone(alone) {
  st.alone = !!alone;
  if (st.alone) takeTheScreen("canvas");
  else giveTheScreenBack("canvas");
  paintAlone();
}

function toggleAlone() {
  setAlone(!st.alone);
}

whenTheScreenGoesBack(() => { if (st.alone) setAlone(false); });

$("btn-alone")?.addEventListener("click", toggleAlone);

$("btn-narrow")?.addEventListener("click", () => setAlone(false));

export { aloneOn, paintAlone, setAlone, toggleAlone };

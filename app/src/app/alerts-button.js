import { $, phrase, raycastOn, st } from "./core.js";
import { keyHint } from "./leader-key.js";
import { palOn, palPaint } from "./palette.js";

document.addEventListener("hive-alerts", (e) => {
  const { count, state, hidden } = e.detail;
  st.alerts = {
    count, state, hidden,
    total: e.detail.total || 0,
    items: e.detail.items || [],
    automatic: e.detail.automatic || [],
    checked: e.detail.checked || "",
    checking: !!e.detail.checking
  };
  if (palOn()) palPaint();
  if (raycastOn()) return paintRaycastAlerts();
  const b = $("btn-alerts");
  b.style.display = count ? "" : "none";
  $("n-alerts").textContent = count;
  b.classList.toggle("fail", state === "fail");
  b.title = phrase("open the environment panel");
});

function paintRaycastAlerts() {
  const { count, state } = st.alerts;
  const b = $("btn-alerts");
  b.style.display = "";
  b.hidden = !count;
  $("n-alerts").textContent = count;
  const say = $("alerts-say");
  if (say) say.textContent = count === 1 ? phrase("alert") : phrase("alerts");
  b.classList.toggle("fail", state === "fail");
  b.title = `${phrase("open the environment panel")} · ${keyHint("alerts")}`;
}

$("btn-alerts").addEventListener("click", () => window.hiveDoctorOpen?.());

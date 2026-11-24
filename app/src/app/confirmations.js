import { CONFIRM_ACTIONS, confirmFor } from "/assets/behavior-defaults.mjs";
import { st } from "./core.js";

st.confirm = {};

function confirmBefore(action) {
  return confirmFor(st.confirm, action);
}

function adoptConfirm(r) {
  const raw = r?.config?.confirm;
  st.confirm = Object.fromEntries(CONFIRM_ACTIONS.filter((action) => typeof raw?.[action] === "boolean").map((action) => [action, raw[action]]));
}

export { adoptConfirm, confirmBefore };

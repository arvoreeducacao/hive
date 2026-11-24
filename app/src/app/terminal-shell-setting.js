import { $, phrase } from "./core.js";
import { saveConfig } from "./brand-face.js";

function adoptTerminalShell(r, refused = "") {
  const field = $("f-shell");
  const say = $("f-shell-say");
  if (!field || !say) return;
  if (!refused && field !== document.activeElement) field.value = r.config?.terminalShell || "";
  if (refused) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
  const login = r.defaults?.terminalShell || "";
  field.placeholder = login || phrase("your login shell");
  say.textContent = refused ? phrase("Write the name of a shell, like fish, or its full path.") : "";
  say.hidden = !refused;
}

function setTerminalShell(raw) {
  saveConfig({ terminalShell: String(raw || "").trim() }).then((r) => adoptTerminalShell(r, r.refused || "")).catch(() => {});
}

$("f-shell")?.addEventListener("change", (event) => setTerminalShell(event.target.value));

export { adoptTerminalShell, setTerminalShell };

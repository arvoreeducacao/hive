import { $, IS_MAC, esc, phrase, svgIcon } from "./core.js";

const PERMISSION_ROWS = [
  { kind: "microphone", icon: "i-mic", name: "Microphone", why: "for dictation", pane: "Microphone" },
  { kind: "screen", icon: "i-camera", name: "Screen recording", why: "for the computer's sound in meetings and for agents that take screenshots", pane: "Screen & System Audio Recording" },
  { kind: "accessibility", icon: "i-user", name: "Accessibility", why: "for agents in your chats that drive other apps on this computer", pane: "Accessibility" },
  { kind: "disk", icon: "i-lock", name: "Full disk access", why: "for agents that read protected folders, such as Mail, Messages and Safari", pane: "Full Disk Access" }
];

const bridge = () => window.hiveMacPermissions || null;

const state = { open: false, now: {}, waiting: "", opener: null };

const macPermissionsHere = () => IS_MAC && !!bridge();

function rowHtml(row) {
  const status = state.now[row.kind] || "denied";
  const waiting = state.waiting === row.kind && status !== "granted";
  const right = status === "granted"
    ? `<span class="mp-ok" role="img" aria-label="${esc(phrase("allowed"))}" title="${esc(phrase("allowed"))}">${svgIcon("i-check")}</span>`
    : waiting
      ? `<span class="mp-wait" role="status"><i aria-hidden="true"></i>${esc(phrase("waiting for you to turn it on"))}</span>`
      : `<button type="button" class="ghost mp-allow" data-kind="${row.kind}">${esc(phrase("Allow"))}</button>`;
  const how = waiting
    ? `<p class="mp-how">${esc(phrase("In System Settings, turn the Hive on under Privacy & Security › {pane}. If it is not on the list, drag the app there.", { pane: phrase(row.pane) }))}</p>`
    : "";
  return `<li class="mp-row${waiting ? " waiting" : ""}" data-kind="${row.kind}">
    <span class="mp-ico" aria-hidden="true">${svgIcon(row.icon)}</span>
    <span class="mp-text" title="${esc(phrase(row.why))}"><b>${esc(phrase(row.name))}</b>${how}</span>
    <span class="mp-right">${right}</span>
  </li>`;
}

function paintDialog() {
  const box = $("macperm");
  if (!box) return;
  box.querySelector(".mp-list").innerHTML = PERMISSION_ROWS.map(rowHtml).join("");
  box.querySelector(".mp-again").hidden = !state.waiting;
}

function dialogEl() {
  const box = $("macperm");
  if (!box || box.dataset.wired) return box;
  box.dataset.wired = "1";
  box.addEventListener("click", (event) => {
    if (event.target === box) return closeMacPermissions();
    const allow = event.target.closest(".mp-allow");
    if (allow) return askFor(allow.dataset.kind);
    if (event.target.closest(".mp-again") && state.waiting) return askFor(state.waiting);
    if (event.target.closest(".mp-close")) closeMacPermissions();
  });
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return closeMacPermissions();
    }
    if (event.key !== "Tab") return;
    const stops = [...box.querySelectorAll("button:not([hidden]):not(:disabled)")];
    if (!stops.length) return;
    const at = stops.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at === stops.length - 1 ? 0 : at + 1);
    event.preventDefault();
    stops[next].focus();
  });
  return box;
}

async function refresh() {
  const said = await bridge()?.now?.().catch(() => null);
  state.now = said?.now || {};
  if (state.waiting && state.now[state.waiting] === "granted") state.waiting = "";
  paintDialog();
}

async function askFor(kind) {
  const said = await bridge()?.open?.(kind).catch(() => null);
  if (said?.status) state.now = { ...state.now, [kind]: said.status };
  state.waiting = said?.status === "granted" ? "" : kind;
  paintDialog();
  const focusAt = $("macperm")?.querySelector(state.waiting ? ".mp-again" : ".mp-close");
  focusAt?.focus();
}

async function openMacPermissions(wanted = "") {
  if (!macPermissionsHere()) return false;
  const box = dialogEl();
  state.opener = document.activeElement;
  box.querySelector("#mp-title").textContent = phrase("System permissions");
  box.querySelector(".mp-sub").textContent = phrase("The Hive opens System Settings in the right place and follows along until the permission is on.");
  box.querySelector(".mp-again").innerHTML = `${svgIcon("i-expand")}<span>${esc(phrase("Open System Settings again"))}</span>`;
  box.querySelector(".mp-close").textContent = phrase("Close");
  box.classList.add("on");
  state.open = true;
  await refresh();
  if (wanted && state.now[wanted] !== "granted") await askFor(wanted);
  else (box.querySelector(".mp-allow") || box.querySelector(".mp-close"))?.focus();
  return true;
}

function closeMacPermissions() {
  const box = $("macperm");
  if (!box) return;
  box.classList.remove("on");
  state.open = false;
  state.waiting = "";
  const back = state.opener;
  state.opener = null;
  if (back?.isConnected) back.focus();
}

bridge()?.hear?.((kind, status) => {
  state.now = { ...state.now, [kind]: status };
  if (status === "granted" && state.waiting === kind) state.waiting = "";
  if (state.open) paintDialog();
});

export { PERMISSION_ROWS, closeMacPermissions, macPermissionsHere, openMacPermissions };

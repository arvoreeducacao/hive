import { phrase } from "./core.js";
import { hud } from "./hud.js";
import { structPool } from "./structured-seats.js";

const DRAGGABLE_FILES = '.ctx-chip[data-kind="file"], .tx-cf-row[data-file]';

const canDragFilesOf = (seat) => typeof window.hiveFiles?.drag === "function" && !!seat?.name && (seat.where || "local") === "local" && !seat.mirror;

function markFileDrags(seat, root) {
  if (!canDragFilesOf(seat) || !root?.querySelectorAll) return root;
  for (const chip of root.querySelectorAll(DRAGGABLE_FILES)) {
    if (!chip.dataset.path && !chip.dataset.file) continue;
    chip.setAttribute("draggable", "true");
    if (!chip.dataset.seat) chip.dataset.seat = seat.name;
  }
  return root;
}

function chatOfDragged(el) {
  const name = el.dataset.seat;
  if (name) return structPool.get(name) || { name, where: el.dataset.where || "local" };
  return [...structPool.values()].find((e) => e.host?.contains(el)) || null;
}

function fileDragOf(target) {
  const el = target?.closest?.(DRAGGABLE_FILES);
  if (!el || el.getAttribute("draggable") !== "true") return null;
  const seat = chatOfDragged(el);
  const path = el.dataset.path || el.dataset.file || "";
  return canDragFilesOf(seat) && path ? { name: seat.name, path } : null;
}

function startFileDrag(ev) {
  const ask = fileDragOf(ev.target);
  if (!ask) return null;
  ev.preventDefault();
  ev.stopPropagation();
  let released = false;
  window.addEventListener("pointerup", () => { released = true; }, { once: true });
  return Promise.resolve(window.hiveFiles.drag(ask))
    .catch(() => null)
    .then((said) => {
      if (!said?.ok && !released) hud({ icon: "i-file", tone: "bad", text: phrase("The file could not be dragged out"), mono: ask.path });
      return said;
    });
}

document.addEventListener("dragstart", startFileDrag, true);

export { DRAGGABLE_FILES, canDragFilesOf, fileDragOf, markFileDrags, startFileDrag };

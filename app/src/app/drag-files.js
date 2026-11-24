import { phrase, st } from "./core.js";
import { takeFiles, zoneOf } from "./drop-zone.js";
import { goTo } from "./focus-navigation.js";
import { pool } from "./leader-key.js";
import { refit } from "./terminal-history.js";

st.dropZone = null;

function markZone(zone) {
  if (st.dropZone?.el === zone?.el) return;
  st.dropZone?.el.classList.remove("dropping");
  st.dropZone = zone;
  if (!st.dropZone) return;
  st.dropZone.el.dataset.dropSays = phrase("Drop files to attach");
  st.dropZone.el.classList.add("dropping");
}

const carriesFile = (dt) => [...(dt?.types || [])].includes("Files");

window.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  if (!carriesFile(ev.dataTransfer)) return markZone(null);
  const zone = zoneOf(ev);
  ev.dataTransfer.dropEffect = zone ? "copy" : "none";
  markZone(zone);
});

window.addEventListener("dragleave", (ev) => { if (!ev.relatedTarget) markZone(null); });

window.addEventListener("dragend", () => markZone(null));

const foldersIn = (dt) => new Set([...(dt?.items || [])]
  .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
  .filter((entry) => entry?.isDirectory)
  .map((entry) => entry.name));

window.addEventListener("drop", async (ev) => {
  ev.preventDefault();
  const zone = zoneOf(ev);
  const folders = foldersIn(ev.dataTransfer);
  markZone(null);
  const files = [...(ev.dataTransfer?.files || [])];
  if (zone?.opens && files.length) goTo(zone.session.name);
  await takeFiles(zone, files, folders);
});

window.addEventListener("resize", () => {
  for (const e of pool.values()) if (e.host.isConnected) refit(e);
});

export { carriesFile, foldersIn, markZone, zoneOf };

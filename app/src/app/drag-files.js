import { attachFilesToSeat, seatReceiving, svLoadingChips } from "./chat-stretches.js";
import { $, refuseDrop, st } from "./core.js";
import { attachFilesToDraft, draftFrom, draftLoadingChips } from "./draft-seat.js";
import { attachToMission, readFile, sendFiles } from "./hold-numbers.js";
import { pool } from "./leader-key.js";
import { structPool } from "./structured-seats.js";
import { refit } from "./terminal-history.js";

st.dropZone = null;

function zoneOf(ev) {
  const node = ev.target instanceof Element ? ev.target : ev.target?.parentElement;
  const tile = node?.closest?.(".tile");
  const draft = tile ? draftFrom(tile) : null;
  if (draft) return { el: tile, draft };
  if (st.missionMode) return { el: $("composer"), mission: true };
  if (!tile) return null;
  const name = tile.dataset.name;
  if (!name) return null;
  const session = st.data.sessions.find((s) => s.name === name);
  return session ? { el: tile, session } : null;
}

function markZone(zone) {
  if (st.dropZone?.el === zone?.el) return;
  st.dropZone?.el.classList.remove("dropping");
  st.dropZone = zone;
  st.dropZone?.el.classList.add("dropping");
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

const foldersIn = (dt) => [...(dt?.items || [])]
  .some((i) => i.kind === "file" && i.webkitGetAsEntry?.()?.isDirectory);

window.addEventListener("drop", async (ev) => {
  ev.preventDefault();
  const zone = zoneOf(ev);
  const folders = foldersIn(ev.dataTransfer);
  markZone(null);
  const files = [...(ev.dataTransfer?.files || [])];
  if (!files.length) return;
  if (!zone) return;
  if (folders) return;
  const refused = refuseDrop(files);
  if (refused) return;
  const seat = zone.mission || zone.draft ? null : zone.session;
  const entry = seat && seat.structured && structPool.get(seat.name);
  const stop = zone.draft ? draftLoadingChips(zone.draft, files)
    : entry ? svLoadingChips(entry, files) : seat ? seatReceiving(seat, files) : () => {};
  try {
    const loaded = (await Promise.all(files.map(async (f) => ({ name: f.name, data: await readFile(f) })))).filter((f) => f.data);
    if (!loaded.length) return;
    if (zone.draft) return await attachFilesToDraft(zone.draft, loaded, true);
    if (zone.mission) return await attachToMission(loaded);
    if (entry) return await attachFilesToSeat(entry, loaded, true);
    return await sendFiles(seat, loaded, true);
  } finally { stop(); }
});

window.addEventListener("resize", () => {
  for (const e of pool.values()) if (e.host.isConnected) refit(e);
});

export { carriesFile, foldersIn, markZone, zoneOf };

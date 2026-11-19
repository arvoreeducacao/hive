import { packDrop } from "/assets/drops.mjs";
import { attachFilesToSeat, seatReceiving, seatRefused, svLoadingChips } from "./chat-stretches.js";
import { phrase, st } from "./core.js";
import { attachFilesToDraft, draftFrom, draftLoadingChips, draftRefused } from "./draft-seat.js";
import { readFile, sendFiles } from "./hold-numbers.js";
import { pool } from "./leader-key.js";
import { structPool, svLine } from "./structured-seats.js";
import { refit } from "./terminal-history.js";

st.dropZone = null;

function zoneOf(ev) {
  const node = ev.target instanceof Element ? ev.target : ev.target?.parentElement;
  const tile = node?.closest?.(".tile");
  const draft = tile ? draftFrom(tile) : null;
  if (draft) return { el: tile, draft };
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

const foldersIn = (dt) => new Set([...(dt?.items || [])]
  .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
  .filter((entry) => entry?.isDirectory)
  .map((entry) => entry.name));

function sayRefused(zone, entry, said) {
  if (!said.length) return;
  const text = said.join(" · ");
  if (zone.draft) return draftRefused(zone.draft, text);
  if (entry) return void svLine(entry, "sv-meta warn", text);
  seatRefused(zone.session, text);
}

async function sendBatch(zone, entry, batch) {
  const read = await Promise.all(batch.map(async (f) => ({ name: f.name, data: await readFile(f) })));
  const loaded = read.filter((f) => f.data);
  if (loaded.length && zone.draft) await attachFilesToDraft(zone.draft, loaded, true);
  else if (loaded.length && entry) await attachFilesToSeat(entry, loaded, true);
  else if (loaded.length) await sendFiles(zone.session, loaded, true);
  return read.filter((f) => !f.data).map((f) => phrase("{name} could not be read", { name: f.name }));
}

async function takeFiles(zone, files, folders = new Set()) {
  if (!files.length || !zone) return;
  const asFolder = files.filter((f) => folders.has(f.name));
  const { batches, refused } = packDrop(files.filter((f) => !folders.has(f.name)));
  const said = [...asFolder.map((f) => phrase("{name} is a folder — drop the files inside it", { name: f.name })), ...refused];
  const entry = zone.session?.structured ? structPool.get(zone.session.name) : null;
  const taken = batches.flat();
  const stop = !taken.length ? () => {}
    : zone.draft ? draftLoadingChips(zone.draft, taken)
    : entry ? svLoadingChips(entry, taken) : seatReceiving(zone.session, taken);
  try {
    for (const batch of batches) said.push(...await sendBatch(zone, entry, batch));
  } finally { stop(); }
  sayRefused(zone, entry, said);
}

window.addEventListener("drop", async (ev) => {
  ev.preventDefault();
  const zone = zoneOf(ev);
  const folders = foldersIn(ev.dataTransfer);
  markZone(null);
  const files = [...(ev.dataTransfer?.files || [])];
  await takeFiles(zone, files, folders);
});

window.addEventListener("resize", () => {
  for (const e of pool.values()) if (e.host.isConnected) refit(e);
});

export { carriesFile, foldersIn, markZone, takeFiles, zoneOf };

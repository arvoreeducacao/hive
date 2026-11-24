import { phrase, esc, st } from "./core.js";
import { svConvShow, svConvTimelineBase } from "./conversation-model.js";
import { canDragFilesOf } from "./file-drag.js";
import { openDiffTab } from "./side-panel-diff.js";
import { structPool } from "./structured-seats.js";
import { checkpointsOfTurns, pathIn, turnFilesHtml } from "./turn-files-html.js";

const FRESH = 15000;
const SETTLE = 1500;

const turns = new Map();
const looks = new Map();
const drawn = new WeakMap();

const seatOf = (name) => (st.data?.sessions || []).find((one) => one.name === name && one.where === "local") || null;

const hasCheckpoints = (s) => !!s && (s.trees || []).some((one) => one?.path);

function repaint(name) {
  const e = structPool.get(name);
  if (e) svConvShow(e);
}

async function pullTurns(name, stamp) {
  const had = turns.get(name);
  const moved = !!had && had.stamp !== stamp;
  if (had?.asking || (had && !moved && Date.now() - had.at < FRESH)) return;
  turns.set(name, { ...(had || {}), asking: true });
  if (moved) setTimeout(() => { const now = turns.get(name); if (now && !now.asking) now.at = 0; repaint(name); }, SETTLE);
  let said = null;
  try { said = await (await fetch(`/api/checkpoints?name=${encodeURIComponent(name)}`)).json(); } catch {}
  const list = Array.isArray(said?.turns) ? said.turns : [];
  const changed = JSON.stringify((had?.list || []).map((one) => [one.ordinal, one.files])) !== JSON.stringify(list.map((one) => [one.ordinal, one.files]));
  turns.set(name, { at: Date.now(), stamp, list, asking: false });
  if (changed) repaint(name);
}

function lookOf(name, ordinal) {
  const key = `${name}:${ordinal}`;
  if (!looks.has(key)) looks.set(key, { all: false, open: new Map() });
  return looks.get(key);
}

function turnFilesOf(e) {
  const s = seatOf(e.name);
  if (!hasCheckpoints(s)) return null;
  pullTurns(s.name, s.turnSince || "");
  const list = turns.get(s.name)?.list;
  return (asks) => {
    const out = new Map();
    if (!list?.length) return out;
    const drag = canDragFilesOf(e);
    for (const [at, one] of checkpointsOfTurns(asks, list)) {
      const look = lookOf(s.name, one.ordinal);
      const sig = `${phrase("Open diff")}|${look.all}|${[...look.open].join(",")}|${drag}`;
      let held = drawn.get(one);
      if (held?.sig !== sig) drawn.set(one, held = { sig, html: turnFilesHtml({ turn: one, ...look, drag, revert: true }, { esc, phrase }) });
      out.set(at, { n: one.ordinal, html: held.html, pathOf: (file) => pathIn(one, file) });
    }
    return out;
  };
}

async function revertTurn(s, ordinal) {
  const list = turns.get(s.name)?.list || [];
  const before = [...list].reverse().find((one) => one.ordinal < ordinal);
  if (!before) return;
  if (!window.confirm(phrase("Put the files back as they were before turn #{n}? What is there now is kept as a new turn, so you can come back.", { n: ordinal }))) return;
  let said = null;
  try {
    said = await (await fetch("/api/checkpoints/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: s.name, ordinal: before.ordinal }) })).json();
  } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
  if (said?.error) window.alert(said.error);
  turns.delete(s.name);
  repaint(s.name);
}

function filesAct(e, hit) {
  const s = seatOf(e.name);
  const ordinal = Number(hit.dataset.n);
  if (!s || !ordinal) return;
  const act = hit.dataset.act;
  if (act === "turn-diff") return void openDiffTab(s.name, { scope: `turn:${ordinal}`, file: hit.dataset.file || "" });
  if (act === "turn-revert") return void revertTurn(s, ordinal);
  const look = lookOf(s.name, ordinal);
  if (act === "cf-all") Object.assign(look, { all: !look.all, open: new Map() });
  else look.open.set(hit.dataset.path, !(look.open.get(hit.dataset.path) ?? look.all));
  repaint(s.name);
}

svConvTimelineBase({ turnFiles: turnFilesOf, files: filesAct });

export { turnFilesOf };

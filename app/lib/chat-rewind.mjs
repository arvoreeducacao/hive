import { forkCut, forkSessionAt, rewindCut, rowsOf, rowsText, withUuids } from "../../server/engine/rewind.mjs";
import { eventLine } from "../../server/engine/protocol.mjs";

export const REWIND_BUSY = new Set(["working", "stalled", "spawning"]);
export const FORK_CARRIES = ["model", "model_id", "effort", "home", "dirs"];

export function refusalOf(seat, doing = "go back") {
  if (!seat) return "that chat is not open on this machine";
  if (seat.where !== "local") return `only chats on this machine can ${doing}`;
  if (!seat.structured) return `a chat in the terminal cannot ${doing} from here`;
  if (seat.agent && seat.agent !== "claude") return `a ${seat.agent} chat cannot ${doing}`;
  return "";
}

export function pickCheckpoints(trees, at) {
  const picks = [];
  for (const { path, kept } of trees) {
    const before = (kept || []).filter((one) => Number(one.at) <= at).at(-1);
    if (before) picks.push({ path, ordinal: before.ordinal });
  }
  return picks;
}

const seqOf = (asked) => {
  const seq = Number(asked);
  return Number.isInteger(seq) && seq > 0 ? seq : 0;
};

async function revertPicks({ seat, seq, readEvents, checkpoints }) {
  const refused = refusalOf(seat);
  if (refused) return { error: refused, status: 409 };
  if (REWIND_BUSY.has(seat.state)) return { error: "the chat is working — stop it before going back", status: 409 };
  const at = seqOf(seq);
  if (!at) return { error: "which message should the files go back to?", status: 400 };
  const cut = rewindCut(rowsOf(await readEvents(seat.name)), at);
  if (cut.error) return { error: cut.error, status: 409 };
  const trees = [];
  for (const tree of (seat.trees || []).filter((one) => one?.path && !one.main)) {
    trees.push({ path: tree.path, kept: await checkpoints.list(seat.name, tree.path) });
  }
  return { picks: pickCheckpoints(trees, cut.at) };
}

export async function filesCanGoBack(asked) {
  const found = await revertPicks(asked);
  return found.error ? { ok: true, available: false, why: found.error } : { ok: true, available: found.picks.length > 0 };
}

export async function revertFiles(asked) {
  const found = await revertPicks(asked);
  if (found.error) return found;
  if (!found.picks.length) return { error: "there is no copy of this chat's files from before that message — edit it keeping the files instead", status: 409 };
  const failed = [];
  for (const pick of found.picks) {
    const back = await asked.checkpoints.restore(asked.seat.name, pick.path, pick.ordinal);
    if (back?.error) failed.push(`${pick.path}: ${back.error}`);
  }
  if (failed.length) return { error: `the files did not go back: ${failed.join("; ")}`, status: 409 };
  return { ok: true, restored: found.picks.length };
}

export const forkTitle = (title) => `${String(title || "").trim().slice(0, 55)} fork`.trim();

export async function forkChat({ seat, seq, title = "", readEvents, readMeta, fork, readTranscript, open, now = () => new Date().toISOString() }) {
  const refused = refusalOf(seat, "be forked");
  if (refused) return { error: refused, status: 409 };
  const at = seqOf(seq);
  if (!at) return { error: "which answer should the fork start from?", status: 400 };
  const cut = forkCut(rowsOf(await readEvents(seat.name)), at);
  if (cut.error) return { error: cut.error, status: 409 };
  const meta = (await readMeta(seat.name)) || {};
  const source = String(seat.title || title || seat.name);
  const named = forkTitle(source);
  const forked = await forkSessionAt({ fork, sessionId: String(meta.session_id || ""), dir: meta.cwd || seat.cwd || "", upTo: cut.upTo, title: named, read: readTranscript });
  const divider = eventLine(cut.last + 1, { type: "driver", subtype: "forked", from: seat.name, where: seat.where, title: source }, now());
  const carried = Object.fromEntries(FORK_CARRIES.filter((key) => meta[key] !== undefined && meta[key] !== null && meta[key] !== "").map((key) => [key, meta[key]]));
  const opened = await open({
    id: forked.sessionId,
    cwd: meta.cwd || seat.cwd || "",
    title: named,
    events: `${rowsText(withUuids(cut.keep, forked.aliases))}${divider}\n`,
    meta: carried
  });
  return { ok: true, name: opened.name, where: opened.where || "local", title: named };
}

import { seatsOfErrand } from "../lib/errands.mjs";

export function registerErrandRoutes(on, context) {
  const { bodyOf, renameErrand, markSeen, HIVE_HOME, invalidateCollectionCache, now = Date.now, readErrands = () => ({}), liveSessions = () => [], archiveSeat = async () => ({ ok: true }) } = context;

  on("POST", "/api/errands/keep", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const kept = String(asked.seat || "").trim().toLowerCase();
    const errand = String(asked.errand || "");
    const seats = seatsOfErrand(readErrands(HIVE_HOME), errand);
    if (!kept || !seats.includes(kept)) return json({ error: "that chat is not part of this request" }, 400);
    const live = new Map(liveSessions().map((seat) => [String(seat.name || "").toLowerCase(), seat]));
    const archived = [];
    const failed = [];
    for (const name of seats) {
      if (name === kept) continue;
      const seat = live.get(name);
      if (!seat) continue;
      try {
        await archiveSeat(name, seat.where === "cloud" ? "cloud" : "local");
        archived.push(name);
      } catch (wrong) {
        failed.push({ name, error: String(wrong?.message || wrong) });
      }
    }
    invalidateCollectionCache();
    return json({ ok: true, kept, archived, failed });
  });

  on("POST", "/api/errands/rename", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const moved = renameErrand(HIVE_HOME, String(asked.from || ""), String(asked.to || ""));
    if (moved.error) return json({ error: moved.error }, 400);
    invalidateCollectionCache();
    return json({ ok: true, moved: moved.moved });
  });

  on("POST", "/api/errands/seen", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const done = markSeen(HIVE_HOME, String(asked.errand || ""), now());
    if (done.error) return json(done, 400);
    invalidateCollectionCache();
    return json({ ok: true });
  });
}

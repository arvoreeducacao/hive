import { join } from "node:path";
import { keepMarks, readMarks } from "../lib/inbox-marks.mjs";
import { searchSeats } from "../lib/seat-search.mjs";

export function registerInboxRoutes(on, context) {
  const { bodyOf, HIVE_HOME, now = Date.now, settled = () => {}, localSeats = () => [] } = context;

  on("GET", "/api/inbox/marks", async (req, res, url, json) => json({ marks: readMarks(HIVE_HOME) }));

  on("GET", "/api/seats/find", async (req, res, url, json) => {
    const asked = String(url.searchParams.get("q") || "").slice(0, 200);
    return json({ q: asked, found: await searchSeats({ eventsDir: join(HIVE_HOME, "events"), names: localSeats(), asked }) });
  });

  on("POST", "/api/inbox/marks", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!asked?.marks || typeof asked.marks !== "object") return json({ error: "send the marks to keep" }, 400);
    const kept = keepMarks(HIVE_HOME, asked.marks, { now: now(), moving: asked.moving === true });
    if (kept.settled.length) settled(kept.settled);
    return json({ ok: true, ...kept });
  });
}

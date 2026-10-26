import { keepMarks, readMarks } from "../lib/inbox-marks.mjs";

export function registerInboxRoutes(on, context) {
  const { bodyOf, HIVE_HOME, now = Date.now } = context;

  on("GET", "/api/inbox/marks", async (req, res, url, json) => json({ marks: readMarks(HIVE_HOME) }));

  on("POST", "/api/inbox/marks", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!asked?.marks || typeof asked.marks !== "object") return json({ error: "send the marks to keep" }, 400);
    return json({ ok: true, ...keepMarks(HIVE_HOME, asked.marks, { now: now(), moving: asked.moving === true }) });
  });
}

import { savePlanFile, seatFolder } from "../lib/plan-file.mjs";

export function registerPlanFileRoutes(on, { bodyOf, isSeatName, HIVE_HOME, HUB }) {
  on("POST", "/api/seat/plan-file", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (asked.oversized) return json({ error: "the plan is too big to save" }, 413);
    const name = String(asked.name || "").trim();
    if (!isSeatName(name)) return json({ error: "that is not a chat this hive knows" }, 400);
    if (asked.where === "cloud") return json({ error: "a plan is saved only for a chat on this machine" }, 400);
    const saved = savePlanFile({ cwd: seatFolder(HIVE_HOME, name, HUB), path: asked.path, text: asked.text });
    return json(saved, saved.error ? 400 : 200);
  });
}

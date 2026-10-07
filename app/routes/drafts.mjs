import { keepDraft, readDrafts } from "../lib/drafts.mjs";

export function registerDraftRoutes(on, context) {
  const { bodyOf, HIVE_HOME, isSeatName, publish = async () => {}, now = Date.now } = context;

  on("GET", "/api/drafts", async (req, res, url, json) => json({ drafts: readDrafts(HIVE_HOME) }));

  on("POST", "/api/draft", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const name = String(asked.name || "").trim();
    if (!isSeatName(name)) return json({ error: "that is not a chat this hive knows" }, 400);
    const at = Number(asked.at) || now();
    const kept = keepDraft(HIVE_HOME, name, asked.text, at);
    if (!kept.older) publish(name, kept.draft?.text || "", at).catch(() => {});
    return json({ ok: true, ...kept });
  });
}

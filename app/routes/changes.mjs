import { isChangePath } from "../lib/changes.mjs";

export function registerChangesRoutes(on, { bodyOf, isSeatName, seatChanges, seatDiff, discardChange, openChange }) {
  on(null, "/api/changes", async (req, res, url, json) => {
    const name = url.searchParams.get("name");
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    try {
      return json(await seatChanges({ name, where, tree: String(url.searchParams.get("tree") || "") }));
    } catch (e) {
      return json({ state: "unread", files: [], ahead: [], error: String(e?.message || e).slice(0, 160) });
    }
  });

  on(null, "/api/changes/diff", async (req, res, url, json) => {
    const name = url.searchParams.get("name");
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const path = String(url.searchParams.get("path") || "");
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    if (!isChangePath(path)) return json({ error: "that is not a path I will read" }, 400);
    try {
      return json(await seatDiff({ name, where, tree: String(url.searchParams.get("tree") || ""), path }));
    } catch (e) {
      return json({ state: "unread", hunks: [], error: String(e?.message || e).slice(0, 160) });
    }
  });

  on("POST", "/api/changes/discard", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const where = data.where === "cloud" ? "cloud" : "local";
    const path = String(data.path || "");
    if (!isSeatName(data.name)) return json({ error: "unknown session" }, 400);
    if (!isChangePath(path)) return json({ error: "that is not a path I will touch" }, 400);
    const done = await discardChange({ name: data.name, where, tree: String(data.tree || ""), path });
    return json(done, done.error ? 409 : 200);
  });

  on("POST", "/api/changes/open", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const where = data.where === "cloud" ? "cloud" : "local";
    const path = String(data.path || "");
    if (!isSeatName(data.name)) return json({ error: "unknown session" }, 400);
    if (!isChangePath(path)) return json({ error: "that is not a path I will open" }, 400);
    if (where === "cloud") return json({ error: "a cloud seat's files are not on this machine" }, 409);
    const opened = await openChange({ name: data.name, where, tree: String(data.tree || ""), path, line: Math.max(1, Number(data.line) || 1) });
    return json(opened, opened.error ? 409 : 200);
  });
}

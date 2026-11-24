import { isProjectPath } from "../lib/project-files.mjs";

const HIGHLIGHT_BYTES = 200000;
const HIGHLIGHT_LINES = 20000;

export function registerProjectFileRoutes(on, { isSeatName, projectFiles, languageOf, paintLines }) {
  const seatAsked = (url) => ({
    name: url.searchParams.get("name"),
    where: url.searchParams.get("where") === "cloud" ? "cloud" : "local",
    tree: String(url.searchParams.get("tree") || "")
  });

  on(null, "/api/tree", async (req, res, url, json) => {
    const asked = seatAsked(url);
    const dir = String(url.searchParams.get("dir") || "");
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    if (dir && !isProjectPath(dir)) return json({ error: "that is not a folder I will list" }, 400);
    try {
      return json(await projectFiles.tree({ ...asked, dir, q: String(url.searchParams.get("q") || "").slice(0, 200), force: !!url.searchParams.get("force") }));
    } catch (e) {
      return json({ state: "unread", error: String(e?.message || e).slice(0, 160) });
    }
  });

  on(null, "/api/tree/file", async (req, res, url, json) => {
    const asked = seatAsked(url);
    const path = String(url.searchParams.get("path") || "");
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    if (!isProjectPath(path)) return json({ error: "that is not a path I will read" }, 400);
    let read;
    try {
      read = await projectFiles.file({ ...asked, path });
    } catch (e) {
      return json({ path, state: "unread", error: String(e?.message || e).slice(0, 160) });
    }
    if (read.state !== "ok") return json({ path, ...read });
    const language = languageOf(path);
    const small = read.text.length <= HIGHLIGHT_BYTES && read.text.split("\n").length <= HIGHLIGHT_LINES;
    return json({ path, state: "ok", size: read.size, text: read.text, language, lines: paintLines(read.text, small ? language : "") });
  });
}

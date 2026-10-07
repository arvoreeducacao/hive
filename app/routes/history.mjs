export function registerHistoryRoutes(on, { isSeatName, paneHistory, readImage }) {
  on(null, "/api/history", async (req, res, url, json) => {
    const name = url.searchParams.get("name") || "";
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    return json({ text: await paneHistory(name, where) });
  });

  on(null, "/api/image", async (req, res, url, json) => {
    const shot = await readImage({
      path: url.searchParams.get("path") || "",
      where: url.searchParams.get("where") === "cloud" ? "cloud" : "local",
      session: url.searchParams.get("name") || ""
    });
    if (shot.error) return json({ error: shot.error }, 404);
    res.writeHead(200, { "content-type": shot.type, "cache-control": "no-store", "content-length": shot.data.length });
    return res.end(shot.data);
  });
}

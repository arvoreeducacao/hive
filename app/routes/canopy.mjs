export function registerCanopyRoutes(on, context) {
  const { canopyStateOf, canopyLiveOf, isSeatName, newestCanopyTab, canopyCall } = context;

  on(null, "/api/canopy", async (req, res, url, json) => {
    const state = await canopyStateOf();
    const live = canopyLiveOf();
    return json({ url: state.url, up: state.up, at: live.at, seats: live.seats });
  });

  on(null, "/api/canopy/frame", async (req, res, url, json) => {
    const seat = url.searchParams.get("seat") || "";
    const tab = isSeatName(seat) ? newestCanopyTab(seat, url.searchParams.get("tab") || "") : null;
    if (!tab) return json({ error: "no tab" }, 404);
    try {
      const response = await canopyCall(`/tabs/${encodeURIComponent(tab.id)}/frame`);
      if (!response.ok) return json({ error: "no frame" }, response.status === 404 ? 404 : 502);
      res.writeHead(200, { "content-type": response.headers.get("content-type") || "image/jpeg", "cache-control": "no-store" });
      return res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      return json({ error: "canopy is not answering" }, 502);
    }
  });
}

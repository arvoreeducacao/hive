export function registerMessageSearchRoutes(on, { messageSearch }) {
  on(null, "/api/chat/messages/search", async (req, res, url, json) => {
    const query = String(url.searchParams.get("q") || "").slice(0, 200);
    const names = String(url.searchParams.get("names") || "").split(",").map((one) => one.trim()).filter(Boolean).slice(0, 400);
    try { return json({ query, matches: await messageSearch.search(names, query) }); }
    catch (e) { return json({ query, matches: [], error: String(e.message || e) }, 500); }
  });
}

export function registerProviderRoutes(on, context) {
  const { bodyOf, readProviders, runProvider, invalidateProviders } = context;

  on(null, "/api/providers", async (req, res, url, json) => {
    try {
      return json({ providers: await readProviders(!!url.searchParams.get("force")) });
    } catch (wrong) {
      return json({ providers: [], error: String(wrong?.message || wrong).slice(0, 200) }, 500);
    }
  });

  on("POST", "/api/provider", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const action = String(asked.action || "");
    try {
      const answer = await runProvider(action, asked);
      if (answer?.error) return json(answer, 400);
      if (action !== "screen") invalidateProviders();
      return json(answer);
    } catch (wrong) {
      return json({ error: String(wrong?.message || wrong).slice(0, 200) }, 400);
    }
  });
}

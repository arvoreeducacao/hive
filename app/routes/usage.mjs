export function registerUsageRoutes(on, { invalidateUsage, readUsage, readClaudeLimits, tightestAccount }) {
  on(null, "/api/usage", async (req, res, url, json) => {
    if (url.searchParams.get("force")) invalidateUsage();
    return json(await readUsage());
  });

  on(null, "/api/limits", async (req, res, url, json) => {
    const accounts = await readClaudeLimits(!!url.searchParams.get("force"));
    return json({ accounts, tightest: tightestAccount(accounts)?.account || "" });
  });
}

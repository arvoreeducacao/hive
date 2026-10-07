export function registerConfigRoutes(on, { bodyOf, readConfig, writeConfig, shotsUsage }) {
  on("POST", "/api/config", async (req, res, url, json) => json(await writeConfig((await bodyOf(req)).config)));
  on(null, "/api/config", async (req, res, url, json) => json(await readConfig()));
  on(null, "/api/shots/usage", async (req, res, url, json) => json(await shotsUsage()));
}

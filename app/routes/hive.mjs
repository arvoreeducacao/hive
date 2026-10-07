export function registerHiveRoutes(on, { collect }) {
  on(null, "/api/hive", async (req, res, url, json) => {
    const seen = await collect();
    return json(seen);
  });
}

export function registerPortariaRoutes(on, context) {
  const { bodyOf, portariaState, portariaDo } = context;

  on(null, "/api/portaria", async (req, res, url, json) => json(await portariaState()));

  on("POST", "/api/portaria/action", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const done = await portariaDo(String(data.op || ""), data);
    return json(done, done.error ? 400 : 200);
  });
}

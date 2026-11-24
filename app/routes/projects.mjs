export function registerProjectRoutes(on, { hubFolder, hubProjects, projectBranches }) {
  on("GET", "/api/projects", async (req, res, url, json) => {
    return json({ hub: hubFolder(), projects: hubProjects() });
  });

  on("GET", "/api/projects/branches", async (req, res, url, json) => {
    try {
      return json(await projectBranches(String(url.searchParams.get("project") || "")));
    } catch (wrong) {
      return json({ error: String(wrong?.message || wrong) }, 404);
    }
  });
}

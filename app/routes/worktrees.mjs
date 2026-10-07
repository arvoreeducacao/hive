export function registerWorktreeRoutes(on, {
  bodyOf,
  worktreeReport,
  removeWorktree,
  sweepWorktrees,
  idleHours
}) {
  on(null, "/api/worktrees", async (req, res, url, json) => {
    return json(await worktreeReport({
      force: !!url.searchParams.get("force"),
      hours: Number(url.searchParams.get("hours")) || idleHours
    }));
  });

  on("POST", "/api/worktrees/remove", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const said = await removeWorktree(String(data.path || ""), !!data.force);
    return json(said, said.error ? 400 : 200);
  });

  on("POST", "/api/worktrees/sweep", async (req, res, url, json) => {
    const data = await bodyOf(req);
    return json(await sweepWorktrees(Number(data.hours) || idleHours));
  });
}

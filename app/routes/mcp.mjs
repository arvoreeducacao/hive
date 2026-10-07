export function registerMcpRoutes(on, context) {
  const { bodyOf, isSeatName, mcpLogins, onTheServer, startMcpLogin } = context;

  on("POST", "/api/mcp/login", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const name = String(data.name || "");
    const mcpServer = String(data.server || "");
    if (!isSeatName(name) || !mcpServer || mcpServer.length > 120) return json({ error: "missing seat or server" }, 400);
    if (data.redirect) {
      const job = mcpLogins.get(`${name}|${mcpServer}`);
      if (!job || job.state !== "running") return json({ error: "no login waiting for a redirect url" }, 400);
      const redirect = String(data.redirect).trim().slice(0, 2000);
      if (job.where === "cloud") {
        await onTheServer('tmux send-keys -t "mcp-auth-$1" -l "$2"; tmux send-keys -t "mcp-auth-$1" Enter', [name, redirect], { timeout: 12000 });
        return json({ ok: true });
      }
      if (!job.child) return json({ error: "no login waiting for a redirect url" }, 400);
      try { job.child.write(redirect + "\r"); } catch (e) { return json({ error: e.message }, 500); }
      return json({ ok: true });
    }
    return json(startMcpLogin(name, mcpServer, data.where === "cloud" ? "cloud" : "local"));
  });

  on(null, "/api/mcp/login", async (req, res, url, json) => {
    const job = mcpLogins.get(`${url.searchParams.get("name")}|${url.searchParams.get("server")}`);
    return json(job ? { state: job.state, url: job.url, error: job.error } : { state: "none" });
  });
}

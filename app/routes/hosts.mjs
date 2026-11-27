export function registerHostRoutes(on, { bodyOf, listHosts, addHost, forgetHost, foldersOnHost, setHostFolder }) {
  on("GET", "/api/hosts", async (req, res, url, json) => json({ hosts: listHosts() }));

  on("POST", "/api/hosts", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const added = addHost(String(asked.target || ""));
    return added.error ? json({ error: added.error }, 400) : json(added);
  });

  on("GET", "/api/hosts/folders", async (req, res, url, json) => {
    const said = await foldersOnHost(String(url.searchParams.get("id") || ""), String(url.searchParams.get("path") || ""), { hidden: url.searchParams.get("hidden") === "1" });
    return said.error ? json({ error: said.error }, 400) : json(said);
  });

  on("POST", "/api/hosts/folder", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const kept = setHostFolder(String(asked.id || ""), String(asked.folder || ""));
    return kept.error ? json({ error: kept.error }, 400) : json(kept);
  });

  on("POST", "/api/hosts/forget", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const gone = forgetHost(String(asked.id || ""));
    return gone.error ? json({ error: gone.error }, 400) : json(gone);
  });
}

export function registerArchiveRoutes(on, context) {
  const {
    scanHistory,
    previewSession,
    runSessionSync,
    configureSessionSync,
    bodyOf,
    localSyncState,
    existsSync,
    syncEngine,
    getSyncSuggestion,
    syncStatus,
    bringLocal,
    reviveSession,
    searchArchive
  } = context;

  on(null, "/api/archive", async (req, res, url, json) =>
    json(await scanHistory({ fresh: url.searchParams.get("fresh") === "1" })));

  on(null, "/api/archive/search", async (req, res, url, json) => json({ found: await searchArchive(url.searchParams.get("q") || "") }));

  on(null, "/api/archive/preview", async (req, res, url, json) => {
    try { return json(await previewSession({ id: url.searchParams.get("id"), where: url.searchParams.get("where") })); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });

  on("POST", "/api/session-sync/run", async (req, res, url, json) => {
    try { return json(await runSessionSync()); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });

  on("POST", "/api/session-sync", async (req, res, url, json) => {
    try { return json(await configureSessionSync(await bodyOf(req))); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });

  on(null, "/api/session-sync", async (req, res, url, json) => {
    if (url.searchParams.get("fast")) {
      return json({ local: localSyncState(), cloud: "probing", engine: existsSync(syncEngine()), suggestion: getSyncSuggestion() });
    }
    return json(await syncStatus());
  });

  on("POST", "/api/bring-local", async (req, res, url, json) => {
    try { return json(await bringLocal(await bodyOf(req))); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });

  on("POST", "/api/revive", async (req, res, url, json) => {
    try { return json(await reviveSession(await bodyOf(req))); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });
}

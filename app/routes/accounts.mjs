export function registerAccountRoutes(on, context) {
  const {
    bodyOf,
    settingsEffort,
    agentCatalog,
    readAccounts,
    readLedger,
    hiveHome,
    noteBack,
    invalidateAccountCache,
    runAccount
  } = context;

  on(null, "/api/effort", async (req, res, url, json) => {
    try {
      return json({ effort: await settingsEffort() });
    } catch (wrong) {
      return json({ effort: "", error: String(wrong?.message || wrong) });
    }
  });

  on(null, "/api/catalog", async (req, res, url, json) => {
    const agent = String(url.searchParams.get("agent") || "claude");
    try {
      return json({ agent, models: await agentCatalog(agent) });
    } catch (wrong) {
      return json({ agent, models: [], error: String(wrong?.message || wrong) });
    }
  });

  on(null, "/api/accounts", async (req, res, url, json) => {
    const [list, ledger] = await Promise.all([readAccounts(), readLedger(hiveHome).catch(() => ({}))]);
    for (const account of list) {
      if (!account.loggedIn || ledger[account.name]?.why !== "login") continue;
      delete ledger[account.name];
      await noteBack(hiveHome, account.name).catch(() => {});
    }
    return json({ accounts: list.map((account) => ({ ...account, spent: ledger[account.name] || null })), oldCli: !list.length });
  });

  on("POST", "/api/account", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    invalidateAccountCache();
    try {
      return json(await runAccount(String(asked.action || ""), asked));
    } catch (wrong) {
      return json({ error: String(wrong.message || wrong).slice(0, 200) }, 400);
    }
  });
}

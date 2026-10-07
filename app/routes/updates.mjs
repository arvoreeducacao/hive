export function registerUpdateRoutes(on, context) {
  const {
    checkUpdate,
    getUpdatePhase,
    whatLanded,
    markReleaseSeen,
    getLandedSha,
    builtFrom,
    applyPublished,
    repo,
    shr,
    viaBash,
    appDir,
    releaseTeam,
    resetUpdateCache,
    packaged,
    platform,
    builtBundle,
    existsSync,
    readdirSync,
    join,
    appBundle,
    schedule,
    log
  } = context;

  on(null, "/api/update", async (req, res, url, json) => json(await checkUpdate(!!url.searchParams.get("force"))));

  on(null, "/api/update/phase", async (req, res, url, json) => json(getUpdatePhase()));

  on(null, "/api/whatsnew", async (req, res, url, json) => json(await whatLanded()));

  on("POST", "/api/whatsnew/seen", async (req, res, url, json) => {
    await markReleaseSeen(getLandedSha() || builtFrom);
    return json({ ok: true });
  });

  on("POST", "/api/update/apply", async (req, res, url, json) => {
    const st = await checkUpdate(true);
    if (!st.behind) return json({ ok: true, note: "already up to date" });
    if (st.via === "release" || st.via === "pack") {
      const done = await applyPublished(st);
      return json(done, done.error ? 409 : 200);
    }
    if (!repo) return json({ error: "no checkout of this repo on this machine — clone it and put its path in ~/.hive/config as HIVE_REPO" }, 409);
    if (st.branch && st.branch !== "main") {
      return json({ error: `the checkout at ${repo} is on ${st.branch} — the app updates from main, so put that checkout back on main or point HIVE_REPO at one that stays there` }, 409);
    }
    const pull = await shr("git", ["-C", repo, "pull", "--ff-only", "origin", "main"], { timeout: 40000 });
    if (!pull.ok) return json({ error: pull.error || "git pull failed — local changes or a diverged branch" }, 409);
    const install = await shr(...viaBash("npm", ["install", "--no-audit", "--no-fund"]), { timeout: 240000, cwd: appDir });
    resetUpdateCache();
    if (!packaged) {
      schedule(() => log("hive: update applied — restart me"), 400);
      return json({ ok: true });
    }
    if (!install.ok) return json({ error: `npm install failed in ${appDir}: ${install.error.slice(0, 200)}` }, 500);
    const recipe = platform === "linux" ? "package-linux" : platform === "win32" ? "package-win" : "package";
    const keepsTheTeam = releaseTeam ? { env: { HIVE_RELEASE_TEAM: releaseTeam } } : {};
    const built = await shr(...viaBash("npm", ["run", recipe]), { timeout: 900000, cwd: appDir, ...keepsTheTeam });
    if (!built.ok) return json({ error: `the rebuild failed: ${built.error.slice(0, 200)}` }, 500);
    const distDir = join(appDir, "dist");
    const fresh = builtBundle(distDir, existsSync(distDir) ? readdirSync(distDir) : [], existsSync);
    if (!fresh || !appBundle) {
      return json({ ok: true, note: `the new version is built in ${distDir} — quit the app and put it in place of yours` });
    }
    schedule(() => log(`hive: update staged ${fresh}`), 400);
    return json({ ok: true });
  });
}

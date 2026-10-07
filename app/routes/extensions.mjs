import { isPlainObject } from "../lib/extensions.mjs";

export function registerExtensionRoutes(on, { bodyOf, registry, readConfig, writeConfig, invalidateFleetCache = () => {}, store = null }) {
  const currentExtensions = async () => {
    const { config } = await readConfig();
    return isPlainObject(config?.extensions) ? config.extensions : {};
  };

  const persist = async (extensions) => {
    const wrote = await writeConfig({ extensions });
    if (wrote.refused || wrote.error) return { error: wrote.refused || wrote.error };
    return { extensions: isPlainObject(wrote.config?.extensions) ? wrote.config.extensions : {} };
  };

  const one = (name) => registry.list().find((row) => row.name === name) || null;

  on("POST", "/api/extensions/toggle", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    const row = registry.rowOf(name);
    if (!row) return json({ error: `no extension called ${name || "(nothing)"}` }, 404);
    if (typeof b?.enabled !== "boolean") return json({ error: "enabled should be true or false" }, 400);
    if (b.enabled && (row.reserved || row.shadowed || !row.manifest)) return json({ error: row.problems[0] || `${name} cannot be turned on` }, 409);
    const held = await currentExtensions();
    const next = { ...held, [name]: { ...(held[name] || {}), enabled: b.enabled } };
    if (b.enabled && row.origin !== "built-in") next[name].hash = registry.hashOf(name);
    const wrote = await persist(next);
    if (wrote.error) return json({ error: wrote.error }, 400);
    const said = await registry.setEnabled(name, b.enabled, wrote.extensions);
    if (!said.ok) return json({ error: said.error }, 409);
    invalidateFleetCache();
    return json({ ok: true, extension: one(name) });
  });

  on("POST", "/api/extensions/settings", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    const row = registry.rowOf(name);
    if (!row) return json({ error: `no extension called ${name || "(nothing)"}` }, 404);
    if (!isPlainObject(b?.settings)) return json({ error: "settings should be an object" }, 400);
    const held = await currentExtensions();
    const kept = isPlainObject(held[name]?.settings) ? held[name].settings : {};
    const clean = registry.cleanSettings(name, { ...kept, ...b.settings });
    if (clean.problems.length) return json({ error: clean.problems.join(" · ") }, 400);
    const next = { ...held, [name]: { ...(held[name] || {}), settings: clean.settings } };
    const wrote = await persist(next);
    if (wrote.error) return json({ error: wrote.error }, 400);
    if (Object.keys(clean.secrets).length) {
      const kept = registry.setSecrets(name, clean.secrets);
      if (!kept.ok) return json({ error: kept.error }, 409);
    }
    registry.reconfigure(wrote.extensions);
    invalidateFleetCache();
    return json({ ok: true, extension: one(name) });
  });

  const installedOf = (name) => {
    const row = registry.rowOf(name);
    if (!row || row.reserved || row.shadowed) return null;
    const shown = one(name);
    return { origin: row.origin, version: row.manifest?.version || "", store: !!row.store, storeVersion: row.store?.version || "", enabled: !!shown?.enabled };
  };

  const entryOf = async (name) => {
    let catalog = await store.catalog();
    let entry = catalog.extensions.find((x) => x.name === name);
    if (!entry && !catalog.error) {
      catalog = await store.catalog({ fresh: true });
      entry = catalog.extensions.find((x) => x.name === name);
    }
    return { catalog, entry };
  };

  on("GET", "/api/extensions/catalog", async (req, res, url, json) => {
    if (!store) return json({ extensions: [], error: "this hive has no catalog of extensions" });
    const catalog = await store.catalog({ fresh: url.searchParams.get("fresh") === "1" });
    const extensions = catalog.extensions.map(({ files, ...entry }) => {
      const installed = installedOf(entry.name);
      return { ...entry, installed, update: !!(installed?.store && installed.storeVersion && entry.version && installed.storeVersion !== entry.version) };
    });
    return json({ repo: catalog.repo, commit: catalog.commit, at: catalog.at, extensions, ...(catalog.error ? { error: catalog.error } : {}), ...(catalog.warning ? { warning: catalog.warning } : {}) });
  });

  on("POST", "/api/extensions/install", async (req, res, url, json) => {
    if (!store) return json({ error: "this hive has no catalog of extensions" }, 404);
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    const { catalog, entry } = await entryOf(name);
    if (catalog.error) return json({ error: catalog.error }, 502);
    if (!entry) return json({ error: `the catalog has no extension called ${name || "(nothing)"}` }, 404);
    const before = registry.rowOf(name);
    if (before && !(before.origin === "personal" && before.store)) return json({ error: `${name} is already on this machine (${before.origin}: ${before.dir}) — it did not come from the catalog, so it is left alone` }, 409);
    const done = await store.install(entry, { commit: catalog.commit });
    if (done.error) return json({ error: done.error }, entry.newerHive ? 409 : 502);
    registry.rediscover();
    const held = await currentExtensions();
    const next = { ...held, [name]: { ...(held[name] || {}), enabled: true, hash: registry.hashOf(name) } };
    const wrote = await persist(next);
    if (wrote.error) return json({ error: wrote.error }, 400);
    const said = await registry.setEnabled(name, true, wrote.extensions);
    if (!said.ok) return json({ error: said.error }, 409);
    invalidateFleetCache();
    return json({ ok: true, extension: one(name) });
  });

  on("POST", "/api/extensions/uninstall", async (req, res, url, json) => {
    if (!store) return json({ error: "this hive has no catalog of extensions" }, 404);
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    const row = registry.rowOf(name);
    if (!row || row.origin !== "personal" || !row.store) return json({ error: "only an extension installed from the catalog can be uninstalled here" }, 409);
    const held = await currentExtensions();
    const next = { ...held };
    if (b?.forget === true) delete next[name];
    else {
      const { hash, ...rest } = held[name] || {};
      next[name] = { ...rest, enabled: false };
    }
    const wrote = await persist(next);
    if (wrote.error) return json({ error: wrote.error }, 400);
    registry.reconfigure(wrote.extensions);
    registry.unload(name);
    const gone = store.uninstall(name);
    if (gone.error) return json({ error: gone.error }, 500);
    if (b?.forget === true) registry.forget(name);
    registry.rediscover();
    invalidateFleetCache();
    return json({ ok: true });
  });

  on(null, "/api/extensions", async (req, res, url, json) => json({ roots: registry.roots, extensions: registry.list() }));
}

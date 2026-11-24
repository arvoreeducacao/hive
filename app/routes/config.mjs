import { agentThemePatch, themeGuide } from "../lib/agent-theme.mjs";

export function registerConfigRoutes(on, { bodyOf, readConfig, writeConfig, shotsUsage }) {
  on("POST", "/api/config", async (req, res, url, json) => json(await writeConfig((await bodyOf(req)).config)));
  on(null, "/api/config", async (req, res, url, json) => json(await readConfig()));
  on(null, "/api/shots/usage", async (req, res, url, json) => json(await shotsUsage()));
  on("POST", "/api/themes/agent", async (req, res, url, json) => {
    const { config, error } = await readConfig();
    if (error) return json({ error });
    const made = agentThemePatch(config, await bodyOf(req));
    if (made.error) return json({ error: made.error });
    const wrote = await writeConfig(made.patch);
    if (wrote.refused || wrote.error) return json({ error: wrote.refused || wrote.error });
    return json({ ok: true, wearing: made.wearing, appearance: wrote.config.appearance, theme: wrote.config.theme, themeLight: wrote.config.themeLight });
  });
  on(null, "/api/themes/agent", async (req, res, url, json) => {
    const { config, error } = await readConfig();
    if (error) return json({ error });
    return json(themeGuide(config));
  });
}

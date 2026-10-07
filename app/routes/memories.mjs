import { loginReach } from "../lib/memory-login.mjs";

const WRITE_STATUS = { ok: 200, out: 401, forbidden: 403, gone: 404, bad: 400, down: 502, unsupported: 501 };

export function registerMemoryRoutes(on, { memories, login = null, vault = null, bodyOf = async () => ({}), env = process.env }) {
  async function reachOf(req) {
    const reach = loginReach({ host: req?.headers?.host, env });
    if (reach !== "here" || login?.demo || !vault) return reach;
    return (await vault.available()) ? "here" : "no-vault";
  }

  const configured = () => !!login && (!!login.demo || !login.configured || login.configured());

  on("GET", "/api/memories", async (req, res, url, json) => {
    const asked = Object.fromEntries(url.searchParams);
    if (asked.fresh) memories.forget();
    return json(await memories.list(asked));
  });

  on("GET", "/api/memories/one", async (req, res, url, json) => {
    const said = await memories.one(url.searchParams.get("id"));
    return json(said, said.state === "bad" ? 400 : 200);
  });

  on("GET", "/api/memories/stats", async (req, res, url, json) => {
    if (url.searchParams.get("fresh")) memories.forget();
    return json(await memories.stats(url.searchParams.get("weeks")));
  });

  on("GET", "/api/memories/login", async (req, res, url, json) => {
    const reach = await reachOf(req);
    if (!login) return json({ state: "out", reach, configured: false });
    return json({ ...(await login.status()), reach, configured: configured(), demo: !!login.demo });
  });

  on("POST", "/api/memories/login", async (req, res, url, json) => {
    const reach = await reachOf(req);
    if (!login || reach !== "here") return json({ state: "out", reach, configured: configured(), why: reach }, 409);
    const started = await login.begin();
    if (started.error) return json({ state: "out", reach, configured: configured(), why: started.error }, 502);
    return json({ ...(await login.status()), reach, configured: configured(), url: started.url, demo: !!login.demo });
  });

  on("POST", "/api/memories/login/cancel", async (req, res, url, json) => {
    login?.cancel();
    return json({ ...(login ? await login.status() : { state: "out" }), reach: await reachOf(req) });
  });

  on("POST", "/api/memories/logout", async (req, res, url, json) => {
    if (login) await login.logout();
    memories.forget();
    return json({ state: "out", reach: await reachOf(req), demo: !!login?.demo });
  });

  for (const kind of ["edit", "archive", "unarchive"]) {
    on("POST", `/api/memories/${kind}`, async (req, res, url, json) => {
      const asked = await bodyOf(req);
      if (!login || !(await login.access())) return json({ state: "out" }, 401);
      const said = await memories.write(asked?.id, kind, asked);
      return json(said, WRITE_STATUS[said.state] || 200);
    });
  }
}

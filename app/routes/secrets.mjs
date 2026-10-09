import { SECRET_WAIT_MAX_MS } from "../lib/secret-asks.mjs";

export function registerSecretRoutes(on, { bodyOf, secrets }) {
  on("POST", "/api/secrets/ask", async (req, res, url, json) => {
    const data = await bodyOf(req);
    if (data.where === "cloud") return json({ error: "a secret is only kept on this machine — ask for it from a local chat" }, 409);
    const opened = secrets.open({ seat: data.seat, label: data.label, why: data.why });
    return json(opened, opened.error ? 400 : 200);
  });

  on("GET", "/api/secrets/ask", async (req, res, url, json) => {
    const said = secrets.status({ id: url.searchParams.get("id"), seat: url.searchParams.get("seat") || "" });
    return json(said, said.error ? 404 : 200);
  });

  on("POST", "/api/secrets/cancel", async (req, res, url, json) => {
    const data = await bodyOf(req);
    return json(secrets.cancel({ id: data.id, seat: data.seat }));
  });

  on("GET", "/api/secrets/pending", async (req, res, url, json) => json({ asks: secrets.pending(), waitMs: SECRET_WAIT_MAX_MS }));

  on("POST", "/api/secrets/answer", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const said = data.decline ? secrets.decline({ id: data.id }) : secrets.answer({ id: data.id, value: data.value });
    return json(said.error ? said : { ask: said.ask }, said.error ? 409 : 200);
  });
}

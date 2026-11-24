import { openIn, openersHere } from "../lib/open-in.mjs";
import { machineServers, seatServers, stopSeatServer } from "../lib/local-servers.mjs";

export function registerChatPanelRoutes(on, { bodyOf, isSeatName, seatOf, folderOf, hive }) {
  const localSeat = (name) => {
    if (!isSeatName(name)) return { error: "unknown session", status: 400 };
    const seat = seatOf(name);
    if (!seat) return { error: "unknown session", status: 404 };
    if (seat.where !== "local") return { error: "this chat does not run on this machine", status: 409 };
    return { seat };
  };

  on("GET", "/api/open-in", async (req, res, url, json) => json({ apps: openersHere() }));

  on("POST", "/api/open-in", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const found = localSeat(data.name);
    if (found.error) return json({ error: found.error }, found.status);
    const said = await openIn(String(data.app || ""), await folderOf(found.seat.name));
    return json(said, said.error ? 409 : 200);
  });

  on("GET", "/api/seat/servers", async (req, res, url, json) => {
    const found = localSeat(url.searchParams.get("name"));
    if (found.error) return json({ servers: [], error: found.error }, found.status === 409 ? 200 : found.status);
    return json({ servers: await seatServers(found.seat.name, { hive }) });
  });

  on("POST", "/api/seat/servers/stop", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const found = localSeat(data.name);
    if (found.error) return json({ error: found.error }, found.status);
    const said = await stopSeatServer(found.seat.name, data.pid, { hive });
    return json(said, said.error ? 409 : 200);
  });

  on("GET", "/api/local-servers", async (req, res, url, json) => json({ servers: await machineServers() }));
}

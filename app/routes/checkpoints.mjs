const BUSY = new Set(["working", "stalled", "spawning"]);

export function registerCheckpointRoutes(on, { bodyOf, isSeatName, checkpoints, seatOf }) {
  const pathOf = (seat, wanted = "") => {
    const trees = (seat?.trees || []).filter((one) => one?.path);
    return (wanted ? trees.find((one) => one.path === wanted) : trees[0])?.path || "";
  };

  const find = (name, wanted) => {
    if (!isSeatName(name)) return { error: "unknown session", status: 400 };
    const seat = seatOf(name);
    if (!seat || seat.where !== "local") return { error: "checkpoints are kept for chats on this machine", status: 409 };
    const path = pathOf(seat, wanted);
    if (!path) return { error: "this chat has no worktree", status: 409 };
    return { seat, path };
  };

  on("GET", "/api/checkpoints", async (req, res, url, json) => {
    const found = find(url.searchParams.get("name"), url.searchParams.get("path") || "");
    if (found.error) return json({ error: found.error }, found.status);
    return json({ path: found.path, turns: await checkpoints.turns(found.seat.name, found.path) });
  });

  on("GET", "/api/checkpoints/diff", async (req, res, url, json) => {
    const found = find(url.searchParams.get("name"), url.searchParams.get("path") || "");
    if (found.error) return json({ error: found.error }, found.status);
    const said = await checkpoints.diff(found.seat.name, found.path, url.searchParams.get("ordinal"));
    return json(said, said.error ? 409 : 200);
  });

  on("POST", "/api/checkpoints/restore", async (req, res, url, json) => {
    const data = await bodyOf(req);
    const found = find(data.name, data.path || "");
    if (found.error) return json({ error: found.error }, found.status);
    if (BUSY.has(found.seat.state)) return json({ error: "the chat is working — stop it before going back" }, 409);
    const said = await checkpoints.restore(found.seat.name, found.path, data.ordinal);
    return json(said, said.error ? 409 : 200);
  });
}

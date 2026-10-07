export function registerSlackRoutes(on, context) {
  const { bodyOf, bridgeFor, isSeatName, linkerFor = () => null } = context;

  on("POST", "/api/slack/link", async (req, res, url, json) => {
    const linker = linkerFor();
    if (!linker) return json({ error: "this hive cannot link to slack" }, 503);
    const made = await linker.start();
    return made.error ? json({ error: made.error }, 502) : json(made);
  });

  on("DELETE", "/api/slack/link", async (req, res, url, json) => {
    const linker = linkerFor();
    if (!linker) return json({ error: "this hive cannot link to slack" }, 503);
    return json(linker.forget());
  });

  on("POST", "/api/slack/reply", async (req, res, url, json) => {
    const said = await bodyOf(req);
    const seat = String(said.name || "");
    if (!isSeatName(seat)) return json({ error: "which chat is answering?" }, 400);
    const bridge = bridgeFor();
    if (!bridge) return json({ error: "no slack bridge on this machine" }, 503);
    const sent = await bridge.replyFromSeat(seat, String(said.text || ""));
    return sent.error ? json({ error: sent.error }, 409) : json(sent);
  });

  on(null, "/api/slack", async (req, res, url, json) => {
    const bridge = bridgeFor();
    const link = linkerFor()?.state() || null;
    if (!bridge) return json({ running: false, why: "no slack bridge on this machine", chats: [], link });
    return json({ ...bridge.state(), chats: await bridge.chats(), link });
  });
}

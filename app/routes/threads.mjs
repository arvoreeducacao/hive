export function registerThreadRoutes(on, context) {
  const {
    bodyOf,
    liveSessions,
    threadKey,
    threadCache,
    collectThreads,
    readThreadRegistry,
    writeThreadRegistry,
    replyOnSlack,
    reactOnSlack,
    markOnSlack,
    slackFileOut,
    now = () => new Date()
  } = context;

  on(null, "/api/threads", async (req, res, url, json) => {
    return json({ threads: await collectThreads(liveSessions(), url.searchParams.get("close") ? 8000 : 45000) });
  });

  on("POST", "/api/threads/register", async (req, res, url, json) => {
    const { url: link, session } = await bodyOf(req);
    const key = threadKey(link);
    if (!key) return json({ error: "send the link of a Slack thread" }, 400);
    const registry = await readThreadRegistry();
    const known = registry.find((thread) => thread.key === key);
    if (!known) registry.push({ key, link, session: session || "", at: now().toISOString() });
    else if (!known.session && session) known.session = session;
    await writeThreadRegistry(registry);
    threadCache.delete(key);
    return json({ ok: true, key });
  });

  on("POST", "/api/threads/reply", async (req, res, url, json) => {
    const said = await bodyOf(req);
    return json(await replyOnSlack(said.key, said.text));
  });

  on("POST", "/api/threads/react", async (req, res, url, json) => {
    const said = await bodyOf(req);
    return json(await reactOnSlack(said.key, said.ts, said.name, said.on !== false));
  });

  on("POST", "/api/threads/read", async (req, res, url, json) => {
    const said = await bodyOf(req);
    return json(await markOnSlack(said.key, said.ts));
  });

  on(null, "/api/threads/file", async (req, res, url, json) => {
    const out = await slackFileOut(url.searchParams.get("id"), !!url.searchParams.get("whole"));
    if (!out.ok) return json({ error: out.error }, 404);
    res.writeHead(200, { "content-type": out.kind, "cache-control": "private, max-age=600" });
    return res.end(out.bytes);
  });
}

const RELATIVE_PRINT = /(<img\b[^>]*?\bsrc=|<a\b[^>]*?\bhref=)"(prints\/[\w.-]+)"/g;

export function withShelfFiles(html, slug) {
  return String(html).replace(RELATIVE_PRINT, (m, head, file) => `${head}"/api/shelf/file?slug=${encodeURIComponent(slug)}&f=${encodeURIComponent(file)}"`);
}

export function registerArtifactRoutes(on, context) {
  const {
    bodyOf,
    isSeatName,
    keepArtifact,
    askedTab,
    mirrorToShelf,
    artifactIndex,
    artifactKey,
    keptArtifacts,
    ARTIFACT_HOME,
    readFileSync,
    join,
    canonicalLabel,
    SHELF_SLUG,
    TABS,
    readShelfPage,
    SHELF_HOME,
    shelfRepoUrl,
    shelfPull,
    shelfIndex,
    getDev,
    leafUrl = () => "",
    pullPage = async () => null,
    readShelfComments = () => ({ comments: [] }),
    commentOnShelf = async () => ({ error: "comments are not wired on this hive" }),
    settleShelfComment = async () => ({ error: "comments are not wired on this hive" }),
    seatIsOnAPage = () => false,
    whoIsOnThePage = async () => [],
    publishPanel = async () => {},
    withPinShim = (html) => html,
    keepPrintToShelf = async () => ({ error: "prints are not wired on this hive" }),
    readShelfFile = () => ({ error: "files are not wired on this hive" }),
    keepThumbOnShelf = async () => ({ error: "thumbnails are not wired on this hive" }),
    readShelfThumb = () => ({ error: "thumbnails are not wired on this hive" }),
    now = Date.now
  } = context;

  on("POST", "/api/artifact/keep", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const wanted = askedTab(asked.tab);
    const index = await keepArtifact({
      session: asked.name,
      where: asked.where === "cloud" ? "cloud" : "local",
      path: String(asked.path || ""),
      label: String(asked.label || ""),
      url: String(asked.url || ""),
      at: Number(asked.at) || now(),
      tab: wanted.tab
    });
    const alsoShelve = asked.shelve !== false && !wanted.error;
    if (!index.error && alsoShelve) mirrorToShelf({
      session: asked.name,
      where: asked.where === "cloud" ? "cloud" : "local",
      path: String(asked.path || ""),
      label: String(asked.label || ""),
      url: String(asked.url || ""),
      tab: wanted.tab,
      at: Number(asked.at) || now()
    }).catch(() => {});
    return json(index, index.error ? 404 : 200);
  });

  on(null, "/api/artifact/index", async (req, res, url, json) => {
    const name = url.searchParams.get("name");
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    return json(artifactIndex(artifactKey(name, url.searchParams.get("path") || "")) || { versions: [] });
  });

  on(null, "/api/artifacts", async (req, res, url, json) => {
    return json({ pages: keptArtifacts() });
  });

  on(null, "/api/artifact/page", async (req, res, url, json) => {
    const key = String(url.searchParams.get("key") || "");
    if (!/^[a-f0-9]{12}$/.test(key)) return json({ error: "that is not a page this hive kept" }, 400);
    const index = artifactIndex(key);
    const versions = index?.versions || [];
    const wanted = Number(url.searchParams.get("v")) || 0;
    const pick = versions.find((version) => version.n === wanted) || versions[versions.length - 1];
    if (!pick) return json({ error: "nothing kept for that page" }, 404);
    let html;
    try { html = readFileSync(join(ARTIFACT_HOME, key, `v${pick.n}.html`)); } catch {
      return json({ error: "that version is no longer on disk" }, 404);
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "content-length": html.length
    });
    return res.end(html);
  });

  on("POST", "/api/shelf/publish", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const published = {
      session: asked.name,
      where: asked.where === "cloud" ? "cloud" : "local",
      path: String(asked.path || ""),
      label: canonicalLabel(asked.label),
      url: String(asked.url || ""),
      at: Number(asked.at) || now()
    };
    const wanted = askedTab(asked.tab);
    if (wanted.error) return json({ error: wanted.error }, 400);
    const kept = await keepArtifact({ ...published, tab: wanted.tab });
    const sent = await mirrorToShelf({ ...published, tab: wanted.tab });
    return json({ ...sent, kept: kept.error ? "" : kept.key }, sent.error ? 400 : 200);
  });

  on(null, "/api/shelf/page", async (req, res, url, json) => {
    const slug = String(url.searchParams.get("slug") || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const pull = await pullPage(slug).catch(() => null);
    if (pull) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.write(pull.start);
      return res.end(await pull.rest());
    }
    const asked = String(url.searchParams.get("tab") || "");
    const tab = TABS.includes(asked) ? asked : TABS[0];
    const page = readShelfPage(SHELF_HOME, slug, tab, Number(url.searchParams.get("v")) || 0);
    if (page.error) return json(page, 404);
    const html = Buffer.from(withPinShim(withShelfFiles(String(page.html), slug)));
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "content-length": html.length
    });
    return res.end(html);
  });

  on(null, "/api/shelf/file", async (req, res, url, json) => {
    const slug = String(url.searchParams.get("slug") || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const file = readShelfFile(slug, String(url.searchParams.get("f") || ""));
    if (file.error) return json(file, 404);
    res.writeHead(200, { "content-type": file.type, "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600", "content-length": file.data.length });
    return res.end(file.data);
  });

  on(null, "/api/shelf/thumb", async (req, res, url, json) => {
    const slug = String(url.searchParams.get("slug") || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const shot = readShelfThumb(slug, String(url.searchParams.get("tab") || ""), Number(url.searchParams.get("v")) || 0);
    if (shot.error) return json(shot, 404);
    res.writeHead(200, { "content-type": "image/png", "x-content-type-options": "nosniff", "cache-control": "private, max-age=31536000, immutable", "content-length": shot.data.length });
    return res.end(shot.data);
  });

  on("POST", "/api/shelf/thumb/taken", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (asked.oversized) return json({ error: "that thumbnail is too big" }, 413);
    const kept = await keepThumbOnShelf({ id: String(asked.id || ""), data: String(asked.data || "") });
    return json(kept, kept.error ? 400 : 200);
  });

  on("POST", "/api/shelf/keep-print", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const kept = await keepPrintToShelf({
      session: asked.name,
      slug: String(asked.slug || ""),
      caption: String(asked.caption || ""),
      data: String(asked.data || ""),
      from: String(asked.path || ""),
      after: asked.after === undefined ? "last" : String(asked.after),
      at: Number(asked.at) || now()
    });
    return json(kept, kept.error ? 400 : 200);
  });

  on(null, "/api/shelf/comments", async (req, res, url, json) => {
    const slug = String(url.searchParams.get("slug") || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const pulled = url.searchParams.get("pull") === "1" ? await shelfPull() : { ok: true };
    return json({ me: getDev() || "", ...readShelfComments(SHELF_HOME, slug), ...(pulled.error ? { error: pulled.error } : {}) });
  });

  on("POST", "/api/shelf/comment", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const slug = String(asked.slug || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const said = await commentOnShelf({
      slug,
      tab: TABS.includes(asked.tab) ? asked.tab : "",
      v: Number(asked.v) || 0,
      text: String(asked.text || ""),
      pin: asked.pin && typeof asked.pin === "object" ? asked.pin : null,
      re: String(asked.re || ""),
      seat: asked.seat && isSeatName(String(asked.seat)) ? String(asked.seat) : "",
      agent: asked.agent === true,
      quiet: asked.quiet === true,
      at: now()
    });
    return json(said, said.comment ? 200 : 400);
  });

  on("POST", "/api/shelf/here", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.seat)) return json({ error: "unknown session" }, 400);
    const slug = String(asked.slug || "");
    if (slug && !SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const moved = seatIsOnAPage({
      seat: String(asked.seat),
      slug,
      tab: TABS.includes(asked.tab) ? asked.tab : "",
      el: String(asked.el || "").slice(0, 120),
      at: now()
    });
    if (moved) publishPanel().catch(() => {});
    return json({ ok: true });
  });

  on(null, "/api/shelf/watching", async (req, res, url, json) => {
    const slug = String(url.searchParams.get("slug") || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    return json({ watching: await whoIsOnThePage(slug) });
  });

  on("POST", "/api/shelf/comment/settle", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const slug = String(asked.slug || "");
    if (!SHELF_SLUG.test(slug)) return json({ error: "that is not a page on the shelf" }, 400);
    const said = await settleShelfComment({ slug, id: String(asked.id || ""), done: asked.done !== false, at: now() });
    return json(said, said.comment ? 200 : 400);
  });

  on(null, "/api/shelf", async (req, res, url, json) => {
    const repo = await shelfRepoUrl();
    if (!repo) return json({ repo: "", pages: [], error: "no shelf repo yet" });
    if (url.searchParams.get("pull") === "1") {
      const pulled = await shelfPull();
      if (pulled.error) return json({ repo, pages: shelfIndex(SHELF_HOME).pages, error: pulled.error });
    }
    return json({ repo, me: getDev() || "", leaf: leafUrl(), ...shelfIndex(SHELF_HOME) });
  });
}

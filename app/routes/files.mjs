export function registerFilesRoutes(on, {
  bodyOf,
  isSeatName,
  seatFiles,
  rankFiles,
  fileIndex,
  indexCache,
  rankIndex,
  searchCode,
  writeRepoFile,
  readRepoFile,
  languageOf,
  paintLines,
  now = Date.now
}) {
  on(null, "/api/files", async (req, res, url, json) => {
    const name = url.searchParams.get("name");
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const q = String(url.searchParams.get("q") || "");
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    try {
      return json({ files: rankFiles(await seatFiles(name, where), q) });
    } catch (e) {
      return json({ files: [], error: String(e?.message || e).slice(0, 160) });
    }
  });

  on(null, "/api/index", async (req, res, url, json) => {
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const rows = await fileIndex(where, !!url.searchParams.get("force"));
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 30));
    return json({
      where,
      total: rows.length,
      at: indexCache.get(where)?.at || 0,
      files: rankIndex(rows, url.searchParams.get("q") || "", limit).map((file) => ({ ...file, where }))
    });
  });

  on(null, "/api/code", async (req, res, url, json) => {
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const started = now();
    const found = await searchCode({ q: url.searchParams.get("q") || "", where, glob: url.searchParams.get("glob") || "" });
    return json({ ...found, where, ms: now() - started, hits: found.hits.map((hit) => ({ ...hit, where })) });
  });

  on("POST", "/api/file", async (req, res, url, json) => {
    const data = await bodyOf(req);
    if (data.oversized) return json({ error: "too big to save" }, 413);
    const where = data.where === "cloud" ? "cloud" : "local";
    const saved = await writeRepoFile({ repo: String(data.repo || ""), path: String(data.path || ""), where, text: data.text });
    return json(saved, saved.error ? 400 : 200);
  });

  on(null, "/api/file", async (req, res, url, json) => {
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const path = String(url.searchParams.get("path") || "");
    const got = await readRepoFile({ repo: String(url.searchParams.get("repo") || ""), path, where });
    if (got.error) return json(got, 404);
    const language = languageOf(path);
    const lines = got.text.split("\n");
    const at = Math.max(0, Number(url.searchParams.get("at")) || 0);
    const from = at > 8 ? at - 8 : 1;
    const wanted = !!url.searchParams.get("preview");
    return json({
      text: wanted ? "" : got.text,
      language,
      lines: lines.length,
      size: got.text.length,
      from,
      preview: wanted ? paintLines(lines.slice(from - 1, from - 1 + 80).join("\n"), language) : null
    });
  });
}

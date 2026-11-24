import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE_MAX_BYTES = 8 << 20;
const PREVIEW_WAIT = 60000;
const PREVIEW_IMAGE_MAX = 24 << 20;
const CONSOLE_LINES = 50;
const CONSOLE_LEVELS = new Set(["log", "info", "warning", "error"]);

const PAGE_ON_POD = `
d="\${HIVE_STATE_DIR:-\${HIVE_HOME:-/workspace/hive}}"
f="$d/renders/$1/$2.html"
[ -f "$f" ] || { echo "there is no page $2 for $1 on the pod" >&2; exit 3; }
exec cat -- "$f"
`;

const APP_ON_POD = `
d="\${HIVE_STATE_DIR:-\${HIVE_HOME:-/workspace/hive}}"
f="$d/mcp-apps/$1/$2.$3"
[ -f "$f" ] || { echo "there is no app $2 for $1 on the pod" >&2; exit 3; }
exec cat -- "$f"
`;

const previews = new Map();

export const renderShots = () => [...previews.values()].filter((job) => !job.taken).map(({ id, width, appearance }) => ({ id, width, appearance }));

const consoleOf = (lines) => (Array.isArray(lines) ? lines : [])
  .slice(0, CONSOLE_LINES)
  .map((line) => ({ level: CONSOLE_LEVELS.has(line?.level) ? line.level : "log", text: String(line?.text ?? "").slice(0, 2000) }));

function holdPreview({ html, width, appearance }) {
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      previews.delete(id);
      resolve({ error: "the preview timed out — the Hive window has to be open and on screen to draw the page" });
    }, PREVIEW_WAIT);
    previews.set(id, { id, html, width, appearance, resolve, timer, taken: false });
  });
}

export function registerRenderRoutes(on, { isSeatName, bodyOf, HIVE_HOME, bytesFromServer }) {
  on("GET", "/api/render/page", async (req, res, url, json) => {
    const name = String(url.searchParams.get("name") || "");
    const id = String(url.searchParams.get("id") || "");
    const where = String(url.searchParams.get("where") || "local");
    if (!isSeatName(name) || !PAGE_ID.test(id)) return json({ error: "that is not a page of a chat" }, 400);
    let html;
    if (where === "cloud") {
      const read = await bytesFromServer(PAGE_ON_POD, [name, id], { timeout: 30000 });
      if (!read.ok) return json({ error: read.error || "the server did not hand the page over" }, 404);
      html = read.data;
    } else {
      try { html = await readFile(join(HIVE_HOME, "renders", name, `${id}.html`)); } catch {
        return json({ error: "this page is no longer on disk" }, 404);
      }
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
      "content-length": html.length
    });
    return res.end(html);
  });

  on("GET", "/api/render/app", async (req, res, url, json) => {
    const name = String(url.searchParams.get("name") || "");
    const id = String(url.searchParams.get("id") || "");
    const where = String(url.searchParams.get("where") || "local");
    const part = url.searchParams.get("part") === "meta" ? "json" : "html";
    if (!isSeatName(name) || !PAGE_ID.test(id)) return json({ error: "that is not an app of a chat" }, 400);
    let body;
    if (where === "cloud") {
      const read = await bytesFromServer(APP_ON_POD, [name, id, part], { timeout: 30000 });
      if (!read.ok) return json({ error: read.error || "the server did not hand the app over" }, 404);
      body = read.data;
    } else {
      try { body = await readFile(join(HIVE_HOME, "mcp-apps", name, `${id}.${part}`)); } catch {
        return json({ error: "this app is no longer on disk" }, 404);
      }
    }
    res.writeHead(200, {
      "content-type": part === "json" ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
      "content-length": body.length
    });
    return res.end(body);
  });

  on("POST", "/api/render/preview", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const html = typeof asked.html === "string" ? asked.html : "";
    if (!isSeatName(String(asked.name || ""))) return json({ error: "only a chat in the hive previews a page" }, 400);
    if (!html.trim() || Buffer.byteLength(html, "utf8") > PAGE_MAX_BYTES) return json({ error: "there is no page to preview, or it is too big" }, 400);
    const width = Math.min(1600, Math.max(240, Math.round(Number(asked.width)) || 728));
    const appearance = asked.appearance === "light" ? "light" : "dark";
    const done = await holdPreview({ html, width, appearance });
    return json(done.error ? { error: done.error } : done);
  });

  on("GET", "/api/render/preview/source", async (req, res, url, json) => {
    const job = previews.get(String(url.searchParams.get("id") || ""));
    if (!job) return json({ error: "that preview is no longer waiting" }, 404);
    job.taken = true;
    const html = Buffer.from(job.html, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-length": html.length });
    return res.end(html);
  });

  on("POST", "/api/render/preview/result", async (req, res, url, json) => {
    const said = await bodyOf(req);
    const job = previews.get(String(said.id || ""));
    if (!job) return json({ ok: true, stale: true });
    clearTimeout(job.timer);
    previews.delete(job.id);
    if (said.error) {
      job.resolve({ error: String(said.error).slice(0, 500) });
      return json({ ok: true });
    }
    const image = String(said.image || "");
    if (!image.startsWith("data:image/png;base64,") || image.length > PREVIEW_IMAGE_MAX) {
      job.resolve({ error: "the preview came back without a picture" });
      return json({ ok: true });
    }
    job.resolve({
      ok: true,
      image,
      contentHeight: Math.max(0, Math.round(Number(said.contentHeight)) || 0),
      capturedHeight: Math.max(0, Math.round(Number(said.capturedHeight)) || 0),
      console: consoleOf(said.console)
    });
    return json({ ok: true });
  });
}

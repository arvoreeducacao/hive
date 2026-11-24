import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { ATTACHMENT_BYTES, IMAGE_MAX_EDGE, extensionOf } from "../assets/drops.mjs";

const POD_ASSETS = "/workspace/hive/assets";

const CONVERT_TIMEOUT_MS = 60_000;

export function storedNameOf(file, slug) {
  const raw = basename(String(file || "").replace(/\\/g, "/"));
  const ext = extensionOf(raw) || "bin";
  const stem = slug(raw.replace(/\.[A-Za-z0-9]{1,8}$/, "")) || "file";
  return `${stem}.${ext}`;
}

export function streamToFile(req, path, ceiling) {
  return new Promise((resolve) => {
    const out = createWriteStream(path);
    let size = 0;
    let over = false;
    const fail = (error) => {
      out.destroy();
      rm(path, { force: true }).finally(() => resolve({ error }));
    };
    out.on("error", () => fail("broken"));
    req.on("error", () => fail("broken"));
    req.on("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > ceiling) {
        over = true;
        return fail("too-big");
      }
      if (!out.write(chunk)) {
        req.pause?.();
        out.once("drain", () => req.resume?.());
      }
    });
    req.on("end", () => {
      if (over) return;
      out.end(() => (size ? resolve({ size }) : fail("empty")));
    });
  });
}

export function convertWithSips(path, { platform = process.platform, run = execFile } = {}) {
  if (platform !== "darwin") return Promise.resolve({ error: "unreadable" });
  const out = path.replace(/\.[A-Za-z0-9]{1,8}$/, "") + ".jpg";
  return new Promise((resolve) => {
    run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", "-Z", String(IMAGE_MAX_EDGE), path, "--out", out], { timeout: CONVERT_TIMEOUT_MS }, (wrong) => {
      resolve(wrong ? { error: "unreadable" } : { path: out });
    });
  });
}

const REFUSALS = {
  "too-big": ["that file is over the attachment limit", 413],
  empty: ["that file came in empty", 400],
  broken: ["the file did not finish arriving", 400],
  unreadable: ["that picture could not be read as an image", 422]
};

export function registerAttachmentRoutes(on, context) {
  const { isSeatName, shotsDirOf, assetsDir, cloudReach, slug, readAttachment, convertImage = convertWithSips, now = Date.now, ceiling = ATTACHMENT_BYTES } = context;

  on("POST", "/api/attachment", async (req, res, url, json) => {
    const seat = url.searchParams.get("name") || "";
    if (seat && !isSeatName(seat)) return json({ error: "that is not a chat this hive knows" }, 400);
    const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
    const stamp = `${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const folder = join(seat ? shotsDirOf(seat) : assetsDir, "files", stamp);
    await mkdir(folder, { recursive: true });
    let path = join(folder, storedNameOf(url.searchParams.get("file"), slug));
    const saved = await streamToFile(req, path, ceiling);
    const refuse = (code) => {
      const [error, status] = REFUSALS[code] || REFUSALS.broken;
      return json({ error, code }, status);
    };
    if (saved.error) {
      await rm(folder, { recursive: true, force: true });
      return refuse(saved.error);
    }
    let size = saved.size;
    if (url.searchParams.get("convert") === "jpeg") {
      const made = await convertImage(path);
      if (made.error) {
        await rm(folder, { recursive: true, force: true });
        return refuse(made.error);
      }
      if (made.path !== path) await rm(path, { force: true });
      path = made.path;
      size = (await stat(path)).size;
    }
    if (where !== "cloud") return json({ ok: true, path, name: basename(path), size });
    const remote = `${POD_ASSETS}/${stamp}-${basename(path)}`;
    const put = await cloudReach.putFile(remote, await readFile(path));
    if (put.error) return json({ error: put.error }, 502);
    return json({ ok: true, path: put.path || remote, name: basename(path), size });
  });

  on("GET", "/api/attachment", async (req, res, url, json) => {
    const read = await readAttachment({
      path: url.searchParams.get("path") || "",
      where: url.searchParams.get("where") === "cloud" ? "cloud" : "local",
      session: url.searchParams.get("name") || ""
    });
    if (read.error) return json({ error: read.error }, 404);
    res.writeHead(200, { "content-type": read.type, "cache-control": "no-store", "content-length": read.data.length, "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
    return res.end(read.data);
  });
}

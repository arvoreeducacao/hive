import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";

const browserWants = new Map();
let browserSeq = 0;
const browserOps = new Map();
const browserJobs = new Map();

const UPLOAD_CEILING = 25 << 20;
const SECRET_PATHS = [/\/\.ssh\//, /\/\.aws\//, /\/\.gnupg\//, /\/\.hive\//, /\/\.config\/gh\//, /\/\.claude\//, /\/\.codex\//, /\/\.kimi\//, /\/\.kiro\//, /\/\.cursor\//, /\/\.config\/cursor\//, /\/\.opencode\//, /\/\.config\/opencode\//, /\/\.local\/share\/opencode\//, /\/\.env(\.|$)/, /credentials/i];
const SECRET_KINDS = /\.(pem|key|p12|pfx|keychain|kdbx)$/i;

const refuseFile = (path) => {
  if (!path.startsWith("/")) return `${path} is not a full path — say where the file is from the root`;
  if (SECRET_PATHS.some((one) => one.test(path)) || SECRET_KINDS.test(path)) return `${path} looks like a secret, and a page is never where one goes`;
  let stat = null;
  try { stat = statSync(path); } catch { return `there is no file at ${path}`; }
  if (!stat.isFile()) return `${path} is not a file`;
  if (stat.size > UPLOAD_CEILING) return `${path} is bigger than ${Math.round(UPLOAD_CEILING / (1 << 20))}MB`;
  return "";
};

const BROWSER_OP_WAIT = 20000;
const BROWSER_OP_HOLD = 12000;

const holdBrowserOp = (seat, op, { wait = BROWSER_OP_WAIT, timeout = "" } = {}) => {
  const id = randomUUID();
  const ops = browserOps.get(seat) || [];
  ops.push({ id, ...op });
  browserOps.set(seat, ops);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      browserJobs.delete(id);
      browserOps.set(seat, (browserOps.get(seat) || []).filter((o) => o.id !== id));
      resolve({ error: timeout || `the ${op.op} timed out — the page did not answer` });
    }, wait);
    browserJobs.set(id, { resolve, timer });
  });
};

export const browserState = (name) => {
  const want = browserWants.get(name) || null;
  const ops = browserOps.get(name) || [];
  return want || ops.length ? { want, ops } : null;
};

const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const REF_SHAPE = /^e\d{1,4}$/;
const REF_HINT = "a ref looks like e12 and comes from browser_snapshot";

export function registerBrowserRoutes(on, ctx) {
  const { isSeatName, bodyOf, fleet, saveFiles, onTheServer, cloudReach, typeText } = ctx;

  const held = (op, timeout, wait = BROWSER_OP_HOLD) => async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const built = op(asked);
    if (built.error) return json({ error: built.error }, 400);
    const done = await holdBrowserOp(asked.name, built, { wait, timeout });
    return json(done, done.error ? 502 : 200);
  };
  const waiting = (op) => held(op, "", BROWSER_OP_WAIT);

  const seatSide = (name) => {
    const seat = [...fleet.values()].find((x) => x.name === name);
    return { seat, where: seat?.where === "cloud" ? "cloud" : "local" };
  };

  const copyCrop = async (crop, name, where) => {
    if (!crop) return "";
    const saved = await saveFiles(crop, name);
    if (!saved.files || !saved.files.length) return "";
    if (where !== "cloud") return ` · ${saved.files[0]}`;
    const at = `/workspace/hive/assets/${saved.files[0].split("/").pop()}`;
    await onTheServer('mkdir -p "$HIVE_STATE_DIR/assets"', [], { timeout: 10000 }).catch(() => {});
    await cloudReach.putFile(at, await readFile(saved.files[0])).catch(() => ({}));
    return ` · ${at}`;
  };

  on("POST", "/api/browser/navigate", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const target = String(asked.url || "").trim();
    if (!target) return json({ error: "there is nothing to open" }, 400);
    browserWants.set(asked.name, { url: target, seq: ++browserSeq });
    return json({ ok: true, url: target });
  });

  on("POST", "/api/browser/shoot", held(() => ({ op: "shoot" }),
    "the shot timed out — open the browser pane on this seat and try again"));

  on("POST", "/api/browser/eval", held((asked) => {
    const code = String(asked.code || "").trim();
    if (!code) return { error: "there is nothing to run" };
    return { op: "eval", code };
  }, "the eval timed out — open the browser pane on this seat and try again"));

  on("POST", "/api/browser/print", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (asked.oversized) return json({ error: "that print is too big" }, 413);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const pageUrl = clean(asked.url, 300);
    const { seat, where } = seatSide(asked.name);
    const cropLine = await copyCrop(asked.crop, asked.name, where);
    const line = `[hive] print do navegador: ${pageUrl}${cropLine}`;
    const submit = seat && seat.state !== "needs";
    await typeText(asked.name, where, line, submit).catch(() => {});
    return json({ ok: true });
  });

  on("POST", "/api/browser/review", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const pageUrl = String(asked.url || "").replace(/[\u0000-\u001f\u007f]+/g, "").trim().slice(0, 300);
    if (!pageUrl) return json({ error: "navigate to a page first" }, 400);
    const { seat, where } = seatSide(asked.name);
    const line = `[hive] revisar esta tela: ${pageUrl}  ·  nos viewports 390 e 1440  ·  passa as 10 heurísticas de Nielsen e o copy check da tela`;
    const submit = seat && seat.state !== "needs";
    await typeText(asked.name, where, line, submit).catch(() => {});
    return json({ ok: true });
  });

  on("POST", "/api/browser/reference", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (asked.oversized) return json({ error: "that crop is too big" }, 413);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const selector = clean(asked.selector, 200);
    if (!selector) return json({ error: "nothing pointed at" }, 400);
    const text = clean(asked.text, 120);
    const pageUrl = clean(asked.url, 300);
    const st = asked.styles || {};
    const bits = [st["font-size"], st["font-weight"], st["color"], st["padding"] ? `pad ${clean(st["padding"], 40)}` : ""].map((x) => clean(x, 40)).filter(Boolean);
    const { seat, where } = seatSide(asked.name);
    const cropLine = await copyCrop(asked.crop, asked.name, where);
    const said = clean(asked.said, 2000);
    const line = `[hive] ${said ? `${said} · ` : ""}referência do navegador: <${selector}>${text ? ` "${text}"` : ""}${pageUrl ? ` · ${pageUrl}` : ""}${bits.length ? ` · ${bits.join(" ")}` : ""}${cropLine}`;
    const submit = seat && seat.state !== "needs";
    await typeText(asked.name, where, line, submit).catch(() => {});
    return json({ ok: true });
  });

  on("POST", "/api/browser/profile", held((asked) => {
    const profile = String(asked.profile || "");
    if (!["teacher", "principal", "teacher2", "student"].includes(profile)) return { error: "use teacher, principal, teacher2 or student" };
    return { op: "profile", profile };
  }, "the profile change timed out — open the browser pane and navigate to the page first"));

  on("POST", "/api/browser/set-cookie", held((asked) => {
    const cookieName = String(asked.cookieName || "");
    if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) return { error: "cookie name must be letters, numbers, _ or -" };
    return { op: "setcookie", cookieName, value: String(asked.value || "").slice(0, 4096) };
  }, "the cookie write timed out — open the browser pane and navigate to the page first"));

  on("POST", "/api/browser/cookies", held(() => ({ op: "cookies" }),
    "the cookie read timed out — open the browser pane and navigate to the page first"));

  on("POST", "/api/browser/viewport", held((asked) => {
    const reset = asked.reset === true;
    const width = Math.round(Number(asked.width) || 0);
    const height = Math.round(Number(asked.height) || 0);
    if (!reset && (width < 200 || width > 3840 || height < 200 || height > 3840)) return { error: "give a width and height between 200 and 3840, or reset:true" };
    return { op: "viewport", reset, width, height, mobile: asked.mobile === true };
  }, "the viewport change timed out — open the browser pane on this seat and try again"));

  on("POST", "/api/browser/console", held(() => ({ op: "console" }),
    "the console read timed out — open the browser pane and navigate to the page first"));

  on("POST", "/api/browser/map", waiting(() => ({ op: "map" })));

  on("POST", "/api/browser/click", waiting((asked) => {
    const ref = String(asked.ref || "").trim();
    if (!REF_SHAPE.test(ref)) return { error: REF_HINT };
    return { op: "click", ref };
  }));

  on("POST", "/api/browser/type", waiting((asked) => {
    const ref = String(asked.ref || "").trim();
    if (!REF_SHAPE.test(ref)) return { error: REF_HINT };
    const text = String(asked.text ?? "");
    if (text.length > 4000) return { error: "that is more text than a field takes" };
    return { op: "type", ref, text, submit: asked.submit === true };
  }));

  on("POST", "/api/browser/key", waiting((asked) => {
    const key = String(asked.key || "").trim();
    if (!key) return { error: "there is no key to press" };
    return { op: "key", key };
  }));

  on("POST", "/api/browser/wait", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const text = String(asked.text || "").trim();
    if (!text) return json({ error: "there is nothing to wait for" }, 400);
    const seconds = Math.min(60, Math.max(1, Number(asked.seconds) || 10));
    const done = await holdBrowserOp(asked.name, { op: "wait", text, gone: asked.gone === true, seconds }, { wait: (seconds + 5) * 1000 });
    return json(done, done.error ? 502 : 200);
  });

  on("POST", "/api/browser/choose", waiting((asked) => {
    const ref = String(asked.ref || "").trim();
    if (!REF_SHAPE.test(ref)) return { error: REF_HINT };
    const option = String(asked.option || "").trim();
    if (!option) return { error: "there is no option to choose" };
    return { op: "choose", ref, option };
  }));

  on("POST", "/api/browser/tabs", waiting((asked) => {
    const act = String(asked.act || "list").trim();
    if (!["list", "open", "select", "close"].includes(act)) return { error: "tabs can list, open, select or close" };
    return { op: "tabs", act, url: String(asked.url || ""), index: Number(asked.index) || 0 };
  }));

  on("POST", "/api/browser/step", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const way = String(asked.way || "").trim();
    if (!["back", "forward", "reload"].includes(way)) return json({ error: "a step is back, forward or reload" }, 400);
    const done = await holdBrowserOp(asked.name, { op: "step", way }, { wait: 30000 });
    return json(done, done.error ? 502 : 200);
  });

  on("POST", "/api/browser/upload", waiting((asked) => {
    const ref = String(asked.ref || "").trim();
    if (!REF_SHAPE.test(ref)) return { error: REF_HINT };
    const files = (Array.isArray(asked.files) ? asked.files : []).map((one) => String(one || "").trim()).filter(Boolean);
    if (!files.length) return { error: "there is no file to hand over" };
    if (files.length > 5) return { error: "five files is as many as one field takes here" };
    for (const file of files) {
      const no = refuseFile(file);
      if (no) return { error: no };
    }
    return { op: "upload", ref, files };
  }));

  on("POST", "/api/browser/network", waiting((asked) => ({ op: "network", about: String(asked.about || "").slice(0, 200), failedOnly: asked.failedOnly === true })));

  on("POST", "/api/browser/result", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const job = browserJobs.get(asked.id);
    if (!job) return json({ ok: true, stale: true });
    clearTimeout(job.timer);
    browserJobs.delete(asked.id);
    for (const [seat, ops] of browserOps) browserOps.set(seat, ops.filter((o) => o.id !== asked.id));
    if (asked.error) job.resolve({ error: String(asked.error) });
    else if (asked.image !== undefined) job.resolve({ ok: true, image: String(asked.image) });
    else if (asked.value !== undefined) job.resolve({ ok: true, value: asked.value });
    else if (asked.lines !== undefined) job.resolve({ ok: true, lines: asked.lines });
    else if (asked.cookies !== undefined) job.resolve({ ok: true, cookies: asked.cookies });
    else if (asked.profile !== undefined) job.resolve({ ok: true, profile: asked.profile });
    else job.resolve({ ok: true });
    return json({ ok: true });
  });
}

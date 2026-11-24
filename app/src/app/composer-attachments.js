import { esc, phrase } from "./core.js";
import { ATTACHMENT_LIMIT, IMAGE_BYTES, IMAGE_MAX_EDGE, admitAttachments, formatAttachmentSize, isHeic } from "/assets/drops.mjs";
import { attachmentIcon, fileIconName } from "./attachment-icons.js";
import { middleCut } from "./context-chips.js";
import { filePreviewKind } from "./file-preview.js";
import { toast } from "./composer-toast.js";
import { openAttachmentPreview } from "./attachment-preview.js";

const FILE_MARK_RE = /\[File #(\d+)\]/g;

const QUALITY_STEPS = [0.92, 0.85, 0.78, 0.68];

const EDGE_STEPS = [1, 0.75, 0.55];

const SAME_FORMAT = new Set(["image/png", "image/jpeg"]);

let recordSeq = 0;

const fileMark = (n) => `[File #${n}]`;

function objectUrlOf(blob) {
  try { return URL.createObjectURL(blob); } catch { return ""; }
}

function fileMarkSpans(said) {
  FILE_MARK_RE.lastIndex = 0;
  return [...String(said ?? "").matchAll(FILE_MARK_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, n: Number(m[1]) }));
}

const fileMarkInk = (said) => fileMarkSpans(said).map((spot) => ({ start: spot.start, end: spot.end, cls: "ink-chip ink-file" }));

const mentionOf = (path) => (/^[\w./~-]+$/.test(path) ? `@${path}` : `@"${path}"`);

function outboundFileMarks(text, records) {
  FILE_MARK_RE.lastIndex = 0;
  return String(text ?? "").replace(FILE_MARK_RE, (mark, n) => {
    const rec = records.get(Number(n));
    return rec?.path ? mentionOf(rec.path) : mark;
  });
}

function fitWithin(width, height, edge = IMAGE_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= edge) return { width, height, scaled: false };
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scaled: true };
}

const jpegNameOf = (name) => `${String(name || "image").replace(/\.[A-Za-z0-9]{1,8}$/, "") || "image"}.jpg`;

async function decodeBitmap(blob) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch { return null; }
}

async function encodeBitmap(bitmap, { width, height, type, quality, matte = false }) {
  const canvas = new OffscreenCanvas(width, height);
  const paint = canvas.getContext("2d");
  if (matte) {
    paint.fillStyle = "#fff";
    paint.fillRect(0, 0, width, height);
  }
  paint.imageSmoothingQuality = "high";
  paint.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type, quality });
}

async function squeezeWithin(bitmap, { forceJpeg = false } = {}) {
  const probe = forceJpeg ? null : await encodeBitmap(bitmap, { width: 1, height: 1, type: "image/webp", quality: 0.9 }).catch(() => null);
  const type = probe?.type === "image/webp" ? "image/webp" : "image/jpeg";
  const edge = Math.min(IMAGE_MAX_EDGE, Math.max(bitmap.width, bitmap.height));
  for (const step of EDGE_STEPS) {
    const size = fitWithin(bitmap.width, bitmap.height, Math.round(edge * step));
    for (const quality of QUALITY_STEPS) {
      const blob = await encodeBitmap(bitmap, { ...size, type, quality, matte: type === "image/jpeg" });
      if (blob.size <= IMAGE_BYTES) return { blob, type };
    }
  }
  return null;
}

const renamedTo = (name, type) => (type === "image/jpeg" ? jpegNameOf(name) : type === "image/webp" ? `${String(name).replace(/\.[A-Za-z0-9]{1,8}$/, "")}.webp` : name);

async function prepareImage(file) {
  const heic = isHeic(file);
  const bitmap = await decodeBitmap(file);
  if (!bitmap) {
    if (heic) return { blob: file, name: jpegNameOf(file.name), convert: true, sourceName: file.name };
    if (typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") return { error: "unreadable" };
    return file.size <= IMAGE_BYTES ? { blob: file, name: file.name } : { error: "too-large" };
  }
  try {
    const type = heic ? "image/jpeg" : String(file.type || "").toLowerCase();
    const size = fitWithin(bitmap.width, bitmap.height);
    let blob = file;
    let name = file.name;
    if (heic || (size.scaled && SAME_FORMAT.has(type))) {
      blob = await encodeBitmap(bitmap, { ...size, type: heic ? "image/jpeg" : type, quality: 0.92 });
      name = heic ? jpegNameOf(file.name) : file.name;
    }
    if (blob.size <= IMAGE_BYTES) return { blob, name };
    const squeezed = await squeezeWithin(bitmap, { forceJpeg: heic });
    return squeezed ? { blob: squeezed.blob, name: renamedTo(file.name, squeezed.type) } : { error: "too-large" };
  } finally {
    bitmap.close?.();
  }
}

function sendOverXhr(blob, query, onProgress) {
  const xhr = new XMLHttpRequest();
  const sent = new Promise((resolve) => {
    xhr.open("POST", `/api/attachment?${new URLSearchParams(query)}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded / ev.total); };
    xhr.onload = () => {
      let said = null;
      try { said = JSON.parse(xhr.responseText); } catch {}
      resolve(said || { error: phrase("the file did not land") });
    };
    xhr.onerror = () => resolve({ error: phrase("the app could not reach its own server") });
    xhr.onabort = () => resolve({ error: "aborted", aborted: true });
    xhr.send(blob);
  });
  sent.abort = () => xhr.abort();
  return sent;
}

const attachmentTransport = {
  send(blob, query, onProgress = () => {}) {
    if (typeof XMLHttpRequest !== "function") return Promise.resolve({ error: phrase("the app could not reach its own server") });
    return sendOverXhr(blob, query, onProgress);
  }
};

function uploadFailure(rec, said) {
  if (said?.code === "too-big") return phrase("'{name}' exceeds the {size} attachment limit.", { name: rec.name, size: "50 MB" });
  if (said?.code === "unreadable") return phrase("'{name}' could not be read as an image.", { name: rec.name });
  return String(said?.error || phrase("the file did not land"));
}

function chipTitle(rec) {
  if (rec.state === "missing") return phrase("{name} was not saved with this draft. Attach it again to send it.", { name: rec.name });
  const lines = [rec.name, rec.size ? formatAttachmentSize(rec.size) : ""].filter(Boolean);
  if (rec.state === "failed" && rec.error) lines.push("", rec.error);
  return lines.join("\n");
}

function chipSuffix(rec) {
  if (rec.state === "preparing") return phrase("Preparing");
  if (rec.state === "uploading") return `${Math.floor((rec.progress || 0) * 100)}%`;
  if (rec.state === "failed") return phrase("upload failed");
  if (rec.state === "missing") return phrase("attach again");
  return "";
}

function chipHtml(rec, { thumb = "" } = {}) {
  const size = rec.size ? formatAttachmentSize(rec.size) : "";
  const suffix = chipSuffix(rec);
  const kind = filePreviewKind(rec.name, rec.type);
  const label = kind === "video"
    ? phrase("Preview video attachment, {name}, {size}", { name: rec.name, size })
    : phrase("File attachment, {name}, {size}", { name: rec.name, size });
  const icon = rec.state === "missing" ? attachmentIcon("dashed") : thumb ? `<img alt="" src="${esc(thumb)}">` : attachmentIcon(fileIconName(rec.name, kind));
  const tip = rec.n ? `${rec.name} · ${fileMark(rec.n)}` : rec.name;
  return `<button type="button" class="af-open" aria-label="${esc(suffix ? `${label}, ${suffix}` : label)}" title="${esc(tip)}"${rec.state === "missing" ? " disabled" : ""}>`
    + `<span class="af-icon">${icon}</span><span class="af-name">${esc(middleCut(rec.name, 36))}</span>`
    + `${size ? `<span class="af-size">${esc(size)}</span>` : ""}${suffix ? `<span class="af-suffix">${esc(suffix)}</span>` : ""}</button>`
    + (rec.state === "failed" && rec.retryable ? `<button type="button" class="af-retry" aria-label="${esc(phrase("Retry upload for {name}", { name: rec.name }))}" title="${esc(rec.error || "")}">${attachmentIcon("retry")}</button>` : "")
    + `<button type="button" class="ax" aria-label="${esc(phrase("Remove {name}", { name: rec.name }))}" title="${esc(phrase("Remove {name}", { name: rec.name }))}">×</button>`;
}

function composerAttachments({ tray, box, images, target, scope = () => null, busy = () => "", onChange = () => {} }) {
  const records = new Map();
  const loose = [];
  const chips = new Map();
  const thumbs = new Map();
  let seq = 0;

  const changed = () => box.dispatchEvent(new Event("input"));
  const all = () => [...records.values(), ...loose, ...(scope() || [])];
  const thumbOf = (rec) => {
    if (rec.kind !== "image") return "";
    if (rec.blob && !thumbs.has(rec.id)) thumbs.set(rec.id, objectUrlOf(rec.blob));
    if (thumbs.get(rec.id)) return thumbs.get(rec.id);
    const at = target(rec.kind);
    return rec.path ? `/api/image?path=${encodeURIComponent(rec.path)}&where=${at.where}&name=${encodeURIComponent(at.name || "")}` : "";
  };
  const forget = (rec) => {
    rec.abort?.();
    rec.dropped = true;
    if (thumbs.has(rec.id)) {
      try { URL.revokeObjectURL(thumbs.get(rec.id)); } catch {}
      thumbs.delete(rec.id);
    }
  };

  const paint = () => {
    const shown = all();
    const keep = new Set(shown.map((rec) => rec.id));
    for (const [id, chip] of chips) if (!keep.has(id)) { chip.remove(); chips.delete(id); }
    for (const rec of shown) {
      let chip = chips.get(rec.id);
      if (!chip) {
        chip = document.createElement("div");
        chips.set(rec.id, chip);
        wireChip(chip, rec);
      }
      if (!chip.isConnected) tray.appendChild(chip);
      chip.className = `att file${rec.kind === "image" ? " image" : ""}`;
      chip.dataset.state = rec.state;
      if (rec.n) chip.dataset.file = String(rec.n);
      else delete chip.dataset.file;
      chip.title = chipTitle(rec);
      const html = chipHtml(rec, { thumb: thumbOf(rec) });
      if (chip.dataset.html !== html) {
        chip.dataset.html = html;
        chip.innerHTML = html;
      }
    }
    tray.classList.toggle("on", !!tray.querySelector(".att, .sv-paste-peek:not([hidden])"));
    onChange();
  };

  const removeRecord = (rec) => {
    forget(rec);
    if (rec.n && records.get(rec.n) === rec) {
      records.delete(rec.n);
      box.value = box.value.replace(new RegExp(`\\[File #${rec.n}\\] ?`, "g"), "");
      paint();
      changed();
      return;
    }
    const at = loose.indexOf(rec);
    if (at >= 0) loose.splice(at, 1);
    const list = scope();
    const held = list ? list.indexOf(rec) : -1;
    if (held >= 0) list.splice(held, 1);
    paint();
  };

  function wireChip(chip, rec) {
    chip.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
    chip.addEventListener("click", (ev) => {
      const hit = ev.target.closest("button");
      if (!hit) return;
      ev.stopPropagation();
      if (hit.classList.contains("ax")) return removeRecord(rec);
      if (hit.classList.contains("af-retry")) return void upload(rec);
      if (hit.classList.contains("af-open") && rec.state !== "missing") {
        const at = target(rec.kind);
        openAttachmentPreview({ fileName: rec.name, size: rec.size, type: rec.type, blob: rec.blob, path: rec.path, seat: at.name || "", where: at.where || "local", origin: "draft", remove: () => removeRecord(rec) });
      }
    });
  }

  const landed = (rec, said) => {
    if (rec.dropped) return;
    rec.abort = null;
    if (!said?.ok) {
      if (said?.aborted) return;
      rec.state = "failed";
      rec.retryable = true;
      rec.error = uploadFailure(rec, said);
      return paint();
    }
    rec.path = said.path;
    if (said.name && rec.convert) rec.name = said.name;
    rec.size = Number(said.size) || rec.size;
    rec.state = "ready";
    rec.progress = 1;
    const list = scope();
    if (rec.kind === "image" && !rec.n && !(list && list.includes(rec)) && loose.includes(rec)) {
      loose.splice(loose.indexOf(rec), 1);
      forget(rec);
      paint();
      images.add(rec.path);
      return;
    }
    paint();
  };

  async function upload(rec) {
    if (!rec.blob) {
      rec.state = "missing";
      return paint();
    }
    rec.state = "uploading";
    rec.retryable = false;
    rec.progress = 0;
    rec.error = "";
    paint();
    const at = target(rec.kind);
    const query = { name: at.name || "", where: at.where || "local", file: rec.convert ? rec.sourceName || rec.name : rec.name, ...(rec.convert ? { convert: "jpeg" } : {}) };
    let lastPaint = 0;
    const sent = attachmentTransport.send(rec.blob, query, (part) => {
      rec.progress = part;
      if (Date.now() - lastPaint > 120) { lastPaint = Date.now(); paint(); }
    });
    rec.abort = sent.abort || null;
    landed(rec, await sent);
  }

  async function prepareThenUpload(rec, file) {
    rec.state = "preparing";
    paint();
    const made = await prepareImage(file);
    if (rec.dropped) return;
    if (made.error) {
      rec.state = "failed";
      rec.error = made.error === "too-large"
        ? phrase("'{name}' is too large to attach, even after compression.", { name: rec.name })
        : phrase("'{name}' could not be read as an image.", { name: rec.name });
      return paint();
    }
    rec.blob = made.blob;
    rec.name = made.name || rec.name;
    rec.size = made.blob.size;
    rec.type = made.blob.type || rec.type;
    rec.convert = !!made.convert;
    rec.sourceName = made.sourceName || "";
    await upload(rec);
  }

  const newRecord = (file, kind) => ({ id: ++recordSeq, n: 0, name: String(file.name || "file"), size: file.size || 0, type: file.type || "", kind, blob: file, state: "uploading", progress: 0, path: "", error: "", convert: false });

  const insertMark = (n) => {
    const at = box.selectionStart ?? box.value.length;
    const pad = at > 0 && !/\s$/.test(box.value.slice(0, at)) ? " " : "";
    box.setRangeText(`${pad}${fileMark(n)} `, at, box.selectionEnd ?? at, "end");
  };

  function take(files) {
    const list = scope();
    const why = busy();
    if (why) {
      toast({ title: why });
      return [];
    }
    const held = all().length + (list ? 0 : images.count());
    const heldImageBytes = all().filter((rec) => rec.kind === "image").reduce((sum, rec) => sum + Math.min(rec.size || 0, IMAGE_BYTES), 0);
    const { accepted, refused } = admitAttachments(files, { held, heldImageBytes });
    if (refused.length) toast({ title: refused[refused.length - 1], description: refused.length > 1 ? refused.slice(0, -1).join(" ") : "" });
    const made = [];
    for (const { file, kind } of accepted) {
      const rec = newRecord(file, kind);
      made.push(rec);
      if (list) list.push(rec);
      else if (kind === "image") loose.push(rec);
      else {
        rec.n = ++seq;
        records.set(rec.n, rec);
        insertMark(rec.n);
      }
    }
    paint();
    if (made.some((rec) => rec.n)) changed();
    (async () => {
      for (const rec of made) {
        if (rec.kind === "image") await prepareThenUpload(rec, rec.blob);
        else upload(rec);
      }
    })();
    return made;
  }

  function addReady({ path, name, size = 0, type = "", kind = "file" }, { mark = true } = {}) {
    const rec = { id: ++recordSeq, n: 0, name: String(name || path.split("/").pop() || "file"), size, type, kind, blob: null, state: path ? "ready" : "missing", progress: 1, path: path || "", error: "", convert: false };
    const list = scope();
    if (list && !mark) list.push(rec);
    else {
      rec.n = ++seq;
      records.set(rec.n, rec);
      insertMark(rec.n);
    }
    paint();
    if (rec.n) changed();
    return rec;
  }

  function restore(list) {
    for (const rec of records.values()) forget(rec);
    records.clear();
    for (const [n, one] of Array.isArray(list) ? list : []) {
      const number = Number(n);
      if (!(number > 0) || !one) continue;
      const rec = { id: ++recordSeq, n: number, name: String(one.name || String(one.path || "").split("/").pop() || "file"), size: Number(one.size) || 0, type: String(one.type || ""), kind: "file", blob: null, state: one.path ? "ready" : "missing", progress: 1, path: String(one.path || ""), error: "", convert: false };
      records.set(number, rec);
      if (number > seq) seq = number;
    }
    paint();
  }

  function merge(list) {
    const fresh = new Map();
    for (const [n, one] of Array.isArray(list) ? list : []) {
      if (!one) continue;
      const same = one.path ? [...records.values()].find((rec) => rec.path === one.path) : null;
      if (same) {
        fresh.set(Number(n), same.n);
        continue;
      }
      const at = ++seq;
      records.set(at, { id: ++recordSeq, n: at, name: String(one.name || "file"), size: Number(one.size) || 0, type: String(one.type || ""), kind: "file", blob: one.blob || null, state: one.path ? "ready" : "missing", progress: 1, path: String(one.path || ""), error: "", convert: false });
      fresh.set(Number(n), at);
    }
    paint();
    return fresh;
  }

  return {
    records,
    paint,
    take,
    addReady,
    restore,
    merge,
    mint: () => ++seq,
    count: () => records.size + loose.length,
    names: () => all().map((rec) => rec.name),
    marks: () => [...records.values()].filter((rec) => rec.path).map((rec) => [rec.n, { path: rec.path, name: rec.name, size: rec.size, type: rec.type }]),
    record: (n) => records.get(Number(n)) || null,
    outbound: (text) => outboundFileMarks(text, records),
    busyReason() {
      const waiting = all().filter((rec) => rec.state === "uploading" || rec.state === "preparing").length;
      if (!waiting) return "";
      return waiting === 1 ? phrase("Attachment still uploading") : phrase("Attachments still uploading");
    },
    retryFailed() {
      const failed = all().filter((rec) => rec.state === "failed" && rec.retryable);
      for (const rec of failed) upload(rec);
      return failed.length;
    },
    sync() {
      let gone = false;
      for (const rec of [...records.values()]) {
        if (box.value.includes(fileMark(rec.n))) continue;
        records.delete(rec.n);
        forget(rec);
        gone = true;
      }
      if (gone) paint();
    },
    clear() {
      for (const rec of [...records.values(), ...loose]) forget(rec);
      records.clear();
      loose.length = 0;
      seq = 0;
      paint();
    }
  };
}

function wireAttachments(e, { host, textarea, target, busy }) {
  e.files = composerAttachments({
    tray: host.querySelector(".sv-attach"),
    box: textarea,
    images: e.tray,
    target,
    scope: () => (e.ask?.saved && Array.isArray(e.ask.files) ? e.ask.files[e.ask.at] || null : null),
    busy
  });
  return e.files;
}

function takeAttachments(e, files) {
  if (!e?.files) return [];
  return e.files.take([...(files || [])]);
}

function blockedSend(e) {
  const why = e?.files?.busyReason() || "";
  if (why) {
    toast({ title: why, tone: "info", stays: 2500 });
    return true;
  }
  if (e?.files?.retryFailed()) {
    toast({ title: phrase("Attachment still uploading"), tone: "info", stays: 2500 });
    return true;
  }
  return false;
}

const attachmentLimitReached = (e) => (e?.files?.count() || 0) + (e?.tray?.count() || 0) >= ATTACHMENT_LIMIT;

export { FILE_MARK_RE, attachmentLimitReached, attachmentTransport, blockedSend, composerAttachments, fileMark, fileMarkInk, fileMarkSpans, fitWithin, jpegNameOf, mentionOf, outboundFileMarks, prepareImage, takeAttachments, wireAttachments };

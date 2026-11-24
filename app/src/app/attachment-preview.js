import { esc, phrase, renderMarkdown } from "./core.js";
import { formatAttachmentSize } from "/assets/drops.mjs";
import { attachmentIcon } from "./attachment-icons.js";
import { TABLE_COLUMNS, TABLE_ROWS, TEXT_PREVIEW_BYTES, decodePreviewText, extensionOfName, filePreviewKind, highlightLanguageOf, previewTable, rendersByDefault, withoutFrontMatter } from "./file-preview.js";
import { ArchiveError, folderListing, readArchive, readEntry } from "./zip-preview.js";
import { toast } from "./composer-toast.js";

const HIGHLIGHT_LINES = 5000;

const SAVE_URL_KEPT_MS = 30_000;

const COPIED_FOR_MS = 1500;

const ARCHIVE_IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "ico"]);

let highlighter = null;

function loadHighlighter() {
  highlighter ||= import("./markdown-highlight.js").catch(() => null);
  return highlighter;
}

let open = null;

function urlOf(blob) {
  try { return URL.createObjectURL(blob); } catch { return ""; }
}

function archiveSays(code) {
  return {
    "too-big": phrase("Preview limited to files under 50 MB."),
    "too-many": phrase("This archive contains more than 2,048 entries."),
    "path-too-long": phrase("An archive path is too long to preview."),
    ratio: phrase("The expanded archive exceeds the preview size or compression ratio limit."),
    "not-zip": phrase("This is not a readable ZIP archive."),
    zip64: phrase("Unsupported ZIP64 directory."),
    damaged: phrase("This ZIP directory is damaged."),
    "entry-too-big": phrase("Entry previews are limited to 10 MB."),
    empty: phrase("This archive has no readable entries."),
    "unsupported-entry": phrase("Only UTF-8 text and images can be opened inside an archive.")
  }[code] || phrase("This is not a readable ZIP archive.");
}

function toggleLabel(kind, rendered) {
  if (kind === "markdown") return rendered ? phrase("Show markdown source") : phrase("Show rendered markdown");
  if (kind === "html") return rendered ? phrase("Show HTML source") : phrase("Show rendered page");
  return rendered ? phrase("Show source") : phrase("Show table");
}

async function readBytes(view) {
  if (view.blob) return view.blob;
  const query = new URLSearchParams({ path: view.path, where: view.where, name: view.seat || "" });
  const r = await fetch(`/api/attachment?${query}`, { cache: view.revision ? "reload" : "default" });
  if (!r.ok) {
    const said = await r.json().catch(() => ({}));
    throw new Error(said.error || phrase("Could not load this file."));
  }
  return r.blob();
}

async function codeHtml(text, name) {
  const lang = highlightLanguageOf(name);
  if (!lang || text.split("\n").length > HIGHLIGHT_LINES) return esc(text);
  const hl = await loadHighlighter();
  return hl?.highlightCode(text, lang) || esc(text);
}

function tableHtml(table) {
  const [head = [], ...rows] = table.rows;
  const cells = (row, tag) => row.map((cell) => `<${tag}>${esc(cell)}</${tag}>`).join("");
  const note = table.cutColumns ? `<p class="cp-pv-cut">${esc(phrase("Showing the first 1,024 columns. Source and Save retain every column."))}</p>` : "";
  const rowsNote = table.cutRows ? `<p class="cp-pv-cut">${esc(phrase("Showing the first {n} rows. Source and Save retain every row.", { n: TABLE_ROWS.toLocaleString() }))}</p>` : "";
  return `${note}${rowsNote}<div class="cp-pv-table"><table><thead><tr>${cells(head, "th")}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table></div>`;
}

function headHtml(view) {
  const toggle = rendersByDefault(view.kind) && view.text !== null
    ? `<button type="button" class="cp-pv-act" data-act="toggle" aria-pressed="${view.rendered}" aria-label="${esc(toggleLabel(view.kind, view.rendered))}" title="${esc(toggleLabel(view.kind, view.rendered))}">${attachmentIcon(view.rendered ? "code" : view.kind === "table" ? "table" : "eye")}</button>` : "";
  const rawShown = view.text !== null && (view.kind === "text" || !view.rendered);
  const wrapSays = view.wrap ? phrase("Disable word wrap") : phrase("Enable word wrap");
  const wrap = rawShown ? `<button type="button" class="cp-pv-act" data-act="wrap" aria-pressed="${view.wrap}" aria-label="${esc(wrapSays)}" title="${esc(wrapSays)}">${attachmentIcon("wrap")}</button>` : "";
  const copySays = view.copied ? phrase("Copied") : view.truncated ? phrase("Copy preview") : phrase("Copy contents");
  const copy = view.text !== null ? `<button type="button" class="cp-pv-act" data-act="copy" aria-label="${esc(copySays)}" title="${esc(copySays)}">${attachmentIcon(view.copied ? "check" : "copy")}</button>` : "";
  const saveSays = view.saving ? phrase("Preparing file…") : phrase("Save file");
  const save = `<button type="button" class="cp-pv-act" data-act="save" aria-label="${esc(saveSays)}" title="${esc(saveSays)}"${view.saving ? " disabled" : ""}>${attachmentIcon("download")}</button>`;
  const remove = view.remove ? `<button type="button" class="cp-pv-act" data-act="remove" aria-label="${esc(phrase("Remove from draft"))}" title="${esc(phrase("Remove from draft"))}">${attachmentIcon("trash")}</button>` : "";
  const close = `<button type="button" class="cp-pv-act" data-act="close" aria-label="${esc(phrase("Close"))}" title="${esc(phrase("Close"))}">${attachmentIcon("x")}</button>`;
  const origin = view.origin === "draft" ? phrase("Draft") : phrase("Attachment");
  return `<nav class="cp-pv-crumb"><span class="cp-pv-origin">${esc(origin)}</span><span class="cp-pv-sep" aria-hidden="true">›</span><span class="cp-pv-name" aria-current="page" title="${esc(view.fileName)}">${esc(view.fileName)}</span>`
    + `${view.size > 0 ? `<span class="cp-pv-size">${esc(formatAttachmentSize(view.size))}</span>` : ""}</nav>`
    + `<div class="cp-pv-acts">${toggle}${wrap}${copy}${save}${remove}${close}</div>`;
}

function truncationNote(view) {
  if (!view.truncated) return "";
  return view.size > 0
    ? phrase("Preview limited to the first 1 MB of a {size} byte file. Save the file to read it in full.", { size: view.size.toLocaleString() })
    : phrase("Preview limited to the first 1 MB. Save the file to read it in full.");
}

async function bodyHtml(view) {
  const kind = view.kind;
  if (view.text !== null && (kind === "text" || !view.rendered)) {
    if (!view.text) return `<p class="cp-pv-said">${esc(phrase("This file is empty."))}</p>`;
    return `<pre class="cp-pv-code${view.wrap ? " wrap" : ""}"><code>${await codeHtml(view.text, view.fileName)}</code></pre>`;
  }
  if (kind === "markdown") return `<div class="cp-pv-md md">${renderMarkdown(withoutFrontMatter(view.text))}</div>`;
  if (kind === "html") return `<iframe class="cp-pv-frame" sandbox="allow-scripts allow-forms allow-popups allow-downloads" srcdoc="${esc(view.text)}" title="${esc(view.fileName)}"></iframe>`;
  if (kind === "table") {
    const table = previewTable(view.text, view.fileName, view.type);
    const meta = `<p class="cp-pv-meta">${esc(phrase("{rows} rows · {columns} columns · {size}", { rows: table.total.toLocaleString(), columns: Math.min(table.columns, TABLE_COLUMNS).toLocaleString(), size: formatAttachmentSize(view.size) }))}</p>`;
    return meta + tableHtml(table);
  }
  if (kind === "pdf") return `<iframe class="cp-pv-frame pdf" src="${esc(view.url)}" title="${esc(view.fileName)}"></iframe>`;
  if (kind === "image") return `<div class="cp-pv-media"><img src="${esc(view.url)}" alt="${esc(view.fileName)}" data-fail="${esc(phrase("Unable to load image."))}"></div>`;
  if (kind === "audio") return `<div class="cp-pv-media audio"><audio controls preload="metadata" src="${esc(view.url)}" data-fail="${esc(phrase("Unable to load audio."))}"></audio></div>`;
  if (kind === "video") return `<div class="cp-pv-media video"><video controls playsinline src="${esc(view.url)}" data-fail="${esc(phrase("Unable to load video."))}"></video></div>`;
  if (kind === "archive") return archiveHtml(view);
  const ext = extensionOfName(view.fileName);
  const why = ext
    ? phrase("Save it to open in an app that supports {ext} files.", { ext: ext.toUpperCase() })
    : phrase("Save it to open in an app that supports this format files.");
  return `<div class="cp-pv-none"><b>${esc(phrase("No preview for this file"))}</b><span>${esc(why)}</span></div>`;
}

function archiveHtml(view) {
  const zip = view.archive;
  if (zip.error) return `<div class="cp-pv-none"><b>${esc(zip.error)}</b></div>`;
  const inside = zip.opened;
  const back = inside ? phrase("Back to archive") : phrase("Parent folder");
  const crumb = inside ? inside.path : zip.folder || phrase("Archive contents");
  const listing = folderListing(zip.archive.entries, zip.folder);
  const total = zip.archive.entries.filter((entry) => !entry.folder).reduce((sum, entry) => sum + entry.size, 0);
  const count = zip.archive.entries.length;
  const bar = `<div class="cp-zip-bar"><button type="button" class="cp-pv-act" data-act="zip-up" aria-label="${esc(back)}" title="${esc(back)}"${!inside && !zip.folder ? " disabled" : ""}>${attachmentIcon("chevronLeft")}</button>`
    + `<span class="cp-zip-where">${esc(crumb)}</span><span class="cp-zip-count">${esc(phrase(count === 1 ? "{n} entry" : "{n} entries", { n: count.toLocaleString() }))} · ${esc(formatAttachmentSize(total))}</span></div>`;
  if (inside) {
    if (inside.error) return `${bar}<div class="cp-pv-none"><b>${esc(inside.error)}</b></div>`;
    if (inside.url) return `${bar}<div class="cp-pv-media"><img src="${esc(inside.url)}" alt="${esc(inside.path)}"></div>`;
    const cut = inside.truncated ? `<p class="cp-pv-cut">${esc(phrase("Preview limited to the first 1 MB."))}</p>` : "";
    return `${bar}${cut}<pre class="cp-pv-code${view.wrap ? " wrap" : ""}"><code>${esc(inside.text)}</code></pre>`;
  }
  const rows = listing.map((row) => `<tr data-path="${esc(row.path)}" data-folder="${row.folder}" tabindex="0"><td class="cp-zip-name">${attachmentIcon(row.folder ? "folder" : "file")}<span>${esc(row.name)}</span></td>`
    + `<td>${row.folder ? "" : esc(formatAttachmentSize(row.size))}</td><td>${row.modified ? esc(row.modified.toLocaleDateString()) : "-"}</td></tr>`).join("");
  const empty = listing.length ? "" : `<p class="cp-pv-said">${esc(phrase("This folder is empty."))}</p>`;
  return `${bar}<table class="cp-zip-list" aria-label="${esc(phrase("Archive entries"))}"><thead><tr><th>${esc(phrase("Name"))}</th><th>${esc(phrase("Size"))}</th><th>${esc(phrase("Modified"))}</th></tr></thead><tbody>${rows}</tbody></table>${empty}`;
}

async function loadView(view) {
  const blob = await readBytes(view);
  view.blob = blob;
  view.size = view.size || blob.size;
  view.type = view.type || blob.type;
  view.kind = filePreviewKind(view.fileName, view.type);
  if (["text", "markdown", "html", "table"].includes(view.kind)) {
    const cut = blob.size > TEXT_PREVIEW_BYTES;
    const decoded = decodePreviewText(new Uint8Array(await blob.slice(0, TEXT_PREVIEW_BYTES).arrayBuffer()), { cut });
    if (decoded.error === "binary") throw new Error(phrase("This file contains binary data and cannot be shown as text."));
    if (decoded.error) throw new Error(phrase("This file is not UTF-8 text. Open it in another app to view its contents."));
    view.text = decoded.text;
    view.truncated = cut;
    return;
  }
  if (view.kind === "archive") {
    try {
      view.archive = { archive: readArchive(new Uint8Array(await blob.arrayBuffer())), folder: "", opened: null };
    } catch (wrong) {
      view.archive = { error: archiveSays(wrong instanceof ArchiveError ? wrong.code : "not-zip") };
    }
    return;
  }
  view.url = urlOf(blob.type ? blob : new Blob([blob], { type: view.type || "" }));
}

async function openArchiveEntry(view, path) {
  const zip = view.archive;
  try {
    const bytes = await readEntry(zip.archive, path);
    if (ARCHIVE_IMAGES.has(extensionOfName(path))) {
      zip.opened = { path, url: urlOf(new Blob([bytes], { type: extensionOfName(path) === "svg" ? "image/svg+xml" : "" })) };
      return;
    }
    const cut = bytes.length > TEXT_PREVIEW_BYTES;
    const decoded = decodePreviewText(bytes.subarray(0, TEXT_PREVIEW_BYTES), { cut });
    zip.opened = decoded.error ? { path, error: archiveSays("unsupported-entry") } : { path, text: decoded.text, truncated: cut };
  } catch (wrong) {
    zip.opened = { path, error: archiveSays(wrong instanceof ArchiveError ? wrong.code : "damaged") };
  }
}

function saveBlob(blob, name) {
  const url = urlOf(blob);
  if (!url) return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, SAVE_URL_KEPT_MS);
  return true;
}

function closeAttachmentPreview() {
  if (!open) return;
  const view = open;
  open = null;
  view.scrim.remove();
  document.removeEventListener("keydown", view.onKey, true);
  for (const url of [view.url, view.archive?.opened?.url].filter(Boolean)) { try { URL.revokeObjectURL(url); } catch {} }
  view.returnTo?.focus?.();
}

async function paintPreview(view) {
  view.scrim.querySelector(".cp-pv-head").innerHTML = headHtml(view);
  const note = view.scrim.querySelector(".cp-pv-note");
  note.textContent = truncationNote(view);
  note.hidden = !note.textContent;
  const body = view.scrim.querySelector(".cp-pv-body");
  if (view.loading) {
    body.innerHTML = `<div class="cp-pv-loading" role="status" aria-label="${esc(phrase("Loading file"))}"><span class="cp-spin" aria-hidden="true"></span></div>`;
    return;
  }
  if (view.error) {
    body.innerHTML = `<div class="cp-pv-none"><b>${esc(view.error)}</b><button type="button" class="cp-pv-retry" data-act="retry">${esc(phrase("Try again"))}</button></div>`;
    return;
  }
  const tag = ++view.paints;
  const html = await bodyHtml(view);
  if (tag !== view.paints || open !== view) return;
  body.innerHTML = html;
  for (const media of body.querySelectorAll("[data-fail]")) {
    media.addEventListener("error", () => {
      media.closest(".cp-pv-media")?.replaceWith(Object.assign(document.createElement("div"), { className: "cp-pv-none", textContent: media.dataset.fail }));
    }, { once: true });
  }
}

async function load(view) {
  view.loading = true;
  view.error = "";
  await paintPreview(view);
  try {
    await loadView(view);
    view.rendered = rendersByDefault(view.kind);
  } catch (wrong) {
    view.error = String(wrong?.message || phrase("Could not load this file."));
  }
  view.loading = false;
  if (open === view) await paintPreview(view);
}

async function act(view, name, hit) {
  if (name === "close") return closeAttachmentPreview();
  if (name === "retry") {
    view.revision += 1;
    if (view.path) view.blob = null;
    return load(view);
  }
  if (name === "toggle") view.rendered = !view.rendered;
  if (name === "wrap") view.wrap = !view.wrap;
  if (name === "remove") {
    view.remove?.();
    return closeAttachmentPreview();
  }
  if (name === "copy") {
    const text = view.archive?.opened?.text ?? view.text ?? "";
    try {
      await navigator.clipboard.writeText(text);
      view.copied = true;
      setTimeout(() => { view.copied = false; if (open === view) paintPreview(view); }, COPIED_FOR_MS);
    } catch {
      toast({ title: phrase("Could not copy file"), description: phrase("Try again.") });
    }
  }
  if (name === "save") {
    view.saving = true;
    await paintPreview(view);
    try {
      const blob = view.blob || await readBytes(view);
      if (!saveBlob(blob, view.fileName)) throw new Error("");
    } catch (wrong) {
      toast({ title: phrase("Could not save file"), description: wrong?.message || phrase("Please try again.") });
    }
    view.saving = false;
  }
  if (name === "zip-up") {
    const zip = view.archive;
    if (zip.opened) {
      if (zip.opened.url) { try { URL.revokeObjectURL(zip.opened.url); } catch {} }
      zip.opened = null;
    } else zip.folder = zip.folder.split("/").slice(0, -1).join("/");
  }
  if (name === "zip-open") {
    const row = hit;
    if (row.dataset.folder === "true") view.archive.folder = row.dataset.path;
    else await openArchiveEntry(view, row.dataset.path);
  }
  if (open === view) await paintPreview(view);
}

function openAttachmentPreview({ fileName, size = 0, type = "", blob = null, path = "", seat = "", where = "local", origin = "attachment", remove = null }) {
  closeAttachmentPreview();
  const scrim = document.createElement("div");
  scrim.className = "cp-preview-scrim";
  scrim.innerHTML = `<div class="cp-preview" role="dialog" aria-modal="true" aria-label="${esc(fileName)}"><header class="cp-pv-head"></header><p class="cp-pv-note" hidden></p><div class="cp-pv-body"></div></div>`;
  const view = {
    scrim, fileName: String(fileName || "file"), size: Number(size) || 0, type, blob, path, seat, where, origin, remove,
    kind: filePreviewKind(fileName, type), text: null, truncated: false, url: "", archive: null,
    rendered: true, wrap: false, copied: false, saving: false, loading: true, error: "", revision: 0, paints: 0,
    returnTo: document.activeElement
  };
  view.onKey = (ev) => {
    if (ev.key !== "Escape" || open !== view) return;
    ev.preventDefault();
    ev.stopPropagation();
    closeAttachmentPreview();
  };
  scrim.addEventListener("mousedown", (ev) => { if (ev.target === scrim) closeAttachmentPreview(); });
  scrim.addEventListener("click", (ev) => {
    const row = ev.target.closest(".cp-zip-list tr[data-path]");
    if (row) return void act(view, "zip-open", row);
    const hit = ev.target.closest("[data-act]");
    if (hit && !hit.disabled) act(view, hit.dataset.act, hit);
  });
  scrim.addEventListener("keydown", (ev) => {
    const row = ev.key === "Enter" && ev.target.closest?.(".cp-zip-list tr[data-path]");
    if (row) act(view, "zip-open", row);
  });
  document.addEventListener("keydown", view.onKey, true);
  document.body.appendChild(scrim);
  open = view;
  load(view).then(() => scrim.querySelector('[data-act="close"]')?.focus({ preventScroll: true }));
  return view;
}

const previewOpen = () => !!open;

export { closeAttachmentPreview, openAttachmentPreview, previewOpen };

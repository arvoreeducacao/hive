import { esc, phrase } from "./core.js";
import { FILE_MARK_RE, takeAttachments } from "./composer-attachments.js";
import { notePick, pickedPr } from "./pr-mentions.js";
import { toast } from "./composer-toast.js";

const CONTEXT_MIME = "web application/x-hive-context-fragment+json";

const HTML_ATTRIBUTE = "data-hive-context-fragment";

const FRAGMENT_MAX_CHARS = 16_000_000;

const FRAGMENT_MAX_RECORDS = 200;

const IMAGE_MARK_RE = /\[Image #(\d+)\]/g;

const PASTE_MARK_RE = /\[Pasted text #(\d+) \+(\d+) lines\]/g;

const PR_MARK_RE = /(^|[\s([{'"])#(\d{1,7})(?![\w.-])/g;

const HTML_FRAGMENT = new RegExp(`${HTML_ATTRIBUTE}=(?:"([^"]*)"|'([^']*)')`);

let lastCopy = { blobs: new Map() };

const marksIn = (text, re) => {
  re.lastIndex = 0;
  return [...String(text ?? "").matchAll(re)];
};

function selectionRecords(selected, adapter, { whole = false } = {}) {
  const records = [];
  for (const m of marksIn(selected, IMAGE_MARK_RE)) {
    const path = adapter.image(Number(m[1]));
    if (path) records.push({ version: 1, kind: "image", mark: Number(m[1]), path, name: path.split("/").pop() });
  }
  for (const m of marksIn(selected, FILE_MARK_RE)) {
    const rec = adapter.file(Number(m[1]));
    if (rec?.path) records.push({ version: 1, kind: "file", mark: Number(m[1]), path: rec.path, name: rec.name, size: rec.size || 0, type: rec.type || "" });
  }
  for (const m of marksIn(selected, PASTE_MARK_RE)) {
    const words = adapter.paste(Number(m[1]));
    if (words !== undefined) records.push({ version: 1, kind: "paste", mark: Number(m[1]), text: words });
  }
  for (const m of marksIn(selected, PR_MARK_RE)) {
    const pr = adapter.prs?.has(Number(m[2])) ? pickedPr(m[2]) : null;
    if (pr) records.push({ version: 1, kind: "pr", mark: Number(m[2]), pr });
  }
  if (whole) for (const quote of adapter.quotes()) records.push({ version: 1, kind: "quote", said: quote.said, from: quote.kind || "", comment: quote.comment || "" });
  return records.slice(0, FRAGMENT_MAX_RECORDS);
}

function encodeFragment(records, source) {
  if (!records.length) return "";
  const json = JSON.stringify({ version: 1, source, records });
  return json.length > FRAGMENT_MAX_CHARS ? "" : json;
}

const fragmentHtml = (json, plain) => `<pre ${HTML_ATTRIBUTE}="${encodeURIComponent(json)}">${esc(plain)}</pre>`;

function decodeFragment(json) {
  try {
    const read = JSON.parse(json);
    if (read?.version !== 1 || !Array.isArray(read.records)) return null;
    return { source: read.source || {}, records: read.records.filter((one) => one && one.version === 1 && typeof one.kind === "string").slice(0, FRAGMENT_MAX_RECORDS) };
  } catch {
    return null;
  }
}

function readFragment(data) {
  const direct = data?.getData?.(CONTEXT_MIME);
  if (direct) return decodeFragment(direct);
  const html = data?.getData?.("text/html") || "";
  const found = HTML_FRAGMENT.exec(html);
  if (!found) return null;
  try { return decodeFragment(decodeURIComponent(found[1] ?? found[2] ?? "")); } catch { return null; }
}

function rewriteMarks(text, re, swap) {
  re.lastIndex = 0;
  return text.replace(re, (...hit) => swap(...hit) ?? hit[0]);
}

async function fetchCopy(record, source) {
  const kept = lastCopy.blobs.get(record.path);
  if (kept) return new File([kept], record.name || "file", { type: kept.type || record.type || "" });
  const query = new URLSearchParams({ path: record.path, where: source.where || "local", name: source.seat || "" });
  const r = await fetch(`${record.kind === "image" ? "/api/image" : "/api/attachment"}?${query}`);
  if (!r.ok) throw new Error(phrase("The original attachment is no longer available."));
  const blob = await r.blob();
  return new File([blob], record.name || "file", { type: blob.type || record.type || "" });
}

function importFragment(pasted, fragment, adapter) {
  let text = String(pasted ?? "");
  const source = fragment.source || {};
  const sameMachine = (source.where || "local") === adapter.where();
  const has = (re, n) => marksIn(text, re).some((m) => Number(m[1]) === n);
  const fetchLater = [];
  const byKind = (kind) => fragment.records.filter((one) => one.kind === kind);
  const images = byKind("image").filter((one) => one.path && has(IMAGE_MARK_RE, Number(one.mark)));
  const imageSwap = new Map();
  for (const one of images) {
    if (sameMachine) imageSwap.set(Number(one.mark), adapter.addImage(one.path));
    else fetchLater.push(one);
  }
  text = rewriteMarks(text, IMAGE_MARK_RE, (mark, n) => {
    if (imageSwap.has(Number(n))) return `[Image #${imageSwap.get(Number(n))}]`;
    return images.some((one) => Number(one.mark) === Number(n)) ? "" : null;
  });
  const files = byKind("file").filter((one) => one.path && has(FILE_MARK_RE, Number(one.mark)));
  const local = sameMachine ? files : [];
  const fileSwap = local.length ? adapter.mergeFiles(local.map((one) => [one.mark, { path: one.path, name: one.name, size: one.size, type: one.type }])) : new Map();
  if (!sameMachine) fetchLater.push(...files);
  text = rewriteMarks(text, FILE_MARK_RE, (mark, n) => {
    if (fileSwap.has(Number(n))) return `[File #${fileSwap.get(Number(n))}]`;
    return files.some((one) => Number(one.mark) === Number(n)) ? "" : null;
  });
  const pastes = new Map(byKind("paste").filter((one) => typeof one.text === "string").map((one) => [Number(one.mark), one.text]));
  text = rewriteMarks(text, PASTE_MARK_RE, (mark, n) => {
    if (!pastes.has(Number(n))) return null;
    const words = pastes.get(Number(n));
    const fresh = adapter.addPaste(words);
    return fresh ? mark.replace(`#${n} `, `#${fresh} `) : words;
  });
  for (const one of byKind("pr")) {
    if (!one.pr?.url || !marksIn(text, PR_MARK_RE).some((m) => Number(m[2]) === Number(one.mark))) continue;
    notePick(one.pr);
    adapter.prs?.add(Number(one.mark));
  }
  const quotes = byKind("quote").filter((one) => typeof one.said === "string" && one.said.trim()).filter((one) => !adapter.addQuote(one));
  if (quotes.length) text = `${quotes.map((one) => `${one.said.trim().split("\n").map((line) => `> ${line}`).join("\n")}${one.comment ? `\n\n${one.comment}` : ""}`).join("\n\n")}\n\n${text}`;
  return { text, fetchLater, source };
}

function selectionOf(box) {
  const start = box.selectionStart ?? 0;
  const end = box.selectionEnd ?? start;
  return { start, end, text: box.value.slice(start, end) };
}

function wireChipClipboard(box, adapter) {
  const onCopy = (ev) => {
    const picked = selectionOf(box);
    if (!picked.text || !ev.clipboardData) return;
    const whole = picked.start === 0 && picked.end === box.value.length;
    const records = selectionRecords(picked.text, adapter, { whole });
    const json = encodeFragment(records, { where: adapter.where(), seat: adapter.seat() });
    if (!json) return;
    ev.preventDefault();
    ev.clipboardData.setData("text/plain", picked.text);
    ev.clipboardData.setData(CONTEXT_MIME, json);
    ev.clipboardData.setData("text/html", fragmentHtml(json, picked.text));
    const blobs = new Map();
    for (const one of records) {
      const blob = one.kind === "file" ? adapter.file(one.mark)?.blob : null;
      if (blob) blobs.set(one.path, blob);
    }
    lastCopy = { blobs };
    if (ev.type !== "cut") return;
    box.setRangeText("", picked.start, picked.end, "end");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };
  box.addEventListener("copy", onCopy);
  box.addEventListener("cut", onCopy);
}

function pasteFragment(box, ev, adapter) {
  const fragment = readFragment(ev.clipboardData);
  if (!fragment?.records.length) return false;
  const pasted = ev.clipboardData.getData("text/plain");
  if (!pasted) return false;
  ev.preventDefault();
  ev.stopImmediatePropagation?.();
  const made = importFragment(pasted, fragment, adapter);
  const { start, end } = selectionOf(box);
  box.setRangeText(made.text, start, end, "end");
  box.dispatchEvent(new Event("input", { bubbles: true }));
  if (made.fetchLater.length) bringOver(made.fetchLater, made.source, adapter);
  return true;
}

async function bringOver(records, source, adapter) {
  const files = [];
  for (const one of records) {
    try {
      files.push(await fetchCopy(one, source));
    } catch (wrong) {
      toast({
        title: phrase("Couldn't bring {name} into this message", { name: one.name || one.path.split("/").pop() }),
        description: phrase("{reason} Remove the chip or attach the file again.", { reason: wrong?.message || phrase("Downloading it from the source failed.") })
      });
    }
  }
  if (files.length) adapter.takeFiles(files);
}

function composerClipboardAdapter(e, { where, seat }) {
  e.prPicks ||= new Set();
  return {
    where,
    seat,
    image: (n) => e.tray?.marks.get(n),
    file: (n) => e.files?.record(n),
    paste: (n) => e.pastes?.get(n),
    prs: e.prPicks,
    quotes: () => e.quotes?.pinned() || [],
    addImage: (path) => {
      for (const [held, kept] of e.tray.marks) if (kept === path) return held;
      const n = e.tray.mint();
      e.tray.restore(path, n);
      return n;
    },
    mergeFiles: (list) => e.files.merge(list),
    addPaste: (words) => (e.pastes ? e.pastes.add(words) : 0),
    addQuote: (one) => {
      if (!e.quotes) return false;
      e.quotes.add(one.said, one.from, one.comment);
      return true;
    },
    takeFiles: (files) => takeAttachments(e, files)
  };
}

export { CONTEXT_MIME, composerClipboardAdapter, HTML_ATTRIBUTE, decodeFragment, encodeFragment, fragmentHtml, importFragment, pasteFragment, readFragment, selectionRecords, wireChipClipboard };

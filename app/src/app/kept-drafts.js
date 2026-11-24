import { st } from "./core.js";

const KEEP_AFTER = 250;

const TYPING_FOR = 3000;

const mine = new Map();

const waiting = new Map();

const draftsOnServer = () => (st.data && st.data.drafts) || {};

const NO_EXTRAS = { images: [], quotes: [], files: [] };

const extrasOf = (extras) => ({
  images: Array.isArray(extras?.images) ? extras.images : [],
  quotes: Array.isArray(extras?.quotes) ? extras.quotes : [],
  files: Array.isArray(extras?.files) ? extras.files : []
});

const sameExtras = (a, b) => JSON.stringify(extrasOf(a)) === JSON.stringify(extrasOf(b));

function send(name) {
  const held = mine.get(name);
  if (!held || held.sent === held.at) return;
  held.sent = held.at;
  fetch("/api/draft", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text: held.text, at: held.at, ...held.extras })
  }).catch(() => { held.sent = 0; });
}

export function keepDraft(name, text, extras) {
  const said = String(text ?? "");
  const held = mine.get(name);
  const kept = extrasOf(extras ?? (held && held.text === said ? held.extras : NO_EXTRAS));
  if (held && held.text === said && sameExtras(held.extras, kept)) return;
  mine.set(name, { text: said, extras: kept, at: Date.now(), sent: 0 });
  clearTimeout(waiting.get(name));
  waiting.set(name, setTimeout(() => { waiting.delete(name); send(name); }, KEEP_AFTER));
}

export function keepDraftNow(name, text, extras) {
  if (text !== undefined) keepDraft(name, text, extras);
  clearTimeout(waiting.get(name));
  waiting.delete(name);
  send(name);
}

export function flushDrafts() {
  for (const name of [...waiting.keys()]) keepDraftNow(name);
}

export function draftKept(name) {
  const held = mine.get(name);
  const onServer = draftsOnServer()[name];
  if (held && (!onServer || held.at >= Number(onServer.at || 0))) return held.text;
  return onServer ? String(onServer.text || "") : held ? held.text : "";
}

export function draftExtrasKept(name) {
  const held = mine.get(name);
  const onServer = draftsOnServer()[name];
  if (held && (!onServer || held.at >= Number(onServer.at || 0))) return extrasOf(held.extras);
  return extrasOf(onServer || held?.extras);
}

export function draftFromElsewhere(name, shown, typing) {
  const onServer = draftsOnServer()[name];
  if (!onServer) return null;
  const at = Number(onServer.at) || 0;
  const held = mine.get(name);
  if (held && at <= held.at) return null;
  if (typing && Date.now() - (held?.at || 0) < TYPING_FOR) return null;
  const said = String(onServer.text || "");
  if (said === shown) return null;
  mine.set(name, { text: said, extras: extrasOf(onServer), at, sent: at });
  return said;
}

export function forgetDraft(name) {
  mine.delete(name);
  clearTimeout(waiting.get(name));
  waiting.delete(name);
}

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { HUB } from "./env.mjs";

const PRS_FILE = join(HUB, ".hive/prs.json");

function prKey(text) {
  const m = String(text || "").match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/);
  if (m) return `${m[1]}/${m[2]}#${m[3]}`;
  const short = String(text || "").match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  return short ? `${short[1]}#${short[2]}` : "";
}

async function readPrRegistry() {
  try {
    const raw = JSON.parse(await readFile(PRS_FILE, "utf8"));
    return Array.isArray(raw) ? raw.filter((p) => p && p.key) : [];
  } catch { return []; }
}

async function writePrRegistry(list) {
  await mkdir(join(HUB, ".hive"), { recursive: true });
  await writeFile(PRS_FILE, JSON.stringify(list, null, 2));
}

const NOTES_FILE = join(HUB, ".hive/pr-notes.json");

async function readPrNotes() {
  try {
    const raw = JSON.parse(await readFile(NOTES_FILE, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

async function writePrNotes(all) {
  await mkdir(join(HUB, ".hive"), { recursive: true });
  await writeFile(NOTES_FILE, JSON.stringify(all, null, 2));
}

const LINKS_FILE = join(HUB, ".hive/pr-links.json");

let heldLinks = [];

const isLink = (one) => !!one && typeof one.session === "string" && !!one.session && typeof one.key === "string" && !!prKey(one.key);

async function readPrLinks() {
  try {
    const raw = JSON.parse(await readFile(LINKS_FILE, "utf8"));
    heldLinks = Array.isArray(raw) ? raw.filter(isLink) : [];
  } catch { heldLinks = []; }
  return heldLinks.map((one) => ({ ...one }));
}

async function writePrLinks(list) {
  await mkdir(join(HUB, ".hive"), { recursive: true });
  await writeFile(LINKS_FILE, JSON.stringify(list, null, 2));
  heldLinks = list.map((one) => ({ ...one }));
}

const prLinkOf = (session) => heldLinks.find((one) => one.session === session)?.key || "";

function withLink(links, { session, where = "local", key, at = new Date().toISOString() }) {
  return [...links.filter((one) => one.session !== session && one.key !== key), { session, where, key, at }];
}

const withoutLink = (links, session) => links.filter((one) => one.session !== session);

function ownersWithLinks(owners, links) {
  const linked = new Map(links.map((one) => [one.key, one.session]));
  const held = new Set(linked.values());
  const out = new Map();
  for (const [key, session] of owners) out.set(key, held.has(session) && linked.get(key) !== session ? "" : session);
  for (const [key, session] of linked) out.set(key, session);
  return out;
}

let storing = false;

async function storeSessionPrs(sessions) {
  if (storing) return;
  const seen = sessions.flatMap((s) => s.prs.map((link) => ({ key: prKey(link), session: s.name }))).filter((p) => p.key);
  if (!seen.length) return;
  storing = true;
  try {
    const registry = await readPrRegistry();
    let changed = false;
    for (const p of seen) {
      const old = registry.find((r) => r.key === p.key);
      if (!old) { registry.push({ ...p, at: new Date().toISOString() }); changed = true; }
      else if (!old.retired && !old.session && p.session) { old.session = p.session; changed = true; }
    }
    if (changed) await writePrRegistry(registry);
  } catch {} finally { storing = false; }
}

async function retirePrs(keys) {
  const registry = await readPrRegistry();
  let changed = false;
  for (const key of keys) {
    const known = registry.find((p) => p.key === key);
    if (!known) { registry.push({ key, retired: true, at: new Date().toISOString() }); changed = true; }
    else if (!known.retired) { known.retired = true; changed = true; }
  }
  if (changed) await writePrRegistry(registry);
}

export { prKey, readPrRegistry, writePrRegistry, readPrNotes, writePrNotes, storeSessionPrs, retirePrs, readPrLinks, writePrLinks, prLinkOf, withLink, withoutLink, ownersWithLinks };

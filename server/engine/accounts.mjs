import { readdir, readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

export const DEFAULT_ACCOUNT = "default";

export const CLAUDE = "claude";

export const GUESSED_WAIT_MS = 30 * 60 * 1000;

export const ACCOUNT_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;

const NAME_OK = ACCOUNT_NAME;

export function providerHome(base, provider = CLAUDE) {
  return provider === CLAUDE ? join(base, "accounts") : join(base, "providers", provider);
}

export function accountsRoot(base, provider = CLAUDE) {
  return provider === CLAUDE ? join(base, "accounts") : join(providerHome(base, provider), "accounts");
}

export function accountDir(base, provider, name) {
  return !name || name === DEFAULT_ACCOUNT ? "" : join(accountsRoot(base, provider), name);
}

export function accountUnder(base, provider, dir) {
  const held = String(dir || "").replace(/[\\/]+$/, "");
  if (!held) return "";
  return join(accountsRoot(base, provider), basename(held)) === held ? basename(held) : null;
}

function ledgerFile(base, provider) {
  return join(providerHome(base, provider), "spent.json");
}

function orderFile(base, provider) {
  return join(providerHome(base, provider), "order.json");
}

export async function accountsHeld(base, provider = CLAUDE) {
  let dirs = [];
  try {
    dirs = (await readdir(accountsRoot(base, provider), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && NAME_OK.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {}
  return [DEFAULT_ACCOUNT, ...dirs];
}

export async function readLedger(base, provider = CLAUDE) {
  try {
    const saved = JSON.parse(await readFile(ledgerFile(base, provider), "utf8"));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export async function noteSpent(base, account, { until = 0, why = "spent", says = "", now = Date.now(), provider = CLAUDE } = {}) {
  const held = account || DEFAULT_ACCOUNT;
  const ledger = await readLedger(base, provider);
  ledger[held] = { until, why, says: String(says).slice(0, 300), at: now };
  await writeLedger(base, provider, ledger);
  return ledger;
}

export async function noteBack(base, account, provider = CLAUDE) {
  const held = account || DEFAULT_ACCOUNT;
  const ledger = await readLedger(base, provider);
  if (!(held in ledger)) return ledger;
  delete ledger[held];
  await writeLedger(base, provider, ledger);
  return ledger;
}

async function writeAtomically(file, value) {
  const scratch = `${file}.${process.pid}.tmp`;
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(scratch, JSON.stringify(value, null, 2));
  await rename(scratch, file);
}

async function writeLedger(base, provider, ledger) {
  await writeAtomically(ledgerFile(base, provider), ledger);
}

export function hasRoom(ledger, account, now = Date.now()) {
  const mark = ledger?.[account || DEFAULT_ACCOUNT];
  if (!mark) return true;
  if (!mark.until) return false;
  return mark.until <= now;
}

export async function writtenOrder(base, provider = CLAUDE) {
  try {
    const saved = JSON.parse(await readFile(orderFile(base, provider), "utf8"));
    return Array.isArray(saved) ? saved.map((n) => String(n || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function writeOrder(base, order, provider = CLAUDE) {
  const held = await accountsHeld(base, provider);
  const kept = [];
  for (const one of Array.isArray(order) ? order : []) {
    const name = String(one || "").trim() || DEFAULT_ACCOUNT;
    if (held.includes(name) && !kept.includes(name)) kept.push(name);
  }
  await writeAtomically(orderFile(base, provider), kept);
  return kept;
}

export async function accountOrder(base, home = "", provider = CLAUDE) {
  const held = await accountsHeld(base, provider);
  const written = (await writtenOrder(base, provider)).filter((n) => held.includes(n));
  const first = home || DEFAULT_ACCOUNT;
  const order = written.length ? written : [first];
  for (const one of held) if (!order.includes(one)) order.push(one);
  return order;
}

export function pickAccount({ order, current, ledger, now = Date.now() }) {
  const mine = current || DEFAULT_ACCOUNT;
  for (const one of order) {
    if (one === mine) continue;
    if (hasRoom(ledger, one, now)) return one;
  }
  return "";
}

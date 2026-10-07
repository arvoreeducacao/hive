import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SUN_PATH_CEILING = 100;

export function socketPathFor({ home, platform = process.platform, hub = "", short = tmpdir() } = {}) {
  if (platform === "win32") {
    const mark = createHash("sha256").update(String(hub || home || "hive")).digest("hex").slice(0, 12);
    return `\\\\.\\pipe\\hive-${mark}`;
  }
  const wanted = join(home, "hive.sock");
  if (Buffer.byteLength(wanted) <= SUN_PATH_CEILING) return wanted;
  const mark = createHash("sha256").update(wanted).digest("hex").slice(0, 12);
  return join(short, `hive-${mark}.sock`);
}

export const SHELF_STATES = ["draft", "in-review", "decided", "delivered", "closed"];

const STATE_WAS = {
  rascunho: "draft",
  "em-revisao": "in-review",
  "em-revisão": "in-review",
  decidido: "decided",
  entregue: "delivered",
  encerrado: "closed"
};

export function canonicalLabel(label) {
  const named = String(label || "").trim().toLowerCase();
  const known = SHELF_STATES.map((state) => [state, state]).concat(Object.entries(STATE_WAS));
  for (const [head, state] of known) {
    if (named === head) return state;
    if (named.startsWith(`${head}-`)) return `${state}${named.slice(head.length)}`;
  }
  return named;
}

export const shelfDeepLink = (slug, tab, n) => {
  if (!slug || !tab || !n) return "";
  return `hive://shelf/${slug}?tab=${tab}`;
};

export const shelfPageUrl = (repo, slug, tab, n) => {
  const owner = String(repo || "").match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!owner || !slug || !tab || !n) return "";
  return `https://github.com/${owner[1]}/${owner[2]}/blob/HEAD/a/${slug}/${tab}.v${n}.html`;
};

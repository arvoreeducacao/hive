import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LEAF_PARENT, LEAF_URL } from "./lib/env.mjs";
import { leafReady } from "./lib/leaf-held.mjs";
import { bodyForLeaf, sendToLeaf } from "./lib/leaf-page.mjs";
import { leafIdOf, metaFile, readMeta } from "./lib/shelf.mjs";

const SHELF = join(process.env.HIVE_HOME || join(process.env.HOME || "", ".hive"), "shelf");
const HOME = join(SHELF, "a");
const SKIP_TABS = ["telas", "lente"];
const ORDER = ["documento", "plano"];
const A_MINUTE = 60000;
const CALLS_A_MINUTE = 50;

const dry = process.argv.includes("--dry");
const only = (process.argv.find((one) => one.startsWith("--only=")) || "").slice(7);
const say = (line) => process.stdout.write(`${line}\n`);

const spent = [];
async function pace(cost) {
  for (let i = 0; i < cost; i += 1) {
    const now = Date.now();
    while (spent.length && now - spent[0] > A_MINUTE) spent.shift();
    if (spent.length >= CALLS_A_MINUTE) {
      const rest = A_MINUTE - (now - spent[0]) + 250;
      await new Promise((then) => setTimeout(then, rest));
      return pace(cost - i);
    }
    spent.push(now);
  }
}

function pagesOnTheShelf() {
  const pages = [];
  for (const slug of readdirSync(HOME)) {
    if (only && slug !== only) continue;
    const meta = readMeta(SHELF, slug);
    if (!meta) continue;
    const tabs = [];
    for (const name of ORDER.concat(Object.keys(meta.tabs || {}).filter((one) => !ORDER.includes(one)))) {
      const kept = meta.tabs?.[name];
      const versions = kept?.versions || [];
      if (!versions.length || SKIP_TABS.includes(name)) continue;
      const file = join(HOME, slug, `${name}.v${versions[versions.length - 1].n}.html`);
      if (!existsSync(file)) continue;
      tabs.push({ name, file, leafId: leafIdOf(meta, name) });
    }
    if (tabs.length) pages.push({ slug, title: meta.title || slug, label: meta.label || "", tabs });
  }
  return pages;
}

function rememberLeafId(slug, tab, id) {
  const meta = readMeta(SHELF, slug);
  if (!meta?.tabs?.[tab]) return;
  meta.tabs[tab] = { ...meta.tabs[tab], leafId: id };
  writeFileSync(metaFile(SHELF, slug), `${JSON.stringify(meta, null, 2)}\n`);
}

const titleOf = (page, tab) => (tab.name === ORDER[0] ? page.title : `${page.title} · ${tab.name}`);

async function main() {
  if (!LEAF_URL || !LEAF_PARENT) return { error: "this hive is not pointed at a leaf — HIVE_LEAF_URL and HIVE_LEAF_PARENT come from the hive config" };
  const pages = pagesOnTheShelf();
  if (!pages.length) return { error: `no page to migrate under ${HOME}` };

  const tabs = pages.flatMap((page) => page.tabs);
  const already = tabs.filter((tab) => tab.leafId).length;
  say(`${pages.length} pages, ${tabs.length} tabs, ${already} already in the leaf`);

  if (dry) {
    let figures = 0;
    let images = 0;
    let heaviest = 0;
    for (const page of pages) {
      for (const tab of page.tabs) {
        const made = bodyForLeaf(readFileSync(tab.file, "utf8"));
        figures += made.figures.length;
        images += made.images.length;
        heaviest = Math.max(heaviest, made.html.length);
      }
    }
    const calls = tabs.length - already + figures + images;
    say(`a dry run: ${figures} drawings, ${images} images, heaviest body ${Math.round(heaviest / 1024)} kB`);
    say(`${calls} calls to the leaf, which at ${CALLS_A_MINUTE} a minute takes about ${Math.ceil(calls / CALLS_A_MINUTE)} min`);
    say("nothing was written. Drop --dry to migrate.");
    return { dry: true };
  }

  const ready = await leafReady({ env: { ...process.env, HIVE_LEAF_URL: LEAF_URL }, write: true });
  if (ready.error) return ready;
  const opened = await ready.session.open();
  if (opened.error) return opened;
  const offered = await ready.session.tools();
  if (offered.error) return offered;

  let wrote = 0;
  let failed = 0;
  const lost = [];

  for (const page of pages) {
    let parent = LEAF_PARENT;
    for (const tab of page.tabs) {
      const html = readFileSync(tab.file, "utf8");
      const made = bodyForLeaf(html);
      await pace(1 + made.figures.length + made.images.length);
      const sent = await sendToLeaf({
        session: ready.session,
        tools: offered.tools,
        inputs: offered.inputs,
        title: titleOf(page, tab),
        html,
        parentId: parent,
        docId: tab.leafId
      });
      if (sent.error) {
        failed += 1;
        say(`x ${page.slug} · ${tab.name}: ${sent.error}`);
        continue;
      }
      wrote += 1;
      rememberLeafId(page.slug, tab.name, sent.id);
      if (tab.name === ORDER[0]) parent = sent.id;
      if (sent.missing.length) lost.push(`${page.slug} · ${tab.name}: ${sent.missing.map((one) => one.why).join(" · ")}`);
      say(`${sent.how === "created" ? "+" : "~"} ${page.slug} · ${tab.name} → ${sent.url} (${sent.drawings} drawings, ${sent.images} images)`);
    }
  }

  return { wrote, failed, lost };
}

const done = await main();
if (done.error) {
  process.stderr.write(`${done.error}\n`);
  process.exit(1);
}
if (done.dry) process.exit(0);

say("");
say(`${done.wrote} tabs written, ${done.failed} refused`);
if (done.lost.length) {
  say(`${done.lost.length} tabs lost a drawing or an image:`);
  for (const line of done.lost) say(`  ${line}`);
}
say("the shelf now remembers each leaf page in its meta.json — commit that, so nobody opens a second copy");

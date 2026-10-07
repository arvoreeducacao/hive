import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const st = await state();
const { $ } = await app("core");
const { detached } = await app("blocks");
const mirror = await app("mirror");
const { ARCH_SHOWN, archKey } = mirror;

const seat = (name, over = {}) => ({ name, where: "local", state: "idle", ...over });

const world = (over = {}) => {
  st.keys = { ...st.keys, palette: { meta: true, code: "KeyK" } };
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [], ...(over.data || {}) };
  st.blocks = over.blocks || [];
  st.block = over.block || 0;
  st.archOpen = !!over.archOpen;
  st.archNote = over.archNote || "";
  detached.clear();
  for (const name of over.detached || []) detached.add(name);
  mirror.reviving.clear();
  for (const key of over.reviving || []) mirror.reviving.add(key);
  return mirror.railViewModel();
};

test("the model groups seats by where they run, local always, cloud only when there is a pod or a seat there", () => {
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] } });
  assert.deepEqual(model.groups.map((g) => g.key), ["local"]);
  const withPod = world({ data: { pod: { up: true, name: "pod-1" }, sessions: [seat("a")], archived: [] } });
  assert.deepEqual(withPod.groups.map((g) => g.key), ["cloud", "local"]);
  assert.equal(withPod.groups[0].count, 0);
  assert.equal(withPod.groups[0].label, "cloud · pod-1");
});

test("a seat row carries what the manual row carried: name, state, glyph, colour, block tag, live count and whether it is here", () => {
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana", state: "needs", live: [1, 2] }), seat("b")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["b"] }, { id: "b2", ws: "w0", keys: ["a"] }],
    block: 1
  });
  const a = model.groups[0].items.find((it) => it.key === "a");
  const b = model.groups[0].items.find((it) => it.key === "b");
  assert.equal(a.name, "a");
  assert.equal(a.title, "Ana");
  assert.equal(a.state, "needs");
  assert.equal(a.glyph, "g-needs");
  assert.equal(a.colour, "var(--accent)");
  assert.equal(a.hint, "Ana — needs you");
  assert.equal(a.here, true);
  assert.equal(a.live, 2);
  assert.equal(a.tag, "b2");
  assert.equal(b.here, false);
  assert.equal(b.tag, "b1");
  assert.equal(b.live, 0);
});

test("the rows follow the blocks: b1 first, then b2, each in the order of its panes, and seats in no block last", () => {
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("loose"), seat("c"), seat("a"), seat("d"), seat("b")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a", "b"] }, { id: "b2", ws: "w0", keys: ["c"] }, { id: "b3", ws: "w0", keys: ["d"] }]
  });
  assert.deepEqual(model.groups[0].items.map((it) => it.key), ["a", "b", "c", "d", "loose"]);
});

test("a seat living in a window of its own says so, and wears an arrow instead of a block number", () => {
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana" })], archived: [] }, detached: ["a"] });
  const [a] = model.groups[0].items;
  assert.equal(a.hint, "Ana — in a window of its own — click brings it back");
  assert.equal(a.tag, "↗");
});

test("a seat in no block has no tag", () => {
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] } });
  assert.equal(model.groups[0].items[0].tag, "");
});

test("the archived fold shows nothing while shut, the first few while open, and says how many more", () => {
  const archived = Array.from({ length: ARCH_SHOWN + 1 }, (_, n) => ({ name: `old${n + 1}`, where: "local", archivedAt: 0 }));
  const shut = world({ data: { pod: { up: false, name: "" }, sessions: [], archived } });
  assert.equal(shut.parked.count, ARCH_SHOWN + 1);
  assert.equal(shut.parked.open, false);
  assert.deepEqual(shut.parked.shown, []);
  assert.equal(shut.parked.more, "");
  const open = world({ data: { pod: { up: false, name: "" }, sessions: [], archived }, archOpen: true, reviving: [archKey(archived[0])] });
  assert.deepEqual(open.parked.shown.map((one) => one.key), archived.slice(0, ARCH_SHOWN).map(archKey));
  assert.equal(open.parked.shown[0].busy, true);
  assert.equal(open.parked.shown[0].action, "coming back…");
  assert.equal(open.parked.shown[1].action, "revive ↩");
  assert.equal(open.parked.more, "+ 1 more · see all");
});

test("no archived seats, no fold", () => {
  assert.equal(world({ data: { pod: { up: false, name: "" }, sessions: [], archived: [] } }).parked, null);
});

test("the views are the only path — nothing switches them off any more", () => {
  const boot = readFileSync(join(HERE, "src/app/boot.js"), "utf8");
  assert.match(boot, /^bootSolid\(\);$/m, "the boot has to mount the views unconditionally");
  for (const name of ["boot", "core", "shared"]) {
    const source = readFileSync(join(HERE, `src/app/${name}.js`), "utf8");
    assert.doesNotMatch(source, /solidWanted/, `${name}.js still asks whether the views are wanted`);
    assert.doesNotMatch(source, /hive\.solid/, `${name}.js still reads a killswitch for the views`);
  }
});

test("the bundle is what the page loads, and the server hands it over", () => {
  assert.match(page, /<script type="module" src="\/assets\/dist\/hive\.mjs"><\/script>/);
  assert.ok(server.includes('"/assets/dist/hive.mjs":'), "the built views must be served by STATIC");
  assert.match(readFileSync(join(HERE, "src/app/shared.js"), "utf8"), /^import \* as views from "\.\.\/views\.js";$/m);
  assert.match(readFileSync(join(HERE, "src/views.js"), "utf8"), /export \{ mountRail \} from "\.\/rail\.jsx";/);
});

test("the rail builds into one self-contained module the page can load on its own", { skip: !(existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/solid-js"))) && "esbuild and solid-js are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-rail-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const built = await readFile(join(outdir, "hive.mjs"), "utf8");
    assert.ok(built.includes("mountRail"), "the built bundle lost the rail view");
    assert.ok(built.includes("mountView"), "the built bundle lost the tile view");
    const outside = built.split("\n").filter((line) => /^import\s.*from\s+["'](?!\.)/.test(line)).map((line) => /from\s+["']([^"']+)["']/.exec(line)[1]);
    assert.deepEqual(outside.filter((where) => !where.startsWith("/assets/") && !where.startsWith("/vendor/")), [], "the bundle reaches for something the page does not serve");
    for (const piece of ["group-title", "data-arch-toggle", "rail-empty", "parked-note", "rail-more", "dot-off"]) {
      assert.ok(built.includes(piece), `the built rail lost ${piece}`);
    }
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

test("the manual rail steps aside the moment the solid one is mounted", async () => {
  const { bootSolid } = await app("shared");
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana" })], archived: [{ name: "old1", where: "local", archivedAt: 0 }] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"] }],
    archOpen: true
  });
  assert.equal(mirror.railSolid, null, "the solid rail is not mounted before boot");
  bootSolid();
  assert.ok(mirror.railSolid, "boot did not mount the rail");
  mirror.paintRail();
  const host = $("rail-sessions");
  assert.equal(host.querySelector(".group-title span").textContent, "local · your machine");
  const row = host.querySelector(".item[data-name='a']");
  assert.equal(row.querySelector(".name").textContent, "Ana");
  assert.equal(row.getAttribute("title"), "Ana — idle");
  assert.equal(row.querySelector(".n").textContent, "b1");
  assert.ok(host.querySelector("[data-arch-toggle]"), "the archived fold is gone from the solid rail");
  assert.equal(host.querySelector(".item.parked").dataset.arch, "old1");
});

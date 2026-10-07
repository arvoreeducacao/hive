import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withinRoots, grounded } from "../lib/bounds.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function ground() {
  const base = mkdtempSync(join(tmpdir(), "hive-bounds-"));
  const seat = join(base, "seat");
  const outside = join(base, "outside");
  mkdirSync(seat);
  mkdirSync(outside);
  writeFileSync(join(seat, "shot.png"), "png");
  writeFileSync(join(outside, "secret.png"), "png");
  return { base, seat, outside };
}

test("a file inside an allowed root passes", () => {
  const { base, seat } = ground();
  assert.equal(withinRoots(join(seat, "shot.png"), [seat]), true);
  rmSync(base, { recursive: true, force: true });
});

test("a file outside every root is refused", () => {
  const { base, seat, outside } = ground();
  assert.equal(withinRoots(join(outside, "secret.png"), [seat]), false);
  rmSync(base, { recursive: true, force: true });
});

test("dot-dot traversal out of the root is refused", () => {
  const { base, seat } = ground();
  assert.equal(withinRoots(join(seat, "..", "outside", "secret.png"), [seat]), false);
  rmSync(base, { recursive: true, force: true });
});

test("a symlink pointing outside the root is refused", () => {
  const { base, seat, outside } = ground();
  symlinkSync(join(outside, "secret.png"), join(seat, "innocent.png"));
  assert.equal(withinRoots(join(seat, "innocent.png"), [seat]), false);
  rmSync(base, { recursive: true, force: true });
});

test("a sibling whose name merely starts with the root is refused", () => {
  const { base, seat } = ground();
  const sibling = `${seat}-evil`;
  mkdirSync(sibling);
  writeFileSync(join(sibling, "secret.png"), "png");
  assert.equal(withinRoots(join(sibling, "secret.png"), [seat]), false);
  rmSync(base, { recursive: true, force: true });
  rmSync(sibling, { recursive: true, force: true });
});

test("empty and missing roots never match", () => {
  const { base, seat } = ground();
  assert.equal(withinRoots(join(seat, "shot.png"), ["", join(base, "missing")]), false);
  assert.equal(grounded(""), "");
  rmSync(base, { recursive: true, force: true });
});

test("the server puts the fence between existence and the read", () => {
  const source = readFileSync(join(HERE, "..", "server.mjs"), "utf8");
  const body = source.slice(source.indexOf("async function readImage"));
  const fence = body.indexOf("withinRoots(file");
  assert.ok(fence > 0, "readImage never calls withinRoots");
  assert.ok(fence < body.indexOf("await readFile(file)"), "the read happens before the fence");
  assert.match(body.slice(0, fence), /existsSync\(file\)/);
});

import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs"), "utf8");

function applyPruneSource() {
  const at = SERVER.indexOf("function applyPrune(");
  assert.ok(at > 0, "applyPrune is gone — the fleet prunes somewhere else now");
  const end = SERVER.indexOf("\n}", at);
  return SERVER.slice(at, end + 2);
}

/* the fleet used to drop a seat it could not revive with a bare fleet.delete:
   no archive entry, no log line, and a grid with one card fewer. Whoever lost a
   seat that way had nothing to look at, so it read as "I must have closed it". */
test("a pruned seat is archived, never only deleted", () => {
  const body = applyPruneSource();
  assert.match(body, /archivedSeats\.set\(/, "applyPrune drops a seat without writing it to the archive");
  assert.match(body, /archiveEntry\(seat, at, why\)/, "the archive entry does not carry the reason we gave up");
  assert.match(body, /saveArchivedSeats\(\)/, "the archive is never written to disk");
});

test("a pruned seat leaves a line saying why", () => {
  assert.match(applyPruneSource(), /console\.log\(/, "a seat disappears from the fleet in silence");
});

test("the reason comes from the plan, not invented at the prune", () => {
  assert.match(applyPruneSource(), /for \(const \{ seat, why \} of prune\)/,
    "applyPrune no longer reads the reason fleetPlan handed it");
});

test("both sides of the fleet prune through the same door", () => {
  const calls = SERVER.match(/^\s+applyPrune\(prune\);$/gm) || [];
  assert.strictEqual(calls.length, 2,
    "local and cloud should each prune once, through applyPrune — a new call site would bypass the archive");
});

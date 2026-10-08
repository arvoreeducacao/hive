import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_ABSOLUTE, hubPathFrom, cloudRepoOfTheHub } from "../lib/hub-path.mjs";

const HOME = "/Users/ada";

test("a path typed from the home folder reaches the folder the person meant", () => {
  assert.deepEqual(hubPathFrom("~/acme/acme-hub", HOME), { path: "/Users/ada/acme/acme-hub", why: "" });
  assert.deepEqual(hubPathFrom("~", HOME), { path: HOME, why: "" });
});

test("a whole path is kept as typed, without the spaces or the trailing slash around it", () => {
  assert.deepEqual(hubPathFrom("  /Users/ada/acme-hub/  ", HOME), { path: "/Users/ada/acme-hub", why: "" });
  assert.deepEqual(hubPathFrom("/", HOME), { path: "/", why: "" });
});

test("a relative path is refused with a reason, since the app's own folder is not what the person meant", () => {
  assert.deepEqual(hubPathFrom("acme/acme-hub", HOME), { path: "", why: NOT_ABSOLUTE });
  assert.deepEqual(hubPathFrom("~ada/hub", HOME), { path: "", why: NOT_ABSOLUTE });
});

test("an empty field is empty, not an error of its own", () => {
  assert.deepEqual(hubPathFrom("", HOME), { path: "", why: "" });
  assert.deepEqual(hubPathFrom(undefined, HOME), { path: "", why: "" });
});

test("a cloud chat with no repository picked asks for the hub only when the hub is a repository", () => {
  const isRepo = (path) => path === "/home/dev/acme-hub/.git";
  assert.equal(cloudRepoOfTheHub("/home/dev/acme-hub", "acme-hub", isRepo), "acme-hub");
  assert.equal(cloudRepoOfTheHub("/home/dev/code", "code", isRepo), "", "a plain folder of repositories lands in the server's own folder instead");
  assert.equal(cloudRepoOfTheHub("", "", isRepo), "");
});

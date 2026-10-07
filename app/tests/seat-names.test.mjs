import { test } from "node:test";
import assert from "node:assert/strict";
import { namesRead, blindNamingError, NO_FLEET_YET } from "../lib/seat-names.mjs";

test("an empty fleet and a check that never happened are not the same answer", () => {
  const listed = namesRead({ ok: true, out: "hub\noi\noi-tudo-bem\n", error: "" });
  assert.deepEqual(listed.names, ["hub", "oi", "oi-tudo-bem"]);
  assert.equal(listed.blind, false);

  const firstSeat = namesRead({ ok: false, out: "", error: "no server running on /tmp/tmux-0/default" });
  assert.deepEqual(firstSeat.names, []);
  assert.equal(firstSeat.blind, false, "the very first seat of the day would be refused");

  const noSession = namesRead({ ok: false, out: "", error: "can't find session: hive" });
  assert.equal(noSession.blind, false);

  const wrongContainer = namesRead({ ok: false, out: "", error: "OCI runtime exec failed: exec: \"tmux\": executable file not found in $PATH" });
  assert.equal(wrongContainer.blind, true, "a container with no tmux read nothing, and that is not an empty fleet");
  assert.match(wrongContainer.why, /tmux/);

  const podGone = namesRead({ ok: false, out: "", error: "error: unable to upgrade connection: pod does not exist" });
  assert.equal(podGone.blind, true);
});

test("a listing that came back is trusted even when the exit code did not", () => {
  const noisy = namesRead({ ok: false, out: "hub\noi\n", error: "Defaulting container name to workspace" });
  assert.deepEqual(noisy.names, ["hub", "oi"]);
  assert.equal(noisy.blind, false);
});

test("the refusal says what would have happened, not just that it failed", () => {
  const wrong = blindNamingError("cloud", "pod does not exist");
  assert.match(wrong.message, /cloud/);
  assert.match(wrong.message, /reaches the older one/);
  assert.match(wrong.message, /Nothing was started/);
  assert.match(wrong.message, /pod does not exist/);
});

test("every tmux way of saying there is no fleet yet is known", () => {
  for (const said of [
    "no server running on /tmp/tmux-1000/default",
    "can't find session: hive",
    "no current session",
    "failed to connect to server"
  ]) assert.match(said, NO_FLEET_YET, `${said} would be read as a broken check`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createReachContext } from "../lib/reach-context.mjs";

const params = (text) => new URL(`http://localhost/?${text}`).searchParams;

function context({ fallback = "", seats = {} } = {}) {
  return createReachContext({
    defaultHost: () => fallback,
    knows: (id) => id === "" || id === "ada@devbox" || id === "ada@gpu",
    hostOfSeat: (name) => seats[name] ?? null
  });
}

test("outside any ask, the reach is the default host", () => {
  assert.equal(context({ fallback: "ada@devbox" }).current(), "ada@devbox");
});

test("an ask that names a host is served by that host, through every await", async () => {
  const reach = context();
  const seen = await reach.runForAsk(params("host=ada%40gpu"), async () => {
    await new Promise((done) => setTimeout(done, 5));
    return reach.current();
  });
  assert.equal(seen, "ada@gpu");
});

test("an ask about a chat goes to the host that chat lives on", () => {
  const reach = context({ seats: { poc: "ada@devbox" } });
  assert.equal(reach.runForAsk(params("name=poc&where=cloud"), () => reach.current()), "ada@devbox");
  assert.equal(reach.runForAsk(params("seat=poc"), () => reach.current()), "ada@devbox");
});

test("a local chat with the same name as a remote one stays on this machine's default", () => {
  const reach = context({ seats: { poc: "ada@devbox" } });
  assert.equal(reach.runForAsk(params("name=poc&where=local"), () => reach.current()), "");
  reach.runForAsk(params(""), () => {
    reach.learn({ name: "poc", where: "local" });
    assert.equal(reach.current(), "");
  });
});

test("the body of an ask settles the host when the address said nothing", () => {
  const reach = context({ seats: { poc: "ada@devbox" } });
  reach.runForAsk(params(""), () => {
    reach.learn({ where: "cloud", host: "ada@gpu", name: "" });
    assert.equal(reach.current(), "ada@gpu");
  });
  reach.runForAsk(params(""), () => {
    reach.learn({ name: "poc", where: "cloud" });
    assert.equal(reach.current(), "ada@devbox");
  });
});

test("an empty host is a choice — the server with an address — and not a missing answer", () => {
  const reach = context({ fallback: "ada@devbox" });
  reach.runForAsk(params(""), () => {
    reach.learn({ where: "cloud", host: "" });
    assert.equal(reach.current(), "");
  });
  assert.equal(reach.runForAsk(params("host="), () => reach.current()), "");
});

test("a host nobody keeps falls back instead of being dialled", () => {
  const reach = context({ fallback: "ada@devbox" });
  assert.equal(reach.runForAsk(params("host=mallory%40elsewhere"), () => reach.current()), "ada@devbox");
  reach.runForAsk(params(""), () => {
    reach.learn({ host: "mallory@elsewhere" });
    assert.equal(reach.current(), "ada@devbox");
  });
});

test("what the address named is not overruled by the body", () => {
  const reach = context();
  reach.runForAsk(params("host=ada%40gpu"), () => {
    reach.learn({ host: "ada@devbox" });
    assert.equal(reach.current(), "ada@gpu");
  });
});

test("two asks in flight never see each other's host", async () => {
  const reach = context();
  const slow = (host, ms) => reach.run(host, async () => {
    await new Promise((done) => setTimeout(done, ms));
    return reach.current();
  });
  assert.deepEqual(await Promise.all([slow("ada@devbox", 15), slow("ada@gpu", 5), slow("", 10)]), ["ada@devbox", "ada@gpu", ""]);
});

test("work run for one host can hand a piece to another and come back", async () => {
  const reach = context();
  const seen = await reach.run("ada@devbox", async () => {
    const inner = await reach.run("ada@gpu", async () => reach.current());
    return [inner, reach.current()];
  });
  assert.deepEqual(seen, ["ada@gpu", "ada@devbox"]);
});

test("learning outside an ask changes nothing", () => {
  const reach = context({ fallback: "ada@devbox" });
  reach.learn({ host: "ada@gpu" });
  assert.equal(reach.current(), "ada@devbox");
});

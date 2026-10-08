import test from "node:test";
import assert from "node:assert/strict";
import { createPrDomain } from "../routes/prs.mjs";

const domainHarness = () => {
  const routes = new Map();
  const commands = [];
  const retired = [];
  let registry = [];
  let response = { ok: true, out: "", error: "" };
  const command = async (kind, name, args, options) => {
    commands.push({ kind, name, args, options });
    if (args.join(" ") === "api user -q .login") return kind === "sh" ? "renato" : { ok: true, out: "renato", error: "" };
    return kind === "sh" ? response.out : response;
  };
  const readRegistry = async () => structuredClone(registry);
  const writeRegistry = async (list) => { registry = structuredClone(list); };
  const retire = async (keys) => {
    retired.push(...keys);
    for (const key of keys) {
      const known = registry.find((pr) => pr.key === key);
      if (known) known.retired = true;
      else registry.push({ key, retired: true });
    }
  };
  const domain = createPrDomain({
    sh: (...args) => command("sh", ...args),
    shr: (...args) => command("shr", ...args),
    extractJson: (raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    languageOf: (path) => path.endsWith(".js") ? "javascript" : "",
    paintLines: (text) => text.split("\n"),
    liveSessions: () => [],
    readRegistry,
    writeRegistry,
    retire,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from("png")
    })
  });
  domain.register((method, path, handler) => routes.set(path, { method, handler }), async (req) => req.body || {});
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const writes = [];
    const ended = [];
    const res = {
      writeHead: (status, headers) => writes.push({ status, headers }),
      end: (value) => ended.push(value)
    };
    const json = (value, status = 200) => { answers.push({ value, status }); };
    await routes.get(path).handler({ body }, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };
  return {
    routes,
    commands,
    retired,
    call,
    registry: () => registry,
    seed: (list) => { registry = structuredClone(list); },
    reply: (next) => { response = next; },
    domain
  };
};

test("the PR room registers the same seventeen paths and methods", () => {
  const { routes } = domainHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/prs", null],
    ["/api/prs/register", "POST"],
    ["/api/prs/forget", "POST"],
    ["/api/prs/notes", "POST"],
    ["/api/prs/notes/edit", "POST"],
    ["/api/prs/notes/remove", "POST"],
    ["/api/prs/notes/batch", "POST"],
    ["/api/prs/diff", null],
    ["/api/prs/attribution", null],
    ["/api/prs/picture", null],
    ["/api/prs/joblog", null],
    ["/api/prs/rerun", "POST"],
    ["/api/prs/talk", null],
    ["/api/prs/commits", null],
    ["/api/prs/merge", "POST"],
    ["/api/prs/branch", "POST"],
    ["/api/prs/review", "POST"]
  ]);
});

test("register and forget persist the registry behind the routes", async () => {
  const hive = domainHarness();
  const registered = await hive.call("/api/prs/register", { body: { url: "https://github.com/arvoreeducacao/hive/pull/7", session: "seat" } });
  assert.deepEqual(registered.answers, [{ value: { ok: true, key: "arvoreeducacao/hive#7" }, status: 200 }]);
  assert.equal(hive.registry()[0].chosen, true);
  assert.equal(hive.registry()[0].session, "seat");

  const forgotten = await hive.call("/api/prs/forget", { body: { key: "arvoreeducacao/hive#7" } });
  assert.deepEqual(forgotten.answers, [{ value: { ok: true }, status: 200 }]);
  assert.deepEqual(hive.retired, ["arvoreeducacao/hive#7"]);
});

test("diff, rerun, merge and review keep their exact gh contracts", async () => {
  const hive = domainHarness();
  hive.reply({ ok: true, out: "", error: "" });
  await hive.call("/api/prs/diff", { query: "?key=arvoreeducacao%2Fhive%237" });
  await hive.call("/api/prs/rerun", { body: { key: "arvoreeducacao/hive#7", run: 12, failedOnly: true } });
  await hive.call("/api/prs/merge", { body: { key: "arvoreeducacao/hive#7", whenGreen: true, force: true } });
  await hive.call("/api/prs/review", { body: { key: "arvoreeducacao/hive#7", action: "changes", text: "fix this" } });
  assert.deepEqual(hive.commands.map((call) => call.args), [
    ["pr", "diff", "7", "-R", "arvoreeducacao/hive"],
    ["run", "rerun", "12", "-R", "arvoreeducacao/hive", "--failed"],
    ["pr", "merge", "7", "-R", "arvoreeducacao/hive", "--merge", "--auto", "--admin"],
    ["pr", "review", "7", "-R", "arvoreeducacao/hive", "--request-changes", "-b", "fix this"]
  ]);
});

test("bad route input answers once without reaching gh", async () => {
  const hive = domainHarness();
  const diff = await hive.call("/api/prs/diff");
  const rerun = await hive.call("/api/prs/rerun", { body: { key: "bad", run: 0 } });
  const review = await hive.call("/api/prs/review", { body: { key: "arvoreeducacao/hive#7", action: "comment", text: "" } });
  assert.deepEqual(diff.answers, [{ value: { error: "missing key" }, status: 400 }]);
  assert.deepEqual(rerun.answers, [{ value: { error: "missing pr or run" }, status: 400 }]);
  assert.deepEqual(review.answers, [{ value: { error: "write the comment" }, status: 400 }]);
  assert.deepEqual(hive.commands, []);
});

test("two PR rooms do not share cache or registry state", async () => {
  const first = domainHarness();
  const second = domainHarness();
  first.domain.prCache.set("arvoreeducacao/hive#7", { at: Date.now(), data: { state: "open" } });
  first.seed([{ key: "arvoreeducacao/hive#7" }]);
  assert.equal(second.domain.prCache.size, 0);
  assert.deepEqual(second.registry(), []);
});

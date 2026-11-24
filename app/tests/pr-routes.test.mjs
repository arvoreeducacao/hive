import test from "node:test";
import assert from "node:assert/strict";
import { createPrDomain } from "../routes/prs.mjs";

const domainHarness = ({ chats = ["retry"], slowLinks = false, ceilingOfChat } = {}) => {
  const routes = new Map();
  const commands = [];
  const retired = [];
  let registry = [];
  let links = [];
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
    liveSessions: () => chats.map((name) => ({ name, where: "local" })),
    ...(ceilingOfChat ? { ceilingOfChat } : {}),
    readRegistry,
    writeRegistry,
    retire,
    readLinks: async () => {
      const read = structuredClone(links);
      if (slowLinks) await new Promise((done) => setTimeout(done, 5));
      return read;
    },
    writeLinks: async (list) => {
      if (slowLinks) await new Promise((done) => setTimeout(done, 5));
      links = structuredClone(list);
    },
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
    links: () => links,
    seed: (list) => { registry = structuredClone(list); },
    reply: (next) => { response = next; },
    domain
  };
};

test("the PR room registers the same twenty paths and methods", () => {
  const { routes } = domainHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/prs", null],
    ["/api/prs/register", "POST"],
    ["/api/prs/link", "POST"],
    ["/api/prs/unlink", "POST"],
    ["/api/prs/forget", "POST"],
    ["/api/prs/notes", "POST"],
    ["/api/prs/notes/edit", "POST"],
    ["/api/prs/notes/remove", "POST"],
    ["/api/prs/notes/batch", "POST"],
    ["/api/prs/diff", null],
    ["/api/prs/attribution", null],
    ["/api/prs/picture", null],
    ["/api/prs/tool", "POST"],
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

test("linking a PR to a chat by hand is kept per chat, and unlinking gives the chat back to detection", async () => {
  const hive = domainHarness();
  const linked = await hive.call("/api/prs/link", { body: { name: "retry", where: "local", url: "https://github.com/o/r/pull/2648" } });
  assert.deepEqual(linked.answers, [{ value: { ok: true, key: "o/r#2648", linked: "o/r#2648" }, status: 200 }]);
  assert.deepEqual(hive.links().map(({ session, where, key }) => ({ session, where, key })), [{ session: "retry", where: "local", key: "o/r#2648" }]);

  await hive.call("/api/prs/link", { body: { name: "retry", url: "o/r#2650" } });
  assert.deepEqual(hive.links().map((one) => one.key), ["o/r#2650"], "a chat holds one pull request linked by hand, and the newest choice replaces it");

  const wrong = await hive.call("/api/prs/unlink", { body: { name: "retry", url: "https://github.com/o/r/pull/1" } });
  assert.equal(wrong.answers[0].status, 409);
  assert.equal(hive.links().length, 1);

  const unlinked = await hive.call("/api/prs/unlink", { body: { name: "retry" } });
  assert.deepEqual(unlinked.answers, [{ value: { ok: true, key: "o/r#2650", linked: "" }, status: 200 }]);
  assert.deepEqual(hive.links(), []);

  const nothing = await hive.call("/api/prs/unlink", { body: { name: "retry" } });
  assert.equal(nothing.answers[0].status, 404);
});

test("a link asks for a chat and a pull request it can read", async () => {
  const hive = domainHarness();
  assert.equal((await hive.call("/api/prs/link", { body: { url: "o/r#1" } })).answers[0].status, 400);
  assert.equal((await hive.call("/api/prs/link", { body: { name: "a", url: "not a pr" } })).answers[0].status, 400);
  assert.equal((await hive.call("/api/prs/link", { body: { name: "nobody", url: "o/r#1" } })).answers[0].status, 404, "a link goes only to a chat that exists");
  assert.deepEqual(hive.links(), []);
});

test("links made at the same time all stay: each one reads what the one before it wrote", async () => {
  const hive = domainHarness({ chats: ["a", "b", "c"], slowLinks: true });
  await Promise.all([
    hive.call("/api/prs/link", { body: { name: "a", url: "o/r#1" } }),
    hive.call("/api/prs/link", { body: { name: "b", url: "o/r#2" } }),
    hive.call("/api/prs/link", { body: { name: "c", url: "o/r#3" } })
  ]);
  assert.deepEqual(hive.links().map((one) => one.session).sort(), ["a", "b", "c"]);
  await Promise.all([
    hive.call("/api/prs/unlink", { body: { name: "a" } }),
    hive.call("/api/prs/link", { body: { name: "b", url: "o/r#4" } })
  ]);
  assert.deepEqual(hive.links().map((one) => `${one.session} ${one.key}`).sort(), ["b o/r#4", "c o/r#3"]);
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

test("a PR tool is refused when the chat's ceiling is below what the tool needs, and an unknown tool is refused", async () => {
  const ceilings = { reader: "read", operator: "operate" };
  const hive = domainHarness({ ceilingOfChat: (name) => ceilings[name] || "full" });
  const merge = await hive.call("/api/prs/tool", { body: { name: "operator", tool: "pull_request_merge", args: { number: 7, expectedHeadSha: "abc1234" } } });
  assert.equal(merge.answers[0].status, 403);
  assert.match(merge.answers[0].value.error, /needs full access/);
  const rerun = await hive.call("/api/prs/tool", { body: { name: "reader", tool: "ci_rerun", args: {} } });
  assert.equal(rerun.answers[0].status, 403);
  const unknown = await hive.call("/api/prs/tool", { body: { name: "operator", tool: "repo_delete", args: {} } });
  assert.equal(unknown.answers[0].status, 400);
  assert.match(unknown.answers[0].value.error, /no PR tool called repo_delete/);
});

test("a domain built without a ceiling reader lets chats only read PRs", async () => {
  const hive = domainHarness();
  const merge = await hive.call("/api/prs/tool", { body: { name: "any", tool: "pull_request_merge", args: { number: 7, expectedHeadSha: "abc1234" } } });
  assert.equal(merge.answers[0].status, 403);
  assert.match(merge.answers[0].value.error, /needs full access/);
});

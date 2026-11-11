import { MemoryError } from "../lib/local-memories.mjs";

const SETTLE_EVERY_MS = 60_000;
const MAX_PICK = 100;
const MAX_JUDGE = 400;
const TITLE_ROOM = 200;
const BODY_ROOM = 20_000;

const STATUS = { ok: 200, blocked: 422, own: 403, gone: 404, bad: 400, "no-repo": 409, approved: 202, down: 502 };

const ids = (value, room = MAX_PICK) => (Array.isArray(value) ? [...new Set(value.map(String))].slice(0, room) : []);

const text = (value, room) => (typeof value === "string" ? value.slice(0, room) : "");

export function registerMemoryRoutes(on, { local, hub, judge, bodyOf = async () => ({}), now = Date.now }) {
  let settledAt = 0;
  let lastSettle = null;

  async function failing(json, run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof MemoryError) return json({ state: "bad", why: error.why }, error.status);
      return json({ state: "down", why: String(error?.message || error).slice(0, 300) }, 500);
    }
  }

  async function settleProposals(force) {
    if (!force && now() - settledAt < SETTLE_EVERY_MS) return null;
    settledAt = now();
    const pending = await local.pendingPrs();
    if (!pending.length) return null;
    const states = await hub.prStates(pending);
    if (!states.size) return null;
    const settled = await local.settle((key) => states.get(key));
    return settled.merged.length ? settled : null;
  }

  on("GET", "/api/memories/mine", async (req, res, url, json) => failing(json, async () => {
    const fresh = url.searchParams.get("fresh") === "1";
    const settled = await settleProposals(fresh).catch(() => null);
    if (settled) lastSettle = settled;
    const listed = await local.list();
    const said = { state: "ok", ...listed, settled: lastSettle };
    lastSettle = null;
    return json(said);
  }));

  on("GET", "/api/memories/mine/one", async (req, res, url, json) => failing(json, async () => json({ state: "ok", memory: await local.one(url.searchParams.get("id")) })));

  on("POST", "/api/memories/mine/status", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    return json({ state: "ok", memories: await local.statuses(ids(asked?.ids)) });
  }));

  on("POST", "/api/memories/mine/scope", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    if (Array.isArray(asked?.scopes)) {
      const pairs = asked.scopes.slice(0, MAX_JUDGE).map((one) => ({ id: String(one?.id ?? ""), scope: String(one?.scope ?? "") }));
      const entry = await local.setScopes(pairs);
      return json({ state: "ok", entry: entry?.id || null });
    }
    const entry = await local.setScope(asked?.id, asked?.scope);
    return json({ state: "ok", entry: entry?.id || null });
  }));

  on("POST", "/api/memories/mine/delete", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    const entry = await local.remove(asked?.id);
    return json({ state: "ok", entry: entry?.id || null });
  }));

  on("POST", "/api/memories/mine/undo", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    const entry = await local.undo(asked?.entry);
    return json({ state: "ok", entry: entry.id });
  }));

  on("POST", "/api/memories/mine/classify", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    const memories = [];
    for (const id of ids(asked?.ids, MAX_JUDGE)) {
      const one = await local.one(id).catch(() => null);
      if (one) memories.push({ id: one.id, name: one.name, description: one.description, body: one.body });
    }
    if (!memories.length) return json({ state: "bad", why: "nothing to classify" }, 400);
    const judged = await judge(memories);
    if (!judged.verdicts.length) return json({ state: "down", why: judged.failures[0] || "the judge did not answer" }, 502);
    return json({ state: "ok", verdicts: judged.verdicts, failures: judged.failures });
  }));

  on("POST", "/api/memories/propose", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    const picked = ids(asked?.ids);
    const title = text(asked?.title, TITLE_ROOM).trim();
    if (!picked.length || !title) return json({ state: "bad", why: "pick the memories and give the proposal a title" }, 400);
    const memories = [];
    for (const id of picked) {
      const one = await local.one(id);
      memories.push({ id: one.id, file: one.file, raw: one.raw, title: one.title, hook: one.hook });
    }
    const said = await hub.propose({ memories, title, body: text(asked?.body, BODY_ROOM) });
    if (said.state === "ok") await local.markProposed(picked, said.pr);
    return json(said, STATUS[said.state] || 200);
  }));

  on("GET", "/api/memories/proposals", async (req, res, url, json) => failing(json, async () => {
    const said = await hub.proposals();
    return json(said, said.state === "ok" ? 200 : STATUS[said.state] || 200);
  }));

  on("POST", "/api/memories/proposals/approve", async (req, res, url, json) => failing(json, async () => {
    const asked = await bodyOf(req);
    const said = await hub.approve(asked?.number);
    if (said.state === "ok") settledAt = 0;
    return json(said, STATUS[said.state] || 200);
  }));

  on("GET", "/api/memories/team", async (req, res, url, json) => failing(json, async () => {
    const said = await hub.team();
    return json(said, said.state === "ok" ? 200 : STATUS[said.state] || 200);
  }));

  for (const kind of ["edit", "delete"]) {
    on("POST", `/api/memories/team/${kind}`, async (req, res, url, json) => failing(json, async () => {
      const asked = await bodyOf(req);
      const title = text(asked?.title, TITLE_ROOM).trim();
      if (!title) return json({ state: "bad", why: "give the change a title" }, 400);
      const said = await hub.changeTeam({
        file: String(asked?.file ?? ""),
        kind,
        description: kind === "edit" ? text(asked?.description, 500) : undefined,
        body: kind === "edit" ? text(asked?.body, BODY_ROOM) : undefined,
        title,
        prBody: text(asked?.prBody, BODY_ROOM)
      });
      return json(said, STATUS[said.state] || 200);
    }));
  }
}

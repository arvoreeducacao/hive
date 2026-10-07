import { randomUUID } from "node:crypto";
import { cleanRoutine, dueRoutines, editRoutine, missedRoutine, newRoutine, readRoutines, recordRun, spawnBodyOf, writeRoutines } from "../lib/routines.mjs";

export const PRECHECK_TIMEOUT = 60000;

export function createRoutineDomain({ home, openJob, runJob, precheckRun, invalidate = () => {}, newId = randomUUID, now = Date.now, log = () => {} }) {
  let running = false;

  const all = () => readRoutines(home);

  const save = (list) => { writeRoutines(home, list); invalidate(); };

  const replace = (list, next) => list.map((one) => (one.id === next.id ? next : one));

  async function precheck(routine) {
    if (!routine.precheck) return { ok: true };
    const said = await precheckRun(routine.precheck, PRECHECK_TIMEOUT);
    if (said.ok) return { ok: true };
    return { ok: false, why: String(said.error || said.out || "").trim().split("\n").filter(Boolean).pop() || `exit ${said.code ?? "non-zero"}` };
  }

  async function fire(routine, { force = false, at = now() } = {}) {
    if (!force) {
      const gate = await precheck(routine);
      if (!gate.ok) return { outcome: "skipped", why: gate.why };
    }
    try {
      const body = spawnBodyOf(routine, at);
      const job = openJob(body);
      runJob(job, body);
      return { outcome: "ran", seat: job.name || body.name };
    } catch (wrong) {
      return { outcome: "failed", why: String(wrong?.message || wrong) };
    }
  }

  async function tick(at = now()) {
    if (running) return [];
    running = true;
    const fired = [];
    try {
      let list = all();
      for (const routine of dueRoutines(list, at)) {
        const run = missedRoutine(routine, at) ? { outcome: "missed", why: "the app was not up at the time" } : await fire(routine, { at });
        list = replace(list, recordRun(routine, run, { now: at }));
        fired.push({ id: routine.id, ...run });
        log(`routine ${routine.name}: ${run.outcome}${run.why ? ` — ${run.why}` : ""}${run.seat ? ` → ${run.seat}` : ""}`);
      }
      if (fired.length) save(list);
    } finally { running = false; }
    return fired;
  }

  function register(on, bodyOf) {
    on(null, "/api/routines", async (req, res, url, json) => json({ routines: all(), now: now() }));

    on("POST", "/api/routines", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const clean = cleanRoutine(body);
      if (clean.error) return json({ error: clean.error }, 400);
      const list = all();
      const id = String(body.id || "");
      const was = id ? list.find((one) => one.id === id) : null;
      if (id && !was) return json({ error: "that routine is gone" }, 404);
      const next = was ? editRoutine(was, clean, { now: now() }) : newRoutine(clean, { id: newId(), now: now() });
      save(was ? replace(list, next) : [...list, next]);
      return json({ ok: true, routine: next });
    });

    on("POST", "/api/routines/toggle", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const list = all();
      const was = list.find((one) => one.id === String(body.id || ""));
      if (!was) return json({ error: "that routine is gone" }, 404);
      const next = editRoutine(was, { enabled: body.enabled !== false }, { now: now() });
      save(replace(list, next));
      return json({ ok: true, routine: next });
    });

    on("POST", "/api/routines/remove", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const list = all();
      const id = String(body.id || "");
      if (!list.some((one) => one.id === id)) return json({ error: "that routine is gone" }, 404);
      save(list.filter((one) => one.id !== id));
      return json({ ok: true });
    });

    on("POST", "/api/routines/run", async (req, res, url, json) => {
      const body = await bodyOf(req);
      const list = all();
      const was = list.find((one) => one.id === String(body.id || ""));
      if (!was) return json({ error: "that routine is gone" }, 404);
      const at = now();
      const run = await fire(was, { force: body.force === true, at });
      const next = { ...recordRun(was, { ...run, byHand: true }, { now: at }), nextAt: was.nextAt };
      save(replace(list, next));
      return json({ ok: true, run, routine: next });
    });
  }

  return { register, tick, fire, precheck };
}

export function registerRoutineRoutes(on, context) {
  const domain = createRoutineDomain(context);
  domain.register(on, context.bodyOf);
  return domain;
}

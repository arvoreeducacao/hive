import { forgetIgnored, ignoreCheck, readIgnored } from "../lib/doctor-ignored.mjs";

export function registerDoctorRoutes(on, context) {
  const { doctor, bodyOf, HIVE_HOME } = context;
  if (!doctor) return;

  const withIgnored = (report) => (HIVE_HOME ? { ...report, ignored: readIgnored(HIVE_HOME) } : report);

  on(null, "/api/doctor", async (req, res, url, json) => json(withIgnored(await doctor.readDoctor(!!url.searchParams.get("force")))));

  on("POST", "/api/doctor/fix", async (req, res, url, json) => {
    const r = await doctor.applyFix(String((await bodyOf(req)).id || ""));
    return json(r, r.error ? 400 : 200);
  });

  if (!HIVE_HOME) return;

  on("POST", "/api/doctor/ignore", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const ids = (Array.isArray(asked.ids) ? asked.ids : []).map(String).filter(Boolean);
    if (!ids.length) return json({ error: "which check?" }, 400);
    try {
      const ignored = asked.forget ? forgetIgnored(HIVE_HOME, ids) : ignoreCheck(HIVE_HOME, ids, String(asked.state || ""));
      return json({ ok: true, ignored });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  });
}

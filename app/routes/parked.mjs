import { PARK_CHECK_TIMEOUT_MS, checksDue, cleanPark, dueParks, readParked, wakeText, writeParked } from "../lib/parked.mjs";

const whenOf = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function createParkDomain({ home, deliverSay, liveSessions = async () => [], knownSeats = () => [], checkRun, invalidate = () => {}, now = Date.now, log = () => {} }) {
  let running = false;

  const all = () => readParked(home);

  const save = (parks) => { writeParked(home, parks); invalidate(); };

  async function park(name, body) {
    const seat = (await liveSessions()).find((one) => one.name === name);
    if (!seat) return { error: "that chat is not alive here, so there is nothing to park" };
    if (seat.where !== "local") return { error: "only a chat on this machine can park for now" };
    const clean = cleanPark(body, now());
    if (clean.error) return clean;
    const parks = all();
    parks[name] = clean.park;
    save(parks);
    log(`parked: ${name} until ${new Date(clean.park.until).toISOString()}`);
    return { park: clean.park, when: whenOf(clean.park.until) };
  }

  function unpark(name) {
    const parks = all();
    if (!parks[name]) return { error: "that chat is not parked" };
    delete parks[name];
    save(parks);
    log(`parked: ${name} let go`);
    return { ok: true };
  }

  async function wake(name, how) {
    const parks = all();
    const park = parks[name];
    if (!park) return { error: "that chat is not parked" };
    const sent = await deliverSay(name, "", "", wakeText(park, how, whenOf(park.until)));
    if (!sent?.ok) return { error: sent?.error || "the chat did not take the wake-up" };
    const after = all();
    delete after[name];
    save(after);
    log(`parked: ${name} woke (${how})`);
    return { ok: true };
  }

  async function passes(park) {
    try {
      const said = await checkRun(park.check, PARK_CHECK_TIMEOUT_MS);
      return !!said?.ok;
    } catch { return false; }
  }

  async function tick(at = now()) {
    if (running) return [];
    running = true;
    const woke = [];
    try {
      const alive = new Set((await liveSessions()).map((one) => one.name));
      const known = new Set(knownSeats());
      const parks = all();
      const gone = Object.keys(parks).filter((name) => !alive.has(name) && !known.has(name));
      if (gone.length) {
        const kept = all();
        for (const name of gone) delete kept[name];
        save(kept);
      }
      for (const name of dueParks(parks, at)) {
        if (!alive.has(name)) continue;
        const done = await wake(name, "time");
        if (done.ok) woke.push({ name, how: "time" });
      }
      for (const name of checksDue(parks, at)) {
        if (!alive.has(name) || gone.includes(name)) continue;
        if (await passes(parks[name])) {
          const done = await wake(name, "check");
          if (done.ok) woke.push({ name, how: "check" });
          continue;
        }
        const later = all();
        if (later[name]) { later[name].checkedAt = at; save(later); }
      }
    } finally { running = false; }
    return woke;
  }

  function register(on, bodyOf) {
    const nameOf = (asked) => String(asked?.name || "").trim();

    on("GET", "/api/parked", async (req, res, url, json) => json({ parked: all(), now: now() }));

    on("POST", "/api/parked", async (req, res, url, json) => {
      const asked = await bodyOf(req);
      const done = await park(nameOf(asked), asked);
      return done.error ? json(done, 400) : json(done);
    });

    on("POST", "/api/parked/wake", async (req, res, url, json) => {
      const done = await wake(nameOf(await bodyOf(req)), "person");
      return done.error ? json(done, 400) : json(done);
    });

    on("POST", "/api/parked/cancel", async (req, res, url, json) => {
      const done = unpark(nameOf(await bodyOf(req)));
      return done.error ? json(done, 400) : json(done);
    });
  }

  return { all, park, unpark, wake, tick, register };
}

export function registerParkRoutes(on, context) {
  const domain = createParkDomain(context);
  domain.register(on, context.bodyOf);
  return domain;
}

export const GRANT_MS = 900000;
export const GRANTS_KEPT = 64;

export function grantOf({ seat, to, now = Date.now(), forMs = GRANT_MS }) {
  return { seat, to, at: now, until: now + forMs };
}

export function liveGrants(grants, now = Date.now()) {
  return (grants || []).filter((one) => one && one.until > now);
}

export function grantFor(grants, seat, to, now = Date.now()) {
  return liveGrants(grants, now).find((one) => one.seat === seat && one.to === to) || null;
}

export function withGrant(grants, grant, now = Date.now()) {
  const kept = liveGrants(grants, now).filter((one) => !(one.seat === grant.seat && one.to === grant.to));
  return [...kept, grant].slice(-GRANTS_KEPT);
}

export function withoutGrant(grants, seat, to, now = Date.now()) {
  return liveGrants(grants, now).filter((one) => !(one.seat === seat && (!to || one.to === to)));
}

export function createGrants({ read, write, now = () => Date.now() } = {}) {
  let held = load();

  function load() {
    try {
      const parsed = JSON.parse(read() || "null");
      if (Array.isArray(parsed?.grants)) return parsed.grants;
    } catch {}
    return [];
  }

  function save(next) {
    held = next;
    write(JSON.stringify({ grants: next }, null, 2));
    return next;
  }

  return {
    get all() { return liveGrants(held, now()); },

    allows(seat, to) {
      return !!grantFor(held, seat, to, now());
    },

    lend(seat, to, forMs = GRANT_MS) {
      const grant = grantOf({ seat, to, now: now(), forMs });
      save(withGrant(held, grant, now()));
      return grant;
    },

    take(seat, to = "") {
      const before = liveGrants(held, now()).length;
      save(withoutGrant(held, seat, to, now()));
      return { taken: before - liveGrants(held, now()).length };
    },

    sweep() {
      const before = held.length;
      const after = liveGrants(held, now());
      if (after.length !== before) save(after);
      return before - after.length;
    }
  };
}

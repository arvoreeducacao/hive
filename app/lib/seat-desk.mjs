import { sayWithShot } from "../../server/shot.mjs";

export const EVENTS_PATH = /^\/api\/sessions\/([^/?]+)\/events(?:\?(.*))?$/;
export const COMMAND_PATH = /^\/api\/sessions\/([^/?]+)\/command$/;
export const PICTURE_PATH = /^\/api\/sessions\/([^/?]+)\/picture$/;

export function createDesk(sessions, { base = "", keep = null, now = () => Date.now() } = {}) {
  const following = new Map();

  const tellPresence = (name, watched) => Promise.resolve()
    .then(() => sessions.command(name, { type: "presence", watched }))
    .catch(() => {});

  function deliver(name, event) {
    const held = following.get(name);
    if (!held) return;
    if (event?.type === "driver" && event.subtype === "started") tellPresence(name, true);
    const envelope = { kind: "event", body: { session: name, event } };
    for (const listener of [...held]) {
      try { listener(envelope); } catch {}
    }
  }

  const client = {
    async get(path) {
      const asked = EVENTS_PATH.exec(String(path || ""));
      if (!asked) return { ok: false, status: 404, error: "the desk answers only for a seat's events" };
      const query = new URLSearchParams(asked[2] || "");
      const held = sessions.history(decodeURIComponent(asked[1]), Number(query.get("from")) || 0, {
        window: query.get("window") || "all",
        turns: Number(query.get("turns")) || 0,
        before: Number(query.get("before")) || 0
      });
      if (held.error) return { ok: false, status: 404, error: held.error };
      return { ok: true, status: 200, body: held };
    },

    async post(path, body) {
      const asked = COMMAND_PATH.exec(String(path || ""));
      if (asked) {
        const said = await sessions.command(decodeURIComponent(asked[1]), body ?? {});
        if (said?.ok) return { ok: true, status: 200, body: said };
        return { ok: false, status: 502, error: said?.error || "the seat did not take it" };
      }

      const shown = PICTURE_PATH.exec(String(path || ""));
      if (!shown) return { ok: false, status: 404, error: "the desk carries only a command or a picture to a seat" };
      if (!keep) return { ok: false, status: 500, error: "this desk does not know where to keep a picture" };
      const seat = decodeURIComponent(shown[1]);
      const kept = keep(base, seat, body?.image, { at: now() });
      if (kept.error) return { ok: false, status: 400, error: kept.error };
      const said = await sessions.command(seat, sayWithShot(body?.text, kept.path));
      if (said?.ok) return { ok: true, status: 200, body: { ...said, path: kept.path } };
      return { ok: false, status: 502, error: said?.error || "the seat did not take the picture" };
    }
  };

  const stream = {
    get up() { return true; },
    follow(name, onEnvelope) {
      const held = following.get(name) || new Set();
      if (!held.size) tellPresence(name, true);
      held.add(onEnvelope);
      following.set(name, held);
      return {
        stop() {
          const still = following.get(name);
          if (!still || !still.delete(onEnvelope)) return;
          if (still.size) return;
          following.delete(name);
          tellPresence(name, false);
        }
      };
    }
  };

  return { client, stream, deliver, get watching() { return [...following.keys()]; } };
}

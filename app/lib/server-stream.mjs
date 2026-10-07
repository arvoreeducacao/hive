import { WebSocket } from "ws";
import { signedQuery } from "../../server/client.mjs";

export const RETRY_STEP = 1000;
export const RETRY_CAP = 15000;
export const TURNED_AWAY_STEP = 60000;
export const TURNED_AWAY_CAP = 300000;
export const COMPLAIN_AFTER = 4;
export const REASON_CEILING = 200;
export const TURNED_AWAY = new Set([401, 403]);

export function streamUrlOf({ url, socket, identity, audience }) {
  const query = signedQuery({ secret: identity.secret, fingerprint: identity.fingerprint, audience });
  if (socket) return `ws+unix://${socket}:/stream?${query}`;
  return `${String(url).replace(/^http/, "ws").replace(/\/+$/, "")}/stream?${query}`;
}

export function reasonOf(said, status) {
  const bare = String(said || "").trim();
  if (bare.startsWith("{")) {
    try {
      const parsed = JSON.parse(bare);
      if (parsed?.error) return String(parsed.error).slice(0, REASON_CEILING);
    } catch {}
  }
  if (bare && !bare.startsWith("<")) return bare.slice(0, REASON_CEILING);
  return `the door answered ${status} and said nothing else`;
}

export function attachServerStream({
  identity,
  audience,
  url = "",
  socket = "",
  open = null,
  warn = () => {},
  retryStep = RETRY_STEP,
  retryCap = RETRY_CAP,
  turnedAwayStep = TURNED_AWAY_STEP,
  turnedAwayCap = TURNED_AWAY_CAP,
  complainAfter = COMPLAIN_AFTER
} = {}) {
  const watchers = new Map();
  let live = null;
  let attempt = 0;
  let refusals = 0;
  let saidAbout = "";
  let leaving = false;
  let waking = null;

  const dial = open || (() => new WebSocket(streamUrlOf({ url, socket, identity, audience })));

  function sleepAgain(delay) {
    clearTimeout(waking);
    waking = setTimeout(attach, delay);
    waking.unref?.();
  }

  function again(why) {
    if (leaving) return;
    attempt += 1;
    if (attempt === complainAfter || (attempt > complainAfter && attempt % 10 === 0)) warn(why);
    sleepAgain(Math.min(retryCap, retryStep * attempt));
  }

  function turnedAway(why) {
    if (leaving) return;
    refusals += 1;
    if (saidAbout !== why) {
      saidAbout = why;
      warn(why);
    }
    sleepAgain(Math.min(turnedAwayCap, turnedAwayStep * refusals));
  }

  function attach() {
    waking = null;
    let mine = null;
    try { mine = dial(); } catch (wrong) { return again(`could not reach the server stream: ${wrong.message}`); }
    if (!mine) return again("could not reach the server stream");
    live = mine;

    let spent = false;
    const overFor = (report) => (...said) => {
      if (spent) return;
      spent = true;
      if (live === mine) live = null;
      report(...said);
    };

    mine.on("open", () => { attempt = 0; refusals = 0; saidAbout = ""; });
    mine.on("message", (raw) => {
      let envelope = null;
      try { envelope = JSON.parse(String(raw)); } catch { return; }
      const name = envelope?.body?.session;
      if (name && watchers.has(name)) for (const cb of watchers.get(name)) cb(envelope);
      if (!name) for (const held of watchers.values()) for (const cb of held) cb(envelope);
    });
    mine.on("unexpected-response", (asked, said) => {
      const status = Number(said?.statusCode) || 0;
      const shut = overFor((why) => (TURNED_AWAY.has(status) ? turnedAway(why) : again(`server stream: ${why}`)));
      let held = "";
      const socket = said?.socket || asked?.socket || null;
      socket?.on("error", () => {});
      const hangUp = () => {
        try { said.destroy(); } catch {}
        try { asked.destroy(); } catch {}
        try { socket?.destroy(); } catch {}
      };
      said.on("data", (chunk) => { if (held.length <= REASON_CEILING * 2) held += String(chunk); });
      said.once("error", () => { shut(reasonOf("", status)); hangUp(); });
      said.once("end", () => { shut(reasonOf(held, status)); hangUp(); });
    });
    mine.on("close", overFor(() => again("the server stream closed")));
    mine.on("error", overFor((wrong) => again(`server stream: ${wrong?.message || wrong}`)));
  }

  attach();

  return {
    get up() { return !!live && live.readyState === 1; },
    get watching() { return [...watchers.keys()]; },
    get refusal() { return saidAbout; },
    follow(name, cb) {
      const held = watchers.get(name) || new Set();
      held.add(cb);
      watchers.set(name, held);
      return {
        stop() {
          const still = watchers.get(name);
          if (!still) return;
          still.delete(cb);
          if (!still.size) watchers.delete(name);
        }
      };
    },
    stop() {
      leaving = true;
      clearTimeout(waking);
      watchers.clear();
      const going = live;
      live = null;
      try { going?.close(); } catch {}
    }
  };
}

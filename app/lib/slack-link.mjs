import { forgetLink, readLink, writeLink } from "./slack-hive.mjs";

export const LINK_POLL = 2000;

export function createSlackLinker({
  home,
  relayOf = () => "",
  fetchImpl = globalThis.fetch,
  now = Date.now,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)),
  poll = LINK_POLL,
  log = () => {}
} = {}) {
  let pending = null;
  let trouble = "";

  async function reach(path, options = {}) {
    const relay = relayOf();
    if (!relay) return { ok: false, error: "this hive does not know where the slack relay lives" };
    try {
      const answer = await fetchImpl(`${relay}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
      const said = await answer.json();
      return said && typeof said === "object" ? said : { ok: false, error: `the relay answered ${answer.status}` };
    } catch (wrong) {
      return { ok: false, error: `the relay did not answer — ${String(wrong?.message || wrong)}` };
    }
  }

  async function watch(asked) {
    while (pending === asked && now() < asked.until) {
      await wait(poll);
      if (pending !== asked) return;
      const said = await reach(`/link/wait?code=${encodeURIComponent(asked.code)}&claim=${encodeURIComponent(asked.claim)}`);
      if (pending !== asked) return;
      if (said.ok && said.token) {
        writeLink(home, { token: said.token, user: said.user, relay: asked.relay, at: now() });
        pending = null;
        trouble = "";
        log(`slack: this hive is now linked to ${said.user}`);
        return;
      }
      if (!said.ok) { pending = null; trouble = said.error || "the code expired"; return; }
    }
    if (pending === asked) { pending = null; trouble = "the code expired before it reached slack"; }
  }

  return {
    async start() {
      const relay = relayOf();
      const said = await reach("/link/start", { method: "POST" });
      if (!said.ok || !said.code) { trouble = said.error || "the relay gave no code"; return { error: trouble }; }
      pending = { code: said.code, claim: said.claim, until: Number(said.until) || now() + 10 * 60 * 1000, bot: said.bot || "", relay };
      trouble = "";
      watch(pending).catch((wrong) => { trouble = String(wrong?.message || wrong); pending = null; });
      return { ok: true, code: pending.code, until: pending.until, bot: pending.bot };
    },

    forget() {
      pending = null;
      trouble = "";
      forgetLink(home);
      return { ok: true };
    },

    state() {
      const link = readLink(home);
      return {
        relay: relayOf(),
        linked: link ? link.user : "",
        pending: pending ? { code: pending.code, until: pending.until, bot: pending.bot } : null,
        trouble
      };
    }
  };
}

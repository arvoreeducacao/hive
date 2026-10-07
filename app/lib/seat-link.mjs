export const RETRY_STEP = 500;
export const RETRY_CAP = 10000;
export const COMPLAIN_AFTER = 4;

export function replyLine(reply, cid = null) {
  return JSON.stringify({ bridge_reply: reply, cid });
}

export function commandRoute(cmd) {
  if (!cmd || typeof cmd.type !== "string" || !cmd.type) return null;
  return { path: "/command", body: cmd };
}

export function attachSeat({
  client,
  stream,
  name,
  from = 0,
  window = "all",
  turns = 0,
  send,
  onStop = () => {},
  retryStep = RETRY_STEP,
  retryCap = RETRY_CAP,
  complainAfter = COMPLAIN_AFTER
} = {}) {
  let seen = from;
  let leaving = false;
  let attempt = 0;
  let waking = null;

  const forward = (event) => {
    if (Number.isFinite(event?.seq)) {
      if (event.seq <= seen) return;
      seen = event.seq;
    }
    send(JSON.stringify(event));
  };

  const listen = stream.follow(name, (envelope) => {
    if (envelope?.kind === "event" && envelope.body?.session === name) forward(envelope.body.event);
  });

  async function catchUp() {
    if (leaving) return;
    let held = { ok: false, error: "" };
    try {
      held = await client.get(`/api/sessions/${encodeURIComponent(name)}/events?from=${seen}&window=${seen ? "all" : window}${turns ? `&turns=${turns}` : ""}`);
    } catch (wrong) {
      held = { ok: false, error: wrong.message };
    }
    if (leaving) return;
    if (!held.ok) {
      attempt += 1;
      if (attempt === complainAfter) send(replyLine({ ok: false, error: held.error || "the server did not answer for this seat" }));
      clearTimeout(waking);
      waking = setTimeout(catchUp, Math.min(retryCap, retryStep * attempt));
      waking.unref?.();
      return;
    }
    attempt = 0;
    for (const event of held.body?.events || []) forward(event);
  }

  catchUp();

  return {
    get seq() { return seen; },
    async command(raw) {
      let cmd = null;
      try { cmd = JSON.parse(String(raw)); } catch {
        send(replyLine({ ok: false, error: "unparseable command" }));
        return;
      }
      const route = commandRoute(cmd);
      if (!route) {
        send(replyLine({ ok: false, error: "a command needs a type" }, cmd?.cid ?? null));
        return;
      }
      const said = await client.post(`/api/sessions/${encodeURIComponent(name)}${route.path}`, route.body);
      send(replyLine(said.ok ? (said.body ?? { ok: true }) : { ok: false, error: said.error }, cmd.cid ?? null));
    },
    stop() {
      leaving = true;
      clearTimeout(waking);
      try { listen?.stop?.(); } catch {}
      onStop();
    }
  };
}

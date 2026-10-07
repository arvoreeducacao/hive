import { answerOf, askLine, canPoke, grantLive, knockOf, owedOf, pokeOf } from "../lib/team.mjs";

export function registerTeamRoutes(on, context) {
  const {
    bodyOf,
    getDev,
    devName,
    deliverSay,
    dropLive,
    followTeamNotes,
    isSeatName,
    keyboards,
    knocksWaiting,
    lendKeyboard,
    noteToPeer,
    keepOwed = () => {},
    now = Date.now,
    onPeerSeat,
    owing,
    peerKeyOf,
    peerTakesKnocks = () => true,
    getPokers,
    pokesWaiting,
    publishPanel,
    readHive,
    readTeam,
    refreshLentTurns,
    state,
    tellTheAsker,
    turnsOfSeat
  } = context;

  on(null, "/api/knocks", async (req, res, url, json) => {
    await followTeamNotes();
    state.knocking = knocksWaiting();
    const pokes = pokesWaiting();
    state.poking = [];
    const moved = state.teamMoved;
    state.teamMoved = false;
    return json({
      knocks: state.knocking,
      pokes,
      moved,
      lent: [...keyboards.entries()].filter(([, keyboard]) => grantLive(keyboard)).map(([seat, keyboard]) => ({ seat, with: keyboard.with, until: keyboard.until }))
    });
  });

  on("POST", "/api/knocks/answer", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const seat = String(asked.seat || "");
    const from = String(asked.from || "");
    const id = String(asked.id || "");
    const wanted = id ? state.knocking.find((knock) => knock.kind === "ask" && knock.from === from && knock.id === id) : null;
    state.knocking = state.knocking.filter((knock) => (knock.from !== from || knock.seat !== seat) && (!id || knock.id !== id));
    if (wanted) {
      if (!asked.ok) {
        const dev = getDev();
        await noteToPeer(from, "answer", answerOf(dev, wanted.agent, "not now", now(), id)).catch(() => {});
        return json({ ok: true, lent: false });
      }
      if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
      const landed = await deliverSay(seat, from, wanted.text, askLine(from, wanted.agent, wanted.text));
      if (!landed.ok) return json({ error: landed.error }, 502);
      let turns = [];
      try { turns = await turnsOfSeat(seat); } catch {}
      owing.set(seat, { ...owedOf(seat, from, wanted.agent, id, now()), mark: turns.length });
      keepOwed();
      return json({ ok: true, lent: false, answering: true });
    }
    if (!asked.ok) return json({ ok: true, lent: false });
    if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
    lendKeyboard(seat, from);
    await refreshLentTurns();
    publishPanel().then(() => tellTheAsker(from, seat)).catch(() => {});
    return json({ ok: true, lent: true });
  });

  on("POST", "/api/knocks/revoke", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const seat = String(asked.seat || "");
    keyboards.delete(seat);
    dropLive(seat);
    publishPanel().catch(() => {});
    return json({ ok: true });
  });

  on("POST", "/api/team/knock", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const dev = getDev();
    if (!dev) return json({ error: "this hive has no name — set HIVE_DEV" }, 400);
    const seat = String(asked.seat || "");
    if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
    if (!peerTakesKnocks(String(asked.dev || ""))) return json({ error: "that hive is not taking knocks right now" }, 403);
    const sent = await noteToPeer(String(asked.dev || ""), "knock", knockOf(dev, seat, now()));
    return sent.ok ? json({ ok: true }) : json({ error: sent.error }, 502);
  });

  on("POST", "/api/team/poke", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const dev = getDev();
    if (!dev) return json({ error: "this hive has no name — set HIVE_DEV" }, 400);
    if (!canPoke(dev, getPokers())) return json({ error: "this hive does not do that" }, 403);
    if (!peerTakesKnocks(String(asked.dev || ""))) return json({ error: "that hive is not taking knocks right now" }, 403);
    const sent = await noteToPeer(String(asked.dev || ""), "poke", pokeOf(dev, now(), asked.hello === true));
    return sent.ok ? json({ ok: true }) : json({ error: sent.error }, 502);
  });

  on("POST", "/api/team/bye", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const dev = getDev();
    if (!dev) return json({ error: "this hive has no name — set HIVE_DEV" }, 400);
    const seat = String(asked.seat || "");
    if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
    const sent = await noteToPeer(String(asked.dev || ""), "knock", knockOf(dev, seat, now(), "bye"));
    return sent.ok ? json({ ok: true }) : json({ error: sent.error }, 502);
  });

  on("POST", "/api/team/say", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const dev = getDev();
    if (!dev) return json({ error: "this hive has no name — set HIVE_DEV" }, 400);
    const seat = String(asked.seat || "");
    const text = String(asked.text || "").trim();
    if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
    if (!text) return json({ error: "there is nothing to send" }, 400);
    const to = await peerKeyOf(String(asked.dev || ""));
    if (!to) return json({ error: "I do not know that hive yet" }, 404);
    const said = await onPeerSeat(to, seat, "/say", { text });
    if (said.ok) return json({ ok: true });
    if (said.status === 403) return json({ error: "that keyboard is not yours right now" }, 409);
    return json({ error: said.error }, 502);
  });

  on(null, "/api/team/live", async (req, res, url, json) => {
    const targetDev = String(url.searchParams.get("dev") || "");
    const seat = String(url.searchParams.get("seat") || "");
    const asked = Number(url.searchParams.get("at") || 0);
    const from = Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : 0;
    const dev = getDev();
    if (!dev) return json({ error: "this hive has no name — set HIVE_DEV" }, 400);
    if (!devName.test(targetDev)) return json({ error: "that hive has a name I cannot address" }, 400);
    if (!isSeatName(seat)) return json({ error: "that seat has a name I cannot address" }, 400);
    const to = await peerKeyOf(targetDev);
    if (!to) return json({ error: "I do not know that hive yet" }, 404);
    const said = await onPeerSeat(to, seat, `/events?from=${from}`, null);
    if (!said.ok && said.status === 403) return json({ error: "that keyboard is not yours right now" }, 409);
    if (!said.ok) return json({ error: said.error }, 502);
    return json({ at: said.body?.seq ?? from, reset: false, events: said.body?.events ?? [] });
  });

  on(null, "/api/team", async (req, res, url, json) => {
    const only = String(url.searchParams.get("dev") || "");
    if (!only) return json(await readTeam(!!url.searchParams.get("force")));
    if (!devName.test(only)) return json({ error: "that hive has a name I cannot address" }, 400);
    return json(await readHive(only));
  });
}

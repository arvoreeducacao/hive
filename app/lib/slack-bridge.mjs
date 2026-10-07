import { askSlack, chatOfSeat, chatOfThread, earlierOnSlack, missionForSlack, readChats, saidOnSlack, slackified, splitForSlack, withoutTheBot, writeChats } from "./slack-hive.mjs";

export const SEEN_KEPT = 300;
export const NOT_MINE = "Esse Hive é a máquina de outra pessoa, e só ela chama por aqui.";
export const PING_EVERY = 20000;
export const PONG_WAIT = 10000;

const listen = (socket, kind, fn) => {
  if (typeof socket.on === "function") socket.on(kind, fn);
  else socket.addEventListener(kind, (event) => fn(kind === "message" ? event.data : event));
};

export function createSlackBridge({
  home,
  keysOf = () => ({ bot: "", app: "", people: [], api: "" }),
  openChat = async () => ({ error: "this machine cannot open a chat" }),
  say = async () => ({ ok: false, error: "there is no seat to say it to" }),
  log = () => {},
  socketImpl = null,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  let socket = null;
  let live = false;
  let connecting = null;
  let botUser = "";
  let lastWhy = "";
  let heard = 0;
  let heardAt = 0;
  let connects = 0;
  let keysUsed = "";
  let stirredAt = 0;
  let pingedAt = 0;
  const seen = new Set();
  const channels = new Map();
  const people = new Map();

  const complain = (why) => {
    if (why === lastWhy) return;
    lastWhy = why;
    if (why) log(`slack: ${why}`);
  };

  const remember = (mark) => {
    seen.add(mark);
    if (seen.size > SEEN_KEPT) seen.delete(seen.values().next().value);
  };

  const ask = (method, payload) => {
    const keys = keysOf();
    return askSlack(method, keys.bot, payload, { fetchImpl, api: keys.api });
  };

  async function post(channel, thread, text) {
    const pieces = splitForSlack(text);
    if (!pieces.length) return { error: "there is nothing to send" };
    for (const piece of pieces) {
      const sent = await ask("chat.postMessage", { channel, thread_ts: thread, text: piece });
      if (!sent.ok) return { error: sent.error };
    }
    return { ok: true };
  }

  async function react(channel, ts, name) {
    const said = await ask("reactions.add", { channel, timestamp: ts, name });
    if (!said.ok && said.error !== "already_reacted") log(`slack: the ${name} did not stick — ${said.error}`);
  }

  async function channelName(id) {
    if (channels.has(id)) return channels.get(id);
    const said = await ask("conversations.info", { channel: id });
    const name = said.ok ? String(said.channel?.name || "") : "";
    channels.set(id, name);
    return name;
  }

  async function personName(id) {
    if (people.has(id)) return people.get(id);
    const said = await ask("users.info", { user: id });
    const face = said.ok ? said.user?.profile || {} : {};
    const name = face.display_name || face.real_name || (said.ok ? said.user?.name : "") || id;
    people.set(id, name);
    return name;
  }

  /* a mention dropped into a thread that is already running arrives with nothing but the
     mention: without what was said before it, the chat answers a question it cannot see. */
  async function threadSoFar(channel, thread, upTo) {
    const said = await ask("conversations.replies", { channel, ts: thread, limit: 40 });
    if (!said.ok) {
      log(`slack: could not read the thread ${channel}:${thread} — ${said.error}`);
      return [];
    }
    const before = [];
    for (const one of said.messages || []) {
      if (!one?.ts || one.ts === upTo || Number(one.ts) > Number(upTo)) continue;
      const who = one.user ? await personName(one.user) : String(one.username || "app");
      const text = withoutTheBot(one.text, botUser);
      if (text) before.push({ who, text });
    }
    return earlierOnSlack(before);
  }

  async function linkOf(channel, ts) {
    const said = await ask("chat.getPermalink", { channel, message_ts: ts });
    if (said.ok) return String(said.permalink || "");
    log(`slack: no permalink for ${channel}:${ts} — ${said.error}`);
    return "";
  }

  async function openFor({ channel, thread, ts, text, person, direct }) {
    const where = direct ? "" : await channelName(channel);
    const earlier = thread && ts && thread !== ts ? await threadSoFar(channel, thread, ts) : [];
    const link = direct ? "" : await linkOf(channel, thread);
    const made = await openChat({
      prompt: missionForSlack({ text, channelName: where, person, direct, link, earlier }),
      errand: direct ? "slack · mensagem direta" : `slack · #${where || channel}`
    });
    if (made.error) {
      await post(channel, thread, `Não consegui abrir o chat: ${made.error}`);
      return { error: made.error };
    }
    const chats = await readChats(home);
    await writeChats(home, [
      ...chats.filter((one) => !(one.channel === channel && one.thread === thread)),
      { channel, thread, seat: made.name, where: made.where || "local", who: person, at: now() }
    ]);
    await post(channel, thread, `Abri o chat \`${made.name}\` na máquina. O que ele responder cai aqui.`);
    log(`slack: ${made.name} answers the thread ${channel}:${thread}`);
    return { ok: true, name: made.name };
  }

  async function onEvent(event) {
    const kind = event?.type;
    if (kind !== "message" && kind !== "app_mention") return;
    if (event.subtype || !event.user) return;
    if (botUser && event.user === botUser) return;
    const channel = String(event.channel || "");
    const ts = String(event.ts || "");
    if (!channel || !ts) return;
    const thread = String(event.thread_ts || ts);
    const mark = `${channel}:${ts}`;
    if (seen.has(mark)) return;
    remember(mark);

    const direct = event.channel_type === "im";
    const chats = await readChats(home);
    const known = chatOfThread(chats, channel, thread);
    if (!known && kind === "message" && !direct) return;

    const keys = keysOf();
    if (keys.people.length && !keys.people.includes(event.user)) {
      /* a robot in a bound thread is noise, not a person to turn away: telling it
         that this machine is not its own would only put another message in the thread. */
      if (!event.bot_id) await post(channel, thread, NOT_MINE);
      return;
    }

    const text = withoutTheBot(event.text, botUser);
    if (!text) return;
    await react(channel, ts, "eyes");
    const person = await personName(event.user);

    if (!known) return openFor({ channel, thread, ts, text, person, direct });

    const sent = await say(known.seat, saidOnSlack({ text, person }));
    if (sent.ok) return;
    await writeChats(home, chats.filter((one) => one !== known));
    await post(channel, thread, `O chat \`${known.seat}\` não está mais aberto — ${sent.error}. Abrindo outro.`);
    return openFor({ channel, thread, ts, text, person, direct });
  }

  function send(note) {
    try { socket?.send(JSON.stringify(note)); } catch {}
  }

  const stirred = () => { stirredAt = now(); pingedAt = 0; };

  async function take(raw) {
    stirred();
    heard += 1;
    heardAt = now();
    let note = null;
    try { note = JSON.parse(String(raw)); } catch { return; }
    if (note?.envelope_id) send({ envelope_id: note.envelope_id });
    if (note?.type === "hello") { complain(""); return; }
    if (note?.type === "disconnect") { drop(); return; }
    if (note?.type !== "events_api") return;
    try { await onEvent(note.payload?.event); }
    catch (wrong) { log(`slack: that event went nowhere — ${String(wrong?.message || wrong)}`); }
  }

  function drop({ dead = false } = {}) {
    live = false;
    const going = socket;
    socket = null;
    pingedAt = 0;
    try {
      if (dead && typeof going?.terminate === "function") going.terminate();
      else going?.close();
    } catch {}
  }

  function stillThere() {
    if (!socket || !live || typeof socket.ping !== "function") return true;
    if (pingedAt && now() - pingedAt > PONG_WAIT) {
      log(`slack: nothing came back on the socket for ${Math.round((now() - stirredAt) / 1000)}s, the bridge reconnects`);
      drop({ dead: true });
      return false;
    }
    if (!pingedAt && now() - stirredAt > PING_EVERY) {
      pingedAt = now();
      try { socket.ping(); } catch { drop({ dead: true }); return false; }
    }
    return true;
  }

  async function connect(keys) {
    if (!socketImpl) { complain("this build has no websocket to reach slack with"); return false; }
    const opened = await askSlack("apps.connections.open", keys.app, {}, { fetchImpl, api: keys.api });
    if (!opened.ok) { complain(`slack would not open the socket — ${opened.error}`); return false; }
    if (!botUser) {
      const who = await askSlack("auth.test", keys.bot, {}, { fetchImpl, api: keys.api });
      if (!who.ok) { complain(`the bot token is not answering — ${who.error}`); return false; }
      botUser = String(who.user_id || "");
      log(`slack: this machine answers as @${who.user} (${botUser})`);
    }
    const fresh = new socketImpl(opened.url);
    connects += 1;
    socket = fresh;
    listen(fresh, "message", (raw) => { take(raw).catch(() => {}); });
    listen(fresh, "close", () => { if (socket === fresh) { live = false; socket = null; } });
    listen(fresh, "error", (wrong) => complain(`the socket broke — ${String(wrong?.message || wrong)}`));
    listen(fresh, "pong", () => { if (socket === fresh) stirred(); });
    listen(fresh, "ping", () => { if (socket === fresh) stirred(); });
    listen(fresh, "open", () => { live = true; stirred(); });
    return true;
  }

  return {
    get botUser() { return botUser; },
    take,

    async tick() {
      const keys = keysOf();
      if (!keys.bot || !keys.app) {
        if (socket) { drop(); log("slack: the tokens are gone, the bridge stops"); }
        complain("this hive is not connected to slack yet — connect it in the preferences");
        return { running: false, why: lastWhy };
      }
      const using = `${keys.api || ""}|${keys.app}|${keys.bot}`;
      if (using !== keysUsed) {
        if (socket) { drop(); log("slack: the keys changed, the bridge reconnects"); }
        keysUsed = using;
        botUser = "";
      }
      if (socket && stillThere()) return { running: live };
      if (!connecting) connecting = connect(keys).finally(() => { connecting = null; });
      const up = await connecting;
      return { running: !!up && live, why: lastWhy };
    },

    async replyFromSeat(seat, text) {
      const said = String(text || "").trim();
      if (!said) return { error: "there is nothing to say" };
      const found = chatOfSeat(await readChats(home), seat);
      if (!found) return { error: "this chat did not come from slack, so there is no thread to answer in" };
      const sent = await post(found.channel, found.thread, slackified(said));
      if (sent.error) return { error: sent.error };
      return { ok: true, channel: found.channel, thread: found.thread };
    },

    async chats() { return readChats(home); },

    state() {
      const keys = keysOf();
      return { running: live, bot: botUser, guarded: keys.people.length, relayed: !!keys.relayed, why: lastWhy, heard, heardAt, connects };
    },

    stop() { drop(); }
  };
}

const HIVE_SERVER = "hive";

const KINDS = { message: "message", ask: "ask", peek: "peek", peers: "peers", spawn: "spawn", close: "close", rename: "title", link_pr: "link", unlink_pr: "unlink" };

const LOOKS = new Set(["ask", "peek", "peers"]);

const RACE = /opening a race of (\d+) chats/i;

const ONE_SEAT = /opening a seat with/i;

const ITSELF = ":itself";

function hiveCallOf(server, tool, input) {
  if (server !== HIVE_SERVER) return null;
  const kind = KINDS[tool];
  if (!kind) return null;
  const asked = input && typeof input === "object" ? input : {};
  const seat = typeof asked.seat === "string" ? asked.seat.trim().toLowerCase() : "";
  const made = kind === "spawn" ? Math.max(1, Math.floor(Number(asked.count) || 1)) : 0;
  return { kind, seat, made };
}

function chatsOpenedIn(text, fallback = 1) {
  const said = String(text ?? "");
  const race = RACE.exec(said);
  if (race) return Number(race[1]);
  return ONE_SEAT.test(said) ? 1 : fallback;
}

const isOrchestration = (b) => !!b?.hive?.kind;

const orchestrationKey = (b) => `hive:${b.hive.kind}`;

const orchestrationPriority = (key) => (LOOKS.has(key.slice(5)) ? 1 : 0);

function seatsOf(calls, { self = false } = {}) {
  const seats = calls.map((b) => b.hive.seat || (self ? ITSELF : ""));
  return { known: seats.every(Boolean), count: new Set(seats).size };
}

function orchestrationLabel(key, calls, say) {
  const n = calls.length;
  const kind = key.slice(5);
  if (kind === "message") {
    const to = seatsOf(calls);
    if (!to.known) return n === 1 ? say("Sent {n} message", { n }) : say("Sent {n} messages", { n });
    if (n === 1) return say("Sent {n} message to {m} chat", { n, m: to.count });
    return to.count === 1 ? say("Sent {n} messages to {m} chat", { n, m: to.count }) : say("Sent {n} messages to {m} chats", { n, m: to.count });
  }
  if (kind === "ask") {
    const to = seatsOf(calls);
    if (!to.known) return n === 1 ? say("Asked {n} question", { n }) : say("Asked {n} questions", { n });
    return to.count === 1 ? say("Asked {m} chat", { m: to.count }) : say("Asked {m} chats", { m: to.count });
  }
  if (kind === "peek") {
    const read = seatsOf(calls);
    if (!read.known) return say("Looked at other chats");
    return read.count === 1 ? say("Read {m} chat", { m: read.count }) : say("Read {m} chats", { m: read.count });
  }
  if (kind === "peers") return n === 1 ? say("Checked the open chats") : say("Checked the open chats {n} times", { n });
  if (kind === "spawn") {
    const opened = calls.reduce((sum, b) => sum + (b.hive.made || 1), 0);
    return opened === 1 ? say("Opened {n} chat", { n: opened }) : say("Opened {n} chats", { n: opened });
  }
  if (kind === "close") {
    const shut = seatsOf(calls, { self: true }).count;
    return shut === 1 ? say("Closed {n} chat", { n: shut }) : say("Closed {n} chats", { n: shut });
  }
  if (kind === "title") return n === 1 ? say("Changed this chat's title") : say("Changed this chat's title {n} times", { n });
  if (kind === "link") return n === 1 ? say("Linked a pull request to this chat") : say("Linked {n} pull requests to this chat", { n });
  return n === 1 ? say("Unlinked the pull request from this chat") : say("Unlinked {n} pull requests from this chat", { n });
}

const failedLabel = (n, say) => (n === 1 ? say("1 call failed") : say("{n} calls failed", { n }));

export { HIVE_SERVER, chatsOpenedIn, failedLabel, hiveCallOf, isOrchestration, orchestrationKey, orchestrationLabel, orchestrationPriority };

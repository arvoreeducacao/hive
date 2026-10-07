import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SLACK_API = "https://slack.com/api";
export const SLACK_CHARS = 3500;
export const CHATS_FILE = "slack-chats.json";
export const LINK_FILE = "slack-link.json";
const CHATS_KEPT = 200;
const KEY_NAMES = ["HIVE_SLACK_BOT_TOKEN", "HIVE_SLACK_APP_TOKEN", "HIVE_SLACK_USERS"];

function fromEnvFile(envFile) {
  if (!envFile || !existsSync(envFile)) return {};
  const held = {};
  try {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const at = line.indexOf("=");
      if (at < 1) continue;
      const name = line.slice(0, at).trim();
      if (!KEY_NAMES.includes(name)) continue;
      held[name] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return held;
}

export const linkFile = (home) => join(home, LINK_FILE);

export function readLink(home) {
  try {
    const said = JSON.parse(readFileSync(linkFile(home), "utf8"));
    return said?.token && said?.relay && said?.user ? { token: String(said.token), relay: String(said.relay), user: String(said.user) } : null;
  } catch { return null; }
}

export function writeLink(home, link) {
  const file = linkFile(home);
  writeFileSync(file, JSON.stringify(link, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function forgetLink(home) {
  rmSync(linkFile(home), { force: true });
}

export function relayOf({ env = process.env, config = {} } = {}) {
  const asked = String(env.HIVE_SLACK_RELAY || config.HIVE_SLACK_RELAY || "").trim();
  if (asked) return asked.replace(/\/+$/, "");
  const domain = String(env.HIVE_DOOR_DOMAIN || config.HIVE_DOOR_DOMAIN || "").trim();
  return domain ? `https://hive-slack.${domain}` : "";
}

export function slackKeys({ env = process.env, envFile = "", home = "" } = {}) {
  const held = fromEnvFile(envFile);
  const pick = (name) => String(env[name] || held[name] || "").trim();
  const bot = pick("HIVE_SLACK_BOT_TOKEN");
  const app = pick("HIVE_SLACK_APP_TOKEN");
  const link = home ? readLink(home) : null;
  if ((!bot || !app) && link) return { bot: link.token, app: link.token, people: [link.user], api: `${link.relay}/api`, relayed: true };
  return { bot, app, people: pick("HIVE_SLACK_USERS").split(/[\s,]+/).filter(Boolean), api: SLACK_API, relayed: false };
}

/* the web api takes a json body on chat.postMessage and refuses it on
   conversations.info, users.info and reactions.add — with ok:false and no
   reason a caller can act on. Form-encoded is the shape every method takes. */
export function asForm(payload) {
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null || value === "") continue;
    form.set(name, String(value));
  }
  return form;
}

export async function askSlack(method, token, payload, { fetchImpl = fetch, timeout = 15000, api = SLACK_API } = {}) {
  if (!token) return { ok: false, error: "no slack token on this machine" };
  try {
    const answer = await fetchImpl(`${api || SLACK_API}/${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: asForm(payload).toString(),
      signal: AbortSignal.timeout(timeout)
    });
    const said = await answer.json();
    if (said && said.ok) return said;
    return { ok: false, error: String(said?.error || `slack answered ${answer.status}`) };
  } catch (wrong) {
    return { ok: false, error: String(wrong?.message || wrong) };
  }
}

export const chatsFile = (home) => join(home, CHATS_FILE);

export async function readChats(home) {
  try {
    const raw = JSON.parse(await readFile(chatsFile(home), "utf8"));
    return Array.isArray(raw?.chats) ? raw.chats.filter((one) => one && one.channel && one.thread) : [];
  } catch { return []; }
}

export async function writeChats(home, chats) {
  const file = chatsFile(home);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ chats: chats.slice(-CHATS_KEPT) }, null, 2));
}

export const chatOfThread = (chats, channel, thread) =>
  chats.find((one) => one.channel === channel && one.thread === thread) || null;

export const chatOfSeat = (chats, seat) =>
  [...chats].reverse().find((one) => one.seat === seat) || null;

export function withoutTheBot(text, botUser) {
  const said = String(text || "");
  const mine = botUser ? said.split(`<@${botUser}>`).join(" ") : said;
  return mine.replace(/\s+/g, " ").trim();
}

export const EARLIER_KEPT = 20;
export const EARLIER_CHARS = 4000;
const EARLIER_LINE = 400;

export function earlierOnSlack(said = []) {
  const lines = said
    .map((one) => `${one.who || "alguém"}: ${String(one.text || "").replace(/\s+/g, " ").trim()}`)
    .filter((line) => !line.endsWith(": "))
    .slice(-EARLIER_KEPT);
  const kept = [];
  let room = EARLIER_CHARS;
  for (const line of [...lines].reverse()) {
    const cut = line.length > EARLIER_LINE ? `${line.slice(0, EARLIER_LINE)}…` : line;
    if (cut.length > room) break;
    room -= cut.length;
    kept.unshift(cut);
  }
  return kept;
}

export function missionForSlack({ text, channelName = "", person = "", direct = false, link = "", earlier = [] }) {
  const where = direct ? "a direct message" : `#${channelName || "a channel"}`;
  const who = person || "someone on the team";
  const opened = earlier.length
    ? `[slack] That is what ${who} wrote in ${where}, in a thread that was already running, and this chat was opened to answer it.`
    : `[slack] That is what ${who} wrote in ${where}, and this chat was opened to answer it.`;
  const before = earlier.length
    ? ["", "The thread before that, oldest first:", ...earlier.map((line) => `> ${line}`)]
    : [];
  const where_ = link ? ["", `The thread is at ${link} — open it when you need more than what is quoted here.`] : [];
  return [
    text,
    "",
    opened,
    ...before,
    ...where_,
    "",
    "Nothing you write here reaches them: the only way back is the reply_on_slack tool. Call it when you are done, when you need something only they can answer, and whenever you would otherwise be leaving them in silence."
  ].join("\n");
}

export function saidOnSlack({ text, person = "" }) {
  return [
    `[slack] ${person || "They"} said this in the same thread — answer with reply_on_slack:`,
    text
  ].join("\n");
}

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function slackified(text) {
  return String(text || "")
    .replace(/```(\w+)\n/g, "```\n")
    .replace(MARKDOWN_LINK, "<$2|$1>")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/(^|[^*])\*\*([^*\n]+)\*\*/g, "$1*$2*")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

export function splitForSlack(text, ceiling = SLACK_CHARS) {
  const whole = String(text || "").trim();
  if (whole.length <= ceiling) return whole ? [whole] : [];
  const pieces = [];
  let left = whole;
  while (left.length > ceiling) {
    const room = left.slice(0, ceiling);
    const cut = Math.max(room.lastIndexOf("\n\n"), room.lastIndexOf("\n"), room.lastIndexOf(" "));
    const at = cut > ceiling / 2 ? cut : ceiling;
    pieces.push(left.slice(0, at).trim());
    left = left.slice(at).trim();
  }
  if (left) pieces.push(left);
  return pieces;
}

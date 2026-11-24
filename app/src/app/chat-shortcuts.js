import { itemOf } from "./blocks.js";
import { $, phrase, st } from "./core.js";
import { goTo } from "./focus-navigation.js";
import { hud, hudCopied } from "./hud.js";
import { focusedSeat } from "./mirror.js";
import { prOfChat } from "./seat-menu.js";
import { structureHook, structureSeats, structureWorn } from "./structure.js";
import { toClipboard } from "./terminal-history.js";
import { prsOnScreen } from "./thread.js";

const sessionNames = (keys) => keys.map((key) => itemOf(key)).filter((it) => it?.kind === "session").map((it) => it.name);

function chatOrder() {
  if (structureWorn() !== "classic") return structureSeats().filter((one) => one.kind === "session").map((one) => one.name);
  const rail = [...document.querySelectorAll("#rail-sessions .item[data-name]:not(.parked)")].map((el) => el.dataset.name);
  if (rail.length) return [...new Set(rail)];
  return sessionNames(st.blocks.flatMap((b) => b.keys));
}

function stepChat(step) {
  if (structureHook("stepChat", step) === true) return true;
  const order = chatOrder();
  if (!order.length) return false;
  const now = focusedSeat()?.name;
  const at = now ? order.indexOf(now) : -1;
  const to = at < 0 ? order.at(step > 0 ? 0 : -1) : order[at + step];
  if (!to || to === now) return false;
  goTo(to);
  return true;
}

function toggleSidebar() {
  if (structureHook("toggleSidebar") === true) return true;
  const rail = $("rail");
  if (!rail || !rail.getClientRects().length) return false;
  $("rail-toggle")?.click();
  return true;
}

function readingPr() {
  if (st.reviewChat) return prOfChat(st.reviewChat);
  if (prsOnScreen() && st.openPr) return st.prs.find((pr) => pr.key === st.openPr) || null;
  return null;
}

async function copyChatLink() {
  const pr = readingPr();
  const seat = focusedSeat();
  const text = pr?.url || (seat ? `hive://seat/${seat.name}` : "");
  if (!text) return hud({ icon: "i-warn", tone: "warn", text: phrase("No chat to copy") });
  return hudCopied(text, await toClipboard(text));
}

async function copyPrNumber() {
  const seat = focusedSeat();
  const pr = readingPr() || (seat ? prOfChat(seat.name) : null);
  if (!pr?.number) return hud({ icon: "i-warn", tone: "warn", text: phrase("This chat has no PR") });
  const text = `#${pr.number}`;
  return hudCopied(text, await toClipboard(text));
}

export { chatOrder, copyChatLink, copyPrNumber, readingPr, stepChat, toggleSidebar };

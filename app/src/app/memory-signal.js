import { render } from "./arrange.js";
import { phrase } from "./core.js";
import { svConvKey, svConvPush, svConvShow } from "./conversation-model.js";
import { openTile } from "./focus-navigation.js";
import { openMemoryAt } from "./memories.js";
import { structPool } from "./structured-seats.js";
import { toClipboard } from "./terminal-history.js";

const MEMORY_SAVE_TOOL = /claude-memory.*memory_save$/;

const MEMORY_LOGIN_COMMAND = "/claude-memory:memory-login";

const TEAM_SOURCES = new Set(["shared", "curated"]);

const memoryOfSeat = new Map();

const isMemorySave = (name) => MEMORY_SAVE_TOOL.test(String(name || ""));

const relevanceSay = (value) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "");

const daySay = (date) => (/^\d{4}-\d{2}-\d{2}/.test(String(date || "")) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : "");

const clockSay = (at) => {
  const when = new Date(Number(at) || 0);
  return `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
};

function memoryUsedParts(items) {
  const team = items.filter((one) => TEAM_SOURCES.has(one.source)).length;
  const loose = items.length - team;
  const parts = [];
  if (team) parts.push({ key: "team", n: String(team), say: phrase("from the team") });
  if (loose) parts.push({ key: "loose", n: String(loose), say: phrase(loose === 1 ? "excerpt" : "excerpts") });
  return parts;
}

function memoryUsedItem(one, at) {
  const loose = one.source === "conversation";
  return {
    key: `${at}:${one.id || one.title}`,
    id: String(one.id || ""),
    source: one.source,
    verified: !loose,
    opens: one.source === "shared" && one.id ? String(one.id) : "",
    rel: relevanceSay(one.relevance),
    title: loose ? phrase("Conversation excerpt: “{title}”", { title: one.title }) : one.title,
    by: loose ? phrase("not verified") : [one.author, daySay(one.date)].filter(Boolean).join(" · ")
  };
}

function memoryUsedBlock(e, ev) {
  const items = (Array.isArray(ev.items) ? ev.items : []).filter((one) => one && one.title);
  if (!items.length) return null;
  const shared = items.find((one) => one.source === "shared" && one.id);
  return {
    key: svConvKey(e), kind: "memory",
    state: ev.state === "limited" ? "limited" : "on",
    parts: memoryUsedParts(items),
    items: items.map(memoryUsedItem),
    head: phrase("Memory used in this message"),
    more: phrase("Open in the memories panel ↗"),
    focus: shared ? String(shared.id) : ""
  };
}

function svMemoryUsed(e, ev) {
  const block = memoryUsedBlock(e, ev);
  if (!block) return null;
  const list = e.conv.blocks;
  let at = -1;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === "bubble") { at = i; break; }
  if (at < 0) return svConvPush(e, block);
  while (list[at + 1]?.kind === "memory") at++;
  list.splice(at + 1, 0, block);
  svConvShow(e);
  return block;
}

function svMemorySaveRow(e, block, live) {
  const input = block.input && typeof block.input === "object" ? block.input : {};
  const row = {
    key: svConvKey(e), kind: "memsave", running: !!live, stat: "",
    said: live ? phrase("saving to the team memory…") : phrase("saved to the team memory"),
    title: String(input.title || "").replace(/\s+/g, " ").trim().slice(0, 200),
    when: phrase("comes in through Jev at 4:30"),
    failed: ""
  };
  e.tools.set(block.id, row);
  return svConvPush(e, row);
}

function svMemorySaveLanded(e, row, block) {
  row.running = false;
  row.stat = block.is_error ? "bad" : "ok";
  row.said = block.is_error ? phrase("did not save to the team memory") : phrase("saved to the team memory");
  row.failed = block.is_error ? phrase("try again or save it by hand") : "";
  svConvShow(e);
}

function noteMemory(name, ev) {
  if (!name || !ev || ev.type !== "memory") return;
  const was = memoryOfSeat.get(name) || { state: "", sentAt: 0, seq: 0 };
  const seq = Number(ev.seq) || 0;
  if (seq && seq < was.seq) return;
  const now = { ...was, seq: Math.max(seq, was.seq) };
  if (ev.kind === "used" || ev.kind === "state") now.state = String(ev.state || "");
  if (ev.kind === "sent") now.sentAt = Number(ev.at) || Date.now();
  memoryOfSeat.set(name, now);
  if (now.state !== was.state || now.sentAt !== was.sentAt) render();
}

const memoryNow = (name) => memoryOfSeat.get(name) || null;

const forgetMemory = (name) => memoryOfSeat.delete(name);

function memoryChip(s) {
  if (!s || s.kind === "shell") return null;
  const agent = s.agent || "claude";
  if (agent !== "claude") {
    return { key: "memory", cls: "memory demand", memory: "demand", title: phrase("this engine does not read the team memory on its own — ask for it when you need it"), text: phrase("memory on demand only") };
  }
  const held = memoryOfSeat.get(s.name);
  const sent = held?.sentAt ? phrase("last conversation sent {at}", { at: clockSay(held.sentAt) }) : "";
  if (held?.state === "on") return { key: "memory", cls: "memory on", memory: "on", title: [phrase("reads the team memory before each message"), sent].filter(Boolean).join("\n"), text: phrase("team memory") };
  if (held?.state === "limited") return { key: "memory", cls: "memory limited", memory: "limited", title: [phrase("the shared memory is out — only the curated ones answer; it comes back on its own"), sent].filter(Boolean).join("\n"), text: phrase("limited memory") };
  if (held?.state === "login") return { key: "memory", cls: "memory login", memory: "login", title: phrase("the team memory is off on this machine — click to sign in with {command}", { command: MEMORY_LOGIN_COMMAND }), text: phrase("memory off · sign in") };
  if (held?.state === "incognito") return { key: "memory", cls: "memory incognito", memory: "incognito", title: phrase("incognito: reads the memory, but this conversation is not sent"), text: phrase("incognito · not saved") };
  return null;
}

function putLoginInComposer(name) {
  const box = structPool.get(name)?.host?.querySelector(".sv-composer textarea");
  if (!box) return false;
  box.value = MEMORY_LOGIN_COMMAND;
  box.dispatchEvent(new Event("input"));
  box.focus();
  return true;
}

function memoryChipClick(name, state, chip) {
  if (state === "demand") return;
  if (state !== "login") return void openMemoryAt("");
  openTile(name);
  if (putLoginInComposer(name)) return;
  void toClipboard(MEMORY_LOGIN_COMMAND).then((ok) => {
    if (!ok || !chip) return;
    chip.dataset.said = phrase("copied — paste it in the chat");
    clearTimeout(chip.saidTimer);
    chip.saidTimer = setTimeout(() => delete chip.dataset.said, 2500);
  });
}

export { MEMORY_LOGIN_COMMAND, forgetMemory, isMemorySave, memoryChip, memoryChipClick, memoryNow, memoryUsedBlock, noteMemory, putLoginInComposer, relevanceSay, svMemorySaveLanded, svMemorySaveRow, svMemoryUsed };

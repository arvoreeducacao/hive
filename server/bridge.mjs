import { open } from "node:fs/promises";
import { existsSync, statSync, watch } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";

import { stateDir, seatSockPath } from "../server/engine/paths.mjs";

export const TAIL_TURNS = 3;
export const TAIL_FLOOR = 200;
export const TAIL_CEILING = 2000000;

function slimBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  let cut = false;
  const kept = blocks.map((block) => {
    if (block?.type === "image") {
      if (!block.source) return block;
      cut = true;
      const { source, ...rest } = block;
      return rest;
    }
    if (block?.type === "tool_result") {
      const content = slimBlocks(block.content);
      if (content === block.content) return block;
      cut = true;
      return { ...block, content };
    }
    return block;
  });
  return cut ? kept : blocks;
}

export const PHONE_TEXT_CEILING = 4000;

const clip = (text, ceiling) =>
  typeof text === "string" && text.length > ceiling ? `${text.slice(0, ceiling)}…` : text;

function trimContent(content, ceiling) {
  if (typeof content === "string") return clip(content, ceiling);
  if (!Array.isArray(content)) return content;
  let cut = false;
  const kept = content.map((block) => {
    if (typeof block === "string") {
      const text = clip(block, ceiling);
      if (text !== block) cut = true;
      return text;
    }
    if (block?.type === "text") {
      const text = clip(block.text, ceiling);
      if (text === block.text) return block;
      cut = true;
      return { ...block, text };
    }
    if (block?.type === "tool_result") {
      const inner = trimContent(block.content, ceiling);
      if (inner === block.content) return block;
      cut = true;
      return { ...block, content: inner };
    }
    return block;
  });
  return cut ? kept : content;
}

export function trimForPhone(event, ceiling = PHONE_TEXT_CEILING) {
  const content = trimContent(event?.message?.content, ceiling);
  if (content === event?.message?.content) return event;
  return { ...event, message: { ...event.message, content } };
}

export function slimEvent(event) {
  if (!event || typeof event !== "object") return event;
  const content = slimBlocks(event.message?.content);
  const twice = event.tool_use_result !== undefined;
  if (!twice && content === event.message?.content) return event;
  const slim = { ...event };
  delete slim.tool_use_result;
  if (content !== event.message?.content) slim.message = { ...event.message, content };
  return slim;
}

const startsAfter = (ends, turns) => {
  const at = ends.length - turns;
  return at <= 0 ? 0 : ends[at - 1] + 1;
};

export const lineOf = (row) => (row.text ??= ((row.slim ?? row.event) === row.event ? row.line : JSON.stringify(row.slim)));

export function heaviestTail(rows, floor, ceiling) {
  let weight = 0;
  let at = rows.length;
  while (at > 0) {
    const next = weight + lineOf(rows[at - 1]).length + 1;
    if (next > ceiling && rows.length - at >= floor) break;
    weight = next;
    at -= 1;
  }
  return at;
}

export const isHumanTurn = (event) => {
  const content = event?.type === "user" ? event.message?.content : null;
  if (!Array.isArray(content)) return false;
  return content.some((block) => block?.type === "text") && !content.some((block) => block?.type === "tool_result");
};

export function humanWindow(rows, turns) {
  const starts = [];
  for (let i = 0; i < rows.length; i++) if (isHumanTurn(rows[i].event)) starts.push(i);
  const total = starts.length;
  if (!total) return { start: 0, shown: 0, total: 0 };
  const want = Math.max(1, Math.min(turns, total));
  return { start: starts[total - want], shown: want, total };
}

export function tailWindow(rows, { turns = TAIL_TURNS, floor = TAIL_FLOOR, ceiling = TAIL_CEILING } = {}) {
  const ends = [];
  for (let i = 0; i < rows.length; i++) if (rows[i].event?.type === "result") ends.push(i);
  const total = ends.length;
  if (!total) return { start: heaviestTail(rows, floor, ceiling), shown: 0, total: 0 };

  let want = Math.min(turns, total);
  let start = startsAfter(ends, want);
  while (start > 0 && rows.length - start < floor && want < total) start = startsAfter(ends, ++want);

  let weight = 0;
  for (let i = start; i < rows.length; i++) weight += lineOf(rows[i]).length + 1;
  while (want > 1 && weight > ceiling) {
    const back = startsAfter(ends, --want);
    for (let i = start; i < back; i++) weight -= lineOf(rows[i]).length + 1;
    start = back;
  }

  if (weight > ceiling) {
    const tighter = heaviestTail(rows, floor, ceiling);
    if (tighter > start) return { start: tighter, shown: 0, total };
  }

  return { start, shown: start === 0 ? total : want, total };
}

export function followEvents(file, from, onLine, { intervalMs = 400, window = "all", start = "top" } = {}) {
  let offset = 0;
  let carry = "";
  let reading = false;
  let stopped = false;
  let caughtUp = false;
  let born = 0;
  const tuning = window && typeof window === "object" ? window : null;
  const windowed = !from && (window === "tail" || !!tuning);

  if (start === "end") {
    try {
      const { size, ino } = statSync(file);
      offset = size;
      born = ino;
      caughtUp = true;
    } catch {}
  }

  async function drain() {
    if (reading || stopped) return;
    reading = true;
    try {
      const fh = await open(file, "r");
      try {
        const { size, ino } = await fh.stat();
        const swapped = (born && ino !== born) || size < offset;
        born = ino;
        if (swapped) {
          offset = 0;
          carry = "";
          if (caughtUp) onLine(JSON.stringify({ type: "driver", subtype: "rewound" }));
        }
        if (size > offset) {
          const buf = Buffer.alloc(size - offset);
          await fh.read(buf, 0, buf.length, offset);
          offset = size;
          const chunk = carry + buf.toString("utf8");
          const lines = chunk.split("\n");
          carry = lines.pop() || "";
          const replaying = !caughtUp;
          const rows = [];
          for (const line of lines) {
            if (!line.trim()) continue;
            let event = null;
            try { event = JSON.parse(line); } catch { continue; }
            if (replaying && Number.isFinite(event.seq) && event.seq <= from) continue;
            if (replaying && event.type === "stream_event") continue;
            rows.push({ line, event, slim: slimEvent(event) });
          }
          const cut = replaying && windowed ? tailWindow(rows, tuning || undefined) : { start: 0 };
          if (cut.start > 0) {
            onLine(JSON.stringify({
              type: "driver", subtype: "windowed",
              turns: cut.shown, turnsTotal: cut.total,
              events: rows.length - cut.start, eventsTotal: rows.length
            }));
          }
          for (let i = cut.start; i < rows.length; i++) {
            if (stopped) return;
            onLine(lineOf(rows[i]));
          }
        }
        caughtUp = true;
      } finally {
        await fh.close();
      }
    } catch {}
    reading = false;
  }

  let watcher = null;
  try {
    watcher = watch(dirname(file), (kind, changed) => {
      if (changed === basename(file)) drain();
    });
  } catch {}
  const timer = setInterval(drain, intervalMs);
  drain();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      try { watcher?.close(); } catch {}
    },
  };
}

/* the exec that carries these events to the person's machine is one tcp flow through the api
   server's load balancer, and a seat waiting for someone to type sends nothing for minutes at a
   time. a quiet flow gets reset from the middle, so the bridge speaks up on its own: the line
   keeps the flow warm, and its absence is how the other end tells a live link from a dead one. */
export const PING_LINE = JSON.stringify({ hive_ping: 1 }) + "\n";

export function heartbeat(write, every = 15000) {
  const timer = setInterval(() => write(PING_LINE), every);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function oneshot(sockFile, cmd, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const sock = connect(sockFile);
    let buf = "";
    const done = (reply) => {
      clearTimeout(timer);
      try { sock.destroy(); } catch {}
      resolve(reply);
    };
    const timer = setTimeout(() => done({ ok: false, error: "driver did not answer in time" }), timeoutMs);
    sock.on("connect", () => sock.write(JSON.stringify({ ...cmd, sent: Date.now() }) + "\n"));
    sock.on("data", (d) => {
      buf += d;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      try { done(JSON.parse(buf.slice(0, nl))); } catch { done({ ok: false, error: "unparseable reply" }); }
    });
    sock.on("error", (e) => done({ ok: false, error: `driver socket: ${e.message}` }));
  });
}

const runAsCli = process.argv[1] && basename(process.argv[1]) === "bridge.mjs";
if (runAsCli) {
  const name = process.argv[2];
  const from = Number(process.argv[3]) || 0;
  const window = process.argv[4] === "tail" ? "tail" : "all";
  if (!name) {
    console.error("usage: node bridge.mjs <seat> [fromSeq] [all|tail]");
    process.exit(2);
  }
  const base = stateDir();
  const eventsFile = join(base, "events", `${name}.ndjson`);
  const sockFile = seatSockPath(base, name);

  followEvents(eventsFile, from, (line) => process.stdout.write(line + "\n"), { window });
  heartbeat((line) => process.stdout.write(line));

  let buf = "";
  process.stdin.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let cmd;
      try { cmd = JSON.parse(line); } catch {
        process.stdout.write(JSON.stringify({ bridge_reply: { ok: false, error: "unparseable command" }, cid: null }) + "\n");
        continue;
      }
      oneshot(sockFile, cmd).then((reply) => {
        process.stdout.write(JSON.stringify({ bridge_reply: reply, cid: cmd.cid ?? null }) + "\n");
      });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

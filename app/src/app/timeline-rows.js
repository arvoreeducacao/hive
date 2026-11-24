import { HIVE_SERVER, failedLabel, isOrchestration, orchestrationKey, orchestrationLabel, orchestrationPriority } from "./orchestration-summary.js";
import { clockOptions } from "./clock-format.js";

const SLOT = /\{(\w+)\}/g;

const fillIn = (text, vars) => (vars ? String(text).replace(SLOT, (whole, key) => (key in vars ? String(vars[key]) : whole)) : String(text));

function workedFor(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 10000) {
    const tenths = Math.round(ms / 100) / 10;
    return tenths >= 10 ? "10s" : `${tenths.toFixed(1)}s`;
  }
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const total = Math.round(ms / 1000);
  return [[Math.floor(total / 3600), "h"], [Math.floor((total % 3600) / 60), "m"], [total % 60, "s"]]
    .filter(([n]) => n > 0).map(([n, unit]) => `${n}${unit}`).join(" ");
}

function liveFor(ms) {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return s < 60 ? `${s}s` : workedFor(s * 1000);
}

function workingSays(t0, say = fillIn, now = Date.now()) {
  return t0 ? say("Working for {d}", { d: liveFor(now - t0) }) : say("Working…");
}

function clockOf(at, say = fillIn, now = new Date()) {
  const when = new Date(at);
  if (!at || !Number.isFinite(when.getTime())) return "";
  const time = when.toLocaleTimeString([], clockOptions({ hour: "numeric", minute: "2-digit" }));
  const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayOf(now) - dayOf(when)) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return say("yesterday at {time}", { time });
  const date = when.toLocaleDateString([], when.getFullYear() === now.getFullYear() ? { day: "numeric", month: "numeric" } : { day: "numeric", month: "numeric", year: "numeric" });
  return `${date} ${time}`;
}

function fullTimeOf(at, language = "") {
  const when = new Date(Number(at));
  if (!at || !Number.isFinite(when.getTime())) return "";
  const time = when.toLocaleTimeString([], clockOptions({ hour: "numeric", minute: "2-digit" }));
  const date = when.toLocaleDateString(language === "pt-BR" ? "pt-BR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${time}, ${date}`;
}

const isTool = (b) => b.kind === "tool";

const isWork = (b) => (isTool(b) && !b.keep) || b.kind === "think";

const isSaid = (b) => b.kind === "said";

const isStopped = (b) => b.kind === "meta" && /(^|\s)sv-stopped(\s|$)/.test(b.cls || "");

const FOLDABLE = new Set(["tool", "think", "said", "memsave"]);

const foldable = (b) => FOLDABLE.has(b.kind) || isStopped(b) || (b.kind === "retry" && b.state === "recovered");

function toolAction(b) {
  if (b.kind === "think") return b.label === undefined ? "reasoning" : "update";
  if (!isTool(b)) return "other";
  if (isOrchestration(b)) return "orchestration";
  if (b.face === "mcp" && b.server === HIVE_SERVER) return /^browser_/.test(String(b.name || "")) ? "browser" : "other";
  const name = String(b.tool || "").toLowerCase();
  if (b.face === "run") return "command";
  if (b.face === "write") return "edit";
  if (b.face === "read") return /^(grep|glob|ls|toolsearch)$/.test(name) ? "code-search" : "read";
  if (b.face === "web") return /^(webfetch|websearch)$/.test(name) ? "search" : "browser";
  if (b.face === "agent") return "agent";
  return "other";
}

const sourceOf = (b) => (isTool(b) && b.face === "mcp" && b.server && b.server !== HIVE_SERVER ? b.server : "");

function actionLabel(action, n, say) {
  const one = n === 1;
  if (action === "read") return one ? say("Read {n} file", { n }) : say("Read {n} files", { n });
  if (action === "edit") return one ? say("Changed {n} file", { n }) : say("Changed {n} files", { n });
  if (action === "command") return one ? say("Ran {n} command", { n }) : say("Ran {n} commands", { n });
  if (action === "search") return one ? say("Searched the web {n} time", { n }) : say("Searched the web {n} times", { n });
  if (action === "code-search") return one ? say("Searched code {n} time", { n }) : say("Searched code {n} times", { n });
  if (action === "browser") return one ? say("Used browser {n} time", { n }) : say("Used browser {n} times", { n });
  if (action === "agent") return one ? say("Ran {n} agent", { n }) : say("Ran {n} agents", { n });
  if (action === "update") return one ? say("Received {n} update", { n }) : say("Received {n} updates", { n });
  return one ? say("Used {n} tool", { n }) : say("Used {n} tools", { n });
}

const PRIORITY_FIRST = new Set(["command", "edit", "agent"]);
const PRIORITY_LAST = new Set(["other", "update"]);

const priorityOf = (action) => (action.startsWith("hive:") ? orchestrationPriority(action) : PRIORITY_FIRST.has(action) ? 0 : PRIORITY_LAST.has(action) ? 2 : 1);

function countOf(action, list) {
  if (action !== "edit") return list.length;
  return new Set(list.map((b) => b.edit?.path || b.arg || b.key)).size;
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

function sentenceOf(labels, say) {
  const said = labels.map((label, at) => (at ? lowerFirst(label) : label));
  if (said.length < 3) return said.join(` ${say("and")} `);
  return say("{list}, and {last}", { list: said.slice(0, -1).join(", "), last: said.at(-1) });
}

function summaryKind(items) {
  const tools = items.filter((b) => toolAction(b) !== "reasoning");
  if (items.length && !tools.length) return "reasoning";
  const actions = new Set(tools.map((b) => (sourceOf(b) ? "other" : toolAction(b))));
  return actions.size === 1 ? [...actions][0] : "mixed";
}

function summarizeWork(items, say = fillIn) {
  const tools = items.filter((b) => toolAction(b) !== "reasoning");
  if (items.length && !tools.length) return items.length === 1 ? say("Thought") : say("Thought (×{n})", { n: items.length });
  const groups = new Map();
  const sources = [];
  let failed = 0;
  for (const b of tools) {
    const source = sourceOf(b);
    if (source) {
      if (!sources.includes(source)) sources.push(source);
      continue;
    }
    if (isOrchestration(b) && b.stat === "bad") {
      failed++;
      continue;
    }
    const action = isOrchestration(b) ? orchestrationKey(b) : toolAction(b);
    if (!groups.has(action)) groups.set(action, []);
    groups.get(action).push(b);
  }
  const labelOf = (action, list) => (action.startsWith("hive:") ? orchestrationLabel(action, list, say) : actionLabel(action, countOf(action, list), say));
  const summaries = [...groups].map(([action, list], index) => ({ index, count: list.length, priority: priorityOf(action), label: labelOf(action, list) }));
  const selected = [...summaries].sort((a, b) => a.priority - b.priority || a.index - b.index).slice(0, 2).sort((a, b) => a.index - b.index);
  const labels = selected.map((one) => one.label);
  if (sources.length) labels.unshift(say("Used {names}", { names: sentenceOf(sources, say) }));
  const sourced = tools.filter(sourceOf).length;
  const rest = tools.length - sourced - failed - selected.reduce((sum, one) => sum + one.count, 0);
  if (rest > 0) labels.push(rest === 1 ? say("Performed {n} other action", { n: rest }) : say("Performed {n} other actions", { n: rest }));
  const said = sentenceOf(labels, say);
  if (!failed) return said;
  return said ? `${said} · ${failedLabel(failed, say)}` : failedLabel(failed, say);
}

const ICONS = { orchestration: "bot", read: "eye", edit: "pen", command: "terminal", search: "globe", "code-search": "search", browser: "globe", agent: "bot", reasoning: "brain", update: "hammer", other: "wrench", mixed: "hammer" };

const iconOf = (kind) => ICONS[kind] || "hammer";

const entryIcon = (b) => iconOf(sourceOf(b) ? "other" : toolAction(b));

const CD_PREFIX = /^\s*cd\s+(?:'[^']*'|"[^"]*"|[^\s;&|]+)\s*&&\s*/;

const WRAPPERS = new Set(["sudo", "time", "env", "nohup", "exec", "command", "builtin"]);

const SUBCOMMANDS = new Set(["npm", "pnpm", "yarn", "bun", "npx", "bunx", "pnpx", "git", "gh", "cargo", "go", "docker", "kubectl", "make", "uv", "pip", "deno", "vp", "brew", "swift", "xcodebuild", "terraform", "aws"]);

function programOf(command) {
  let text = String(command || "").trim();
  while (CD_PREFIX.test(text)) text = text.replace(CD_PREFIX, "");
  const tokens = text.split(/\s+/).filter(Boolean);
  let at = 0;
  while (at < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[at]) || WRAPPERS.has(tokens[at]))) at++;
  if (!tokens[at]) return "";
  const program = tokens[at].replace(/^["']|["']$/g, "").split("/").pop();
  const next = tokens[at + 1] || "";
  if (!SUBCOMMANDS.has(program) || !/^[a-z][\w:.-]*$/i.test(next)) return program;
  const third = tokens[at + 2] || "";
  return (next === "run" || next === "exec") && /^[a-z][\w:.-]*$/i.test(third) ? `${program} ${next} ${third}` : `${program} ${next}`;
}

function liveLabel(b, active, say = fillIn) {
  if (b.kind === "think") return active ? say("Thinking…") : say("Thought");
  if (b.face === "run") {
    const program = programOf(b.cmd || b.arg) || say("command");
    if (b.running) return say("Running {program}", { program });
    return b.stat === "bad" ? say("Failed {program}", { program }) : say("Ran {program}", { program });
  }
  return [b.name, b.arg].filter(Boolean).join(" ");
}

function liveThoughtLine(markdown) {
  const heading = /^\s*\*\*([^*\r\n]+)\*\*[ \t]*\r?(?:\n|$)/.exec(markdown)?.[1];
  const text = (heading ?? String(markdown || ""))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/`+|\*\*|~~/g, "")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  if (heading !== undefined) return text;
  const end = /[.?!]["'”’)]?(?=\s)/.exec(text);
  return end ? text.slice(0, end.index + end[0].length) : text;
}

function thoughtTail(text) {
  const parts = String(text || "").split(/\n\s*\n/).map((one) => one.trim()).filter(Boolean);
  if (!parts.length) return "";
  const heading = parts.findLastIndex((one) => /^\*\*[^*\r\n]+\*\*$/.test(one.split("\n")[0]));
  return heading >= 0 ? parts.slice(heading).join("\n\n") : parts.at(-1);
}

const USER_FOLD_LINES = 8;
const USER_FOLD_LENGTH = 600;
const MARKDOWN_LINK = /!?\[([^\]\n]*)\]\((?:<[^>\n]*>|[^\s)]*)\)/g;

function shouldCollapseUserMessage(text) {
  const visible = String(text || "").replace(MARKDOWN_LINK, "$1");
  if (!visible.trim()) return false;
  return visible.length > USER_FOLD_LENGTH || visible.split("\n").length > USER_FOLD_LINES;
}

const timeOf = (b) => Math.max(Number(b.at) || 0, Number(b.done) || 0);

const lastTime = (list) => list.reduce((most, b) => Math.max(most, timeOf(b)), 0);

function legacyRows(blocks, tailOpen) {
  const rows = [];
  let at = 0;
  while (at < blocks.length) {
    const b = blocks[at];
    if (!isTool(b) && b.kind !== "think") {
      rows.push({ kind: "block", key: b.key, block: b });
      at++;
      continue;
    }
    let end = at;
    while (end < blocks.length && (isTool(blocks[end]) || blocks[end].kind === "think")) end++;
    const trailing = end === blocks.length && tailOpen;
    let segment = [];
    const close = (open) => {
      if (!segment.length) return;
      let held = segment;
      let out = [];
      if (open) {
        const running = segment.findIndex((one) => one.running);
        const cut = Math.min(running < 0 ? segment.length - 1 : running, segment.length - 1);
        held = segment.slice(0, cut);
        out = segment.slice(cut);
      }
      const wrapped = open ? held.length > 0 : held.filter(isTool).length >= 2;
      if (wrapped) rows.push({ kind: "work", key: `w:${held[0].key}`, items: held });
      else for (const one of held) rows.push({ kind: "block", key: one.key, block: one });
      for (const one of out) rows.push({ kind: "block", key: one.key, block: one });
      segment = [];
    };
    for (let i = at; i < end; i++) {
      const one = blocks[i];
      if (isTool(one) && one.keep) {
        close(false);
        rows.push({ kind: "block", key: one.key, block: one });
      } else segment.push(one);
    }
    close(trailing);
    at = end;
  }
  return rows;
}

function turnsOf(blocks, steer) {
  const starts = [];
  blocks.forEach((b, at) => { if (b.kind === "bubble" && !steer(b)) starts.push(at); });
  return starts.map((start, n) => ({ ask: blocks[start], entries: blocks.slice(start + 1, starts[n + 1] ?? blocks.length) }));
}

function segmentsOf(entries, steer) {
  const segments = [{ steer: null, entries: [] }];
  for (const b of entries) {
    if (b.kind === "bubble" && steer(b)) {
      if (segments.at(-1).entries.length || segments.length === 1) segments.push({ steer: b, entries: [] });
      else segments.at(-1).steer = b;
      continue;
    }
    segments.at(-1).entries.push(b);
  }
  return segments;
}

function sendersOf(blocks) {
  const senders = new Map();
  blocks.forEach((b, at) => {
    const next = blocks[at + 1];
    if (b.kind !== "peer" || next?.kind !== "bubble" || !next.peer) return;
    b.sends = next.key;
    senders.set(next.key, b);
  });
  return senders;
}

function gistOf(text) {
  const line = String(text ?? "").split("\n").map((one) => one.trim()).find(Boolean) || "";
  return line.replace(/^>\s*/, "").slice(0, 240);
}

const ALWAYS_SHOWN = new Set(["ask", "plan"]);

const hideableTool = (b) => isTool(b) && !ALWAYS_SHOWN.has(b.face);

function lastSaids(blocks) {
  const kept = new Set();
  let last = null;
  for (const b of blocks) {
    if (b.kind === "bubble") {
      if (last) kept.add(last);
      last = null;
    }
    if (isSaid(b)) last = b;
  }
  if (last) kept.add(last);
  return kept;
}

function visibleBlocks(blocks, mode) {
  if (mode === "failed") return blocks.filter((b) => !(hideableTool(b) && !b.keep && !b.running && b.stat === "ok"));
  if (mode === "none") return blocks.filter((b) => !(hideableTool(b) && !b.keep));
  if (mode !== "zen") return blocks;
  const answers = lastSaids(blocks);
  return blocks.filter((b) => (isSaid(b) ? answers.has(b) : !hideableTool(b) && b.kind !== "think" && b.kind !== "retry"));
}

function deriveTimelineRows(blocks, look = null) {
  if (!look) return legacyRows(blocks, false);
  blocks = visibleBlocks(blocks, look.tools);
  const say = look.say || fillIn;
  const steers = look.steers || new Set();
  const steer = (b) => !!b.dataset?.cid && steers.has(b.dataset.cid);
  const unfolded = look.unfolded || new Set();
  const expanded = look.expanded || new Set();
  const users = look.users || new Set();
  const rows = [];
  const firstAsk = blocks.findIndex((b) => b.kind === "bubble" && !steer(b));
  const lead = firstAsk < 0 ? blocks : blocks.slice(0, firstAsk);
  const turns = firstAsk < 0 ? [] : turnsOf(blocks.slice(firstAsk), steer);
  const files = turns.length && look.turnFiles ? look.turnFiles(turns.map((turn) => Number(turn.ask.at) || 0)) : new Map();
  const senders = sendersOf(blocks);

  const bubbleRow = (b) => {
    const sender = senders.get(b.key);
    if (sender) return { kind: "block", key: b.key, block: b, derived: true, steer: steer(b), from: { name: sender.name, seat: sender.seat || sender.name, says: sender.says }, gist: gistOf(b.text), open: users.has(b.key), long: false, toggle: "" };
    const long = shouldCollapseUserMessage(b.text ?? "");
    const open = long && users.has(b.key);
    return { kind: "block", key: b.key, block: b, derived: true, steer: steer(b), long, open, toggle: long ? (open ? say("Show less") : say("Show full message")) : "" };
  };
  const sent = (b) => b.kind === "peer" && senders.has(b.sends);

  const pushGroup = (items, diffs) => {
    if (!items.length) return;
    const group = `g:${items[0].key}`;
    if (items.length === 1 && isTool(items[0])) {
      rows.push({ kind: "block", key: items[0].key, block: items[0], derived: true, work: true, diff: diffs?.get(items[0].key) || null });
      return;
    }
    const open = expanded.has(group);
    const last = items.findLast(isTool);
    rows.push({ kind: "work-toggle", key: `wt:${group}`, group, summary: summarizeWork(items, say), icon: iconOf(summaryKind(items)), bad: last?.stat === "bad", open, at: timeOf(items[0]) || "", count: items.length });
    if (open) rows.push({ kind: "work-group", key: `wg:${group}`, group, items: items.map((b) => ({ key: b.key, block: b, derived: true, work: true, diff: diffs?.get(b.key) || null })) });
  };

  const pushEntries = (entries, extra = {}) => {
    let run = [];
    const flush = () => { pushGroup(run, extra.diffs); run = []; };
    for (const b of entries) {
      if (isWork(b)) { run.push(b); continue; }
      if (sent(b)) continue;
      flush();
      if (b.kind === "bubble") rows.push(bubbleRow(b));
      else if (isTool(b)) rows.push({ kind: "block", key: b.key, block: b, derived: true, work: true, diff: extra.diffs?.get(b.key) || null });
      else rows.push({ kind: "block", key: b.key, block: b, derived: true, meta: b === extra.terminal, files: b === extra.terminal ? extra.files || "" : "" });
    }
    flush();
  };

  for (const b of lead) if (!sent(b)) rows.push({ kind: "block", key: b.key, block: b, derived: true, meta: true });

  turns.forEach((turn, index) => {
    const active = !!look.busy && index === turns.length - 1;
    rows.push(bubbleRow(turn.ask));
    const segments = segmentsOf(turn.entries, steer);
    const all = turn.entries.filter((b) => !(b.kind === "bubble" && steer(b)));
    if (active) return activeTurn(turn, segments, look, rows, { say, expanded, pushEntries, quiet: look.tools === "zen" });
    const terminal = all.findLast((b) => isSaid(b) && !b.streaming) || null;
    const stopped = all.findLast(isStopped) || null;
    const checkpoint = terminal ? files.get(index) || null : null;
    const diffs = new Map();
    if (checkpoint?.pathOf) {
      for (const b of all) {
        const file = isTool(b) && b.edit?.file ? checkpoint.pathOf(b.edit.file) : "";
        if (file) diffs.set(b.key, { n: checkpoint.n, file, label: say("Open diff") });
      }
    }
    const hides = (b) => b !== terminal && foldable(b) && !(isTool(b) && b.keep);
    const folds = look.tools !== "zen" && (terminal || stopped) && all.some((b) => hides(b) && !isStopped(b));
    const extra = { terminal, files: checkpoint?.html || "", diffs };
    segments.forEach((segment, at) => {
      if (segment.steer) rows.push(bubbleRow(segment.steer));
      const hidden = folds ? segment.entries.filter(hides) : [];
      if (!hidden.length || !hidden.some((b) => !isStopped(b))) return pushEntries(segment.entries, extra);
      const fold = at === 0 ? `f:${turn.ask.key}` : `f:${turn.ask.key}:${segment.steer.key}`;
      const open = unfolded.has(fold);
      let label;
      if (at === 0) {
        const took = workedFor(lastTime(all) - (Number(turn.ask.at) || 0));
        label = stopped ? stopped.text : took ? say("Worked for {d}", { d: took }) : say("Worked");
      } else {
        const took = workedFor(lastTime(segment.entries) - (Number(segment.steer.at) || 0));
        label = took ? say("Continued for {d}", { d: took }) : say("Continued");
      }
      rows.push({ kind: "turn-fold", key: fold, fold, label, open, at: Number(at === 0 ? turn.ask.at : segment.steer.at) || "" });
      if (open) return pushEntries(segment.entries, extra);
      const shown = [];
      for (const b of segment.entries) {
        if (!hidden.includes(b)) { shown.push(b); continue; }
        if (isSaid(b)) {
          pushEntries(shown.splice(0), extra);
          rows.push({ kind: "block", key: b.key, block: b, derived: true, hidden: true, fold });
        }
      }
      pushEntries(shown, extra);
    });
  });

  if (look.busy && !turns.length && firstAsk < 0 && look.since) rows.push({ kind: "working", key: "tl:working", t0: look.since });
  for (const line of look.status || []) rows.push({ kind: "status", key: `st:${line.id}`, ...line });
  return rows;
}

function activeTurn(turn, segments, look, rows, { say, expanded, pushEntries, quiet = false }) {
  rows.push({ kind: "working", key: "tl:working", t0: Math.max(Number(look.since) || 0, Number(turn.ask.at) || 0) });
  const entries = [];
  segments.forEach((segment) => {
    if (segment.steer) entries.push(segment.steer);
    entries.push(...segment.entries);
  });
  let tailAt = entries.length;
  while (tailAt > 0 && isWork(entries[tailAt - 1])) tailAt--;
  const head = entries.slice(0, tailAt);
  const tail = entries.slice(tailAt);
  pushEntries(head);
  if (quiet) return;
  const thinking = String(look.thinking || "").trim();
  const tools = tail.filter(isTool);
  const thought = thinking || tail.findLast((b) => b.kind === "think" && b.label === undefined)?.body || "";
  const line = thought ? liveThoughtLine(thoughtTail(thought)) : "";
  const group = tail.length ? `g:${tail[0].key}` : "g:live";
  const open = tail.length > 0 && expanded.has(group);
  const latest = tools.findLast((b) => b.running) || tools.at(-1) || null;
  const failed = !!latest && !latest.running && latest.stat === "bad";
  if (latest && !failed) {
    const active = tools.some((b) => b.running) || latest.stat === "ok" || !latest.stat;
    rows.push({ kind: "work-live", key: "tl:live", group, label: liveLabel(latest, active, say), icon: entryIcon(latest), favicon: latest.favicon || "", thought: line, active, open, count: tail.length });
  } else {
    const streaming = entries.at(-1)?.kind === "said" && entries.at(-1).streaming;
    if (!look.waiting && (!streaming || thinking || tail.length)) rows.push({ kind: "thinking", key: "tl:live", group: tail.length ? group : "", label: say("Thinking…"), thought: line, open, count: tail.length, failed });
  }
  if (open) rows.push({ kind: "work-group", key: `wg:${group}`, group, items: tail.map((b) => ({ key: b.key, block: b, derived: true, work: true, diff: null })) });
}

const ANSI = /\u001b\[([0-9;?]*)([A-Za-z])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[()][A-Za-z0-9]|\u001b[=>78DEHMc]/g;

function cubeColor(n) {
  if (n < 232) {
    const at = n - 16;
    const level = (v) => (v ? 55 + v * 40 : 0);
    return `rgb(${level(Math.floor(at / 36))} ${level(Math.floor(at / 6) % 6)} ${level(at % 6)})`;
  }
  const grey = 8 + (n - 232) * 10;
  return `rgb(${grey} ${grey} ${grey})`;
}

function extendedColor(codes, at) {
  if (codes[at + 1] === 5) {
    const n = codes[at + 2];
    if (!Number.isFinite(n)) return { skip: 2 };
    return n < 16 ? { index: n, skip: 2 } : { rgb: cubeColor(n), skip: 2 };
  }
  if (codes[at + 1] === 2) {
    const [r, g, b] = codes.slice(at + 2, at + 5);
    return { rgb: [r, g, b].every(Number.isFinite) ? `rgb(${r} ${g} ${b})` : "", skip: 4 };
  }
  return { skip: 0 };
}

function applySgr(style, params) {
  const codes = (params === "" ? "0" : params).split(";").map((one) => (one === "" ? 0 : Number(one)));
  const next = { ...style };
  for (let at = 0; at < codes.length; at++) {
    const code = codes[at];
    if (code === 0) for (const key of Object.keys(next)) delete next[key];
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) { delete next.bold; delete next.dim; }
    else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code >= 30 && code <= 37) { next.fg = code - 30; delete next.fgRgb; }
    else if (code >= 90 && code <= 97) { next.fg = code - 90 + 8; delete next.fgRgb; }
    else if (code === 39) { delete next.fg; delete next.fgRgb; }
    else if (code >= 40 && code <= 47) { next.bg = code - 40; delete next.bgRgb; }
    else if (code >= 100 && code <= 107) { next.bg = code - 100 + 8; delete next.bgRgb; }
    else if (code === 49) { delete next.bg; delete next.bgRgb; }
    else if (code === 38 || code === 48) {
      const color = extendedColor(codes, at);
      const side = code === 38 ? "fg" : "bg";
      delete next[side];
      delete next[`${side}Rgb`];
      if (color.index !== undefined) next[side] = color.index;
      else if (color.rgb) next[`${side}Rgb`] = color.rgb;
      at += color.skip;
    }
  }
  return next;
}

function classOf(style) {
  const cls = [];
  if (style.fg !== undefined) cls.push(`ansi-fg-${style.fg}`);
  if (style.bg !== undefined) cls.push(`ansi-bg-${style.bg}`);
  for (const flag of ["bold", "dim", "italic", "underline"]) if (style[flag]) cls.push(`ansi-${flag}`);
  return cls.join(" ");
}

function cssOf(style) {
  return [style.fgRgb ? `color:${style.fgRgb}` : "", style.bgRgb ? `background:${style.bgRgb}` : ""].filter(Boolean).join(";");
}

function ansiSpans(text) {
  const clean = String(text ?? "").split("\n").map((line) => (line.includes("\r") ? line.split("\r").filter(Boolean).pop() ?? "" : line)).join("\n");
  const spans = [];
  let style = {};
  let last = 0;
  const push = (piece) => {
    if (!piece) return;
    const cls = classOf(style);
    const css = cssOf(style);
    const prev = spans.at(-1);
    if (prev && prev.cls === cls && prev.css === css) prev.text += piece;
    else spans.push({ text: piece, cls, css });
  };
  for (const match of clean.matchAll(ANSI)) {
    push(clean.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[2] === "m") style = applySgr(style, match[1]);
  }
  push(clean.slice(last));
  return spans;
}

function commandResult(text, failed) {
  const said = String(text ?? "");
  const exit = /^Exit code (-?\d+)\r?\n?/.exec(said);
  if (exit) return { exit: Number(exit[1]), out: said.slice(exit[0].length) };
  return { exit: failed ? null : 0, out: said };
}

export { ansiSpans, clockOf, commandResult, fullTimeOf, deriveTimelineRows, gistOf, visibleBlocks, entryIcon, iconOf, legacyRows, liveFor, liveLabel, liveThoughtLine, programOf, shouldCollapseUserMessage, summarizeWork, summaryKind, thoughtTail, toolAction, workedFor, workingSays };

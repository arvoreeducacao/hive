import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir, hostname } from "node:os";
import { join, basename } from "node:path";
import { redact, summarize } from "./scan-secrets.mjs";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");
const SNIPPET_CAP = 400;

function slug(text, size = 48) {
  return (text || "untitled")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, size)
    .replace(/-+$/g, "");
}

function shorten(text, cap = SNIPPET_CAP) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > cap ? `${clean.slice(0, cap)}…` : clean;
}

function textOfContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n\n");
}

function toolSignature(block) {
  const input = block.input ?? {};
  const field =
    input.command ??
    input.file_path ??
    input.pattern ??
    input.query ??
    input.url ??
    input.prompt ??
    input.description ??
    "";
  return `${block.name}: ${shorten(field, 160)}`.trim();
}

export async function distill(path) {
  const events = [];
  const meta = {
    session: basename(path).replace(/\.jsonl$/, ""),
    title: null,
    cwds: new Set(),
    branches: new Set(),
    models: new Set(),
    prs: new Set(),
    start: null,
    end: null,
    human_turns: 0,
    replies: 0,
    tool_calls: 0,
    raw_bytes: 0,
  };

  const info = await stat(path);
  meta.raw_bytes = info.size;

  const reader = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of reader) {
    if (line.length < 2) continue;
    const interesting =
      line.includes('"type":"assistant"') ||
      line.includes('"type":"ai-title"') ||
      line.includes('"type":"pr-link"') ||
      line.includes('"promptSource":"typed"');
    if (!interesting) continue;

    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }

    if (o.timestamp) {
      if (!meta.start) meta.start = o.timestamp;
      meta.end = o.timestamp;
    }
    if (o.cwd) meta.cwds.add(o.cwd);
    if (o.gitBranch) meta.branches.add(o.gitBranch);
    if (o.type === "ai-title" && o.aiTitle && !meta.title) meta.title = o.aiTitle;
    if (o.type === "pr-link" && o.prUrl) meta.prs.add(o.prUrl);

    if (o.type === "user" && o.promptSource === "typed" && !o.isMeta) {
      const t = textOfContent(o.message?.content);
      if (t.trim()) {
        meta.human_turns += 1;
        events.push({ who: "human", at: o.timestamp, text: t });
      }
      continue;
    }

    if (o.type !== "assistant") continue;
    const msg = o.message ?? {};
    if (msg.model) meta.models.add(msg.model);
    const text = textOfContent(msg.content);
    const tools = Array.isArray(msg.content)
      ? msg.content.filter((b) => b && b.type === "tool_use").map(toolSignature)
      : [];
    meta.tool_calls += tools.length;
    if (text.trim() || tools.length) {
      meta.replies += 1;
      events.push({ who: "claude", at: o.timestamp, text, tools, model: msg.model });
    }
  }

  return { meta, events };
}

export function buildConversation({ meta, events }, person) {
  const lines = [
    `# ${meta.title ?? meta.session}`,
    "",
    `session: ${meta.session}`,
    `start: ${meta.start ?? "?"}`,
    `end: ${meta.end ?? "?"}`,
    `models: ${[...meta.models].join(", ") || "?"}`,
    "",
    "---",
    "",
  ];
  for (const e of events) {
    if (e.who === "human") {
      lines.push(`## ${person} — ${e.at ?? ""}`, "", e.text.trim(), "");
      continue;
    }
    if (e.text.trim()) lines.push(`### Claude`, "", e.text.trim(), "");
    if (e.tools.length) {
      lines.push("```");
      for (const t of e.tools) lines.push(`→ ${t}`);
      lines.push("```", "");
    }
  }
  return `${lines.join("\n")}\n`;
}

function chatFolder(meta) {
  const start = meta.start ? new Date(meta.start) : new Date(0);
  const year = start.toISOString().slice(0, 4);
  const month = start.toISOString().slice(5, 7);
  const day = start.toISOString().slice(8, 10);
  return join(`${year}-${month}`, `${day}-${slug(meta.title ?? meta.session)}--${meta.session.slice(0, 8)}`);
}

async function loadAllowlist(path) {
  if (!path) return new Set();
  try {
    const o = JSON.parse(await readFile(path, "utf8"));
    return new Set(Array.isArray(o) ? o : (o.marks ?? []));
  } catch {
    return new Set();
  }
}

async function listCandidates(root, since, limit) {
  const found = [];
  const projects = await readdir(root, { withFileTypes: true });
  const cutoff = since ? Date.parse(`${since}T00:00:00Z`) : null;
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const dir = join(root, p.name);
    for (const f of await readdir(dir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      const path = join(dir, f.name);
      if (cutoff !== null) {
        const info = await stat(path);
        if (info.mtimeMs < cutoff) continue;
      }
      found.push({ project: p.name, path });
    }
  }
  found.sort((a, b) => a.path.localeCompare(b.path));
  return limit > 0 ? found.slice(0, limit) : found;
}

function parseArgs(argv) {
  const o = { since: null, limit: 0, person: process.env.HIVE_PERSON || basename(homedir()), apply: false, target: null, allowlist: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--since") o.since = argv[++i];
    else if (a === "--limit") o.limit = Number(argv[++i]);
    else if (a === "--person") o.person = argv[++i];
    else if (a === "--target") o.target = argv[++i];
    else if (a === "--allowlist") o.allowlist = argv[++i];
    else if (a === "--apply") o.apply = true;
  }
  return o;
}

export async function prepareChat({ path, project, person, allowlist, machine }) {
  const distilled = await distill(path);
  const { meta } = distilled;
  const rawConversation = buildConversation(distilled, person);
  const scrubbedConversation = redact(rawConversation, { allowlist });

  const chat = {
    session: meta.session,
    title: meta.title,
    person,
    machine,
    project,
    start: meta.start,
    end: meta.end,
    models: [...meta.models],
    branches: [...meta.branches],
    repos: [...new Set([...meta.cwds].map(repoOfCwd).filter(Boolean))],
    prs: [...meta.prs],
    human_turns: meta.human_turns,
    replies: meta.replies,
    tool_calls: meta.tool_calls,
  };
  const scrubbedChat = redact(JSON.stringify(chat, null, 2), { allowlist });

  const findings = [...scrubbedConversation.findings, ...scrubbedChat.findings];
  const distilledBytes = Buffer.byteLength(scrubbedConversation.text) + Buffer.byteLength(scrubbedChat.text);

  return {
    folder: join("people", person, chatFolder(meta)),
    files: { "conversation.md": scrubbedConversation.text, "chat.json": `${scrubbedChat.text}\n` },
    meta,
    findings,
    raw_bytes: meta.raw_bytes,
    distilled_bytes: distilledBytes,
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const allowlist = await loadAllowlist(o.allowlist);
  const machine = hostname();
  const candidates = await listCandidates(PROJECTS_ROOT, o.since, o.limit);

  let rawBytes = 0;
  let distilledBytes = 0;
  const allFindings = [];
  const flagged = [];
  const prepared = [];

  for (const c of candidates) {
    let r;
    try {
      r = await prepareChat({ path: c.path, project: c.project, person: o.person, allowlist, machine });
    } catch (error) {
      process.stderr.write(`failed ${c.path}: ${error.message}\n`);
      continue;
    }
    if (r.meta.human_turns === 0 && r.meta.replies === 0) continue;
    rawBytes += r.raw_bytes;
    distilledBytes += r.distilled_bytes;
    allFindings.push(...r.findings);
    if (r.findings.some((f) => f.class === "credential")) flagged.push(r.folder);
    prepared.push(r);

    if (o.apply && o.target) {
      const target = join(o.target, r.folder);
      await mkdir(target, { recursive: true });
      for (const [name, content] of Object.entries(r.files)) await writeFile(join(target, name), content);
    }
  }

  const report = {
    mode: o.apply ? "applied" : "dry-run",
    person: o.person,
    machine,
    chats: prepared.length,
    raw_bytes: rawBytes,
    bytes_to_commit: distilledBytes,
    reduction: rawBytes ? `${(100 - (distilledBytes / rawBytes) * 100).toFixed(1)}%` : "0%",
    scan: summarize(allFindings),
    chats_with_credentials: flagged.length,
    folder_examples: prepared.slice(0, 5).map((p) => p.folder),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (flagged.length && !o.apply) {
    process.stderr.write(`\n${flagged.length} chats carried a credential in the text — redacted before becoming a file.\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  });
}

import { SCOPES } from "./memory-files.mjs";

export const JUDGE_BATCH = 40;

export const JUDGE_TIMEOUT_MS = 240_000;

const BODY_ROOM = 700;

export const SCOPE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          scope: { type: "string", enum: SCOPES },
          reason: { type: "string" }
        },
        required: ["id", "scope", "reason"]
      }
    }
  },
  required: ["verdicts"]
};

export const SCOPE_PROMPT = `You sort the saved memories of one person's coding agent (Claude Code) into two scopes.
Each memory is one fact in a markdown file with a name, a description and a body.

team: the fact holds for anyone on the team. A system, code, an architecture, a process, the business domain, a product name, how a service behaves.
personal: the fact is about this person. A preference, the way they like to work or be answered, their machine, their accounts, their own projects outside the company.
When in doubt, answer personal.

Answer one verdict per memory, with the id exactly as given. reason: one short sentence in the language the memory is written in.`;

export function judgeArgs({ model = "" } = {}) {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(SCOPE_SCHEMA),
    "--system-prompt", SCOPE_PROMPT,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--disable-slash-commands",
    "--no-session-persistence"
  ];
  if (model) args.push("--model", model);
  return args;
}

export function judgePrompt(memories) {
  return memories.map((one) => [
    `## id: ${one.id}`,
    `name: ${one.name}`,
    `description: ${one.description}`,
    "",
    "~~~~markdown",
    String(one.body || "").trim().slice(0, BODY_ROOM),
    "~~~~"
  ].join("\n")).join("\n\n");
}

export function readVerdicts(stdout, ids) {
  let envelope;
  try { envelope = JSON.parse(String(stdout || "")); } catch { return { error: "the judge did not answer in JSON" }; }
  if (envelope?.is_error) return { error: String(envelope.result || "the judge answered with an error").slice(0, 300) };
  const verdicts = envelope?.structured_output?.verdicts;
  if (!Array.isArray(verdicts)) return { error: "the judge did not answer in the expected shape" };
  const wanted = new Set(ids);
  const out = new Map();
  for (const one of verdicts) {
    if (!one || !wanted.has(one.id) || !SCOPES.includes(one.scope) || out.has(one.id)) continue;
    out.set(one.id, { id: one.id, scope: one.scope, reason: String(one.reason || "").slice(0, 300) });
  }
  return { verdicts: [...out.values()] };
}

export function batches(list, size = JUDGE_BATCH) {
  const out = [];
  for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size));
  return out;
}

export const JUDGE_LANES = 3;

export function createScopeJudge({ run, model = "", lanes = JUDGE_LANES }) {
  async function one(batch) {
    const said = await run(judgeArgs({ model }), judgePrompt(batch));
    if (!said?.ok && !said?.out) return { error: String(said?.error || "the judge did not run").slice(0, 300) };
    return readVerdicts(said.out, batch.map((memory) => memory.id));
  }
  return async function judge(memories) {
    const queue = batches(memories);
    const answers = new Array(queue.length);
    let next = 0;
    const lane = async () => {
      while (next < queue.length) {
        const at = next++;
        answers[at] = await one(queue[at]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, lane));
    return {
      verdicts: answers.flatMap((answer) => answer.verdicts || []),
      failures: answers.filter((answer) => answer.error).map((answer) => answer.error)
    };
  };
}

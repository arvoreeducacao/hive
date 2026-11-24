const PROMPT_LINK_MAX = 8000;

const PROMPT_LINK_SCHEME = "hive:";

const PROMPT_LINK_KEYS = ["prompt", "repo", "pr", "provider", "model"];

const HIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0D\uFEFF\uFFA0\uFFF0-\uFFFB\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]/gu;

const ZERO_WIDTH_JOINER = "\u200D";

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

const SEAT_NAME = /^[A-Za-z0-9._-]{1,80}$/;

const PROVIDER_ALIASES = { claudeagent: "claude", "claude-code": "claude", "cursor-agent": "cursor", agy: "antigravity" };

const PROMPT_LINK_ERRORS = {
  "prompt-too-long": "This prompt is longer than 8,000 characters, so the Hive did not open it.",
  "prompt-only-hidden": "This prompt had only hidden characters, so it may be malicious. The Hive did not open it.",
  "unreadable-pull-request": "This link names a pull request the Hive cannot read.",
  "missing-prompt": "This link has no prompt.",
  "unreadable-repository": "This link names a repository the Hive cannot read."
};

const isEmojiPart = (point) => point !== undefined
  && ((point >= 0x1f000 && point <= 0x1faff) || (point >= 0x2190 && point <= 0x2bff) || point === 0xfe0f);

function sanitizeLinkedPrompt(raw) {
  let hidden = 0;
  const visible = Array.from(String(raw ?? "").replace(/\r\n?|[\u2028\u2029]/g, "\n").replace(HIDDEN_CHARACTERS, () => {
    hidden += 1;
    return "";
  }));
  const text = visible.filter((character, index) => {
    if (character !== ZERO_WIDTH_JOINER) return true;
    const kept = isEmojiPart(visible[index - 1]?.codePointAt(0)) && isEmojiPart(visible[index + 1]?.codePointAt(0));
    if (!kept) hidden += 1;
    return kept;
  }).join("");
  return { text: text.trim(), hidden };
}

function repositoryOf(owner, name) {
  const bare = String(name || "").replace(/\.git$/i, "");
  if (!OWNER.test(owner || "") || !REPO_NAME.test(bare) || /^\.+$/.test(bare)) return null;
  return { owner, name: bare };
}

function parseLinkRepository(value) {
  const said = String(value ?? "").trim();
  const found = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)\/?$/i.exec(said) || /^([^/\s]+)\/([^/\s]+)$/.exec(said);
  return found ? repositoryOf(found[1], found[2]) : null;
}

function parseLinkPullRequest(value) {
  const said = String(value ?? "").trim();
  const found = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(said)
    || /^([^/\s#]+)\/([^/\s#]+)(?:\/|#)(\d+)$/.exec(said);
  if (!found) return null;
  const repo = repositoryOf(found[1], found[2]);
  const number = Number(found[3]);
  return repo && Number.isSafeInteger(number) && number > 0 ? { ...repo, number } : null;
}

function readLinkPrompt(params) {
  const raw = params.get("prompt");
  if (raw === null) return { ok: true, prompt: null };
  if (raw.length > PROMPT_LINK_MAX) return { ok: false, error: "prompt-too-long" };
  const prompt = sanitizeLinkedPrompt(raw);
  if (!prompt.text && prompt.hidden > 0) return { ok: false, error: "prompt-only-hidden" };
  return { ok: true, prompt: prompt.text ? prompt : null };
}

const optionalParam = (params, key) => params.get(key)?.trim() || "";

function linkProvider(params) {
  const said = optionalParam(params, "provider").toLowerCase();
  return PROVIDER_ALIASES[said] || said;
}

function urlOf(raw) {
  try {
    return new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
}

function linkPath(url) {
  try {
    return decodeURIComponent(String(url.pathname || "").replace(/^\/+|\/+$/g, ""));
  } catch {
    return null;
  }
}

function parsePromptLink(raw) {
  const url = urlOf(raw);
  if (!url || url.protocol !== PROMPT_LINK_SCHEME) return null;
  const path = linkPath(url);
  if (path === null) return null;
  const params = url.searchParams;
  if (url.hostname === "seat") {
    const seat = path;
    if (!SEAT_NAME.test(seat) || /^\.+$/.test(seat) || !params.has("prompt")) return null;
    const read = readLinkPrompt(params);
    if (!read.ok) return read;
    if (!read.prompt) return { ok: false, error: "missing-prompt" };
    return { ok: true, kind: "seat", seat, prompt: read.prompt, repo: null, pr: null, provider: "", model: "" };
  }
  if (url.hostname !== "new" || path) return null;
  const read = readLinkPrompt(params);
  if (!read.ok) return read;
  const prSaid = params.get("pr");
  if (prSaid !== null) {
    const pr = parseLinkPullRequest(prSaid);
    if (!pr) return { ok: false, error: "unreadable-pull-request" };
    return { ok: true, kind: "pr", seat: "", prompt: read.prompt, repo: { owner: pr.owner, name: pr.name }, pr, provider: "", model: "" };
  }
  if (!read.prompt) return { ok: false, error: "missing-prompt" };
  const repoSaid = params.get("repo");
  const repo = repoSaid === null ? null : parseLinkRepository(repoSaid);
  if (repoSaid !== null && !repo) return { ok: false, error: "unreadable-repository" };
  return { ok: true, kind: "new", seat: "", prompt: read.prompt, repo, pr: null, provider: linkProvider(params), model: optionalParam(params, "model") };
}

function promptLinkable(text) {
  const said = String(text ?? "").trim();
  return !!said && said.length <= PROMPT_LINK_MAX;
}

function buildPromptLink({ prompt, repo = null, provider = "", model = "" } = {}) {
  const said = String(prompt ?? "").trim();
  if (!promptLinkable(said)) return "";
  const params = new URLSearchParams();
  params.set("prompt", said);
  if (repo?.owner && repo?.name) params.set("repo", `${repo.owner}/${repo.name}`);
  if (provider) params.set("provider", provider);
  if (provider && model) params.set("model", model);
  return `hive://new?${params.toString()}`;
}

function promptLinkErrorText(code) {
  return PROMPT_LINK_ERRORS[code] || PROMPT_LINK_ERRORS["missing-prompt"];
}

export {
  PROMPT_LINK_KEYS, PROMPT_LINK_MAX, buildPromptLink, parseLinkPullRequest, parseLinkRepository, parsePromptLink, promptLinkErrorText, promptLinkable, sanitizeLinkedPrompt
};

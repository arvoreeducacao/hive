const TOOL_FACES = [
  [/^(bash|bashoutput|killshell|killbash)$/, "i-term", "run"],
  [/^(read|notebookread)$/, "i-file", "read"],
  [/^(write|edit|multiedit|notebookedit)$/, "i-pen", "write"],
  [/^(grep|toolsearch)$/, "i-mag", "read"],
  [/^(glob|ls)$/, "i-folder", "read"],
  [/^(webfetch|websearch)$/, "i-globe", "web"],
  [/^(artifact|design|designsync)$/, "i-browser", "web"],
  [/^(task|agent|explore|plan|listagents)$/, "i-agent", "agent"],
  [/^workflow$/, "i-flow", "agent"],
  [/^(skill|slashcommand)$/, "i-book", "agent"],
  [/^(sendmessage|senduserfile|pushnotification|remotetrigger)$/, "i-send", "agent"],
  [/^(todowrite|exitplanmode|enterplanmode|reportfindings)$/, "i-list", "plan"],
  [/^(askuserquestion|endconversation)$/, "i-ask", "ask"],
  [/^(monitor|schedulewakeup|taskoutput|taskstop|cron[a-z]*)$/, "i-clock", "agent"]
];

const MCP_GLYPHS = [
  [/sql|query|database|postgres|mysql|supabase|bigquery|table|migration|branch/, "i-db"],
  [/browser|chrome|canopy|screenshot|tab|navigate|click|snapshot/, "i-browser"],
  [/calendar|event|meeting|schedule/, "i-cal"],
  [/mail|message|thread|draft|inbox|label|slack|channel/, "i-mail"],
  [/page|doc|file|drive|notion|comment|transcript|note/, "i-doc"],
  [/search|find|list|get/, "i-mag"]
];

function toolFace(name) {
  const raw = String(name || "");
  const parts = raw.split("__");
  if (parts[0] === "mcp" && parts.length >= 3) {
    const hit = MCP_GLYPHS.find(([re]) => re.test(raw.toLowerCase()));
    return {
      glyph: hit ? hit[1] : "i-plug",
      kind: "mcp",
      label: parts.slice(2).join("__"),
      server: parts[1].replace(/^claude[_-]ai[_-]/i, "").replace(/_/g, " ")
    };
  }
  const hit = TOOL_FACES.find(([re]) => re.test(raw.toLowerCase()));
  return { glyph: hit ? hit[1] : "i-bolt", kind: hit ? hit[2] : "misc", label: raw || "tool", server: "" };
}

function toolSays(name) {
  const face = toolFace(name);
  return face.server ? `${face.label} · ${face.server}` : face.label;
}

const homeless = (t) => String(t).replace(/\/(?:Users|home)\/[^/\s]+\//g, "~/");

const oneLine = (t) => String(t).replace(/\s+/g, " ").trim();

function shortPath(p) {
  const t = homeless(p);
  const segs = t.split("/");
  return segs.length <= 4 ? t : "…/" + segs.slice(-3).join("/");
}

const CD_PREFIX = /^\s*cd\s+(?:'[^']*'|"[^"]*"|[^\s;&|]+)\s*&&\s*/;

function shellLine(cmd) {
  let out = String(cmd);
  while (CD_PREFIX.test(out)) out = out.replace(CD_PREFIX, "");
  return oneLine(homeless(out)) || oneLine(homeless(cmd));
}

const ARG_KEYS = ["command", "file_path", "notebook_path", "pattern", "query", "sql", "url", "path",
  "description", "prompt", "question", "skill", "message", "text", "name", "id"];

function toolArg(name, input) {
  const inp = input && typeof input === "object" ? input : {};
  if (/^bash$/i.test(String(name)) && inp.command) return shellLine(inp.command);
  if (Array.isArray(inp.todos)) {
    const done = inp.todos.filter((t) => t.status === "completed").length;
    const now = inp.todos.find((t) => t.status === "in_progress");
    return `${done}/${inp.todos.length}${now ? ` · ${oneLine(now.activeForm || now.content || "")}` : ""}`;
  }
  if (Array.isArray(inp.questions) && inp.questions[0]) return oneLine(inp.questions[0].question || "");
  for (const key of ARG_KEYS) {
    const v = inp[key];
    if (typeof v !== "string" || !v.trim()) continue;
    const line = key.endsWith("path") ? shortPath(v) : oneLine(homeless(v));
    return key === "pattern" && typeof inp.path === "string" ? `${line} · ${shortPath(inp.path)}` : line;
  }
  const flat = Object.entries(inp).filter(([, v]) => v != null && typeof v !== "object");
  return flat.map(([k, v]) => `${k}: ${oneLine(v)}`).join(" · ");
}

function toolTitle(name, input) {
  const inp = input && typeof input === "object" ? input : {};
  const body = typeof inp.command === "string" ? inp.command : JSON.stringify(inp, null, 1);
  return `${name}\n\n${String(body || "").slice(0, 1500)}`.trim();
}

const SKILL_TOOL = /^skill$/i;

const trimBody = (t) => (t.length > 4000 ? t.slice(0, 4000) + `\n… (${t.length} chars)` : t);

const ARTIFACT_LINK = /https?:\/\/[^\s"'<>)\]]+\/code\/artifact\/[\w-]+/g;

function artifactLink(text) {
  const urls = [...new Set(String(text || "").match(ARTIFACT_LINK) || [])];
  return urls.length === 1 ? urls[0] : "";
}

export { ARG_KEYS, ARTIFACT_LINK, CD_PREFIX, MCP_GLYPHS, SKILL_TOOL, TOOL_FACES, artifactLink, homeless, oneLine, shellLine, shortPath, toolArg, toolFace, toolSays, toolTitle, trimBody };

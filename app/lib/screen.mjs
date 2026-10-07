const DIALOG = /Do you want to|Enter to confirm|Esc to cancel|Waiting for approval|Select login|Paste code|❯ 1\.|\(y\/n\)/;
const RUNNING = /esc to interrupt/i;
const THINKING = /^\s*[·✢✳✶✻✽❋✺✹✸✷*+x]\s+([A-Za-zÀ-ÿ'’]+)…\s*(\([^)]*\))?/;

/* each CLI paints its own footer while a turn runs and its own list when it wants an
   answer; these were read off the real terminals, not guessed. Claude's stay above. */
export const AGENT_CHROME = {
  claude: { running: RUNNING, dialog: DIALOG },
  codex: {
    running: /Working \(\d+s • esc to interrupt\)|esc to interrupt/i,
    dialog: /Press enter to continue|› \d+\. |Allow \w+ to|\(y\/n\)|\[y\/N\]/i
  },
  kimi: {
    running: /[🌑🌒🌓🌔🌕🌖🌗🌘] · |● Running a command|ctrl-s to add guidance/,
    dialog: /❯ (Trust this folder|Don't trust|Yes|No|Allow)|\(y\/n\)|Approve\?/i
  },
  kiro: {
    running: /Kiro is working|esc to cancel\b(?! · ↑↓)/i,
    dialog: /esc to cancel · ↑↓ to navigate · ↵ to select|❯ (No, exit|Yes, I accept)|Allow this action\?|\[y\/n\/t\]/i
  },
  cursor: {
    running: /esc to (?:cancel|interrupt|stop)|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒] (?:Thinking|Working|Generating|Running)/i,
    dialog: /Trust this workspace|Allow (?:this|the) (?:command|edit|tool)|Run this command\?|\(y\/n\)|\[y\/N\]|❯ (?:Yes|No|Allow|Run|Skip)/i
  },
  opencode: {
    running: /esc interrupt|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] (Thinking|Working)/,
    dialog: /permission|allow once|\(y\/n\)/i
  }
};

const chromeOf = (agent) => AGENT_CHROME[agent] || AGENT_CHROME.claude;

const CHROME = [
  /^[\s─━=_]{12,}$/,
  /^\s*⏵⏵/,
  /^\s*◆\s*hive/,
  /^\s*Tip:\s/,
  /tmux detected · scroll with/,
  /shift\+tab to cycle/
];

const OSC_LINK = /\x1b\]8;[^;]*;([^\x1b\x07]*)(?:\x1b\\|\x07)/g;
const ESCAPES = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x1b\x07]*(?:\x1b\\|\x07)|\x1b[()][A-Za-z0-9]|\x1b[=>]/g;

function cleanScreen(screen) {
  const kept = [];
  for (const l of screen.split("\n")) {
    if (CHROME.some((r) => r.test(l))) continue;
    if (!l.trim() && (!kept.length || !kept[kept.length - 1].trim())) continue;
    kept.push(l.replace(/\s+$/, ""));
  }
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept;
}

export function readScreen(raw, agent = "claude") {
  const text = String(raw || "");
  const links = [...new Set([...text.matchAll(OSC_LINK)].map((m) => m[1]).filter(Boolean))];
  const bare = text.replace(ESCAPES, "");
  const running = chromeOf(agent).running.test(bare.split("\n").filter((l) => l.trim()).slice(-6).join("\n"));
  return { lines: cleanScreen(bare), links, running };
}

export function findThinking(lines) {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 24); i--) {
    const m = lines[i].match(THINKING);
    if (m) return { verb: m[1], measure: (m[2] || "").replace(/[()]/g, "") };
  }
  return null;
}

const AGENT_MARKS = /Waiting for \d+ background agents? to finish|Agent "[^"\n]*" (?:finished|failed)/gi;

function waitingOnAgents(footer) {
  let last = "";
  for (const m of footer.matchAll(AGENT_MARKS)) last = m[0];
  return /^Waiting/i.test(last);
}

export function deriveState(lines, status, thinking, running = false, agent = "claude") {
  const footer = lines.slice(-14).join("\n");
  const chrome = chromeOf(agent);
  if (chrome.dialog.test(footer)) return "needs";
  if (thinking || running || chrome.running.test(footer) || waitingOnAgents(footer)) return "working";
  if (status.last?.state === "done") return "done";
  if (status.last?.state === "question" || status.last?.state === "blocked") return "needs";
  return "idle";
}

const MODEL_LINES = {
  codex: /^\s*([A-Za-z0-9][\w.-]*)\s+(?:default|low|medium|high|xhigh)\s+\w+\s+·\s+~?\//,
  kiro: /^\s*[\w-]+ · ([A-Za-z0-9][\w.:/-]*) · [◔◑◕●○] ?\d+%/
};

/* codex and kiro print the model on their footer; kimi's footer names it by a nickname the
   catalogue does not use, so a kimi terminal keeps the model the seat was opened with. */
export function modelOnScreen(lines, agent = "claude") {
  const line = MODEL_LINES[agent];
  if (!line) return "";
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    const m = lines[i].match(line);
    if (m) return m[1];
  }
  return "";
}

export function since(status) {
  if (!status.last) return "";
  const [h, m] = status.last.at.split(":").map(Number);
  const now = new Date();
  const ref = new Date(now);
  ref.setHours(h, m, 0, 0);
  const min = Math.round((now - ref) / 60000);
  if (min < 0 && min > -200) return "now";
  if (Math.abs(min) > 200) return `at ${status.last.at}`;
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")} ago`;
}

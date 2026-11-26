import { svCmd } from "./chat-stretches.js";
import { svConvAppend, svConvKey, svConvShow } from "./conversation-model.js";
import { phrase } from "./core.js";
import { svLine } from "./structured-seats.js";

const MCP_LOOKS_AFTER = [3000, 12000, 45000];

const MCP_LOGIN_WAIT = 300000;

const MCP_LOGIN_BEAT = 2000;

const ASKED_ONCE_PER_SESSION = new Set(["codex", "opencode", "kiro"]);

const announced = new Set();

const signsInHere = (server) => !!server?.name && !String(server.name).startsWith("claude.ai ");

const announcedKey = (e, session, server) => [e.where || "local", e.name, session, server].join("\u0000");

function mcpSignInsAtInit(e, ev) {
  if (e.mirror) return;
  const session = String(ev.session_id || "");
  if (Array.isArray(ev.mcp_servers)) {
    const listed = ev.mcp_servers.filter(signsInHere);
    for (const server of listed) if (server.status === "needs-auth") paintMcpSignIn(e, session, server.name);
    if (listed.some((server) => server.status === "pending")) lookAgain(e, session, 0);
    return;
  }
  if (!ASKED_ONCE_PER_SESSION.has(ev.agent || e.agent)) return;
  const asked = (e.mcpAskedSessions ||= new Set());
  if (asked.has(session)) return;
  asked.add(session);
  lookAgain(e, session, 0);
}

function lookAgain(e, session, tries) {
  clearTimeout(e.mcpLook);
  if (tries >= MCP_LOOKS_AFTER.length) return;
  e.mcpLook = setTimeout(() => lookAtMcpServers(e, session, tries + 1), MCP_LOOKS_AFTER[tries]);
}

async function lookAtMcpServers(e, session, tries) {
  const r = await svCmd(e, { type: "control", op: "mcp" });
  if (!r?.ok || !Array.isArray(r.data)) return;
  const servers = r.data.filter(signsInHere);
  for (const server of servers) if (server.status === "needs-auth") paintMcpSignIn(e, session, server.name);
  if (servers.some((server) => server.status === "pending")) lookAgain(e, session, tries);
}

const LOCK = `<span class="tl-ico"><svg aria-hidden="true"><use href="#i-lock"/></svg></span>`;

const rowsOf = (group) => [...group.notice.querySelectorAll(".mcp-list > .mcp-row")];

function signInGroup(e, session) {
  const groups = (e.mcpSignInGroups ||= new Map());
  const kept = groups.get(session);
  if (kept && e.conv?.blocks.includes(kept.block)) return kept;
  const notice = document.createElement("div");
  notice.className = "sv-mcp-signin";
  notice.setAttribute("role", "group");
  notice.innerHTML = `<button type="button" class="mcp-fold" aria-expanded="false" hidden>${LOCK}<span class="sum"></span><span class="who"></span><svg class="chev" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="mcp-list"></div>`;
  const group = { notice, open: false, block: null };
  notice.querySelector(".mcp-fold").addEventListener("click", (ev) => {
    ev.stopPropagation();
    group.open = !group.open;
    showGroup(group);
  });
  group.block = svConvAppend(e, notice);
  groups.set(session, group);
  return group;
}

function showGroup(group) {
  const rows = rowsOf(group);
  const names = rows.map((row) => row.dataset.server);
  const many = rows.length > 1;
  const open = many && group.open;
  const title = many ? phrase("{n} MCP servers need a sign-in", { n: rows.length }) : phrase("MCP server {name} needs a sign-in", { name: names[0] || "" });
  const fold = group.notice.querySelector(".mcp-fold");
  group.notice.classList.toggle("many", many);
  group.notice.classList.toggle("open", open);
  group.notice.setAttribute("aria-label", title);
  fold.hidden = !many;
  fold.setAttribute("aria-expanded", String(open));
  fold.querySelector(".sum").textContent = title;
  fold.querySelector(".who").textContent = names.join(", ");
  fold.querySelector(".who").hidden = open;
  group.notice.querySelector(".mcp-list").hidden = many && !open;
  for (const row of rows) row.querySelector(".nm").textContent = many ? row.dataset.server : title;
}

function paintMcpSignIn(e, session, name) {
  const key = announcedKey(e, session, name);
  if (announced.has(key)) return null;
  announced.add(key);
  const group = signInGroup(e, session);
  const row = document.createElement("div");
  row.className = "mcp-row";
  row.dataset.server = name;
  row.innerHTML = `${LOCK}<span class="mt"><span class="nm"></span><span class="er" role="alert"></span></span><button type="button" class="auth"></button>`;
  const button = row.querySelector(".auth");
  button.textContent = phrase("Sign in");
  button.addEventListener("click", (ev) => {
    ev.stopPropagation();
    mcpAuthenticate(e, name, row, (cls, text) => rowBecomesLine(e, group, row, cls, text));
  });
  group.notice.querySelector(".mcp-list").appendChild(row);
  showGroup(group);
  svConvShow(e);
  return group.block;
}

function rowBecomesLine(e, group, row, cls, text) {
  row.remove();
  const blocks = e.conv?.blocks || [];
  const at = blocks.indexOf(group.block);
  if (at < 0) return void svLine(e, cls, text);
  const line = { key: svConvKey(e), kind: "meta", cls, text };
  if (rowsOf(group).length) {
    blocks.splice(at, 0, line);
    showGroup(group);
  } else blocks.splice(at, 1, line);
  svConvShow(e);
}

function pasteBoxFor(e, serverName, btn) {
  const paste = document.createElement("div");
  paste.className = "auth-paste";
  paste.innerHTML = `<input placeholder="${phrase("finish the login, then paste the url of the page it lands on (even a broken localhost one)")}" /><button type="button">${phrase("confirm")}</button>`;
  const input = paste.querySelector("input");
  const go = paste.querySelector("button");
  const sendRedirect = async () => {
    if (!input.value.trim()) return;
    go.disabled = true;
    input.disabled = true;
    go.textContent = phrase("finishing…");
    go.classList.add("busy");
    btn.textContent = phrase("completing the login…");
    const r = await fetch("/api/mcp/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: e.name, server: serverName, redirect: input.value.trim() })
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      go.disabled = false;
      input.disabled = false;
      go.textContent = phrase("confirm");
      go.classList.remove("busy");
      btn.textContent = phrase("waiting for the redirect url…");
    }
  };
  go.addEventListener("click", sendRedirect);
  input.addEventListener("keydown", (kev) => { kev.stopPropagation(); if (kev.key === "Enter") { kev.preventDefault(); sendRedirect(); } });
  return paste;
}

async function reconnectAfterLogin(e, serverName) {
  let back = await svCmd(e, { type: "control", op: "mcpReconnect", server: serverName });
  if (!back?.ok) back = await svCmd(e, { type: "control", op: "mcpReload" });
  if (!back?.ok) {
    await svCmd(e, { type: "control", op: "reinit" });
    return { cls: "sv-meta", text: phrase("{name} authenticated — reopen the seat with the same name for its tools to answer here", { name: serverName }) };
  }
  const now = (Array.isArray(back.data) ? back.data : []).find((s) => s.name === serverName);
  const live = !now || now.status === "connected";
  return live
    ? { cls: "sv-meta", text: phrase("{name} authenticated — its tools answer in this seat now", { name: serverName }) }
    : { cls: "sv-meta warn", text: phrase("{name} authenticated, but the seat could not reconnect to it — reopen the seat with the same name", { name: serverName }) };
}

async function mcpAuthenticate(e, serverName, row, settle) {
  const btn = row.querySelector(".auth");
  const er = row.querySelector(".er");
  const label = btn.dataset.label || btn.textContent;
  btn.dataset.label = label;
  let link = null;
  let paste = null;
  const putBack = (why) => {
    paste?.remove();
    link?.remove();
    btn.textContent = label;
    btn.disabled = false;
    er.textContent = why;
  };
  btn.disabled = true;
  er.textContent = "";
  btn.textContent = e.where === "cloud" ? phrase("getting the login url…") : phrase("waiting for the browser…");
  const q = `name=${encodeURIComponent(e.name)}&server=${encodeURIComponent(serverName)}`;
  const started = await fetch("/api/mcp/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: e.name, server: serverName, where: e.where })
  }).then((r) => r.json()).catch(() => null);
  if (!started || started.error) return void putBack(started?.error || phrase("the login did not start"));
  const deadline = Date.now() + MCP_LOGIN_WAIT;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, MCP_LOGIN_BEAT));
    const job = await fetch(`/api/mcp/login?${q}`).then((r) => r.json()).catch(() => null);
    if (!job) continue;
    if (job.url && !link) {
      link = document.createElement("a");
      link.className = "auth-link";
      link.href = job.url;
      link.target = "_blank";
      link.textContent = phrase("open the login page");
      row.appendChild(link);
      btn.textContent = phrase("waiting for the redirect url…");
      paste = pasteBoxFor(e, serverName, btn);
      row.after(paste);
    }
    if (job.state === "done") {
      btn.textContent = phrase("reconnecting…");
      paste?.remove();
      link?.remove();
      const said = await reconnectAfterLogin(e, serverName);
      settle(said.cls, said.text);
      return;
    }
    if (job.state === "failed") return void putBack(job.error || phrase("the login did not go through"));
  }
  putBack(phrase("the login timed out"));
}

export { MCP_LOOKS_AFTER, mcpAuthenticate, mcpSignInsAtInit, paintMcpSignIn, signsInHere };

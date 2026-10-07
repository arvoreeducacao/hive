import { $, esc, phrase, raycastOn } from "./core.js";

export async function leftoversOf(seat) {
  if (!seat || seat.where === "cloud") return null;
  try {
    const answer = await fetch("/api/seat/leftovers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: seat.name })
    });
    if (!answer.ok) return null;
    const said = await answer.json();
    return said && !said.error ? said : null;
  } catch { return null; }
}

function heldSay(tree) {
  if (tree.held === "loose") return phrase("{n} files nobody committed", { n: tree.loose || "" }).trim();
  if (tree.held === "ahead") return phrase("{n} commits nobody pushed", { n: tree.ahead || "" }).trim();
  if (tree.held === "locked") return phrase("a lock somebody put there");
  return "";
}

const short = (path) => String(path || "").split("/").slice(-2).join("/");

const COMMAND_SHOWN = 72;

export function shortCommand(command) {
  const tokens = String(command || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const shown = [tokens[0].split("/").pop(), ...tokens.slice(1)].join(" ");
  return shown.length > COMMAND_SHOWN ? `${shown.slice(0, COMMAND_SHOWN - 1)}…` : shown;
}

export function leftoversHtml(left, { who = "" } = {}) {
  if (!left) return "";
  const parts = [];
  const head = who ? `<b>${esc(who)}</b>: ` : "";
  const processes = Array.isArray(left.processes) ? left.processes : [];
  if (processes.length) {
    const rows = processes.map((one) => `<li><code>${esc(shortCommand(one.command))}</code> <span class="dim">${esc(one.etime || "")}</span></li>`).join("");
    parts.push(`<div class="left-say">${head}${esc(phrase(processes.length === 1 ? "It also stops the process the chat left running:" : "It also stops the {n} processes the chat left running:", { n: processes.length }))}</div><ul class="left">${rows}</ul>`);
  }
  for (const tree of Array.isArray(left.worktrees) ? left.worktrees : []) {
    const name = raycastOn()
      ? `<span class="wt" title="${esc(tree.path)}">${esc(short(tree.path))}<button type="button" class="c-copy" data-copy="${esc(tree.path)}" aria-label="${esc(phrase("copy the path"))}"><svg aria-hidden="true"><use href="#i-copy"/></svg><svg aria-hidden="true"><use href="#i-check"/></svg></button></span>`
      : `<b>${esc(short(tree.path))}</b>`;
    if (!tree.held) {
      parts.push(`<div class="left-say">${head}${phrase("Its worktree {tree} is clean and goes away with it.", { tree: name })}</div>`);
      continue;
    }
    parts.push(`<div class="left-say">${head}${phrase("Its worktree {tree} holds {what}.", { tree: name, what: esc(heldSay(tree)) })} <label class="keep"><input type="checkbox" data-wt="${esc(tree.path)}"> ${esc(phrase("delete it anyway"))}</label></div>`);
  }
  return parts.join("");
}

export function appendLeftovers(pending, { who = "" } = {}) {
  let settled = false;
  pending.then((left) => { if (!settled) $("c-text").insertAdjacentHTML("beforeend", leftoversHtml(left, { who })); });
  return () => { settled = true; };
}

export function worktreesToDrop(left, root = $("c-text")) {
  const asked = [];
  const trees = Array.isArray(left?.worktrees) ? left.worktrees : [];
  const ticked = new Set([...root.querySelectorAll("input[data-wt]")].filter((box) => box.checked).map((box) => box.dataset.wt));
  for (const tree of trees) {
    if (!tree.held) asked.push({ path: tree.path });
    else if (ticked.has(tree.path)) asked.push({ path: tree.path, force: true });
  }
  return asked;
}

export function worktreesThatStayed(said) {
  const failed = (Array.isArray(said?.worktrees) ? said.worktrees : []).filter((one) => one && one.ok === false);
  if (!failed.length) return "";
  return `<ul class="left">${failed.map((one) => `<li><b>${esc(short(one.path))}</b>: ${esc(one.error || phrase("git would not remove it"))}</li>`).join("")}</ul>`;
}

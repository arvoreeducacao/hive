import { esc, phrase } from "./core.js";
import { navigateTerminal, toClipboard } from "./terminal-history.js";

const menu = { node: null };

function closeTerminalMenu() {
  menu.node?.remove();
  menu.node = null;
}

function menuItems(e, { addToChat = null } = {}) {
  const term = e.lookingBack ? e.hist?.term : e.term;
  const picked = term?.hasSelection?.() ? term.getSelection() : "";
  return [
    ...(addToChat ? [{ id: "add", label: phrase("Add to chat"), on: !!picked.trim(), run: () => addToChat(picked) }] : []),
    { id: "copy", label: phrase("Copy"), on: !!picked, run: () => toClipboard(picked) },
    { id: "select-all", label: phrase("Select all"), on: true, run: () => navigateTerminal(e, "select-all") },
    { id: "bottom", label: phrase("Jump to latest"), on: !!e.lookingBack, run: () => navigateTerminal(e, "bottom") }
  ];
}

function openTerminalMenu(e, x, y, back, options = {}) {
  closeTerminalMenu();
  const items = menuItems(e, options);
  const node = document.createElement("div");
  node.className = "term-menu";
  node.setAttribute("role", "menu");
  node.setAttribute("aria-label", phrase("Terminal"));
  node.innerHTML = items.map((one) => `<button type="button" role="menuitem" class="term-mi" data-id="${esc(one.id)}"${one.on ? "" : " disabled"}>${esc(one.label)}</button>`).join("");
  document.body.appendChild(node);
  const box = node.getBoundingClientRect();
  node.style.left = `${Math.max(4, Math.min(x, window.innerWidth - box.width - 4))}px`;
  node.style.top = `${Math.max(4, Math.min(y, window.innerHeight - box.height - 4))}px`;
  node.addEventListener("click", (event) => {
    const hit = event.target.closest(".term-mi");
    if (!hit || hit.disabled) return;
    const chosen = items.find((one) => one.id === hit.dataset.id);
    closeTerminalMenu();
    if (chosen?.id !== "add") back?.();
    chosen?.run();
  });
  node.addEventListener("keydown", (event) => {
    const all = [...node.querySelectorAll(".term-mi:not([disabled])")];
    const at = all.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTerminalMenu();
      back?.();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    }
  });
  menu.node = node;
  node.querySelector(".term-mi:not([disabled])")?.focus();
}

document.addEventListener("pointerdown", (event) => {
  if (menu.node && !menu.node.contains(event.target)) closeTerminalMenu();
}, true);

export { closeTerminalMenu, openTerminalMenu };

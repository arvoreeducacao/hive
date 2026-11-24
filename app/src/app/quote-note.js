import { IS_MAC, esc, phrase } from "./core.js";

const NOTE_WIDTH = 330;

function openQuoteNote(e, picked, save) {
  e.host.querySelector(":scope > .cp-quote-note")?.remove();
  const note = document.createElement("div");
  note.className = "cp-quote-note";
  note.setAttribute("role", "dialog");
  note.setAttribute("aria-label", phrase("Comment on selected text"));
  note.innerHTML = `<textarea rows="2" aria-label="${esc(phrase("Comment on selected text"))}" placeholder="${esc(phrase("Add an optional comment…"))}"></textarea>`
    + `<div class="cp-quote-note-acts"><button type="button" class="cp-btn" data-act="cancel">${esc(phrase("Cancel"))}</button><button type="button" class="cp-btn" data-act="send" title="${esc(IS_MAC ? "⌘↵" : "Ctrl+Enter")}">${esc(phrase("Save and send"))}</button><button type="button" class="cp-btn cp-btn-pri" data-act="save">${esc(phrase("Save"))}</button></div>`;
  const box = note.querySelector("textarea");
  const close = () => {
    note.remove();
    e.box?.textarea.focus();
  };
  const done = (send) => {
    note.remove();
    save(box.value.trim(), send);
  };
  note.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
  note.querySelector('[data-act="cancel"]').addEventListener("click", close);
  note.querySelector('[data-act="save"]').addEventListener("click", () => done(false));
  note.querySelector('[data-act="send"]').addEventListener("click", () => done(true));
  box.addEventListener("keydown", (kev) => {
    kev.stopPropagation();
    if (kev.isComposing) return;
    if (kev.key === "Escape") { kev.preventDefault(); close(); return; }
    if (kev.key === "Enter" && !kev.shiftKey) {
      kev.preventDefault();
      done(IS_MAC ? kev.metaKey : kev.ctrlKey);
    }
  });
  const frame = e.host.getBoundingClientRect();
  note.style.top = `${Math.max(2, (picked.box?.bottom || 0) - frame.top + 6)}px`;
  note.style.left = `${Math.max(2, Math.min((picked.box?.left || 0) - frame.left, frame.width - NOTE_WIDTH))}px`;
  e.host.appendChild(note);
  box.focus();
  return note;
}

export { openQuoteNote };

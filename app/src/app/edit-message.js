import { seatAgent } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { svConvBeforeCompact, svConvEdit, svConvEditing } from "./conversation-model.js";
import { phrase, st } from "./core.js";

const EDIT_BEFORE_COMPACT = "this message is from before the conversation was compacted, so the chat can no longer pick it up from there";

function seatEdits(e) {
  if (!e?.conv || e.mirror || seatAgent(e) !== "claude") return false;
  return !st.data?.sessions?.find((one) => one.name === e.name)?.anon;
}

function paintEditPencil(e, el) {
  const stamp = el.querySelector(":scope > .sv-stamp");
  if (!stamp) return;
  const uuid = el.dataset.uuid || "";
  let pencil = stamp.querySelector(":scope > .st-edit");
  if (!uuid || !el.classList.contains("sv-user") || el.classList.contains("peer") || !seatEdits(e)) return void pencil?.remove();
  if (!pencil) {
    pencil = document.createElement("button");
    pencil.type = "button";
    pencil.className = "st-edit";
    pencil.innerHTML = `<svg aria-hidden="true"><use href="#i-pen"/></svg>`;
    pencil.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (pencil.classList.contains("off")) return;
      startEdit(e, pencil.closest(".sv-user")?.dataset.uuid || "");
    });
    stamp.append(pencil);
  }
  const behind = svConvBeforeCompact(e, uuid);
  pencil.classList.toggle("off", behind);
  pencil.setAttribute("aria-disabled", behind ? "true" : "false");
  pencil.title = behind ? phrase(EDIT_BEFORE_COMPACT) : phrase("edit and redo from here");
}

function startEdit(e, uuid) {
  const working = !!e.turnOpen;
  svConvEdit(e, uuid, {
    label: phrase("edit this message"),
    hint: working
      ? phrase("The chat stops what it is doing, forgets what came after this message and answers again. Files stay as they are.")
      : phrase("The chat forgets what came after this message and answers again. Files stay as they are."),
    cancel: phrase("cancel"),
    save: working ? phrase("stop and redo") : phrase("redo from here")
  });
}

function saveEdit(e, block, text) {
  if (!block?.editing || block.editing.busy) return;
  const said = String(text || "").trim();
  if (!said && !block.thumbs.length) return;
  svConvEditing(e, block, { text: said, busy: true, error: "" });
  svCmd(e, { type: "edit", target: block.dataset.uuid, text: said, images: block.thumbs.map((one) => one.path) }).then((r) => {
    if (!block.editing) return;
    if (r?.ok) {
      if (r.stopping) svConvEditing(e, block, { hint: phrase("stopping the chat — it answers again from here once the turn ends") });
      return;
    }
    svConvEditing(e, block, { busy: false, error: r?.error ? phrase(r.error) : phrase("the edit did not reach this chat") });
  });
}

function editFailed(e, block, error) {
  if (block?.editing) svConvEditing(e, block, { busy: false, error: phrase(error || "the edit did not reach this chat") });
}

export { editFailed, paintEditPencil, saveEdit };

import { codeBlockAt, fenceEnter, fenceTab } from "./composer-fences.js";
import { listContinuation, listIndent, listOutdent, onListLine } from "./composer-lists.js";
import { readlineEdit } from "./composer-readline.js";

function editBox(box, start, end, text, selection = null) {
  if (start === end && !text) {
    if (selection) box.setSelectionRange(selection[0], selection[1]);
    return;
  }
  if (document.activeElement !== box && !box.disabled) box.focus();
  box.setSelectionRange(start, end);
  const focused = document.activeElement === box;
  const native = focused && (text ? document.execCommand?.("insertText", false, text) : document.execCommand?.("delete"));
  if (!native) {
    box.setRangeText(text, start, end, "end");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (selection) box.setSelectionRange(selection[0], selection[1]);
}

function enterEdit(value, start, end, shift) {
  const fenced = fenceEnter(value, start, end);
  if (fenced && (!shift || codeBlockAt(value, start))) return fenced;
  if (!shift || start !== end) return null;
  return listContinuation(value, start);
}

function tabEdit(value, start, end, shift) {
  const fenced = fenceTab(value, start, end, shift);
  if (fenced) return fenced;
  if (start !== end) return null;
  const listed = shift ? listOutdent(value, start, end) : listIndent(value, start, end);
  if (listed) return listed;
  return shift && onListLine(value, start) ? { consumed: true } : null;
}

function readlineKeys(kev, box) {
  const line = readlineEdit(kev, box);
  if (!line) return false;
  kev.preventDefault();
  editBox(box, line.start, line.end, line.text, line.selection);
  return true;
}

function editingKeys(kev, box) {
  if (readlineKeys(kev, box)) return true;
  if (kev.key !== "Enter" && kev.key !== "Tab") return false;
  if (kev.isComposing || kev.keyCode === 229 || kev.metaKey || kev.ctrlKey || kev.altKey) return false;
  const value = box.value;
  const start = box.selectionStart ?? value.length;
  const end = box.selectionEnd ?? start;
  const edit = kev.key === "Enter" ? enterEdit(value, start, end, kev.shiftKey) : tabEdit(value, start, end, kev.shiftKey);
  if (!edit) return false;
  kev.preventDefault();
  if (!edit.consumed) editBox(box, edit.start, edit.end, edit.text, edit.selection);
  return true;
}

export { editBox, editingKeys, enterEdit, readlineKeys, tabEdit };

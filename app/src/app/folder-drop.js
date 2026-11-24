import { phrase } from "./core.js";
import { toast } from "./composer-toast.js";

function pathOfDroppedFile(file) {
  try {
    return String(window.hiveFiles?.pathOf?.(file) || "");
  } catch {
    return "";
  }
}

function folderMention(path) {
  const clean = String(path || "").replace(/[\\/]+$/, "") || "/";
  const shown = clean === "/" ? "/" : `${clean}/`;
  return /^[\w./~-]+$/.test(shown) ? `@${shown}` : `@"${shown}"`;
}

function appendMention(box, mention) {
  const said = box.value;
  const lead = said && !/\s$/.test(said) ? " " : "";
  box.value = `${said}${lead}${mention} `;
  box.setSelectionRange(box.value.length, box.value.length);
}

function addFolders(box, folders, { where = "local", busy = () => false, pathOf = pathOfDroppedFile } = {}) {
  if (!box || !folders.length) return 0;
  if (where === "cloud") {
    toast({ title: phrase("Folders can only be referenced on a server running on this computer") });
    return 0;
  }
  let added = 0;
  for (const folder of folders) {
    if (busy()) {
      toast({ title: phrase("Unable to add folder"), description: phrase("The composer is busy; try again once it is ready.") });
      break;
    }
    const path = pathOf(folder);
    if (!path) {
      toast({ title: phrase(`Couldn't get the path of "{name}"`, { name: folder.name }), description: phrase("Type the folder path with @ instead.") });
      continue;
    }
    appendMention(box, folderMention(path));
    added += 1;
  }
  if (added) box.dispatchEvent(new Event("input", { bubbles: true }));
  box.focus();
  return added;
}

export { addFolders, folderMention, pathOfDroppedFile };

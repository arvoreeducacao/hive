import { phrase, st } from "./core.js";
import { hudUndo } from "./hud.js";
import { draftKept, keepDraftNow } from "./kept-drafts.js";
import { tiles } from "./leader-key.js";

const composerOf = (name) => tiles.get(name)?.querySelector(".sv-composer textarea") || null;

const hasDraft = (name) => !!draftKept(name).trim();

function putDraft(name, text) {
  const box = composerOf(name);
  if (box) {
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }
  keepDraftNow(name, text);
  document.dispatchEvent(new CustomEvent("hive:marks"));
}

function discardDraft(name) {
  const was = draftKept(name);
  if (!was.trim()) return;
  const title = (st.data?.sessions || []).find((one) => one.name === name)?.title || name;
  putDraft(name, "");
  hudUndo({ icon: "i-pen", text: phrase("Draft of “{title}” discarded", { title }), run: () => putDraft(name, was) });
}

export { discardDraft, hasDraft };

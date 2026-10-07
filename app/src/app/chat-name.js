import { render } from "./arrange.js";
import { esc, phrase, st } from "./core.js";
import { behaviorOn } from "./experience.js";
import { pull, releaseKeyboard } from "./focus-navigation.js";
import { tiles } from "./leader-key.js";
import { nodeOf } from "./seat-menu.js";

st.renaming = "";

function nameHint(s) {
  if (behaviorOn("titleClick")) return phrase("click to rename this chat");
  if (s.mine) return phrase("the name you wrote — double-click to change it");
  return phrase("double-click to rename this chat");
}

function paintName(el, s) {
  if (st.renaming === s.name && el.querySelector(".t-rename")) return;
  if (st.renaming === s.name) st.renaming = "";
  const slot = nodeOf(el, ".t-name");
  const html = s.naming ? "" : esc(s.title || s.name);
  if (slot.dataset.h !== html || slot.firstElementChild) {
    slot.innerHTML = html;
    slot.dataset.h = html;
  }
  slot.classList.toggle("naming", !!s.naming);
  slot.title = s.naming ? phrase("naming this chat in the background — the first words hold the seat until the name lands") : nameHint(s);
}

async function rename(s, written) {
  try {
    const r = await fetch("/api/rename", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: s.name, where: s.where, title: written })
    });
    if (!r.ok) throw new Error("rename");
  } catch {
    return;
  }
  pull();
}

function startRename(name) {
  const el = tiles.get(name);
  const s = st.data.sessions.find((x) => x.name === name);
  if (!el || !s || st.renaming === name) return;
  releaseKeyboard();
  st.renaming = name;
  const slot = el.querySelector(".t-name");
  const inp = document.createElement("input");
  inp.className = "t-rename";
  inp.spellcheck = false;
  inp.maxLength = 60;
  inp.value = s.title || s.name;
  inp.setAttribute("aria-label", phrase("name of the chat {name}", { name: s.name }));
  inp.placeholder = phrase("empty gives the chat its seat name back");
  const stop = (commit) => {
    if (st.renaming !== name) return;
    const written = inp.value.trim();
    st.renaming = "";
    render();
    if (commit && written !== (s.title || "")) rename(s, written);
  };
  inp.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); stop(true); }
    if (ev.key === "Escape") { ev.preventDefault(); stop(false); }
  });
  inp.addEventListener("blur", () => stop(true));
  ["click", "dblclick", "pointerdown"].forEach((e) => inp.addEventListener(e, (ev) => ev.stopPropagation()));
  slot.textContent = "";
  slot.appendChild(inp);
  inp.focus();
  inp.select();
}

export { nameHint, paintName, rename, startRename };

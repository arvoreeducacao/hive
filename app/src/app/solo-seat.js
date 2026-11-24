import { attachSeat, soloSeat } from "./blocks.js";
import { every, phrase } from "./core.js";
import { pullThreads } from "./prs.js";

function bootSolo() {
  if (!soloSeat) {
    window.hiveSeatWindow?.onBack((name) => attachSeat(name));
    return;
  }
  document.documentElement.classList.add("solo");
  document.title = soloSeat;
  const mark = document.createElement("span");
  mark.className = "seat-of";
  mark.textContent = soloSeat;
  mark.title = phrase("drag this seat out of the window to put it back in the grid");
  document.querySelector(".brand")?.appendChild(mark);
}

bootSolo();

every("threads", 45000, () => pullThreads(false));

export { bootSolo };

import { esc, phrase } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { takeFiles, zoneOf } from "./drop-zone.js";

const clipMarkup = () => `<button type="button" class="sv-clip" title="${esc(phrase("Attach files"))}" aria-label="${esc(phrase("Attach files"))}">${composerIcon("paperclip")}</button>`;

function pickFiles(button) {
  const zone = zoneOf({ target: button });
  if (!zone) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => takeFiles(zone, [...(input.files || [])]), { once: true });
  input.click();
}

function wireClip(host) {
  const clip = host.querySelector(".sv-clip");
  if (!clip || clip.dataset.wired) return;
  clip.dataset.wired = "1";
  clip.addEventListener("pointerdown", (ev) => ev.preventDefault());
  clip.addEventListener("click", () => pickFiles(clip));
}

export { clipMarkup, pickFiles, wireClip };

import { editBox } from "./composer-editing.js";
import { phrase } from "./core.js";
import { openShot } from "./picture-preview.js";

const IMAGE_MARK_RE = /\[Image #(\d+)\]/g;

function outboundImageMarks(text, marks) {
  const images = [];
  IMAGE_MARK_RE.lastIndex = 0;
  const out = String(text).replace(IMAGE_MARK_RE, (mark, n) => {
    const path = marks.get(Number(n));
    if (!path) return mark;
    images.push(path);
    return `[Image #${images.length}]`;
  });
  const carried = new Set(images);
  for (const path of marks.values()) if (!carried.has(path)) images.push(path);
  return { text: out, images };
}

function inlineImagePaths(text, marks) {
  const left = [];
  IMAGE_MARK_RE.lastIndex = 0;
  const out = String(text).replace(IMAGE_MARK_RE, (mark, n) => marks.get(Number(n)) || mark);
  for (const path of marks.values()) if (!out.includes(path)) left.push(path);
  return left.length ? `${out}${out.trim() ? "\n" : ""}${left.join("\n")}` : out;
}

function inlineImageList(text, images = []) {
  IMAGE_MARK_RE.lastIndex = 0;
  const out = String(text).replace(IMAGE_MARK_RE, (mark, n) => images[Number(n) - 1] || mark);
  const left = images.filter((path) => !out.includes(path));
  return left.length ? `${out}${out.trim() ? "\n" : ""}${left.join("\n")}` : out;
}

function markIntoBox(box, mark) {
  const at = box.selectionStart ?? box.value.length;
  const pad = at > 0 && !/\s$/.test(box.value.slice(0, at)) ? " " : "";
  editBox(box, at, box.selectionEnd ?? at, `${pad}${mark} `);
}

function dropMarkText(box, n) {
  const said = box.value;
  const found = [...said.matchAll(new RegExp(`\\[Image #${n}\\] ?`, "g"))];
  if (!found.length) return false;
  const from = found[0].index;
  const to = found.at(-1).index + found.at(-1)[0].length;
  const kept = said.slice(from, to).replace(new RegExp(`\\[Image #${n}\\] ?`, "g"), "");
  editBox(box, from, to, kept, [from, from]);
  return true;
}

function imageTray(tray, box, origin) {
  const marks = new Map();
  const retained = new Map();
  let seq = 0;
  const paint = () => tray.classList.toggle("on", !!tray.querySelector(".att, .sv-paste-peek:not([hidden])"));
  const changed = () => box.dispatchEvent(new Event("input"));
  const stamp = (path, n) => {
    const chip = document.createElement("div");
    chip.className = "att";
    chip.dataset.mark = String(n);
    chip.dataset.path = path;
    const short = path.split("/").pop();
    chip.innerHTML = `<img alt=""><span class="am"></span><button type="button" class="ax" title="${phrase("remove the image")}">×</button>`;
    const img = chip.querySelector("img");
    const at = origin();
    img.src = `/api/image?path=${encodeURIComponent(path)}&where=${at.where}&name=${encodeURIComponent(at.name)}`;
    img.alt = short;
    img.title = phrase("{short} — click to see it big", { short: short });
    img.addEventListener("click", () => { const o = origin(); openShot(path, o.where, o.name); });
    chip.querySelector(".am").textContent = `#${n}`;
    chip.querySelector(".ax").addEventListener("click", () => {
      unmark(n);
      paint();
      if (!dropMarkText(box, n)) changed();
    });
    tray.appendChild(chip);
    paint();
  };
  const unmark = (n) => {
    if (marks.has(n)) retained.set(n, marks.get(n));
    marks.delete(n);
    tray.querySelector(`.att[data-mark="${n}"]`)?.remove();
  };
  return {
    marks,
    count: () => marks.size,
    add(path) {
      const n = ++seq;
      marks.set(n, path);
      stamp(path, n);
      markIntoBox(box, `[Image #${n}]`);
    },
    restore(path, n) {
      retained.delete(n);
      marks.set(n, path);
      if (n > seq) seq = n;
      stamp(path, n);
    },
    mint: () => ++seq,
    sync() {
      for (const chip of tray.querySelectorAll(".att[data-mark]")) {
        const n = Number(chip.dataset.mark);
        if (!box.value.includes(`[Image #${n}]`)) unmark(n);
      }
      for (const [n, path] of retained) {
        if (marks.has(n) || !box.value.includes(`[Image #${n}]`)) continue;
        retained.delete(n);
        marks.set(n, path);
        stamp(path, n);
      }
      paint();
    },
    clear() {
      marks.clear();
      retained.clear();
      seq = 0;
      for (const chip of tray.querySelectorAll(".att:not(.quote)")) chip.remove();
      paint();
    }
  };
}

export { IMAGE_MARK_RE, imageTray, inlineImageList, inlineImagePaths, markIntoBox, outboundImageMarks };

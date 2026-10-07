const FIRST_TREE_MIN = 80;

export function treesThatFit({ room, gap, fixed, trees, more, firstMin = FIRST_TREE_MIN }) {
  if (trees.length <= 1) return trees.length;
  const fixedWidth = fixed.reduce((sum, width) => sum + width + gap, 0);
  for (let shown = trees.length; shown > 1; shown--) {
    const first = Math.min(trees[0], firstMin);
    const rest = trees.slice(1, shown).reduce((sum, width) => sum + gap + width, 0);
    const tail = shown < trees.length ? gap + more : 0;
    if (fixedWidth + first + rest + tail <= room) return shown;
  }
  return 1;
}

const chipSaid = (chip) => [chip.querySelector(".tx")?.textContent, chip.querySelector("b")?.textContent].filter(Boolean).join(" · ");

function moreOf(row) {
  let more = row.querySelector(":scope > .c.more");
  if (!more) {
    more = row.ownerDocument.createElement("span");
    more.className = "c more";
    row.appendChild(more);
  }
  return more;
}

export function fitChipRow(row, on) {
  row.querySelector(":scope > .c.more")?.remove();
  const chips = [...row.querySelectorAll(":scope > .c")];
  const trees = chips.filter((chip) => chip.classList.contains("tree"));
  for (const chip of chips) {
    chip.hidden = false;
    chip.classList.toggle("first", on && chip === trees[0]);
  }
  if (!on || trees.length < 2 || row.scrollWidth <= row.clientWidth) return;
  const style = getComputedStyle(row);
  const gap = parseFloat(style.columnGap) || 0;
  const room = row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const more = moreOf(row);
  more.textContent = `+${trees.length}`;
  const shown = treesThatFit({
    room,
    gap,
    fixed: chips.filter((chip) => !trees.includes(chip) && chip.getClientRects().length).map((chip) => chip.offsetWidth),
    trees: trees.map((chip, at) => (at ? chip.offsetWidth : chip.scrollWidth)),
    more: more.offsetWidth
  });
  const hidden = trees.slice(shown);
  for (const chip of hidden) chip.hidden = true;
  if (!hidden.length) {
    more.remove();
    return;
  }
  more.textContent = `+${hidden.length}`;
  more.title = hidden.map(chipSaid).join("\n");
}

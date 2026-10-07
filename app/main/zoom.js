const STEP = 0.5;
const FLOOR = -3;
const CEIL = 4;

function nextLevel(current, step) {
  if (step === null) return 0;
  const level = Number(current) + step;
  if (!Number.isFinite(level)) return 0;
  return Math.max(FLOOR, Math.min(CEIL, level));
}

function viewMenu(zoom) {
  return [
    { role: "reload" },
    { role: "forceReload" },
    { role: "toggleDevTools" },
    { type: "separator" },
    { label: "Actual Size", accelerator: "CommandOrControl+0", click: () => zoom(null) },
    { label: "Zoom In", accelerator: "CommandOrControl+Plus", click: () => zoom(STEP) },
    { label: "Zoom In", accelerator: "CommandOrControl+=", visible: false, click: () => zoom(STEP) },
    { label: "Zoom Out", accelerator: "CommandOrControl+-", click: () => zoom(-STEP) },
    { type: "separator" },
    { role: "togglefullscreen" }
  ];
}

module.exports = { STEP, FLOOR, CEIL, nextLevel, viewMenu };

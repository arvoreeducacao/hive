const wants = new Set();

const eaters = new Set();

const leavers = new Set();

let tookTheScreen = false;

const screenIsFull = () => document.documentElement.classList.contains("fullscreen");

function takeTheScreen(who, { eatsEscape = false } = {}) {
  wants.add(who);
  if (eatsEscape) eaters.add(who);
  window.hiveWindow?.readingAlone?.(eaters.size > 0);
  if (tookTheScreen || screenIsFull() || !window.hiveWindow?.act) return;
  tookTheScreen = true;
  window.hiveWindow.act("full");
}

function giveTheScreenBack(who) {
  wants.delete(who);
  eaters.delete(who);
  window.hiveWindow?.readingAlone?.(eaters.size > 0);
  if (wants.size || !tookTheScreen) return;
  tookTheScreen = false;
  window.hiveWindow?.act("windowed");
}

function whenTheScreenGoesBack(leave) {
  leavers.add(leave);
}

function screenWentBackToAWindow() {
  if (screenIsFull()) return;
  tookTheScreen = false;
  for (const leave of [...leavers]) leave();
}

new MutationObserver(screenWentBackToAWindow)
  .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

export { giveTheScreenBack, screenIsFull, screenWentBackToAWindow, takeTheScreen, whenTheScreenGoesBack };

export const FRAME_MS = 1000 / 24;

export function nextFrame(win, draw, wait = FRAME_MS) {
  let raf = 0;
  const timer = win.setTimeout(() => { raf = win.requestAnimationFrame(draw); }, wait);
  return () => {
    win.clearTimeout(timer);
    if (raf) win.cancelAnimationFrame(raf);
  };
}

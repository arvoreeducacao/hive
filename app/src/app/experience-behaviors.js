const INFO_DEFAULT = 380;
const INFO_MIN = 240;
const INFO_MIN_BESIDE_PANE = 320;
const WELL_MIN = 360;
const PANE_MIN = 420;
const THREAD_DEFAULT = 392;
const THREAD_MIN = 300;
const CHAT_MIN = 320;
const CHAT_MIN_HEIGHT = 160;
const HEAD_FALLBACK = 96;
const GAP = 12;
const SAVE_AFTER = 400;
const NARROW = 860;

const PANED = ["arting", "reviewing", "threading"];

export function createExperienceBehaviors({ document, save }) {
  let off = new Set();
  let learned = false;
  const size = { infoWidth: INFO_DEFAULT, threadWidth: THREAD_DEFAULT, infoHeight: null, paneWidth: null };
  let saving = 0;
  let pending = {};
  let drag = null;

  const body = () => document.body;
  const behaviorOn = (name) => body().classList.contains("experience-next") && !off.has(name);
  const resizeOn = () => !off.has("resizeInfo");
  const paned = (tile) => PANED.some((mode) => tile.classList.contains(mode));
  const chatBesidePane = (tile) => tile.classList.contains("arting") && body().classList.contains("experience-next") && (document.defaultView?.innerWidth ?? 0) > NARROW;
  const width = (tile) => tile?.clientWidth || 0;
  const height = (tile) => tile?.clientHeight || 0;

  function headOf(tile) {
    const side = tile?.querySelector(":scope > .side");
    const chips = side?.querySelector(".t-chips");
    if (!chips || !chips.offsetHeight) return HEAD_FALLBACK;
    return chips.offsetTop + chips.offsetHeight + GAP;
  }

  function naturalOf(tile) {
    const side = tile?.querySelector(":scope > .side");
    return side?.scrollHeight || Infinity;
  }

  const SPLITS = {
    infoWidth: {
      selector: ".x-split",
      axis: "x",
      prop: "--x-info-width",
      fallback: INFO_DEFAULT,
      limits(tile) {
        if (!paned(tile)) return { low: INFO_MIN, high: Math.max(INFO_MIN, width(tile) - WELL_MIN) };
        const rest = tile.classList.contains("threading") ? GAP + Math.max(THREAD_MIN, size.threadWidth) + GAP + CHAT_MIN : chatBesidePane(tile) ? GAP + CHAT_MIN + GAP + Math.max(PANE_MIN, size.paneWidth ?? PANE_MIN) : GAP + PANE_MIN;
        return { low: INFO_MIN_BESIDE_PANE, high: Math.max(INFO_MIN_BESIDE_PANE, width(tile) - 2 * GAP - rest) };
      },
    },
    threadWidth: {
      selector: ".x-split-thread",
      axis: "x",
      prop: "--x-thread-width",
      fallback: THREAD_DEFAULT,
      limits(tile) {
        const high = width(tile) - 2 * GAP - Math.max(INFO_MIN_BESIDE_PANE, size.infoWidth) - 2 * GAP - CHAT_MIN;
        return { low: THREAD_MIN, high: Math.max(THREAD_MIN, high) };
      },
    },
    paneWidth: {
      selector: ".x-split-pane",
      axis: "x",
      prop: "--x-pane-width",
      fallback: null,
      reverse: true,
      natural: (tile) => tile?.querySelector(":scope > .art")?.offsetWidth,
      limits(tile) {
        const info = tile?.classList.contains("draft") ? 0 : Math.max(INFO_MIN_BESIDE_PANE, size.infoWidth);
        const high = width(tile) - info - CHAT_MIN;
        return { low: PANE_MIN, high: Math.max(PANE_MIN, high) };
      },
    },
    infoHeight: {
      selector: ".y-split",
      axis: "y",
      prop: "--x-info-height",
      fallback: null,
      natural: (tile) => tile?.querySelector(":scope > .side")?.offsetHeight,
      limits(tile) {
        const low = headOf(tile);
        const room = height(tile) - 2 * GAP - GAP - CHAT_MIN_HEIGHT;
        return { low, high: Math.max(low, Math.min(room, naturalOf(tile))) };
      },
    },
  };

  function shown(key, tile) {
    const { low, high } = SPLITS[key].limits(tile);
    const value = size[key] ?? SPLITS[key].natural?.(tile) ?? low;
    return Math.max(low, Math.min(high, value));
  }

  function paintSize(key) {
    const { prop } = SPLITS[key];
    if (size[key] === null) body().style.removeProperty(prop);
    else body().style.setProperty(prop, `${size[key]}px`);
    if (key === "infoHeight") body().classList.toggle("x-info-sized", size[key] !== null);
  }

  function paintSplit(key, handle, tile) {
    const { low, high } = SPLITS[key].limits(tile);
    handle.setAttribute("aria-valuemin", String(Math.round(low)));
    handle.setAttribute("aria-valuemax", String(Math.round(high)));
    handle.setAttribute("aria-valuenow", String(Math.round(shown(key, tile))));
  }

  function setSize(key, value, tile, keep) {
    const { low, high } = SPLITS[key].limits(tile);
    size[key] = value === null ? null : Math.round(Math.max(low, Math.min(high, value)));
    paintSize(key);
    const handle = tile?.querySelector(`:scope > ${SPLITS[key].selector}`);
    if (handle) paintSplit(key, handle, tile);
    if (!keep) return;
    pending[key] = size[key];
    if (!learned) {
      learned = true;
      body().classList.add("x-splits-learned");
      pending.splitsLearned = true;
    }
    clearTimeout(saving);
    saving = setTimeout(() => {
      const patch = pending;
      pending = {};
      save(patch);
    }, SAVE_AFTER);
  }

  function adopt(result) {
    const config = result?.config;
    if (!config) return;
    off = new Set(Array.isArray(config.experienceOff) ? config.experienceOff : []);
    body().dataset.experienceOff = [...off].join(" ");
    const defaultSans = result.defaults?.font?.sans;
    if (defaultSans && config.font) body().dataset.fontDefault = String(config.font.sans === defaultSans);
    learned = config.splitsLearned === true;
    body().classList.toggle("x-splits-learned", learned);
    if (drag) return;
    size.infoWidth = Number.isInteger(config.infoWidth) ? config.infoWidth : INFO_DEFAULT;
    size.threadWidth = Number.isInteger(config.threadWidth) ? config.threadWidth : THREAD_DEFAULT;
    size.infoHeight = Number.isInteger(config.infoHeight) ? config.infoHeight : null;
    size.paneWidth = Number.isInteger(config.paneWidth) ? config.paneWidth : null;
    Object.keys(SPLITS).forEach(paintSize);
  }

  function splitOf(target) {
    const handle = target?.closest?.(".x-split, .x-split-thread, .x-split-pane, .y-split");
    const tile = handle?.parentElement;
    if (!handle || !tile?.classList.contains("open") || !resizeOn()) return null;
    const key = Object.keys(SPLITS).find((name) => handle.matches(SPLITS[name].selector));
    return key ? { handle, tile, key } : null;
  }

  document.addEventListener("pointerdown", (ev) => {
    const hit = splitOf(ev.target);
    if (!hit || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    hit.handle.focus();
    hit.handle.setPointerCapture?.(ev.pointerId);
    const scale = hit.tile.getBoundingClientRect().width / (hit.tile.offsetWidth || 1) || 1;
    const along = SPLITS[hit.key].axis === "x" ? ev.clientX : ev.clientY;
    drag = { ...hit, along, from: shown(hit.key, hit.tile), scale };
    hit.tile.classList.add("x-resizing");
    hit.tile.dataset.resizing = SPLITS[hit.key].axis;
  }, true);

  document.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    drag.moved = true;
    const along = SPLITS[drag.key].axis === "x" ? ev.clientX : ev.clientY;
    const moved = (along - drag.along) / drag.scale;
    setSize(drag.key, drag.from + (SPLITS[drag.key].reverse ? -moved : moved), drag.tile, false);
  });

  const stop = () => {
    if (!drag) return;
    const { tile, key, moved } = drag;
    drag = null;
    tile.classList.remove("x-resizing");
    delete tile.dataset.resizing;
    if (!moved) return;
    setSize(key, size[key] ?? shown(key, tile), tile, true);
  };
  document.addEventListener("pointerup", stop);
  document.addEventListener("pointercancel", stop);

  document.addEventListener("dblclick", (ev) => {
    const hit = splitOf(ev.target);
    if (!hit) return;
    ev.stopPropagation();
    setSize(hit.key, SPLITS[hit.key].fallback, hit.tile, true);
  }, true);

  document.addEventListener("keydown", (ev) => {
    const hit = splitOf(ev.target);
    if (!hit) return;
    const step = ev.shiftKey ? 40 : 10;
    const { low, high } = SPLITS[hit.key].limits(hit.tile);
    const now = shown(hit.key, hit.tile);
    const grows = SPLITS[hit.key].reverse ? -step : step;
    const moves = SPLITS[hit.key].axis === "x"
      ? { ArrowLeft: now - grows, ArrowRight: now + grows, Home: low, End: high }
      : { ArrowUp: now - step, ArrowDown: now + step, Home: low, End: high };
    const next = moves[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    ev.stopPropagation();
    setSize(hit.key, next, hit.tile, true);
  }, true);

  document.addEventListener("focusin", (ev) => {
    const hit = splitOf(ev.target);
    if (hit) paintSplit(hit.key, hit.handle, hit.tile);
  });

  return { adopt, behaviorOn, infoWidth: () => size.infoWidth, size: (key) => size[key] };
}

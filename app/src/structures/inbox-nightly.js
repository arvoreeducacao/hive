const STARS = [
  [14, 10, 0.6, 0.85],
  [38, 22, 0.4, 0.55],
  [58, 8, 0.5, 0.7],
  [84, 16, 0.4, 0.5],
  [104, 7, 0.6, 0.8],
  [126, 20, 0.4, 0.55],
  [148, 11, 0.5, 0.7],
  [170, 24, 0.4, 0.5],
  [192, 9, 0.6, 0.8],
  [214, 18, 0.4, 0.55],
  [236, 8, 0.5, 0.7],
  [258, 20, 0.45, 0.6],
  [278, 11, 0.55, 0.75],
  [26, 34, 0.4, 0.45],
  [118, 34, 0.4, 0.45],
  [202, 32, 0.4, 0.5],
  [268, 34, 0.4, 0.45]
];

const SPARKLES = [[70, 28], [160, 36], [246, 26]];

const CLOUDS = [
  "M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z",
  "M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z"
];

function nightlySkyHtml() {
  const stars = STARS.map(([cx, cy, r, opacity]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill-opacity="${opacity}"/>`).join("");
  const sparkles = SPARKLES.map(([x, y]) => `<path d="M${x - 1.5} ${y}H${x + 1.5}"/><path d="M${x} ${y - 1.5}V${y + 1.5}"/>`).join("");
  const clouds = CLOUDS.map((d, at) => `<g filter="url(#tx-night-soft)"><path d="${d}" fill="url(#tx-night-cloud)"${at ? ' fill-opacity="0.8"' : ""}/></g>`).join("");
  return `<div class="tx-stage" aria-hidden="true"><svg viewBox="0 0 8192 96" preserveAspectRatio="xMinYMin slice" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tx-night-sky" x1="24" y1="0" x2="264" y2="96" gradientUnits="userSpaceOnUse" spreadMethod="reflect"><stop stop-color="var(--tx-night-bottom)"/><stop offset="0.5" stop-color="var(--tx-night-mid)"/><stop offset="1" stop-color="var(--tx-night-top)"/></linearGradient>
      <radialGradient id="tx-night-glow" cx="0" cy="0" r="1" gradientTransform="translate(216 18) rotate(137) scale(120 84)" gradientUnits="userSpaceOnUse"><stop stop-color="var(--tx-night-glow-highlight)" stop-opacity="0.4"/><stop offset="0.5" stop-color="var(--tx-night-glow-secondary)" stop-opacity="0.16"/><stop offset="1" stop-color="var(--tx-night-bottom)" stop-opacity="0"/></radialGradient>
      <linearGradient id="tx-night-cloud" x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="var(--tx-night-highlight)" stop-opacity="0.5"/><stop offset="0.52" stop-color="var(--tx-night-secondary)" stop-opacity="0.62"/><stop offset="1" stop-color="var(--tx-night-tertiary)" stop-opacity="0.5"/></linearGradient>
      <filter id="tx-night-soft" x="-24" y="-24" width="336" height="144" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="4"/></filter>
      <pattern id="tx-night-stars" width="288" height="96" patternUnits="userSpaceOnUse"><g fill="var(--tx-night-line)">${stars}</g><g stroke="var(--tx-night-sparkle)" stroke-linecap="round" stroke-opacity="0.7" stroke-width="0.6">${sparkles}</g></pattern>
      <pattern id="tx-night-glows" width="640" height="96" patternUnits="userSpaceOnUse"><rect width="640" height="96" fill="url(#tx-night-glow)"/></pattern>
    </defs>
    <rect width="100%" height="96" fill="url(#tx-night-sky)"/>
    <rect width="100%" height="96" fill="url(#tx-night-glows)"/>
    <rect width="100%" height="96" fill="url(#tx-night-stars)"/>
    ${clouds}
  </svg></div>`;
}

export { nightlySkyHtml };

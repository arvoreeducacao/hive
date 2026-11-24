const BADGE_MAX = 9;

function badgeText(count) {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  if (!n) return "";
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(n);
}

module.exports = { BADGE_MAX, badgeText };

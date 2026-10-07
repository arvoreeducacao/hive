const stamp = (t) => (typeof t === "number" ? t : Date.parse(t || "") || 0);

function tabOf(t) {
  return {
    id: t.id,
    url: t.url || "",
    title: t.title || "",
    takenOver: !!t.takenOver,
    stopRequested: !!t.stopRequested,
    lastUsedAt: t.lastUsedAt || null,
    createdAt: t.createdAt || null,
    steps: t.steps || 0
  };
}

export function seatsOfStatus(status) {
  const seats = {};
  const sessions = Array.isArray(status?.sessions) ? status.sessions : [];
  const tabs = Array.isArray(status?.tabs) ? status.tabs : [];
  const labelOf = new Map();
  for (const s of sessions) {
    if (s.endedAt) continue;
    const label = String(s.label || s.id || "");
    if (!label) continue;
    labelOf.set(s.id, label);
    seats[label] = { session: s.id, tabs: [], live: 0, held: 0 };
  }
  for (const t of tabs) {
    const label = labelOf.get(t.session) || (t.label ? String(t.label) : "");
    if (!label) continue;
    const seat = seats[label] || (seats[label] = { session: t.session, tabs: [], live: 0, held: 0 });
    seat.tabs.push(tabOf(t));
    if (t.takenOver) seat.held += 1;
    else seat.live += 1;
  }
  for (const seat of Object.values(seats)) seat.tabs.sort((a, b) => stamp(b.lastUsedAt) - stamp(a.lastUsedAt));
  return seats;
}

export function firstTabs(prevSeats, nextSeats) {
  const out = [];
  for (const [label, seat] of Object.entries(nextSeats || {})) {
    const before = prevSeats?.[label]?.tabs?.length || 0;
    if (!before && seat.tabs.length) out.push(label);
  }
  return out;
}

const CLEAN = /[^\p{L}\p{N} .,:;!?()/_'"-]/gu;

export function nameOfTab(tab) {
  let host = "";
  try { host = new URL(tab.url).host; } catch {}
  const title = String(tab.title || "").replace(CLEAN, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return [title, host].filter(Boolean).join(" · ") || String(tab.url || "").slice(0, 60);
}

export function takeoverMessages(prev, next, seatsKnown) {
  const before = seatsOfStatus(prev);
  const after = seatsOfStatus(next);
  const known = new Map((seatsKnown || []).map((s) => [s.name, s]));
  const out = [];
  for (const [label, seat] of Object.entries(after)) {
    if (!known.has(label)) continue;
    const was = new Map((before[label]?.tabs || []).map((t) => [t.id, t.takenOver]));
    for (const tab of seat.tabs) {
      if (!was.has(tab.id) || was.get(tab.id) === tab.takenOver) continue;
      const text = tab.takenOver
        ? `[hive] assumi a aba ${tab.id} (${nameOfTab(tab)}) no navegador — espera eu devolver antes de agir nela`
        : `[hive] devolvi a aba ${tab.id} — pode continuar`;
      const seatKnown = known.get(label);
      out.push({ seat: label, where: seatKnown.where, submit: seatKnown.state !== "needs", text });
    }
  }
  return out;
}

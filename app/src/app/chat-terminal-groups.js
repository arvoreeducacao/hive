const MAX_PER_GROUP = 4;

const SIDE_BY_SIDE = "row";
const STACKED = "column";

const groupIdOf = (name, used) => {
  const base = `group-${name}`;
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
};

function nextNumber(s) {
  const used = new Set(s.terminals.map((one) => one.n));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

const terminalNamed = (s, name) => s.terminals.find((one) => one.name === name) || null;

const groupHolding = (s, name) => s.groups.find((group) => group.names.includes(name)) || null;

function normalizeGroups(s) {
  const known = new Set(s.terminals.map((one) => one.name));
  const placed = new Set();
  const used = new Set();
  const groups = [];
  for (const group of s.groups) {
    const names = [];
    for (const name of group.names) {
      if (!known.has(name) || placed.has(name)) continue;
      placed.add(name);
      names.push(name);
    }
    if (!names.length) continue;
    const id = used.has(group.id) || !group.id ? groupIdOf(names[0], used) : (used.add(group.id), group.id);
    groups.push({ id, dir: group.dir === STACKED ? STACKED : SIDE_BY_SIDE, names });
  }
  for (const one of s.terminals) if (!placed.has(one.name)) groups.push({ id: groupIdOf(one.name, used), dir: SIDE_BY_SIDE, names: [one.name] });
  s.groups = groups;
  if (!known.has(s.active)) s.active = s.terminals[0]?.name || "";
  return s;
}

const activeGroup = (s) => groupHolding(s, s.active) || s.groups[0] || null;

const visibleNames = (s) => activeGroup(s)?.names || [];

const splitFull = (s) => visibleNames(s).length >= MAX_PER_GROUP;

function placeTerminal(s, entry, mode = "new", dir = SIDE_BY_SIDE) {
  normalizeGroups(s);
  const splitting = mode === "split" && s.terminals.length > 0;
  const target = splitting ? activeGroup(s) : null;
  if (target && target.names.length >= MAX_PER_GROUP) return false;
  s.terminals.push(entry);
  if (target) {
    const at = target.names.indexOf(s.active);
    target.names.splice(at < 0 ? target.names.length : at + 1, 0, entry.name);
    target.dir = dir === STACKED ? STACKED : SIDE_BY_SIDE;
  } else {
    s.groups.push({ id: groupIdOf(entry.name, new Set(s.groups.map((group) => group.id))), dir: SIDE_BY_SIDE, names: [entry.name] });
  }
  s.active = entry.name;
  return true;
}

function removeTerminal(s, name) {
  normalizeGroups(s);
  const at = s.terminals.findIndex((one) => one.name === name);
  if (at < 0) return false;
  const group = groupHolding(s, name);
  const inGroup = group ? group.names.indexOf(name) : -1;
  s.terminals.splice(at, 1);
  if (s.active === name) {
    const next = group?.names[inGroup + 1] || group?.names[inGroup - 1] || s.terminals[Math.min(at, s.terminals.length - 1)]?.name || "";
    s.active = next;
  }
  if (group) group.names = group.names.filter((one) => one !== name);
  normalizeGroups(s);
  return true;
}

function renameTerminal(s, from, to) {
  const one = terminalNamed(s, from);
  if (!one || from === to) return;
  one.name = to;
  for (const group of s.groups) group.names = group.names.map((name) => (name === from ? to : name));
  if (s.active === from) s.active = to;
}

function activateTerminal(s, name) {
  if (!terminalNamed(s, name) || s.active === name) return false;
  s.active = name;
  return true;
}

function groupWord(group) {
  if (!group || group.names.length < 2) return "Single";
  return group.dir === STACKED ? "Stacked" : "Side by side";
}

const groupHeadersShown = (s) => s.groups.length > 1 || s.groups.some((group) => group.names.length > 1);

export { MAX_PER_GROUP, SIDE_BY_SIDE, STACKED, activateTerminal, activeGroup, groupHeadersShown, groupWord, nextNumber, normalizeGroups, placeTerminal, removeTerminal, renameTerminal, splitFull, terminalNamed, visibleNames };

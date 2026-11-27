import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hostFolderOf } from "./host-folder.mjs";
import { sshTargetOf } from "./ssh-host.mjs";

export const HOST_CEILING = 24;

export function hostIdOf(text) {
  const read = sshTargetOf(text);
  if (!read.ok) return { ok: false, error: read.error };
  return { ok: true, id: read.port ? `${read.target}:${read.port}` : read.target, label: read.label };
}

function readBook(file) {
  try {
    if (!existsSync(file)) return { hosts: [], folders: {} };
    const held = JSON.parse(readFileSync(file, "utf8"));
    const folders = held?.folders && typeof held.folders === "object" && !Array.isArray(held.folders) ? held.folders : {};
    return { hosts: Array.isArray(held?.hosts) ? held.hosts : [], folders };
  } catch {
    return { hosts: [], folders: {} };
  }
}

function writeBook(file, hosts, folders) {
  mkdirSync(dirname(file), { recursive: true });
  const fresh = `${file}.new`;
  const kept = Object.keys(folders).length ? { hosts, folders } : { hosts };
  writeFileSync(fresh, `${JSON.stringify(kept, null, 2)}\n`, { mode: 0o600 });
  renameSync(fresh, file);
}

export function createHostBook({ file, seeds = [], now = () => Date.now(), ceiling = HOST_CEILING } = {}) {
  const seeded = [];
  for (const seed of seeds) {
    const read = hostIdOf(seed);
    if (read.ok && !seeded.some((one) => one.id === read.id)) seeded.push({ id: read.id, label: read.label, seed: true, addedAt: 0, usedAt: 0 });
  }

  function kept() {
    const seen = new Set(seeded.map((one) => one.id));
    const rows = [];
    for (const row of readBook(file).hosts) {
      const read = hostIdOf(row?.id);
      if (!read.ok || seen.has(read.id)) continue;
      seen.add(read.id);
      rows.push({ id: read.id, label: read.label, seed: false, addedAt: Number(row.addedAt) || 0, usedAt: Number(row.usedAt) || 0 });
    }
    return rows;
  }

  function folders() {
    const held = {};
    for (const [id, raw] of Object.entries(readBook(file).folders)) {
      const read = hostFolderOf(raw);
      if (read.ok && read.folder) held[id] = read.folder;
    }
    return held;
  }

  const save = (rows, held = folders()) => writeBook(file, rows.map(({ id, addedAt, usedAt }) => ({ id, addedAt, usedAt })), held);

  return {
    list() {
      const held = folders();
      return [...seeded, ...kept().sort((a, b) => b.usedAt - a.usedAt || b.addedAt - a.addedAt)].map((one) => ({ ...one, folder: held[one.id] || "" }));
    },

    folderOf(id) {
      return folders()[id] || "";
    },

    setFolder(id, raw) {
      if (!this.list().some((one) => one.id === id)) return { error: "this hive keeps no host by that name" };
      const read = hostFolderOf(raw);
      if (!read.ok) return { error: read.error };
      const held = folders();
      if (read.folder) held[id] = read.folder;
      else delete held[id];
      save(kept(), held);
      return { ok: true, folder: read.folder };
    },

    add(text) {
      const read = hostIdOf(text);
      if (!read.ok) return { error: read.error };
      const known = this.list().find((one) => one.id === read.id);
      if (known) return { ok: true, host: known, already: true };
      const rows = kept();
      if (rows.length >= ceiling) return { error: `this hive already keeps ${ceiling} hosts — forget one first` };
      const fresh = { id: read.id, label: read.label, seed: false, addedAt: now(), usedAt: now(), folder: "" };
      save([...rows, fresh]);
      return { ok: true, host: fresh };
    },

    touch(id) {
      const rows = kept();
      const row = rows.find((one) => one.id === id);
      if (!row) return false;
      row.usedAt = now();
      save(rows);
      return true;
    },

    forget(id) {
      if (seeded.some((one) => one.id === id)) return { error: "that host is written in the config as HIVE_SERVER_SSH — take the line out there" };
      const rows = kept();
      if (!rows.some((one) => one.id === id)) return { error: "this hive keeps no host by that name" };
      const held = folders();
      delete held[id];
      save(rows.filter((one) => one.id !== id), held);
      return { ok: true };
    }
  };
}

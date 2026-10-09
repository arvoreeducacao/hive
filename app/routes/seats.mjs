import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { forgetSpawnJobsOf, seatKey } from "../lib/fleet.mjs";
import { slug } from "../lib/naming.mjs";
import { raceCount, raceMissions } from "../lib/race.mjs";
import { readShot } from "../lib/shot.mjs";

export function worktreesToDrop(asked) {
  if (!Array.isArray(asked)) return [];
  return asked
    .map((one) => (typeof one === "string" ? { path: one } : one))
    .filter((one) => one && typeof one.path === "string" && one.path.startsWith("/"))
    .map((one) => ({ path: one.path, force: !!one.force }));
}

export const SELF_CLOSE_DELAY_MS = 1500;

export function registerSeatRoutes(on, context) {
  const {
    bodyOf,
    phoneBridgeFor,
    openJob,
    runJob,
    isSeatName,
    deliverSay,
    wakeAndWait,
    fleetTick,
    structuredSeat,
    typeText,
    deliverAnswer,
    saveFiles,
    bridgeFor,
    hiveHome,
    serverFor,
    openShell,
    spawning,
    invalidateFleetCache,
    renameSeat,
    regenerateSeatTitle,
    cloudReach,
    killSeatWindow,
    seatLeftovers,
    removeWorktree,
    readErrands = () => ({}),
    selfCloseDelay = SELF_CLOSE_DELAY_MS,
    historyClosedSeat,
    forgetSeat,
    forgetShots,
    archiveSeat,
    reviveArchivedSeat,
    archivedSeats,
    saveArchivedSeats,
    readFileImpl = readFile
  } = context;

  on("POST", "/api/spawn", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const prompt = String(b.prompt || "").trim();
    if (!slug(b.name) && !prompt) return json({ error: "write the mission or give it a name" }, 400);
    if (raceCount(b.count) > 1 && !prompt) return json({ error: "a race needs a mission — the chats have to be given the same thing to do" }, 400);
    const jobs = raceMissions(b).map((one) => {
      const job = openJob(one);
      runJob(job, one);
      return job;
    });
    const [first] = jobs;
    /* the name here is the one the job shows while it is being born: free of every seat
       and every other job this app knows, but not yet settled against the machine that
       will run it. The screen waits for the settled one before it points a tile at a seat. */
    if (jobs.length === 1) return json({ ok: true, id: first.id, name: first.name, settled: false }, 202);
    return json({ ok: true, id: first.id, name: first.name, settled: false, ids: jobs.map((job) => job.id), names: jobs.map((job) => job.name), race: jobs.length }, 202);
  });

  on("POST", "/api/say", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b.name || "");
    const text = String(b.text || "");
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    if (!text.trim()) return json({ error: "there is nothing to send" }, 400);
    const from = String(b.from || "");
    if (from) {
      if (!isSeatName(from)) return json({ error: "that is not a seat name" }, 400);
      if (from === name) return json({ error: "a seat does not talk to itself" }, 400);
      const said = await deliverSay(name, from, text);
      return said.ok ? json({ ok: true, delivered: true }) : json({ error: said.error }, 400);
    }
    const where = b.where === "cloud" ? "cloud" : "local";
    if (where === "cloud") {
      const woke = await wakeAndWait();
      if (!woke.ok) return json({ error: woke.error }, 503);
      if (woke.woke) await fleetTick();
    }
    if (structuredSeat(where, name)) {
      if (!b.push || where !== "local") return json({ ok: true, delivered: false });
      const bridge = bridgeFor();
      if (!bridge) return json({ error: "bridge.mjs not found" }, 500);
      const reply = await bridge.oneshot(join(hiveHome, "sock", `${name}.sock`), { type: "say", text });
      return reply?.ok === false ? json({ error: reply.error || "the seat did not take it" }, 400) : json({ ok: true, delivered: true });
    }
    await typeText(name, where, text, true);
    return json({ ok: true, delivered: true });
  });

  on("POST", "/api/answer", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b.name || "");
    const id = String(b.id || "");
    const answers = b.answers;
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    if (!id) return json({ error: "missing the question this answers" }, 400);
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || !Object.keys(answers).length) {
      return json({ error: "an answer needs at least one question filled in" }, 400);
    }
    const left = await deliverAnswer(name, id, answers);
    return left.ok ? json(left) : json({ error: left.error }, 400);
  });

  on("POST", "/api/show", async (req, res, url, json) => {
    const b = await bodyOf(req);
    if (b.oversized) return json({ error: "that is more than this door carries in one go" }, 413);
    const name = String(b.name || "");
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    const shot = readShot(b.image);
    if (shot.error) return json({ error: shot.error }, 400);
    const text = String(b.text || "").trim();
    const where = b.where === "cloud" ? "cloud" : "local";
    const { files, error } = await saveFiles([{ name: `phone.${shot.ext}`, data: b.image }], name);
    if (error || !files.length) return json({ error: error || "that picture did not land" }, 400);
    const said = [text, files[0]].filter(Boolean).join(" ");
    if (structuredSeat(where, name)) {
      const bridge = bridgeFor();
      if (!bridge) return json({ error: "bridge.mjs not found" }, 500);
      const reply = await bridge.oneshot(join(hiveHome, "sock", `${name}.sock`), { type: "say", text: said });
      return reply?.ok === false ? json({ error: reply.error || "the seat did not take it" }, 400) : json({ ok: true, delivered: true, path: files[0] });
    }
    await typeText(name, where, said, true);
    return json({ ok: true, delivered: true, path: files[0] });
  });

  on("POST", "/api/buzz", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const said = await phoneBridgeFor().buzz(String(b.seat || ""), String(b.text || ""));
    return said.ok ? json({ sent: 1 }) : json({ error: said.error || "the phone could not be buzzed" }, 409);
  });

  on("POST", "/api/shell", async (req, res, url, json) => {
    const b = await bodyOf(req);
    try { return json(await openShell(b)); }
    catch (e) { return json({ error: String(e.message || e) }, 400); }
  });

  on("POST", "/api/spawning/forget", async (req, res, url, json) => {
    const { id } = await bodyOf(req);
    spawning.delete(id);
    invalidateFleetCache();
    return json({ ok: true });
  });

  on("POST", "/api/rename", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    if (!name) return json({ error: "no seat to rename" }, 400);
    const where = b?.where === "cloud" ? "cloud" : "local";
    const title = renameSeat(name, where, b?.title);
    invalidateFleetCache();
    return json({ title });
  });

  on("POST", "/api/retitle", async (req, res, url, json) => {
    const b = await bodyOf(req);
    const name = String(b?.name || "").trim();
    if (!name || !isSeatName(name)) return json({ error: "no seat to retitle" }, 400);
    const where = b?.where === "cloud" ? "cloud" : "local";
    const said = await regenerateSeatTitle(name, where);
    invalidateFleetCache();
    return json(said, said.ok ? 200 : 404);
  });

  on("POST", "/api/attach", async (req, res, url, json) => {
    const b = await bodyOf(req);
    if (b.oversized) return json({ error: "that is more than this app carries in one go" }, 413);
    const { files, error } = await saveFiles(b.files || b.images || b.image, "mission");
    if (error || !files.length) return json({ error: error || "missing file" }, 400);
    return json({ ok: true, paths: files, path: files[0] });
  });

  on("POST", "/api/screenshot", async (req, res, url, json) => {
    const b = await bodyOf(req);
    if (b.oversized) return json({ error: "that is more than this app carries in one go" }, 413);
    const { name, where, image, images, attach } = b;
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    const { files, error } = await saveFiles(images || image, name);
    if (error || !files.length) return json({ error: error || "missing file" }, 400);
    if (where === "cloud") {
      const remote = [];
      for (const file of files) {
        const at = `/workspace/hive/assets/${file.split("/").pop()}`;
        const put = await cloudReach.putFile(at, await readFileImpl(file));
        if (put.error) return json({ error: put.error }, 502);
        remote.push(at);
      }
      if (!attach) await typeText(name, "cloud", remote.join(" "));
      return json({ ok: true, paths: remote, path: remote[0] });
    }
    if (!attach) await typeText(name, "local", files.join(" "));
    return json({ ok: true, paths: files, path: files[0] });
  });

  on("POST", "/api/seat/leftovers", async (req, res, url, json) => {
    const { name } = await bodyOf(req);
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    return json(await seatLeftovers(name));
  });

  on("POST", "/api/kill", async (req, res, url, json) => {
    const { name, where, dropWorktrees, by } = await bodyOf(req);
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    const closer = String(by || "");
    if (closer && !isSeatName(closer)) return json({ error: "that is not a seat name" }, 400);
    if (closer && closer !== name && readErrands(hiveHome)?.[name]?.by !== closer) {
      return json({ error: `${name} was not opened by ${closer} — a chat closes only itself and the chats it opened` }, 403);
    }
    const leaving = Boolean(closer) && closer === name;
    if (leaving) {
      json({ ok: true, leaving: true });
      await new Promise((later) => setTimeout(later, selfCloseDelay));
    }
    const reply = leaving ? () => {} : json;
    const said = await killSeatWindow(name, where);
    if (said?.ok === false) return reply({ error: said.error || `the seat would not close` }, 502);
    historyClosedSeat(where === "cloud" ? "cloud" : "local", name);
    forgetSeat(where === "cloud" ? "cloud" : "local", name);
    forgetSpawnJobsOf(spawning, name, where === "cloud" ? "cloud" : "local");
    if (where !== "cloud") await forgetShots(name);
    invalidateFleetCache();
    const worktrees = [];
    for (const asked of where === "cloud" ? [] : worktreesToDrop(dropWorktrees)) {
      const dropped = await removeWorktree(asked.path, asked.force);
      worktrees.push({ path: asked.path, ok: !dropped.error, error: dropped.error || "" });
    }
    if (!worktrees.length) return reply({ ok: true });
    return reply({ ok: true, worktrees });
  });

  on("POST", "/api/seat/archive", async (req, res, url, json) => {
    const { name, where } = await bodyOf(req);
    try { return json(await archiveSeat(name, where)); }
    catch (wrong) { return json({ error: String(wrong.message || wrong) }, 400); }
  });

  on("POST", "/api/seat/unarchive", async (req, res, url, json) => {
    const { name, where } = await bodyOf(req);
    try { return json(await reviveArchivedSeat(name, where)); }
    catch (wrong) { return json({ error: String(wrong.message || wrong) }, 400); }
  });

  on("POST", "/api/seat/forget-archived", async (req, res, url, json) => {
    const { name, where } = await bodyOf(req);
    if (!isSeatName(name)) return json({ error: "missing name" }, 400);
    if (archivedSeats.delete(seatKey(where === "cloud" ? "cloud" : "local", name))) saveArchivedSeats();
    if (where !== "cloud") await forgetShots(name);
    invalidateFleetCache();
    return json({ ok: true });
  });
}

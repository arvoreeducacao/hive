import {
  editGroup, groupCommitLine, imageFromDataUrl, isGroupId, newGroup, readGroupImage, readGroups, writeGroup, writeGroupImage,
  commentOnTask, dropSharedTask, editTask, isShared, isTaskId, linkSeat, newTask, noteTold, ownsTask, readLocalTasks,
  readSharedTasks, readTold, seatOfErrand, seatsToTell, seesTask, TASK_SHELF_DIR, taskCommitLine, taskLabel, taskMission,
  tasksOf, writeLocalTasks, writeSharedTask
} from "../lib/tasks.mjs";

export const TASKS_PULL_EVERY = 30000;
const NO_SHELF = /no shelf repo/;

export function registerTaskRoutes(on, context) {
  const {
    bodyOf, home, me, shelf, deliverSay = async () => ({ ok: true }), spawnSeat = async () => ({ error: "chats cannot be opened from here" }),
    liveSeats = () => [], readErrands = () => ({}), prsOf = () => [], now = Date.now,
    taskHooks = {}
  } = context;
  const readHook = taskHooks.read || (async () => {});
  const changedHook = taskHooks.changed || (async () => {});
  const announce = (change, task, before = null) => { Promise.resolve().then(() => changedHook({ change, task, before })).catch(() => {}); };
  let pulledAt = 0;
  let pullError = "";

  const pullNow = async (force = false) => {
    if (!force && now() - pulledAt < TASKS_PULL_EVERY) return { home: shelf.home() };
    const opened = await shelf.pull();
    pulledAt = now();
    pullError = opened.error || "";
    return opened;
  };

  const everyTask = () => ({ local: readLocalTasks(home), shared: readSharedTasks(shelf.home()) });

  const findTask = (id) => {
    const { local, shared } = everyTask();
    const mine = local.find((one) => one.id === id);
    if (mine) return { task: mine, where: "local" };
    const theirs = shared.find((one) => one.id === id);
    return theirs ? { task: theirs, where: "shelf" } : { error: "no task with that id — it may have been removed" };
  };

  const saveLocal = (task) => {
    const list = readLocalTasks(home).filter((one) => one.id !== task.id);
    writeLocalTasks(home, task ? list.concat([task]) : list);
  };

  const dropLocal = (id) => writeLocalTasks(home, readLocalTasks(home).filter((one) => one.id !== id));

  const personal = (one) => one.owner === me() && one.who === "me";

  const ownTasks = {
    list: () => readLocalTasks(home).filter(personal).map((one) => ({ ...one })),
    add: ({ text, done = false } = {}) => {
      const made = newTask({ text, owner: me(), who: "me", at: now() });
      if (made.error) return made;
      const task = done ? editTask(made.task, { done: true }, { me: me(), at: now() }).task : made.task;
      saveLocal(task);
      return { task };
    },
    edit: (id, change = {}) => {
      const held = readLocalTasks(home).find((one) => one.id === id && personal(one));
      if (!held) return { error: "no task with that id — it may have been removed" };
      const picked = {};
      if (change.text !== undefined) picked.text = change.text;
      if (change.done !== undefined) picked.done = change.done;
      const edited = editTask(held, picked, { me: me(), at: now() });
      if (edited.error) return edited;
      saveLocal(edited.task);
      return { task: edited.task };
    },
    remove: (id) => {
      const held = readLocalTasks(home).find((one) => one.id === id && personal(one));
      if (!held) return { error: "no task with that id — it may have been removed" };
      dropLocal(id);
      return { ok: true };
    }
  };

  const onShelf = (work, line) => shelf.turn(async () => {
    const opened = await shelf.pull();
    if (opened.error) return { error: "the team's tasks live in the shelf repo, and it is not reachable", why: opened.error };
    pulledAt = now();
    const done = await work(opened.home);
    if (done.error) return done;
    const sent = await shelf.push(line(done), [TASK_SHELF_DIR]);
    if (sent.error && !sent.committed) return { error: sent.error };
    return { ...done, pushed: !!sent.pushed, ...(sent.error ? { warning: sent.error } : {}) };
  });

  const store = async (before, after, what) => {
    if (!isShared(after)) {
      if (before && isShared(before)) {
        const dropped = await onShelf((shelfHome) => { dropSharedTask(shelfHome, before.id); return { task: after }; }, () => taskCommitLine(before, "back to one person"));
        if (dropped.error) return dropped;
      }
      saveLocal(after);
      return { task: after, pushed: false };
    }
    const sent = await onShelf((shelfHome) => {
      if (before && isShared(before)) {
        const fresh = readSharedTasks(shelfHome).find((one) => one.id === before.id);
        if (!fresh) return { error: "this task left the shelf while you were looking at it" };
      }
      writeSharedTask(shelfHome, after);
      return { task: after };
    }, () => taskCommitLine(after, what));
    if (sent.error) return sent;
    if (before && !isShared(before)) dropLocal(before.id);
    return sent;
  };

  const resolveSeats = (tasks) => {
    const errands = readErrands();
    return tasks.map((one) => {
      const seat = (one.errand ? seatOfErrand(errands, one.errand) : "") || one.seat;
      return { ...one, seat, prs: seat ? [...new Set(prsOf(seat) || [])] : [] };
    });
  };

  const tellMentions = async (tasks) => {
    const alive = liveSeats();
    if (!alive.length) return;
    const told = new Set(readTold(home));
    const fresh = [];
    for (const task of tasks) {
      for (const comment of task.comments || []) {
        if (told.has(comment.id)) continue;
        const seats = seatsToTell(task, comment, { alive, me: me() });
        if (!seats.length) continue;
        fresh.push(comment.id);
        for (const seat of seats) {
          await deliverSay(seat, comment.who || "someone", `on the task "${task.text}" (id ${task.id}): ${comment.text}`).catch(() => {});
        }
      }
    }
    if (fresh.length) noteTold(home, fresh);
  };

  on("GET", "/api/tasks", async (req, res, url, json) => {
    const who = me();
    if (!who) return json({ me: "", tasks: [], error: "this hive has no name for you yet — set HIVE_DEV before writing tasks" });
    const fresh = url.searchParams.get("fresh") === "1";
    if (fresh) await readHook({ tasks: ownTasks }).catch(() => {});
    const pulled = await pullNow(fresh);
    const { local, shared } = everyTask();
    const groups = readGroups(shelf.home());
    const tasks = resolveSeats(tasksOf({ local, shared, groups, me: who, now: now() }));
    tellMentions(tasks).catch(() => {});
    const missing = NO_SHELF.test(pulled.error || pullError);
    const shelfSays = missing ? "none" : pulled.error || pullError ? "offline" : "ok";
    return json({ me: who, tasks, groups, shelf: shelfSays, ...(pulled.error && !missing ? { warning: pulled.error } : {}) });
  });

  on("POST", "/api/tasks", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const made = newTask({ text: asked.text, owner: me(), who: asked.who, people: asked.people, group: asked.group, from: asked.from, at: now() });
    if (made.error) return json(made, 400);
    const kept = await store(null, made.task, "nova");
    if (kept.error) return json(kept, 502);
    announce("added", kept.task || made.task);
    return json({ ok: true, ...kept });
  });

  on("POST", "/api/tasks/edit", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isTaskId(asked.id)) return json({ error: "no task with that id — it may have been removed" }, 400);
    const found = findTask(asked.id);
    if (found.error) return json(found, 404);
    const edited = editTask(found.task, asked, { me: me(), at: now() });
    if (edited.error) return json(edited, 403);
    const what = asked.done === true ? "feita" : asked.done === false ? "reaberta" : asked.who !== undefined ? `agora de ${edited.task.who}` : "editada";
    const kept = await store(found.task, edited.task, what);
    if (kept.error) return json(kept, 502);
    announce("edited", kept.task || edited.task, found.task);
    return json({ ok: true, ...kept });
  });

  on("POST", "/api/tasks/remove", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isTaskId(asked.id)) return json({ error: "no task with that id — it may have been removed" }, 400);
    const found = findTask(asked.id);
    if (found.error) return json(found, 404);
    if (!ownsTask(found.task, me())) return json({ error: "only the person who wrote this task changes it — you can still comment" }, 403);
    if (!isShared(found.task)) { dropLocal(found.task.id); announce("removed", found.task); return json({ ok: true }); }
    const gone = await onShelf((shelfHome) => { dropSharedTask(shelfHome, found.task.id); return { task: found.task }; }, () => taskCommitLine(found.task, "removida"));
    if (gone.error) return json(gone, 502);
    announce("removed", found.task);
    return json({ ok: true, pushed: gone.pushed });
  });

  on("POST", "/api/tasks/comment", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isTaskId(asked.id)) return json({ error: "no task with that id — it may have been removed" }, 400);
    const found = findTask(asked.id);
    if (found.error) return json(found, 404);
    const who = me();
    if (!seesTask(found.task, who, readGroups(shelf.home()))) return json({ error: "this task is not shared with you" }, 403);
    const from = String(asked.from || "").trim().toLowerCase();
    const said = commentOnTask(found.task, { who: from || who, text: asked.text, agent: !!from, at: now() });
    if (said.error) return json(said, 400);
    const kept = isShared(found.task)
      ? await onShelf((shelfHome) => {
        const fresh = readSharedTasks(shelfHome).find((one) => one.id === found.task.id);
        if (!fresh) return { error: "this task left the shelf while you were looking at it" };
        const again = commentOnTask(fresh, { who: from || who, text: asked.text, agent: !!from, at: said.comment.at });
        writeSharedTask(shelfHome, again.task);
        return { task: again.task, comment: again.comment };
      }, (done) => taskCommitLine(done.task, "comentário"))
      : (saveLocal(said.task), { task: said.task, comment: said.comment });
    if (kept.error) return json(kept, 502);
    await tellMentions([kept.task]).catch(() => {});
    return json({ ok: true, ...kept });
  });

  on("POST", "/api/tasks/start", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isTaskId(asked.id)) return json({ error: "no task with that id — it may have been removed" }, 400);
    const found = findTask(asked.id);
    if (found.error) return json(found, 404);
    const who = me();
    if (!ownsTask(found.task, who)) return json({ error: "only the person who wrote this task changes it — you can still comment" }, 403);
    const errand = taskLabel(found.task);
    const born = await spawnSeat({ prompt: taskMission(found.task, { me: who }), errand, title: errand, where: asked.where === "cloud" ? "cloud" : "local", agent: asked.agent || "", structured: true });
    if (born.error) return json(born, 502);
    const linked = linkSeat(found.task, { seat: born.name, errand });
    if (linked.error) return json(linked, 500);
    const kept = await store(found.task, linked.task, `no chat ${born.name}`);
    if (kept.error) return json({ ...kept, seat: born.name }, 502);
    return json({ ok: true, seat: born.name, ...kept });
  });

  on("POST", "/api/tasks/assign", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isTaskId(asked.id)) return json({ error: "no task with that id — it may have been removed" }, 400);
    const found = findTask(asked.id);
    if (found.error) return json(found, 404);
    const who = me();
    if (!ownsTask(found.task, who)) return json({ error: "only the person who wrote this task changes it — you can still comment" }, 403);
    const seat = String(asked.seat || "").trim().toLowerCase();
    if (!liveSeats().includes(seat)) return json({ error: "that chat is not open on this machine" }, 400);
    const linked = linkSeat(found.task, { seat });
    if (linked.error) return json(linked, 400);
    const said = await deliverSay(seat, who, `${who} handed you a task from their list: ${taskMission(found.task, { me: who })}`);
    if (said?.error) return json({ error: said.error }, 502);
    const kept = await store(found.task, linked.task, `para o chat ${seat}`);
    if (kept.error) return json(kept, 502);
    return json({ ok: true, seat, ...kept });
  });

  on("GET", "/api/tasks/group-image", async (req, res, url, json) => {
    const id = url.searchParams.get("id") || "";
    if (!isGroupId(id)) return json({ error: "no group with that id — it may have been removed" }, 400);
    const group = readGroups(shelf.home()).find((one) => one.id === id);
    const image = readGroupImage(shelf.home(), group);
    if (!image) return json({ error: "this group has no picture" }, 404);
    res.writeHead(200, { "content-type": image.type, "cache-control": "no-cache", "content-length": image.bytes.length });
    res.end(image.bytes);
  });

  const saveGroup = (id, change, what, isNew = false) => onShelf((shelfHome) => {
    const groups = readGroups(shelfHome);
    let group = isNew ? change : groups.find((one) => one.id === id);
    if (!isNew) {
      const edited = editGroup(group, change, { me: me() });
      if (edited.error) return edited;
      group = edited.group;
    }
    if (change.imageData) {
      const image = imageFromDataUrl(change.imageData);
      if (image.error) return image;
      group = { ...group, image: writeGroupImage(shelfHome, group.id, image) };
    }
    const saved = Object.fromEntries(Object.entries(group).filter(([key]) => key !== "imageData"));
    writeGroup(shelfHome, saved);
    return { group: saved };
  }, (done) => groupCommitLine(done.group, what));

  on("POST", "/api/tasks/groups", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    const made = newGroup({ name: asked.name, icon: asked.icon, colour: asked.colour, members: asked.members, by: me(), at: now() });
    if (made.error) return json(made, 400);
    if (asked.imageData) {
      const checked = imageFromDataUrl(asked.imageData);
      if (checked.error) return json(checked, 400);
    }
    const kept = await saveGroup(made.group.id, { ...made.group, imageData: asked.imageData }, "novo", true);
    if (kept.error) return json(kept, 502);
    return json({ ok: true, ...kept });
  });

  on("POST", "/api/tasks/groups/edit", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isGroupId(asked.id)) return json({ error: "no group with that id — it may have been removed" }, 400);
    const change = {};
    for (const key of ["name", "icon", "colour", "members", "image", "imageData"]) if (asked[key] !== undefined) change[key] = asked[key];
    const kept = await saveGroup(asked.id, change, "editado");
    if (kept.error) return json(kept, /only people/.test(kept.error) ? 403 : 502);
    return json({ ok: true, ...kept });
  });
}

import { join } from "node:path";
import { Device } from "../../server/sync/device.mjs";
import { createRunner } from "../../server/sync/runner.mjs";
import { fileStore } from "../../server/sync/store.mjs";
import { oneshot } from "../../server/bridge.mjs";

export const PHONE_DIR = "phone";
export const TICK_MS = 5000;

export const syncHostOf = (url) => `${String(url || "").replace(/\/+$/, "")}/sync`;

export function createPhoneBridge({
  home,
  identity,
  door,
  seats,
  profile = () => null,
  enabled = async () => true,
  machineName = () => "mac",
  say = null,
  spawn = null,
  answer = null,
  draftOf = () => null,
  keepDraft = () => {},
  log = () => {},
  fetchImpl = globalThis.fetch
} = {}) {
  let device = null;
  let runner = null;
  let enrolling = null;
  let lastWhy = "";

  const complain = (why) => {
    if (why === lastWhy) return;
    lastWhy = why;
    if (why) log(why);
  };

  async function ensureDevice() {
    const found = await door();
    if (!found?.url) { complain("phone: no server to hand the chats to yet"); return null; }
    const host = syncHostOf(found.url);
    if (device?.host === host && device.person) return device;
    if (enrolling) return enrolling;
    enrolling = (async () => {
      try {
        const fresh = await Device.fromIdentity({
          name: machineName(),
          secret: identity.secret,
          publicSsh: identity.publicSsh,
          store: fileStore(join(home, PHONE_DIR)),
          fetchImpl,
          lean: true
        });
        await fresh.enroll(host, { kind: "mac" });
        device = fresh;
        complain("");
        log(`phone: this machine is enrolled at ${host} as ${fresh.fingerprint}`);
        return fresh;
      } catch (wrong) {
        complain(`phone: could not enroll this machine at ${host} — ${wrong.message}`);
        return null;
      } finally {
        enrolling = null;
      }
    })();
    return enrolling;
  }

  async function ensureRunner() {
    const mine = await ensureDevice();
    if (!mine) return null;
    if (runner?.running && runner.device === mine) return runner;
    runner?.stop();
    const made = createRunner({
      device: mine,
      base: home,
      seats,
      profile,
      say: say || ((seat, cmd) => oneshot(join(home, "sock", `${seat}.sock`), cmd)),
      spawn,
      answer,
      draftOf,
      keepDraft,
      log
    });
    made.device = mine;
    runner = made;
    try {
      await made.start();
    } catch (wrong) {
      complain(`phone: the chats are not reaching the phone — ${wrong.message}`);
      made.stop();
      if (runner === made) runner = null;
      return null;
    }
    return made;
  }

  return {
    get device() { return device; },
    get runner() { return runner; },

    async tick() {
      if (!(await enabled())) {
        if (runner) { runner.stop(); runner = null; log("phone: the phone switch is off, the chats stop travelling"); }
        return { running: false };
      }
      const made = await ensureRunner();
      return { running: !!made?.running, following: made?.following || [] };
    },

    async openCode(options = {}) {
      const mine = await ensureDevice();
      if (!mine) return { error: lastWhy || "no server to pair the phone with" };
      try { return await mine.openCode(options); } catch (wrong) { return { error: wrong.message }; }
    },

    async devices() {
      const mine = await ensureDevice();
      if (!mine) return { error: lastWhy || "no server answered for the phones", devices: [] };
      try {
        const said = await mine.call("GET", "/roster");
        return { devices: (said.devices || []).filter((one) => one.kind === "phone" && !one.revokedAt) };
      } catch (wrong) { return { error: wrong.message, devices: [] }; }
    },

    async revoke(fingerprint) {
      const mine = await ensureDevice();
      if (!mine) return { error: lastWhy || "no server answered for the phones" };
      try { return await mine.call("POST", "/roster/revoke", { fingerprint: String(fingerprint || "") }); } catch (wrong) { return { error: wrong.message }; }
    },

    async sendDraft(seat, text, at = Date.now()) {
      if (!runner?.running || !device?.seats.has(seat)) return { ok: false, error: "that chat is not on the hive yet" };
      try {
        await device.putDraft(seat, text, at);
        return { ok: true };
      } catch (wrong) { return { ok: false, error: wrong.message }; }
    },

    async buzz(seat, text) {
      if (!runner?.following.includes(seat)) return { ok: false, error: "that chat is not travelling to the phone from this machine" };
      try {
        await device.write(seat, { type: "buzz", text: String(text || "").slice(0, 200) });
        return { ok: true };
      } catch (wrong) { return { ok: false, error: wrong.message }; }
    },

    state() {
      return { enrolled: !!device?.person, host: device?.host || "", running: !!runner?.running, following: runner?.following || [], why: lastWhy };
    },

    stop() {
      runner?.stop();
      runner = null;
    }
  };
}

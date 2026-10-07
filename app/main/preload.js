const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();
const page = globalThis.crypto?.randomUUID?.() || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
let nextId = 0;

const tell = (channel, hook) => ipcRenderer.on(channel, (_event, id, payload, from) => {
  if (from !== page) return;
  const heard = listeners.get(id);
  if (heard) heard[hook]?.(payload);
});

tell("hive:open", "open");
tell("hive:data", "data");
tell("hive:close", "close");
tell("hive:error", "error");

contextBridge.exposeInMainWorld("seatBrowser", {
  emulate: (wcId, params) => ipcRenderer.invoke("seat-browser:emulate", wcId, params),
  profile: (arg) => ipcRenderer.invoke("seat-browser:profile", arg),
  cookies: (arg) => ipcRenderer.invoke("seat-browser:cookies", arg),
  setCookie: (arg) => ipcRenderer.invoke("seat-browser:setcookie", arg),
  input: (wcId, act) => ipcRenderer.invoke("seat-browser:input", wcId, act),
  network: (wcId) => ipcRenderer.invoke("seat-browser:network", wcId),
  upload: (wcId, files) => ipcRenderer.invoke("seat-browser:upload", wcId, files),
  openExternal: (url) => ipcRenderer.invoke("seat-browser:external", url),
  onPopup: (heard) => ipcRenderer.on("seat-browser:popup", (_event, wcId, url) => heard(wcId, url))
});

/* the cursor as the screen knows it. a window only hears pointermove over itself, so a face that
   should follow you into somebody else's window has to be told from out here. */
contextBridge.exposeInMainWorld("hiveGaze", {
  watch: (on) => ipcRenderer.send("hive:gaze", !!on),
  hear: (heard) => ipcRenderer.on("hive:gaze-at", (_event, point) => heard(point))
});

contextBridge.exposeInMainWorld("hiveAway", {
  hear: (heard) => ipcRenderer.on("hive:away", (_event, away) => heard(!!away))
});

contextBridge.exposeInMainWorld("hiveSystemSound", {
  arm: () => ipcRenderer.invoke("hive:system-sound")
});

contextBridge.exposeInMainWorld("hiveMicrophone", {
  ask: () => ipcRenderer.invoke("hive:microphone")
});

contextBridge.exposeInMainWorld("hiveWindow", {
  act: (act) => ipcRenderer.send("hive:window", String(act)),
  placeButtons: (at) => ipcRenderer.send("hive:window-buttons", at),
  readingAlone: (on) => ipcRenderer.send("hive:reading-alone", !!on),
  onLeaveReading: (heard) => ipcRenderer.on("hive:leave-reading", () => heard())
});

contextBridge.exposeInMainWorld("hiveSeatWindow", {
  detach: (name) => ipcRenderer.send("hive:detach", name),
  close: (name) => ipcRenderer.send("hive:seat-close", name),
  giveBack: (name) => ipcRenderer.send("hive:seat-give-back", name),
  onBack: (heard) => ipcRenderer.on("hive:seat-back", (_event, name) => heard(name))
});

contextBridge.exposeInMainWorld("hiveLink", {
  open(path, heard) {
    const id = ++nextId;
    listeners.set(id, heard);
    ipcRenderer.send("hive:open", id, path, page);
    return {
      send: (text) => ipcRenderer.send("hive:send", id, text, page),
      close: () => { listeners.delete(id); ipcRenderer.send("hive:close", id, page); }
    };
  }
});

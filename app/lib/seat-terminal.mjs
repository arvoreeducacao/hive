import { WebSocket } from "ws";

export const RESIZE_MARK = "\x01";

export function paintedForTerminal(text) {
  return `${String(text || "").replace(/\r?\n/g, "\r\n")}\r\n`;
}

export function resizeAsked(text) {
  if (String(text || "")[0] !== RESIZE_MARK) return null;
  try {
    const { c, r } = JSON.parse(String(text).slice(1));
    return c > 0 && r > 0 ? { cols: c, rows: r } : null;
  } catch {
    return null;
  }
}

export function bridgeTerminal(ws, url, { open = (at) => new WebSocket(at), reconnectKey = "", red = (say) => `\r\n\x1b[31m${say}\x1b[0m\r\n` } = {}) {
  let live;
  try {
    live = open(url);
  } catch (wrong) {
    if (ws.readyState === 1) ws.send(red(`could not reach the server: ${wrong?.message || wrong}`));
    ws.close();
    return null;
  }
  live.binaryType = "nodebuffer";

  const toSeat = (say) => { if (ws.readyState === 1) ws.send(say); };

  live.on("message", (data, isBinary) => {
    if (isBinary) return toSeat(data.toString("utf8"));
    let frame = null;
    try { frame = JSON.parse(data.toString()); } catch { return; }
    if (frame.t === "open" && frame.painted) toSeat(paintedForTerminal(frame.painted));
    if (frame.t === "end") {
      if (frame.why) toSeat(red(frame.why));
      ws.close();
    }
  });

  live.on("error", (wrong) => {
    toSeat(red(`the server dropped the terminal: ${wrong?.message || wrong}`));
    ws.close();
  });

  live.on("close", () => {
    toSeat(`\r\n\x1b[2m─ disconnected · reconnecting${reconnectKey ? ` · ${reconnectKey} forces it` : ""} ─\x1b[0m\r\n`);
    ws.close();
  });

  ws.on("message", (raw) => {
    if (live.readyState !== 1) return;
    const text = raw.toString();
    const size = resizeAsked(text);
    if (size) return live.send(JSON.stringify({ t: "r", ...size }));
    if (text[0] === RESIZE_MARK) return;
    live.send(JSON.stringify({ t: "i", d: text }));
  });

  ws.on("close", () => { try { live.close(); } catch {} });

  return live;
}

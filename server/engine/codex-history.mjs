import { sayEvent } from "./protocol.mjs";
import { newThreadContext, translate } from "./codex-app-server.mjs";

export function hasConversationEvents(text) {
  return String(text || "").split("\n").some((line) => {
    try {
      const event = JSON.parse(line);
      return (event.type === "user" || event.type === "assistant") && !!event.message;
    } catch { return false; }
  });
}

export function replayCodexThread(thread) {
  const events = [];
  for (const turn of thread?.turns || []) {
    const ctx = newThreadContext();
    for (const item of turn.items || []) {
      if (item.type === "userMessage") {
        const text = (item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
        const images = (item.content || []).filter((part) => part.type === "localImage").map((part) => part.path);
        if (text || images.length) events.push(sayEvent(text, images));
      } else {
        events.push(...translate({ method: "item/completed", params: { item } }, ctx, thread.id));
      }
    }
  }
  if (!events.length) return [];
  const tail = events.slice(-400);
  return [
    { type: "driver", subtype: "replayed", count: tail.length, total: events.length, replayed: true },
    ...tail.map((event) => ({ ...event, replayed: true })),
  ];
}

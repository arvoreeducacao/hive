import { readFileSync } from "node:fs";

export function loadTransferContext(store) {
  const transfer = store?.meta.provider_context;
  if (!transfer?.path || transfer.delivered) return "";
  if (store.transferContextText === undefined) store.transferContextText = readFileSync(transfer.path, "utf8");
  return store.transferContextText;
}

export function transferText(text, store) {
  const transfer = store.meta.provider_context;
  if (!transfer?.path || transfer.delivered) return text;
  store.transferInFlight = true;
  const context = loadTransferContext(store);
  return `${context}\n\nCurrent user message:\n${text}`;
}

export function transferResult(event, store) {
  if (event.type !== "result" || event.is_error || event.subtype === "interrupted" || !store?.transferInFlight || !store?.meta.provider_context || store.meta.provider_context.delivered) return;
  store.persist({ provider_context: { ...store.meta.provider_context, delivered: true } });
}

export function transferEvent(event, store) {
  const prefix = store?.transferContextText ? `${store.transferContextText}\n\nCurrent user message:\n` : "";
  if (event.type !== "user" || !prefix || !event.message) return event;
  const visible = (text) => typeof text === "string" && text.startsWith(prefix) ? text.slice(prefix.length) : text;
  const content = event.message.content;
  return { ...event, message: { ...event.message, content: Array.isArray(content)
    ? content.map((part) => part.type === "text" ? { ...part, text: visible(part.text) } : part)
    : visible(content) } };
}

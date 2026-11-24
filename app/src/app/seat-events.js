const listeners = [];

function onSeatEvent(listener) {
  listeners.push(listener);
}

function seatEventSeen(e, ev) {
  for (const listener of listeners) listener(e, ev);
}

export { onSeatEvent, seatEventSeen };

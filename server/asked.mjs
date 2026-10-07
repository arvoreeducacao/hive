export const ASK_WAIT_MS = 8000;
export const BIRTH_WAIT_MS = 120000;
export const BIRTH_REPLY_MS = 2000;

export const onItsWay = (ms) =>
  new Promise((give) => {
    const timer = setTimeout(() => give({ id: "", name: "" }), ms);
    timer.unref?.();
  });
export const SHOT_CEILING = 700000;

export function createAsked({ waitMs = ASK_WAIT_MS, what = "picture" } = {}) {
  const waiting = new Map();
  let seq = 0;

  function settle(id, said) {
    const held = waiting.get(id);
    if (!held) return false;
    waiting.delete(id);
    clearTimeout(held.timer);
    held.hand(said);
    return true;
  }

  return {
    get pending() { return waiting.size; },

    open() {
      const id = `${what}-${++seq}`;
      let hand = () => {};
      const answer = new Promise((give) => { hand = give; });
      const timer = setTimeout(() => settle(id, { error: `the machine that runs this seat did not answer for the ${what}` }), waitMs);
      waiting.set(id, { hand, timer });
      return { id, answer };
    },

    settle,

    stop() {
      for (const id of [...waiting.keys()]) settle(id, { error: "this server is going down" });
    }
  };
}

export function machineOfSeat(rows, seat) {
  for (const row of rows || []) {
    const seats = Array.isArray(row?.panel?.seats) ? row.panel.seats : [];
    if (seats.some((one) => one?.name === seat)) return row.fingerprint || "";
  }
  return "";
}

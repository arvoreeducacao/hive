import { AsyncLocalStorage } from "node:async_hooks";

export function createReachContext({ defaultHost = () => "", knows = () => false, hostOfSeat = () => null } = {}) {
  const held = new AsyncLocalStorage();
  const settled = (asked) => (typeof asked === "string" && knows(asked) ? asked : null);
  const ofSeat = (name, where) => (where !== "local" && typeof name === "string" && name ? settled(hostOfSeat(name)) : null);

  return {
    run(host, work) {
      return held.run({ host: settled(host) }, work);
    },

    runForAsk(params, work) {
      const named = params?.get?.("host");
      const host = (named === null || named === undefined ? null : settled(named)) ?? ofSeat(params?.get?.("name") || params?.get?.("seat"), params?.get?.("where"));
      return held.run({ host }, work);
    },

    learn(body) {
      const store = held.getStore();
      if (!store || store.host !== null || !body || typeof body !== "object") return;
      store.host = settled(body.host) ?? ofSeat(body.name || body.seat, body.where);
    },

    current() {
      const store = held.getStore();
      return store && store.host !== null ? store.host : defaultHost();
    }
  };
}

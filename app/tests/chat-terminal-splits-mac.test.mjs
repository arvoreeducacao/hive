import "./dom.mjs";

Object.defineProperty(globalThis.navigator, "platform", { value: "MacIntel", configurable: true });

const { IS_MAC } = await import("../src/app/core.js");
if (!IS_MAC) throw new Error("the Mac run of the drawer split tests did not get a Mac");

await import("./chat-terminal-splits.test.mjs");

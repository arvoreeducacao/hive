import { createSignal } from "solid-js";

const worn = () => !!globalThis.document?.body?.classList.contains("experience-raycast");

const nextWorn = () => !!globalThis.document?.body?.classList.contains("experience-next");

const [raycast, setRaycast] = createSignal(worn());

const [nextHive, setNextHive] = createSignal(nextWorn());

globalThis.document?.addEventListener("hive:experience", () => { setRaycast(worn()); setNextHive(nextWorn()); });

export { nextHive, raycast };

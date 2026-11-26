import { createSignal } from "solid-js";

const worn = () => !!globalThis.document?.body?.classList.contains("experience-raycast");

const [raycast, setRaycast] = createSignal(worn());

globalThis.document?.addEventListener("hive:experience", () => setRaycast(worn()));

export { raycast };

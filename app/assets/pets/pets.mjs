import { TAMAGOTCHI_ID, mountTamagotchi } from "./tamagotchi.mjs";

export const PET_ID = TAMAGOTCHI_ID;

const MOOD_ORDER = ["needs", "answered", "working", "stalled", "done", "ready", "idle"];

const STYLE = `
#pet { position: absolute; left: 0; bottom: 0; z-index: 30; width: var(--rail-w); min-height: 138px; box-sizing: border-box; display: flex; justify-content: center; align-items: flex-end; padding: 28px 0 12px; pointer-events: none; background: linear-gradient(180deg, transparent, var(--panel) 36px); }
#pet button { all: unset; cursor: pointer; pointer-events: auto; line-height: 0; border-radius: 8px; }
#pet button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
body.pet-on #rail { padding-bottom: 110px; }
#shell.rail-min #pet { display: none; }
body.pet-on #shell.rail-min #rail { padding-bottom: 14px; }
@media (max-width: 860px) { #pet { display: none; } body.pet-on #rail { padding-bottom: 14px; } }
`;

export function moodOf(sessions) {
  const alive = (sessions || []).map((s) => s && s.state).filter((state) => MOOD_ORDER.includes(state));
  if (!alive.length) return "idle";
  return MOOD_ORDER.find((mood) => alive.includes(mood)) || "idle";
}

export function mountPet(host, options = {}) {
  const doc = options.document || (host && host.ownerDocument) || document;
  const store = options.store || (doc.defaultView && doc.defaultView.localStorage);

  const style = doc.createElement("style");
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const nest = doc.createElement("div");
  nest.id = "pet";
  host.appendChild(nest);
  doc.body.classList.add("pet-on");

  let mood = "idle";
  const blob = mountTamagotchi(nest, {
    document: doc,
    store,
    face: options.face,
    seed: options.seed,
    reducedMotion: options.reducedMotion,
    reach: options.reach,
    farPointer: options.farPointer
  });

  return {
    setSessions(sessions) {
      const next = moodOf(sessions);
      if (next === mood) return;
      mood = next;
      blob.setMood(mood);
    },
    moodNow: () => mood,
    petNow: () => PET_ID,
    toast: () => blob.toast(),
    refreshMotion: () => blob.refreshMotion(),
    wave: () => blob.wave(),
    destroy() {
      blob.destroy();
      doc.body.classList.remove("pet-on");
      nest.remove();
      style.remove();
    }
  };
}

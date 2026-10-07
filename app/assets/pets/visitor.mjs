import { avatarFor, isAvatar } from "../avatar/avatar.mjs";
import { mountPlayer } from "../avatar/avatar-play.mjs";
import { phrase } from "../i18n.mjs";

/* a teammate at the foot of your rail, waving. it is a visit, not a resident: the face walks
   in beside the little you, says one word, and is gone on its own — nothing to answer and
   nothing to dismiss. the face is the one your rail already deals them; the only thing that
   travelled is that they came over. */
export const VISIT_ID = "visit";

export const VISIT_HOLD_MS = 4200;

export const VISIT_WALK_MS = 420;

export const VISIT_PLAY = "wave";

export const VISIT_LINE = "hi!";

const FACE_PX = 64;

const STYLE = `
#visit { position: absolute; left: 0; bottom: 0; z-index: 31; width: var(--rail-w); min-height: 138px; box-sizing: border-box; display: flex; justify-content: flex-start; align-items: flex-end; padding: 28px 0 12px 8px; pointer-events: none; }
#visit .visit-guest { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0; transform: translate(-44px, 26px); transition: transform ${VISIT_WALK_MS}ms cubic-bezier(.2, .9, .3, 1.15), opacity 300ms ease; }
#visit.in .visit-guest { opacity: 1; transform: translate(0, 0); }
#visit.off .visit-guest { opacity: 0; transform: translate(-44px, 26px); transition: transform ${VISIT_WALK_MS}ms cubic-bezier(.6, -.15, .8, .6), opacity 280ms ease; }
#visit .visit-face { width: ${FACE_PX}px; height: ${FACE_PX}px; }
#visit .visit-face svg { display: block; width: 100%; height: 100%; overflow: visible; }
#visit.in.waving .visit-face { animation: visit-hop 520ms ease-in-out 3; }
@keyframes visit-hop { 0%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-7px) rotate(-6deg); } 60% { transform: translateY(0) rotate(5deg); } }
#visit .visit-say { position: relative; padding: 5px 9px; border-radius: 9px; background: var(--panel-2, #1f1f24); border: 1px solid var(--line, #2a2a2f); color: var(--txt, #e8e6e1); font-size: 11.5px; line-height: 1.3; white-space: nowrap; }
#visit .visit-say::after { content: ""; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-top-color: var(--panel-2, #1f1f24); border-bottom: 0; }
#visit .visit-who { max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: var(--txt-3, #8b8b93); }
#shell.rail-min #visit { display: none; }
@media (max-width: 860px) { #visit { display: none; } }
@media (prefers-reduced-motion: reduce) { #visit .visit-guest { transition: none; } }
body.no-motion #visit .visit-guest { transition: none; }
`;

export function mountVisitor(host, options = {}) {
  const doc = options.document || (host && host.ownerDocument) || document;
  const win = doc.defaultView;
  const asked = options.reducedMotion;
  const still = () => (typeof asked === "function" ? asked() : asked)
    || (win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const paper = options.paper
    || (win && win.getComputedStyle && win.getComputedStyle(doc.body).getPropertyValue("--panel").trim())
    || "#131313";
  const from = String(options.from || "");
  const spec = isAvatar(options.face) ? options.face : avatarFor(from);

  const style = doc.createElement("style");
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const strip = doc.createElement("div");
  strip.id = VISIT_ID;
  const guest = doc.createElement("div");
  guest.className = "visit-guest";
  guest.setAttribute("role", "status");
  guest.setAttribute("aria-label", phrase("{who} says hi", { who: from }));
  const bubble = doc.createElement("div");
  bubble.className = "visit-say";
  bubble.setAttribute("aria-hidden", "true");
  bubble.textContent = phrase(VISIT_LINE);
  const face = doc.createElement("div");
  face.className = "visit-face";
  face.setAttribute("aria-hidden", "true");
  const who = doc.createElement("div");
  who.className = "visit-who";
  who.setAttribute("aria-hidden", "true");
  who.textContent = from;
  guest.append(bubble, face, who);
  strip.appendChild(guest);
  host.appendChild(strip);

  const drawn = String(options.svg || "");
  if (drawn) face.innerHTML = drawn;
  const player = drawn ? null : mountPlayer(face, spec, { salt: `visit-${from}`, paper });
  player?.paint();

  let gone = false;
  let leaveTimer = null;
  let dropTimer = null;

  const drop = () => {
    if (gone) return;
    gone = true;
    player?.stop();
    strip.remove();
    style.remove();
  };

  const leave = () => {
    if (gone) return;
    strip.classList.add("off");
    dropTimer = win.setTimeout(drop, still() ? 0 : VISIT_WALK_MS);
  };

  /* the class lands one frame after the strip does, or the walk in is a cut: the transition
     needs a painted "before" to leave from. calm mode skips the wave and keeps the face still —
     the bubble is the message there, and text does not move. */
  win.requestAnimationFrame(() => {
    if (gone) return;
    strip.classList.add("in");
    if (still()) return;
    if (player) player.play(VISIT_PLAY);
    else strip.classList.add("waving");
  });
  leaveTimer = win.setTimeout(leave, options.hold || VISIT_HOLD_MS);

  return {
    from,
    destroy() {
      win.clearTimeout(leaveTimer);
      win.clearTimeout(dropTimer);
      drop();
    }
  };
}

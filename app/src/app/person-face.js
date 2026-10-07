import { blobatar } from "blobatar/blob";
import { happy, scared, sleepy, surprised, thinking, unsure, wink } from "blobatar/expression";

/* blobatar draws inside a 100-unit frame with a wide margin; the tighter box lets the body fill the
   slot, and the svg keeps overflow visible for the rare silhouette that reaches past it */
const FRAME = 'viewBox="10 10 80 80"';

const EXPRESSIONS = { happy, scared, sleepy, surprised, thinking, unsure, wink };

const drawn = new Map();

function personFace(name, expression = "") {
  const who = String(name || "");
  const key = `${who}\n${expression}`;
  if (!drawn.has(key)) {
    const pose = EXPRESSIONS[expression];
    const svg = blobatar(who || "hive", { title: who || undefined, ...(pose ? { expression: pose } : {}) });
    drawn.set(key, svg.replace('viewBox="0 0 100 100"', FRAME));
  }
  return drawn.get(key);
}

export { EXPRESSIONS, personFace };

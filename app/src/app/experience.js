import { saveConfig } from "./brand-face.js";
import { phrase } from "./core.js";
import { createExperienceBehaviors } from "./experience-behaviors.js";
import { createExperienceController } from "./experience-controller.js";

const storage = (() => { try { return localStorage; } catch { return null; } })();
const experience = createExperienceController({ document, location, history, save: saveConfig, say: phrase, storage, loadIcons: () => import("/assets/pixel-icons.mjs").then(module => module.PIXEL_ICONS) });
const behaviors = createExperienceBehaviors({ document, save: saveConfig });
export const adoptExperience = result => { experience.adopt(result); behaviors.adopt(result); };
export const paintExperience = () => experience.paint();
export const behaviorOn = name => behaviors.behaviorOn(name);

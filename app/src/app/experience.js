import { saveConfig } from "./brand-face.js";
import { createExperienceBehaviors } from "./experience-behaviors.js";

const behaviors = createExperienceBehaviors({ document, save: saveConfig });
export const adoptExperience = result => behaviors.adopt(result);

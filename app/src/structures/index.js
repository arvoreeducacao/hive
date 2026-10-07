import { atmosphere } from "./atmosphere.js";
import { cockpit } from "./cockpit.js";
import { ember } from "./ember.js";
import { inbox } from "./inbox.js";
import { island } from "./island.js";
import { launcher } from "./launcher.js";
import { map } from "./map.js";
import { stage } from "./stage.js";

const STRUCTURE_DEFAULT = "classic";

const STRUCTURES = [
  { id: "classic", name: "Classic", says: "the bar, the rail and the wall of seats, as it was", module: null },
  { id: "launcher", name: "Launcher", says: "one centred window where everything starts by typing — one seat to read, the rest as rows by what they ask of you", module: launcher },
  { id: "inbox", name: "Inbox", says: "every seat is a row in a queue ordered by who needs you — one conversation at a time, in a reading column", module: inbox },
  { id: "atmosphere", name: "Atmosphere", says: "the seats as glass windows over a full-screen atmosphere, each as big as it matters", module: atmosphere },
  { id: "cockpit", name: "Cockpit", says: "a tmux grid of panes split by hairlines — six seats in view and a status line at the foot", module: cockpit },
  { id: "stage", name: "Stage", says: "one seat takes the stage, the others become live thumbnails stacked by block", module: stage },
  { id: "map", name: "Map", says: "the whole fleet on one field, grouped by project — the colour of the ring says the state", module: map },
  { id: "ember", name: "Ember", says: "one seat as a reading page on the left, the rest as warm cards queued by urgency", module: ember },
  { id: "island", name: "Island", says: "the screen is one conversation — the rest of the fleet fits in a black pill at the top", module: island }
];

const STRUCTURE_IDS = STRUCTURES.map((one) => one.id);

const structureOf = (id) => STRUCTURES.find((one) => one.id === id) || STRUCTURES[0];

export { STRUCTURES, STRUCTURE_DEFAULT, STRUCTURE_IDS, structureOf };

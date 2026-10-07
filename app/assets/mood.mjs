/* what a session feels like from outside, in one word.

   six, and no more: the mug at the top is 20px, and only a handful of the engine's fifteen
   plays read at that size without the body dissolving into a mark.

   every mood here is a fact the server already holds — state machine, driver, tmux. no model
   is ever asked: the AI moods (and the helper CLI that fed them) were removed with the
   simplificar-contexto-chats mission.

   none of this travels. a summary describes; a mood judges — "this chat is thrashing" is an
   opinion about somebody's work, and a face in the team rail is the last place it belongs.
   the boundary is kept in team.mjs, which publishes an allowlist, and locked by the test in
   avatar-play.test.mjs. */

export const MOODS = ["sleepy", "focused", "stuck", "thrashing", "blocked", "won"];

/* focused was `thinking` — three dots where the body used to be. it is also the mood a fleet is
   in most of the day, and it is the one allowed to stay, so the face was replaced by a typing
   indicator nearly all the time. the play a mood wears has to keep the body, or the mood cannot
   be worn for long; what erases the face — alert, exclaim, burst, sleep — may only ever flash. */
export const MOOD_PLAY = {
  sleepy: "sleep",
  focused: "wide",
  stuck: "alert",
  thrashing: "exclaim",
  blocked: "notify",
  won: "burst"
};

/* the moods allowed to stay on the face instead of flashing and handing it back.

   the rule is not "nothing stays", it is "nothing that erases the face stays". these are
   exactly the moods whose play carries `keepBody`: the face is still there under a ring or a
   pair of wide eyes. the others put a mark where the body was, and a mark you cannot leave on
   screen is a mark you flash. the test in avatar-play.test.mjs checks this set against the
   engine rather than trusting the list. */
export const STAYS = new Set(["focused", "blocked"]);

/* the layer under the plays. a play lasts two seconds and then hands the face back; between two
   of them the face still has to be alive, and the cheapest true thing it can say is how fast it
   is breathing. this one is never a flash — it is on all day, and it never touches the body. */
export const MOOD_BREATH = {
  sleepy: "7s",
  focused: "2.8s",
  stuck: "3.4s",
  thrashing: "1.9s",
  blocked: "3.2s",
  won: "3.6s"
};

export function moodOf({ state, finish } = {}) {
  if (state === "needs") return "blocked";
  if (finish && (finish.error || finish.denials > 0)) return "thrashing";
  if (state === "stalled") return "stuck";
  if (state === "done") return "won";
  if (state === "working") return "focused";
  return "sleepy";
}

/* one face, many seats: the worst news wins, because that is the one you would want to be
   turned around for. a fleet with nothing in it is asleep, not focused. */
const RANK = ["thrashing", "blocked", "stuck", "won", "focused", "sleepy"];

export function fleetMood(moods) {
  let best = RANK.length - 1;
  for (const mood of moods || []) {
    const at = RANK.indexOf(mood);
    if (at >= 0 && at < best) best = at;
  }
  return RANK[best];
}

export const playOfMood = (mood) => MOOD_PLAY[mood] || "idle";

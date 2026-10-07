import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";

function Side(props) {
  return (
    <div class="side" onClick={() => props.actions.side(props.card.key)}>
      <div class="t-head">
        <div class="t-ident"><div class="t-name">{props.side.title}</div><div class="t-sub">{props.side.name}</div></div>
        <span class="t-tags"><span class="t-owner"><span class="team-av face av-alive" innerHTML={props.side.face}></span>{props.side.dev}</span></span>
      </div>
      <div class="t-state">
        <span class="t-pill"><svg class="gl" style={{ color: props.side.colour }} aria-hidden="true"><use href={`#${props.side.glyph}`} /></svg><span class="label">{props.side.label}</span></span>
        <span class="when">{props.side.when}</span>
        <span class="t-where"><span class={`c ${props.side.where}`}><svg aria-hidden="true"><use href={`#i-${props.side.where}`} /></svg>{props.side.whereSaid}</span></span>
      </div>
      <Show when={props.side.model}><div class="t-chips"><span class="c kind">{props.side.model}</span></div></Show>
      <p class="summary" classList={{ empty: props.side.blank }}>{props.side.summary}</p>
    </div>
  );
}

function KbBar(props) {
  return (
    <div class="kb-bar" classList={{ mine: props.bar.mine }}>
      <span class="team-av face av-alive" innerHTML={props.bar.face}></span>
      <b>{props.bar.who}</b>
      <span class="say">{props.bar.say}</span>
      <Show when={props.bar.act}>{(act) => (
        <button
          class="ask"
          classList={{ quiet: act().quiet }}
          data-give={act().give}
          data-knock={act().knock}
          attr:disabled={act().off ? "" : undefined}
          onClick={() => props.actions.keyboard(act())}
        >{act().label}</button>
      )}</Show>
    </div>
  );
}

function Talk(props) {
  return (
    <div class="mirror-talk">
      <Show when={props.talk.turns.length} fallback={<div class="quiet">{props.talk.nothing}</div>}>
        <For each={props.talk.turns}>{(turn) => (
          <div class="turn md" classList={{ you: turn.you }} innerHTML={turn.html} ref={(el) => props.actions.wireTalk(props.talk.chat, el)}></div>
        )}</For>
      </Show>
    </div>
  );
}

function Composer(props) {
  let box;
  const say = () => props.actions.say(props.card.dev, props.card.name, box);
  return (
    <form class="mirror-send" data-say={props.card.name} onSubmit={(ev) => { ev.preventDefault(); say(); }}>
      <textarea
        ref={box}
        rows="1"
        placeholder={props.card.composer.placeholder}
        onKeyDown={(ev) => {
          if (ev.key !== "Enter" || ev.shiftKey) return;
          ev.preventDefault();
          say();
        }}
      ></textarea>
      <button type="submit">{props.card.composer.send}</button>
    </form>
  );
}

function Card(props) {
  return (
    <article
      class="tile mirror"
      classList={{ lent: props.card.mine, open: props.card.shown }}
      data-key={props.card.key}
      data-state={props.card.state}
      style={{ "--tone": props.card.tone }}
    >
      <Side side={props.card.side} card={props.card} actions={props.actions} />
      <Show when={props.card.shown}><div class="well structured"></div></Show>
      <KbBar bar={props.card.kb} actions={props.actions} />
      <Show when={props.card.talk}>{(talk) => <Talk talk={talk()} actions={props.actions} />}</Show>
      <Show when={props.card.composer}><Composer card={props.card} actions={props.actions} /></Show>
    </article>
  );
}

function Empty(props) {
  return (
    <Show when={props.empty.said}>
      <div class="empty">
        <Show when={props.empty.dev}><b>{props.empty.dev}</b>{" "}</Show>
        {props.empty.said}
      </div>
    </Show>
  );
}

function Mirror(props) {
  return (
    <Show when={props.model.empty} fallback={<For each={props.model.cards}>{(card) => <Card card={card} actions={props.actions} />}</For>}>
      {(empty) => <Empty empty={empty()} />}
    </Show>
  );
}

export function mountMirror(host, actions) {
  return mountView(host, Mirror, { empty: null, cards: [] }, { actions });
}

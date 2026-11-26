import { For, Show, createEffect, on, onCleanup, onMount } from "solid-js";
import { mountView } from "./view.jsx";

function Chip(props) {
  const chip = () => props.chip;
  return (
    <button
      type="button"
      class="a-chip"
      classList={{ lifting: chip().lifting, swap: chip().swap, at: chip().at }}
      draggable="true"
      data-key={chip().seat}
      data-i={chip().i}
      data-j={chip().j}
      data-state={chip().state}
      title={chip().title}
      on:click={(ev) => props.actions.chipClick(ev, chip().seat, chip().i, chip().j)}
      on:dragstart={(ev) => props.actions.chipDragStart(ev, chip().seat)}
      on:dragend={() => props.actions.chipDragEnd()}
    >
      <span class="st"><i style={{ background: chip().color }}></i>{chip().label}</span>
      <span class="nm">{chip().name}</span>
      <Show when={chip().errand}><span class="er">{chip().errand}</span></Show>
    </button>
  );
}

function Slot(props) {
  const slot = () => props.slot;
  return (
    <button
      type="button"
      class="a-slot"
      classList={{ hot: slot().hot, at: slot().at }}
      data-i={slot().i}
      data-j={slot().j}
      on:click={(ev) => ev.stopPropagation()}
    >{slot().text}</button>
  );
}

function Card(props) {
  const card = () => props.card;
  return (
    <div
      class="a-card"
      classList={{ here: card().here, full: card().full, taking: card().taking }}
      data-i={card().i}
      on:dragover={(ev) => props.actions.laneDragOver(ev, card().i)}
      on:dragleave={(ev) => props.actions.laneDragLeave(ev, card().i)}
      on:drop={(ev) => props.actions.laneDrop(ev, card().i)}
    >
      <div class="a-top"><i>{card().n}</i><span class="name">{card().name}</span><em>{card().count}</em></div>
      <div class="a-grid">
        <For each={card().cells}>{(cell) => (
          <Show when={cell.seat} fallback={<Slot slot={cell} />}>
            <Chip chip={cell} actions={props.actions} />
          </Show>
        )}</For>
      </div>
      <div class="a-note">{card().note}</div>
    </div>
  );
}

function SpaceInner(props) {
  const inner = () => props.inner;
  return (
    <>
      <div class="surface"><div class="grid"></div>
        <div class="fl-blocks">
          <For each={inner().cards}>{(card) => <Card card={card} actions={props.actions} />}</For>
          <Show when={inner().room}>{(room) => (
            <button
              type="button"
              class="a-new"
              classList={{ hot: room().hot, at: room().at }}
              data-w={props.w}
              on:click={(ev) => props.actions.newClick(ev)}
              on:dragover={(ev) => props.actions.newDragOver(ev)}
              on:drop={(ev) => props.actions.newDrop(ev)}
            ><span class="plus">+</span><span class="t">{room().say}</span></button>
          )}</Show>
        </div>
      </div>
      <div class="tag" data-w={props.w}><span class="swatch"></span>
        <input
          class="fl-name"
          data-w={props.w}
          value={inner().name}
          placeholder={inner().placeholder}
          spellcheck="false"
          aria-label={inner().nameLabel}
          on:click={(ev) => ev.stopPropagation()}
          on:keydown={(ev) => {
            ev.stopPropagation();
            if (ev.key === "Enter") ev.currentTarget.blur();
            if (ev.key === "Escape") { ev.currentTarget.value = props.actions.nameOf(props.w); ev.currentTarget.blur(); }
          }}
          on:change={(ev) => props.actions.nameChange(props.w, ev.currentTarget.value)}
          on:blur={(ev) => props.actions.nameBlur(props.w, ev.currentTarget.value)}
        />
        <span class="seats">{inner().seats}</span>
        <button
          type="button"
          class="fl-more-btn"
          data-w={props.w}
          title={inner().moreLabel}
          aria-label={inner().moreLabel}
          on:click={(ev) => props.actions.moreClick(ev, props.w)}
        >×</button>
      </div>
    </>
  );
}

function FreshInner(props) {
  return (
    <>
      <div class="surface"><div class="grid"></div>
        <div class="fl-empty"><span class="plus">+</span><span class="t">{props.inner.title}</span>
          <span class="s">{props.inner.say}</span></div>
      </div>
      <div class="tag" data-w=""><span class="swatch"></span>{props.inner.title}</div>
    </>
  );
}

function Floor(props) {
  const floor = () => props.floor;
  return (
    <section
      class="floor"
      classList={{ fresh: floor().fresh, here: floor().here, climbing: floor().climbing }}
      data-w={floor().w}
      data-d={floor().d}
      style={{ "--wtint": floor().tint, transform: floor().transform, opacity: floor().opacity, "pointer-events": floor().pointer }}
      on:click={(ev) => props.actions.floorClick(ev, floor().w)}
      on:contextmenu={(ev) => props.actions.floorMenu(ev, floor().w)}
      on:dragover={(ev) => props.actions.floorDragOver(ev, floor().w)}
      on:dragleave={(ev) => props.actions.floorDragLeave(ev, floor().w)}
      on:drop={(ev) => props.actions.floorDrop(ev, floor().w)}
    >
      <Show when={floor().inner}>
        <Show when={floor().w} fallback={<FreshInner inner={floor().inner} />}>
          <SpaceInner inner={floor().inner} w={floor().w} actions={props.actions} />
        </Show>
      </Show>
    </section>
  );
}

function ArrangeDeck(props) {
  const deck = () => props.model;
  const host = props.host;
  const scrim = (ev) => { if (ev.target === host) props.actions.close(); };
  onMount(() => host.addEventListener("mousedown", scrim));
  onCleanup(() => host.removeEventListener("mousedown", scrim));
  createEffect(on(() => [deck().on, deck().rise], ([shown]) => {
    host.classList.remove("up");
    host.hidden = !shown;
    if (!shown) return;
    void host.offsetWidth;
    host.classList.add("up");
  }));
  return (
    <Show when={deck().floors.length}>
      <div class="glow"></div>
      <div class="scene" on:wheel={{ handleEvent: (ev) => props.actions.wheel(ev), passive: false }}>
        <div class="deck">
          <For each={deck().floors}>{(floor) => <Floor floor={floor} actions={props.actions} />}</For>
        </div>
      </div>
      <div class="fl-more" hidden={!deck().moreShown}>{deck().more}</div>
      <div class="fl-foot">
        <span class="say">{deck().say.lead}<em>{deck().say.em}</em>{deck().say.rest}</span>
        <span class="keys">
          <span><kbd>shift</kbd><kbd>↑</kbd><kbd>↓</kbd>{` ${deck().keys.floor}`}</span>
          <span><kbd>←</kbd><kbd>→</kbd>{` ${deck().keys.seat}`}</span>
          <span><kbd>space</kbd>{` ${deck().keys.pickUp}`}</span>
          <span><kbd>esc</kbd>{` ${deck().keys.close}`}</span>
        </span>
      </div>
    </Show>
  );
}

const DECK_SHUT = { key: "arrange", on: false, rise: 0, floors: [], more: "", moreShown: false, say: { lead: "", em: "", rest: "" }, keys: { floor: "", seat: "", pickUp: "", close: "" } };

export function mountArrangeDeck(host, actions) {
  return mountView(host, ArrangeDeck, DECK_SHUT, { actions, host });
}

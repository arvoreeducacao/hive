import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";

function Seat(props) {
  return (
    <div class="item" classList={{ here: props.seat.here, naming: props.seat.naming }} data-name={props.seat.name} data-state={props.seat.state} title={props.seat.hint}>
      <svg style={{ color: props.seat.colour }} aria-hidden="true"><use href={`#${props.seat.glyph}`} /></svg>
      <span class="name">{props.seat.naming ? "" : props.seat.title}</span>
      <span class="rtail">
        <Show when={props.seat.live}>
          <span class="rlive" title={props.seat.liveTitle}><svg aria-hidden="true"><use href="#i-clock" /></svg>{props.seat.live}</span>
        </Show>
        <span class="n">{props.seat.tag}</span>
      </span>
    </div>
  );
}

function Group(props) {
  return (
    <>
      <div class="group-title"><svg aria-hidden="true"><use href={`#${props.group.icon}`} /></svg><span>{props.group.label}</span><b>{props.group.count}</b></div>
      <Show when={!props.group.items.length}><div class="rail-empty">{props.group.emptyLabel}</div></Show>
      <For each={props.group.items}>{(seat) => <Seat seat={seat} />}</For>
    </>
  );
}

function Parked(props) {
  return (
    <>
      <div class="group-title parked" data-arch-toggle>
        <svg classList={{ caret: true, shut: !props.parked.open }} aria-hidden="true"><use href="#i-chev" /></svg>
        <span>{props.parked.label}</span><b>{props.parked.count}</b>
      </div>
      <For each={props.parked.shown}>{(one) => (
        <div class="item parked" classList={{ busy: one.busy }} data-arch={one.name} data-where={one.where} title={one.hint}>
          <span class="dot-off"></span>
          <span class="name">{one.title}</span>
          <span class="when">{one.when}</span>
          <span class="revive">{one.action}</span>
        </div>
      )}</For>
      <Show when={props.parked.more}><div class="rail-more" data-arch-all role="button">{props.parked.more}</div></Show>
    </>
  );
}

function Snoozed(props) {
  return (
    <>
      <div class="group-title parked" data-hidden-toggle>
        <svg classList={{ caret: true, shut: !props.snoozed.open }} aria-hidden="true"><use href="#i-chev" /></svg>
        <span>{props.snoozed.label}</span><b>{props.snoozed.count}</b>
      </div>
      <For each={props.snoozed.shown}>{(one) => (
        <div class="item parked snoozed" data-name={one.name} data-state={one.state} title={one.hint}>
          <span class="dot-off"></span>
          <span class="name">{one.title}</span>
          <span class="revive">{one.action}</span>
        </div>
      )}</For>
    </>
  );
}

function RailNow(props) {
  return (
    <>
      <For each={props.rail.groups}>{(group) => <Group group={group} />}</For>
      <Show when={props.rail.snoozed}>{(snoozed) => <Snoozed snoozed={snoozed()} />}</Show>
      <Show when={props.rail.parked}>{(parked) => <Parked parked={parked()} />}</Show>
      <Show when={props.rail.note}><div class="rail-more parked-note">{props.rail.note}</div></Show>
    </>
  );
}

export function Found(props) {
  return (
    <>
      {props.parts.pre}
      <Show when={props.parts.hit}><mark class="hl">{props.parts.hit}</mark></Show>
      {props.parts.post}
    </>
  );
}

function RaycastSeat(props) {
  return (
    <div
      class="item"
      classList={{ sel: props.seat.sel, cursor: props.seat.cursor, naming: props.seat.naming }}
      tabindex="-1"
      data-name={props.seat.name}
      data-state={props.seat.state}
      data-said={props.seat.said}
      title={props.seat.hint}
    >
      <i class={`rc-dot ${props.seat.state}`} aria-hidden="true"></i>
      <span class="name">{props.seat.naming ? "" : <Found parts={props.seat.parts} />}</span>
      <Show when={props.seat.away}><span class="away" aria-hidden="true">↗</span></Show>
      <span class="meta" classList={{ t: props.seat.tone === "t", need: props.seat.tone === "need" }}>{props.seat.meta}</span>
      <span class="hint">{props.seat.open}<Show when={props.seat.openKey}><span class="rc-key">{props.seat.openKey}</span></Show></span>
    </div>
  );
}

function RaycastGroup(props) {
  return (
    <div class="rail-blk" classList={{ cur: props.group.here }}>
      <div class="group-title" data-i={props.group.i >= 0 ? props.group.i : undefined}>
        <span>{props.group.label}</span>
        <Show when={props.group.here}><span class="on-screen">{props.group.hereSaid}</span></Show>
        <Show when={props.group.keys} fallback={<b>{props.group.items.length}</b>}><span class="rc-key">{props.group.keys}</span></Show>
      </div>
      <For each={props.group.items}>{(seat) => <RaycastSeat seat={seat} />}</For>
    </div>
  );
}

function RaycastHead(props) {
  return (
    <div class="rail-head">
      <Show
        when={props.rail.searching}
        fallback={
          <>
            <div class="rail-seg" role="group" aria-label={props.rail.showsSaid}>
              <For each={props.rail.shows}>{(one) => (
                <button type="button" data-show={one.key} aria-pressed={one.on ? "true" : "false"}>{one.label}<b>{one.count}</b></button>
              )}</For>
            </div>
            <button type="button" class="rail-ico" data-rail-search title={props.rail.searchHint} aria-label={props.rail.searchHint}><svg aria-hidden="true"><use href="#i-mag" /></svg></button>
          </>
        }
      >
        <label class="rail-q">
          <svg aria-hidden="true"><use href="#i-mag" /></svg>
          <input id="rail-q" type="text" spellcheck={false} autocomplete="off" value={props.rail.query} placeholder={props.rail.searchSaid} aria-label={props.rail.searchSaid} />
          <span class="rc-key">esc</span>
        </label>
      </Show>
    </div>
  );
}

function RaycastParked(props) {
  return (
    <div class="rail-arch">
      <div class="group-title parked" data-arch-toggle tabindex="-1" role="button" aria-expanded={props.parked.open ? "true" : "false"}>
        <svg classList={{ caret: true, shut: !props.parked.open }} aria-hidden="true"><use href="#i-chev" /></svg>
        <span>{props.parked.label}</span><b>{props.parked.count}</b>
      </div>
      <For each={props.parked.shown}>{(one) => (
        <div class="item parked" classList={{ busy: one.busy }} tabindex="-1" data-arch={one.name} data-where={one.where} title={one.hint}>
          <i class="rc-dot idle" aria-hidden="true"></i>
          <span class="name"><Found parts={one.parts} /></span>
          <span class="meta">{one.when}</span>
          <span class="hint">{one.action}<Show when={!one.busy}><span class="rc-key">↵</span></Show></span>
        </div>
      )}</For>
      <Show when={props.parked.more}><div class="rail-more" data-arch-all role="button">{props.parked.more}</div></Show>
    </div>
  );
}

function RaycastSnoozed(props) {
  return (
    <div class="rail-arch">
      <div class="group-title parked" data-hidden-toggle tabindex="-1" role="button" aria-expanded={props.snoozed.open ? "true" : "false"}>
        <svg classList={{ caret: true, shut: !props.snoozed.open }} aria-hidden="true"><use href="#i-chev" /></svg>
        <span>{props.snoozed.label}</span><b>{props.snoozed.count}</b>
      </div>
      <For each={props.snoozed.shown}>{(one) => (
        <div class="item parked snoozed" tabindex="-1" data-name={one.name} data-state={one.state} title={one.hint}>
          <i class={`rc-dot ${one.state}`} aria-hidden="true"></i>
          <span class="name">{one.title}</span>
          <span class="hint">{one.action}<span class="rc-key">↵</span></span>
        </div>
      )}</For>
    </div>
  );
}

function RaycastRail(props) {
  return (
    <>
      <RaycastHead rail={props.rail} />
      <Show when={props.rail.found}>
        <div class="rail-found"><span>{props.rail.found}</span><span class="go">{props.rail.openSaid}<span class="rc-key">↵</span></span></div>
      </Show>
      <Show when={props.rail.loading}>
        <div class="rail-blk">
          <div class="group-title"><span>{props.rail.loading}</span></div>
          <For each={[150, 110, 132]}>{(width) => <div class="rail-skel"><i></i><i style={{ width: `${width}px` }}></i></div>}</For>
        </div>
      </Show>
      <For each={props.rail.groups}>{(group) => <RaycastGroup group={group} />}</For>
      <Show when={props.rail.empty}>{(empty) => (
        <div class="rail-empty">
          <span class="ic"><svg aria-hidden="true"><use href={`#${empty().icon}`} /></svg></span>
          <span class="said">{empty().said}</span>
          <span class="act">{empty().act}<span class="rc-key">{empty().key}</span></span>
        </div>
      )}</Show>
      <Show when={props.rail.snoozed}>{(snoozed) => <RaycastSnoozed snoozed={snoozed()} />}</Show>
      <Show when={props.rail.parked}>{(parked) => <RaycastParked parked={parked()} />}</Show>
      <Show when={props.rail.note}><div class="rail-more parked-note">{props.rail.note}</div></Show>
    </>
  );
}

function Rail(props) {
  return <Show when={props.rail.raycast} fallback={<RailNow rail={props.rail} />}><RaycastRail rail={props.rail} /></Show>;
}

export function mountRail(host) {
  const [rail, setRail] = createStore({ groups: [], snoozed: null, parked: null, note: "" });
  host.textContent = "";
  host.dataset.rail = "solid";
  const dispose = render(() => <Rail rail={rail} />, host);
  return {
    show(model) { setRail(reconcile(model, { key: "key" })); },
    dispose() { dispose(); delete host.dataset.rail; }
  };
}

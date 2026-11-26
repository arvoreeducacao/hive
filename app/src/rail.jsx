import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";

function Seat(props) {
  return (
    <div class="item" classList={{ here: props.seat.here, naming: props.seat.naming, anon: props.seat.anon }} data-name={props.seat.name} data-state={props.seat.state} title={props.seat.hint}>
      <svg style={{ color: props.seat.colour }} aria-hidden="true"><use href={`#${props.seat.glyph}`} /></svg>
      <span class="name" classList={{ "title-regenerating": !!props.seat.regenerating }} aria-busy={props.seat.regenerating ? "true" : undefined}>{props.seat.naming ? "" : props.seat.title}</span>
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
          <Show when={!one.busy}>
            <button type="button" class="revive-ic" tabindex="-1" title={one.revive} aria-label={one.revive}><svg aria-hidden="true"><use href="#i-reply" /></svg></button>
          </Show>
        </div>
      )}</For>
      <Show when={props.parked.more}><div class="rail-more" data-arch-more role="button" tabindex="-1">{props.parked.more}</div></Show>
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
          <Show when={one.why}><span class="when">{one.why}</span></Show>
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
      classList={{ sel: props.seat.sel, cursor: props.seat.cursor, naming: props.seat.naming, off: !!props.seat.why, quiet: !!props.seat.quiet, picked: !!props.seat.picked }}
      aria-selected={props.seat.picked ? "true" : undefined}
      tabindex="-1"
      data-name={props.seat.name}
      data-state={props.seat.state}
      data-said={props.seat.said}
      title={props.seat.hint}
    >
      <i class={`rc-dot ${props.seat.state}`} role="img" aria-label={props.seat.said}></i>
      <Show
        when={props.seat.why}
        fallback={<span class="name" classList={{ "title-regenerating": !!props.seat.regenerating }} aria-busy={props.seat.regenerating ? "true" : undefined}>{props.seat.naming ? "" : <Found parts={props.seat.parts} />}</span>}
      >
        <span class="col">
          <span class="name" classList={{ "title-regenerating": !!props.seat.regenerating }} aria-busy={props.seat.regenerating ? "true" : undefined}>{props.seat.naming ? "" : <Found parts={props.seat.parts} />}</span>
          <span class="why"><Show when={props.seat.whyParts} fallback={props.seat.why}>{(parts) => <Found parts={parts()} />}</Show></span>
        </span>
      </Show>
      <Show when={props.seat.away}><span class="away" aria-hidden="true">↗</span></Show>
      <Show when={props.seat.pinned}>
        <button type="button" class="rpin" data-unpin={props.seat.name} title={props.seat.pinSay} aria-label={props.seat.pinSay}>
          <svg class="on" aria-hidden="true"><use href="#i-pin" /></svg><svg class="off" aria-hidden="true"><use href="#i-unpin" /></svg>
        </button>
      </Show>
      <Show when={props.seat.draft}>
        <button type="button" class="rdraft" data-discard={props.seat.name} title={props.seat.draftSay} aria-label={props.seat.draftSay}>
          <svg class="on" aria-hidden="true"><use href="#i-pen" /></svg><svg class="off" aria-hidden="true"><use href="#i-x" /></svg>
        </button>
      </Show>
      <Show when={props.seat.term}>{(term) => (
        <button type="button" class="rterm" data-terminal-of={props.seat.name} title={term().say} aria-label={term().say}>
          <svg aria-hidden="true"><use href="#i-term" /></svg>
        </button>
      )}</Show>
      <Show when={props.seat.pr}>{(pr) => (
        <button type="button" class={`rpr pr-${pr().state}`} data-pr-url={pr().url} data-of={props.seat.name} title={pr().list}>
          <svg aria-hidden="true"><use href="#i-pr" /></svg>{pr().say}
        </button>
      )}</Show>
      <Show when={props.seat.tag}>{(tag) => <span class={`rtag ${tag().tone}`}>{tag().say}</span>}</Show>
      <Show when={props.seat.meta}><span class="meta">{props.seat.meta}</span></Show>
      <Show when={props.seat.act}>{(act) => (
        <button type="button" class="ract" data-shelf-act={act().act} data-of={props.seat.name} title={act().say} aria-label={act().say}>
          <svg aria-hidden="true"><use href={`#${act().icon}`} /></svg>
        </button>
      )}</Show>
      <Show when={props.seat.kids}>{(kids) => (
        <>
          <Show when={kids().dots.length}>
            <span class="rkids-sum" title={kids().sumSaid} aria-label={kids().sumSaid}>
              <For each={kids().dots}>{(state) => <i class={`rc-dot ${state}`} aria-hidden="true"></i>}</For>
            </span>
          </Show>
          <button type="button" class="rkids-toggle" data-kids-toggle={props.seat.name} aria-expanded={kids().open ? "true" : "false"} title={kids().toggleSay} aria-label={kids().toggleSay}>
            <svg classList={{ caret: true, shut: !kids().open }} aria-hidden="true"><use href="#i-chev" /></svg>
          </button>
        </>
      )}</Show>
    </div>
  );
}

function RaycastSeatTree(props) {
  return (
    <>
      <RaycastSeat seat={props.seat} />
      <Show when={props.seat.kids?.open}>
        <div class="rail-kids" role="group" aria-label={props.seat.kids.groupSaid}>
          <For each={props.seat.kids.items}>{(kid) => <RaycastSeatTree seat={kid} />}</For>
          <Show when={props.seat.kids.settled}>{(done) => (
            <>
              <div class="rail-more rail-kids-done" data-kids-done={props.seat.name} role="button" tabindex="-1" aria-expanded={done().open ? "true" : "false"}>
                <svg classList={{ caret: true, shut: !done().open }} aria-hidden="true"><use href="#i-chev" /></svg>{done().say}
              </div>
              <For each={done().items}>{(one) => <RaycastSeat seat={one} />}</For>
            </>
          )}</Show>
        </div>
      </Show>
    </>
  );
}

function RaycastGroup(props) {
  return (
    <div class="rail-blk" classList={{ cur: props.group.here }} data-to={props.group.to >= 0 ? props.group.to : undefined}>
      <Show
        when={props.group.fold}
        fallback={
          <div class="group-title" data-i={props.group.i >= 0 ? props.group.i : undefined}>
            <span>{props.group.label}</span>
            <Show when={props.group.keys} fallback={<b>{props.group.items.length}</b>}><span class="rc-key">{props.group.keys}</span></Show>
          </div>
        }
      >
        {(fold) => (
          <div
            class="group-title parked"
            classList={{ shelf: !!props.group.shelf, folder: !!props.group.folder }}
            data-hidden-toggle={props.group.shelf || props.group.folder ? undefined : ""}
            data-shelf={props.group.shelf || undefined}
            data-folder={props.group.folder || undefined}
            tabindex="-1"
            role="button"
            aria-expanded={fold().open ? "true" : "false"}
          >
            <svg classList={{ caret: true, shut: !fold().open }} aria-hidden="true"><use href="#i-chev" /></svg>
            <span>{props.group.label}</span>
            <Show when={fold().needs}><i class="fold-needs" aria-label={props.group.needsSaid} /></Show>
            <b>{fold().count}</b>
          </div>
        )}
      </Show>
      <For each={props.group.items}>{(seat) => <RaycastSeatTree seat={seat} />}</For>
      <Show when={props.group.more}><div class="rail-more" data-shelf-more role="button" tabindex="-1">{props.group.more}</div></Show>
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
                <button type="button" data-show={one.key} aria-pressed={one.on ? "true" : "false"} title={one.hint}>{one.label}</button>
              )}</For>
            </div>
            <button type="button" class="rail-ico" data-rail-search title={props.rail.searchHint} aria-label={props.rail.searchHint}><svg aria-hidden="true"><use href="#i-mag" /></svg></button>
            <button type="button" class="rail-new" data-rail-new title={props.rail.newHint} aria-label={props.rail.newSaid}><svg aria-hidden="true"><use href="#i-pen" /></svg><span class="lb">{props.rail.newSaid}</span><kbd>{props.rail.newKey}</kbd></button>
          </>
        }
      >
        <label class="rail-q">
          <svg aria-hidden="true"><use href="#i-mag" /></svg>
          <input id="rail-q" type="text" spellcheck={false} autocomplete="off" value={props.rail.query} placeholder={props.rail.searchSaid} aria-label={props.rail.searchSaid} />
          <Show when={props.rail.query}>
            <button type="button" class="rail-clear" data-rail-clear aria-label={props.rail.clearSaid} title={props.rail.clearSaid}>×</button>
          </Show>
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
          <Show when={!one.busy}>
            <button type="button" class="ract" tabindex="-1" title={one.revive} aria-label={one.revive}><svg aria-hidden="true"><use href="#i-reply" /></svg></button>
          </Show>
        </div>
      )}</For>
      <Show when={props.parked.more}><div class="rail-more" data-arch-more role="button" tabindex="-1">{props.parked.more}</div></Show>
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

function RailSelection(props) {
  return (
    <div class="rail-sel" role="toolbar" aria-label={props.selection.say}>
      <span class="sel-n">{props.selection.say}</span>
      <For each={props.selection.actions}>{(one) => (
        <button type="button" classList={{ danger: !!one.danger }} data-pick-act={one.act} aria-haspopup={one.more ? "menu" : undefined}>{one.say}</button>
      )}</For>
      <button type="button" class="sel-x" data-pick-act="clear" aria-label={props.selection.clearSay} title={props.selection.clearSay}>×</button>
    </div>
  );
}

function RaycastRail(props) {
  return (
    <>
      <RaycastHead rail={props.rail} />
      <Show when={props.rail.selection}>{(selection) => <RailSelection selection={selection()} />}</Show>
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

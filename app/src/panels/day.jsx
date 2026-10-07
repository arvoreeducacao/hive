import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Icon } from "./window.jsx";

function Links(props) {
  return (
    <For each={props.links}>{(link, i) => (
      <>
        <Show when={i()}>{" · "}</Show>
        <a href={link.href} target="_blank" rel="noreferrer">{link.say}</a>
      </>
    )}</For>
  );
}

function Acts(props) {
  return (
    <Show when={props.acts.kind !== "none"}>
      <div class="drow">
        <Show when={props.acts.kind === "back"}>
          <Show when={props.acts.links.length} fallback={<span style="color:var(--txt-3)">{props.acts.nothing}</span>}>
            <Links links={props.acts.links} />
          </Show>
          <span style="flex:1"></span>
          <button class="btn" data-seen={props.acts.errand} onClick={(ev) => props.actions.seen(ev.currentTarget)}>{props.acts.seenSay}</button>
        </Show>
        <Show when={props.acts.kind === "goto"}>
          <button class="btn" data-goto={props.acts.goto} onClick={() => props.actions.goto(props.acts.goto)}>{props.acts.gotoSay}</button>
        </Show>
        <Show when={props.acts.kind === "links"}><Links links={props.acts.links} /></Show>
      </div>
    </Show>
  );
}

function Line(props) {
  return (
    <div class="dp">
      <p class="dl">
        <span class={`cap ${props.line.kind}`}>{props.line.cap}</span>
        <b class="dname" data-rename={props.line.errand} title={props.line.renameHint}
          onClick={(ev) => props.actions.rename(ev.currentTarget)}>{props.line.name}</b>
        <Show when={props.line.fronts}>{" "}<span style="color:var(--txt-3)">{props.line.fronts}</span></Show>
        <Show when={props.line.said}>{` — ${props.line.said}`}</Show>
      </p>
      <Show when={props.line.asked}><p class="dq">{props.line.asked}</p></Show>
      <For each={props.line.slots}>{(slot) => (
        <div class="dask" data-ask={slot.ask} data-seat={slot.seat} innerHTML={slot.head} />
      )}</For>
      <Acts acts={props.line.acts} actions={props.actions} />
    </div>
  );
}

function Seat(props) {
  return (
    <div class="eseat" classList={{ race: !!props.seat.keep }} data-goto={props.seat.name} title={props.seat.hint}
      onClick={() => props.actions.goto(props.seat.name)}>
      <svg class="g" style={{ color: props.seat.colour }} aria-hidden="true"><use href={`#${props.seat.glyph}`} /></svg>
      <span class="ename">{props.seat.title}</span>
      <span class="enow">{props.seat.now}</span>
      <span class="estate" classList={{ live: props.seat.live }}>{props.seat.state}</span>
      <Show when={props.seat.keep}>
        <span class="eprs" onClick={(ev) => ev.stopPropagation()}>
          <Show when={props.seat.prs?.length} fallback={<span class="enopr">{"—"}</span>}><Links links={props.seat.prs} /></Show>
        </span>
        <button class="nbtn ekeep" data-keep={props.seat.name} title={props.seat.keep.hint}
          onClick={(ev) => { ev.stopPropagation(); props.actions.keep(props.seat.keep); }}>{props.seat.keep.say}</button>
      </Show>
    </div>
  );
}

function Errand(props) {
  return (
    <div class={`errand ${props.errand.kind}`} classList={{ racing: props.errand.race }}>
      <div class="eh"><div><div class="et">{props.errand.name}</div>
        <Show when={props.errand.asked}><div class="eq">{props.errand.asked}</div></Show></div>
        <span class="ew">{props.errand.fronts}</span></div>
      <div class="eb"><For each={props.errand.seats}>{(seat) => <Seat seat={seat} actions={props.actions} />}</For></div>
      <Show when={props.errand.foot}>
        <div class="ef">
          <Show when={props.errand.foot.links.length} fallback={<span>{props.errand.foot.nothing}</span>}>
            <span><Links links={props.errand.foot.links} /></span>
          </Show>
          <Show when={props.errand.foot.seen}>
            <span class="grow"></span>
            <button class="btn" data-seen={props.errand.foot.seen} onClick={(ev) => props.actions.seen(ev.currentTarget)}>{props.errand.foot.seenSay}</button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function Zone(props) {
  return (
    <div class="day-zone" classList={{ hand: props.zone.hand }}>
      <h3>{props.zone.title}<b>{props.zone.count}</b></h3>
      <For each={props.zone.errands}>{(errand) => <Errand errand={errand} actions={props.actions} />}</For>
    </div>
  );
}

function Day(props) {
  return (
    <Show when={props.model.brief || props.model.fold} fallback={
      <div class="day-empty"><b>{props.model.emptyHead}</b>{props.model.emptySay}</div>
    }>
      <Show when={props.model.brief}>
        <div class="day-brief">
          <p class="day-hi">{props.model.brief.hi.lead}<Show when={props.model.brief.hi.bold}>{" "}<b>{props.model.brief.hi.bold}</b></Show></p>
          <For each={props.model.brief.lines}>{(line) => <Line line={line} actions={props.actions} />}</For>
        </div>
      </Show>
      <Show when={props.model.fold}>
        <div class="dfold" data-board="1" onClick={() => props.actions.board()}>
          <For each={props.model.fold.bits}>{(part, i) => (
            <>
              <Show when={i()}>{" · "}</Show>
              <Show when={part.bold} fallback={part.say}><b>{part.say}</b></Show>
            </>
          )}</For>
          <span class="caret">{props.model.fold.say}<svg class={props.model.fold.up ? "up" : ""} aria-hidden="true"><use href="#i-chev" /></svg></span>
        </div>
      </Show>
      <div class="dboard" hidden={!props.model.boardOpen}>
        <For each={props.model.zones}>{(zone) => <Zone zone={zone} actions={props.actions} />}</For>
      </div>
    </Show>
  );
}

function DayWindow(props) {
  const m = () => props.model;
  const p = () => props.model.picked;
  return (
    <>
      <div class="pw-list day-list" role="listbox" aria-label={m().listSay}>
        <For each={m().sections}>{(section) => (
          <>
            <div class="pw-sec">{section.say}<span class="n">{section.rows.length}</span></div>
            <For each={section.rows}>{(row) => (
              <button type="button" class="pw-row day-row" classList={{ hand: row.kind === "hand" }} role="option" aria-selected={row.here ? "true" : "false"}
                data-pick={row.key} title={row.name} onClick={() => props.actions.pick(row.key)}>
                <span class={`rc-dot ${row.dot}`} aria-hidden="true" />
                <span class="pw-txt"><span class="pw-t">{row.name}</span><span class="pw-m">{row.sub}</span></span>
                <span class="pw-st">{row.say}</span>
              </button>
            )}</For>
          </>
        )}</For>
      </div>
      <div class="pw-detail day-detail">
        <Show when={p()} fallback={
          <div class="pw-empty"><span class="pw-ico"><Icon id="i-cal" /></span><h3>{m().emptyHead}</h3><p>{m().emptySay}</p></div>
        }>
          <Show when={m().brief}><p class="day-hi">{m().brief.hi.lead}<Show when={m().brief.hi.bold}>{" "}<b>{m().brief.hi.bold}</b></Show></p></Show>
          <Show when={p().line} fallback={<h2 class="pw-h1">{p().errand.name}</h2>}><Line line={p().line} actions={props.actions} /></Show>
          <Show when={p().errand}><Errand errand={p().errand} actions={props.actions} /></Show>
        </Show>
      </div>
    </>
  );
}

function DayPanel(props) {
  return <Show when={props.model.raycast} fallback={<Day model={props.model} actions={props.actions} />}><DayWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountDay(host, extras) {
  return mountView(host, DayPanel, { brief: null, emptyHead: "", emptySay: "" }, extras, { lazy: true });
}

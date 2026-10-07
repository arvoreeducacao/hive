import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, Icon, Loading } from "./window.jsx";

function Seat(props) {
  return (
    <Show when={props.seat.go} fallback={
      <span class={props.seat.cls || undefined}>{props.seat.say}</span>
    }>
      <button class="go" data-go={props.seat.go} title={props.seat.hint}
        onClick={(ev) => { ev.stopPropagation(); props.actions.review(props.seat.go, props.row.key); }}>{props.seat.say}</button>
    </Show>
  );
}

function Item(props) {
  return (
    <div class="pr-item" classList={{ here: props.row.here }} data-key={props.row.key}
      onClick={() => props.actions.pick(props.row.key)}>
      <span class="title">{props.row.title}</span>
      <span class="meta">
        <span>{props.row.where}</span>
        <For each={props.row.chips}>{(chip) => (
          <span class="chip" data-ci={chip.ci} data-state={chip.state} data-rev={chip.rev} title={chip.hint}>{chip.say}</span>
        )}</For>
        <Seat seat={props.row.seat} row={props.row} actions={props.actions} />
      </span>
    </div>
  );
}

function PrList(props) {
  return (
    <Show when={props.model.rows.length} fallback={
      <div class="pr-item"><span class="title">{props.model.blank}</span></div>
    }>
      <For each={props.model.rows}>{(row) => <Item row={row} actions={props.actions} />}</For>
    </Show>
  );
}

function Head(props) {
  return (
    <div class="pr-head">
      <h2>{props.head.title}</h2>
      <div class="row">
        <Show when={props.head.link}>
          <a data-out="1" href={props.head.link.href} target="_blank" rel="noreferrer">{props.head.link.say}</a>
        </Show>
        <Show when={props.head.chip}><span class="chip" data-ci="failed">{props.head.chip}</span></Show>
        <For each={props.head.notes}>{(note) => (
          <Show when={note.html} fallback={<span>{note.say}</span>}><span innerHTML={note.html} /></Show>
        )}</For>
        <Show when={props.head.conflict}><span class="chip" data-ci="failed">{props.head.conflict}</span></Show>
      </div>
      <Show when={props.head.branches}>
        <div class="row"><span>{props.head.branches}</span><Show when={props.head.ciDetail}><span>{props.head.ciDetail}</span></Show></div>
      </Show>
    </div>
  );
}

function File(props) {
  return (
    <div class="file" classList={{ here: props.file.here, seen: props.file.seen, noisy: props.file.noise }}
      data-path={props.file.path} title={props.file.hint} onClick={() => props.actions.openFile(props.file.path)}>
      <span class="mk" innerHTML={props.file.mark} />
      <span class="name">{props.file.path}</span>
      <span class="weight" innerHTML={props.file.weight} />
    </div>
  );
}

function Gauge(props) {
  return (
    <div class="gauge">
      <div class="bar" classList={{ full: props.gauge.full }}><i style={{ width: `${props.gauge.slice}%` }}></i></div>
      <div class="count"><span><b>{props.gauge.lines}</b> {props.gauge.of}</span><span>·</span><span><b>{props.gauge.minutes}</b> {props.gauge.sitting}</span></div>
      <Show when={props.gauge.message}><p class="fatigue">{props.gauge.message}</p></Show>
    </div>
  );
}

function PrMid(props) {
  return (
    <Show when={props.model.head} fallback={
      <div class="pr-blank" innerHTML={props.model.blank} />
    }>
      <Head head={props.model.head} />
      <Show when={props.model.trouble} fallback={
        <>
          <details class="pr-body" attr:open={props.model.body.open ? "" : undefined}>
            <summary>{props.model.body.summary}</summary>
            <div class="text" innerHTML={props.model.body.html} />
          </details>
          <div class="pr-queue">
            <p class="caption">{props.model.queue.caption}</p>
            <div id="pr-files">
              <Show when={props.model.queue.files} fallback={
                <div class="file"><span class="mk">·</span><span class="name">{props.model.queue.reading}</span></div>
              }>
                <For each={props.model.queue.files}>{(file) => <File file={file} actions={props.actions} />}</For>
              </Show>
            </div>
          </div>
          <Gauge gauge={props.model.gauge} />
        </>
      }>
        <div class="pr-blank" style="padding:0 14px">{props.model.trouble}</div>
      </Show>
    </Show>
  );
}

function PrStatus(props) {
  const s = () => props.status;
  return (
    <Show when={s().badge} fallback={
      <span class="pw-st" classList={{ warn: s().tone === "warn" }}>
        <Show when={s().dot}><span class={`rc-dot ${s().dot}`} aria-hidden="true" /></Show>
        <Show when={s().icon}><Icon id={s().icon} /></Show>
        {s().say}
      </span>
    }>
      <span class="pw-lab">{s().say}</span>
    </Show>
  );
}

function PrRowItem(props) {
  return (
    <button type="button" class="pw-row pr-row" role="option" aria-selected={props.row.here ? "true" : "false"} data-key={props.row.key}
      title={props.row.hint} onClick={() => props.actions.pick(props.row.key)}>
      <Icon id="i-pr" />
      <span class="pw-txt"><span class="pw-t">{props.row.title}</span><span class="pw-m">{props.row.number}</span></span>
      <span class="pw-acc"><PrStatus status={props.row.status} /></span>
    </button>
  );
}

function PrListWindow(props) {
  return (
    <Show when={!props.model.loading} fallback={<Loading say={props.model.loading} />}>
      <Show when={props.model.rows.length} fallback={
        <Show when={props.model.none}><p class="pw-load">{props.model.none}</p></Show>
      }>
        <For each={props.model.sections}>{(section) => (
          <>
            <div class="pw-sec">{section.say}<span class="n">{section.count}</span></div>
            <For each={section.rows}>{(row) => <PrRowItem row={row} actions={props.actions} />}</For>
          </>
        )}</For>
      </Show>
    </Show>
  );
}

function PrHeadWindow(props) {
  const h = () => props.head;
  return (
    <div class="pr-head">
      <h2 class="pw-h1">{h().title}</h2>
      <div class="pw-strip">
        <Show when={h().link} fallback={<span>{h().where}</span>}>
          <span><a data-out="1" href={h().link.href} target="_blank" rel="noreferrer">{h().link.say}</a></span>
        </Show>
        <Show when={h().chip}><span class="warn"><Icon id="i-warn" />{h().chip}</span></Show>
        <Show when={h().branches}>
          <span class="pr-branch" title={h().branches}>
            <span class="pr-cut">{h().branchSay}</span>
            <button type="button" class="pw-copy" aria-label={h().copySay} title={h().copySay}
              onClick={(ev) => props.actions.copy(ev.currentTarget, h().branch)}><Icon id="i-copy" /></button>
          </span>
        </Show>
        <For each={h().notes}>{(note) => (
          <Show when={note.html} fallback={<span>{note.say}</span>}><span innerHTML={note.html} /></Show>
        )}</For>
        <Show when={h().conflict}><span class="warn"><Icon id="i-warn" />{h().conflict}</span></Show>
        <Show when={h().when}><span>{h().when}</span></Show>
      </div>
    </div>
  );
}

function PrGaugeWindow(props) {
  return (
    <div class="gauge">
      <div class="bar" classList={{ full: props.gauge.full }}><i style={{ width: `${props.gauge.slice}%` }}></i></div>
      <div class="count"><span><b>{props.gauge.lines}</b> {props.gauge.of}</span><span>·</span><span><b>{props.gauge.minutes}</b> {props.gauge.sitting}</span></div>
      <Show when={props.gauge.message}><p class="fatigue">{props.gauge.message}</p></Show>
    </div>
  );
}

function PrMidWindow(props) {
  return (
    <Show when={props.model.head} fallback={
      <Show when={props.model.empty}><Empty empty={props.model.empty} actions={props.actions} /></Show>
    }>
      <PrHeadWindow head={props.model.head} actions={props.actions} />
      <Show when={props.model.trouble}><p class="pr-trouble-say">{props.model.trouble}</p></Show>
      <Show when={props.model.inChat && !props.model.trouble}><PrGaugeWindow gauge={props.model.gauge} /></Show>
    </Show>
  );
}

function PrListPanel(props) {
  return <Show when={props.model.raycast} fallback={<PrList model={props.model} actions={props.actions} />}><PrListWindow model={props.model} actions={props.actions} /></Show>;
}

function PrMidPanel(props) {
  return <Show when={props.model.raycast} fallback={<PrMid model={props.model} actions={props.actions} />}><PrMidWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountPrList(host, extras) {
  return mountView(host, PrListPanel, { rows: [], blank: "" }, extras, { lazy: true });
}

export function mountPrMid(host, extras) {
  return mountView(host, PrMidPanel, { head: null, blank: "" }, extras, { lazy: true });
}
